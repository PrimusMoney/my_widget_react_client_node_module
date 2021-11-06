import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { WebView } from 'react-native-webview';


//import My_Widget_Module from '../nodemodules/@primusmoney/my_widget_react_client/my_widget_client.js';
//import {ReactWidgetClient} from '../nodemodules/@primusmoney/my_widget_react_client/includes/react-widget-client';

import My_Widget_Module from '../my_widget_client.js';
import {ReactWidgetClient} from '../includes/react-widget-client';



class MyWidget extends React.Component {
	
	constructor(props) {
		super(props);

		this.params = props.params;

		this.ismutable = (this.params && this.params.mutable && (this.params.mutable === true) ? true : false);

		this.uuid = ReactWidgetClient.guid();

		this.my_widget_module = My_Widget_Module.getObject();

		this.widget_client_name = (props.widget_client_id ? props.widget_client_id : 'PrimusMoneyWidget-' + this.uuid);

		this.widget_params = null;

		this.widget_client_uuid = null;
		this.widget_app_uuid = null;

		this.webview = null;
		this.webviewclient = null; // an overloaded WidgetClient object
		this.webview_client_ready = false;


		this.widget_url = null;

		this.state = {
			loading: true,
			iframetag: '<div>Hello</div>'
		};
	}

	_getWidgetParams() {
		let my_widget_module = this.my_widget_module;

		let _passed_params = Object.assign({}, (this.props.params ? this.props.params : {})); // make a copy

		if (this.props.type) {
			// a type is specified in the props, we overload with it the widget params
			let widget = 'pay'; // default

			switch(this.props.type) {
				case 'pay':
					widget = 'pay';
					break;

				case 'payment-link':
					widget = 'payment-link';
					break;

				case 'payment-qrcode':
					widget = 'payment-qrcode';
					break;

				default:
					break;
			}

			_passed_params.widget = widget;
		}

		if (this.props.currency) {
			// a currency is specified in the props, we overload it this the currency params
			_passed_params.ccy = this.props.currency;
		}

		// get standard params
		let widget_params = my_widget_module.getWidgetParams(_passed_params);

		// TEST DEV
		//widget_params.widget_url = 'https://dev5.primusmoney.com/my-widget';
		// TEST DEV
		this.widget_url = widget_params.widget_url;


		// specify widget uuid since we load

		// ask to receive actions (pay, open wallet,..)
		widget_params.ask_before_pay = true;

		
		// specify post load params now
		if (this.props.amount) {
			let amount = this.props.amount;

			widget_params.amount = amount;
		}
		
		if (this.props.recipient) {
			let to_address = this.props.recipient;

			widget_params.to_address = to_address;
		}
		

		return widget_params;
	}

	componentDidMount() {
		// add listeners
		this.my_widget_module.addWindowEventListener('widget_on_iframe_load', this.onIFrameLoad.bind(this), this.uuid);
		this.my_widget_module.addWindowEventListener('mywidgetclient_on_widget_loaded', this.onWidgetLoaded.bind(this), this.uuid);


		this.widget_params = this._getWidgetParams();

		this.widget_params.mutable = true; // make it mutable, at least until end of onIFrameLoad

		this.createWidgetTag(this.widget_params)
		.then(iframetag => {
			this.setState({loading: false, iframetag});
		})
		.catch(err => {
			console.log('error in MyWidget.componentDidMount: ' + err);
		});

	}

	componentWillUnmount() {
		// remove listeners
		this.my_widget_module.removeWindowEventListener('mywidgetclient_on_widget_loaded', this.uuid);
		this.my_widget_module.removeWindowEventListener('widget_on_iframe_load', this.uuid);
	}

	async getWidgetUrl(params) {
		return ReactWidgetClient.getWidgetUrl(params);
	}


	// react native
	async createWidgetTag(params) {
		try {
			let widget_url = await this.getWidgetUrl(params);
		
			// build iframe tag
			let widget_tag = '<iframe id="' + this.widget_client_name + '" src="' + widget_url + '" onload="onIFrameLoad(this)" scrolling="no" width="300" height="200"></iframe>';

			return widget_tag;
		}
		catch(e) {
			console.log('exception in MyWidget.createWidgetTag: ' + e);
		}
	
	}

	_getWebViewClient() {
		if (!this.webviewclient) {
			// create widget now
			let widget = ReactWidgetClient.createWidget(this.widget_client_name, this.widget_params);
			widget.widget_client_name = this.widget_client_name; // necessary for postData below

			
			// overload postData
			let self = widget;

			widget.postData = (data) => {
				try {
					data.widget_client_name = self.widget_client_name;

					// enrich message
					data.caller = window.location.href;
					data.widget_name = self.name;
					data.widget_uuid = self.uuid;

					if (data.action && (data.action == 'setStartConditions' || data.action == 'set_start_conditions')) {
						data.widget_client_uuid = self.uuid;
					}
		
					// stringify and post
					var datastring = (data ? JSON.stringify(data) : '{}');
			
					this.webview.postMessage(datastring);
				}
				catch(e) {
					console.log('exception in overloaded postData: ' + e);
				}
			};

			this.webviewclient = widget;
			//this.webviewclient = new WebViewClient(this.webview, this.widget_client_name);
		}

		return this.webviewclient;
	}

	_postData(data) {
		console.log('MyWidget._postData called: ' + JSON.stringify(data));
		let webviewclient = this._getWebViewClient();

		webviewclient.postData(data);
	}

	_handleMessage(ev) {
		console.log('MyWidget._handleMessage called: ' + ev.data);
		let webviewclient = this._getWebViewClient();

		webviewclient.handleMessage(ev);
	}

	async onIFrameLoad(ev) {
		try {
			console.log('MyWidget.onIFrameLoad called');

			let webviewclient = this._getWebViewClient();

			// 2 step creation and registration because we seem to miss first answer in WidgetClient_register
			await ReactWidgetClient.initWidget(webviewclient);

			// we note the uuid of the widget_client
			this.widget_client_uuid = webviewclient.uuid;
			console.log('MyWidget.onIFrameLoad widget_client_uuid is: ' + this.widget_client_uuid);

			// to be set in post load
			if (this.props.invoice_id || (this.params && this.params.invoice_id)) {
				let invoice_id = (this.props.invoice_id ? this.props.invoice_id : this.params.invoice_id);

				await webviewclient.setInvoiceId(invoice_id);
			}

			if (this.ismutable !== true) {
				await webviewclient.setStartConditionsParameter({ key: 'mutable', value: false});
			} 

			// dispatch window event we have finished initialization
			this.webview_client_ready = true;

			console.log('MyWidget.onIFrameLoad ended for widget: ' + this.widget_client_name);

			this.my_widget_module.dispatchEvent('mywidgetclient_on_widget_loaded', {uuid: this.uuid, widget_client_name: this.widget_client_name, widget_client_uuid: this.widget_client_uuid, app_uuid: this.widget_app_uuid});
		}
		catch(e) {
			console.log('exception in MyWidget.onIFrameLoad: ' + e);
		}
	}

	async onWidgetLoaded(ev) {
		let webviewclient = this._getWebViewClient();

		console.log('MyWidget.onWidgetLoaded called for: ' + (webviewclient ? webviewclient.uuid : ''));

		try {
			let data = ev.detail;
			let widget_uuid = (data ? data.uuid : null);
			let widget_client_name = (data ? data.widget_client_name : null);
			let widget = this.my_widget_module.getWidgetObject(widget_client_name);

			if (!widget)
				throw Error('could not find widget with name: ' + widget_client_name);

			if (!webviewclient)
				return; // obviously not for us

			if (webviewclient.widget_client_name == widget_client_name) {

				// we register widget client hooks
				widget.registerHook('widget_client_can_pay_async_hook', this.widget_client_can_pay_async_hook.bind(this), this.uuid);
			}
		}
		catch(e) {
			console.log('exception in MyWidget.onWidgetLoaded: ' + e);
		}
	}

	// hooks
	async widget_client_can_pay_async_hook(result, params) {
		try {
			if (!params || !params.app_uuid)
				return;

			let webviewclient = this._getWebViewClient();

			if (webviewclient.app_uuid == params.app_uuid) {

				switch(this.props.type) {
					case 'pay':
						break;
	
					case 'payment-link': {
							// intercept
							result.canPay = false;
							// open remote wallet in default browser
							let payment_link = await ReactWidgetClient.getWebPaymentLink(webviewclient);
							Linking.openURL(payment_link);
						}
						break;
	
					case 'payment-qrcode': {
							// intercept
							result.canPay = false;
							// open remote wallet in default browser
							let payment_link = await ReactWidgetClient.getWebPaymentLink(webviewclient);
							Linking.openURL(payment_link);
						}
						break;
	
					default:
						break;
				}
	
	


				return true;
			}

		}
		catch(e) {
			console.log('exception in MyWidget.widget_client_can_pay_async_hook: ' + e);
		}

	}



	// rendering
	render() {
		if (this.state.loading) {
			return (
				<View style={styles.box}>
					  <Text>Loading</Text>
				</View>
			);	
		}

		const stub_view_params = {widget_client_name: this.widget_client_name, widget_params: this.widget_params};
		const stub_view_params_json_string = JSON.stringify(stub_view_params);

		const web_view_stub_url = this.widget_url + '/scripts/web-view-stub.js';

		const web_view_stub_script = 'commented';/* `
		var onIFrameLoad  = async () => {
			window.APRIMUS = '0.20.1';

			let uuid = (window.PrimusMoneyWidgetClient ? window.PrimusMoneyWidgetClient.guid() : 'none');
			alert('onIFrameLoad called in WebPage: ' + uuid);

			var handleMessage = async (msg) => {
				uuid = (window.PrimusMoneyWidgetClient ? window.PrimusMoneyWidgetClient.guid() : 'none');
				alert('handleMessage called in WebPage: ' + JSON.stringify(msg) + ' - ' + uuid);
			};

			document.addEventListener("message", handleMessage, false);

			window.ReactNativeWebView.postMessage("onIFrameLoad called");

		};
		`;*/

		return (
			<View style={(this.props.style ? this.props.style : styles.widget)}>
      			<Text style={(this.props.title_style ? this.props.title_style : styles.title)}>{(this.props.title ? this.props.title : 'Payment Widget')}</Text>
				
				<WebView
					scalesPageToFit={true}
					bounces={false}
					javaScriptEnabled
					style={(this.props.webview_style ? this.props.webview_style : styles.webview)}
					ref={(ref) => { this.webview = ref; }}
					/*source={{uri: react_native_page_url}}*/
					source={{
						html: `
						<!DOCTYPE html>
						<html>
							<head>
							<title>WebView window</title>
							<script>
							const STUB_VIEW_PARAMS = ${stub_view_params_json_string};
							</script>
							<script type="text/javascript" src="${web_view_stub_url}"></script>
							<!-- <script>${web_view_stub_script}</script> -->
							</head>
							<body>
							<div title="payment widget" id="PrimusMoneyIFrameContainer">
							${this.state.iframetag}
							</div>
							</body>
						</html>
						`,
					}}
					onLoad={(syntheticEvent) => {
						console.log('onLoad called');
					}}
					onNavigationStateChange={(event) => {
						console.log('onNavigationStateChange called for ' + event.url);
					}}
					onShouldStartLoadWithRequest={(request) => {
						console.log('onShouldStartLoadWithRequest called ');
						return true;
					}}
					onMessage={(ev) => {
						let theev = ev.nativeEvent;
						//console.log('onMessage called: ' + theev.data);

						this._handleMessage(theev);
					}}
					automaticallyAdjustContentInsets={false}
				/>
			</View>
		);
	}


}

const styles = StyleSheet.create({
  widget: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
	fontWeight: 'bold'
  },
  webview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginRight: 20,
    height: 200,
    width: 300
  },
});

export default MyWidget;
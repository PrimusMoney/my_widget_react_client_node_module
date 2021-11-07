import React from 'react';

import My_Widget_Module from '../my_widget_client.js';
import {ReactWidgetClient} from '../includes/react-widget-client.js';

class MyWidget extends React.Component {
	
	constructor(props) {
		super(props);

		this.params = props.params;

		this.ismutable = (this.params && this.params.mutable && (this.params.mutable === true) ? true : false);

		this.uuid = ReactWidgetClient.guid();

		this.my_widget_module = My_Widget_Module.getObject();

		this.widget_client_name = (props.widget_client_id ? props.widget_client_id : 'PrimusMoneyWidget-' + this.uuid);

		this.widget_client_uuid = null;
		this.widget_app_uuid = null;


		let My_Widget_Client = require('../my_widget_client.js');
		this.my_widget_client = My_Widget_Client.getObject();

		this.state = {
		};
	}

	dispatchEvent(eventname, data) {
		const event = new CustomEvent(eventname, {detail: data});
	
		window.dispatchEvent(event);
	}

	_getWidgetParams() {
		let my_widget_client = this.my_widget_client;

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

		let widget_params = my_widget_client.getWidgetParams(_passed_params);

		return widget_params;
	}

	componentDidMount() {
		var widget_div = document.getElementById(this.uuid);

		if (widget_div) {
			var parent = widget_div.parentElement;

			this.createWidgetiFrame()
			.then(iframe => {
				// replace
				if (iframe) parent.replaceChild(iframe, widget_div);
			})
			.catch(err => {
				console.log('error in MyWidget.componentDidMount: ' + err);
			});
		}
	}

	async createWidgetiFrame() {
		var iframe = document.createElement('iframe');

		let _widget_params = this._getWidgetParams();

		_widget_params.mutable = true; // make it mutable, at least until end of onIFrameLoad

		var iframe = await ReactWidgetClient.createWidgetiFrame(this.widget_client_name, _widget_params, this.onIFrameLoad.bind(this));

		return iframe;
	}

	async onIFrameLoad() {
		try {
			// register widget
			let _widget_params = this._getWidgetParams();

			this.widgetclient = ReactWidgetClient.registerWidget(this.widget_client_name, _widget_params);

			if (!this.widgetclient)
			return Promise.reject('could not instantiate Widget Client');

			// app uuid
			this.widget_client_uuid = this.widgetclient.uuid;
			this.widget_app_uuid =  await this.widgetclient.getAppUUID();


			if (this.props.amount) {
				let amount = this.props.amount;

				if (typeof amount === 'string' || amount instanceof String) {
					amount = await this.widgetclient.computeTokenAmount(amount);
				}

				await this.widgetclient.setTokenAmount(amount);
			}
			
			if (this.props.recipient) {
				let to_address = this.props.recipient;

				await this.widgetclient.setToAddress(to_address);
			}
			
			if (this.props.invoice_id || (this.params && this.params.invoice_id)) {
				let invoice_id = (this.props.invoice_id ? this.props.invoice_id : this.params.invoice_id);

				await this.widgetclient.setInvoiceId(invoice_id);
			}

			if (this.ismutable !== true) {
				await this.widgetclient.setStartConditionsParameter({ key: 'mutable', value: false});
			}

			this.dispatchEvent('mywidgetclient_on_widget_loaded', {uuid: this.uuid, widget_client_name: this.widget_client_name, widget_client_uuid: this.widget_client_uuid, app_uuid: this.widget_app_uuid});
		}
		catch(e) {
			console.log('exception in MyWidget.onIFrameLoad: ' + e);
		}
	}	


	async onPay() {
		alert('onPay pressed!')
	}

	render() {
		// use React.createElement to avoid "Support for the experimental syntax 'jsx' isn't currently enabled"
		// when using this component
		return React.createElement('div', {className: (this.props.className ? this.props.className : null), title: "widget"}, 
		[React.createElement('div', {title: "place-holder", id: this.uuid})]);

/* 		return (
			<div className={`${(this.props.cname ? this.props.cname : '')}`}>
				
				<div title="place-holder" id={this.uuid}></div>

			</div>
		); */
	}


}

export default MyWidget;
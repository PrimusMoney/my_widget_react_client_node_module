'use strict';

var my_widget_client;


class My_Widget_Client {
	constructor() {
		this.ReactWidgetClient = require('./includes/react-widget-client.js').ReactWidgetClient;

		if (typeof window !== 'undefined') {
			if (typeof document !== 'undefined' && document ) {
				// we are in a browser
				this.react = 'react-js';
				this.react_event_overload = false;
			}
			else {
				// we are in react-native
				this.react = 'react-native';

				this.react_event_overload = false;

				if (!window.addEventListener || !window.removeEventListener || !window.dispatchEvent) {
					// seems these functions exist in debug mode, but not in release
					this.react_event_overload = true;
				}

				if (this.react_event_overload === true) {
					// we make sure window has methods used by PrimusMoneyWidgetClient (2021.09.28)
					window.addEventListener = (event_name, func, choice) => {
						this.addWindowEventListener(event_name, func);
					};

					window.removeEventListener = (event_name, func) => {
						this.removeEventListener(event_name, func);
					};

					window.dispatchEvent = (event) => {
						this.dispatchEvent(event);
					};				
				}

				// TODO: define window.CustomEvent if not defined

			}	
		}

		this.eventlisteners = Object.create(null);

		
		this.window_listeners = {};
	}

	//
	// Events
	//

	// our mechanism
	registerEventListener(eventname, listeneruuid, listener) {
		if (!eventname)
			return;
		
		if ((eventname in this.eventlisteners) === false) {
			this.eventlisteners[eventname] = [];
		}
		
		var entry = {uuid: listeneruuid, listener: listener};

		this.eventlisteners[eventname].push(entry);
	}

	unregisterEventListener(eventname, listeneruuid) {
		if (!eventname)
			return;
		
		if ((eventname in this.eventlisteners) === false) {
			this.eventlisteners[eventname] = [];
		}
		
		var array = []
		
		for (var i = 0; i < this.eventlisteners[eventname].length; i++) {
			var entry = this.eventlisteners[eventname][i];
			
			if (!entry)
				continue;
			
			var uuid = entry.uuid;

			if (listeneruuid == uuid)
				continue;
			
			array.push(entry);
		}
		
		this.eventlisteners[eventname] = array;
	}

	signalEvent(eventname, params) {
		console.log('signalEvent called for event ' + eventname);
		
		if ((eventname in this.eventlisteners) === false)
			return;
		
		for (var i = 0; i < this.eventlisteners[eventname].length; i++) {
			var entry = this.eventlisteners[eventname][i];
			
			if (!entry)
				continue;
			
			var listener = entry.listener;
			
			listener(eventname, params);
		}
	}


	// window listeners (when they exist)
	addWindowEventListener(event_name, func, uuid) {
		this.window_listeners[event_name + (uuid ? '-' + uuid : '')] = func;

		if ((this.react === 'react-js') || (this.react_event_overload !== true))
		window.addEventListener(event_name, func, false);
		else
		this.registerEventListener(event_name, uuid, func);
	}

	removeWindowEventListener(event_name, uuid) {
		let func = this.window_listeners[event_name +  (uuid ? '-' + uuid : '')];

		if (func) {
			if ((this.react === 'react-js') || (this.react_event_overload !== true))
			window.removeEventListener(event_name, func);
			else
			this.unregisterEventListener(event_name, uuid);

			delete this.window_listeners[event_name +  (uuid ? '-' + uuid : '')];
		}
	}

	dispatchEvent(eventname, data) {
		const event = (data instanceof CustomEvent ? data : new CustomEvent(eventname, {detail: data}));

		if ((this.react === 'react-js') || (this.react_event_overload !== true))
		window.dispatchEvent(event);
		else
		this.signalEvent(eventname, event);
	}
	

	getClient(name) {
	 	let widget_client = this.ReactWidgetClient.getWidget(name);
		return widget_client;
	}

	_getDefaultWidgetParams(ccycode) {
		const widget_json = require('./assets/config/react-widget.json');
		const currencies_json = require('./assets/config/currencies.json');

		let widget_params = Object.assign({}, widget_json); // make a copy
		let _currency_config;

		if (currencies_json[ccycode])
		_currency_config = currencies_json[ccycode];
		else
		_currency_config = currencies_json['default'];

		if (_currency_config) {
			// scheme
			widget_params.web3_provider_url = _currency_config.scheme.ethnodeserver.web3_provider_url;
			widget_params.explorer_url = _currency_config.scheme.ethnodeserver.explorer_url;
			widget_params.chainid = _currency_config.scheme.ethnodeserver.chainid;
			widget_params.networkid = _currency_config.scheme.ethnodeserver.networkid;
			widget_params.default_gas_price = _currency_config.scheme.ethnodeserver.default_gas_price;
			widget_params.avg_transaction_fee = _currency_config.scheme.ethnodeserver.avg_transaction_fee;
		
			// currency
			widget_params.tokenaddress = _currency_config.currency.address;
		}

		return widget_params;
	}

	getWidgetParams(params) {
		let _ccycode = (params && params.ccy ? params.ccy : null); 
		let _default_params = this._getDefaultWidgetParams(_ccycode); // default for a currency, if one given

		let _params = Object.assign(_default_params, (params ? params : {}));

		if (!_params.widget_uuid) {
			// give it a uuid to be able to reconnect to it
			// after the actual load of the iframe url
			_params.widget_uuid = this.guid();
		}


		return _params;
	}

	guid() {
		return this.ReactWidgetClient.guid();
	}

	getWidgetObject(widget_client_id) {
		return this.ReactWidgetClient.getWidget(widget_client_id);
	}

	// static methods
	static getObject() {
		if (my_widget_client)
			return my_widget_client;

		my_widget_client = new My_Widget_Client();
		
		return my_widget_client;
	}
}

module.exports = My_Widget_Client;
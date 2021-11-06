if (typeof window.PrimusMoneyWidgetClient === "undefined") {
	// if script has not already been imported in page
	class PrimusMoneyWidgetClient {
		constructor(name) {
			this.name = name;
			this.uuid = PrimusMoneyWidgetClient.guid();

			this.app_info = null;
			this.app_uuid = null;
	
			this.current_version = '0.20.51.2021.11.06';
	
			// events (use window event system)
			window.addEventListener('message', this.handleMessage.bind(this), false);
			
			// hooks
			this.hook_arrays = [];
		}

		// registration
		async _register(params) {
			var answer_struct;

			// get app info
 			answer_struct = await this.sendRequest({action: 'getAppInfo'}).catch(err => {});

			this.app_info = (answer_struct ? answer_struct : null);
			this.app_uuid = (this.app_info ? this.app_info.app_uuid : null);

			if (this.app_info && this.app_info.start_widget_uuid && (this.app_info.start_widget_uuid !== this.uuid)) {
				// the widget was loaded somewhere else (probably through a full url, with start_conditions as parameters)
				// and we are reconnecting post load.

				// use this widget_uuid
				this.uuid = this.app_info.start_widget_uuid;
			}
			
			// register as client
			answer_struct = await this.sendRequest({action: 'register_client', widget_client_uuid: this.uuid}).catch(err => {});

			if (!answer_struct || (answer_struct.widget_client_uuid != this.uuid))
				return Promise.reject('could not register widget client');

			// using synchroneous postMessage to set start condtions
			// (note: if (this.app_info.mutable !== true), this won't have any effect
			params.action = 'set_start_conditions';
	
			if (params.mutable === undefined) params.mutable = true; // make the widget programmable
			
			this.postData(params);

		}

		// client hooks
		getHookArray(hookentry) {
			var _entry = hookentry.toString();
			
			if (!this.hook_arrays[_entry])
				this.hook_arrays[_entry] = [];
				
			return this.hook_arrays[_entry];
		}

		_removeHookEntry(hookentry, hookuuid) {
			var hookarray = this.getHookArray(hookentry);

			var arr = []

			for (var i = 0; i < hookarray.length; i++) {
				if (hookarray[i].uuid && (hookarray[i].uuid == hookuuid))
				continue;

				arr.push(hookarray[i]);
			}

			this.hook_arrays[hookentry] = arr;			
		}
		
		_findHookEntry(hookentry, hookuuid) {
			var hookarray = this.getHookArray(hookentry);

			for (var i = 0; i < hookarray.length; i++) {
				if (hookarray[i].uuid && (hookarray[i].uuid == hookuuid))
				return hookarray[i];
			}
		}
		
		registerHook(hookentry, hookfunction, hookuuid) {
			var hookarray = this.getHookArray(hookentry);
			var entry;
			var bAddEntry = true;

			if (hookuuid) {
				// find entry
				entry = this._findHookEntry(hookentry, hookuuid);
			}

			if (!entry)
				entry = {};
			else
				bAddEntry = false;
			
			entry['uuid'] = hookuuid;
			entry['function'] = hookfunction;

			if (bAddEntry)
				hookarray.push(entry);
		}

		unregisterHook(hookentry, hookuuid) {
			var entry = this._findHookEntry(hookentry, hookuuid);

			if (entry)
				this._removeHookEntry(hookentry, hookuuid);
		}

		invokeHooks(hookentry, result, params) {
			// does not wait for each hook's process
			var hookarray = this.getHookArray(hookentry);
			result.ret_array = [];
	
			for (var i = 0; i < hookarray.length; i++) {
				var entry = hookarray[i];
				var func = entry['function'];
				var hookuuid = entry['uuid'];

				var ret = func.call(null, result, params);
					
				result.ret_array[hookuuid] = ret;
				result.ret_array.push(ret);
			}
			
			return true;
		}
			
		async invokeAsyncHooks(hookentry, result, params) {
			var hookarray = this.getHookArray(hookentry);
			result.ret_array = [];
			
			
			for (var i = 0; i < hookarray.length; i++) {
				var entry = hookarray[i];
				var func = entry['function'];
				var hookuuid = entry['uuid'];

				var ret = await func.call(null, result, params)
				.catch(err =>{
				});
				
				result.ret_array[hookuuid] = ret;
				result.ret_array.push(ret);
			}
					
			return true;		
		}

		// messages: communication between client and widget

		// to widget
		postData(data) {
			let iframe = document.getElementById(this.name);

			if (!iframe) {
				console.log('could not find widget: ' + this.name);
				return;
			}

			if (!data) {
				console.log('no data to post for widget: ' + this.name);
				return;
			}

			
			var iframewindow = iframe.contentWindow;
	
			// enrich message
			data.caller = window.location.href;
			data.widget_name = this.name;
			data.widget_uuid = this.uuid;

			if (data.action && (data.action == 'setStartConditions' || data.action == 'set_start_conditions')) {
				data.widget_client_uuid = this.uuid;
			}
	
			// stringify and post
			var datastring = (data ? JSON.stringify(data) : '{}');
	
			iframewindow.postMessage(datastring, '*');
		}

		// from widget
		handleMessage(ev) {
			try {
				let datastring = ev.data;
	
				if (!datastring || (typeof datastring !== 'string' && (datastring instanceof String !== true)) )
				return;
	
				if ((datastring.length < 2) || (datastring.startsWith('{') !== true))
				return;
	
				let json = JSON.parse(datastring);
	
				switch(json.action) {
					case 'goto_url':
						window.location = json.url
						break;
	
					//
					// communication from this client to primus widget
					//
					case 'receive_answer': {
							let request_uuid = json.request_uuid;
							let answer = json.answer;
		
							this.receiveAnswer(request_uuid, answer);
						}
						break;

					//
					// communication from primus widget to this client
					//
					case 'receive_event': {
							let event = json;
		
							this.receiveEvent(event);
						}
						break;
		
					// asnwering primus widget's requests
					case 'get_version_info':
						if (this.uuid == json.registered_widget_client_uuid) {
							// this request is addressed to us
							this.answerRequest(json, {version: this.current_version});
						}
						break;
					case 'get_current_url':
						if (this.uuid == json.registered_widget_client_uuid) {
							this.answerRequest(json, {url: window.location.href});
						}
						break;
					case 'can_pay':
						if ((this.uuid == json.registered_widget_client_uuid)
						&& (this.app_uuid !== undefined) && (this.app_uuid == json.app_uuid)) {
							// this request is addressed to us, and comes from a bona fide caller
							let canPay = true;

							// invoke hooks
							var result = []; 
							var params = json;
							
							result.canPay = canPay;
							
							this.invokeAsyncHooks('widget_client_can_pay_async_hook', result, params)
							.then(res => {
								// answer
								this.answerRequest(json, {can_pay: result.canPay});
							})
							.catch(err => {
								this.answerRequest(json, {can_pay: result.canPay, error: err});
							});
						}
						break;

					default:
						break;
				}
			}
			catch(e) {
				console.log('exception in PrimusMoneyWidgetClient.handleMessage: ' + e);
			}
		}

		// requests from widget to client
		async answerRequest(request, answer) {
			if (!request || !request.request_uuid)
				return;
	
			var data = {action: 'receive_answer', request_uuid: request.request_uuid, answer: (answer ? answer : {})};
	
			return this.postData(data);
		}

		// requests to widget
		async sendRequest(data) {

			return new Promise((resolve, reject) => {
				data.request_uuid = PrimusMoneyWidgetClient.guid();
				this.postData(data);
	
				var receive_answer = (ev) => {
					let answer = ev.detail;
					resolve(answer);
	
					window.removeEventListener('request_' + data.request_uuid, receive_answer);
				};
				
				window.addEventListener('request_' + data.request_uuid, receive_answer);
			});
	
		}
	
		receiveAnswer(request_uuid, answer) {
			const event = new CustomEvent('request_' + request_uuid, {detail: answer});
	
			window.dispatchEvent(event);
		}
	
		receiveEvent(ev) {
			const event = new CustomEvent('widget_' + ev.event_name, {detail: ev});
	
			window.dispatchEvent(event);
		}
		
		// API
		async setStartConditionsParameter(key, value) {
			this.postData({action: 'setStartConditionsParameter', key, value});
		}

		async getAppInfo() {
			let answer_struct = await this.sendRequest({action: 'getAppInfo'})
			.catch(err => {});

			return (answer_struct ? answer_struct : null); 
		}

		async getAppUUID() {
			let answer_struct = await this.sendRequest({action: 'getAppUUID'})
			.catch(err => {});

			return (answer_struct ? answer_struct.app_uuid : null); 
		}

		async getWidgetVersionInfo() {
			let answer_struct = await this.sendRequest({action: 'getVersionInfo'})
			.catch(err => {});

			return (answer_struct ? {version: answer_struct.version} : null); 
		}

		async getWidgetSize() {
			let answer_struct = await this.sendRequest({action: 'getWidgetSize'})
			.catch(err => {});

			return (answer_struct ? answer_struct.size : null); 
		}

		async fetchIsMutable() {
			let answer_struct = await this.sendRequest({action: 'isMutable'})
			.catch(err => {});

			return (answer_struct ? answer_struct.mutable : null); 
		}

		async fetchIsOnMobile() {
			let answer_struct = await this.sendRequest({action: 'isOnMobile'})
			.catch(err => {});

			return (answer_struct ? answer_struct.on_mobile : null); 
		}


		async computeWebPaymentLink(params) {
			let answer_struct = await this.sendRequest({action: 'computeWebPaymentLink', xtra_params: params})
			.catch(err => {});

			return (answer_struct ? answer_struct.url : null);
		}

		async loadL10nStrings(strings) {
			this.postData({action: 'loadL10nStrings', strings: strings});
		}

		async refreshWidget() {
			this.postData({action: 'refreshWidget'});
		}



		async lockWidget() {
			this.postData({action: 'setStartConditionsParameter', key: 'mutable', value: false});
		}

		async getTransactionInfo() {
			let answer_struct = await this.sendRequest({action: 'getTransactionInfo'})
			.catch(err => {});

			return (answer_struct ? answer_struct.tx_info : null);
		}

		async fetchTransactionInfo(transaction_hash) {
			let answer_struct = await this.sendRequest({action: 'fetchTransactionInfo', transaction_hash})
			.catch(err => {});

			return (answer_struct ? answer_struct.tx_info : null);
		}

		async fetchAccountBalance(address) {
			let answer_struct = await this.sendRequest({action: 'fetchAccountBalance', address})
			.catch(err => {});

			return (answer_struct ? answer_struct.balance : null);
		}

		async computeTokenAmount(amount) {
			let answer_struct = await this.sendRequest({action: 'computeTokenAmount', amount})
			.catch(err => {});

			return (answer_struct ? answer_struct.amount : null);
		}

		async getWidgetInfo() {
			let answer_struct = await this.sendRequest({action: 'getWidgetInfo'})
			.catch(err => {});

			return (answer_struct ? answer_struct : null); 
		}

		async getTokenAmount() {
			let answer_struct = await this.sendRequest({action: 'getAmount'})
			.catch(err => {});

			return (answer_struct ? answer_struct.amount : null); 
		}

		async fetchTokenAmount() {
			// OBSOLETE: fetch should be used only when passing a parameter
			let answer_struct = await this.sendRequest({action: 'getAmount'})
			.catch(err => {});

			return (answer_struct ? answer_struct.amount : null); 
		}

		async setTokenAmount(token_amount) {
			this.postData({action: 'setAmount', amount: token_amount});
		}

		async getToAddress() {
			let answer_struct = await this.sendRequest({action: 'getToAddress'})
			.catch(err => {});

			return (answer_struct ? answer_struct.to_address : null); 
		}

		async fetchToAddress() {
			// OBSOLETE: fetch should be used only when passing a parameter
			let answer_struct = await this.sendRequest({action: 'getToAddress'})
			.catch(err => {});

			return (answer_struct ? answer_struct.to_address : null); 
		}

		async setToAddress(address) {
			this.postData({action: 'setToAddress', address});
		}

		async getCardAddress() {
			let answer_struct = await this.sendRequest({action: 'getCardAddress'})
			.catch(err => {});

			return (answer_struct ? answer_struct.card_address : null); 
		}

		async fetchCardAddress() {
			// OBSOLETE: fetch should be used only when passing a parameter
			let answer_struct = await this.sendRequest({action: 'getCardAddress'})
			.catch(err => {});

			return (answer_struct ? answer_struct.card_address : null); 
		}

		async getCardBalance() {
			let answer_struct = await this.sendRequest({action: 'getCardBalance'})
			.catch(err => {});

			return (answer_struct ? answer_struct : null); 
		}

		async fetchCardBalance() {
			// OBSOLETE: fetch should be used only when passing a parameter
			let answer_struct = await this.sendRequest({action: 'getCardBalance'})
			.catch(err => {});

			return (answer_struct ? answer_struct : null); 
		}

		async getCardPublicKeys() {
			let answer_struct = await this.sendRequest({action: 'getCardPublicKeys'})
			.catch(err => {});

			return (answer_struct ? answer_struct : null); 
		}

		async fetchCardPublicKeys() {
			// OBSOLETE: fetch should be used only when passing a parameter
			let answer_struct = await this.sendRequest({action: 'getCardPublicKeys'})
			.catch(err => {});

			return (answer_struct ? answer_struct : null); 
		}


		async getInvoiceId() {
			let answer_struct = await this.sendRequest({action: 'getInvoiceId'})
			.catch(err => {});

			return (answer_struct ? answer_struct.invoice_id : null); 
		}

		async fetchInvoiceId() {
			// OBSOLETE: fetch should be used only when passing a parameter
			let answer_struct = await this.sendRequest({action: 'getInvoiceId'})
			.catch(err => {});

			return (answer_struct ? answer_struct.invoice_id : null); 
		}

		async setInvoiceId(id) {
			this.postData({action: 'setInvoiceId', invoiceid: id});
		}

		async isEnabled() {
			let answer_struct = await this.sendRequest({action: 'isEnabled'})
			.catch(err => {});

			return (answer_struct ? answer_struct.enabled : null); 
		}

		async fetchIsEnabled() {
			let answer_struct = await this.sendRequest({action: 'isEnabled'})
			.catch(err => {});

			return (answer_struct ? answer_struct.enabled : null); 
		}

		async enableWidget() {
			let answer_struct = await this.sendRequest({action: 'enableWidget'})
			.catch(err => {});

			return (answer_struct ? answer_struct.enabled : null);
		}

		async disableWidget() {
			let answer_struct = await this.sendRequest({action: 'disableWidget'})
			.catch(err => {});

			return (answer_struct ? answer_struct.enabled : null);
		}

		async setTransactionHash(tx_hash) {
			this.postData({action: 'setTransactionHash', transaction_hash: tx_hash});
		}

		// request transfer
		async doAmountTransfer(amount, to_address) {
			let answer_struct = await this.sendRequest({action: 'doAmountTransfer', amount, to_address, noreplay: true})
			.catch(err => {}); // noreplay to avoid re-executing action after a refreshPage

			return (answer_struct ? answer_struct.tx_info : null);
		}


		// encryption support
		async computeAesEncryptString(plaintext) {
			let answer_struct = await this.sendRequest({action: 'computeAesEncryptString', plaintext})
			.catch(err => {});

			return (answer_struct ? answer_struct.cyphertext : null);
		}

		async computeAesDecryptString(cyphertext) {
			let answer_struct = await this.sendRequest({action: 'computeAesDecryptString', cyphertext})
			.catch(err => {});

			return (answer_struct ? answer_struct.plaintext : null);
		}

		async computeRsaEncryptString(rsapublickey, plaintext) {
			let answer_struct = await this.sendRequest({action: 'computeRsaEncryptString', rsapublickey, plaintext})
			.catch(err => {});

			return (answer_struct ? answer_struct.cyphertext : null);
		}

		async computeRsaDecryptString(rsapublickey, cyphertext) {
			let answer_struct = await this.sendRequest({action: 'computeRsaDecryptString', rsapublickey, cyphertext})
			.catch(err => {});

			return (answer_struct ? answer_struct.plaintext : null);
		}

		async computeSignString(plaintext) {
			let answer_struct = await this.sendRequest({action: 'computeSignString', plaintext})
			.catch(err => {});

			return (answer_struct ? answer_struct.signature : null);
		}

		async computeValidateStringSignature(address, plaintext, signature) {
			let answer_struct = await this.sendRequest({action: 'computeValidateStringSignature', address, plaintext, signature})
			.catch(err => {});

			return (answer_struct ? answer_struct.valid : null);
		}


	
		// static methods
		static async getWidgetUrl(params) {
			let widget_url;

			try {
				if (!params)
				throw new Error('parameters are missing!');

				// check valid input
				if (!params.widget_url)
				throw new Error('widget_url parameter is missing!');
		
				widget_url = params.widget_url;

				// build query string
				let querystring = '';
		
				// check valid input
				if (!params.widget)
				throw new Error('widget parameter is missing!');
		
				if (params.mutable && ((params.mutable === false) || (params.mutable === 'false'))) {
					if (!params.tokenaddress)
					throw new Error('tokenaddress parameter is missing!');
		
					if (!params.amount && params.string_amount)
					throw new Error('amount parameter is missing!');
					
					if (!params.to_address)
					throw new Error('to_address parameter is missing!');
		
				}
		
				if (!params.client_id)
				throw new Error('client_id parameter is missing!');
			
				if (!params.client_key)
				throw new Error('client_key parameter is missing!');
			
				if (!params.web3_provider_url)
				throw new Error('web3_provider_url parameter is missing!');
			
				// build query string
				
				// required
				querystring += 'widget=' + params.widget;
		
				querystring += '&tokenaddress=' + params.tokenaddress;

				if (params.amount !== undefined)
				querystring += '&amount=' + params.amount;
				else if (params.string_amount !== undefined)
				querystring += '&string_amount=' + params.string_amount;
		
				if (params.to_address !== undefined)
				querystring += '&to_address=' + params.to_address;
		
				querystring += '&web3_provider_url=' + this.encodebase64(params.web3_provider_url);
				
				querystring += '&client_id=' + params.client_id;
				querystring += '&client_key=' + params.client_key;
		
				// optional
				querystring += (params.mutable !== undefined ? '&mutable=' + params.mutable : '');
				querystring += (params.remote_wallet_driver ? '&remote_wallet_driver=' + params.remote_wallet_driver : '');
				querystring += (params.remote_wallet_url ? '&remote_wallet_url=' + this.encodebase64(params.remote_wallet_url) : '');
				querystring += (params.remote_wallet_ring ? '&remote_wallet_ring=' + params.remote_wallet_ring : '');
				querystring += (params.local_wallet_hide ? '&local_wallet_hide=' + params.local_wallet_hide : '');

				querystring += (params.returnurl ? '&returnurl=' + this.encodebase64(params.returnurl) : '');
				querystring += (params.callbackurl ? '&callbackurl=' + this.encodebase64(params.callbackurl) : '');

				querystring += (params.chainid ? '&chainid=' + params.chainid : '');
				querystring += (params.networkid ? '&networkid=' + params.networkid : '');
				querystring += (params.explorer_url ? '&explorer_url=' + this.encodebase64(params.explorer_url) : '');

				querystring += (params.default_gas_limit ? '&default_gas_limit=' + params.default_gas_limit : '');
				querystring += (params.default_gas_price ? '&default_gas_price=' + params.default_gas_price : '');
				querystring += (params.avg_transaction_fee ? '&avg_transaction_fee=' + params.avg_transaction_fee : '');
				querystring += (params.transaction_units_min ? '&transaction_units_min=' + params.transaction_units_min : '');

				querystring += (params.rest_server_url ? '&rest_server_url=' + this.encodebase64(params.rest_server_url) : '');
				querystring += (params.rest_server_api_path ? '&rest_server_api_path=' + params.rest_server_api_path : '');

				// widget_uuid
				querystring += (params.widget_uuid ? '&widget_uuid=' + params.widget_uuid : '');

				// widget_view
				querystring += (params.widget_view ? '&widget_view=' + params.widget_view : '');

				// caller
				querystring += (params.caller_uuid ? '&caller_uuid=' + params.caller_uuid : '');
				querystring += ((params.pay_disabled === true) || (params.pay_disabled === 'true') ? '&disabled=true': '');
				querystring += ((params.ask_before_pay === true) || (params.ask_before_pay === 'true')? '&ask_before_pay=true': '');
		
				// then pack everything in a b64 code
				let b64params = this.encodebase64(querystring);

				widget_url += '?b64params=' + b64params

			}
			catch(e) {
				console.log('exception in PrimusMoneyWidgetClient.getWidgetUrl: ' + e);
			}

			return widget_url;
		}

		static getWidgets() {
			if (PrimusMoneyWidgetClient.widgets)
				return PrimusMoneyWidgetClient.widgets;
	
			PrimusMoneyWidgetClient.widgets = Object.create(null);
	
			return PrimusMoneyWidgetClient.widgets;
		}
	
		static getWidget(name) {
			let widgets = PrimusMoneyWidgetClient.getWidgets();
	
			return widgets[name];
		}
	
		static registerWidget(name, params) {
			let widget = new PrimusMoneyWidgetClient(name);
	
			let widgets = PrimusMoneyWidgetClient.getWidgets();
	
			widgets[name] = widget; // can be overloaded by caller
			widgets[widget.uuid] = widget;
			
			// spawning registration (async)
			widget._register(params)
			.catch(err => {
				console.log('could not register widget: ' + err);
			});

			return widget;
		}
	
		static postDataToWidget(name, data) {
			let widget = PrimusMoneyWidgetClient.getWidget(name);
	
			if (widget)
				widget.postData(data);
		}
	
		static async sendRequestToWidget(name, data) {
			let widget = PrimusMoneyWidgetClient.getWidget(name);
	
			if (widget)
				return widget.sendRequest(data);
		}
	
		// utils
		static guid() {
			function s4() {
				return Math.floor((1 + Math.random()) * 0x10000)
					.toString(16)
					.substring(1);
			}
			
			return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
				s4() + '-' + s4() + s4() + s4();		
		}

		static _getBufferClass() {
			var _Buffer;
			try {
				if (typeof window !== 'undefined' && typeof window.Buffer !== 'undefined') {
					_Buffer = window.Buffer;
				} else {
					_Buffer = require('buffer').Buffer;
				}
			} catch (e) {
			}

			return _Buffer;
		}

		static encodebase64(str) {
			var _Buffer = PrimusMoneyWidgetClient._getBufferClass();
			var b64;

			if (_Buffer) {
				b64 = _Buffer.from(str).toString('base64');
			}
			else {
				b64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
					function toSolidBytes(match, p1) {
						return String.fromCharCode('0x' + p1);
					}));
			}

			return b64;
		}
	}
	
	window.MyWidget = PrimusMoneyWidgetClient ; // for backward compatibility
	window.PrimusMoneyWidgetClient = PrimusMoneyWidgetClient ;

	// TODO: if we want to have multiple PrimusMoneyWidgetClient class coming
	// multiple domains, we need to save and retrieve the class in a map
	// based on tokens unique to each domain
}


import './widget-client.js';

const WidgetClient = window.PrimusMoneyWidgetClient;

class ReactWidgetClient {

	static guid() {
		return WidgetClient.guid();
	}

	static async getWidgetUrl(params) {
		return WidgetClient.getWidgetUrl(params);
	}

	// 1 step creation and register
	static registerWidget(name, params) {
		return WidgetClient.registerWidget(name, params);
	}

	// 2 step creation and register
	static createWidget(name, params) {
		let widget = new WidgetClient(name);

		widget.params = params;

		return widget;
	}

	static async initWidget(widget) {
		let widgets = WidgetClient.getWidgets();

		let name = widget.name;
		let params = widget.params;
	
		widgets[name] = widget; // can be overloaded by caller
		widgets[widget.uuid] = widget;
		
		// spawning registration (async)
		await widget._register(params)
		.catch(err => {
			console.log('could not register widget: ' + err);
		});

		return widget;
	}



	static getWidget(widget_client_name) {
		return WidgetClient.getWidget(widget_client_name);
	}

	// react native
	static async createWidgetTag(widget_client_id, params) {
		try {
			let widget_url = await ReactWidgetClient.getWidgetUrl(params)
		
			// build iframe tag
			let widget_tag = '<iframe id="' + widget_client_id + '" src="' + widget_url + '" scrolling="no" width="300" height="200"></iframe>';
		
			return widget_tag;
		}
		catch(e) {
			console.log('exception in ReactWidgetClient.getWidgetTag: ' + e);
		}
	
	}


	// react web
	static async createWidgetiFrame(widget_client_id, params, onIFrameLoad) {
		try {
			let widget_url = await ReactWidgetClient.getWidgetUrl(params);

			if (!widget_url)
				return;
			
			var iframe = document.createElement('iframe');

			iframe.id = widget_client_id;
			//iframe.style.display = "none";
			iframe.src = widget_url;
			iframe.setAttribute("scrolling", "no");
			iframe.setAttribute("frameborder", "no");
			iframe.setAttribute("width", "300");
			iframe.setAttribute("height", "200");

			iframe.addEventListener("load", (ev) => {
				onIFrameLoad(ev)
				.catch(err => {
					console.log('error in onIFrameLoad: ' + err);
				});
			});

			return iframe;
		}
		catch(e) {
			console.log('exception in ReactWidgetClient.getWidgetiFrame: ' + e);
		}
	}

	// common
	static async getWebPaymentLink(widget) {
		let widget_params = widget.params;

		return widget.computeWebPaymentLink(widget_params);
	}

}


export {WidgetClient, ReactWidgetClient};
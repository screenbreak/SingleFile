/* global browser, XMLHttpRequest */

(() => {

	browser.runtime.onMessage.addListener((message, sender) => {
		if (message.method && message.method.startsWith("singlefile.fetch")) {
			return new Promise(resolve => {
				onRequest(message, sender)
					.then(resolve)
					.catch(error => resolve({ error: error.toString() }));
			});
		}
	});

	function onRequest(message, sender) {
		if (message.method == "singlefile.fetch") {
			return fetchResource(message.url);
		} else if (message.method == "singlefile.fetchFrame") {
			return browser.tabs.sendMessage(sender.tab.id, message);
		}
	}

	function fetchResource(url) {
		return new Promise((resolve, reject) => {
			const xhrRequest = new XMLHttpRequest();
			xhrRequest.withCredentials = true;
			xhrRequest.responseType = "arraybuffer";
			xhrRequest.onerror = event => reject(new Error(event.detail));
			xhrRequest.onreadystatechange = () => {
				if (xhrRequest.readyState == XMLHttpRequest.DONE) {
					resolve({
						array: Array.from(new Uint8Array(xhrRequest.response)),
						headers: { "content-type": xhrRequest.getResponseHeader("Content-Type") },
						status: xhrRequest.status
					});
				}
			};
			xhrRequest.open("GET", url, true);
			xhrRequest.send();
		});
	}

})();
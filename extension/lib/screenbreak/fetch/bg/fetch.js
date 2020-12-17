/* global screenbreak, browser, XMLHttpRequest */

(() => {

	browser.runtime.onMessage.addListener((message, sender) => {
		if (message.method && message.method.startsWith("singlefile.fetch")) {
			return new Promise(resolve => {
				onRequest(message, sender)
					.then(resolve)
					.catch(error => resolve({ error: error && error.toString() }));
			});
		}
	});

	function onRequest(message, sender) {
		if (message.method == "singlefile.fetch") {
			return fetchResource(message.url, { referrer: message.referrer });
		} else if (message.method == "singlefile.fetchFrame") {
			return browser.tabs.sendMessage(sender.tab.id, message);
		}
	}

	function fetchResource(url, options, includeRequestId) {
		return new Promise((resolve, reject) => {
			const xhrRequest = new XMLHttpRequest();
			xhrRequest.withCredentials = true;
			xhrRequest.responseType = "arraybuffer";
			xhrRequest.onerror = event => reject(new Error(event.detail));
			xhrRequest.onreadystatechange = () => {
				if (xhrRequest.readyState == XMLHttpRequest.DONE) {
					if (xhrRequest.status || xhrRequest.response.byteLength) {
						if ((xhrRequest.status == 401 || xhrRequest.status == 403 || xhrRequest.status == 404) && !includeRequestId) {
							fetchResource(url, options, true)
								.then(resolve)
								.catch(reject);
						} else {
							resolve({
								array: Array.from(new Uint8Array(xhrRequest.response)),
								headers: { "content-type": xhrRequest.getResponseHeader("Content-Type") },
								status: xhrRequest.status
							});
						}
					} else {
						reject();
					}
				}
			};
			xhrRequest.open("GET", url, true);
			if (includeRequestId) {
				const randomId = String(Math.random()).substring(2);
				screenbreak.extension.core.bg.requests.setReferrer(randomId, options.referrer);
				xhrRequest.setRequestHeader(screenbreak.extension.core.bg.requests.REQUEST_ID_HEADER_NAME, randomId);
			}
			xhrRequest.send();
		});
	}

})();
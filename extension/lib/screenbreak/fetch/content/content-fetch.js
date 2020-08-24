/* global browser, window, addEventListener, fetch, CustomEvent, dispatchEvent, removeEventListener */

this.screenbreak.extension.lib.fetch.content.resources = this.screenbreak.extension.lib.fetch.content.resources || (() => {

	const FETCH_REQUEST_EVENT = "single-file-request-fetch";
	const FETCH_RESPONSE_EVENT = "single-file-response-fetch";

	browser.runtime.onMessage.addListener(message => {
		if (message.method == "singlefile.fetchFrame" && window.frameId && window.frameId == message.frameId) {
			return onMessage(message);
		}
	});

	async function onMessage(message) {
		try {
			let response = await fetch(message.url, { cache: "force-cache" });
			if (response.status == 403) {
				response = hostFetch(message.url);
			}
			return {
				status: response.status,
				headers: [...response.headers],
				array: Array.from(new Uint8Array(await response.arrayBuffer()))
			};
		} catch (error) {
			return {
				error: error.toString()
			};
		}
	}

	return {
		fetch: async url => {
			try {
				let response = await fetch(url, { cache: "force-cache" });
				if (response.status == 403 || response.status == 404) {
					response = hostFetch(url);
				}
				return response;
			}
			catch (error) {
				const response = await sendMessage({ method: "singlefile.fetch", url });
				return {
					status: response.status,
					headers: { get: headerName => response.headers[headerName] },
					arrayBuffer: async () => new Uint8Array(response.array).buffer
				};
			}
		},
		frameFetch: async (url, frameId) => {
			const response = await sendMessage({ method: "singlefile.fetchFrame", url, frameId });
			return {
				status: response.status,
				headers: {
					get: headerName => {
						const headerArray = response.headers.find(headerArray => headerArray[0] == headerName);
						if (headerArray) {
							return headerArray[1];
						}
					}
				},
				arrayBuffer: async () => new Uint8Array(response.array).buffer
			};
		}
	};

	async function sendMessage(message) {
		const response = await browser.runtime.sendMessage(message);
		if (!response || response.error) {
			throw new Error(response && response.error.toString());
		} else {
			return response;
		}
	}

	function hostFetch(url) {
		return new Promise((resolve, reject) => {
			dispatchEvent(new CustomEvent(FETCH_REQUEST_EVENT, { detail: url }));
			addEventListener(FETCH_RESPONSE_EVENT, onResponseFetch, false);

			function onResponseFetch(event) {
				if (event.detail) {
					if (event.detail.url == url) {
						removeEventListener(FETCH_RESPONSE_EVENT, onResponseFetch, false);
						if (event.detail.response) {
							resolve({
								status: event.detail.status,
								headers: {
									get: name => {
										const header = event.detail.headers.find(header => header[0] == name);
										return header && header[1];
									}
								},
								arrayBuffer: async () => event.detail.response
							});
						} else {
							reject(event.detail.error);
						}
					}
				} else {
					reject();
				}
			}
		});
	}

})();
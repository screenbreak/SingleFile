/* global screenbreak, fetch, XMLHttpRequest, FormData, DOMParser, setTimeout, clearTimeout */

screenbreak.extension.core.bg.api = (() => {

	const DOMAIN = "app.myscreenbreak.com";
	const API_URL = `https://${DOMAIN}/api/v1`;
	const CSRF_URL = `${API_URL}/csrf/`;
	const ARTICLE_URL = `${API_URL}/article/`;
	const LOGIN_PAGE_URL = `https://${DOMAIN}/login/`;
	const DOWNLOAD_URL = `https://${DOMAIN}/download/article/`;
	const DEFAULT_ERROR_TITLE = "API error";
	const RETRY_UPLOAD_DELAY = 5000;

	let csrfToken;

	class APIError extends Error {
		constructor(message) {
			super();
			this.message = message;
			this.title = DEFAULT_ERROR_TITLE;
		}
	}

	return {
		APIError,
		saveArticle
	};

	async function saveArticle(tabId, url, title, blob, uploadHandlers, loginPageAlreadyDisplayed) {
		if (!csrfToken) {
			csrfToken = await getCSRFToken();
		}
		const response = await fetch(ARTICLE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-csrftoken": csrfToken,
				"x-extension-version": screenbreak.extension.core.bg.config.version
			},
			body: JSON.stringify({
				url: url,
				title,
				size: blob.size
			})
		});
		if (response.status == 201) {
			const refId = (await response.json()).ref_id;
			const formData = new FormData();
			formData.append("html", blob);
			const xhr = new XMLHttpRequest();
			xhr.open("POST", `${ARTICLE_URL}${refId}/`, true);
			xhr.setRequestHeader("x-csrftoken", csrfToken);
			xhr.setRequestHeader("x-extension-version", screenbreak.extension.core.bg.config.version);
			return {
				promise: new Promise((resolve, reject) => {
					xhr.upload.onloadstart = uploadHandlers.onloadstart;
					xhr.upload.onprogress = uploadHandlers.onprogress;
					xhr.upload.onabort = uploadHandlers.onabort;
					xhr.upload.onerror = uploadHandlers.onerror;
					xhr.upload.onload = uploadHandlers.onload;
					xhr.upload.ontimeout = uploadHandlers.ontimeout;
					xhr.onload = () =>
						handlResponse(xhr, loginPageAlreadyDisplayed)
							.then(() => resolve(DOWNLOAD_URL + refId + "/"))
							.catch(reject);
					xhr.onerror = reject;
					xhr.send(formData);
				}),
				cancel: () => cancelSave(xhr)
			};
		} else {
			return {
				promise: handlResponse(response, loginPageAlreadyDisplayed),
				cancel: () => cancelSave(response)
			};
		}

		async function handlResponse(response, loginPageAlreadyDisplayed) {
			if (response.status == 403) {
				if (!loginPageAlreadyDisplayed) {
					await screenbreak.extension.core.bg.tabs.launchWebAuthFlow(tabId, LOGIN_PAGE_URL);
				}
				return new Promise((resolve, reject) => {
					response.timeoutSave = setTimeout(() => {
						csrfToken = null;
						saveArticle(tabId, url, title, blob, uploadHandlers, true)
							.then(result => result.promise)
							.then(resolve)
							.catch(reject);
					}, RETRY_UPLOAD_DELAY);
				});
			} else if (response.status >= 400) {
				const error = new APIError(response.statusText || response.status);
				try {
					const details = await response.json();
					error.title = details.title;
					error.message = details.message;
					error.actionLabel = details.action_label;
					error.actionURL = details.action_url;
				} catch (error) {
					// ignored
				}
				throw error;
			}
		}

		function cancelSave(response) {
			if (response.timeoutSave) {
				clearTimeout(response.timeoutSave);
				delete response.timeoutSave;
			}
			if (response.abort) {
				response.abort();
			}
		}
	}

	async function getCSRFToken() {
		const response = await fetch(CSRF_URL, {
			headers: {
				"Accept": "text/html"
			}
		});
		const parser = new DOMParser();
		const document = parser.parseFromString(await response.text(), "text/html");
		const script = Array.from(document.querySelectorAll("script")).find(scriptElement => scriptElement.textContent.match(/window\.drf\s*=\s*(.*)/gi));
		const csrfObjectMatch = script.textContent.replace(/\n/g, "").trim().match(/window\.drf\s*=\s({.*})/);
		if (csrfObjectMatch && csrfObjectMatch[1]) {
			const csrfValueMatch = csrfObjectMatch[1].match(/csrfToken: "(.*?)"/);
			if (csrfValueMatch && csrfValueMatch[1]) {
				return csrfValueMatch[1];
			}
		}
	}

})();

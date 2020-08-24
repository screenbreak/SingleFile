/* global screenbreak, fetch, XMLHttpRequest, FormData, DOMParser */

screenbreak.extension.core.bg.api = (() => {

	const CSRF_URL = "https://app.myscreenbreak.com/api/v1/csrf/";
	const API_URL = "https://app.myscreenbreak.com/api/v1/article/";
	const LOGIN_PAGE_URL = "https://app.myscreenbreak.com/login/";

	let csrfToken;

	return {
		saveArticle
	};

	async function saveArticle(url, title, blob, uploadHandlers) {
		if (!csrfToken) {
			csrfToken = await getCSRFToken();
		}
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-csrftoken": csrfToken
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
			xhr.open("POST", `${API_URL}${refId}/`, true);
			xhr.setRequestHeader("x-csrftoken", csrfToken);
			return new Promise((resolve, reject) => {
				xhr.upload.onloadstart = uploadHandlers.onloadstart;
				xhr.upload.onprogress = uploadHandlers.onprogress;
				xhr.upload.onabort = uploadHandlers.onabort;
				xhr.upload.onerror = uploadHandlers.onerror;
				xhr.upload.onload = uploadHandlers.onload;
				xhr.upload.ontimeout = uploadHandlers.ontimeout;
				xhr.onload = () => handlResponse(xhr.response).then(resolve).catch(reject);
				xhr.onerror = reject;
				xhr.send(formData);
			});
		} else {
			await handlResponse(response);
		}

		async function handlResponse(response) {
			if (response.status == 403) {
				await screenbreak.extension.core.bg.tabs.launchWebAuthFlow(LOGIN_PAGE_URL);
				csrfToken = null;
				await saveArticle(url, title, blob, uploadHandlers);
			} else if (response.status >= 400) {
				throw new Error(response.status);
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
		const script = Array.from(document.querySelectorAll("script")).find(scriptElement => scriptElement.textContent.match(/window\.drf\s*=\s(.*)/gi));
		const csrfObjectMatch = script.textContent.replace(/\n/g, "").trim().match(/window\.drf\s*=\s({.*})/);
		if (csrfObjectMatch && csrfObjectMatch[1]) {
			const csrfValueMatch = csrfObjectMatch[1].match(/csrfToken: "(.*?)"/);
			if (csrfValueMatch && csrfValueMatch[1]) {
				return csrfValueMatch[1];
			}
		}
	}

})();

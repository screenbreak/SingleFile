// Client for the Screenbreak webapp API, unchanged from the 1.x extension:
// POST /api/v1/article/ creates the article, then the gzipped HTML is uploaded to /api/v1/article/<ref_id>/.

const RETRY_LOGIN_DELAY = 5000;
const MAX_LOGIN_WAIT = 5 * 60 * 1000;

export class APIError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.title = details.title || "Could not save the article";
		this.actionLabel = details.actionLabel;
		this.actionURL = details.actionURL;
	}
}

let csrfToken;

export async function saveArticle({ serverUrl, url, title, gzippedHTML, version, onLoginRequired }) {
	const apiURL = `${serverUrl}/api/v1`;
	const startTime = Date.now();
	let loginPageOpened = false;
	for (;;) {
		if (!csrfToken) {
			csrfToken = await getCSRFToken(apiURL);
		}
		const headers = { "x-csrftoken": csrfToken || "", "x-extension-version": version };
		let response = await fetch(`${apiURL}/article/`, {
			method: "POST",
			credentials: "include",
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify({ url, title, size: gzippedHTML.size })
		});
		if (response.status == 201) {
			const refId = (await response.json()).ref_id;
			const formData = new FormData();
			formData.append("html", gzippedHTML, "article.html.gz");
			response = await fetch(`${apiURL}/article/${refId}/`, { method: "POST", credentials: "include", headers, body: formData });
			if (response.ok) {
				return { refId, articleURL: `${serverUrl}/download/article/${refId}/`, libraryURL: `${serverUrl}/articles/` };
			}
		}
		if (response.status == 403) {
			// Not logged in (or the CSRF token expired): show the login page once, then retry until the user has logged in.
			if (!loginPageOpened) {
				loginPageOpened = true;
				await onLoginRequired(`${serverUrl}/login/`);
			}
			if (Date.now() - startTime > MAX_LOGIN_WAIT) {
				throw new APIError("Please log in to Screenbreak and try again.", { title: "Not logged in" });
			}
			csrfToken = null;
			await new Promise(resolve => setTimeout(resolve, RETRY_LOGIN_DELAY));
			continue;
		}
		throw await toAPIError(response);
	}
}

async function toAPIError(response) {
	// A 429 is the free plan's monthly limit; the server sends a title, message and an upgrade link.
	let details = {};
	try {
		details = await response.json();
	} catch (error) {
		// not JSON
	}
	return new APIError(details.message || details.detail || response.statusText || `Server error ${response.status}`, {
		title: details.title,
		actionLabel: details.action_label,
		actionURL: details.action_url
	});
}

async function getCSRFToken(apiURL) {
	// The endpoint answers JSON ({csrf_token}) or, as the 1.x extension requested, the DRF HTML page with `window.drf = { csrfToken: "..." }`.
	const response = await fetch(`${apiURL}/csrf/`, { credentials: "include", headers: { "Accept": "application/json, text/html" } });
	const text = await response.text();
	try {
		return JSON.parse(text).csrf_token || null;
	} catch (error) {
		const match = text.match(/csrfToken:\s*"(.*?)"/);
		return match ? match[1] : null;
	}
}

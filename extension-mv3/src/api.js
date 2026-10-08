// Client for the Screenbreak webapp API, unchanged from the 1.x extension:
// POST /api/v1/article/ creates the article, then the gzipped HTML is uploaded to /api/v1/article/<ref_id>/.
// Each step is its own call so the background worker can stop to ask the user to log in, then carry on.
import { libraryURL } from "./plans.js";

export class APIError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.kind = details.kind || "server";
		this.title = details.title;
		this.actionLabel = details.actionLabel;
		this.actionURL = details.actionURL;
	}
}

let csrfToken;

// Returns { refId } once the article exists on the server, or { loginRequired: true } when the user
// isn't logged in (the server answers 403 for logged-out users and for profiles that aren't complete).
export async function createArticle({ serverUrl, url, title, size, version }) {
	const apiURL = `${serverUrl}/api/v1`;
	if (!csrfToken) {
		csrfToken = await getCSRFToken(apiURL);
	}
	const response = await request(`${apiURL}/article/`, {
		method: "POST",
		credentials: "include",
		headers: { "x-csrftoken": csrfToken || "", "x-extension-version": version, "Content-Type": "application/json" },
		body: JSON.stringify({ url, title, size })
	});
	if (response.status == 201) {
		return { refId: (await response.json()).ref_id };
	}
	if (response.status == 403) {
		// The CSRF token may have expired with the session: fetch a new one next time.
		csrfToken = null;
		return { loginRequired: true };
	}
	throw await toAPIError(response);
}

export async function uploadArticle({ serverUrl, refId, gzippedHTML, version }) {
	const formData = new FormData();
	formData.append("html", gzippedHTML, "article.html.gz");
	const response = await request(`${serverUrl}/api/v1/article/${refId}/`, {
		method: "POST",
		credentials: "include",
		headers: { "x-csrftoken": csrfToken || "", "x-extension-version": version },
		body: formData
	});
	if (!response.ok) {
		throw await toAPIError(response);
	}
	return {
		refId,
		articleURL: `${serverUrl}/articles/${refId}/`,
		libraryURL: libraryURL(serverUrl),
		saves: await savesFrom(response)
	};
}

// The webapp answers an upload with an empty 201 today. When it adds `saves_used` and `saves_limit`,
// the "Saved" card can show the meter; until then this is null and the card shows none.
async function savesFrom(response) {
	try {
		const body = JSON.parse(await response.text());
		return Number.isFinite(body.saves_used) && Number.isFinite(body.saves_limit) ? { used: body.saves_used, limit: body.saves_limit } : null;
	} catch (error) {
		return null;
	}
}

// Undo for a save. The webapp has no API call for this yet, so this uses the "remove" link of the
// articles page (a soft delete). It answers with a redirect, which a manual-redirect fetch sees as opaque.
export async function removeArticle({ serverUrl, refId }) {
	const response = await request(`${serverUrl}/articles/delete/${encodeURIComponent(refId)}/`, { credentials: "include", redirect: "manual" });
	if (response.type != "opaqueredirect" && !response.ok) {
		throw await toAPIError(response);
	}
}

// The door and library addresses live in plans.js (one home). This is the sign-up page without a pending
// action, for the popup's "Get all 11 designs, free →".
export function accountPageURL(serverUrl) {
	return `${serverUrl}/signup/?from=extension`;
}

// A short, non-reversible key for a page address (fragment dropped): the list of pages saved from this
// browser stores these, never the addresses.
export async function savedPageKey(url) {
	const address = String(url || "").split("#")[0];
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
	return Array.from(new Uint8Array(digest).slice(0, 8), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function request(url, options) {
	try {
		return await fetch(url, options);
	} catch (error) {
		// fetch only rejects when no answer came back at all.
		throw new APIError(error.message, { kind: navigator.onLine === false ? "offline" : "unreachable" });
	}
}

async function toAPIError(response) {
	// A 429 is a full free library; the server sends a title, a message and a link (the card uses its own words).
	let details = {};
	try {
		details = await response.json();
	} catch (error) {
		// not JSON
	}
	return new APIError(details.message || details.detail || response.statusText || `Server error ${response.status}`, {
		kind: response.status == 429 ? "limit" : "server",
		title: details.title,
		actionLabel: details.action_label,
		actionURL: details.action_url
	});
}

async function getCSRFToken(apiURL) {
	// The endpoint answers JSON ({csrf_token}) or, as the 1.x extension requested, the DRF HTML page with `window.drf = { csrfToken: "..." }`.
	const response = await request(`${apiURL}/csrf/`, { credentials: "include", headers: { "Accept": "application/json, text/html" } });
	const text = await response.text();
	try {
		return JSON.parse(text).csrf_token || null;
	} catch (error) {
		const match = text.match(/csrfToken:\s*"(.*?)"/);
		return match ? match[1] : null;
	}
}

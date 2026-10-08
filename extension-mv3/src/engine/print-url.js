// The address a print carries: on paper, in the QR and in the end block. It is the article's own address, not
// the one the reader happened to open: the site's canonical link when it is on the same site, else og:url, else
// the page address; then without the #fragment and without the query parameters that track a click or unlock
// the article for one reader (a gift token on paper would give that gift to anyone who scans it).
// content-print.js picks it at capture; layout.js falls back to cleanURL(article.url) for older captures.

// Exact names and name prefixes (ending in "*"), compared in lower case. Every other parameter stays: some sites
// put the article id in the query (?p=123, ?id=). The gift and access tokens are per site and from memory
// (research 05 §5): NYT unlocked_article_code, FT accessToken/giftToken, WaPo pwapi_token, Economist giftId.
export const TRACKING_PARAMETERS = [
	"utm_*", "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "_hs*", "igshid", "ref", "ref_src", "smid", "sgrp", "cmp", "cmpid",
	"gift", "giftid", "gifttoken", "token", "accesstoken", "unlocked_article_code", "pwapi_token", "reflink", "share*"
];

const isTracking = name => {
	const key = name.toLowerCase();
	return TRACKING_PARAMETERS.some(rule => rule.endsWith("*") ? key.startsWith(rule.slice(0, -1)) : key == rule);
};

// The address without its fragment and tracking parameters; null when it isn't an http(s) address.
export function cleanURL(address) {
	let url;
	try {
		url = new URL(address);
	} catch (error) {
		return null;
	}
	if (!/^https?:$/.test(url.protocol)) {
		return null;
	}
	url.hash = "";
	// Pair by pair, so the parameters that stay keep their encoding.
	const kept = url.search.slice(1).split("&").filter(pair => {
		if (!pair) {
			return false;
		}
		let name = pair.split("=")[0];
		try {
			name = decodeURIComponent(name.replace(/\+/g, " "));
		} catch (error) {
			// Keep the raw name.
		}
		return !isTracking(name);
	});
	url.search = kept.length ? "?" + kept.join("&") : "";
	return url.href;
}

// Same site: the same host, or the same host but for a leading "www.".
const bareHost = url => url.hostname.toLowerCase().replace(/^www\./, "");

// href: the page address; canonical: link[rel=canonical] href; ogURL: meta[property="og:url"] content. All
// absolute (the caller resolves them against the page).
export function printURL({ href, canonical, ogURL }) {
	const page = cleanURL(href);
	let pageURL = null;
	try {
		pageURL = new URL(href);
	} catch (error) {
		// Not a URL: no candidate can be checked against it.
	}
	for (const candidate of [canonical, ogURL]) {
		const clean = candidate && cleanURL(candidate);
		if (!clean || !pageURL) {
			continue;
		}
		const url = new URL(clean);
		// Some sites point every canonical link at their home page.
		if (bareHost(url) == bareHost(pageURL) && !(url.pathname == "/" && pageURL.pathname != "/")) {
			return clean;
		}
	}
	return page || href || "";
}

// The address as it reads on paper: no scheme, no "www.", the path decoded when it is readable.
export function shownURL(address) {
	let shown = String(address || "").replace(/^https?:\/\/(www\.)?/, "");
	try {
		shown = decodeURI(shown);
	} catch (error) {
		// Keep it encoded.
	}
	return shown.replace(/\/$/, "");
}

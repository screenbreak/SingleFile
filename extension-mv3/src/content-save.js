// "Save": capture the page with SingleFile (one HTML file, images/CSS/fonts inlined), gzip it,
// and hand it to the background worker, which uploads it to the user's Screenbreak account.
import "./browser-shim.js";
import * as singlefile from "single-file-core/single-file.js";
import { showStatus } from "./overlay.js";
import { bytesToBase64, base64ToBytes } from "./base64.js";

// Same capture settings as the 1.x extension (renamed where single-file-core renamed them), so new captures
// match the thousands already stored. The "Page saved with SingleFile" header the extractor reads is unchanged.
const CAPTURE_OPTIONS = {
	removeHiddenElements: true,
	removeUnusedStyles: true,
	removeUnusedFonts: true,
	removeFrames: false,
	blockScripts: true,
	// blockScripts only empties external scripts; the 1.x capture had no scripts at all.
	removedElementsSelector: "script",
	compressHTML: false,
	blockVideos: true,
	removeAlternativeFonts: true,
	removeAlternativeMedias: true,
	removeAlternativeImages: true,
	groupDuplicateImages: true,
	loadDeferredImages: true,
	loadDeferredImagesMaxIdleTime: 1000,
	maxResourceSizeEnabled: false,
	insertSingleFileComment: true,
	insertCanonicalLink: true,
	blockMixedContent: false,
	saveFavicon: true,
	networkTimeout: 30000
};

globalThis.__screenbreakCapture = async function capture() {
	showStatus({ state: "working", title: "Saving to Screenbreak", detail: "Capturing the page…", step: 1 });
	const pageData = await singlefile.getPageData(CAPTURE_OPTIONS, { fetch: backgroundFetch, frameFetch: backgroundFetch });
	showStatus({ state: "working", title: "Saving to Screenbreak", detail: "Compressing…", step: 2 });
	const gzipped = await new Response(new Blob([pageData.content]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
	return { url: location.href, title: pageData.title || document.title, gzippedBase64: bytesToBase64(new Uint8Array(gzipped)) };
};

// Content scripts are bound by the page's CORS rules, so cross-origin images, fonts and stylesheets
// are fetched by the background worker, which has host permissions.
async function backgroundFetch(url, options = {}) {
	if (/^(data|blob):/.test(url)) {
		// Only the page itself can read its blob: URLs.
		return fetch(url);
	}
	const response = await chrome.runtime.sendMessage({ method: "screenbreak.fetch", url, referrer: options.referrer, headers: options.headers });
	if (!response || response.error) {
		throw new Error(response ? response.error : "fetch failed");
	}
	const bytes = base64ToBytes(response.body);
	return {
		status: response.status,
		url: response.url,
		headers: { get: name => response.headers[name.toLowerCase()] ?? null },
		arrayBuffer: async () => bytes.buffer
	};
}

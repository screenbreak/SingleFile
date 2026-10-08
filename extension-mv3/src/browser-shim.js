// single-file-core talks to the extension through `globalThis.browser` (the WebExtensions name).
// Chrome only exposes `chrome`, which has the same promise-based API in Manifest V3.
if (!globalThis.browser) {
	globalThis.browser = globalThis.chrome;
}

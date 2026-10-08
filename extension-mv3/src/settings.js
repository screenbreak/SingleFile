// User settings, stored in chrome.storage.sync so they follow the user across browsers.

export const ACTIONS = ["save", "print", "ask"];

export const DEFAULT_SETTINGS = {
	// What a click on the toolbar button does: "save", "print", or "ask" (opens a small menu).
	defaultAction: "ask",
	// Print also saves the article to the user's account, in the background.
	saveWhenPrinting: false,
	// The Screenbreak server that "Save" uploads to.
	serverUrl: "https://app.myscreenbreak.com",
	// Defaults for the print page; the user can still change them there before printing.
	print: {
		// "best": the design the picker ranks first for each article; otherwise a design id from designs.js.
		design: "best",
		// "colour", "ink" (photos as light halftone dots), "bw" (greys) or "none".
		pictures: "colour",
		// "A4" or "Letter". The default follows the browser's language: Letter in the US and Canada.
		paper: /^(en-US|en-CA|es-US|fr-CA|es-MX)\b/.test(globalThis.navigator?.language || "") ? "Letter" : "A4",
		// Long reference lists: "leave" out, "small" type, or "keep" at text size.
		references: "small",
		// The button prints with these settings instead of showing the print page first.
		straightAway: false
	}
};

export async function getSettings() {
	const stored = await chrome.storage.sync.get(["defaultAction", "saveWhenPrinting", "serverUrl", "print"]);
	return {
		defaultAction: ACTIONS.includes(stored.defaultAction) ? stored.defaultAction : DEFAULT_SETTINGS.defaultAction,
		saveWhenPrinting: stored.saveWhenPrinting === true,
		serverUrl: (stored.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, ""),
		print: pick(DEFAULT_SETTINGS.print, stored.print)
	};
}

export async function updateSettings(changes) {
	await chrome.storage.sync.set(changes);
}

// Only the keys we know, so settings left from an older version (font, columns, duplex…) drop out.
function pick(defaults, stored = {}) {
	return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, stored && typeof stored[key] == typeof value ? stored[key] : value]));
}

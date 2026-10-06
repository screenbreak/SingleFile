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
		font: "sans",
		size: "normal",
		columns: 1,
		images: true,
		openPrintDialog: true
	}
};

export async function getSettings() {
	const stored = await chrome.storage.sync.get(["defaultAction", "saveWhenPrinting", "serverUrl", "print"]);
	return {
		defaultAction: ACTIONS.includes(stored.defaultAction) ? stored.defaultAction : DEFAULT_SETTINGS.defaultAction,
		saveWhenPrinting: stored.saveWhenPrinting === true,
		serverUrl: (stored.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, ""),
		print: { ...DEFAULT_SETTINGS.print, ...stored.print }
	};
}

export async function updateSettings(changes) {
	await chrome.storage.sync.set(changes);
}

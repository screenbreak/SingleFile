// Background service worker: decides what a click does (save, print, or ask), runs the action
// in the tab, and does the work content scripts can't (cross-origin fetches, uploading).
import { getSettings, updateSettings } from "./settings.js";
import { saveArticle } from "./api.js";
import { bytesToBase64, base64ToBytes } from "./base64.js";

const MENU_SAVE = "save";
const MENU_PRINT = "print";
const MENU_DEFAULT_PARENT = "default-action";
const MENU_DEFAULT_PREFIX = "default-action:";
const BUTTON_TITLES = {
	save: "Screenbreak: save this article",
	print: "Screenbreak: print this article",
	ask: "Screenbreak: save or print this article"
};
const DEFAULT_ACTION_LABELS = { ask: "Ask me each time", save: "Save to Screenbreak", print: "Print" };
const MAX_STORED_PRINT_JOBS = 5;

const runningTabs = new Set();
const printJobs = new Map();
const lazyTimeouts = new Map();

chrome.runtime.onInstalled.addListener(async details => {
	await createMenus();
	await applyDefaultAction();
	if (details.reason == "install") {
		chrome.runtime.openOptionsPage();
	}
});

chrome.runtime.onStartup.addListener(applyDefaultAction);

chrome.storage.onChanged.addListener((changes, area) => {
	if (area == "sync" && changes.defaultAction) {
		applyDefaultAction();
	}
});

// Only fires when no popup is set, i.e. when the default action is "save" or "print".
chrome.action.onClicked.addListener(async tab => {
	const { defaultAction } = await getSettings();
	runAction(defaultAction == "print" ? "print" : "save", tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId == MENU_SAVE || info.menuItemId == MENU_PRINT) {
		runAction(info.menuItemId, tab);
	} else if (String(info.menuItemId).startsWith(MENU_DEFAULT_PREFIX)) {
		updateSettings({ defaultAction: info.menuItemId.substring(MENU_DEFAULT_PREFIX.length) });
	}
});

chrome.commands.onCommand.addListener((command, tab) => {
	if (command == "save-page") {
		runAction("save", tab);
	} else if (command == "print-page") {
		runAction("print", tab);
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch (message.method) {
		case "screenbreak.run":
			runAction(message.action, message.tab);
			break;
		case "screenbreak.fetch":
			fetchForPage(message).then(sendResponse);
			return true;
		case "screenbreak.getPrintJob":
			getPrintJob(message.id).then(sendResponse);
			return true;
		case "singlefile.frameTree.initResponse":
		case "singlefile.frameTree.ackInitRequest":
			// Frame contents travel from each iframe to the top frame through here.
			chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 }).catch(() => {});
			break;
		case "singlefile.lazyTimeout.setTimeout":
			setLazyTimeout(sender, message);
			break;
		case "singlefile.lazyTimeout.clearTimeout":
			clearTimeout(lazyTimeouts.get(lazyTimeoutKey(sender, message)));
			break;
		default:
			return false;
	}
	sendResponse({});
	return false;
});

async function applyDefaultAction() {
	const { defaultAction } = await getSettings();
	await chrome.action.setPopup({ popup: defaultAction == "ask" ? "popup.html" : "" });
	await chrome.action.setTitle({ title: BUTTON_TITLES[defaultAction] });
	for (const action of Object.keys(DEFAULT_ACTION_LABELS)) {
		chrome.contextMenus.update(MENU_DEFAULT_PREFIX + action, { checked: action == defaultAction }).catch(() => {});
	}
}

async function createMenus() {
	const { defaultAction } = await getSettings();
	await chrome.contextMenus.removeAll();
	chrome.contextMenus.create({ id: MENU_SAVE, title: "Save to Screenbreak", contexts: ["action", "page"] });
	chrome.contextMenus.create({ id: MENU_PRINT, title: "Print this article", contexts: ["action", "page"] });
	chrome.contextMenus.create({ id: MENU_DEFAULT_PARENT, title: "When I click the button", contexts: ["action"] });
	for (const [action, label] of Object.entries(DEFAULT_ACTION_LABELS)) {
		chrome.contextMenus.create({
			id: MENU_DEFAULT_PREFIX + action,
			parentId: MENU_DEFAULT_PARENT,
			type: "radio",
			title: label,
			checked: action == defaultAction,
			contexts: ["action"]
		});
	}
}

async function runAction(action, tab) {
	if (!tab || runningTabs.has(tab.id)) {
		return;
	}
	runningTabs.add(tab.id);
	try {
		if (action == "print") {
			await printTab(tab);
		} else {
			await saveTab(tab);
		}
	} catch (error) {
		console.error(error); // eslint-disable-line no-console
		if (error.cannotAccessPage) {
			flagUnsupportedPage(tab);
		}
	} finally {
		runningTabs.delete(tab.id);
	}
}

async function saveTab(tab) {
	await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content-frames.js"] }).catch(() => {});
	const capture = await runInPage(tab, "content-save.js", "__screenbreakCapture");
	const settings = await getSettings();
	showStatus(tab, { state: "working", title: "Saving to Screenbreak", detail: "Uploading…" });
	try {
		const result = await saveArticle({
			serverUrl: settings.serverUrl,
			url: capture.url,
			title: capture.title,
			gzippedHTML: new Blob([base64ToBytes(capture.gzippedBase64)], { type: "application/gzip" }),
			version: chrome.runtime.getManifest().version,
			onLoginRequired: async loginURL => {
				showStatus(tab, { state: "working", title: "Saving to Screenbreak", detail: "Waiting for you to log in…" });
				await chrome.tabs.create({ url: loginURL, index: tab.index + 1, openerTabId: tab.id });
			}
		});
		showStatus(tab, {
			state: "done",
			title: "Saved to Screenbreak",
			links: [{ label: "Open my articles", url: result.libraryURL }]
		});
	} catch (error) {
		showStatus(tab, {
			state: "error",
			title: error.title || "Could not save the article",
			detail: error.message,
			links: error.actionURL ? [{ label: error.actionLabel || "More", url: error.actionURL }] : []
		});
		throw error;
	}
}

async function printTab(tab) {
	const article = await runInPage(tab, "content-print.js", "__screenbreakExtract");
	const id = crypto.randomUUID();
	printJobs.set(id, article);
	await storePrintJob(id, article);
	await chrome.tabs.create({ url: chrome.runtime.getURL("print.html#" + id), index: tab.index + 1, openerTabId: tab.id });
}

// Injects a content script, then calls the function it exposes on globalThis and returns its (awaited) result.
async function runInPage(tab, file, exportName) {
	try {
		const [loaded] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: name => typeof globalThis[name] == "function", args: [exportName] });
		if (!loaded || !loaded.result) {
			await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
		}
	} catch (error) {
		// chrome:// pages, the Web Store, PDFs viewed in the browser…
		error.cannotAccessPage = true;
		throw error;
	}
	const [injection] = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: async run => {
			try {
				return { value: await globalThis[run]() };
			} catch (error) {
				return { error: error.message || String(error) };
			}
		},
		args: [exportName]
	});
	if (!injection || !injection.result || injection.result.error) {
		throw new Error(injection && injection.result ? injection.result.error : "The page did not respond");
	}
	return injection.result.value;
}

async function storePrintJob(id, article) {
	// Session storage lets the print page survive a reload; it is cleared when the browser closes.
	try {
		const stored = (await chrome.storage.session.get("printJobIds")).printJobIds || [];
		const kept = [...stored, id].slice(-MAX_STORED_PRINT_JOBS);
		await chrome.storage.session.remove(stored.filter(storedId => !kept.includes(storedId)).map(storedId => "printJob:" + storedId));
		await chrome.storage.session.set({ printJobIds: kept, ["printJob:" + id]: article });
	} catch (error) {
		// Over the session storage quota (very image-heavy pages): the in-memory copy is enough to open the page.
	}
}

async function getPrintJob(id) {
	if (printJobs.has(id)) {
		return printJobs.get(id);
	}
	const key = "printJob:" + id;
	return (await chrome.storage.session.get(key))[key] || null;
}

async function fetchForPage({ url, headers }) {
	try {
		const response = await fetch(url, { headers, cache: "force-cache" });
		return {
			status: response.status,
			url: response.url,
			headers: { "content-type": response.headers.get("content-type") },
			body: bytesToBase64(new Uint8Array(await response.arrayBuffer()))
		};
	} catch (error) {
		return { error: error.message };
	}
}

function lazyTimeoutKey(sender, message) {
	return `${sender.tab.id}:${sender.frameId}:${message.type}`;
}

// Timers in background tabs are throttled, so SingleFile's lazy-loading waits are timed from here.
function setLazyTimeout(sender, message) {
	const key = lazyTimeoutKey(sender, message);
	clearTimeout(lazyTimeouts.get(key));
	lazyTimeouts.set(key, setTimeout(() => {
		lazyTimeouts.delete(key);
		chrome.tabs.sendMessage(sender.tab.id, { method: "singlefile.lazyTimeout.onTimeout", type: message.type }, { frameId: sender.frameId }).catch(() => {});
	}, message.delay));
}

function showStatus(tab, status) {
	chrome.tabs.sendMessage(tab.id, { method: "screenbreak.status", status }, { frameId: 0 }).catch(() => {});
}

function flagUnsupportedPage(tab) {
	chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b3261e" });
	chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
	chrome.action.setTitle({ tabId: tab.id, title: "Screenbreak can't save or print this page" });
}

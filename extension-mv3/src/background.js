// Background service worker: decides what a click does (save, print, or ask), runs the action
// in the tab, and does the work content scripts can't (cross-origin fetches, uploading).
import { getSettings, updateSettings } from "./settings.js";
import { createArticle, uploadArticle, removeArticle, loginURL } from "./api.js";
import { bytesToBase64, base64ToBytes } from "./base64.js";
import * as STATUS from "./status-copy.js";

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
const MAX_PRINT_JOB_SOURCES = 20;
const LOGIN_POLL_DELAY = 3000;
const MAX_LOGIN_WAIT = 5 * 60 * 1000;

const runningTabs = new Set();
const printJobs = new Map();
const lazyTimeouts = new Map();
// The last save per tab, kept so the status card can retry, undo, or carry on after a login.
const saveJobs = new Map();

chrome.runtime.onInstalled.addListener(async details => {
	await createMenus();
	await applyDefaultAction();
	if (details.reason == "install") {
		chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
	} else if (details.reason == "update" && parseInt(details.previousVersion, 10) < 2) {
		chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html#updated") });
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

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
	if (change.url) {
		// A new page in the tab: the "can't run here" state belongs to the old one.
		clearUnsupportedPage(tabId);
	}
	// The login tab moved on from the login form: try the save again straight away instead of at the next poll.
	for (const job of saveJobs.values()) {
		if (job.loginTabId == tabId && change.status == "complete" && tab.url && !tab.url.includes("/login/")) {
			job.wakeUp?.();
		}
	}
});

chrome.tabs.onRemoved.addListener(tabId => {
	const job = saveJobs.get(tabId);
	if (job) {
		job.cancelled = true;
		saveJobs.delete(tabId);
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch (message.method) {
		case "screenbreak.run":
			runAction(message.action, message.tab);
			break;
		case "screenbreak.statusAction":
			onStatusAction(message.action, sender.tab);
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
	// Tab-level popups outrank the global one, so tabs that had the "can't run here" popup follow too.
	for (const tabId of await getUnsupportedTabs()) {
		if (!(await chrome.action.getBadgeText({ tabId }).catch(() => ""))) {
			chrome.action.setPopup({ tabId, popup: defaultAction == "ask" ? "popup.html" : "" }).catch(() => {});
		}
	}
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
			await flagUnsupportedPage(tab, action);
		}
	} finally {
		runningTabs.delete(tab.id);
	}
}

// Save

async function saveTab(tab) {
	const previous = saveJobs.get(tab.id);
	if (previous) {
		previous.cancelled = true;
	}
	await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content-frames.js"] }).catch(() => {});
	let capture;
	try {
		capture = await runInPage(tab, "content-save.js", "__screenbreakCapture");
	} catch (error) {
		saveJobs.delete(tab.id);
		if (!error.cannotAccessPage) {
			showStatus(tab, STATUS.captureFailed());
		}
		throw error;
	}
	const job = { tab, capture, startTime: Date.now() };
	saveJobs.set(tab.id, job);
	await submitSave(job);
}

async function submitSave(job) {
	const { tab, capture } = job;
	const settings = await getSettings();
	const version = chrome.runtime.getManifest().version;
	const gzippedHTML = new Blob([base64ToBytes(capture.gzippedBase64)], { type: "application/gzip" });
	job.cancelled = false;
	showStatus(tab, job.loginTabId ? STATUS.waitingForLogin() : STATUS.uploading());
	try {
		let created = await createArticle({ serverUrl: settings.serverUrl, url: capture.url, title: capture.title, size: gzippedHTML.size, version });
		while (created.loginRequired) {
			if (!job.loginTabId) {
				// Ask first: opening a tab out of the blue is confusing.
				showStatus(tab, STATUS.loginRequired());
				return;
			}
			if (Date.now() - job.loginStartTime > MAX_LOGIN_WAIT) {
				job.loginTabId = null;
				showStatus(tab, STATUS.loginTimedOut());
				return;
			}
			await sleepOrWake(job, LOGIN_POLL_DELAY);
			if (job.cancelled) {
				return;
			}
			created = await createArticle({ serverUrl: settings.serverUrl, url: capture.url, title: capture.title, size: gzippedHTML.size, version });
		}
		if (job.cancelled) {
			return;
		}
		showStatus(tab, STATUS.uploading());
		job.result = await uploadArticle({ serverUrl: settings.serverUrl, refId: created.refId, gzippedHTML, version });
		if (job.loginTabId) {
			// Logged in from another tab: bring the article back so the user sees it was saved.
			chrome.tabs.update(tab.id, { active: true }).catch(() => {});
			job.loginTabId = null;
		}
		showStatus(tab, STATUS.saved({ title: withoutSiteName(capture.title), articleURL: job.result.articleURL, tip: await takeTip() }));
	} catch (error) {
		console.error(error); // eslint-disable-line no-console
		job.loginTabId = null;
		showStatus(tab, STATUS.saveFailed(error));
	}
}

// Page titles usually end with the site's name ("The Quiet Return of Paper | Longform Weekly"); the card shows the site already.
function withoutSiteName(title) {
	const parts = (title || "").split(" | ");
	return parts.length > 1 ? parts.slice(0, -1).join(" | ") : title;
}

function sleepOrWake(job, delay) {
	return new Promise(resolve => {
		const timeout = setTimeout(done, delay);
		job.wakeUp = done;
		function done() {
			clearTimeout(timeout);
			job.wakeUp = null;
			resolve();
		}
	});
}

async function onStatusAction(action, tab) {
	const job = tab && saveJobs.get(tab.id);
	switch (action) {
		case "login": {
			if (!job) {
				return;
			}
			const { serverUrl } = await getSettings();
			const loginTab = await chrome.tabs.create({ url: loginURL(serverUrl), index: tab.index + 1, openerTabId: tab.id });
			job.loginTabId = loginTab.id;
			job.loginStartTime = Date.now();
			submitSave(job);
			break;
		}
		case "focus-login":
			if (job && job.loginTabId) {
				chrome.tabs.update(job.loginTabId, { active: true }).catch(() => {});
			}
			break;
		case "retry":
			if (job) {
				job.loginTabId = null;
				submitSave(job);
			} else {
				runAction("save", tab);
			}
			break;
		case "cancel":
			if (job) {
				job.cancelled = true;
				job.loginTabId = null;
				job.wakeUp?.();
			}
			showStatus(tab, STATUS.notSaved());
			break;
		case "dismiss":
			hideStatus(tab);
			break;
		case "undo":
			if (job && job.result) {
				showStatus(tab, STATUS.removing());
				try {
					const { serverUrl } = await getSettings();
					await removeArticle({ serverUrl, refId: job.result.refId });
					job.result = null;
					showStatus(tab, STATUS.removed());
				} catch (error) {
					showStatus(tab, STATUS.undoFailed(job.result.articleURL));
				}
			}
			break;
		case "print-instead":
			if (job) {
				job.cancelled = true;
				job.loginTabId = null;
			}
			hideStatus(tab);
			runAction("print", tab);
			break;
		case "print-page":
			hideStatus(tab);
			chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.print() }).catch(() => {});
			break;
		case "print-retry":
			runAction("print", tab);
			break;
	}
}

// One tip, shown once, the first time an action succeeds: how to reach Save and Print without the button.
async function takeTip() {
	const { tipShown } = await chrome.storage.local.get("tipShown");
	if (tipShown) {
		return null;
	}
	await chrome.storage.local.set({ tipShown: true });
	return STATUS.TIP;
}

// Print

async function printTab(tab) {
	let article;
	try {
		article = await runInPage(tab, "content-print.js", "__screenbreakExtract");
	} catch (error) {
		if (!error.cannotAccessPage) {
			showStatus(tab, STATUS.printFailed());
		}
		throw error;
	}
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
	// Where each print came from outlives the job itself, so an expired print page can link back to the article.
	const { printJobSources = {} } = await chrome.storage.local.get("printJobSources");
	printJobSources[id] = { url: article.url, title: article.title };
	await chrome.storage.local.set({ printJobSources: Object.fromEntries(Object.entries(printJobSources).slice(-MAX_PRINT_JOB_SOURCES)) });
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

function hideStatus(tab) {
	chrome.tabs.sendMessage(tab.id, { method: "screenbreak.status", hide: true }, { frameId: 0 }).catch(() => {});
}

// Pages the extension can't reach (chrome://, the Web Store, the PDF viewer) can't show the status card,
// so the toolbar popup explains instead, and stays the button's popup on this tab until it navigates.
async function flagUnsupportedPage(tab, action) {
	await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#8a3b12" });
	await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
	await chrome.action.setTitle({ tabId: tab.id, title: "Screenbreak can't save or print this page" });
	await chrome.action.setPopup({ tabId: tab.id, popup: "popup.html#unsupported-" + action });
	await chrome.storage.session.set({ unsupportedTabs: [...new Set([...await getUnsupportedTabs(), tab.id])] });
	await chrome.action.openPopup?.({ windowId: tab.windowId }).catch(() => {});
}

async function getUnsupportedTabs() {
	return (await chrome.storage.session.get("unsupportedTabs")).unsupportedTabs || [];
}

async function clearUnsupportedPage(tabId) {
	const text = await chrome.action.getBadgeText({ tabId }).catch(() => "");
	if (text == "!") {
		const { defaultAction } = await getSettings();
		chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
		chrome.action.setTitle({ tabId, title: BUTTON_TITLES[defaultAction] }).catch(() => {});
		chrome.action.setPopup({ tabId, popup: defaultAction == "ask" ? "popup.html" : "" }).catch(() => {});
	}
}

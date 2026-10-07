// Background service worker: decides what a click does (save, print, or ask), runs the action
// in the tab, and does the work content scripts can't (cross-origin fetches, uploading).
import { getSettings, updateSettings } from "./settings.js";
import { createArticle, uploadArticle, removeArticle, loginURL } from "./api.js";
import { bytesToBase64, base64ToBytes } from "./base64.js";
import * as STATUS from "./status-copy.js";

const MENU_SAVE = "save";
const MENU_PRINT = "print";
const MENU_PRINT_PREVIEW = "print-preview";
const MENU_STRAIGHT_AWAY = "print-straight-away";
const MENU_DEFAULT_PARENT = "default-action";
const MENU_DEFAULT_PREFIX = "default-action:";
const BUTTON_TITLES = {
	save: "Screenbreak: save this article",
	print: "Screenbreak: print this article",
	printAndSave: "Screenbreak: print and save this article",
	ask: "Screenbreak: save or print this article"
};
const PRINT_MENU_TITLES = { print: "Print this article", printAndSave: "Print and save this article" };
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
// The latest save status of each "print and save", for a print page that opens after the save started.
const printSaveStatuses = new Map();

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
	if (area == "sync" && (changes.defaultAction || changes.saveWhenPrinting || changes.print)) {
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
	} else if (info.menuItemId == MENU_PRINT_PREVIEW) {
		runAction("print", tab, { preview: true });
	} else if (info.menuItemId == MENU_STRAIGHT_AWAY) {
		setStraightAway(info.checked);
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
			runAction(message.action, message.tab, { preview: !!message.preview });
			break;
		case "screenbreak.statusAction":
			// The print page acts on the article tab it came from; the status card acts on its own tab.
			(message.tabId ? chrome.tabs.get(message.tabId).catch(() => null) : Promise.resolve(sender.tab)).then(tab => tab && onStatusAction(message.action, tab));
			break;
		case "screenbreak.getSaveStatus":
			sendResponse(printSaveStatuses.get(message.id) || null);
			return false;
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
	const { defaultAction, saveWhenPrinting } = await getSettings();
	chrome.contextMenus.update(MENU_PRINT, { title: PRINT_MENU_TITLES[saveWhenPrinting ? "printAndSave" : "print"] }).catch(() => {});
	await chrome.action.setPopup({ popup: defaultAction == "ask" ? "popup.html" : "" });
	// Tab-level popups outrank the global one, so tabs that had the "can't run here" popup follow too.
	for (const tabId of await getUnsupportedTabs()) {
		if (!(await chrome.action.getBadgeText({ tabId }).catch(() => ""))) {
			chrome.action.setPopup({ tabId, popup: defaultAction == "ask" ? "popup.html" : "" }).catch(() => {});
		}
	}
	await chrome.action.setTitle({ title: BUTTON_TITLES[defaultAction == "print" && saveWhenPrinting ? "printAndSave" : defaultAction] });
	for (const action of Object.keys(DEFAULT_ACTION_LABELS)) {
		chrome.contextMenus.update(MENU_DEFAULT_PREFIX + action, { checked: action == defaultAction }).catch(() => {});
	}
	chrome.contextMenus.update(MENU_STRAIGHT_AWAY, { checked: (await getSettings()).print.straightAway }).catch(() => {});
}

// "Print straight away": the button prints with the reader's settings and comes back to the article.
// The right-click menu turns it on and off, and "Choose a design, then print" always shows the print page.
async function setStraightAway(straightAway) {
	const { print } = await getSettings();
	await updateSettings({ print: { ...print, straightAway } });
}

async function createMenus() {
	const { defaultAction, saveWhenPrinting } = await getSettings();
	await chrome.contextMenus.removeAll();
	chrome.contextMenus.create({ id: MENU_SAVE, title: "Save to Screenbreak", contexts: ["action", "page"] });
	chrome.contextMenus.create({ id: MENU_PRINT, title: PRINT_MENU_TITLES[saveWhenPrinting ? "printAndSave" : "print"], contexts: ["action", "page"] });
	chrome.contextMenus.create({ id: MENU_PRINT_PREVIEW, title: "Choose a design, then print…", contexts: ["action", "page"] });
	chrome.contextMenus.create({ id: MENU_STRAIGHT_AWAY, type: "checkbox", title: "Print straight away", checked: (await getSettings()).print.straightAway, contexts: ["action"] });
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

async function runAction(action, tab, { preview = false } = {}) {
	if (!tab || runningTabs.has(tab.id)) {
		return;
	}
	runningTabs.add(tab.id);
	try {
		if (action == "print") {
			const printed = await printTab(tab, { preview });
			if ((await getSettings()).saveWhenPrinting) {
				// The print version is already open; save from the article tab while the user reads or prints.
				await saveTab(tab, { printJobId: printed.id, returnTabId: printed.tabId });
			}
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

// A background save (print and save) reports to the print page, not to the card on the article tab.
async function saveTab(tab, { printJobId, returnTabId } = {}) {
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
		if (printJobId) {
			hideStatus(tab);
			sendPrintSaveStatus(printJobId, tab.id, STATUS.captureFailed());
		} else if (!error.cannotAccessPage) {
			showStatus(tab, STATUS.captureFailed());
		}
		throw error;
	}
	const job = { tab, capture, startTime: Date.now(), printJobId, returnTabId };
	if (printJobId) {
		hideStatus(tab);
	}
	saveJobs.set(tab.id, job);
	await submitSave(job);
}

async function submitSave(job) {
	const { tab, capture } = job;
	const settings = await getSettings();
	const version = chrome.runtime.getManifest().version;
	const gzippedHTML = new Blob([base64ToBytes(capture.gzippedBase64)], { type: "application/gzip" });
	job.cancelled = false;
	report(job, job.loginTabId ? STATUS.waitingForLogin() : STATUS.uploading());
	try {
		let created = await createArticle({ serverUrl: settings.serverUrl, url: capture.url, title: capture.title, size: gzippedHTML.size, version });
		while (created.loginRequired) {
			if (!job.loginTabId) {
				// Ask first: opening a tab out of the blue is confusing.
				report(job, STATUS.loginRequired());
				return;
			}
			if (Date.now() - job.loginStartTime > MAX_LOGIN_WAIT) {
				job.loginTabId = null;
				report(job, STATUS.loginTimedOut());
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
		report(job, STATUS.uploading());
		job.result = await uploadArticle({ serverUrl: settings.serverUrl, refId: created.refId, gzippedHTML, version });
		if (job.loginTabId) {
			// Logged in from another tab: bring back the tab the user came from, so they see it was saved.
			chrome.tabs.update(job.returnTabId || tab.id, { active: true }).catch(() => {});
			job.loginTabId = null;
		}
		report(job, STATUS.saved({ title: withoutSiteName(capture.title), articleURL: job.result.articleURL, tip: await takeTip() }));
	} catch (error) {
		console.error(error); // eslint-disable-line no-console
		job.loginTabId = null;
		report(job, STATUS.saveFailed(error));
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
			report(job, STATUS.notSaved(), tab);
			break;
		case "dismiss":
			report(job, null, tab);
			break;
		case "undo":
			if (job && job.result) {
				report(job, STATUS.removing());
				try {
					const { serverUrl } = await getSettings();
					await removeArticle({ serverUrl, refId: job.result.refId });
					job.result = null;
					report(job, STATUS.removed());
				} catch (error) {
					report(job, STATUS.undoFailed(job.result.articleURL));
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

async function printTab(tab, { preview = false } = {}) {
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
	const printTab = await chrome.tabs.create({ url: chrome.runtime.getURL((preview ? "print.html?preview" : "print.html") + "#" + id), index: tab.index + 1, openerTabId: tab.id });
	return { id, tabId: printTab.id };
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

// Where a save's status goes: the print page for "print and save", otherwise the card on the article tab.
// A null status clears it.
function report(job, status, tab = job && job.tab) {
	if (job && job.printJobId) {
		sendPrintSaveStatus(job.printJobId, job.tab.id, status);
	} else if (status) {
		showStatus(tab, status);
	} else {
		hideStatus(tab);
	}
}

function sendPrintSaveStatus(printJobId, articleTabId, status) {
	const message = { method: "screenbreak.saveStatus", id: printJobId, articleTabId, status };
	printSaveStatuses.set(printJobId, message);
	chrome.runtime.sendMessage(message).catch(() => {});
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

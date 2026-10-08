// The toolbar popup: Print and Save for this page, what a click on the button does, and the account (SPEC A4).
import { getSettings, updateSettings } from "./settings.js";
import { getShortcuts, renderKeys } from "./shortcuts.js";
import { getAccount, plusURL } from "./plans.js";
import { getMe, accountPageURL, libraryURL, savedPageKey } from "./api.js";

const CONSEQUENCES = {
	ask: "Clicking the button shows this menu.",
	save: "Clicking the button saves the page straight away. To change this, right-click the button.",
	print: "Clicking the button opens the print version straight away. To change this, right-click the button.",
	printAndSave: "Clicking the button opens the print version and saves the article. To change this, right-click the button.",
	guestSave: "Save needs a free account."
};
// From 80% the library count reads in ink, not muted (never red, never a bar at 320 px).
const NEARLY_FULL = 0.8;
const MAX_EMAIL_LENGTH = 30;

const rows = Array.from(document.querySelectorAll(".row"));
const saveRow = document.querySelector(".row[data-action=save]");
const radios = document.querySelectorAll("input[name=defaultAction]");
const consequence = document.querySelector(".consequence");
const alsoSave = document.querySelector("input[name=saveWhenPrinting]");
const state = { account: { state: "guest" } };

init();

async function init() {
	const [settings, shortcuts, tab] = await Promise.all([getSettings(), getShortcuts(), getTargetTab()]);
	state.settings = settings;
	alsoSave.checked = settings.saveWhenPrinting;
	setDefaultAction(settings.defaultAction);
	document.querySelector(".account-link").href = accountPageURL(settings.serverUrl);
	document.querySelector(".library").href = libraryURL(settings.serverUrl);
	document.querySelectorAll("[data-shortcut]").forEach(element => element.append(renderKeys(shortcuts[element.dataset.shortcut])));
	const supported = !location.hash.startsWith("#unsupported") && await canRunOn(tab);
	if (!supported) {
		document.querySelector(".notice").hidden = false;
		rows.forEach(row => row.setAttribute("aria-disabled", "true"));
	}
	rows.forEach(row => row.addEventListener("click", () => runRow(row, tab)));
	// A guest sees the popup at once; the account line follows when the server answers.
	const [account, me, saved] = await Promise.all([getAccount(settings.serverUrl), getMe(settings.serverUrl), getSavedPage(tab)]);
	state.account = account;
	renderAccount(account, me || {}, saved, supported);
	setDefaultAction(document.querySelector("input[name=defaultAction]:checked").value);
	// Says the account line is final (design/capture-small.mjs waits for it).
	document.body.dataset.account = account.state;
}

async function runRow(row, tab) {
	// aria-disabled rows still take Enter and clicks; on an unsupported page they do nothing.
	if (row.getAttribute("aria-disabled") == "true") {
		return;
	}
	if (row.dataset.href) {
		chrome.tabs.create({ url: row.dataset.href });
	} else {
		await chrome.runtime.sendMessage({ method: "screenbreak.run", action: row.dataset.action, tab });
	}
	window.close();
}

// The tab the popup acts on. `?tabId=` lets the design capture open the popup in a tab of its own.
async function getTargetTab() {
	const tabId = Number(new URLSearchParams(location.search).get("tabId"));
	if (tabId) {
		return chrome.tabs.get(tabId);
	}
	return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

// Chrome's own pages, the Web Store and the PDF viewer refuse scripts; trying is the only reliable test.
async function canRunOn(tab) {
	try {
		await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => true });
		return true;
	} catch (error) {
		return false;
	}
}

// Pages saved from this browser (background.js keeps the list by a hash of the address).
async function getSavedPage(tab) {
	try {
		const { savedPages = {} } = await chrome.storage.local.get("savedPages");
		return savedPages[await savedPageKey(tab.url)] || null;
	} catch (error) {
		return null;
	}
}

// `me` holds the optional /api/v1/me/ numbers: saves_used, saves_limit (free), articles (Plus). No number shows
// when the server doesn't send it.
function renderAccount(account, me, saved, supported) {
	const guest = account.state == "guest";
	const used = Number.isFinite(me.saves_used) ? me.saves_used : null;
	const limit = Number.isFinite(me.saves_limit) ? me.saves_limit : null;
	const meter = account.state == "free" && used != null && limit ? { text: `${used} of ${limit} saved`, high: used / limit >= NEARLY_FULL, full: used >= limit } : null;
	// The switch can't work without an account, and has nothing to act on where the page can't run.
	document.querySelector(".also-save").hidden = guest || !supported;
	document.querySelector(".account-guest").hidden = !guest;
	document.querySelector(".account-member").hidden = guest;
	if (saved) {
		setSaveRow("Save to your library", `Saved ${new Date(saved.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · Open ↗`, saved.articleURL);
	} else if (meter && meter.full) {
		setSaveRow(`Your library is full (${meter.text.replace(" saved", "")})`, "Plus keeps everything", plusURL(state.settings.serverUrl));
	} else if (meter) {
		setSaveRow("Save to your library", meter.text, null, meter.high);
	} else if (!guest) {
		setSaveRow("Save to your library", "Keep it for later");
	}
	if (guest) {
		return;
	}
	const email = account.email || me.email || "";
	const emailElement = document.querySelector(".email");
	emailElement.textContent = middleTruncate(email, MAX_EMAIL_LENGTH);
	emailElement.title = email;
	document.querySelector(".plan").textContent = account.state == "plus" ? "Plus" : "Free";
	const count = document.querySelector(".count");
	const articles = Number.isFinite(me.articles) ? me.articles : null;
	count.textContent = account.state == "plus" ? (articles != null ? `${articles} article${articles == 1 ? "" : "s"}` : "") : (meter ? meter.text : "");
	count.classList.toggle("is-high", Boolean(meter && meter.high && account.state == "free"));
	count.hidden = !count.textContent;
}

function setSaveRow(title, description, href = null, high = false) {
	saveRow.querySelector(".row-title").textContent = title;
	const desc = saveRow.querySelector(".row-desc");
	desc.textContent = description;
	desc.classList.toggle("is-high", high);
	if (href) {
		saveRow.dataset.href = href;
	} else {
		delete saveRow.dataset.href;
	}
}

// "averyverylongname@example.com" keeps both ends: the start of the name and the domain.
function middleTruncate(text, max) {
	if (text.length <= max) {
		return text;
	}
	const keep = max - 1;
	return text.slice(0, Math.ceil(keep / 2)) + "…" + text.slice(text.length - Math.floor(keep / 2));
}

function setDefaultAction(value) {
	radios.forEach(radio => radio.checked = radio.value == value);
	const guest = state.account.state == "guest";
	consequence.textContent = CONSEQUENCES[value == "save" && guest ? "guestSave" : value == "print" && alsoSave.checked && !guest ? "printAndSave" : value];
}

alsoSave.addEventListener("change", () => {
	updateSettings({ saveWhenPrinting: alsoSave.checked });
	setDefaultAction(document.querySelector("input[name=defaultAction]:checked").value);
});

radios.forEach(radio => radio.addEventListener("change", () => {
	setDefaultAction(radio.value);
	updateSettings({ defaultAction: radio.value });
}));

// Up and down arrows move between Print and Save, like a menu.
document.querySelector(".actions").addEventListener("keydown", event => {
	if (event.key == "ArrowDown" || event.key == "ArrowUp") {
		event.preventDefault();
		const index = rows.indexOf(document.activeElement);
		rows[(index + (event.key == "ArrowDown" ? 1 : rows.length - 1)) % rows.length].focus();
	}
});

// The toolbar popup: Save and Print for this page, and what a click on the button does.
import { getSettings, updateSettings } from "./settings.js";
import { getShortcuts, renderKeys } from "./shortcuts.js";

const CONSEQUENCES = {
	ask: "Clicking the button shows this menu.",
	save: "Clicking the button saves the page straight away. To change this, right-click the button.",
	print: "Clicking the button opens the print version straight away. To change this, right-click the button.",
	printAndSave: "Clicking the button opens the print version and saves the article. To change this, right-click the button."
};

const rows = Array.from(document.querySelectorAll(".row"));
const radios = document.querySelectorAll("input[name=defaultAction]");
const consequence = document.querySelector(".consequence");
const alsoSave = document.querySelector("input[name=saveWhenPrinting]");

init();

async function init() {
	const [settings, shortcuts, tab] = await Promise.all([getSettings(), getShortcuts(), getTargetTab()]);
	alsoSave.checked = settings.saveWhenPrinting;
	setDefaultAction(settings.defaultAction);
	document.querySelector(".library").href = settings.serverUrl + "/articles/";
	document.querySelectorAll("[data-shortcut]").forEach(element => element.append(renderKeys(shortcuts[element.dataset.shortcut])));
	if (location.hash.startsWith("#unsupported") || !(await canRunOn(tab))) {
		document.querySelector(".notice").hidden = false;
		rows.forEach(row => row.setAttribute("aria-disabled", "true"));
	}
	rows.forEach(row => row.addEventListener("click", async () => {
		await chrome.runtime.sendMessage({ method: "screenbreak.run", action: row.dataset.action, tab });
		window.close();
	}));
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

function setDefaultAction(value) {
	radios.forEach(radio => radio.checked = radio.value == value);
	consequence.textContent = CONSEQUENCES[value == "print" && alsoSave.checked ? "printAndSave" : value];
}

alsoSave.addEventListener("change", () => {
	updateSettings({ saveWhenPrinting: alsoSave.checked });
	setDefaultAction(document.querySelector("input[name=defaultAction]:checked").value);
});

radios.forEach(radio => radio.addEventListener("change", () => {
	setDefaultAction(radio.value);
	updateSettings({ defaultAction: radio.value });
}));

// Up and down arrows move between Save and Print, like a menu.
document.querySelector(".actions").addEventListener("keydown", event => {
	if (event.key == "ArrowDown" || event.key == "ArrowUp") {
		event.preventDefault();
		const index = rows.indexOf(document.activeElement);
		rows[(index + (event.key == "ArrowDown" ? 1 : rows.length - 1)) % rows.length].focus();
	}
});

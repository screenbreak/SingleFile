// The page Chrome opens after install (and after an update from 1.x, with "What's new" on top).
import { getSettings, updateSettings } from "./settings.js";
import { getShortcuts, renderKeys, openShortcutSettings } from "./shortcuts.js";

const PIN_CHECK_INTERVAL = 1500;
const SAVED_DELAY = 1500;
const callout = document.querySelector(".pin-callout");

init();

async function init() {
	const settings = await getSettings();
	if (location.hash == "#updated") {
		document.querySelector(".intro-title").textContent = "Screenbreak 2 is here";
		document.querySelector(".intro-text").textContent = "Save works as before. Here's what's new.";
		document.querySelector(".whats-new").hidden = false;
	}
	document.querySelector(".login").href = settings.serverUrl + "/login/";
	const radios = document.querySelectorAll("input[name=defaultAction]");
	radios.forEach(radio => {
		radio.checked = radio.value == settings.defaultAction;
		radio.addEventListener("change", async () => {
			await updateSettings({ defaultAction: radio.value });
			setDone("chosen");
			const saved = document.querySelector(".saved");
			saved.textContent = "Saved";
			setTimeout(() => saved.textContent = "", SAVED_DELAY);
		});
	});
	const alsoSave = document.querySelector("input[name=saveWhenPrinting]");
	alsoSave.checked = settings.saveWhenPrinting;
	alsoSave.addEventListener("change", () => updateSettings({ saveWhenPrinting: alsoSave.checked }));
	const shortcuts = await getShortcuts();
	document.querySelectorAll("[data-shortcut]").forEach(element => {
		const keys = shortcuts[element.dataset.shortcut];
		element.replaceChildren(keys.length ? renderKeys(keys) : Object.assign(document.createElement("span"), { className: "not-set", textContent: "Not set" }));
	});
	document.querySelector(".shortcuts").addEventListener("click", openShortcutSettings);
	document.querySelector(".close-tab").addEventListener("click", async () => chrome.tabs.remove((await chrome.tabs.getCurrent()).id));
	const { tipShown } = await chrome.storage.local.get("tipShown");
	setDone("tried", Boolean(tipShown));
	chrome.storage.onChanged.addListener((changes, area) => area == "local" && changes.tipShown && setDone("tried"));
	watchPinned();
}

// Chrome tells whether the button is on the toolbar; check until it is, then put the callout away.
async function watchPinned() {
	const pinned = await isPinned();
	setDone("pinned", pinned);
	callout.hidden = pinned;
	if (!pinned) {
		setTimeout(watchPinned, PIN_CHECK_INTERVAL);
	}
}

async function isPinned() {
	try {
		return (await chrome.action.getUserSettings()).isOnToolbar;
	} catch (error) {
		return false;
	}
}

function setDone(name, done = true) {
	document.querySelector(`[data-check=${name}]`).classList.toggle("is-done", Boolean(done));
}

// Settings. Every change saves straight away; "Saved" shows for a moment next to the control that changed.
import { getSettings, updateSettings, DEFAULT_SETTINGS } from "./settings.js";
import { getShortcuts, renderKeys, openShortcutSettings } from "./shortcuts.js";

const DEFAULT_DESCRIPTIONS = {
	ask: "Shows a small menu with Save and Print.",
	save: "Saves the page to your Screenbreak account straight away.",
	print: "Opens the clean print version straight away."
};
const SAVED_DELAY = 1500;
const UNDO_DELAY = 6000;

const form = document.querySelector("form");

init();

async function init() {
	fill(await getSettings());
	renderShortcuts();
	document.querySelector(".version").textContent = "Screenbreak " + chrome.runtime.getManifest().version;
}

function fill(settings) {
	form.elements.defaultAction.value = settings.defaultAction;
	form.elements.font.value = settings.print.font;
	form.elements.size.value = settings.print.size;
	form.elements.columns.value = String(settings.print.columns);
	form.elements.images.checked = settings.print.images;
	form.elements.openPrintDialog.checked = settings.print.openPrintDialog;
	form.elements.serverUrl.value = settings.serverUrl;
	document.querySelector("#default-desc").textContent = DEFAULT_DESCRIPTIONS[settings.defaultAction];
	document.querySelector(".library").href = settings.serverUrl + "/articles/";
}

// Chrome owns the shortcuts: read them again whenever the user comes back from chrome://extensions/shortcuts.
async function renderShortcuts() {
	const shortcuts = await getShortcuts();
	document.querySelectorAll("[data-shortcut]").forEach(element => {
		const keys = shortcuts[element.dataset.shortcut];
		if (keys.length) {
			element.replaceChildren(renderKeys(keys));
		} else {
			const notSet = document.createElement("span");
			notSet.className = "not-set";
			notSet.textContent = "Not set";
			element.replaceChildren(notSet);
		}
	});
}
addEventListener("focus", renderShortcuts);

// The default action can also be changed from the popup or the button's right-click menu.
chrome.storage.onChanged.addListener((changes, area) => {
	if (area == "sync" && changes.defaultAction) {
		form.elements.defaultAction.value = changes.defaultAction.newValue;
		document.querySelector("#default-desc").textContent = DEFAULT_DESCRIPTIONS[changes.defaultAction.newValue];
	}
});

form.addEventListener("change", async event => {
	const settings = await getSettings();
	await updateSettings({
		defaultAction: form.elements.defaultAction.value,
		serverUrl: form.elements.serverUrl.checkValidity() ? form.elements.serverUrl.value : settings.serverUrl || DEFAULT_SETTINGS.serverUrl,
		print: {
			...settings.print,
			font: form.elements.font.value,
			size: form.elements.size.value,
			columns: Number(form.elements.columns.value),
			images: form.elements.images.checked,
			openPrintDialog: form.elements.openPrintDialog.checked
		}
	});
	fill(await getSettings());
	const saved = event.target.closest(".row")?.querySelector(".saved");
	if (saved) {
		saved.textContent = "Saved";
		clearTimeout(saved.timeout);
		saved.timeout = setTimeout(() => saved.textContent = "", SAVED_DELAY);
	}
});

document.querySelector(".shortcuts").addEventListener("click", openShortcutSettings);

// Reset needs no confirmation: it can be undone for a few seconds. Login and shortcuts are left alone.
document.querySelector(".reset").addEventListener("click", async () => {
	const previous = await getSettings();
	await updateSettings({ defaultAction: DEFAULT_SETTINGS.defaultAction, serverUrl: DEFAULT_SETTINGS.serverUrl, print: DEFAULT_SETTINGS.print });
	fill(await getSettings());
	const area = document.querySelector(".reset-area");
	const resetButton = area.firstElementChild;
	const undo = document.createElement("span");
	undo.innerHTML = `Settings reset. <button type="button" class="link-button">Undo</button>`;
	area.replaceChildren(undo);
	const restore = () => area.replaceChildren(resetButton);
	const timeout = setTimeout(restore, UNDO_DELAY);
	undo.querySelector("button").addEventListener("click", async () => {
		clearTimeout(timeout);
		await updateSettings(previous);
		fill(await getSettings());
		restore();
	});
});

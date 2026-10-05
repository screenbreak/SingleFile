import { getSettings, updateSettings, DEFAULT_SETTINGS } from "./settings.js";

const form = document.querySelector("form");
const savedElement = document.querySelector(".saved");

getSettings().then(settings => {
	form.elements.defaultAction.value = settings.defaultAction;
	form.elements.font.value = settings.print.font;
	form.elements.size.value = settings.print.size;
	form.elements.columns.value = String(settings.print.columns);
	form.elements.images.checked = settings.print.images;
	form.elements.openPrintDialog.checked = settings.print.openPrintDialog;
	form.elements.serverUrl.value = settings.serverUrl;
});

// The default action can also be changed from the popup or the button's right-click menu.
chrome.storage.onChanged.addListener((changes, area) => {
	if (area == "sync" && changes.defaultAction) {
		form.elements.defaultAction.value = changes.defaultAction.newValue;
	}
});

form.addEventListener("change", async () => {
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
	savedElement.textContent = "Saved";
	setTimeout(() => savedElement.textContent = "", 1500);
});

document.querySelector(".shortcuts").addEventListener("click", event => {
	event.preventDefault();
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

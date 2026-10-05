// The menu shown when the default action is "ask".
import { getSettings, updateSettings } from "./settings.js";

const select = document.querySelector("select[name=defaultAction]");

getSettings().then(settings => select.value = settings.defaultAction);

select.addEventListener("change", () => updateSettings({ defaultAction: select.value }));

document.querySelectorAll("button[data-action]").forEach(button => button.addEventListener("click", async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	await chrome.runtime.sendMessage({ method: "screenbreak.run", action: button.dataset.action, tab });
	window.close();
}));

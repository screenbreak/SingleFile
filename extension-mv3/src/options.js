// Settings, in the print page's frame: the sample article on the desk shows every change as it will print.
// Every change saves straight away.
import { getSettings, updateSettings, DEFAULT_SETTINGS } from "./settings.js";
import { getShortcuts, renderKeys, openShortcutSettings } from "./shortcuts.js";
import { prepare, compose } from "./engine/layout.js";
import { sanitize } from "./engine/sanitize.js";
import { DESIGNS, PICTURES, REFERENCES, PAPER, sentence, topPicks } from "./designs.js";
import { getAccount, getQuota, resetQuota } from "./plans.js";
import { Desk } from "./desk.js";
import { fillSegmented, designTile, renderQuota, renderAccount, renderWho } from "./panel.js";

const DEFAULT_DESCRIPTIONS = {
	ask: "Shows a small menu with Save and Print.",
	save: "Saves the page to your Screenbreak account straight away.",
	print: "Prints the article straight away."
};
const SAVED_DELAY = 1500;
const UNDO_DELAY = 6000;

const form = document.querySelector("form");
const desk = new Desk(document.querySelector(".sheets"));
let sample;

init();

async function init() {
	const settings = await getSettings();
	fill(settings);
	renderShortcuts();
	document.querySelector(".version").textContent = "Screenbreak " + chrome.runtime.getManifest().version;
	renderAccountSection(settings);
	sample = loadSample();
	showSample(settings);
}

async function loadSample() {
	const article = await (await fetch("sample/article.json")).json();
	const html = article.content.replaceAll("{{extension}}", chrome.runtime.getURL("").replace(/\/$/, ""));
	return prepare({ ...article, content: sanitize(html, article.url) });
}

function fill(settings) {
	const { print } = settings;
	form.elements.defaultAction.value = settings.defaultAction;
	form.elements.saveWhenPrinting.checked = settings.saveWhenPrinting;
	form.elements.serverUrl.value = settings.serverUrl;
	form.querySelector(`input[name=straightAway][value=${print.straightAway ? "straight" : "page"}]`).checked = true;
	form.querySelector(`input[name=designMode][value=${print.design == "best" ? "best" : "fixed"}]`).checked = true;
	form.elements.duplex.checked = print.duplex;
	document.querySelector("#default-desc").textContent = DEFAULT_DESCRIPTIONS[settings.defaultAction];
	document.querySelector(".mode-help").textContent = print.straightAway
		? "To pick a design for one article, right-click the button and choose “Choose a design, then print”."
		: "You can switch to printing straight away from the print page too.";
	fillSegmented(form.querySelector("[data-name=pictures]"), PICTURES, print.pictures);
	fillSegmented(form.querySelector("[data-name=references]"), REFERENCES, print.references);
	fillSegmented(form.querySelector("[data-name=paper]"), PAPER, print.paper);
	form.querySelector(".pictures-help").textContent = PICTURES[print.pictures].help;
	const grid = form.querySelector(".design-grid");
	grid.replaceChildren(...Object.keys(DESIGNS).map(style => designTile({ style, checked: print.design == style, isDefault: false })));
}

// The sample shows the reader's design, or in "best match" mode the sample's own best match.
async function showSample(settings) {
	const prepared = await sample;
	const best = topPicks(prepared)[0];
	const style = settings.print.design != "best" && DESIGNS[settings.print.design] ? settings.print.design : best.style;
	const choice = { style, pictures: settings.print.pictures, references: settings.print.references, paper: settings.print.paper };
	const entry = await desk.show([style, choice.pictures, choice.references, choice.paper].join("|"), compose(prepared, choice));
	form.querySelector(".design-help").textContent = settings.print.design == "best"
		? `Best match for this sample: ${DESIGNS[style].name}. ${sentence(best.why)}`
		: `${DESIGNS[style].name}: ${DESIGNS[style].line} The sample prints on ${entry.pages} page${entry.pages > 1 ? "s" : ""}.`;
}

async function renderAccountSection(settings) {
	const account = await getAccount(settings.serverUrl);
	const quota = await getQuota(account);
	renderWho(document.querySelector(".who"), account, settings.serverUrl);
	renderQuota(document.querySelector(".quota"), quota);
	renderAccount(document.querySelector(".account"), { account, quota, serverUrl: settings.serverUrl });
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

// The default action and "print straight away" can also change from the popup, the print page or the
// button's right-click menu.
chrome.storage.onChanged.addListener((changes, area) => {
	if (area == "sync" && (changes.defaultAction || changes.saveWhenPrinting || changes.print)) {
		getSettings().then(settings => {
			fill(settings);
			showSample(settings);
		});
	}
});

form.addEventListener("change", async event => {
	const target = event.target;
	if (target.name == "view") {
		return;
	}
	const settings = await getSettings();
	let design = settings.print.design;
	if (target.name == "design") {
		design = target.value;
	} else if (target.name == "designMode") {
		design = target.value == "best" ? "best" : (DESIGNS[settings.print.design] ? settings.print.design : topPicks(await sample)[0].style);
	}
	await updateSettings({
		defaultAction: form.elements.defaultAction.value,
		saveWhenPrinting: form.elements.saveWhenPrinting.checked,
		serverUrl: form.elements.serverUrl.checkValidity() ? form.elements.serverUrl.value : settings.serverUrl || DEFAULT_SETTINGS.serverUrl,
		print: {
			...settings.print,
			design,
			pictures: form.querySelector("input[name=pictures]:checked")?.value || settings.print.pictures,
			references: form.querySelector("input[name=references]:checked")?.value || settings.print.references,
			paper: form.querySelector("input[name=paper]:checked")?.value || settings.print.paper,
			duplex: form.elements.duplex.checked,
			straightAway: form.querySelector("input[name=straightAway]:checked")?.value == "straight"
		}
	});
	const updated = await getSettings();
	fill(updated);
	showSample(updated);
	if (target.name == "serverUrl") {
		renderAccountSection(updated);
	}
	const saved = target.closest(".sec")?.querySelector(".saved");
	if (saved) {
		saved.textContent = "Saved";
		clearTimeout(saved.timeout);
		saved.timeout = setTimeout(() => saved.textContent = "", SAVED_DELAY);
	}
});

document.querySelectorAll("input[name=view]").forEach(input => input.addEventListener("change", () => desk.setSpread(input.value == "spread" && input.checked)));
document.querySelector(".shortcuts").addEventListener("click", openShortcutSettings);
document.querySelector(".reset-prints").addEventListener("click", async () => {
	await resetQuota();
	renderAccountSection(await getSettings());
});

// Reset needs no confirmation: it can be undone for a few seconds. Login and shortcuts are left alone.
document.querySelector(".reset").addEventListener("click", async () => {
	const previous = await getSettings();
	await updateSettings({ defaultAction: DEFAULT_SETTINGS.defaultAction, saveWhenPrinting: DEFAULT_SETTINGS.saveWhenPrinting, serverUrl: DEFAULT_SETTINGS.serverUrl, print: DEFAULT_SETTINGS.print });
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

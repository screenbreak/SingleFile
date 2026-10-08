// Settings, in the print page's frame: the sample article on the desk shows every change as it will print.
// Every change saves straight away. For a guest, the same locks as on the print page: a locked design or option
// previews on the sample and is never saved; the door is the Account section's card.
import { getSettings, updateSettings, DEFAULT_SETTINGS } from "./settings.js";
import { getShortcuts, renderKeys, openShortcutSettings } from "./shortcuts.js";
import { prepare, compose } from "./engine/layout.js";
import { sanitize } from "./engine/sanitize.js";
import { DESIGNS, PICTURES, REFERENCES, PAPER, sentence, topPicks } from "./designs.js";
import { getAccount, canUse, libraryURL } from "./plans.js";
import { Desk } from "./desk.js";
import { el, fillSegmented, designTile, lockIcon, renderWho, renderDoor, loadDone } from "./panel.js";

const DEFAULT_DESCRIPTIONS = {
	ask: "Shows a small menu with Save and Print.",
	save: "Saves the page to your Screenbreak account straight away.",
	print: "Prints the article straight away."
};
const SAVED_DELAY = 1500;
const UNDO_DELAY = 6000;
const FRIEND_LINK = "https://myscreenbreak.com/?from=friend";

const form = document.querySelector("form");
const desk = new Desk(document.querySelector(".sheets"));
let sample;
let account = { state: "guest" };
// What the sample shows on top of the saved settings: a locked design or option a guest is trying.
let preview = {};
let door = null;

init();

async function init() {
	const settings = await getSettings();
	sample = loadSample();
	account = await getAccount(settings.serverUrl);
	fill(settings);
	renderShortcuts();
	document.querySelector(".version").textContent = "Screenbreak " + chrome.runtime.getManifest().version;
	renderAccountSection(settings);
	renderShare();
	renderPrints();
	showSample(settings);
}

async function loadSample() {
	const article = await (await fetch("sample/article.json")).json();
	const html = article.content.replaceAll("{{extension}}", chrome.runtime.getURL("").replace(/\/$/, ""));
	return prepare({ ...article, content: sanitize(html, article.url) });
}

const isGuest = () => account.state == "guest";
// In Settings a guest's design is always each article's pick, so every fixed design is a preview.
const isOpen = (kind, value) => kind == "design" ? !isGuest() : canUse(account, kind, value);

function fill(settings) {
	const { print } = settings;
	const guest = isGuest();
	form.elements.defaultAction.value = settings.defaultAction;
	form.elements.saveWhenPrinting.checked = settings.saveWhenPrinting;
	form.elements.serverUrl.value = settings.serverUrl;
	form.querySelector(`input[name=straightAway][value=${print.straightAway ? "straight" : "page"}]`).checked = true;
	const design = guest ? "best" : print.design;
	form.querySelector(`input[name=designMode][value=${design == "best" ? "best" : "fixed"}]`).checked = true;
	const fixed = form.querySelector(".design-fixed");
	fixed.toggleAttribute("data-locked", guest);
	fixed.querySelector("strong").replaceChildren("The same design every time", guest ? lockIcon(12) : "");
	fixed.querySelector("input").setAttribute("aria-describedby", guest ? "lock-line" : "");
	document.querySelector("#default-desc").textContent = DEFAULT_DESCRIPTIONS[settings.defaultAction];
	document.querySelector(".mode-help").textContent = print.straightAway
		? "To pick a design for one article, right-click the button and choose “Choose a design, then print”."
		: "You can switch to printing straight away from the print page too.";
	const locked = (choices, kind) => Object.keys(choices).filter(value => !isOpen(kind, value));
	fillSegmented(form.querySelector("[data-name=pictures]"), PICTURES, preview.pictures || clampValue("pictures", print.pictures), { locked: locked(PICTURES, "pictures"), describedBy: "lock-line" });
	fillSegmented(form.querySelector("[data-name=references]"), REFERENCES, preview.references || clampValue("references", print.references), { locked: locked(REFERENCES, "references"), describedBy: "lock-line" });
	fillSegmented(form.querySelector("[data-name=paper]"), PAPER, print.paper);
	document.querySelector("#lock-line").hidden = !guest;
	updateHelp(settings);
	const grid = form.querySelector(".design-grid");
	grid.replaceChildren(...Object.keys(DESIGNS).map(style => designTile({
		style, checked: (preview.design || (guest ? null : print.design)) == style, locked: guest, describedBy: "lock-line"
	})));
}

const clampValue = (kind, value) => isOpen(kind, value) ? value : DEFAULT_SETTINGS.print[kind];

function updateHelp(settings) {
	const pictures = preview.pictures || clampValue("pictures", settings.print.pictures);
	form.querySelector(".pictures-help").textContent = preview.pictures ? "Ink saver prints photos as light dots. It comes with a free account." : PICTURES[pictures].help;
	form.querySelector(".references-help").textContent = preview.references
		? `${REFERENCES[preview.references].label}: shown on the sample. It comes with a free account.`
		: "Some pages end with hundreds of references. A Wikipedia biography can run to 40 pages of them.";
}

// The sample shows the reader's design, or in "best match" mode the sample's own best match, plus any preview.
async function showSample(settings) {
	const prepared = await sample;
	const best = topPicks(prepared)[0];
	const saved = !isGuest() && settings.print.design != "best" && DESIGNS[settings.print.design] ? settings.print.design : best.style;
	const style = preview.design || saved;
	const choice = {
		style,
		pictures: preview.pictures || clampValue("pictures", settings.print.pictures),
		references: preview.references || clampValue("references", settings.print.references),
		paper: settings.print.paper
	};
	const entry = await desk.show([style, choice.pictures, choice.references, choice.paper].join("|"), compose(prepared, choice));
	form.querySelector(".design-help").textContent = preview.design
		? `Previewing ${DESIGNS[style].name} on the sample. It needs a free account.`
		: settings.print.design == "best" || isGuest()
			? `Best match for this sample: ${DESIGNS[style].name}. ${sentence(best.why)}`
			: `${DESIGNS[style].name}: ${DESIGNS[style].line} The sample prints on ${entry.pages} page${entry.pages > 1 ? "s" : ""}.`;
}

// Account: a guest sees the door; an account sees its email and the library meter when the server sends it.
function renderAccountSection(settings) {
	renderWho(document.querySelector(".who"), account, settings.serverUrl);
	const container = document.querySelector(".account");
	const doorSlot = document.querySelector(".account-door");
	if (isGuest()) {
		container.replaceChildren();
		openDoor(settings);
		return;
	}
	if (door) door.close();
	door = null;
	doorSlot.hidden = true;
	const meter = account.savesLimit ? `${account.savesUsed || 0} of ${account.savesLimit} saved · ` : "";
	container.replaceChildren(el("div", { class: "account-row" },
		el("p", { class: "account-email" }, el("span", { text: account.email || account.name }), el("span", { class: "plan", text: account.state == "plus" ? "Plus" : "Free" })),
		el("p", { class: "help" }, meter, el("a", { href: libraryURL(settings.serverUrl), target: "_blank", text: "Open my library ↗" }))));
}

function openDoor(settings, { focus = false } = {}) {
	const entry = preview.design ? "design" : preview.pictures || preview.references ? "option" : "account";
	const option = preview.pictures ? { name: "pictures", value: preview.pictures } : preview.references ? { name: "references", value: preview.references } : null;
	if (door) door.close();
	door = renderDoor(document.querySelector(".account-door"), {
		entry,
		design: preview.design ? DESIGNS[preview.design].name : "",
		serverUrl: settings.serverUrl,
		intent: preview.design ? { kind: "design", design: preview.design, sourceUrl: location.href, title: "Settings" }
			: option ? { kind: "option", option, sourceUrl: location.href, title: "Settings" }
				: { kind: "design", sourceUrl: location.href, title: "Settings" },
		exit: false,
		onCancel: () => { door = null; getSettings().then(updated => openDoor(updated)); },
		onSignedIn: async (signedIn, intent) => {
			door = null;
			account = signedIn;
			// The design or option the guest was trying becomes their setting.
			const current = await getSettings();
			const print = { ...current.print };
			if (intent.kind == "design" && DESIGNS[intent.design]) print.design = intent.design;
			if (intent.kind == "option" && intent.option && ["pictures", "references"].includes(intent.option.name)) print[intent.option.name] = intent.option.value;
			preview = {};
			await updateSettings({ print });
			const updated = await getSettings();
			fill(updated);
			showSample(updated);
			renderAccountSection(updated);
		}
	});
	if (focus) {
		document.querySelector(".account-door").scrollIntoView({ block: "nearest", behavior: "smooth" });
		door.focus();
	}
}

// Rate and tell a friend (C1, C5).
function renderShare() {
	document.querySelector(".rate-link").href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
	const copied = document.querySelector(".copied");
	document.querySelector(".copy-link").addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(FRIEND_LINK);
			copied.textContent = "Link copied";
		} catch (error) {
			copied.textContent = FRIEND_LINK;
		}
		clearTimeout(copied.timeout);
		copied.timeout = setTimeout(() => copied.textContent = "", 2500);
	});
}

// "Your prints": the milestone ladder (done.js, from a parallel branch; the section stays hidden without it).
async function renderPrints() {
	const section = document.querySelector(".your-prints");
	try {
		const { renderYourPrints } = await loadDone();
		await renderYourPrints(section.querySelector(".your-prints-body"));
		section.hidden = false;
	} catch (error) {
		section.hidden = true;
	}
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
	// A guest's locked value only previews on the sample; nothing locked is saved.
	if (isGuest() && (target.name == "design" || target.name == "designMode" || ["pictures", "references"].includes(target.name))) {
		if (target.name == "designMode") {
			form.querySelector("input[name=designMode][value=best]").checked = true;
			if (target.value == "fixed") openDoor(settings, { focus: true });
			return;
		}
		const kind = target.name;
		preview = { ...preview, [kind]: isOpen(kind, target.value) ? undefined : target.value };
		if (kind == "design") preview.design = target.value;
		if (!isOpen(kind, target.value) || kind == "design") {
			updateHelp(settings);
			await showSample(settings);
			openDoor(settings);
			return;
		}
	}
	let design = settings.print.design;
	if (target.name == "design") {
		design = target.value;
	} else if (target.name == "designMode") {
		design = target.value == "best" ? "best" : (DESIGNS[settings.print.design] ? settings.print.design : topPicks(await sample)[0].style);
	}
	const value = name => {
		const checked = form.querySelector(`input[name=${name}]:checked`)?.value;
		return checked && isOpen(name, checked) ? checked : settings.print[name];
	};
	await updateSettings({
		defaultAction: form.elements.defaultAction.value,
		saveWhenPrinting: form.elements.saveWhenPrinting.checked,
		serverUrl: form.elements.serverUrl.checkValidity() ? form.elements.serverUrl.value : settings.serverUrl || DEFAULT_SETTINGS.serverUrl,
		print: {
			...settings.print,
			design: isGuest() ? settings.print.design : design,
			pictures: value("pictures"),
			references: value("references"),
			paper: value("paper"),
			straightAway: form.querySelector("input[name=straightAway]:checked")?.value == "straight"
		}
	});
	const updated = await getSettings();
	if (target.name == "serverUrl") {
		account = await getAccount(updated.serverUrl);
		renderAccountSection(updated);
	}
	fill(updated);
	showSample(updated);
	const saved = target.closest(".sec")?.querySelector(".saved");
	if (saved) {
		saved.textContent = "Saved";
		clearTimeout(saved.timeout);
		saved.timeout = setTimeout(() => saved.textContent = "", SAVED_DELAY);
	}
});

document.querySelector(".lock-continue").addEventListener("click", async () => openDoor(await getSettings(), { focus: true }));
document.querySelectorAll("input[name=view]").forEach(input => input.addEventListener("change", () => desk.setSpread(input.value == "spread" && input.checked)));
document.querySelector(".shortcuts").addEventListener("click", openShortcutSettings);

// Reset needs no confirmation: it can be undone for a few seconds. Login and shortcuts are left alone.
document.querySelector(".reset").addEventListener("click", async () => {
	const previous = await getSettings();
	preview = {};
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

// The print page: the article set in our designs, page by page exactly as it prints, with the choices that
// change it beside it. Opens when the reader presses Print; with "Print straight away" it opens the print
// dialog by itself and goes back to the article afterwards.
import { getSettings, updateSettings } from "./settings.js";
import { prepare, compose, hasLongReferences } from "./engine/layout.js";
import { sanitize, removeRepeatedByline, showExcerpt } from "./engine/sanitize.js";
import { DESIGNS, PICTURES, REFERENCES, topPicks } from "./designs.js";
import { getAccount, getQuota, countPrint } from "./plans.js";
import { Desk } from "./desk.js";
import { el, fillSegmented, setRadio, pickOption, designTile, renderQuota, renderAccount, renderWho, Wait, thumbURL } from "./panel.js";

const MIN_ARTICLE_TEXT = 140;

const panel = document.querySelector(".panel");
const printButton = document.querySelector(".print-button");
const pdfButton = document.querySelector(".pdf-button");
const desk = new Desk(document.querySelector(".sheets"));
const deskElement = document.querySelector(".desk");

const state = { prepared: null, settings: null, account: { state: "guest" }, quota: null, choice: null, remember: false, previewOnly: false, article: null };

init();

async function init() {
	const id = location.hash.substring(1);
	state.previewOnly = new URLSearchParams(location.search).has("preview");
	initCloseTab();
	const [article, settings] = await Promise.all([chrome.runtime.sendMessage({ method: "screenbreak.getPrintJob", id }), getSettings()]);
	state.settings = settings;
	if (!article) {
		const { printJobSources = {} } = await chrome.storage.local.get("printJobSources");
		const source = printJobSources[id];
		showMessage({
			title: "This print preview has expired",
			text: "Screenbreak keeps an article only until Chrome closes. Go back to the article and click Print again.",
			action: source && { label: "Open the article", url: source.url }
		});
		return;
	}
	state.article = article;
	document.title = article.title;
	document.querySelector(".source-title").textContent = article.title;
	document.querySelector(".source-site").textContent = article.siteName ? "· " + article.siteName : "";
	const wait = new Wait(document.querySelector(".wait"));
	wait.step(`Read the article from ${article.siteName || "the page"}`);
	const content = sanitize(article.content, article.url);
	removeRepeatedByline(content, article.byline);
	if (content.textContent.trim().length < MIN_ARTICLE_TEXT && !content.querySelector("img")) {
		wait.hide();
		showMessage({
			title: "There's no article to print",
			text: "Screenbreak couldn't find the text of this page. Go back to the page to print it as it is.",
			action: { label: "Back to the page", url: article.url }
		});
		return;
	}
	const accountPromise = getAccount(settings.serverUrl);
	state.prepared = await prepare({ ...article, excerpt: showExcerpt(article, content) ? article.excerpt : "", content });
	const pictureCount = Object.values(state.prepared.byId).filter(v => !v.broken).length;
	wait.step(pictureCount ? `Kept ${pictureCount} picture${pictureCount > 1 ? "s" : ""} at print size` : "Set the text without pictures");
	const picks = topPicks(state.prepared);
	const print = settings.print;
	const fixed = print.design != "best" && DESIGNS[print.design] ? print.design : null;
	state.choice = { style: fixed || picks[0].style, pictures: print.pictures, references: print.references, duplex: print.duplex };
	state.remember = false;
	wait.step(`Picked ${DESIGNS[state.choice.style].name}${fixed ? ", your design" : " for this article"}`);
	state.account = await accountPromise;
	state.quota = await getQuota(state.account);
	renderPanel();
	await showChoice();
	wait.step(`Set it on ${desk.current.pages} A4 page${desk.current.pages > 1 ? "s" : ""}`);
	await wait.done();
	document.body.classList.remove("is-loading");
	// The other picks render in the background, so switching to one is instant and its page count shows.
	for (const pick of picks) {
		renderDesign(pick.style).then(entry => updatePageCounts()).catch(() => {});
	}
	watchSave(id);
	if (print.straightAway && !state.previewOnly) {
		printNow({ straightAway: true });
	}
}

// Documents are kept per design and per picture and reference setting.
function keyFor({ style, pictures, references }) {
	return [style, pictures, references].join("|");
}

function renderDesign(style) {
	const choice = { ...state.choice, style };
	return desk.render(keyFor(choice), compose(state.prepared, choice));
}

async function showChoice() {
	deskElement.classList.add("swapping");
	printButton.disabled = pdfButton.disabled = true;
	try {
		await desk.show(keyFor(state.choice), compose(state.prepared, state.choice));
	} finally {
		deskElement.classList.remove("swapping");
	}
	updatePageCounts();
	updateSummary();
	updatePrintButton();
}

// Panel

function renderPanel() {
	const { prepared, choice, settings } = state;
	const picks = topPicks(prepared);
	const isDefault = style => settings.print.design == style;
	document.querySelector(".picks").replaceChildren(...picks.map((pick, index) =>
		pickOption({ style: pick.style, why: pick.why, best: index == 0, isDefault: isDefault(pick.style), checked: pick.style == choice.style })));
	const pickStyles = picks.map(pick => pick.style);
	const others = Object.keys(DESIGNS).filter(style => !pickStyles.includes(style));
	const grid = document.querySelector(".design-grid");
	grid.replaceChildren(...others.map(style => designTile({ style, checked: style == choice.style, isDefault: isDefault(style) })));
	if (!pickStyles.includes(choice.style)) {
		setGridOpen(true);
	}
	fillSegmented(panel.querySelector("[data-name=pictures]"), PICTURES, choice.pictures);
	fillSegmented(panel.querySelector("[data-name=references]"), REFERENCES, choice.references);
	panel.querySelector(".references-opt").hidden = !hasLongReferences(prepared);
	panel.querySelector("input[name=duplex]").checked = choice.duplex;
	panel.querySelector(".straight-note").hidden = !settings.print.straightAway;
	renderWho(panel.querySelector(".who"), state.account, settings.serverUrl);
	renderAccount(panel.querySelector(".account"), { account: state.account, quota: state.quota, serverUrl: settings.serverUrl, onDismiss: () => {} });
	renderQuota(panel.querySelector(".quota"), state.quota);
	updateHelp();
	updateRemember();
}

function setGridOpen(open) {
	const toggle = document.querySelector(".all-toggle");
	document.querySelector(".design-grid").hidden = !open;
	toggle.setAttribute("aria-expanded", String(open));
	toggle.textContent = open ? "Show fewer designs" : `See all ${Object.keys(DESIGNS).length} designs`;
}
setGridOpen(false);
document.querySelector(".all-toggle").addEventListener("click", () => setGridOpen(document.querySelector(".design-grid").hidden));

function updateHelp() {
	panel.querySelector(".pictures-help").textContent = PICTURES[state.choice.pictures].help;
	panel.querySelector(".references-help").textContent = REFERENCES[state.choice.references].help;
}

function updatePageCounts() {
	for (const pick of document.querySelectorAll(".pick")) {
		const frame = desk.frames.get(keyFor({ ...state.choice, style: pick.dataset.style }));
		pick.querySelector(".pages").textContent = frame && frame.pages ? `${frame.pages} page${frame.pages > 1 ? "s" : ""}` : "";
	}
}

function updateSummary() {
	const pages = desk.current.pages;
	const minutes = state.prepared.facts.minutes;
	document.querySelector(".summary").textContent = `${pages} A4 page${pages > 1 ? "s" : ""} · about ${minutes} minute${minutes > 1 ? "s" : ""} to read`;
	const sheets = state.choice.duplex ? Math.ceil(pages / 2) : pages;
	document.querySelector(".sheet-count").textContent = `${sheets} sheet${sheets > 1 ? "s" : ""} of paper`;
	document.querySelector(".duplex-hint").hidden = !state.choice.duplex || pages < 2;
}

function updatePrintButton() {
	const pages = desk.current ? desk.current.pages : 0;
	const out = state.quota && !state.quota.unlimited && state.quota.left <= 0;
	printButton.disabled = pdfButton.disabled = out || !pages;
	document.querySelector(".print-label").textContent = pages ? `Print ${pages} page${pages > 1 ? "s" : ""}` : "Print";
}

function updateRemember() {
	const { settings, choice } = state;
	panel.querySelector("input[name=remember]").checked = state.remember;
	panel.querySelector(".remember-more").hidden = !state.remember;
	panel.querySelector(".fixed-name").textContent = DESIGNS[choice.style].name;
	setRadio(panel.querySelector(".remember-more"), null);
	panel.querySelector(`input[name=rememberDesign][value=${settings.print.design == "best" ? "best" : "fixed"}]`).checked = true;
	panel.querySelector(`input[name=rememberMode][value=${settings.print.straightAway ? "straight" : "page"}]`).checked = true;
}

// While "Remember these choices" is ticked, the page's choices are the defaults.
async function saveDefaults() {
	if (!state.remember) {
		return;
	}
	const fixed = panel.querySelector("input[name=rememberDesign]:checked").value == "fixed";
	const print = {
		...state.settings.print,
		design: fixed ? state.choice.style : "best",
		pictures: state.choice.pictures,
		references: state.choice.references,
		duplex: state.choice.duplex,
		straightAway: panel.querySelector("input[name=rememberMode]:checked").value == "straight"
	};
	state.settings = { ...state.settings, print };
	await updateSettings({ print });
	panel.querySelector(".straight-note").hidden = !print.straightAway;
	document.querySelectorAll(".pick, .tile").forEach(option => {
		const isDefault = print.design == option.dataset.style;
		const badge = Array.from(option.querySelectorAll(".badge")).find(badge => /default/i.test(badge.textContent));
		if (isDefault && !badge) {
			(option.querySelector(".name") || option.querySelector(".thumb")).append(el("span", { class: "badge", text: option.classList.contains("tile") ? "Default" : "Your default" }));
		} else if (!isDefault && badge) {
			badge.remove();
		}
	});
}

panel.addEventListener("change", async event => {
	const target = event.target;
	if (target.name == "design") {
		document.querySelectorAll("input[name=design]").forEach(input => input.checked = input.value == target.value);
		state.choice.style = target.value;
		panel.querySelector(".fixed-name").textContent = DESIGNS[target.value].name;
		await showChoice();
	} else if (target.name == "pictures" || target.name == "references") {
		state.choice[target.name] = target.value;
		updateHelp();
		await showChoice();
		state.prepared.picks.slice(0, 3).forEach(pick => DESIGNS[pick.style] && renderDesign(pick.style).then(updatePageCounts).catch(() => {}));
	} else if (target.name == "duplex") {
		state.choice.duplex = target.checked;
		updateSummary();
	} else if (target.name == "remember") {
		state.remember = target.checked;
		panel.querySelector(".remember-more").hidden = !state.remember;
		if (state.remember) {
			panel.querySelector("input[name=rememberDesign][value=fixed]").checked = true;
		}
	}
	await saveDefaults();
});

document.querySelector(".show-page-next").addEventListener("click", async () => {
	state.settings = { ...state.settings, print: { ...state.settings.print, straightAway: false } };
	await updateSettings({ print: state.settings.print });
	panel.querySelector(".straight-note").hidden = true;
	updateRemember();
});

document.querySelectorAll("input[name=view]").forEach(input => input.addEventListener("change", () => desk.setSpread(input.value == "spread" && input.checked)));

// Printing

printButton.addEventListener("click", () => printNow());
pdfButton.addEventListener("click", () => printNow());
addEventListener("keydown", event => {
	if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() == "p") {
		event.preventDefault();
		printNow();
	}
});

async function printNow({ straightAway = false } = {}) {
	if (printButton.getAttribute("aria-busy") == "true" || !desk.current) {
		return;
	}
	if (state.quota && !state.quota.unlimited && state.quota.left <= 0) {
		panel.querySelector(".account").scrollIntoView({ behavior: "smooth", block: "nearest" });
		return;
	}
	printButton.setAttribute("aria-busy", "true");
	await countPrint(state.account);
	await desk.print();
	printButton.removeAttribute("aria-busy");
	state.quota = await getQuota(state.account);
	renderQuota(panel.querySelector(".quota"), state.quota);
	renderAccount(panel.querySelector(".account"), { account: state.account, quota: state.quota, serverUrl: state.settings.serverUrl, onDismiss: () => {} });
	updatePrintButton();
	if (straightAway) {
		// The button works as a printer: back to the article once the dialog closes.
		const tab = await chrome.tabs.getCurrent();
		if (tab && tab.openerTabId) {
			await chrome.tabs.update(tab.openerTabId, { active: true }).catch(() => {});
			chrome.tabs.remove(tab.id);
			return;
		}
	}
	if (state.account.state == "guest") {
		showDone();
	}
}

// After a guest prints: the ask for an account comes here, after it worked.
function showDone() {
	const scrim = document.querySelector(".scrim.done");
	const style = state.choice.style;
	document.querySelector(".done-stack").replaceChildren(el("img", { src: thumbURL(style), alt: "" }));
	const left = state.quota.left;
	document.querySelector(".done-body").replaceChildren(
		el("p", { text: `${left > 0 ? `You have ${left} free print${left == 1 ? "" : "s"} left on this browser.` : "That was your last free print on this browser."} A free account keeps this article in your pile and gives you more prints, on any computer.` }),
		el("div", { class: "row" },
			el("a", { class: "button", href: `${state.settings.serverUrl}/signup/`, target: "_blank", text: "Create a free account" }),
			el("button", { type: "button", class: "link-button", text: "Not now", onclick: () => scrim.hidden = true })));
	scrim.hidden = false;
	scrim.querySelector(".button").focus();
}
document.querySelector(".scrim.done").addEventListener("click", event => {
	if (event.target.classList.contains("scrim")) event.currentTarget.hidden = true;
});
addEventListener("keydown", event => {
	if (event.key == "Escape") document.querySelector(".scrim.done").hidden = true;
});

// Print and save: the article is saved in the background, and its status shows under Print.

const SAVE_ICONS = {
	working: `<svg viewBox="0 0 16 16" class="spinner"><circle cx="8" cy="8" r="6.25" fill="none" stroke-width="1.75" opacity=".2"/><path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" fill="none" stroke-width="1.75" stroke-linecap="round"/></svg>`,
	done: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" class="fill"/><path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	error: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" class="fill"/><path d="M8 4.6v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r=".95" fill="#fff"/></svg>`,
	login: `<svg viewBox="0 0 16 16"><circle cx="8" cy="5.6" r="2.6" fill="none" stroke-width="1.5"/><path d="M2.9 14c.6-2.6 2.6-4 5.1-4s4.5 1.4 5.1 4" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`
};
// Actions that only make sense on the article page itself.
const PAGE_ONLY_ACTIONS = ["print-instead", "print-page"];

function watchSave(id) {
	chrome.runtime.onMessage.addListener(message => {
		if (message.method == "screenbreak.saveStatus" && message.id == id) {
			showSaveStatus(message);
		}
	});
	chrome.runtime.sendMessage({ method: "screenbreak.getSaveStatus", id }).then(message => message && showSaveStatus(message));
}

function showSaveStatus({ status, articleTabId }) {
	const element = document.querySelector(".save-status");
	clearTimeout(element.timeout);
	if (!status) {
		element.hidden = true;
		return;
	}
	const { state: saveState, title, detail, autoHide } = status;
	element.className = "save-status " + saveState;
	element.title = detail || "";
	element.querySelector(".save-icon").innerHTML = SAVE_ICONS[saveState] || "";
	element.querySelector(".save-text").textContent = saveState == "working" && title.startsWith("Saving") ? "Saving to Screenbreak…" : saveState == "login" ? "Not saved yet" : title;
	const actions = (status.actions || []).filter(action => !PAGE_ONLY_ACTIONS.includes(action.action)).map(({ label, action, href }) => {
		const control = document.createElement(href ? "a" : "button");
		control.textContent = label == "Open in Screenbreak" ? "Open" : label;
		if (href) {
			control.href = href;
			control.target = "_blank";
		} else {
			control.type = "button";
			control.className = "link-button";
			control.addEventListener("click", () => chrome.runtime.sendMessage({ method: "screenbreak.statusAction", action, tabId: articleTabId }));
		}
		control.dataset.action = action || "";
		return control;
	});
	element.querySelector(".save-actions").replaceChildren(...actions);
	element.hidden = false;
	if (autoHide) {
		element.timeout = setTimeout(() => {
			if (saveState == "done") {
				element.querySelector("[data-action=undo]")?.remove();
			} else {
				element.hidden = true;
			}
		}, autoHide);
	}
}

// Messages (expired, nothing to print)

function showMessage({ title, text, action }) {
	document.title = title + " · Screenbreak";
	document.body.classList.remove("is-loading");
	document.body.classList.add("is-message");
	document.querySelector(".wait").hidden = true;
	const message = document.querySelector(".message");
	message.querySelector(".message-title").textContent = title;
	message.querySelector(".message-text").textContent = text;
	const primary = message.querySelector(".message-primary");
	if (action && action.url) {
		primary.textContent = action.label;
		primary.href = action.url;
		primary.hidden = false;
	}
	message.hidden = false;
}

function initCloseTab() {
	document.querySelector(".close-tab").addEventListener("click", async () => {
		const tab = await chrome.tabs.getCurrent();
		chrome.tabs.remove(tab.id);
	});
}

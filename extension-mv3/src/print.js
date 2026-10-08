// The print page: the article set in our designs, page by page exactly as it prints, with the choices that
// change it beside it. Opens when the reader presses Print; with "Print straight away" it opens the print
// dialog by itself and goes back to the article afterwards.
//
// Tiers (SPEC 0, A1-A3): printing is free and unlimited. A guest prints the engine's pick with Colour, Greys or None
// on any paper. Any other design or Ink saver can be previewed on the desk; printing it is the account step (the door).
import { getSettings, updateSettings } from "./settings.js";
import { prepare, compose, hasLongReferences } from "./engine/layout.js";
import { sanitize, removeRepeatedByline, showExcerpt } from "./engine/sanitize.js";
import { DESIGNS, PICTURES, REFERENCES, PAPER, topPicks, sentence } from "./designs.js";
import { getAccount, canUse, INTENT_KEY } from "./plans.js";
import { Desk } from "./desk.js";
import { fillSegmented, setRadio, pickedCard, pickRow, designTile, setThumbnail, lockIcon, renderWho, renderDoor, loadDone, loadOffers, Wait } from "./panel.js";

const MIN_ARTICLE_TEXT = 140;
const THUMB_WIDTH = 64;
const GIFT_FROM_KEY = "sbGiftFrom";
const INK_LOCKED_HELP = "Ink saver prints photos as light dots. It comes with a free account.";
const REFERENCES_LOCKED_HELP = "Reference list comes with a free account.";

const panel = document.querySelector(".panel");
const printButton = document.querySelector(".print-button");
const pdfButton = document.querySelector(".pdf-button");
const desk = new Desk(document.querySelector(".sheets"));
const deskElement = document.querySelector(".desk");
const gallery = document.querySelector(".gallery");
const doneElement = document.querySelector(".done");

// choice: what the desk shows. freeChoice: the last choice this reader can print, which a locked preview goes back to.
const state = {
	id: "", prepared: null, settings: null, account: { state: "guest" }, choice: null, freeChoice: null, picks: [],
	previewOnly: false, article: null, busy: true, door: null, done: null, thumbKey: ""
};

init();

async function init() {
	const id = state.id = location.hash.substring(1);
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
	state.picks = topPicks(state.prepared);
	state.account = await accountPromise;
	const print = settings.print;
	const fixed = print.design != "best" && DESIGNS[print.design] && isOpen("design", print.design) ? print.design : null;
	// The clamp happens here, at read time: synced settings stay as they are, so an account's choices survive a guest session.
	state.choice = {
		style: fixed || state.picks[0].style,
		pictures: isOpen("pictures", print.pictures) ? print.pictures : "colour",
		references: isOpen("references", print.references) ? print.references : "small",
		paper: print.paper
	};
	state.freeChoice = { ...state.choice };
	wait.step(`Picked ${DESIGNS[state.choice.style].name}${fixed ? ", your design" : " for this article"}`);
	renderPanel();
	await showChoice();
	wait.step(`Set it on ${desk.current.pages} ${PAPER[state.choice.paper].label} page${desk.current.pages > 1 ? "s" : ""}`);
	await wait.done();
	document.body.classList.remove("is-loading");
	// The other picks render in the background, so switching to one is instant and its page count shows.
	renderPicksInBackground();
	watchSave(id);
	await resumeIntent();
	if (print.straightAway && !state.previewOnly) {
		printNow({ straightAway: true });
	}
}

// Tiers

const isOpen = (kind, value) => canUse(state.account, kind, value, { pick: state.picks[0] && state.picks[0].style });
const isGuest = () => state.account.state == "guest";

// What the desk shows that this reader cannot print yet, design first.
function lockedPart() {
	const { style, pictures, references } = state.choice;
	if (!isOpen("design", style)) return { kind: "design", name: "design", value: style, label: DESIGNS[style].name };
	if (!isOpen("pictures", pictures)) return { kind: "option", name: "pictures", value: pictures, label: PICTURES[pictures].label };
	if (!isOpen("references", references)) return { kind: "option", name: "references", value: references, label: "Reference list" };
	return null;
}

function intentFor(locked) {
	const base = { printJobId: state.id, sourceUrl: state.article.url, title: state.article.title };
	if (!locked) return { kind: "design", design: state.choice.style, ...base };
	return locked.kind == "design"
		? { kind: "design", design: locked.value, ...base }
		: { kind: "option", option: { name: locked.name, value: locked.value }, ...base };
}

// Documents are kept per design and per picture, reference, paper and gift setting.
function keyFor({ style, pictures, references, paper, gift }) {
	return [style, pictures, references, paper, gift ? gift.for + "\u0001" + gift.from : ""].join("|");
}

function renderDesign(style) {
	const choice = { ...state.choice, style };
	return desk.render(keyFor(choice), compose(state.prepared, choice));
}

function renderPicksInBackground() {
	for (const pick of state.picks) {
		renderDesign(pick.style).then(() => updatePageCounts()).catch(() => {});
	}
}

async function showChoice() {
	deskElement.classList.add("swapping");
	state.busy = true;
	printButton.setAttribute("aria-busy", "true");
	try {
		await desk.show(keyFor(state.choice), compose(state.prepared, state.choice));
	} finally {
		deskElement.classList.remove("swapping");
		state.busy = false;
		printButton.removeAttribute("aria-busy");
	}
	updatePageCounts();
	updateSummary();
	updateLocks();
}

// Panel

function renderPanel() {
	const { prepared, choice, settings, picks } = state;
	const guest = isGuest();
	document.body.classList.toggle("is-guest", guest);
	const picked = picks[0];
	document.querySelector(".picks").replaceChildren(pickedCard({ style: picked.style, why: picked.why, checked: choice.style == picked.style }));
	state.thumbKey = "";
	renderOthers();
	gallery.querySelector(".gallery-grid").replaceChildren(...Object.keys(DESIGNS).map(style =>
		designTile({ style, checked: style == choice.style, picked: style == picked.style, locked: !isOpen("design", style), describedBy: "lock-line" })));
	fillSegmented(panel.querySelector("[data-name=pictures]"), PICTURES, choice.pictures, { locked: Object.keys(PICTURES).filter(value => !isOpen("pictures", value)), describedBy: "lock-line" });
	fillSegmented(panel.querySelector("[data-name=paper]"), PAPER, choice.paper);
	const longReferences = hasLongReferences(prepared);
	if (!guest) {
		fillSegmented(panel.querySelector("[data-name=references]"), REFERENCES, choice.references);
	}
	panel.querySelector(".references-opt").hidden = guest || !longReferences;
	panel.querySelector(".locked-group").hidden = !guest;
	panel.querySelector(".references-locked").hidden = !guest || !longReferences;
	panel.querySelector(".references-locked .locked-value").replaceChildren(REFERENCES.small.label, lockIcon(12));
	panel.querySelector(".guest-line").hidden = !guest;
	panel.querySelector(".straight-note").hidden = !settings.print.straightAway;
	renderWho(panel.querySelector(".who"), state.account, settings.serverUrl);
	updateHelp();
}

// "Other designs": the picker's #2 and #3, plus the design on show when it is none of the top three.
function renderOthers() {
	const { choice, picks } = state;
	const rows = picks.slice(1).map(pick => ({ style: pick.style, why: pick.why }));
	if (!picks.some(pick => pick.style == choice.style)) {
		const ranked = state.prepared.picks.find(pick => pick.style == choice.style);
		rows.push({ style: choice.style, why: ranked ? ranked.why : "" });
	}
	document.querySelector(".others").replaceChildren(...rows.map(row =>
		pickRow({ ...row, checked: row.style == choice.style, locked: !isOpen("design", row.style), describedBy: "lock-line" })));
	document.querySelector(".others-heading, #others-heading").hidden = !rows.length;
}

function updateHelp(locked = lockedPart()) {
	const pictures = state.choice.pictures;
	panel.querySelector(".pictures-help").textContent = locked && locked.name == "pictures" ? INK_LOCKED_HELP : PICTURES[pictures].help;
	panel.querySelector(".references-help").textContent = REFERENCES[state.choice.references].help;
}

function updatePageCounts() {
	const paper = PAPER[state.choice.paper].label;
	for (const pick of document.querySelectorAll(".pick")) {
		const frame = desk.frames.get(keyFor({ ...state.choice, style: pick.dataset.style }));
		const pages = frame && frame.pages ? `${frame.pages} page${frame.pages > 1 ? "s" : ""}` : "";
		pick.querySelector(".pages").textContent = pages && pick.classList.contains("picked") ? `${pages} · ${paper}` : pages;
	}
	updatePickedThumbnail();
}

// The picked card shows page 1 of this article in the pick, with the current pictures and paper.
function updatePickedThumbnail() {
	const card = document.querySelector(".pick.picked");
	const key = keyFor({ ...state.choice, style: state.picks[0].style });
	const frame = desk.frames.get(key);
	if (!card || !frame || !frame.pages || state.thumbKey == key) {
		return;
	}
	const thumb = desk.thumbnail(frame, THUMB_WIDTH);
	if (thumb) {
		state.thumbKey = key;
		setThumbnail(card, thumb);
	}
}

function updateSummary() {
	const pages = desk.current.pages;
	const minutes = state.prepared.facts.minutes;
	document.querySelector(".summary").textContent = `${pages} ${PAPER[state.choice.paper].label} page${pages > 1 ? "s" : ""} · about ${minutes} minute${minutes > 1 ? "s" : ""} to read`;
	document.querySelector(".print-label").textContent = `Print ${pages} page${pages > 1 ? "s" : ""}`;
}

// A locked preview: the row or tile gets an ink edge, the desk shows a banner, and the footer offers the door and the pick.
function updateLocks() {
	const locked = lockedPart();
	document.body.classList.toggle("is-previewing", !!locked);
	document.querySelectorAll("[data-previewing]").forEach(element => element.removeAttribute("data-previewing"));
	const banner = document.querySelector(".desk-banner");
	const back = backTarget();
	if (locked) {
		const selector = locked.kind == "design" ? `.pick[data-style="${locked.value}"], .tile[data-style="${locked.value}"]` : `[data-name=${locked.name}] label[data-value="${locked.value}"]`;
		document.querySelectorAll(selector).forEach(element => element.setAttribute("data-previewing", ""));
		banner.querySelector(".banner-text").textContent = `Previewing ${locked.label}. It needs a free account.`;
		banner.querySelector(".banner-back").textContent = `Back to ${back}`;
		document.querySelector(".continue-button").textContent = locked.kind == "design" ? `Continue with email to print ${locked.label}` : `Continue with email to print with ${locked.label}`;
		document.querySelector(".print-pick-label").textContent = `Print ${DESIGNS[state.freeChoice.style].name} now`;
		document.querySelector(".locked-note").textContent = locked.kind == "design" ? "Free. No card. We keep this design for you." : "Free. No card. We keep this choice for you.";
	} else {
		state.freeChoice = { ...state.choice };
	}
	banner.hidden = !locked;
	document.querySelector(".act-print").hidden = !!locked;
	document.querySelector(".act-locked").hidden = !locked;
	document.querySelector(".secondary-row").hidden = !!locked;
	updateHelp(locked);
}

// The name the banner goes back to: the design, or for an option its free value.
function backTarget() {
	const locked = lockedPart();
	if (!locked || locked.kind == "design") return DESIGNS[state.freeChoice.style].name;
	return locked.name == "pictures" ? PICTURES[state.freeChoice.pictures].label : REFERENCES[state.freeChoice.references].label;
}

async function backToFree() {
	closeDoor();
	state.choice = { ...state.freeChoice, gift: state.choice.gift };
	syncControls();
	await showChoice();
}

// Radios follow state.choice (after a back, a sign-in or a preview from the gallery).
function syncControls() {
	document.querySelectorAll("input[name=design]").forEach(input => input.checked = input.value == state.choice.style);
	renderOthers();
	setRadio(panel.querySelector("[data-name=pictures]"), state.choice.pictures);
	setRadio(panel.querySelector("[data-name=paper]"), state.choice.paper);
	setRadio(panel.querySelector("[data-name=references]"), state.choice.references);
	updatePageCounts();
}

// One change handler for the panel and the gallery. A locked value, by mouse or keyboard, only previews: printing
// it goes through the door (printNow refuses it).
document.addEventListener("change", async event => {
	const target = event.target;
	if (target.name == "design") {
		state.choice.style = target.value;
		closeGallery({ focusRow: target.closest(".gallery") ? target.value : null });
		syncControls();
		await showChoice();
		// A door for another design would now be wrong; a sign-in already under way carries on.
		if (state.door && !state.door.waiting) closeDoor();
	} else if (target.name == "pictures" || target.name == "references" || target.name == "paper") {
		state.choice[target.name] = target.value;
		// An open value also changes what "Back to …" returns to.
		if (isOpen(target.name, target.value)) state.freeChoice[target.name] = target.value;
		await showChoice();
		state.picks.forEach(pick => renderDesign(pick.style).then(updatePageCounts).catch(() => {}));
		// Printer facts are remembered without asking; a locked value never is.
		if ((target.name == "pictures" || target.name == "paper") && isOpen(target.name, target.value)) {
			state.settings = { ...state.settings, print: { ...state.settings.print, [target.name]: target.value } };
			await updateSettings({ print: state.settings.print });
		}
	}
});

document.querySelector(".banner-back").addEventListener("click", () => backToFree());
document.querySelector(".continue-button").addEventListener("click", () => openDoorForLocked());
document.querySelector(".print-pick-button").addEventListener("click", async () => {
	await backToFree();
	printNow();
});
document.querySelector(".lock-continue").addEventListener("click", () => openDoor({ kind: "design", design: state.choice.style }, "account"));
document.querySelector(".references-locked").addEventListener("click", () => {
	panel.querySelector(".references-locked").setAttribute("aria-expanded", "true");
	openDoor(intentFor({ kind: "option", name: "references", value: "keep" }), "option");
});

document.querySelector(".show-page-next").addEventListener("click", async () => {
	state.settings = { ...state.settings, print: { ...state.settings.print, straightAway: false } };
	await updateSettings({ print: state.settings.print });
	panel.querySelector(".straight-note").hidden = true;
});

document.querySelectorAll("input[name=view]").forEach(input => input.addEventListener("change", () => desk.setSpread(input.value == "spread" && input.checked)));

// Gallery: all 11 designs over the desk, not a longer panel.

const galleryToggle = document.querySelector(".all-toggle");
function openGallery() {
	gallery.hidden = false;
	galleryToggle.setAttribute("aria-expanded", "true");
	(gallery.querySelector("input:checked") || gallery.querySelector("input")).focus();
}
function closeGallery({ focusRow } = {}) {
	if (gallery.hidden) return;
	gallery.hidden = true;
	galleryToggle.setAttribute("aria-expanded", "false");
	requestAnimationFrame(() => {
		const row = focusRow && document.querySelector(`.panel input[name=design][value="${focusRow}"]`);
		(row || galleryToggle).focus();
	});
}
galleryToggle.addEventListener("click", () => gallery.hidden ? openGallery() : closeGallery());
document.querySelector(".gallery-close").addEventListener("click", () => closeGallery());

// Under 860 px: a sticky bar with Print and "Design & paper", which opens the same blocks as a bottom sheet.

const sheetToggle = document.querySelector(".sheet-toggle");
function setSheet(open) {
	document.body.classList.toggle("sheet-open", open);
	sheetToggle.setAttribute("aria-expanded", String(open));
	if (open) document.querySelector(".blocks .sheet-close").focus();
	else if (document.activeElement && document.activeElement.closest(".blocks")) sheetToggle.focus();
}
sheetToggle.addEventListener("click", () => setSheet(!document.body.classList.contains("sheet-open")));
document.querySelector(".sheet-close").addEventListener("click", () => setSheet(false));

// Gift line (D4): "Printed for Maria, from Yorgos" in the page-1 top margin. The names never leave this computer.

const giftToggle = document.querySelector(".gift-toggle");
const giftFields = document.querySelector(".gift-fields");
const giftFor = document.querySelector("#gift-for");
const giftFrom = document.querySelector("#gift-from");
const giftRemember = document.querySelector("input[name=giftRemember]");
let giftTimer;
chrome.storage.local.get(GIFT_FROM_KEY).then(({ [GIFT_FROM_KEY]: from }) => {
	if (from) {
		giftFrom.value = from;
		giftRemember.checked = true;
	}
}).catch(() => {});
giftToggle.addEventListener("click", () => {
	const open = giftFields.hidden;
	giftFields.hidden = !open;
	giftToggle.setAttribute("aria-expanded", String(open));
	if (open) giftFor.focus();
	updateGift();
});
for (const input of [giftFor, giftFrom]) {
	input.addEventListener("input", () => {
		clearTimeout(giftTimer);
		giftTimer = setTimeout(updateGift, 450);
		rememberFrom();
	});
}
giftRemember.addEventListener("change", rememberFrom);
function rememberFrom() {
	const from = giftFrom.value.trim();
	if (giftRemember.checked && from) chrome.storage.local.set({ [GIFT_FROM_KEY]: from }).catch(() => {});
	else chrome.storage.local.remove(GIFT_FROM_KEY).catch(() => {});
}
async function updateGift() {
	if (!state.choice) return;
	const names = { for: giftFor.value.trim().slice(0, 30), from: giftFrom.value.trim().slice(0, 30) };
	const gift = !giftFields.hidden && (names.for || names.from) ? names : undefined;
	if (keyFor({ ...state.choice, gift }) == keyFor(state.choice)) return;
	state.choice.gift = gift;
	state.freeChoice.gift = gift;
	await showChoice();
	renderPicksInBackground();
}

// Printing

printButton.addEventListener("click", () => printNow());
pdfButton.addEventListener("click", () => printNow({ kind: "pdf" }));
addEventListener("keydown", event => {
	// Cmd/Ctrl+P does what the main pill does: in a locked preview that is the door, never a print of another design.
	if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() == "p") {
		event.preventDefault();
		printNow();
	} else if (event.key == "Escape" && !event.defaultPrevented) {
		// One layer per press: the gallery, the sheet, the door, then the preview.
		if (!gallery.hidden) closeGallery();
		else if (document.body.classList.contains("sheet-open")) setSheet(false);
		else if (state.door) closeDoor();
		else if (lockedPart() && !document.body.classList.contains("is-done")) backToFree();
	}
});

async function printNow({ straightAway = false, kind = "print" } = {}) {
	if (state.busy || !desk.current || !state.choice || document.body.classList.contains("is-done")) {
		return;
	}
	if (lockedPart()) {
		openDoorForLocked();
		return;
	}
	state.busy = true;
	printButton.setAttribute("aria-busy", "true");
	try {
		await desk.print();
	} finally {
		state.busy = false;
		printButton.removeAttribute("aria-busy");
	}
	const facts = state.prepared.facts || {};
	const style = state.choice.style;
	const pages = desk.current.pages;
	const screens = Number.isInteger(facts.screens) && facts.screens >= 1 ? facts.screens : null;
	if (kind == "print") {
		try {
			const { recordPrint } = await loadOffers();
			await recordPrint({ url: printURL(), design: style, pages, screens, words: facts.words, photos: facts.photos });
		} catch (error) {
			// offers.js is not in this build yet.
		}
	}
	if (straightAway) {
		// The button works as a printer: the article tab shows "Broadsheet, 5 pages", and the reader is back on it.
		const tab = await chrome.tabs.getCurrent();
		if (tab && tab.openerTabId) {
			chrome.runtime.sendMessage({ method: "screenbreak.printed", id: state.id, tabId: tab.openerTabId, design: DESIGNS[style].name, pages }).catch(() => {});
			await chrome.tabs.update(tab.openerTabId, { active: true }).catch(() => {});
			chrome.tabs.remove(tab.id);
			return;
		}
	}
	await showDone(kind, { style, pages, screens });
}

// The canonical address the paper and the print log use (C-2), with the article's own address as the fallback.
function printURL() {
	return (state.prepared.man && state.prepared.man.printURL) || state.article.printURL || state.article.url;
}

// Done state (C-4, done.js): in place of the panel blocks, for every tier.
async function showDone(kind, { style, pages, screens }) {
	let done;
	try {
		done = await loadDone();
	} catch (error) {
		return; // done.js is not in this build yet.
	}
	const pick = state.prepared.picks.find(candidate => candidate.style == style);
	if (state.done) state.done.close();
	closeDoor();
	setSheet(false);
	document.body.classList.add("is-done");
	doneElement.hidden = false;
	state.done = done.showDone(doneElement, {
		kind,
		design: { id: style, name: DESIGNS[style].name },
		pages,
		reason: pick ? sentence(pick.why) : DESIGNS[style].line,
		screens,
		account: state.account,
		serverUrl: state.settings.serverUrl,
		onBack: backToArticle,
		onPrintAgain: () => {
			leaveDone({ focus: false });
			printNow({ kind });
		},
		onChange: () => leaveDone(),
		openDoor: intent => openDoor({ printJobId: state.id, sourceUrl: state.article.url, title: state.article.title, ...intent }, (intent && intent.kind) || "keep", { slot: ".door-slot-done" })
	});
}

function leaveDone({ focus = true } = {}) {
	if (state.done) state.done.close();
	state.done = null;
	closeDoor();
	doneElement.hidden = true;
	doneElement.replaceChildren();
	document.body.classList.remove("is-done");
	if (focus) printButton.focus();
}

async function backToArticle() {
	const tab = await chrome.tabs.getCurrent();
	const opener = tab && tab.openerTabId && await chrome.tabs.get(tab.openerTabId).catch(() => null);
	if (opener) {
		await chrome.tabs.update(opener.id, { active: true }).catch(() => {});
		chrome.tabs.remove(tab.id);
	} else {
		location.href = state.article.url;
	}
}

// The door (C-6): one card under the Print button, never a modal.

function openDoorForLocked() {
	const locked = lockedPart();
	if (!locked) return;
	openDoor(intentFor(locked), locked.kind == "design" ? "design" : "option");
}

function openDoor(intent, entry, { slot = ".door-slot-print" } = {}) {
	closeDoor();
	const container = document.querySelector(slot);
	const design = intent.design && DESIGNS[intent.design] ? DESIGNS[intent.design].name : DESIGNS[state.choice.style].name;
	state.door = renderDoor(container, {
		entry,
		design,
		serverUrl: state.settings.serverUrl,
		intent: { printJobId: state.id, sourceUrl: state.article.url, title: state.article.title, ...intent },
		onCancel: ({ timedOut }) => {
			state.door = null;
			if (timedOut) showSignedInLine("We stopped waiting for the sign-in. The pick is ready to print.");
			if (lockedPart()) backToFree();
		},
		onSignedIn: (account, signedIntent) => {
			state.door = null;
			applySignIn(account, signedIntent);
		}
	});
	if (document.body.classList.contains("sheet-open")) setSheet(false);
	container.scrollIntoView({ block: "nearest", behavior: "smooth" });
	state.door.focus();
}

// Closing the door, by Escape, Back or another step, drops the intent: nothing applies later by surprise.
function closeDoor() {
	if (state.door) {
		state.door.close();
		chrome.storage.session.remove(INTENT_KEY).catch(() => {});
	}
	state.door = null;
	panel.querySelector(".references-locked").removeAttribute("aria-expanded");
}

// After sign-in: apply the intent once (it is already deleted), keep paper and pictures, focus Print.
// The print dialog never opens by itself.
async function applySignIn(account, intent = {}) {
	state.account = account;
	if (intent.kind == "design" && DESIGNS[intent.design]) {
		state.choice.style = intent.design;
	} else if (intent.kind == "option" && intent.option && ["pictures", "references"].includes(intent.option.name)) {
		state.choice[intent.option.name] = intent.option.value;
	}
	renderPanel();
	await showChoice();
	renderPicksInBackground();
	if (intent.kind == "save" || intent.kind == "keep") {
		const tab = await chrome.tabs.getCurrent();
		const opener = tab && tab.openerTabId && await chrome.tabs.get(tab.openerTabId).catch(() => null);
		if (opener) chrome.runtime.sendMessage({ method: "screenbreak.run", action: "save", tab: opener }).catch(() => {});
		showSignedInLine("You're in. This article is going to your library.");
	} else {
		const ready = intent.kind == "option" && intent.option ? (intent.option.name == "pictures" ? PICTURES[intent.option.value].label : "Reference list") : DESIGNS[state.choice.style].name;
		showSignedInLine(`You're in. ${ready} is ready to print.`);
	}
	if (document.body.classList.contains("is-done")) leaveDone({ focus: false });
	printButton.focus();
}

function showSignedInLine(text) {
	const line = document.querySelector(".signed-in-line");
	line.textContent = text;
	line.hidden = false;
}

// A sign-in that finished while this page was closed or reloaded: apply it now, once.
async function resumeIntent() {
	const { [INTENT_KEY]: intent } = await chrome.storage.session.get(INTENT_KEY).catch(() => ({}));
	if (!intent || intent.printJobId != state.id) {
		return;
	}
	if (isGuest() && Date.now() - (intent.created || 0) < 5 * 60 * 1000) {
		return;
	}
	await chrome.storage.session.remove(INTENT_KEY).catch(() => {});
	if (!isGuest()) {
		applySignIn(state.account, intent);
	}
}

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
	element.querySelector(".save-text").textContent = saveState == "working" && title.startsWith("Saving") ? "Saving to your library…" : saveState == "login" ? "Not saved yet" : title;
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

// Pieces the print page and Settings share: design choices with their locks, segmented controls, the head,
// the one door to a free account (with its wait while the reader signs in) and the wait screen.
import { DESIGNS, PICTURES, REFERENCES, PAPER, sentence } from "./designs.js";
import { getAccount, loginPageURL, libraryURL, doorEmailURL, doorGoogleURL, INTENT_KEY } from "./plans.js";

export const thumbURL = style => `designs/${style}.webp`;

// The done state and the offers (done.js, offers.js) come from a parallel branch. A template import lets esbuild
// bundle each file when it is there and throw "Module not found" at run time when it is not, so these pages build
// and run either way. The prefixes keep each pattern to one file.
export const loadDone = () => import("./done.js");
export const loadOffers = () => import("./offers.js");

export function el(tag, attributes = {}, ...children) {
	const element = document.createElement(tag);
	for (const [name, value] of Object.entries(attributes)) {
		if (value === false || value == null) continue;
		if (name == "class") element.className = value;
		else if (name == "text") element.textContent = value;
		else if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
		else element.setAttribute(name, value === true ? "" : value);
	}
	element.append(...children.flat().filter(child => child != null && child !== false));
	return element;
}

function svg(markup) {
	const holder = document.createElement("span");
	holder.innerHTML = markup;
	return holder.firstElementChild;
}

// A line padlock in the text colour: 12 px in rows, 11 px in segments and chips. Never green.
export function lockIcon(size = 12) {
	return svg(`<svg class="lock" width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.25" y="5.25" width="7.5" height="5.5" rx="1.4"/><path d="M4 5.25V3.9a2 2 0 0 1 4 0v1.35"/></svg>`);
}

const lockChip = () => el("span", { class: "lock-chip" }, lockIcon(11));
const needsAccount = () => el("span", { class: "visually-hidden", text: ", needs a free account. Select to preview." });

// A segmented control from { value: { label } }. Locked values stay selectable (a tap previews them), with a muted
// label, an 11 px lock and the lock line as their description.
export function fillSegmented(container, choices, value, { locked = [], describedBy } = {}) {
	const name = container.dataset.name;
	container.replaceChildren(...Object.entries(choices).map(([key, { label, short }]) => {
		const isLocked = locked.includes(key);
		return el("label", { "data-locked": isLocked || null, "data-value": key },
			el("input", { type: "radio", name, value: key, checked: key == value, "aria-describedby": isLocked ? describedBy : null }),
			el("span", {},
				short ? [el("span", { class: "long", text: label }), el("span", { class: "short", "aria-hidden": "true", text: short })] : label,
				isLocked && lockIcon(11),
				isLocked && el("span", { class: "visually-hidden", text: ", needs a free account" })));
	}));
}

export function setRadio(container, value) {
	container.querySelectorAll("input[type=radio]").forEach(input => input.checked = input.value == value);
}

// The engine's pick for this article: the hero card. The thumbnail starts as the design's sample page and becomes
// page 1 of this article once it is built (setThumbnail).
export function pickedCard({ style, why, checked, name = "design" }) {
	return el("label", { class: "pick picked", "data-style": style },
		el("input", { type: "radio", name, value: style, checked }),
		el("span", { class: "thumb" }, el("img", { src: thumbURL(style), alt: "", width: 64, height: 90 })),
		el("span", { class: "pick-text" },
			el("span", { class: "name", text: DESIGNS[style].name }),
			el("span", { class: "why", text: sentence(why) || DESIGNS[style].line }),
			el("span", { class: "pages", text: "" })));
}

// One of the other designs as a row: sample thumbnail, name, the picker's reason, page count once known.
export function pickRow({ style, why, checked, locked, describedBy, name = "design" }) {
	return el("label", { class: "pick row", "data-style": style, "data-locked": locked || null },
		el("input", { type: "radio", name, value: style, checked, "aria-describedby": locked ? describedBy : null }),
		el("span", { class: "thumb" }, el("img", { src: thumbURL(style), alt: "", width: 40, height: 57 }), locked && lockChip()),
		el("span", { class: "pick-text" },
			el("span", { class: "name" }, DESIGNS[style].name, locked && needsAccount()),
			el("span", { class: "why", text: sentence(why) || DESIGNS[style].line }),
			el("span", { class: "pages", text: "" })));
}

// A design in the gallery: its sample page at full colour, with a corner lock chip when it needs an account.
export function designTile({ style, checked, locked, picked, describedBy, name = "design" }) {
	return el("label", { class: "tile", "data-style": style, "data-locked": locked || null, "data-picked": picked || null },
		el("input", { type: "radio", name, value: style, checked, "aria-describedby": locked ? describedBy : null }),
		el("span", { class: "thumb" }, el("img", { src: thumbURL(style), alt: "", loading: "lazy", width: 300, height: 424 }), locked && lockChip()),
		el("span", { class: "tile-name" }, DESIGNS[style].name, locked && needsAccount()),
		el("span", { class: "tile-line", text: DESIGNS[style].line }));
}

// Swaps a card's thumbnail for a live one (an element from Desk.thumbnail).
export function setThumbnail(card, element) {
	const thumb = card && card.querySelector(".thumb");
	if (thumb && element) {
		thumb.replaceChildren(element);
		thumb.classList.add("live");
	}
}

// Head: "Log in" for a guest; for an account, the name as a link to the library.
export function renderWho(container, account, serverUrl) {
	if (account.state == "guest") {
		container.replaceChildren(el("a", { href: loginPageURL(serverUrl), target: "_blank", text: "Log in" }));
	} else {
		container.replaceChildren(el("a", { href: libraryURL(serverUrl), target: "_blank", class: "who-name", title: "Open my library", text: account.name || account.email || "My library" }));
	}
}

// The value of a locked option, for the door's heading ("Ink saver needs a free account").
function optionLabel({ name, value } = {}) {
	const choices = { pictures: PICTURES, references: REFERENCES, paper: PAPER }[name];
	if (name == "references") return "Reference list";
	return choices && choices[value] ? choices[value].label : "This option";
}

const DOOR_HEADINGS = {
	design: ({ design }) => `Print in ${design} with a free account`,
	option: ({ intent }) => `${optionLabel(intent && intent.option)} needs a free account`,
	save: () => "Save this article to your library",
	keep: () => "Keep this article in your library",
	account: () => "Your free Screenbreak account"
};

const GOOGLE_MARK = `<svg class="google" width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const POLL_EVERY = 2000;
const WAIT_LIMIT = 5 * 60 * 1000;

// The one door to a free account: a card in the page, never a modal. The intent waits in session storage while the
// reader signs in on the server's tab; this page checks /api/v1/me/ every 2 s and on focus, for 5 minutes. When the
// account appears, the intent is read and deleted, then handed to onSignedIn once. Cancel or time out deletes it.
// entry: "design" | "option" | "save" | "keep" | "account". exit: false leaves out "Keep printing without an account".
// start: "email" | "google" skips the card and goes straight to that way in (the locked footer's pill is the email
// step). resume: a stored intent whose sign-in is still under way (after a reload): the card comes back waiting.
export function renderDoor(container, { entry, design, serverUrl, intent, onCancel, onSignedIn, exit = true, start = null, resume = null }) {
	let polling = null, signInTab = null, signInOpen = false, stopped = false, settled = false, inFlight = null;
	let onFocus = () => {};
	const headingId = "door-title-" + Math.random().toString(36).slice(2, 8);
	const onTabRemoved = tabId => {
		if (signInTab && tabId == signInTab.id) signInOpen = false;
	};
	// Leaving the page while no sign-in tab is open: nothing can finish this intent, so it goes. With the tab still
	// open it stays, and the page picks the wait up again when it comes back (resume).
	const onPageHide = () => {
		if (!stopped && !signInOpen) chrome.storage.session.remove(INTENT_KEY).catch(() => {});
	};
	const close = () => {
		stopped = true;
		clearTimeout(polling);
		removeEventListener("focus", onFocus);
		removeEventListener("pagehide", onPageHide);
		chrome.tabs.onRemoved.removeListener(onTabRemoved);
		container.replaceChildren();
		container.hidden = true;
	};
	const cancel = async ({ timedOut = false } = {}) => {
		await chrome.storage.session.remove(INTENT_KEY).catch(() => {});
		close();
		if (onCancel) onCancel({ timedOut });
	};
	const onKey = event => {
		if (event.key == "Escape") {
			event.stopPropagation();
			cancel();
		}
	};
	const go = async way => {
		const tab = await chrome.tabs.getCurrent().catch(() => null);
		const stored = { ...(intent || { kind: entry }), printTabId: tab ? tab.id : undefined, created: Date.now() };
		await chrome.storage.session.set({ [INTENT_KEY]: stored }).catch(() => {});
		const url = way == "google" ? doorGoogleURL(serverUrl) : doorEmailURL(serverUrl);
		signInTab = await chrome.tabs.create(tab ? { url, index: tab.index + 1, openerTabId: tab.id } : { url }).catch(() => null);
		if (signInTab) {
			// Kept with the intent, so a reloaded page can still bring the sign-in tab forward.
			await chrome.storage.session.set({ [INTENT_KEY]: { ...stored, signInTabId: signInTab.id } }).catch(() => {});
		}
		showWait({ started: stored.created, note: !!start });
	};
	const showWait = ({ started, note = false }) => {
		signInOpen = !!signInTab;
		chrome.tabs.onRemoved.addListener(onTabRemoved);
		addEventListener("pagehide", onPageHide);
		const title = el("h3", { class: "door-title", id: headingId, text: "Waiting for you to sign in" });
		container.replaceChildren(el("div", { class: "door waiting", role: "region", "aria-labelledby": headingId, onkeydown: onKey },
			title,
			el("p", { class: "door-note", role: "status", text: "Finish on the Screenbreak tab. This page carries on by itself." }),
			// Straight from the footer pill the reader never saw the card, so its reassurance comes along.
			note && el("p", { class: "door-note", text: "New here? Same button. We make your free account as you go." }),
			el("div", { class: "door-buttons" },
				el("button", { type: "button", class: "button button-outline", text: "Open the sign-in tab", onclick: () => signInTab && chrome.tabs.update(signInTab.id, { active: true }).catch(() => {}) }),
				el("button", { type: "button", class: "link-button", text: "Cancel", onclick: () => cancel() }))));
		container.hidden = false;
		// One check at a time: the 2 s timer and a window focus can both fire, and the intent must apply exactly once.
		// settled is set before any await that follows the answer, so a second check can never pass it.
		const check = () => {
			if (stopped || settled) return inFlight;
			if (inFlight) return inFlight;
			clearTimeout(polling);
			inFlight = (async () => {
				const account = await getAccount(serverUrl);
				if (stopped || settled) return;
				if (account.state != "guest") {
					settled = true;
					const { [INTENT_KEY]: saved } = await chrome.storage.session.get(INTENT_KEY).catch(() => ({}));
					await chrome.storage.session.remove(INTENT_KEY).catch(() => {});
					close();
					if (onSignedIn) onSignedIn(account, saved || intent || { kind: entry });
				} else if (Date.now() - started > WAIT_LIMIT) {
					settled = true;
					cancel({ timedOut: true });
				} else {
					polling = setTimeout(check, POLL_EVERY);
				}
			})().finally(() => inFlight = null);
			return inFlight;
		};
		onFocus = check;
		addEventListener("focus", onFocus);
		polling = setTimeout(check, POLL_EVERY);
		title.setAttribute("tabindex", "-1");
		title.focus();
	};
	container.hidden = false;
	if (resume) {
		signInTab = resume.signInTabId ? { id: resume.signInTabId } : null;
		showWait({ started: resume.created || Date.now() });
		if (signInTab) chrome.tabs.get(signInTab.id).then(() => {}, () => signInOpen = false);
		return { close, focus: () => container.querySelector(".door-title")?.focus(), get waiting() { return !stopped; } };
	}
	if (start) {
		container.replaceChildren();
		container.hidden = true;
		go(start);
		return { close, focus: () => {}, get waiting() { return !stopped; } };
	}
	const heading = (DOOR_HEADINGS[entry] || DOOR_HEADINGS.account)({ design, intent });
	const first = el("button", { type: "button", class: "button button-ink", text: "Continue with email", onclick: () => go("email") });
	container.replaceChildren(el("section", { class: "door", "aria-labelledby": headingId, onkeydown: onKey },
		el("h3", { class: "door-title", id: headingId, text: heading }),
		el("div", { class: "door-buttons" },
			first,
			el("button", { type: "button", class: "button button-outline", onclick: () => go("google") }, svg(GOOGLE_MARK), "Continue with Google")),
		el("p", { class: "door-note", text: "New here? Same button. We make your free account as you go." }),
		exit && el("button", { type: "button", class: "link-button door-exit", text: "Keep printing without an account", onclick: () => cancel() }),
		el("p", { class: "door-legal", text: "By continuing, you agree to the Terms and the Privacy policy." })));
	return { close, focus: () => first.focus(), get waiting() { return polling != null && !stopped; } };
}

// The wait screen: the page loses its clutter and becomes paper while the steps that really happened tick off.
export class Wait {
	constructor(element) {
		this.element = element;
		this.web = element.querySelector(".web");
		this.steps = element.querySelector(".steps");
		this.started = Date.now();
		requestAnimationFrame(() => this.web.classList.add("clean"));
	}

	step(text) {
		const item = el("li", { class: "done", text });
		this.steps.append(item);
		if (this.steps.children.length >= 3) this.web.classList.add("paper");
	}

	// Leaves after a short minimum, so the animation reads as a moment rather than a flicker.
	async done() {
		const wait = Math.max(0, 900 - (Date.now() - this.started));
		await new Promise(resolve => setTimeout(resolve, wait));
		this.web.classList.add("paper");
		this.element.classList.add("out");
		setTimeout(() => this.element.hidden = true, 400);
	}

	hide() {
		this.element.hidden = true;
	}
}

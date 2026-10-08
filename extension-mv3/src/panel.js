// Pieces the print page and Settings share: design choices, segmented controls, the free-print meter,
// the account card and the wait screen.
import { DESIGNS, sentence } from "./designs.js";
import { ACCOUNT_MONTHLY_PRINTS, signupURL, loginPageURL, plusURL } from "./plans.js";

export const thumbURL = style => `designs/${style}.webp`;

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

// A segmented control from { value: { label } }.
export function fillSegmented(container, choices, value) {
	const name = container.dataset.name;
	container.replaceChildren(...Object.entries(choices).map(([key, { label }]) =>
		el("label", {}, el("input", { type: "radio", name, value: key, checked: key == value }), el("span", { text: label }))));
}

export function setRadio(container, value) {
	container.querySelectorAll("input[type=radio]").forEach(input => input.checked = input.value == value);
}

// One of the picker's top designs: page 1 thumbnail, name, reason, page count once known.
export function pickOption({ style, why, best, isDefault, checked, name = "design" }) {
	return el("label", { class: "pick", "data-style": style },
		el("input", { type: "radio", name, value: style, checked }),
		el("img", { src: thumbURL(style), alt: "", width: 52, height: 74 }),
		el("span", {},
			el("span", { class: "name" }, DESIGNS[style].name, best && el("span", { class: "badge", text: "Best match" }), isDefault && el("span", { class: "badge", text: "Your default" })),
			el("span", { class: "why", text: sentence(why) }),
			el("span", { class: "pages", text: "" })));
}

export function designTile({ style, checked, isDefault, name = "design" }) {
	return el("label", { class: "tile", "data-style": style, title: DESIGNS[style].line },
		el("input", { type: "radio", name, value: style, checked }),
		el("span", { class: "thumb" }, el("img", { src: thumbURL(style), alt: "", loading: "lazy", width: 300, height: 424 }), isDefault && el("span", { class: "badge", text: "Default" })),
		el("span", { text: DESIGNS[style].name }));
}

export function renderQuota(container, quota) {
	if (!quota || quota.unlimited) {
		container.replaceChildren(quota && quota.unlimited ? el("span", { text: "Unlimited prints with Plus" }) : "");
		container.classList.remove("low");
		return;
	}
	const what = quota.guest ? "free prints left on this browser" : "free prints left this month";
	container.replaceChildren(
		el("span", { text: `${quota.left} of ${quota.total} ${what}` }),
		el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: `width:${quota.left / quota.total * 100}%` })));
	container.classList.toggle("low", quota.left <= 1);
}

// Guest: what a free account adds. Free account: a quiet word about Plus. Plus: thanks.
export function renderAccount(container, { account, quota, serverUrl, onDismiss }) {
	if (account.state == "guest") {
		const out = quota && !quota.unlimited && quota.left <= 0;
		container.replaceChildren(el("div", { class: "acct" },
			el("h3", { text: out ? "You've used your free prints" : "Print as much as you like" }),
			el("p", { text: out ? "Make a free account to keep printing. It takes an email address." : "Make a free account and Screenbreak keeps working for you." }),
			el("ul", {},
				el("li", { text: `${ACCOUNT_MONTHLY_PRINTS} prints a month, on any computer` }),
				el("li", { text: "Everything you print, kept in one searchable pile" }),
				el("li", { text: "Your designs and settings, wherever you sign in" })),
			el("div", { class: "row" },
				el("a", { class: "button", href: signupURL(serverUrl), target: "_blank", text: "Create a free account" }),
				el("a", { href: loginPageURL(serverUrl), target: "_blank", text: "Log in" }))));
	} else if (account.state == "free") {
		const card = el("div", { class: "acct light" },
			el("h3", { text: "Screenbreak Plus" }),
			el("p", { text: "For people who print every week." }),
			el("ul", {},
				el("li", { text: "Unlimited prints" }),
				el("li", { text: "Booklets: several articles in one print, with a cover and contents" }),
				el("li", { text: "PDFs printed in our designs" })),
			el("div", { class: "row" },
				el("a", { class: "button", href: plusURL(serverUrl), target: "_blank", text: "See Plus" }),
				onDismiss && el("button", { type: "button", class: "link-button", text: "Not now", onclick: () => { container.replaceChildren(); onDismiss(); } })));
		container.replaceChildren(card);
	} else {
		container.replaceChildren(el("div", { class: "acct light" },
			el("h3", { text: "You're on Plus" }),
			el("p", { text: "Unlimited prints, booklets and PDF printing. Thank you for supporting Screenbreak." })));
	}
}

export function renderWho(container, account, serverUrl) {
	if (account.state == "guest") {
		container.replaceChildren(el("a", { href: loginPageURL(serverUrl), target: "_blank", text: "Log in" }));
	} else {
		container.replaceChildren(account.state == "plus" ? el("span", { class: "badge", text: "Plus" }) : "", el("span", { text: account.name }));
	}
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

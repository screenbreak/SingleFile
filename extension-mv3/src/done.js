// The done state after the print window closes (SPEC B2, B3), and Settings "Your prints" (B4, C7).
// It states only what the code knows: the window closed. Chrome cannot tell a print from a cancel, so the
// copy never says "Printed". One fact, one primary action, at most one offer (scheduled in offers.js).
import { el } from "./panel.js";
import { lastPrint, nextOffer, dismissOffer, markFailure, markReviewOpened, milestoneEyebrow, printStats, periodStats, getLog } from "./offers.js";
import { drawReceipt, drawYearCard, openReceiptSheet, receiptText } from "./receipt.js";

const TICK = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/><path d="M4.9 8.2l2.1 2.1 4.1-4.4"/></svg>`;

const plural = (n, word) => `${n.toLocaleString("en")} ${word}${n == 1 ? "" : "s"}`;

function tick() {
	const span = el("span", { class: "done-tick", "aria-hidden": "true" });
	span.innerHTML = TICK;
	return span;
}

export function savingLine(screens, pages) {
	return screens && pages && screens > pages ? `${screens} screens of scrolling became ${pages} page${pages > 1 ? "s" : ""}` : null;
}

const reviewURL = () => `https://chromewebstore.google.com/detail/${globalThis.chrome?.runtime?.id || ""}/reviews`;

// kind: "print" | "pdf"; design: { id, name }; reason: one sentence; screens: int | null.
// Optional: lockedClicked (a locked design or option was tapped on this page), keptPick (printed the engine's
// pick), thumb (page 1 of this article: an image URL or an element, shown at 52 x 74 in the narrow sheet),
// boxes (per-page layout boxes for the receipt).
export function showDone(container, { kind = "print", design = {}, pages = 1, reason = "", screens = null, account = null, serverUrl, onBack, onPrintAgain, onChange, openDoor, lockedClicked = false, keptPick = true, thumb = null, boxes = null } = {}) {
	const pdf = kind == "pdf";
	const name = design.name || design.id || "";
	const urls = [];
	let closed = false;

	const eyebrowText = el("span", { class: "done-eyebrow-text", text: pdf ? "PDF WINDOW CLOSED" : "PRINT WINDOW CLOSED" });
	const title = el("h1", { class: "done-title", id: "done-title", tabindex: "-1", text: `${name}, ${plural(pages, "page")}` });
	const saving = savingLine(screens, pages);
	const offerSlot = el("div", { class: "done-offer", hidden: true });

	let thumbNode = null;
	if (thumb) {
		thumbNode = typeof thumb == "string" ? el("img", { src: thumb, alt: "", width: 52, height: 74 }) : thumb;
		thumbNode = el("div", { class: "done-thumb", "aria-hidden": "true" }, thumbNode);
	}

	const change = () => {
		api.close();
		onChange?.();
		if (!document.activeElement || document.activeElement == document.body) document.querySelector(".print-button")?.focus();
	};

	container.classList.add("done-state");
	container.setAttribute("role", "region");
	container.setAttribute("aria-labelledby", "done-title");
	container.replaceChildren(
		el("div", { class: "done-top" },
			el("div", { class: "done-fact" },
				el("p", { class: "done-eyebrow" }, tick(), eyebrowText),
				title,
				pdf
					? el("p", { class: "done-reason", text: "If you saved it, the PDF is in the folder you picked." })
					: reason ? el("p", { class: "done-reason", text: reason }) : null,
				!pdf && saving && el("p", { class: "done-saving" },
					`${screens} screens of scrolling became `, el("mark", { text: String(pages) }), ` page${pages > 1 ? "s" : ""}`),
				!pdf && pages > 1 && el("p", { class: "done-hint", text: "To print on both sides, turn on Two-sided in the print dialog." })),
			thumbNode),
		el("div", { class: "done-actions" },
			el("button", { type: "button", class: "pill pill-ink done-back", text: "Back to the article", onclick: () => onBack?.() }),
			el("button", {
				type: "button", class: "link-button done-again", text: pdf ? "Didn't save? Try again" : "Didn't print? Print again",
				onclick: async () => {
					await markFailure();
					onPrintAgain?.();
				}
			})),
		offerSlot,
		el("div", { class: "done-change" },
			el("button", { type: "button", class: "link-button", text: "Change something", onclick: change })));
	container.hidden = false;

	const onKey = event => {
		if (event.key == "Escape" && !document.querySelector("dialog[open]")) {
			event.preventDefault();
			change();
		}
	};
	addEventListener("keydown", onKey);
	title.focus();

	const api = {
		close() {
			if (closed) return;
			closed = true;
			removeEventListener("keydown", onKey);
			container.hidden = true;
			container.replaceChildren();
			container.classList.remove("done-state");
			container.removeAttribute("role");
			container.removeAttribute("aria-labelledby");
			urls.forEach(url => URL.revokeObjectURL(url));
		}
	};

	// The eyebrow and the offer depend on the local print log. A Save as PDF is not a print: no milestone, no offer.
	if (!pdf) {
		(async () => {
			const state = await lastPrint();
			if (closed) return;
			if (state.isNew) eyebrowText.textContent = milestoneEyebrow(state.distinct);
			const offer = await nextOffer({ account, lockedClicked, keptPick });
			if (closed || !offer) return;
			const last = state.last || {};
			await fillOffer(offerSlot, offer, {
				design, pages, screens: screens ?? last.screens, words: last.words, photos: last.photos, boxes, urls, openDoor, serverUrl,
				setEyebrow: text => eyebrowText.textContent = text,
				dismiss: () => {
					dismissOffer(offer.type);
					offerSlot.hidden = true;
					offerSlot.replaceChildren();
					title.focus();
				}
			});
			if (!closed) offerSlot.hidden = false;
		})().catch(() => {});
	}
	return api;
}

async function fillOffer(slot, offer, { design, pages, screens, words, photos, boxes, urls, openDoor, setEyebrow, dismiss }) {
	const notNow = el("button", { type: "button", class: "link-button done-not-now", text: "Not now", onclick: dismiss });
	if (offer.type == "account") {
		slot.replaceChildren(
			el("p", { text: "Keep the next ones. A free account adds a library and all 11 designs." }),
			el("div", { class: "done-offer-row" },
				el("button", {
					type: "button", class: "pill pill-secondary", text: "Continue with email",
					onclick: () => openDoor?.({ kind: "keep", design: design.id, created: Date.now() })
				}),
				notNow));
	} else if (offer.type == "review") {
		slot.replaceChildren(
			el("p", { text: "Is Screenbreak worth a review? It helps other people find it." }),
			el("div", { class: "done-offer-row" },
				el("a", { href: reviewURL(), target: "_blank", rel: "noopener", class: "done-link", text: "Write a review ↗", onclick: () => markReviewOpened() }),
				notNow));
	} else if (offer.type == "receipt" || offer.type == "year") {
		let blob, text, heading, alt, filename;
		if (offer.type == "receipt") {
			blob = await drawReceipt({ screens, pages, design, photos, words, boxes });
			text = receiptText({ screens, pages });
			heading = "Before and after";
			alt = `${screens} screens of scrolling became ${plural(pages, "page")}.`;
			filename = "screenbreak-receipt.png";
		} else {
			const from = new Date(offer.year, 0, 1).getTime(), to = new Date(offer.year + 1, 0, 1).getTime();
			const stats = periodStats(await getLog(), from, to);
			blob = await drawYearCard({ ...stats, label: `${offer.year} on paper` });
			text = `${offer.year} on paper: ${plural(stats.articles, "article")}, ${plural(stats.pages, "page")}. myscreenbreak.com`;
			heading = `${offer.year} on paper`;
			alt = text;
			filename = `screenbreak-${offer.year}.png`;
			setEyebrow(`${offer.year} ON PAPER`);
		}
		const url = URL.createObjectURL(blob);
		urls.push(url);
		const open = () => openReceiptSheet({ blob, text, heading, alt, filename });
		slot.replaceChildren(
			el("div", { class: "done-offer-receipt" },
				el("button", { type: "button", class: "done-preview", "aria-label": offer.type == "year" ? "See your year" : "Share before and after", onclick: open },
					el("img", { src: url, alt: "", width: 120, height: 120 })),
				el("div", { class: "done-offer-col" },
					el("button", { type: "button", class: "pill pill-secondary", text: offer.type == "year" ? "See your year" : "Share before and after", onclick: open }),
					notNow)));
	}
}

// Settings "Your prints": this month and this year, then the milestone ladder. Counts are distinct articles.
export async function renderYourPrints(container) {
	const stats = await printStats();
	container.classList.add("your-prints");
	if (!stats.articles) {
		container.replaceChildren(el("p", { class: "help", text: "Your prints show here after your first print." }));
		return;
	}
	const now = new Date();
	const month = now.toLocaleString("en", { month: "long" });
	const card = (heading, label, period) => el("section", { class: "yp-card", "aria-label": heading },
		el("p", { class: "yp-label", text: heading.toUpperCase() }),
		el("ul", { class: "yp-numbers" },
			el("li", {}, el("strong", { text: period.articles.toLocaleString("en") }), ` article${period.articles == 1 ? "" : "s"}`),
			el("li", {}, el("strong", { text: period.pages.toLocaleString("en") }), ` page${period.pages == 1 ? "" : "s"}`),
			period.hours >= 1
				? el("li", {}, el("strong", { text: String(period.hours) }), ` hour${period.hours == 1 ? "" : "s"} of reading`)
				: el("li", {}, el("strong", { text: String(Math.round(period.hours * 60)) }), ` minute${Math.round(period.hours * 60) == 1 ? "" : "s"} of reading`)),
		period.articles > 0 && el("button", {
			type: "button", class: "link-button yp-share", text: "Share",
			onclick: async () => {
				const blob = await drawYearCard({ ...period, label });
				openReceiptSheet({ blob, heading: label.charAt(0).toUpperCase() + label.slice(1), text: `${label.charAt(0).toUpperCase() + label.slice(1)}: ${plural(period.articles, "article")}, ${plural(period.pages, "page")}. myscreenbreak.com`, filename: "screenbreak-reading.png" });
			}
		}));
	const date = time => new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
	container.replaceChildren(
		el("div", { class: "yp-cards" },
			card("This month", `${month} on paper`, stats.month),
			card("This year", `${now.getFullYear()} on paper`, stats.year)),
		el("ol", { class: "ladder", "aria-label": "Milestones" },
			stats.rungs.map(({ n, at }) => at
				? el("li", { class: "reached" }, tick(), el("span", { class: "ladder-name", text: `${n} articles on paper` }), el("time", { datetime: new Date(at).toISOString(), text: date(at) }))
				: el("li", { class: "ahead" }, el("span", { class: "ladder-dot", "aria-hidden": "true" }), el("span", { class: "ladder-name", text: `Print ${n} articles` })))));
}

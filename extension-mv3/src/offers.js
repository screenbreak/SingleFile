// The local print log and the offer scheduler for the done state (SPEC B1, research 03 §3 and §7).
// Everything stays in chrome.storage on this computer. The log keeps no titles and no URLs: each article is a
// short hash, so the milestones can count distinct articles (Chrome cannot tell a print from a cancel).

export const LOG_KEY = "sbPrintLog";
export const OFFERS_KEY = "sbOffers";
export const REVIEW_KEY = "reviewAsk";            // once per browser, ever; never reuse tipShown
const BLOCK_KEY = "sbOfferBlock";                 // chrome.storage.session: a failure or "Print again" this session

export const MILESTONES = [3, 5, 10, 25, 50, 100];
const RECEIPT_RUNGS = [5, 25, 50, 100];           // plus 10 for account users (the guest gets the account ask there)
const ACCOUNT_AT = 10;                            // distinct articles before a guest sees "Keep the next ones"
const ACCOUNT_ASKS = 3;                           // ever; after that only after a locked click
const SPACING = 3;                                // at most one offer in any 3 prints
const SNOOZE = 10;                                // "Not now" pushes that offer back 10 prints
const LOG_LIMIT = 5000;
export const WORDS_PER_MINUTE = 230;              // the engine's reading rate (layout.js)

// Tests swap the clock.
export const clock = { now: () => Date.now() };

let blockedHere = false;                          // fallback when chrome.storage.session is missing

// 32-bit FNV-1a as 8 hex digits: enough to tell articles apart, not enough to get the URL back.
export function hashURL(url) {
	let hash = 0x811c9dc5;
	for (const char of String(url || "")) {
		const code = char.codePointAt(0);
		hash ^= code & 0xff;
		hash = Math.imul(hash, 0x01000193);
		if (code > 0xff) {
			hash ^= code >>> 8;
			hash = Math.imul(hash, 0x01000193);
		}
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

const local = () => globalThis.chrome?.storage?.local;
const session = () => globalThis.chrome?.storage?.session;

async function read(key, fallback) {
	try {
		const stored = await local().get(key);
		return stored[key] ?? fallback;
	} catch {
		return fallback;
	}
}

async function write(key, value) {
	try {
		await local().set({ [key]: value });
	} catch {
		// Storage can fail (quota, a closed context); the offers are a nicety, never a reason to break the page.
	}
}

const count = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

export async function getLog() {
	const log = await read(LOG_KEY, []);
	return Array.isArray(log) ? log : [];
}

async function getOffers() {
	const offers = await read(OFFERS_KEY, {});
	return { snooze: {}, accountAsks: 0, lastOfferAt: null, receiptRung: 0, year: null, ...offers };
}

// One print window closed for this article. Call it once per print (not for Save as PDF).
export async function recordPrint({ url, design, pages, screens, words, photos } = {}) {
	const log = await getLog();
	log.push({
		t: clock.now(),
		h: hashURL(url),
		design: design?.id || design || null,
		pages: count(pages),
		screens: count(screens) || null,
		words: count(words),
		photos: count(photos)
	});
	await write(LOG_KEY, log.slice(-LOG_LIMIT));
	return log.length;
}

export async function distinctArticles() {
	return new Set((await getLog()).map(entry => entry.h)).size;
}

// What the done state needs to know about the print that just closed.
export async function lastPrint() {
	const log = await getLog();
	const last = log[log.length - 1] || null;
	const distinct = new Set(log.map(entry => entry.h)).size;
	const isNew = !!last && log.findIndex(entry => entry.h == last.h) == log.length - 1;
	return { last, prints: log.length, distinct, isNew };
}

export function milestoneEyebrow(n) {
	return MILESTONES.includes(n) ? `${n} ARTICLES ON PAPER` : "PRINT WINDOW CLOSED";
}

// A failed print or a "Print again": no offer for the rest of this browser session.
export async function markFailure() {
	blockedHere = true;
	try {
		await session().set({ [BLOCK_KEY]: true });
	} catch {
		// The flag above still holds for this page.
	}
}

async function isBlocked() {
	if (blockedHere) return true;
	try {
		return !!(await session().get(BLOCK_KEY))[BLOCK_KEY];
	} catch {
		return false;
	}
}

// The year a yearly card is about, when today is in its window (1 Dec to 15 Jan), else null.
export function yearWindow(date = new Date(clock.now())) {
	if (date.getMonth() == 11) return date.getFullYear();
	if (date.getMonth() == 0 && date.getDate() <= 15) return date.getFullYear() - 1;
	return null;
}

export async function yearlyDue() {
	const year = yearWindow();
	return year != null && (await getOffers()).year !== year;
}

const startOfDay = time => {
	const day = new Date(time);
	day.setHours(0, 0, 0, 0);
	return day.getTime();
};

// The offer for this done state, or null. Call it once per done state: it books the offer as shown.
// keptPick: the user printed the engine's pick (the review ask waits for a print where the pick was right).
export async function nextOffer({ account, lockedClicked = false, keptPick = true } = {}) {
	const log = await getLog();
	const prints = log.length;
	if (prints <= 1 || await isBlocked()) return null;
	const offers = await getOffers();
	if (offers.lastOfferAt != null && prints - offers.lastOfferAt < SPACING) return null;
	const snoozed = type => prints < (offers.snooze[type] || 0);
	const guest = !account || account.state == "guest";
	const last = log[prints - 1];
	const distinct = new Set(log.map(entry => entry.h)).size;
	const today = startOfDay(clock.now());
	const distinctToday = new Set(log.filter(entry => entry.t >= today).map(entry => entry.h)).size;

	let offer = null;
	if (guest && lockedClicked && !snoozed("account")) {
		offer = { type: "account", unlock: true };
	} else if (yearWindow() != null && offers.year !== yearWindow() && distinct >= MILESTONES[0] && !snoozed("year")) {
		offer = { type: "year", year: yearWindow() };
	} else if (guest && distinct >= ACCOUNT_AT && offers.accountAsks < ACCOUNT_ASKS && !snoozed("account")) {
		offer = { type: "account" };
	} else {
		const rungs = guest ? RECEIPT_RUNGS : [...RECEIPT_RUNGS, 10];
		const rung = Math.max(0, ...rungs.filter(n => n <= distinct));
		const measured = last.screens && last.pages && last.screens > last.pages;
		if (measured && rung > offers.receiptRung && !snoozed("receipt")) {
			offer = { type: "receipt", rung };
		} else if (keptPick && (distinct >= 3 || distinctToday >= 2) && !snoozed("review") && !await read(REVIEW_KEY, null)) {
			offer = { type: "review" };
		}
	}
	if (!offer) return null;

	offers.lastOfferAt = prints;
	if (offer.type == "account") offers.accountAsks += 1;
	if (offer.type == "receipt") offers.receiptRung = offer.rung;
	if (offer.type == "year") offers.year = offer.year;
	if (offer.type == "review") await write(REVIEW_KEY, { at: clock.now() });
	await write(OFFERS_KEY, offers);
	return offer;
}

// "Not now": that offer type waits 10 prints.
export async function dismissOffer(type) {
	const offers = await getOffers();
	offers.snooze = { ...offers.snooze, [type]: (await getLog()).length + SNOOZE };
	await write(OFFERS_KEY, offers);
}

// The review link was opened (kept locally only, for our own record; it is never sent).
export async function markReviewOpened() {
	await write(REVIEW_KEY, { ...await read(REVIEW_KEY, {}), opened: clock.now() });
}

// The counts behind Settings "Your prints": milestone dates and this month / this year, by distinct article.
export async function printStats() {
	const log = await getLog();
	const seen = new Set();
	const rungs = MILESTONES.map(n => ({ n, at: null }));
	for (const entry of log) {
		if (seen.has(entry.h)) continue;
		seen.add(entry.h);
		const rung = rungs.find(item => item.n == seen.size);
		if (rung) rung.at = entry.t;
	}
	const now = new Date(clock.now());
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
	return {
		articles: seen.size,
		rungs,
		month: periodStats(log, monthStart),
		year: periodStats(log, yearStart),
		since: log[0]?.t ?? null
	};
}

// Each article counts once in a period, with its latest print (a reprint replaces, it does not add).
export function periodStats(log, from, to = Infinity) {
	const latest = new Map();
	for (const entry of log) if (entry.t >= from && entry.t < to) latest.set(entry.h, entry);
	let pages = 0, words = 0;
	for (const entry of latest.values()) {
		pages += entry.pages || 0;
		words += entry.words || 0;
	}
	return { articles: latest.size, pages, words, hours: Math.round(words / WORDS_PER_MINUTE / 60 * 10) / 10 };
}

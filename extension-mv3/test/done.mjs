// Node-only tests of the print log and the offer scheduler (src/offers.js), with a fake chrome.storage.
// Run `node test/done.mjs`.
import assert from "node:assert/strict";

function area() {
	let data = {};
	return {
		async get(key) {
			const keys = key == null ? Object.keys(data) : [].concat(key);
			return Object.fromEntries(keys.filter(name => name in data).map(name => [name, structuredClone(data[name])]));
		},
		async set(items) { data = { ...data, ...structuredClone(items) }; },
		clear() { data = {}; },
		dump() { return data; }
	};
}
globalThis.chrome = { storage: { local: area(), session: area() } };

const offers = await import("../src/offers.js");
const { recordPrint, nextOffer, dismissOffer, distinctArticles, milestoneEyebrow, markFailure, yearlyDue, yearWindow, printStats, lastPrint, hashURL, clock } = offers;

const GUEST = { state: "guest" };
const FREE = { state: "free" };
const BASE_TIME = new Date(2026, 9, 8, 9, 0).getTime();   // 8 Oct 2026: outside the yearly window
const DAY = 864e5;
let now = BASE_TIME;
clock.now = () => now;

const tests = [];
const test = (name, run) => tests.push({ name, run });

// A fresh browser: empty storage, and a fresh module so the in-page failure flag is clear.
let mod = offers;
async function fresh() {
	chrome.storage.local.clear();
	chrome.storage.session.clear();
	now = BASE_TIME;
	mod = await import(`../src/offers.js?fresh=${Math.random()}`);
	mod.clock.now = () => now;
	return mod;
}
// Print n distinct articles (one per day so the "2nd today" review rule stays out of the way unless asked).
async function printArticles(count, { from = 0, screens = 14, pages = 5, perDay = 1, sameDay = false } = {}) {
	for (let i = from; i < from + count; i++) {
		if (!sameDay && i % perDay == 0) now += DAY;
		await mod.recordPrint({ url: `https://example.com/a/${i}`, design: "broadsheet", pages, screens, words: 2100, photos: 4 });
	}
}
// The offer types a run of prints gets, one nextOffer per done state.
async function offersFor(count, options) {
	const seen = [];
	for (let i = 0; i < count; i++) {
		await printArticles(1, { from: 1000 + i });
		const offer = await mod.nextOffer(options);
		seen.push(offer?.type || null);
	}
	return seen;
}

test("hash is short, stable and not the URL", () => {
	const hash = hashURL("https://www.theguardian.com/world/2026/oct/08/story");
	assert.match(hash, /^[0-9a-f]{8}$/);
	assert.equal(hash, hashURL("https://www.theguardian.com/world/2026/oct/08/story"));
	assert.notEqual(hash, hashURL("https://www.theguardian.com/world/2026/oct/08/story2"));
});

test("the log stores no title and no URL", async () => {
	await fresh();
	await mod.recordPrint({ url: "https://example.com/secret-story", title: "Secret story", design: { id: "classic", name: "Classic" }, pages: 3, screens: 9, words: 800, photos: 1 });
	const text = JSON.stringify(chrome.storage.local.dump());
	assert.doesNotMatch(text, /example\.com|secret|Secret/);
	const [entry] = (await chrome.storage.local.get("sbPrintLog")).sbPrintLog;
	assert.deepEqual(Object.keys(entry).sort(), ["design", "h", "pages", "photos", "screens", "t", "words"]);
	assert.equal(entry.design, "classic");
});

test("distinctArticles counts articles, not print windows", async () => {
	await fresh();
	await mod.recordPrint({ url: "https://example.com/a", pages: 2 });
	await mod.recordPrint({ url: "https://example.com/a", pages: 2 });
	await mod.recordPrint({ url: "https://example.com/b", pages: 2 });
	assert.equal(await mod.distinctArticles(), 2);
	const state = await mod.lastPrint();
	assert.equal(state.prints, 3);
	assert.equal(state.isNew, true);
	await mod.recordPrint({ url: "https://example.com/a", pages: 2 });
	assert.equal((await mod.lastPrint()).isNew, false);
});

test("no offer on the first print, even after a locked click", async () => {
	await fresh();
	await printArticles(1);
	assert.equal(await mod.nextOffer({ account: GUEST, lockedClicked: true }), null);
});

test("a locked click brings the account offer on the 2nd print", async () => {
	await fresh();
	await printArticles(2);
	assert.equal((await mod.nextOffer({ account: GUEST, lockedClicked: true }))?.type, "account");
});

test("account offers never go to an account", async () => {
	await fresh();
	await printArticles(12);
	const offer = await mod.nextOffer({ account: FREE, lockedClicked: true });
	assert.notEqual(offer?.type, "account");
});

test("at most one offer in any 3 prints", async () => {
	await fresh();
	await printArticles(1);
	const seen = await offersFor(12, { account: GUEST, lockedClicked: true });
	const at = seen.map((type, i) => type ? i : -1).filter(i => i >= 0);
	assert.ok(at.length >= 2, `expected several offers, got ${seen}`);
	for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 3, `offers too close: ${seen}`);
});

test("the review ask comes at the 3rd distinct article, once ever", async () => {
	await fresh();
	await printArticles(2);
	assert.equal(await mod.nextOffer({ account: FREE }), null);
	await printArticles(1, { from: 2 });
	assert.equal((await mod.nextOffer({ account: FREE }))?.type, "review");
	assert.ok((await chrome.storage.local.get("reviewAsk")).reviewAsk);
	const later = await offersFor(30, { account: FREE });
	assert.ok(!later.includes("review"), `review asked twice: ${later}`);
});

test("the review ask comes at the 2nd distinct article on the same day", async () => {
	await fresh();
	now += DAY;
	await printArticles(2, { sameDay: true });
	assert.equal((await mod.nextOffer({ account: FREE }))?.type, "review");
});

test("the review ask waits for a print where the pick was kept", async () => {
	await fresh();
	await printArticles(3);
	assert.equal(await mod.nextOffer({ account: FREE, keptPick: false }), null);
});

test("a reprint of one article does not reach the review milestone", async () => {
	await fresh();
	for (let i = 0; i < 6; i++) {
		now += DAY;
		await mod.recordPrint({ url: "https://example.com/same", pages: 5, screens: 14 });
	}
	assert.equal(await mod.distinctArticles(), 1);
	assert.equal(await mod.nextOffer({ account: FREE }), null);
});

test("the receipt comes at 5 distinct articles, only with a measured saving", async () => {
	await fresh();
	await printArticles(4);
	await chrome.storage.local.set({ reviewAsk: { at: 1 } });           // review already asked
	await printArticles(1, { from: 4, screens: null });
	assert.equal(await mod.nextOffer({ account: GUEST }), null, "no receipt without screens");
	await printArticles(1, { from: 5 });
	assert.deepEqual(await mod.nextOffer({ account: GUEST }), { type: "receipt", rung: 5 });
});

test("no receipt when the screens are not more than the pages", async () => {
	await fresh();
	await chrome.storage.local.set({ reviewAsk: { at: 1 } });
	await printArticles(5, { screens: 3, pages: 4 });
	assert.equal(await mod.nextOffer({ account: GUEST }), null);
});

test("receipt rungs: 10 is for account users; guests get the account ask at 10", async () => {
	await fresh();
	await chrome.storage.local.set({ reviewAsk: { at: 1 } });
	await printArticles(10);
	assert.deepEqual(await mod.nextOffer({ account: FREE }), { type: "receipt", rung: 10 });

	await fresh();
	await chrome.storage.local.set({ reviewAsk: { at: 1 } });
	await printArticles(10);
	assert.deepEqual(await mod.nextOffer({ account: GUEST }), { type: "account" });
});

test("receipt again at 25, 50, 100", async () => {
	await fresh();
	await chrome.storage.local.set({ reviewAsk: { at: 1 } });
	const rungs = [];
	for (let i = 0; i < 100; i++) {
		await printArticles(1, { from: i });
		const offer = await mod.nextOffer({ account: FREE });
		if (offer?.type == "receipt") rungs.push(offer.rung);
	}
	assert.deepEqual(rungs, [5, 10, 25, 50, 100]);
});

test("the account ask shows at most 3 times without a locked click", async () => {
	await fresh();
	await chrome.storage.local.set({ reviewAsk: { at: 1 } });
	await printArticles(9, { screens: null });
	let asks = 0;
	for (let i = 0; i < 40; i++) {
		await printArticles(1, { from: 100 + i, screens: null });
		if ((await mod.nextOffer({ account: GUEST }))?.type == "account") asks++;
	}
	assert.equal(asks, 3);
	// After the cap, a locked click still opens it.
	await printArticles(3, { from: 500, screens: null });
	assert.equal((await mod.nextOffer({ account: GUEST, lockedClicked: true }))?.type, "account");
});

test("\"Not now\" pushes that offer back 10 prints", async () => {
	await fresh();
	await printArticles(2);
	assert.equal((await mod.nextOffer({ account: GUEST, lockedClicked: true }))?.type, "account");
	await mod.dismissOffer("account");
	const seen = await offersFor(9, { account: GUEST, lockedClicked: true, keptPick: false });
	assert.ok(!seen.includes("account"), `account came back too soon: ${seen}`);
	await printArticles(1, { from: 900 });
	assert.equal((await mod.nextOffer({ account: GUEST, lockedClicked: true }))?.type, "account");
});

test("priority: unlock > account > receipt > review", async () => {
	// At 10 distinct with a measured saving and no review asked yet, a guest gets the account ask.
	await fresh();
	await printArticles(10);
	assert.equal((await mod.nextOffer({ account: GUEST }))?.type, "account");
	// With a locked click it is the unlock (also the account type).
	await fresh();
	await printArticles(10);
	assert.deepEqual(await mod.nextOffer({ account: GUEST, lockedClicked: true }), { type: "account", unlock: true });
	// An account user at 5 with no review yet: receipt first.
	await fresh();
	await printArticles(5);
	assert.equal((await mod.nextOffer({ account: FREE }))?.type, "receipt");
});

test("no offer after a failure or a Print again in this session", async () => {
	await fresh();
	await printArticles(2);
	await mod.markFailure();
	assert.equal(await mod.nextOffer({ account: GUEST, lockedClicked: true }), null);
	// The flag lives in chrome.storage.session, so another print page in this session sees it too.
	const other = await import(`../src/offers.js?other=${Math.random()}`);
	other.clock.now = () => now;
	await printArticles(3, { from: 50 });
	assert.equal(await other.nextOffer({ account: GUEST, lockedClicked: true }), null);
	// A new browser session clears it.
	chrome.storage.session.clear();
	assert.equal((await other.nextOffer({ account: GUEST, lockedClicked: true }))?.type, "account");
});

test("one offer per state: a call returns one object with one type", async () => {
	await fresh();
	await printArticles(10);
	const offer = await mod.nextOffer({ account: GUEST, lockedClicked: true });
	assert.equal(typeof offer.type, "string");
	assert.equal(await mod.nextOffer({ account: GUEST, lockedClicked: true }), null, "a second call on the same print gets nothing");
});

test("milestone eyebrows", () => {
	assert.equal(milestoneEyebrow(1), "PRINT WINDOW CLOSED");
	assert.equal(milestoneEyebrow(3), "3 ARTICLES ON PAPER");
	assert.equal(milestoneEyebrow(4), "PRINT WINDOW CLOSED");
	for (const n of [5, 10, 25, 50, 100]) assert.equal(milestoneEyebrow(n), `${n} ARTICLES ON PAPER`);
});

test("yearly window: 1 Dec to 15 Jan, once per year", async () => {
	assert.equal(yearWindow(new Date(2026, 10, 30)), null);
	assert.equal(yearWindow(new Date(2026, 11, 1)), 2026);
	assert.equal(yearWindow(new Date(2027, 0, 15)), 2026);
	assert.equal(yearWindow(new Date(2027, 0, 16)), null);
	await fresh();
	now = new Date(2026, 10, 20).getTime();
	await printArticles(4);
	now = new Date(2026, 11, 2).getTime();
	assert.equal(await mod.yearlyDue(), true);
	await printArticles(1, { from: 10, sameDay: true });
	assert.deepEqual(await mod.nextOffer({ account: FREE }), { type: "year", year: 2026 });
	assert.equal(await mod.yearlyDue(), false);
	now = new Date(2027, 0, 10).getTime();
	assert.equal(await mod.yearlyDue(), false, "the same year is not due twice");
	now = new Date(2027, 11, 3).getTime();
	assert.equal(await mod.yearlyDue(), true);
});

test("printStats: milestone dates and month/year counts by distinct article", async () => {
	await fresh();
	now = new Date(2026, 8, 20).getTime();
	await printArticles(3);                                  // 21, 22, 23 Sep
	now = new Date(2026, 9, 1).getTime();
	await printArticles(2, { from: 3 });                     // 2, 3 Oct
	await mod.recordPrint({ url: "https://example.com/a/4", pages: 5, words: 2100 });   // reprint in October
	now = new Date(2026, 9, 8).getTime();
	const stats = await mod.printStats();
	assert.equal(stats.articles, 5);
	assert.equal(new Date(stats.rungs.find(rung => rung.n == 3).at).getDate(), 23);
	assert.equal(new Date(stats.rungs.find(rung => rung.n == 5).at).getDate(), 3);
	assert.equal(stats.rungs.find(rung => rung.n == 10).at, null);
	assert.deepEqual([stats.month.articles, stats.month.pages, stats.month.words], [2, 10, 4200]);
	assert.equal(stats.year.articles, 5);
	assert.equal(stats.year.minutes, Math.round(5 * 2100 / 230));
});

test("reading time: whole minutes, hours from minutes, nothing at 0", async () => {
	await fresh();
	await mod.recordPrint({ url: "https://example.com/short", pages: 1, words: 900 });
	const stats = await mod.printStats();
	assert.equal(stats.month.minutes, 4, "one short article is 4 minutes, not 0");
	assert.deepEqual(mod.readingTime(stats.month.minutes), ["4", "minutes of reading"]);
	assert.deepEqual(mod.readingTime(1), ["1", "minute of reading"]);
	assert.deepEqual(mod.readingTime(59), ["59", "minutes of reading"]);
	assert.deepEqual(mod.readingTime(60), ["1", "hour of reading"]);
	assert.deepEqual(mod.readingTime(90), ["1.5", "hours of reading"]);
	assert.deepEqual(mod.readingTime(438), ["7.3", "hours of reading"]);
	for (const none of [0, null, undefined, NaN]) assert.equal(mod.readingTime(none), null);
	await fresh();
	await mod.recordPrint({ url: "https://example.com/no-words", pages: 2 });
	assert.equal((await mod.printStats()).month.minutes, 0);
});

let failed = 0;
for (const { name, run } of tests) {
	try {
		await run();
		console.log(`ok   ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL ${name}\n     ${error.message.split("\n").join("\n     ")}`);
	}
}
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
process.exit(failed ? 1 : 0);

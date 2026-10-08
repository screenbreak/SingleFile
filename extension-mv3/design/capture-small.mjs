// Screenshots and checks for the small surfaces (free tier): the popup in each account state, the welcome page,
// "What's new", and the status cards (guest Save door, saved, printed, library full).
// Run from extension-mv3: `npm run build && node design/capture-small.mjs` (writes design/after/small/).
// Account states come from a stand-in `/api/v1/me/` (page.route); test/server.mjs stays as it is.
import { chromium } from "playwright";
import { start, log } from "../test/server.mjs";
import * as STATUS from "../src/status-copy.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXT = new URL("../dist", import.meta.url).pathname;
const OUT = process.argv[2] || "design/after/small";
mkdirSync(OUT, { recursive: true });
// SB_CAPTURE_PORT, or a free port picked by the system, so it can run next to `npm test` and design/capture.mjs.
const server = await start(Number(process.env.SB_CAPTURE_PORT) || 0);
const BASE = `http://localhost:${server.address().port}`, ARTICLE = BASE + "/article.html";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { alignment: {}, checks: [] };
const ok = (surface, name, pass, values) => report.checks.push({ surface, name, ok: Boolean(pass), values });
// A check that can't run on this build says why instead of passing or failing in silence.
const skip = (surface, name, why) => report.checks.push({ surface, name, ok: true, skipped: why });
const INK = "rgb(22, 26, 24)", INK_2 = "rgb(74, 82, 80)", ACCENT = "rgb(0, 93, 76)", WHITE = "rgb(255, 255, 255)";

// Whether plans.js `getAccount` passes the Plus article count on (FIX-1 P11). The popup reads it from there only.
const accountHasArticles = await (async () => {
	const { getAccount } = await import("../src/plans.js");
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify({ email: "a@b.c", plan: "plus", articles: 214 }), { status: 200, headers: { "Content-Type": "application/json" } });
	try {
		return (await getAccount("http://localhost")).articles == 214;
	} finally {
		globalThis.fetch = realFetch;
	}
})();

// Left edge of the text inside an element (first text node), or of the box for controls and cards.
const MEASURE = selectors => selectors.map(selector => {
	const element = document.querySelector(selector);
	if (!element || !element.getClientRects().length) return { selector, missing: true };
	let box = element.getBoundingClientRect();
	const isBox = ["IMG", "svg", "INPUT", "BUTTON"].includes(element.tagName) || element.matches(".segmented, .track, .keycaps, .choice-body, .check, .pill, .sample-card, .icon");
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() ? 1 : 3 });
	const text = isBox ? null : walker.nextNode();
	if (text) { const range = document.createRange(); range.selectNodeContents(text); const rect = range.getClientRects()[0]; if (rect) box = rect; }
	return { selector, left: Math.round(box.left * 10) / 10 };
});

// Every present selector in a group starts on `x` (or on one shared x when `x` is null), within half a pixel.
function edge(surface, measures, groups) {
	for (const [name, { x, selectors }] of Object.entries(groups)) {
		const found = selectors.map(selector => measures.find(measure => measure.selector == selector)).filter(measure => measure && !measure.missing);
		const values = Object.fromEntries(found.map(measure => [measure.selector, measure.left]));
		const lefts = found.map(measure => measure.left);
		const target = x ?? lefts[0];
		ok(surface, name, lefts.length > 1 && lefts.every(left => Math.abs(left - target) <= 0.5), values);
	}
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-small-")), {
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
	headless: true, deviceScaleFactor: 2, viewport: { width: 1280, height: 900 },
	args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
// The stand-in "who am I": null = a guest (404), else the JSON the webapp will send (webapp#103).
let me = null;
await context.route(`${BASE}/api/v1/me/`, route => me
	? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me) })
	: route.fulfill({ status: 404, body: "" }));
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const id = worker.url().split("/")[2];
	const ext = path => `chrome-extension://${id}/${path}`;
	await sleep(1500);
	for (const page of context.pages()) if (page.url().includes("welcome.html")) await page.close();

	const ctl = await context.newPage();
	await ctl.goto(ext("options.html"));
	await ctl.evaluate(base => chrome.storage.sync.set({ serverUrl: base, defaultAction: "ask", saveWhenPrinting: false }), BASE);
	const tabOf = url => ctl.evaluate(async url => (await chrome.tabs.query({ url }))[0], url);

	// Popup, opened in a tab of its own for the article tab.
	const article = await context.newPage();
	await article.goto(ARTICLE);
	const articleTab = await tabOf(ARTICLE);
	const popup = await context.newPage();
	// Taller than any popup state, so the account row and the footer are always in the shot.
	await popup.setViewportSize({ width: 320, height: 700 });
	let meRequests = 0;
	popup.on("request", request => request.url().endsWith("/api/v1/me/") && meRequests++);
	const shootPopup = async (name, hash = "") => {
		await popup.goto("about:blank");
		meRequests = 0;
		await popup.goto(ext("popup.html?tabId=" + articleTab.id + hash));
		await popup.waitForSelector("body[data-account]", { timeout: 15000 });
		await sleep(700);
		// The body's own height: the root element is at least the 700 px viewport.
		const { height, footBottom } = await popup.evaluate(() => ({ height: Math.ceil(document.body.getBoundingClientRect().bottom), footBottom: document.querySelector(".foot").getBoundingClientRect().bottom }));
		await popup.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: 320, height } });
		ok("popup " + name, "account row and footer in the shot", height <= 700 && footBottom <= height, { height, footBottom });
		ok("popup " + name, "one /api/v1/me/ call", meRequests == 1, { meRequests });
		return popup.evaluate(() => document.body.innerText);
	};
	const popupEdges = async surface => {
		const measures = await popup.evaluate(MEASURE, [".wordmark", ".actions-label", ".row[data-action=print] .icon", ".row[data-action=save] .icon", "#default-label", ".default .segmented", ".consequence", ".account-line", ".account-link", ".email", ".count", ".library", ".settings", ".notice-title", ".notice-text",
			".row[data-action=print] .row-title", ".row[data-action=print] .row-desc", ".row[data-action=save] .row-title", ".row[data-action=save] .row-desc", ".also-save .track"]);
		report.alignment[surface] = measures;
		edge(surface, measures, {
			"one edge x16": { x: 16, selectors: [".wordmark", ".actions-label", ".row[data-action=print] .icon", ".row[data-action=save] .icon", "#default-label", ".default .segmented", ".consequence", ".account-line", ".account-link", ".email", ".count", ".settings", ".notice-title", ".notice-text"] },
			"row text x48": { x: 48, selectors: [".row[data-action=print] .row-title", ".row[data-action=print] .row-desc", ".row[data-action=save] .row-title", ".row[data-action=save] .row-desc", ".also-save .track"] }
		});
	};
	const noPrintCount = (surface, text) => ok(surface, "no print count, no banned words", !/\b\d+\s+(free\s+)?prints?\b|prints? left|\bpile\b|\bpro\b|premium|upgrade|quota/i.test(text), null);

	let text = await shootPopup("p01-popup-guest.png");
	await popupEdges("popup guest");
	noPrintCount("popup guest", text);
	ok("popup guest", "print row first", (await popup.evaluate(() => document.querySelector(".row").dataset.action)) == "print", null);
	ok("popup guest", "guest copy", text.includes("Needs a free account") && text.includes("Printing never needs an account.") && text.includes("Get all 11 designs, free →") && !text.includes("Also save what I print") && !text.includes("My articles"), null);
	ok("popup guest", "account link opens sign-up", (await popup.getAttribute(".account-link", "href")) == `${BASE}/signup/?from=extension`, null);
	const icons = await popup.evaluate(() => ["print", "save"].map(action => getComputedStyle(document.querySelector(`.row[data-action=${action}] .icon`)).color));
	ok("popup guest", "green on the Print icon only, Save icon in ink-2", icons[0] == ACCENT && icons[1] == INK_2, icons);
	await popup.click("input[name=defaultAction][value=save]");
	await popup.screenshot({ path: join(OUT, "p02-popup-guest-click-save.png") });
	ok("popup guest", "Save click action says it needs an account", (await popup.textContent(".consequence")) == "Save needs a free account.", null);
	await popup.evaluate(() => chrome.storage.sync.set({ defaultAction: "ask" }));

	text = await shootPopup("p03-popup-unsupported.png", "#unsupported-print");
	await popupEdges("popup unsupported");
	ok("popup unsupported", "rows aria-disabled", (await popup.evaluate(() => [...document.querySelectorAll(".row")].every(row => row.getAttribute("aria-disabled") == "true"))), null);
	const pagesBefore = context.pages().length;
	await popup.focus(".row[data-action=print]");
	await popup.keyboard.press("Enter");
	await sleep(800);
	ok("popup unsupported", "Enter on a disabled row does nothing", context.pages().length == pagesBefore && !popup.isClosed(), null);

	me = { email: "yorgos@example.com", plan: "free", saves_used: 12, saves_limit: 50 };
	text = await shootPopup("p04-popup-free.png");
	await popupEdges("popup free");
	noPrintCount("popup free", text);
	ok("popup free", "free copy", text.includes("12 of 50 saved") && text.includes("Open my library") && text.includes("Also save what I print") && /FREE/.test(text), null);
	ok("popup free", "count muted under 80%", !(await popup.evaluate(() => document.querySelector(".count").classList.contains("is-high"))), null);
	me = { ...me, saves_used: 42 };
	await shootPopup("p05-popup-free-nearly-full.png");
	ok("popup free 84%", "count in ink from 80%", await popup.evaluate(() => getComputedStyle(document.querySelector(".count")).color == "rgb(22, 26, 24)"), null);
	me = { ...me, saves_used: 50 };
	text = await shootPopup("p06-popup-free-full.png");
	ok("popup free full", "library full row", text.includes("Your library is full (50 of 50)") && text.includes("Plus keeps everything"), null);
	me = { ...me, saves_used: 12 };
	await ctl.evaluate(async ({ url }) => {
		const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
		const key = Array.from(new Uint8Array(digest).slice(0, 8), byte => byte.toString(16).padStart(2, "0")).join("");
		await chrome.storage.local.set({ savedPages: { [key]: { at: new Date(2026, 9, 3).getTime(), articleURL: "http://localhost/articles/abc123/" } } });
	}, { url: ARTICLE });
	text = await shootPopup("p07-popup-free-already-saved.png");
	ok("popup free saved", "already saved line", text.includes("Saved 3 Oct · Open ↗"), null);
	await ctl.evaluate(() => chrome.storage.local.remove("savedPages"));
	me = { email: "a.very.long.reader.name.for.testing@longdomain.example.com", plan: "plus", articles: 214 };
	text = await shootPopup("p08-popup-plus-long-email.png");
	await popupEdges("popup plus");
	ok("popup plus", "plus copy", /PLUS/.test(text) && text.includes("Keep it for later") && text.includes("…") && text.includes("Open my library"), null);
	if (accountHasArticles) {
		ok("popup plus", "article count from getAccount", text.includes("214 articles"), null);
	} else {
		skip("popup plus", "article count from getAccount", "plans.js getAccount does not pass `articles` on yet (fixer P, FIX-1 P11)");
	}
	ok("popup plus", "email fits on one line", await popup.evaluate(() => { const email = document.querySelector(".email"); return email.scrollWidth <= email.clientWidth + 1; }), null);
	me = null;

	// Welcome (guest), What's new (signed out and signed in), and 375 px.
	const welcome = await context.newPage();
	const welcomeSelectors = [".wordmark", ".intro-title", ".intro-text", "#try-heading", ".sample-card", ".after-card", "#click-heading", ".click .section-text", ".choice-body", "#keys-heading", ".shortcut-name", ".door .eyebrow", "#door-heading", ".door .section-text", ".door-email", ".door-note", "#done-heading", ".status-list .check", ".close-tab", ".friend", "#new-heading", ".list .tag", ".signed-in"];
	const shootWelcome = async (name, hash, surface) => {
		await welcome.goto("about:blank");
		await welcome.goto(ext("welcome.html" + hash));
		await welcome.waitForSelector("body[data-account]", { timeout: 15000 });
		await sleep(400);
		await welcome.screenshot({ path: join(OUT, name), fullPage: true });
		const measures = await welcome.evaluate(MEASURE, welcomeSelectors);
		report.alignment[surface] = measures;
		edge(surface, measures, { "one column edge": { x: null, selectors: welcomeSelectors } });
		return welcome.evaluate(() => document.body.innerText);
	};
	text = await shootWelcome("w01-welcome-guest.png", "", "welcome guest");
	noPrintCount("welcome guest", text);
	ok("welcome guest", "guest copy", text.includes("No sign-up needed. Print right away.") && text.includes("Open the sample and print it") && text.includes("Your free Screenbreak account") && text.includes("Continue with Google") && text.includes("Printed your first article") && text.includes("Know someone who prints articles? Send them myscreenbreak.com.") && !text.includes("Two things it does") && !text.includes("Saving needs an account"), null);
	ok("welcome guest", "door opens sign-up with next", (await welcome.getAttribute(".door-email", "href")).startsWith(`${BASE}/signup/?from=extension&next=`), null);
	ok("welcome guest", "printed check empty before a print", !(await welcome.evaluate(() => document.querySelector("[data-check=printed]").classList.contains("is-done"))), null);
	const selected = await welcome.evaluate(() => { const body = getComputedStyle(document.querySelector(".choice input:checked + .choice-body")); return { edge: body.borderTopColor, fill: body.backgroundColor, shadow: body.boxShadow }; });
	ok("welcome guest", "selected choice: ink edge on the surface, no green", selected.edge == INK && selected.fill == WHITE && selected.shadow.includes(INK), selected);
	const badges = await welcome.evaluate(() => [...new Set([...document.querySelectorAll(".badge")].map(badge => getComputedStyle(badge).backgroundColor))]);
	ok("welcome guest", "step badges in ink-2", badges.length == 1 && badges[0] == INK_2, badges);
	me = { email: "yorgos@example.com", plan: "free", saves_used: 12, saves_limit: 50 };
	text = await shootWelcome("w02-welcome-free.png", "", "welcome free");
	ok("welcome free", "no door, account ticked, also-save shown", !text.includes("Continue with email") && text.includes("Also save what I print") && await welcome.evaluate(() => document.querySelector("[data-check=account]").classList.contains("is-done")), null);
	me = null;
	text = await shootWelcome("w03-whats-new-signed-out.png", "#updated", "what's new signed out");
	ok("what's new signed out", "copy and door", text.includes("Screenbreak now prints.") && text.includes("Sign in to see your library") && text.includes("Continue with email") && !text.includes("When you click the button"), null);
	const asks = await welcome.evaluate(() => ({ heading: document.querySelector("#door-heading").textContent, signInMentions: document.body.innerText.split("Sign in to see your library").length - 1, emailButtons: document.body.innerText.split("Continue with email").length - 1, line: !document.querySelector(".signed-in").hidden }));
	ok("what's new signed out", "one ask: the door, headed \"Sign in to see your library\"", asks.heading == "Sign in to see your library" && asks.signInMentions == 1 && asks.emailButtons == 1 && !asks.line, asks);
	ok("what's new signed out", "tags in ink-2", await welcome.evaluate(() => [...document.querySelectorAll(".list .tag")].every(tag => getComputedStyle(tag).color == "rgb(74, 82, 80)")), null);
	me = { email: "yorgos@example.com", plan: "free" };
	text = await shootWelcome("w04-whats-new-signed-in.png", "#updated", "what's new signed in");
	ok("what's new signed in", "signed in, no door", text.includes("Signed in as yorgos@example.com") && !text.includes("Continue with email"), null);
	me = null;
	await welcome.setViewportSize({ width: 375, height: 812 });
	await shootWelcome("w05-welcome-375.png", "", "welcome 375");
	ok("welcome 375", "no sideways scroll", await welcome.evaluate(() => document.documentElement.scrollWidth <= innerWidth), null);
	await welcome.setViewportSize({ width: 1280, height: 900 });

	// Status cards on the article: the shadow root is opened so the card can be measured.
	await ctl.evaluate(async tabId => {
		await chrome.scripting.executeScript({ target: { tabId }, func: () => {
			const attach = Element.prototype.attachShadow;
			Element.prototype.attachShadow = function (init) { return attach.call(this, { ...init, mode: "open" }); };
		} });
		await chrome.scripting.executeScript({ target: { tabId }, files: ["content-print.js"] });
	}, articleTab.id);
	await article.bringToFront();
	const card = () => article.evaluate(() => {
		const root = document.querySelector("screenbreak-status")?.shadowRoot;
		if (!root) return null;
		const left = selector => { const element = root.querySelector(selector); if (!element || element.hidden || !element.getClientRects().length) return null; const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() ? 1 : 3 }); const text = walker.nextNode(); if (!text) return Math.round(element.getBoundingClientRect().left * 10) / 10; const range = document.createRange(); range.selectNodeContents(text); return Math.round(range.getClientRects()[0].left * 10) / 10; };
		const box = selector => { const element = root.querySelector(selector); return element && !element.closest("[hidden]") && element.getClientRects().length ? Math.round(element.getBoundingClientRect().left * 10) / 10 : null; };
		return { text: root.querySelector(".card").innerText, edges: { title: left(".title"), detail: left(".detail"), quote: left(".quote-title"), actions: box(".actions > *") } };
	});
	const shootCard = async (name, surface) => {
		await sleep(400);
		const viewport = article.viewportSize();
		await article.screenshot({ path: join(OUT, name), clip: { x: viewport.width - 400, y: viewport.height - 300, width: 400, height: 300 } });
		const measured = await card();
		const lefts = Object.values(measured.edges).filter(value => value != null);
		ok(surface, "card text edge", lefts.length > 1 && Math.max(...lefts) - Math.min(...lefts) <= 0.5, measured.edges);
		return measured.text;
	};
	const showCard = value => ctl.evaluate(({ tabId, value }) => chrome.tabs.sendMessage(tabId, { method: "screenbreak.status", status: value }), { tabId: articleTab.id, value });
	await showCard(STATUS.saved({ title: "The Quiet Return of Paper", articleURL: BASE + "/articles/abc123/", saves: { used: 18, limit: 20 } }));
	text = await shootCard("c01-card-saved-meter.png", "card saved 18/20");
	ok("card saved 18/20", "meter line", text.includes("Saved to your library") && text.includes("18 of 20 saves this month"), null);
	await showCard(STATUS.saved({ title: "The Quiet Return of Paper", articleURL: BASE + "/articles/abc123/", saves: { used: 3, limit: 20 } }));
	text = await shootCard("c02-card-saved.png", "card saved");
	ok("card saved", "no meter at low use", !/saves this month/.test(text), null);
	await showCard(STATUS.saveFailed({ kind: "limit" }, { plusURL: BASE + "/plus/" }));
	text = await shootCard("c03-card-library-full.png", "card library full");
	ok("card library full", "copy", text.includes("Your library is full") && text.includes("Plus keeps as many articles as you like. Printing is still free.") && text.includes("See Plus") && text.includes("Print instead") && !/upgrade/i.test(text), null);
	const full = await article.evaluate(() => {
		const root = document.querySelector("screenbreak-status").shadowRoot;
		const card = root.querySelector(".card"), link = root.querySelector(".actions a.primary");
		// The arrow is the link's ::after: its box starts after the label's text, with a gap.
		const range = document.createRange();
		range.selectNodeContents(link.firstChild);
		const textRight = range.getBoundingClientRect().right;
		const arrowGap = Math.round((link.getBoundingClientRect().right - parseFloat(getComputedStyle(link).paddingRight) - textRight) * 10) / 10;
		return { role: card.getAttribute("role"), info: card.classList.contains("info"), icon: getComputedStyle(root.querySelector(".icon")).color, arrow: getComputedStyle(link, "::after").content, gap: getComputedStyle(link).columnGap, arrowGap };
	});
	ok("card library full", "neutral notice: info, role=status, ink-2 icon", full.role == "status" && full.info && full.icon == INK_2, full);
	ok("card library full", "\"See Plus ↗\" keeps a space before the arrow", full.arrow.includes("↗") && parseFloat(full.gap) > 2, full);

	// The guest Save door, for real: Save → the card → Continue with email → the sign-up tab and the stored intent.
	await ctl.evaluate(tab => chrome.runtime.sendMessage({ method: "screenbreak.run", action: "save", tab }), articleTab);
	await article.waitForFunction(() => document.querySelector("screenbreak-status")?.shadowRoot?.querySelector(".card.login"), null, { timeout: 30000 });
	text = await shootCard("c04-card-login-required.png", "card login required");
	ok("card login required", "door copy", text.includes("Save this article to your library") && text.includes("Your library keeps what you print and save, on any computer. Free.") && !/\d+\s+articles/.test(text) && text.includes("Continue with email") && text.includes("Print instead"), null);
	const signUpsBefore = log.filter(line => line.startsWith("GET /signup/")).length;
	await article.evaluate(() => document.querySelector("screenbreak-status").shadowRoot.querySelector(".primary").click());
	for (let i = 0; i < 80 && log.filter(line => line.startsWith("GET /signup/")).length == signUpsBefore; i++) await sleep(250);
	ok("guest save door", "Continue with email opens the sign-up page", log.filter(line => line.startsWith("GET /signup/")).length > signUpsBefore, null);
	await sleep(600);
	const intent = (await ctl.evaluate(() => chrome.storage.session.get("sbIntent"))).sbIntent;
	ok("guest save door", "save intent stored (C-1 shape)", intent && intent.kind == "save" && intent.sourceUrl == ARTICLE && intent.title && intent.created, intent);
	await article.bringToFront();
	text = await shootCard("c05-card-waiting.png", "card waiting");
	ok("card waiting", "copy", text.includes("Waiting for you to sign in") && text.includes("Open the sign-in tab"), null);
	await article.evaluate(() => [...document.querySelector("screenbreak-status").shadowRoot.querySelectorAll(".actions button")].find(button => button.textContent == "Cancel").click());
	await sleep(600);
	ok("guest save door", "Cancel deletes the intent", !(await ctl.evaluate(() => chrome.storage.session.get("sbIntent"))).sbIntent, null);

	// Straight-away print (contract C-5): the print page sends screenbreak.printed; the article tab shows the card.
	await ctl.evaluate(tabId => chrome.runtime.sendMessage({ method: "screenbreak.printed", id: "x", tabId, design: "Broadsheet", pages: 5 }), articleTab.id);
	await article.waitForFunction(() => document.querySelector("screenbreak-status")?.shadowRoot?.querySelector(".title")?.textContent == "Broadsheet, 5 pages", null, { timeout: 10000 });
	text = await shootCard("c06-card-printed.png", "card printed");
	ok("card printed", "copy, no offer", text.includes("Broadsheet, 5 pages") && text.includes("Print again") && !/account|review|library/i.test(text), null);
	const printPagePromise = context.waitForEvent("page", page => page.url().includes("print.html"), { timeout: 30000 });
	await article.evaluate(() => [...document.querySelector("screenbreak-status").shadowRoot.querySelectorAll(".actions button")].find(button => button.textContent == "Print again").click());
	await printPagePromise;
	ok("card printed", "Print again opens the print page", true, null);
	ok("background", "printedOnce set when the print page loads", await (async () => { for (let i = 0; i < 40; i++) { if ((await ctl.evaluate(() => chrome.storage.local.get("printedOnce"))).printedOnce) return true; await sleep(250); } return false; })(), null);
} catch (error) {
	report.error = String(error.stack || error);
	console.error(error); // eslint-disable-line no-console
	process.exitCode = 1;
} finally {
	writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
	for (const check of report.checks) {
		console.log(`${check.skipped ? "skip" : check.ok ? "ok  " : "FAIL"}  ${check.surface}: ${check.name}${check.skipped ? "  (" + check.skipped + ")" : check.values ? "  " + JSON.stringify(check.values) : ""}`); // eslint-disable-line no-console
	}
	if (report.checks.some(check => !check.ok)) process.exitCode = 1;
	await context.close();
	server.close();
}

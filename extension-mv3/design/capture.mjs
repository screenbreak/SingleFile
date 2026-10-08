// Screenshots of the print panel and Settings in every tier and state, plus left-edge checks, for design review.
// Run from extension-mv3: `npm run build && node design/capture.mjs design/after/free-tier`.
// The popup, welcome page and status cards are in design/capture-small.mjs.
//
// Tiers: the stand-in server has no /api/v1/me/ (webapp#103), so a Playwright route answers it: 404 for a guest,
// { plan: "free" | "plus", ... } for an account. test/server.mjs is not changed.
import { chromium } from "playwright";
import { start } from "../test/server.mjs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXT = new URL("../dist", import.meta.url).pathname;
const OUT = process.argv[2] || "design/after/free-tier";
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SB_CAPTURE_PORT) || 8766, BASE = `http://localhost:${PORT}`, ARTICLE = BASE + "/article.html";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { alignment: {}, checks: [] };
const ACCOUNTS = {
	guest: null,
	free: { plan: "free", email: "maria@example.com", name: "Maria Papadopoulou", saves_used: 12, saves_limit: 50 },
	plus: { plan: "plus", email: "maria@example.com", name: "Maria Papadopoulou" }
};
let me = null;

// Left edge of the first glyph inside an element (or of the element's box for controls), relative to a container.
const MEASURE = ({ container, selectors }) => {
	// Measured from inside the container's border (the panel has a 1 px left border).
	const box = document.querySelector(container);
	const origin = box.getBoundingClientRect().left + box.clientLeft;
	return selectors.map(selector => {
		const element = Array.from(document.querySelectorAll(selector)).find(candidate => candidate.getClientRects().length && getComputedStyle(candidate).visibility != "hidden");
		if (!element) return { selector, missing: true };
		let box = element.getBoundingClientRect();
		const isBox = element.matches(".segmented, .button, input, img, iframe, .pick, .door");
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() ? 1 : 3 });
		const text = isBox ? null : walker.nextNode();
		if (text) { const range = document.createRange(); range.selectNodeContents(text); const rect = range.getClientRects()[0]; if (rect) box = rect; }
		return { selector, left: Math.round((box.left - origin) * 10) / 10 };
	});
};

function check(surface, measures, name, selectors, expected) {
	const values = selectors.map(selector => measures.find(measure => measure.selector == selector)).filter(measure => measure && !measure.missing).map(measure => measure.left);
	const missing = selectors.filter(selector => (measures.find(measure => measure.selector == selector) || {}).missing);
	const ok = values.length > 0 && values.every(value => Math.abs(value - expected) <= 0.5);
	report.checks.push({ surface, name, expected, ok, values: Object.fromEntries(selectors.map((selector, index) => [selector, (measures.find(measure => measure.selector == selector) || {}).left ?? "missing"])), missing });
}

// The panel's text edges at 1280: section text at x = 24, card and row text at x = 112 (2 px edge + 10 px padding + 64 px thumbnail column + 12 px).
const PANEL_EDGE = [".panel-head .wordmark", ".intro h1", ".summary", "#picked-heading", "#others-heading", ".all-toggle", "#pictures-label", "[data-name=pictures]", "#paper-label", ".print-button", ".pdf-button"];
const GUEST_EDGE = [".guest-line", "#locked-heading", ".lock-line"];
const CARD_EDGE = [".pick.picked .name", ".pick.picked .why", ".pick.picked .pages", ".others .pick .name", ".others .pick .why"];

// Nothing in the panel may push it sideways (a long pill label): its content is never wider than its box. Under
// 860 px the panel has no box of its own (display: contents), so the page is measured instead.
async function noSideScroll(page, surface) {
	const values = await page.evaluate(() => {
		const panel = document.querySelector(".panel");
		const box = getComputedStyle(panel).display == "contents" ? document.documentElement : panel;
		return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth };
	});
	report.checks.push({ surface, name: "panel scrollWidth == clientWidth", ok: values.scrollWidth == values.clientWidth, values });
}

const server = await start(PORT);
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-capture-")), {
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
	headless: true, deviceScaleFactor: 2, viewport: { width: 1280, height: 900 },
	args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
await context.route(`${BASE}/api/v1/me/`, route => me ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me) }) : route.fulfill({ status: 404, body: "" }));
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const id = worker.url().split("/")[2];
	const ext = path => `chrome-extension://${id}/${path}`;
	await sleep(800);
	for (const page of context.pages()) if (page.url().includes("welcome.html")) await page.close();

	const ctl = await context.newPage();
	await ctl.goto(ext("options.html"));
	await ctl.evaluate(base => chrome.storage.sync.set({ serverUrl: base, print: { design: "best", pictures: "colour", references: "small", paper: "A4", straightAway: false } }), BASE);
	const article = await context.newPage();
	await article.goto(ARTICLE);
	const openPrint = async (width = 1280, height = 900) => {
		const opened = context.waitForEvent("page", page => page.url().includes("print.html"));
		await ctl.evaluate(async url => {
			const [tab] = await chrome.tabs.query({ url });
			return chrome.runtime.sendMessage({ method: "screenbreak.run", action: "print", tab });
		}, ARTICLE);
		const page = await opened;
		await page.setViewportSize({ width, height });
		await page.waitForSelector("body:not(.is-loading)", { timeout: 60000 });
		await page.locator(".pick.picked .thumb.live iframe").waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
		await sleep(700);
		return page;
	};
	const shoot = (page, name, options = {}) => page.screenshot({ path: join(OUT, name), ...options });
	const measurePanel = async (page, surface, { guest }) => {
		const measures = await page.evaluate(MEASURE, { container: ".panel", selectors: [...PANEL_EDGE, ...GUEST_EDGE, ...CARD_EDGE] });
		report.alignment[surface] = measures;
		check(surface, measures, "panel text edge x24", guest ? [...PANEL_EDGE, ...GUEST_EDGE] : PANEL_EDGE, 24);
		check(surface, measures, "card and row text edge x112", CARD_EDGE, 112);
	};

	// Guest, 1280
	me = ACCOUNTS.guest;
	const guest = await openPrint();
	await shoot(guest, "01-guest-1280.png");
	await shoot(guest, "02-guest-panel-full.png", { clip: { x: 1280 - 392, y: 0, width: 392, height: 900 } });
	await measurePanel(guest, "guest 1280", { guest: true });
	// Locked preview: a locked design from "Other designs"
	await guest.locator(".others .pick[data-locked]").first().click();
	await guest.locator(".desk-banner:not([hidden])").waitFor();
	await sleep(500);
	await shoot(guest, "03-guest-locked-preview.png");
	report.alignment.banner = await guest.evaluate(() => ({ height: Math.round(document.querySelector(".desk-banner").getBoundingClientRect().height) }));
	report.checks.push({ surface: "guest locked preview", name: "desk banner 40 px", ok: Math.abs(report.alignment.banner.height - 40) <= 1, values: report.alignment.banner });
	await noSideScroll(guest, "guest locked design 1280");
	// The door card in the panel body (Cmd/Ctrl+P in a locked preview); the footer's email pill steps aside.
	await guest.keyboard.press("Control+p");
	await guest.locator(".door-slot-print .door").waitFor();
	await sleep(300);
	await shoot(guest, "04-guest-door.png");
	await shoot(guest, "04b-guest-door-panel.png", { clip: { x: 1280 - 392, y: 0, width: 392, height: 900 } });
	report.checks.push({ surface: "guest door", name: "footer email pill hidden while the card is open", ok: await guest.locator(".continue-button").isHidden(), values: "" });
	await guest.keyboard.press("Escape");
	await guest.locator(".desk-banner").waitFor({ state: "hidden" });
	// Wait state: the footer's ink pill is the email step (the sign-in tab opens next to this one, no second card)
	await guest.locator(".others .pick[data-locked]").first().click();
	await guest.locator(".desk-banner:not([hidden])").waitFor();
	const signIn = context.waitForEvent("page");
	await guest.click(".continue-button");
	const signInPage = await signIn;
	await guest.bringToFront();
	await guest.locator(".door.waiting").waitFor();
	await sleep(800);
	await shoot(guest, "05-guest-wait.png", { clip: { x: 1280 - 392, y: 0, width: 392, height: 900 } });
	// The wait card must sit clear of the sticky footer, not under it.
	const waitBox = await guest.evaluate(() => ({ card: Math.round(document.querySelector(".door.waiting").getBoundingClientRect().bottom), footer: Math.round(document.querySelector(".actions").getBoundingClientRect().top) }));
	report.checks.push({ surface: "guest wait", name: "wait card above the footer", ok: waitBox.card <= waitBox.footer, values: waitBox });
	await guest.locator(".door.waiting .link-button").click();
	await signInPage.close().catch(() => {});
	await guest.locator(".desk-banner").waitFor({ state: "hidden" });
	// Ink saver preview
	await guest.locator("[data-name=pictures] label[data-value=ink]").click();
	await guest.locator(".desk-banner:not([hidden])").waitFor();
	await sleep(500);
	await shoot(guest, "06-guest-ink-preview.png");
	await shoot(guest, "06b-guest-ink-footer.png", { clip: { x: 1280 - 392, y: 600, width: 392, height: 300 } });
	await noSideScroll(guest, "guest locked option 1280");
	await guest.click(".banner-back");
	await guest.locator(".desk-banner").waitFor({ state: "hidden" });
	// Gallery over the desk
	await guest.click(".all-toggle");
	await sleep(500);
	await shoot(guest, "07-guest-gallery.png");
	await guest.keyboard.press("Escape");
	// Done state (only when done.js is in this build)
	await guest.click(".print-button");
	await sleep(1200);
	if (await guest.locator(".panel-body > .done:not([hidden])").count()) {
		await shoot(guest, "09-guest-done.png");
		report.alignment.done = await guest.evaluate(MEASURE, { container: ".panel", selectors: [".done h2, .done .title", ".done p", ".done .button"] });
	} else {
		report.checks.push({ surface: "done", name: "done state", ok: true, values: "not in this build (done.js comes from B2)" });
	}
	await guest.close();

	// Guest, 390: sticky bar, sheet, locked preview bar
	const narrow = await openPrint(390, 844);
	await shoot(narrow, "10-guest-390.png");
	report.alignment.narrow = await narrow.evaluate(MEASURE, { container: "body", selectors: [".panel-head .wordmark", ".intro h1", ".summary", ".guest-line", ".print-button"] });
	check("guest 390", report.alignment.narrow, "page text edge x16", [".panel-head .wordmark", ".intro h1", ".summary", ".guest-line", ".print-button"], 16);
	await narrow.click(".sheet-toggle");
	await sleep(400);
	await shoot(narrow, "11-guest-390-sheet.png");
	const sheetMeasures = await narrow.evaluate(MEASURE, { container: "body", selectors: [".sheet-head h2", "#picked-heading", "#others-heading", "#pictures-label", "#paper-label", "#locked-heading", ".lock-line"] });
	report.alignment.sheet = sheetMeasures;
	check("guest 390 sheet", sheetMeasures, "sheet text edge x16", [".sheet-head h2", "#picked-heading", "#others-heading", "#pictures-label", "#paper-label", "#locked-heading", ".lock-line"], 16);
	await narrow.locator(".blocks .others .pick[data-locked]").first().click();
	await narrow.locator(".desk-banner:not([hidden])").waitFor();
	await narrow.click(".sheet-close");
	await sleep(400);
	await shoot(narrow, "12-guest-390-locked.png");
	report.checks.push({ surface: "guest 390 locked", name: "Design & paper reachable", ok: await narrow.locator(".act-locked .sheet-link").isVisible(), values: "" });
	report.checks.push({ surface: "guest 390 locked", name: "short banner", ok: /^Previewing .+ · needs a free account$/.test(await narrow.locator(".banner-text .short").textContent()) && await narrow.locator(".banner-text .short").isVisible(), values: await narrow.locator(".banner-text .short").textContent() });
	await noSideScroll(narrow, "guest 390 locked design");
	await narrow.close();

	// Free account and Plus, 1280
	for (const [name, file] of [["free", "13-free-1280.png"], ["plus", "14-plus-1280.png"]]) {
		me = ACCOUNTS[name];
		const page = await openPrint();
		await shoot(page, file);
		await measurePanel(page, name + " 1280", { guest: false });
		await page.close();
	}

	// Settings: guest, free account, guest at 390
	for (const [name, file, width] of [["guest", "15-settings-guest.png", 1280], ["free", "16-settings-free.png", 1280], ["guest", "17-settings-guest-390.png", 390]]) {
		me = ACCOUNTS[name];
		const page = await context.newPage();
		await page.setViewportSize({ width, height: 900 });
		await page.goto(ext("options.html"));
		await sleep(1500);
		await shoot(page, file, { fullPage: true });
		const selectors = [".panel-head .wordmark", ".intro h1", "#button-heading", "#design-heading", "#paper-heading", "#keys-heading", "#account-heading", "#share-heading", "summary span", ".foot p"];
		if (width == 1280) {
			const measures = await page.evaluate(MEASURE, { container: ".panel", selectors });
			report.alignment["settings " + name] = measures;
			check("settings " + name, measures, "panel text edge x24", selectors, 24);
		} else {
			const measures = await page.evaluate(MEASURE, { container: "body", selectors });
			report.alignment[`settings ${name} ${width}`] = measures;
			check(`settings ${name} ${width}`, measures, "page text edge x16", selectors, 16);
		}
		if (name == "guest" && width == 1280) {
			await page.locator(".design-grid .tile", { hasText: "Riso zine" }).click();
			await sleep(1500);
			await shoot(page, "18-settings-guest-locked-preview.png");
			// The preview can be undone: a click on "The best match for each article" puts the sample back.
			await page.locator("input[name=designMode][value=best]").click({ force: true });
			await sleep(1500);
			const help = await page.locator(".design-help").textContent();
			report.checks.push({ surface: "settings guest", name: "best match clears the locked preview", ok: /^Best match for this sample/.test(help), values: help });
		}
		await page.close();
	}
	me = null;

	// Expired print page
	const expired = await context.newPage();
	await expired.goto(ext("print.html#gone"));
	await sleep(500);
	await shoot(expired, "19-print-expired.png");
	await expired.close();

	writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
	const failed = report.checks.filter(item => !item.ok);
	console.log(`${report.checks.length - failed.length}/${report.checks.length} alignment checks pass`);
	for (const item of report.checks) console.log(item.ok ? "PASS" : "FAIL", item.surface, "·", item.name, JSON.stringify(item.values));
} finally {
	await context.close();
	server.close();
}

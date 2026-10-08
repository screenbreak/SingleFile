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

// The desk is as tall as the design on show: hidden documents keep no size and scrolling ends at the last page.
async function deskFits(page, surface) {
	const values = await page.evaluate(() => {
		const desk = document.querySelector(".desk");
		const shown = document.querySelector(".sheet-holder.shown");
		const sheets = document.querySelector(".sheets");
		const end = document.querySelector(".desk-top").offsetHeight + shown.offsetHeight + parseFloat(getComputedStyle(sheets).paddingBottom);
		const sized = Array.from(document.querySelectorAll(".sheet-holder:not(.shown)")).filter(holder => holder.offsetWidth || holder.offsetHeight).length;
		return { hiddenSized: sized, overshoot: Math.max(0, desk.scrollHeight - Math.max(end, desk.clientHeight)) };
	});
	report.checks.push({ surface, name: "desk ends at the last page", ok: values.hiddenSized == 0 && values.overshoot == 0, values });
}

const SIGNAL = "rgb(75, 155, 111)";
const pickedEdge = page => page.evaluate(() => getComputedStyle(document.querySelector(".pick.picked")).borderTopColor);
const scrollDeskDown = page => page.evaluate(() => {
	const desk = document.querySelector(".desk");
	desk.scrollTop = 1e6;
	scrollTo(0, 1e6);
});
// After a design switch the desk is back at page 1 (at 1280 the desk scrolls; under 860 px the page does).
const deskAtTop = page => page.evaluate(() => {
	const desk = document.querySelector(".desk");
	return getComputedStyle(desk).overflowY == "visible" ? scrollY <= desk.getBoundingClientRect().top + scrollY : desk.scrollTop == 0;
});

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
	// Head: "Settings" beside "Log in", the same size.
	const head = await guest.evaluate(() => Array.from(document.querySelectorAll(".who a")).map(link => ({ text: link.textContent, size: getComputedStyle(link).fontSize, weight: getComputedStyle(link).fontWeight })));
	report.checks.push({ surface: "guest 1280", name: "Settings beside Log in, same size", ok: head.length == 2 && head[0].text == "Settings" && head[1].text == "Log in" && head[0].size == head[1].size && head[0].weight == head[1].weight, values: head });
	const pages = await guest.evaluate(() => document.querySelector(".sheet-holder.shown iframe").contentDocument.querySelectorAll(".page").length);
	report.checks.push({ surface: "guest 1280", name: "two-sided line under Print when pages > 1", ok: await guest.locator(".duplex-hint").isVisible() == pages > 1, values: { pages } });
	report.checks.push({ surface: "guest 1280", name: "pick has the green edge while it is on the desk", ok: await pickedEdge(guest) == SIGNAL, values: await pickedEdge(guest) });
	await deskFits(guest, "guest 1280");
	// Locked preview: a locked design from "Other designs", picked while the desk is scrolled down
	await scrollDeskDown(guest);
	await guest.locator(".others .pick[data-locked]").first().click();
	await guest.locator(".desk-banner:not([hidden])").waitFor();
	await sleep(500);
	await shoot(guest, "03-guest-locked-preview.png");
	await shoot(guest, "03b-guest-locked-footer.png", { clip: { x: 1280 - 392, y: 600, width: 392, height: 300 } });
	report.checks.push({ surface: "guest locked preview", name: "design switch opens at page 1", ok: await deskAtTop(guest), values: "" });
	report.checks.push({ surface: "guest locked preview", name: "banner pill reads Close preview", ok: await guest.locator(".banner-back").textContent() == "Close preview", values: await guest.locator(".banner-back").textContent() });
	report.checks.push({ surface: "guest locked preview", name: "pick loses its green edge", ok: await pickedEdge(guest) != SIGNAL, values: await pickedEdge(guest) });
	const footer = await guest.locator(".actions").evaluate(actions => Array.from(actions.querySelectorAll("button, a, p")).filter(element => element.checkVisibility()).map(element => element.textContent.trim()));
	report.checks.push({ surface: "guest locked preview", name: "footer is one step (pill, Google, line)", ok: footer.length == 3 && /^Continue with email to print /.test(footer[0]) && footer[1] == "Continue with Google", values: footer });
	await deskFits(guest, "guest locked preview");
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
	report.checks.push({ surface: "guest back", name: "pick has its green edge again", ok: await pickedEdge(guest) == SIGNAL, values: await pickedEdge(guest) });
	// Gallery: a strip on top of the desk; the tiles show page 1 of this article once each design is built
	await guest.click(".all-toggle");
	await guest.locator(".desk-top .gallery").waitFor();
	await sleep(400);
	await shoot(guest, "07a-guest-gallery-samples.png");
	await guest.waitForFunction(() => document.querySelectorAll(".gallery .tile .thumb.live .thumb-live").length == 11, null, { timeout: 90000 }).catch(() => {});
	const live = await guest.locator(".gallery .tile .thumb.live").count();
	report.checks.push({ surface: "guest gallery", name: "11 tiles show this article", ok: live == 11, values: { live } });
	await sleep(500);
	await shoot(guest, "07-guest-gallery.png");
	const stripEdge = await guest.evaluate(MEASURE, { container: ".desk", selectors: [".gallery-head h2", ".gallery .tile .thumb", ".desk-bar .source"] });
	report.alignment.strip = stripEdge;
	check("guest gallery", stripEdge, "strip text edge x24", [".gallery-head h2", ".gallery .tile .thumb", ".desk-bar .source"], 24);
	await scrollDeskDown(guest);
	await guest.locator(".gallery .tile[data-locked]").nth(2).click();
	await guest.locator(".desk-banner:not([hidden])").waitFor();
	await sleep(500);
	await shoot(guest, "07b-guest-gallery-locked.png");
	report.checks.push({ surface: "guest gallery", name: "tile opens at page 1, strip stays, door footer", ok: await deskAtTop(guest) && await guest.locator(".gallery").isVisible() && await guest.locator(".act-locked").isVisible(), values: "" });
	await deskFits(guest, "guest gallery locked");
	await guest.locator(".gallery .tile[data-picked]").click();
	await guest.locator(".desk-banner").waitFor({ state: "hidden" });
	await sleep(400);
	await shoot(guest, "07c-guest-gallery-pick.png");
	report.checks.push({ surface: "guest gallery", name: "pick tile brings Print back", ok: await guest.locator(".act-print").isVisible(), values: "" });
	await noSideScroll(guest, "guest gallery 1280");
	await guest.keyboard.press("Escape");
	await guest.locator(".gallery").waitFor({ state: "hidden" });
	// Save as PDF: the help line shows only while its print window is open (shown here by hand for the picture)
	await guest.evaluate(() => document.querySelector(".pdf-hint").hidden = false);
	await shoot(guest, "08-guest-pdf-hint.png", { clip: { x: 1280 - 392, y: 600, width: 392, height: 300 } });
	report.alignment.footer = await guest.evaluate(MEASURE, { container: ".panel", selectors: [".print-button", ".duplex-hint", ".pdf-button", ".pdf-hint"] });
	check("guest footer", report.alignment.footer, "footer text edge x24", [".print-button", ".duplex-hint", ".pdf-button", ".pdf-hint"], 24);
	await guest.evaluate(() => document.querySelector(".pdf-hint").hidden = true);
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
	await narrow.click(".banner-back");
	await narrow.locator(".desk-banner").waitFor({ state: "hidden" });
	// The gallery strip at 390: opened from the sheet, the sheet steps aside
	await narrow.click(".sheet-toggle");
	await sleep(300);
	await narrow.click(".blocks .all-toggle");
	await narrow.locator(".gallery").waitFor();
	await narrow.waitForFunction(() => document.querySelectorAll(".gallery .tile .thumb.live .thumb-live").length == 11, null, { timeout: 90000 }).catch(() => {});
	await sleep(500);
	await shoot(narrow, "12b-guest-390-gallery.png");
	const narrowStrip = await narrow.evaluate(MEASURE, { container: "body", selectors: [".gallery-head h2", ".gallery .tile .thumb", ".desk-bar .source"] });
	report.alignment.narrowStrip = narrowStrip;
	check("guest 390 gallery", narrowStrip, "strip text edge x16", [".gallery-head h2", ".gallery .tile .thumb", ".desk-bar .source"], 16);
	await scrollDeskDown(narrow);
	await narrow.locator(".gallery .tile[data-locked]").first().click();
	await narrow.locator(".desk-banner:not([hidden])").waitFor();
	await sleep(400);
	await shoot(narrow, "12c-guest-390-gallery-locked.png");
	report.checks.push({ surface: "guest 390 gallery", name: "tile opens at page 1", ok: await deskAtTop(narrow), values: await narrow.evaluate(() => scrollY) });
	await noSideScroll(narrow, "guest 390 gallery");
	await narrow.close();

	// Free account and Plus, 1280
	for (const [name, file] of [["free", "13-free-1280.png"], ["plus", "14-plus-1280.png"]]) {
		me = ACCOUNTS[name];
		const page = await openPrint();
		await shoot(page, file);
		await measurePanel(page, name + " 1280", { guest: false });
		const links = await page.evaluate(() => Array.from(document.querySelectorAll(".who a")).map(link => ({ text: link.textContent, size: getComputedStyle(link).fontSize })));
		report.checks.push({ surface: name + " 1280", name: "Settings beside the name, same size", ok: links.length == 2 && links[0].text == "Settings" && links[0].size == links[1].size, values: links });
		await noSideScroll(page, name + " 1280");
		if (name == "free") {
			// A design with a second page: the two-sided line under Print, on the footer's text edge.
			await page.locator(".others .pick").first().click();
			await page.locator(".duplex-hint:not([hidden])").waitFor({ timeout: 30000 }).catch(() => {});
			await sleep(400);
			await shoot(page, "13b-free-two-sided-footer.png", { clip: { x: 1280 - 392, y: 600, width: 392, height: 300 } });
			const footerEdge = await page.evaluate(MEASURE, { container: ".panel", selectors: [".print-button", ".duplex-hint", ".pdf-button"] });
			report.alignment.freeFooter = footerEdge;
			check("free 1280 two-sided", footerEdge, "footer text edge x24 with the two-sided line", [".print-button", ".duplex-hint", ".pdf-button"], 24);
			report.checks.push({ surface: "free 1280 two-sided", name: "two-sided line shows", ok: await page.locator(".duplex-hint").isVisible(), values: await page.locator(".print-label").textContent() });
		}
		await page.close();
	}
	// A long name beside "Settings" at 390: the name gives way, the head never pushes the page sideways.
	me = ACCOUNTS.free;
	const freeNarrow = await openPrint(390, 844);
	await shoot(freeNarrow, "14b-free-390.png");
	await noSideScroll(freeNarrow, "free 390");
	report.alignment.freeNarrow = await freeNarrow.evaluate(MEASURE, { container: "body", selectors: [".panel-head .wordmark", ".intro h1", ".summary"] });
	check("free 390", report.alignment.freeNarrow, "page text edge x16", [".panel-head .wordmark", ".intro h1", ".summary"], 16);
	await freeNarrow.close();

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

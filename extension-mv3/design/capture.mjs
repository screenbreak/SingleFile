// Screenshots of every extension surface and state, plus alignment measures, for design review.
// Run from extension-mv3: `npm run build && node design/capture.mjs design/after`.
import { chromium } from "playwright";
import { start, state, uploads } from "../test/server.mjs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXT = new URL("../dist", import.meta.url).pathname;
const OUT = process.argv[2] || "design/after";
mkdirSync(OUT, { recursive: true });
const PORT = 8766, BASE = `http://localhost:${PORT}`, ARTICLE = BASE + "/article.html";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { alignment: {}, checks: [] };

// Left edge of the text inside an element (first text node), or of the element itself.
const MEASURE = selectors => selectors.map(selector => {
	const element = document.querySelector(selector);
	if (!element) return { selector, missing: true };
	let box = element.getBoundingClientRect();
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() ? 1 : 3 });
	// Controls and cards align by their outer edge; text aligns by its first glyph.
	const isBox = ["IMG", "svg", "INPUT", "BUTTON", "A"].includes(element.tagName) && !element.matches(".link-button, .library") || element.matches(".segmented, .switch, .track, .keycaps, .choice-body, .check, .button");
	const text = isBox ? null : walker.nextNode();
	if (text) { const range = document.createRange(); range.selectNodeContents(text); const rect = range.getClientRects()[0]; if (rect) box = rect; }
	return { selector, left: Math.round(box.left * 10) / 10, right: Math.round(element.getBoundingClientRect().right * 10) / 10, top: Math.round(box.top), centerY: Math.round((element.getBoundingClientRect().top + element.getBoundingClientRect().bottom) / 2) };
});

function check(surface, measures, key, groups) {
	for (const [name, selectors] of Object.entries(groups)) {
		const values = selectors.map(selector => measures.find(measure => measure.selector == selector)).filter(measure => measure && !measure.missing).map(measure => measure[key]);
		const ok = values.length > 1 && Math.max(...values) - Math.min(...values) <= 0.5;
		report.checks.push({ surface, name, key, ok, values });
	}
}

const server = await start(PORT);
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-capture-")), {
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
	headless: true, deviceScaleFactor: 2, viewport: { width: 1280, height: 900 },
	args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const id = worker.url().split("/")[2];
	const ext = path => `chrome-extension://${id}/${path}`;
	await sleep(800);
	// The welcome page opens by itself on install.
	for (const page of context.pages()) if (page.url().includes("welcome.html")) await page.close();

	const ctl = await context.newPage();
	await ctl.goto(ext("options.html"));
	await ctl.evaluate(base => chrome.storage.sync.set({ serverUrl: base, print: { font: "sans", size: "normal", columns: 1, images: true, openPrintDialog: false } }), BASE);
	const run = (action, url) => ctl.evaluate(async ({ action, url }) => {
		const [tab] = await chrome.tabs.query({ url });
		return chrome.runtime.sendMessage({ method: "screenbreak.run", action, tab });
	}, { action, url });
	const status = (url, value) => ctl.evaluate(async ({ url, value }) => {
		const [tab] = await chrome.tabs.query({ url });
		return chrome.tabs.sendMessage(tab.id, { method: "screenbreak.status", status: value });
	}, { url, value });
	// Open the status card's shadow root so it can be measured (the extension makes it closed).
	const openShadow = url => ctl.evaluate(async url => {
		const [tab] = await chrome.tabs.query({ url });
		await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
			const attach = Element.prototype.attachShadow;
			Element.prototype.attachShadow = function (init) { return attach.call(this, { ...init, mode: "open" }); };
		} });
		await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-print.js"] });
	}, url);
	const corner = async (page, name, height = 260) => {
		const viewport = page.viewportSize();
		await page.screenshot({ path: join(OUT, name), clip: { x: viewport.width - 400, y: viewport.height - height, width: 400, height } });
	};
	const card = page => page.evaluate(() => {
		const root = document.querySelector("screenbreak-status")?.shadowRoot;
		if (!root) return null;
		const left = selector => { const element = root.querySelector(selector); if (!element || element.hidden || !element.getClientRects().length) return null; const range = document.createRange(); const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() ? 1 : 3 }); const text = walker.nextNode(); if (text) { range.selectNodeContents(text); return Math.round(range.getClientRects()[0].left * 10) / 10; } return Math.round(element.getBoundingClientRect().left * 10) / 10; };
		const box = selector => { const element = root.querySelector(selector); return element && element.getClientRects().length ? Math.round(element.getBoundingClientRect().left * 10) / 10 : null; };
		return { title: left(".title"), detail: left(".detail"), quote: left(".quote-title"), actions: box(".actions > *"), tip: left(".tip") };
	});

	// Popup, pointed at an article tab
	const popupTarget = await context.newPage();
	await popupTarget.goto(BASE + "/fixtures/long-title.html");
	const popupTabId = await ctl.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, BASE + "/fixtures/long-title.html");
	const popup = await context.newPage();
	await popup.setViewportSize({ width: 320, height: 420 });
	const shootPopup = async (name, hash = "") => {
		await popup.goto("about:blank");
		await popup.goto(ext("popup.html?tabId=" + popupTabId + hash));
		await sleep(400);
		const height = await popup.evaluate(() => document.documentElement.scrollHeight);
		await popup.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: 320, height } });
	};
	await shootPopup("01-popup.png");
	const popupMeasures = await popup.evaluate(MEASURE, [".wordmark", ".actions-label", ".row[data-action=save] .icon", ".row[data-action=print] .icon", "#default-label", ".default .segmented", ".consequence", ".library", ".row[data-action=save] .row-title", ".row[data-action=save] .row-desc", ".row[data-action=print] .row-title", ".also-save .track"]);
	report.alignment.popup = popupMeasures;
	check("popup", popupMeasures, "left", { "outer edge x16": [".wordmark", ".actions-label", ".row[data-action=save] .icon", ".row[data-action=print] .icon", "#default-label", ".default .segmented", ".consequence", ".library"], "row text x48": [".row[data-action=save] .row-title", ".row[data-action=save] .row-desc", ".row[data-action=print] .row-title", ".also-save .track"] });
	await popup.click("input[name=defaultAction][value=print]");
	await shootPopup("02-popup-default-print.png");
	await popup.evaluate(() => chrome.storage.sync.set({ defaultAction: "ask" }));
	await shootPopup("03-popup-unsupported.png", "#unsupported-print");
	const unsupported = await popup.evaluate(MEASURE, [".wordmark", ".notice-title", ".notice-text", ".row[data-action=save] .icon"]);
	check("popup unsupported", unsupported, "left", { "outer edge x16": [".wordmark", ".notice-title", ".notice-text", ".row[data-action=save] .icon"] });

	// Settings
	const options = await context.newPage();
	await options.goto(ext("options.html"));
	await sleep(500);
	await options.screenshot({ path: join(OUT, "04-settings.png"), fullPage: true });
	const settingsSelectors = [".wordmark", "h1", ".lede", "#button-heading", ".row-label", ".row-desc", ".note", "#print-heading", ".section-desc", "#account-heading", "summary span", ".foot p"];
	const settingsMeasures = await options.evaluate(MEASURE, settingsSelectors);
	const rightEdges = await options.evaluate(() => Array.from(document.querySelectorAll(".row > :last-child")).map(element => Math.round(element.getBoundingClientRect().right * 10) / 10));
	report.alignment.settings = { left: settingsMeasures, controlRightEdges: rightEdges };
	check("settings", settingsMeasures, "left", { "text left x": settingsSelectors });
	report.checks.push({ surface: "settings", name: "controls right x", key: "right", ok: Math.max(...rightEdges) - Math.min(...rightEdges) <= 0.5, values: rightEdges });
	await options.click("input[name=font][value=serif]");
	await sleep(200);
	await options.screenshot({ path: join(OUT, "05-settings-saved-flash.png"), clip: { x: 340, y: 540, width: 600, height: 200 } });
	await options.setViewportSize({ width: 375, height: 812 });
	await sleep(200);
	await options.screenshot({ path: join(OUT, "06-settings-375.png"), fullPage: true });
	await options.evaluate(() => chrome.storage.sync.set({ print: { font: "sans", size: "normal", columns: 1, images: true, openPrintDialog: false } }));

	// Welcome
	const welcome = await context.newPage();
	await welcome.goto(ext("welcome.html"));
	await sleep(600);
	await welcome.screenshot({ path: join(OUT, "07-welcome.png"), fullPage: true });
	const welcomeSelectors = [".wordmark", ".intro-title", ".intro-text", "#what-heading", ".cell .icon", "#click-heading", ".section-text", ".choice-body", "#keys-heading", ".shortcut-name", "#try-heading", "#done-heading", ".status-list .check"];
	const welcomeMeasures = await welcome.evaluate(MEASURE, welcomeSelectors);
	report.alignment.welcome = welcomeMeasures;
	check("welcome", welcomeMeasures, "left", { "column left x": welcomeSelectors });
	await welcome.goto("about:blank");
	await welcome.goto(ext("welcome.html#updated"));
	await sleep(600);
	await welcome.screenshot({ path: join(OUT, "08-welcome-updated.png") });
	await welcome.setViewportSize({ width: 375, height: 812 });
	await sleep(300);
	await welcome.screenshot({ path: join(OUT, "09-welcome-375.png"), fullPage: true });

	// Print page
	const article = await context.newPage();
	await article.goto(ARTICLE);
	await run("print", ARTICLE);
	const printPage = await context.waitForEvent("page", page => page.url().includes("print.html"));
	await printPage.setViewportSize({ width: 1280, height: 900 });
	await printPage.waitForSelector(".article:not([hidden])");
	await sleep(800);
	await printPage.screenshot({ path: join(OUT, "10-print.png") });
	const printSelectors = [".article .meta", "h1.title", ".article > header hr", ".content p", ".content h2", ".content figcaption"];
	const printMeasures = await printPage.evaluate(MEASURE, printSelectors);
	const toolbar = await printPage.evaluate(MEASURE, [".toolbar .wordmark", ".options .segmented", ".switch .track", ".print-button", ".print-keys"]);
	report.alignment.print = { article: printMeasures, toolbar };
	check("print sheet", printMeasures, "left", { "article left x": printSelectors });
	check("print toolbar", toolbar, "centerY", { "one centre line": [".toolbar .wordmark", ".options .segmented", ".switch .track", ".print-button"] });
	await printPage.screenshot({ path: join(OUT, "11-print-full.png"), fullPage: true });
	await printPage.click("input[name=columns][value='2']");
	await printPage.click("input[name=font][value=serif]");
	await sleep(400);
	await printPage.emulateMedia({ media: "print" });
	report.alignment.print2col = await printPage.evaluate(() => {
		const content = document.querySelector(".content");
		const box = content.getBoundingClientRect(), middle = box.left + box.width / 2;
		const range = document.createRange(); range.selectNodeContents(content);
		const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 2 && rect.height > 4 && rect.top < box.top + 400);
		const top = side => Math.round(Math.min(...rects.filter(rect => side == "left" ? rect.left < middle : rect.left >= middle).map(rect => rect.top)));
		return { left: top("left"), right: top("right") };
	});
	await printPage.pdf({ path: join(OUT, "12-print-2col-serif.pdf"), format: "A4", displayHeaderFooter: true, headerTemplate: "<span class=date style='font-size:8px'></span><span class=title style='font-size:8px'></span>", footerTemplate: "<span class=url style='font-size:8px'></span>" });
	await printPage.emulateMedia({ media: "screen" });
	await printPage.click("input[name=columns][value='1']");
	await printPage.click("input[name=font][value=sans]");
	await printPage.setViewportSize({ width: 700, height: 700 });
	await sleep(300);
	await printPage.screenshot({ path: join(OUT, "13-print-700.png") });
	await printPage.setViewportSize({ width: 375, height: 700 });
	await sleep(300);
	await printPage.click(".options-toggle");
	await sleep(200);
	await printPage.screenshot({ path: join(OUT, "14-print-375-options.png") });
	await printPage.click(".options-toggle");
	await printPage.setViewportSize({ width: 1280, height: 900 });

	// Print: awkward articles from real pages
	for (const [fixture, name] of [["long-title.html", "15-print-long-title-no-author.png"], ["wrapped.html", "16-print-wrapped.png"]]) {
		const page = await context.newPage();
		await page.goto(BASE + "/fixtures/" + fixture);
		const opened = context.waitForEvent("page", candidate => candidate.url().includes("print.html"));
		await run("print", BASE + "/fixtures/" + fixture);
		const print = await opened;
		await print.setViewportSize({ width: 1280, height: 900 });
		await print.waitForSelector(".article:not([hidden])");
		await sleep(600);
		await print.screenshot({ path: join(OUT, name), fullPage: true });
		if (fixture == "wrapped.html") {
			await print.click("input[name=columns][value='2']");
			await print.emulateMedia({ media: "print" });
			report.alignment.wrapped2col = await print.evaluate(() => {
				const content = document.querySelector(".content");
				const box = content.getBoundingClientRect(), middle = box.left + box.width / 2;
				const range = document.createRange(); range.selectNodeContents(content);
				const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 2 && rect.height > 4);
				const top = side => Math.round(Math.min(...rects.filter(rect => side == "left" ? rect.left < middle : rect.left >= middle).map(rect => rect.top)));
				return { left: top("left"), right: top("right") };
			});
			await print.pdf({ path: join(OUT, "16-print-wrapped-2col.pdf"), format: "A4" });
		}
		await print.close();
		await page.close();
	}
	// Print: expired, with and without a known source
	await printPage.goto("about:blank");
	await printPage.goto(ext("print.html#gone"));
	await sleep(500);
	await printPage.screenshot({ path: join(OUT, "17-print-expired.png") });
	report.alignment.expired = await printPage.evaluate(MEASURE, [".message-title", ".message-text", ".message-actions .link-button"]);
	await ctl.evaluate(() => chrome.storage.local.set({ printJobSources: { known: { url: "https://example.com/story", title: "A story" } } }));
	await printPage.goto("about:blank");
	await printPage.goto(ext("print.html#known"));
	await sleep(500);
	await printPage.screenshot({ path: join(OUT, "18-print-expired-with-link.png") });
	// Print: images still loading
	await context.route("**/photo.png", async route => { await sleep(4000); route.continue(); });
	await article.reload();
	const slow = context.waitForEvent("page", page => page.url().includes("print.html"));
	await run("print", ARTICLE);
	const slowPage = await slow;
	await slowPage.setViewportSize({ width: 1280, height: 900 });
	await slowPage.waitForSelector(".article:not([hidden])");
	await sleep(300);
	await slowPage.screenshot({ path: join(OUT, "19-print-images-loading.png"), clip: { x: 640, y: 0, width: 640, height: 60 } });
	await context.unroute("**/photo.png");
	await slowPage.close();

	// Status card states, shown directly
	await article.reload();
	await openShadow(ARTICLE);
	const states = {
		"20-card-working.png": { state: "working", title: "Saving to Screenbreak", detail: "Uploading…", step: 3 },
		"21-card-login.png": { state: "login", title: "Log in to save this article", detail: "We'll open Screenbreak in a new tab and save this article as soon as you're in.", actions: [{ label: "Log in", action: "login", primary: true }, { label: "Print instead", action: "print-instead" }] },
		"22-card-waiting.png": { state: "working", title: "Waiting for you to log in", detail: "Finish logging in on the Screenbreak tab. This article saves by itself.", actions: [{ label: "Open login tab", action: "focus-login" }, { label: "Cancel", action: "cancel" }] },
		"23-card-saved-tip.png": { state: "done", title: "Saved to Screenbreak", quote: "How a small group of librarians, printers and retired schoolteachers quietly rebuilt the habit of reading long essays on paper", tip: "Tip: right-click any page to save or print it.", actions: [{ label: "Open in Screenbreak", href: "#" }, { label: "Undo", action: "undo" }], autoHide: 60000 },
		"24-card-offline.png": { state: "error", title: "You're offline", detail: "Nothing was saved. It saves as soon as you're back online.", actions: [{ label: "Try again", action: "retry", primary: true }] },
		"25-card-limit.png": { state: "error", title: "October uploads limit reached", detail: "Your account reached the upload limits for the month of October. Upload limits apply for free accounts.", actions: [{ label: "Upgrade to go unlimited", href: "#", primary: true }, { label: "Print instead", action: "print-instead" }] },
		"26-card-print-failed.png": { state: "error", title: "Couldn't find an article here", detail: "Screenbreak prints articles and blog posts. You can still print the whole page.", actions: [{ label: "Print the whole page", action: "print-page" }] },
		"27-card-removed.png": { state: "info", title: "Removed from Screenbreak", actions: [{ label: "Save again", action: "retry" }], autoHide: 60000 }
	};
	report.alignment.card = {};
	for (const [name, value] of Object.entries(states)) {
		await status(ARTICLE, value);
		await sleep(350);
		await corner(article, name, value.quote ? 300 : 240);
		const measured = await card(article);
		report.alignment.card[name] = measured;
		const values = Object.values(measured || {}).filter(value => value != null);
		report.checks.push({ surface: "card " + name, name: "text left x", key: "left", ok: values.length > 1 && Math.max(...values) - Math.min(...values) <= 0.5, values });
	}
	await article.setViewportSize({ width: 360, height: 640 });
	await status(ARTICLE, states["23-card-saved-tip.png"]);
	await sleep(300);
	await article.screenshot({ path: join(OUT, "28-card-360.png") });
	await article.setViewportSize({ width: 1280, height: 900 });

	// Status card: real flows against the stand-in API
	const loginOpened = context.waitForEvent("page", page => page.url().includes("/login/"));
	await run("save", ARTICLE);
	await sleep(4000);
	await corner(article, "29-flow-login-prompt.png");
	await ctl.evaluate(async url => { const [tab] = await chrome.tabs.query({ url }); await chrome.tabs.update(tab.id, { active: true }); }, ARTICLE);
	// Click "Log in" inside the card, as the user would.
	await article.evaluate(() => document.querySelector("screenbreak-status").shadowRoot.querySelector(".primary").click());
	await loginOpened;
	for (let attempt = 0; attempt < 40 && !uploads.length; attempt++) await sleep(250);
	await sleep(600);
	await corner(article, "30-flow-saved.png", 300);
	await article.evaluate(() => document.querySelector("screenbreak-status").shadowRoot.querySelector(".actions button").click());
	await sleep(1200);
	await corner(article, "31-flow-undone.png");
	state.mode = "error";
	await run("save", ARTICLE);
	await sleep(5000);
	await corner(article, "32-flow-server-error.png");
	state.mode = "limit";
	await run("save", ARTICLE);
	await sleep(5000);
	await corner(article, "33-flow-limit.png");
	state.mode = "ok";
	const empty = await context.newPage();
	await empty.goto(BASE + "/fixtures/empty-page.html");
	await run("print", BASE + "/fixtures/empty-page.html");
	await sleep(1200);
	await corner(empty, "34-flow-print-failed.png");
	const form = await context.newPage();
	await form.goto(BASE + "/fixtures/no-article.html");
	const formPrint = context.waitForEvent("page", page => page.url().includes("print.html"));
	await run("print", BASE + "/fixtures/no-article.html");
	const formPrintPage = await formPrint;
	await formPrintPage.setViewportSize({ width: 1280, height: 900 });
	await sleep(800);
	await formPrintPage.screenshot({ path: join(OUT, "36-print-nothing-to-print.png") });
	// Print and save: status in the print toolbar, logged in and then logged out
	await ctl.evaluate(() => chrome.storage.sync.set({ saveWhenPrinting: true }));
	await shootPopup("37-popup-print-and-save.png");
	await popup.evaluate(() => chrome.storage.sync.set({ defaultAction: "print" }));
	await shootPopup("38-popup-print-and-save-default-print.png");
	await popup.evaluate(() => chrome.storage.sync.set({ defaultAction: "ask" }));
	for (const [name, logOut] of [["39-print-and-save-saved.png", false], ["40-print-and-save-login.png", true]]) {
		if (logOut) {
			await article.goto(BASE + "/logout/");
			await article.goto(ARTICLE);
		}
		const opened = context.waitForEvent("page", page => page.url().includes("print.html"));
		await run("print", ARTICLE);
		const page = await opened;
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.locator(".save-status:not([hidden])").waitFor();
		await sleep(logOut ? 5000 : 200);
		await page.screenshot({ path: join(OUT, name.replace(".png", "-working.png")), clip: { x: 560, y: 0, width: 720, height: 60 } });
		await sleep(logOut ? 0 : 5000);
		await page.screenshot({ path: join(OUT, name), clip: { x: 560, y: 0, width: 720, height: 60 } });
		if (!logOut) {
			report.alignment.saveStatus = await page.evaluate(() => {
				const box = selector => document.querySelector(selector).getBoundingClientRect();
				return { status: Math.round((box(".save-status").top + box(".save-status").bottom) / 2), print: Math.round((box(".print-button").top + box(".print-button").bottom) / 2) };
			});
		}
		await page.close();
	}
	await ctl.evaluate(() => chrome.storage.sync.set({ saveWhenPrinting: false }));
	await options.goto(ext("options.html"));
	await options.setViewportSize({ width: 1280, height: 900 });
	await sleep(400);
	await options.screenshot({ path: join(OUT, "41-settings-print-and-save.png"), clip: { x: 300, y: 740, width: 680, height: 200 } });

	await ctl.evaluate(() => chrome.storage.sync.set({ serverUrl: "http://localhost:9" }));
	await run("save", ARTICLE);
	await sleep(6000);
	await corner(article, "35-flow-unreachable.png");

	writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
	const failed = report.checks.filter(item => !item.ok);
	console.log(`${report.checks.length - failed.length}/${report.checks.length} alignment checks pass`);
	failed.forEach(item => console.log("FAIL", item.surface, item.name, JSON.stringify(item.values)));
	console.log("print toolbar centre lines (save status, Print):", JSON.stringify(report.alignment.saveStatus));
	console.log("two columns, first line tops:", JSON.stringify(report.alignment.print2col), JSON.stringify(report.alignment.wrapped2col));
} finally {
	await context.close();
	server.close();
}

// End-to-end check of Save and Print in a real Chromium with the built extension loaded.
// Run `npm run build && npm test`. Set CHROMIUM_PATH to use a specific Chromium binary, SB_TEST_PORT for another port.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, log, uploads, removed } from "./server.mjs";

const EXTENSION_PATH = new URL("../dist", import.meta.url).pathname;
const PORT = Number(process.env.SB_TEST_PORT) || 8765;
const BASE = `http://localhost:${PORT}`;
const ARTICLE_URL = BASE + "/article.html";
const PRINT_DEFAULTS = { design: "best", pictures: "colour", references: "small", straightAway: false };

const server = await start(PORT);
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-e2e-")), {
	// The default headless shell can't load extensions; the "chromium" channel is full Chromium in headless mode.
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
	headless: true,
	args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
});
// The stand-in server has no /api/v1/me/ (webapp#103), so everyone is a guest; a route plays the account when needed.
let me = null;
await context.route(`${BASE}/api/v1/me/`, route => me ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me) }) : route.fulfill({ status: 404, body: "" }));
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const extensionId = worker.url().split("/")[2];
	const buttonState = () => worker.evaluate(async () => ({ popup: await chrome.action.getPopup({}), title: await chrome.action.getTitle({}) }));

	// Default: the button opens the Save/Print menu. (A longer wait: the worker is slow to settle under load.)
	await new Promise(resolve => setTimeout(resolve, 2000));
	assert.match((await buttonState()).popup, /popup\.html$/);

	const article = await context.newPage();
	await article.goto(ARTICLE_URL);
	const extensionPage = await context.newPage();
	await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);
	// Settings an account left behind: a fixed design, Ink saver and the full reference list. A guest gets the pick,
	// Colour and small references (the clamp at read time); the paper stays theirs.
	await extensionPage.evaluate(base => chrome.storage.sync.set({ serverUrl: base, print: { design: "riso", pictures: "ink", references: "keep", paper: "A4", straightAway: false } }), BASE);
	const run = action => extensionPage.evaluate(async ({ action, url }) => {
		const [tab] = await chrome.tabs.query({ url });
		return chrome.runtime.sendMessage({ method: "screenbreak.run", action, tab });
	}, { action, url: ARTICLE_URL });
	const openPrintPage = async () => {
		const opened = context.waitForEvent("page", page => page.url().includes("print.html"));
		await run("print");
		const page = await opened;
		await page.waitForSelector("body:not(.is-loading)", { timeout: 60000 });
		return page;
	};

	// Print: the article opens in the print page, set by the print engine in the best design for it, with
	// code-built charts turned into images and the site's furniture left out.
	const printPage = await openPrintPage();
	const deskStyle = page => page.evaluate(() => document.querySelector(".sheet-holder.shown iframe").contentDocument.body.className);
	const sheet = () => printPage.evaluate(() => {
		const doc = document.querySelector(".sheet-holder.shown iframe").contentDocument;
		return {
			style: doc.body.className,
			pages: doc.querySelectorAll(".page").length,
			title: doc.querySelector(".masthead h1").textContent,
			byline: doc.querySelector(".masthead .byline").textContent,
			images: Array.from(doc.querySelectorAll("figure img")).map(image => image.getAttribute("src").split(/[:,;]/)[0]),
			tables: doc.querySelectorAll("table").length,
			embeds: doc.querySelectorAll(".embed-link").length,
			text: doc.querySelector("#book").textContent
		};
	});
	const printed = await sheet();
	assert.equal(printed.title, "The Quiet Return of Paper");
	assert.match(printed.byline, /Maria Papadopoulou/);
	assert.ok(printed.pages >= 1);
	// The photo and the two code-built charts (SVG and canvas, turned into images on the page) are all read by
	// the extension and printed from its own copy.
	assert.deepEqual(printed.images, ["blob", "blob", "blob"]);
	assert.equal(printed.tables, 1);
	assert.equal(printed.embeds, 1);
	assert.doesNotMatch(printed.text, /Most popular|Advertisement|Privacy|By Maria/);

	// Guest panel: no print counter, Print enabled, the pick as the hero card, the other two picks locked.
	assert.equal(await printPage.locator(".quota").count(), 0);
	assert.equal(await printPage.locator(".print-button").isEnabled(), true);
	assert.match(await printPage.locator(".print-label").textContent(), /^Print \d+ pages?$/);
	assert.equal(await printPage.locator(".pick.picked").count(), 1);
	assert.equal(await printPage.locator(".others .pick[data-locked]").count(), 2);
	assert.equal(await printPage.locator(".guest-line").isVisible(), true);
	assert.equal(await printPage.locator("input[name=duplex]").count(), 0);
	// The clamp: the pick (not the stored Riso), Colour (not Ink saver), small references.
	const pickStyle = await printPage.locator(".pick.picked").getAttribute("data-style");
	assert.notEqual(pickStyle, "riso");
	assert.ok(printed.style.includes("style-" + pickStyle));
	assert.equal(await printPage.locator("input[name=pictures]:checked").getAttribute("value"), "colour");
	// The head links to Settings in a new tab, before "Log in" and in the same size.
	assert.deepEqual(await printPage.evaluate(() => {
		const [settings, login] = document.querySelectorAll(".who a");
		return { text: settings.textContent, href: settings.getAttribute("href"), target: settings.target, next: login.textContent, same: getComputedStyle(settings).fontSize == getComputedStyle(login).fontSize };
	}), { text: "Settings", href: "options.html", target: "_blank", next: "Log in", same: true });
	// Two-sided is said before the print, under Print, when there is a second page. The PDF line waits for its link.
	assert.equal(await printPage.locator(".duplex-hint").isVisible(), printed.pages > 1);
	if (printed.pages > 1) assert.equal(await printPage.locator(".duplex-hint").textContent(), "To print on both sides, turn on Two-sided in the print window.");
	assert.equal(await printPage.locator(".pdf-hint").isHidden(), true);
	// The pick's green edge shows while the pick is on the desk.
	const SIGNAL = "rgb(75, 155, 111)";
	const pickedEdge = () => printPage.evaluate(() => getComputedStyle(document.querySelector(".pick.picked")).borderTopColor);
	assert.equal(await pickedEdge(), SIGNAL);
	// The desk is as tall as the design on show: hidden documents keep no size, and scrolling ends at the last page.
	const deskFit = () => printPage.evaluate(() => {
		const desk = document.querySelector(".desk");
		const shown = document.querySelector(".sheet-holder.shown");
		const hidden = Array.from(document.querySelectorAll(".sheet-holder:not(.shown)"));
		const sheets = document.querySelector(".sheets");
		const end = document.querySelector(".desk-top").offsetHeight + shown.offsetHeight + parseFloat(getComputedStyle(sheets).paddingBottom);
		return { hiddenSized: hidden.filter(holder => holder.offsetWidth || holder.offsetHeight).length, overshoot: Math.max(0, desk.scrollHeight - Math.max(end, desk.clientHeight)) };
	});
	const deskTop = () => printPage.evaluate(() => document.querySelector(".desk").scrollTop);
	const scrollDeskDown = () => printPage.evaluate(() => document.querySelector(".desk").scrollTop = 1e6);
	// The picked card shows page 1 of this article once it is built.
	await printPage.locator(".pick.picked .thumb.live iframe").waitFor({ state: "attached", timeout: 30000 });
	// So do the other designs' rows once their documents are built, and a locked row keeps its corner chip.
	await printPage.waitForFunction(() => document.querySelectorAll(".others .pick[data-locked] .thumb.live .thumb-live ~ .lock-chip").length == 2, null, { timeout: 30000 });

	// Locked preview: a locked design shows on the desk, the banner says so, and the footer swaps to the door.
	const lockedRow = printPage.locator(".others .pick[data-locked]").first();
	const lockedStyle = await lockedRow.getAttribute("data-style");
	// A design switch opens at page 1, wherever the reader was.
	await scrollDeskDown();
	await lockedRow.click();
	await printPage.waitForFunction(style => document.querySelector(".sheet-holder.shown iframe").contentDocument.body.classList.contains("style-" + style), lockedStyle);
	await printPage.locator(".desk-banner:not([hidden])").waitFor();
	assert.equal(await deskTop(), 0);
	assert.match(await printPage.locator(".banner-text .long").textContent(), /^Previewing .+, \d+ pages?\. It needs a free account\.$/);
	// The banner's pill closes the preview; it never names a design out of context.
	assert.equal(await printPage.locator(".banner-back").textContent(), "Close preview");
	// One selection at a time: the previewed row has the ink edge, the pick loses its green one.
	assert.notEqual(await pickedEdge(), SIGNAL);
	assert.equal(await printPage.locator(".duplex-hint").isHidden(), true);
	// "Ready to print" keeps what Print does: the pick's page count, not the preview's.
	assert.match(await printPage.locator(".summary").textContent(), new RegExp(`^${printed.pages} A4 pages? `));
	assert.equal(await printPage.locator(".act-print").isHidden(), true);
	assert.match(await printPage.locator(".continue-button").textContent(), /^Continue with email to print /);
	// The locked footer is one step: the ink pill, the Google link and the line under it. No second print pill.
	assert.equal(await printPage.locator(".print-pick-button").count(), 0);
	assert.deepEqual(await printPage.locator(".actions").evaluate(actions => Array.from(actions.querySelectorAll("button, a, p")).filter(element => element.checkVisibility()).map(element => element.textContent.trim())),
		[await printPage.locator(".continue-button").textContent(), "Continue with Google", "Free. No card."]);
	assert.ok(await lockedRow.evaluate(row => row.hasAttribute("data-previewing")));
	// Cmd/Ctrl+P follows the main pill: the door card, never a print of the locked design.
	await printPage.keyboard.press("Control+p");
	const door = printPage.locator(".door-slot-print .door");
	await door.waitFor();
	assert.match(await door.locator(".door-title").textContent(), /^Print in .+ with a free account$/);
	assert.equal(await door.locator(".button-ink").textContent(), "Continue with email");
	assert.equal(await door.locator(".door-exit").textContent(), "Keep printing without an account");
	// One ask at a time: with the card open, the footer's email pill steps aside.
	assert.equal(await printPage.locator(".continue-button").isHidden(), true);
	// "Keep printing without an account" closes the door, goes back to the pick and puts focus on Print.
	await door.locator(".door-exit").click();
	await printPage.locator(".desk-banner").waitFor({ state: "hidden" });
	assert.equal(await door.count(), 0);
	assert.ok((await deskStyle(printPage)).includes("style-" + pickStyle));
	await printPage.waitForFunction(() => document.activeElement && document.activeElement.matches(".print-button"));
	assert.equal(await pickedEdge(), SIGNAL);
	assert.deepEqual(await deskFit(), { hiddenSized: 0, overshoot: 0 });

	// Keys pressed inside the desk frame reach the page: Ctrl+P opens the door, never the print dialog of the locked
	// design, and a native print from the frame would print nothing while the preview shows.
	await lockedRow.click();
	await printPage.locator(".desk-banner:not([hidden])").waitFor();
	assert.equal(await printPage.evaluate(() => !!document.querySelector(".sheet-holder.shown iframe").contentDocument.getElementById("sb-print-blocked")), true);
	await printPage.locator(".sheet-holder.shown iframe").contentFrame().locator("body").click({ position: { x: 5, y: 5 } });
	await printPage.keyboard.press("Control+p");
	await door.waitFor();
	await printPage.keyboard.press("Escape");
	await printPage.locator(".desk-banner").waitFor({ state: "hidden" });
	assert.equal(await printPage.evaluate(() => !!document.querySelector(".sheet-holder.shown iframe").contentDocument.getElementById("sb-print-blocked")), false);

	// Ink saver: selectable for preview, with the one-line help, and never stored.
	await printPage.locator("[data-name=pictures] label[data-value=ink]").click();
	await printPage.locator(".desk-banner:not([hidden])").waitFor();
	assert.equal(await printPage.locator(".pictures-help").textContent(), "Ink saver prints photos as light dots. It comes with a free account.");
	await printPage.keyboard.press("Escape");
	await printPage.locator(".desk-banner").waitFor({ state: "hidden" });
	assert.equal(await printPage.locator("input[name=pictures]:checked").getAttribute("value"), "colour");

	// The gallery: a strip of all 11 designs pinned on top of the desk, with the panel still beside it. By keyboard the
	// current design is checked, arrow keys move the focus along the strip without choosing, and Enter chooses.
	const strip = printPage.locator(".desk-top .gallery");
	const checkedTile = () => printPage.locator(".gallery input:checked").getAttribute("value");
	await printPage.click(".all-toggle");
	await strip.waitFor();
	assert.equal(await printPage.locator(".gallery .tile").count(), 11);
	assert.equal(await printPage.locator(".gallery .tile[data-locked]").count(), 10);
	assert.equal(await printPage.locator(".print-button").isVisible(), true);
	assert.equal(await printPage.evaluate(() => document.activeElement.value), pickStyle);
	// The tiles show page 1 of this article, built one after another in the background.
	await printPage.waitForFunction(() => document.querySelectorAll(".gallery .tile .thumb.live .thumb-live").length == 11, null, { timeout: 90000 });
	assert.equal(await printPage.locator(".gallery .tile[data-locked] .thumb.live .lock-chip").count(), 10);
	await printPage.keyboard.press("ArrowRight");
	assert.ok((await deskStyle(printPage)).includes("style-" + pickStyle));
	const arrowed = await printPage.evaluate(() => document.activeElement.value);
	assert.notEqual(arrowed, pickStyle);
	assert.equal(await checkedTile(), pickStyle);
	await scrollDeskDown();
	await printPage.keyboard.press("Enter");
	await printPage.waitForFunction(style => document.querySelector(".sheet-holder.shown iframe").contentDocument.body.classList.contains("style-" + style), arrowed);
	assert.equal(await strip.isVisible(), true);
	assert.equal(await checkedTile(), arrowed);
	assert.equal(await deskTop(), 0);
	assert.equal(await printPage.locator(".act-locked").isVisible(), true);
	assert.notEqual(await pickedEdge(), SIGNAL);
	// A click on a tile shows it below; the pick's tile brings Print back.
	await printPage.locator(".gallery .tile", { hasText: "Riso zine" }).click();
	await printPage.waitForFunction(() => document.querySelector(".sheet-holder.shown iframe").contentDocument.body.classList.contains("style-riso"));
	assert.equal(await strip.isVisible(), true);
	assert.match(await printPage.locator(".banner-text .long").textContent(), /^Previewing Riso zine, /);
	await printPage.locator(`.gallery .tile[data-style="${pickStyle}"]`).click();
	await printPage.locator(".desk-banner").waitFor({ state: "hidden" });
	assert.equal(await printPage.locator(".act-print").isVisible(), true);
	assert.equal(await pickedEdge(), SIGNAL);
	assert.deepEqual(await deskFit(), { hiddenSized: 0, overshoot: 0 });
	// Close keeps the design that was on show; Escape closes the strip too.
	await printPage.locator(".gallery .tile", { hasText: "Riso zine" }).click();
	await printPage.locator(".desk-banner:not([hidden])").waitFor();
	await printPage.click(".gallery-close");
	await strip.waitFor({ state: "hidden" });
	assert.ok((await deskStyle(printPage)).includes("style-riso"));
	await printPage.click(".banner-back");
	await printPage.locator(".desk-banner").waitFor({ state: "hidden" });
	await printPage.click(".all-toggle");
	await strip.waitFor();
	await printPage.keyboard.press("Escape");
	await strip.waitFor({ state: "hidden" });
	assert.ok((await deskStyle(printPage)).includes("style-" + pickStyle));

	// Paper is open to a guest and remembered silently; duplex is gone from the stored settings.
	await printPage.locator("[data-name=paper] label[data-value=Letter]").click();
	await printPage.waitForFunction(() => /US Letter/.test(document.querySelector(".summary").textContent));
	const stored = await extensionPage.evaluate(() => chrome.storage.sync.get("print"));
	assert.equal(stored.print.paper, "Letter");
	assert.equal(stored.print.pictures, "ink", "a guest's preview never overwrites an account's stored choice");
	assert.ok(!("duplex" in stored.print));

	// Save as PDF: one help line under the link, only while its print window is open.
	await printPage.evaluate(() => {
		const win = document.querySelector(".sheet-holder.shown iframe").contentWindow;
		const print = win.print;
		win.print = () => {
			window.pdfHintShown = document.querySelector(".pdf-hint").checkVisibility() && document.querySelector(".pdf-hint").textContent;
			win.print = print;
		};
	});
	await printPage.click(".pdf-button");
	await printPage.locator(".panel-body > .done:not([hidden])").waitFor();
	assert.equal(await printPage.evaluate(() => window.pdfHintShown), "In the print window, set Destination to Save as PDF.");
	assert.equal(await printPage.locator(".pdf-hint").isHidden(), true);
	await printPage.locator(".done .link-button", { hasText: "Change something" }).click();
	await printPage.locator(".actions").waitFor();

	// Print: no counter is written; the done state shows when done.js is in this build.
	await printPage.click(".print-button");
	await new Promise(resolve => setTimeout(resolve, 800));
	assert.equal((await extensionPage.evaluate(() => chrome.storage.local.get(["guestPrints", "monthPrints"]))).guestPrints, undefined);
	await printPage.locator(".panel-body > .done:not([hidden])").waitFor();
	assert.equal(await printPage.locator(".actions").isHidden(), true);
	await printPage.close();
	await extensionPage.evaluate(defaults => chrome.storage.sync.set({ print: { ...defaults, paper: "A4" } }), PRINT_DEFAULTS);

	// Print straight away: the button works as a printer. The print page opens the print dialog by itself,
	// then closes and leaves the reader on the article. Nothing counts prints.
	await extensionPage.evaluate(defaults => chrome.storage.sync.set({ print: { ...defaults, paper: "A4", straightAway: true } }), PRINT_DEFAULTS);
	const straightPagePromise = context.waitForEvent("page", page => page.url().includes("print.html"));
	await run("print");
	const straightPage = await straightPagePromise;
	await straightPage.waitForEvent("close", { timeout: 60000 });
	assert.equal((await extensionPage.evaluate(() => chrome.storage.local.get("guestPrints"))).guestPrints, undefined);
	await extensionPage.evaluate(defaults => chrome.storage.sync.set({ print: { ...defaults, paper: "A4" } }), PRINT_DEFAULTS);

	// Save: not logged in, so the status card asks first; "Continue with email" opens the sign-up page, and once signed in the
	// upload goes through. The card's shadow root is closed, so it is opened up here to click the button. The straight-away
	// print above already put a card (closed root) on this tab, so the page is reloaded first.
	await article.reload();
	await article.waitForLoadState();
	await extensionPage.evaluate(async url => {
		const [tab] = await chrome.tabs.query({ url });
		await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
			const attach = Element.prototype.attachShadow;
			Element.prototype.attachShadow = function (init) { return attach.call(this, { ...init, mode: "open" }); };
		} });
	}, ARTICLE_URL);
	await run("save");
	const loginButton = article.locator("screenbreak-status").locator(".primary");
	await loginButton.waitFor({ timeout: 30000 });
	assert.equal(await loginButton.textContent(), "Continue with email");
	await loginButton.click();
	// The door opens the sign-up page; the stand-in server has no /signup/, so the test signs in on /login/.
	for (let attempt = 0; attempt < 60 && !log.some(line => line.startsWith("GET /signup/")); attempt++) {
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	await (await context.newPage()).goto(BASE + "/login/");
	for (let attempt = 0; attempt < 60 && !uploads.length; attempt++) {
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	assert.equal(uploads.length, 1, "upload received:\n" + log.join("\n"));
	assert.match(uploads[0], /Page saved with SingleFile/);
	assert.match(uploads[0], /data:image\/png;base64/);
	assert.doesNotMatch(uploads[0], /<script|screenbreak-status/);
	await article.locator("screenbreak-status").locator("text=Saved to your library").waitFor();

	// Undo removes the article again.
	await article.locator("screenbreak-status").locator("button:text('Undo')").click();
	await article.locator("screenbreak-status").locator("text=Removed from your library").waitFor();
	assert.deepEqual(removed, ["abc123"]);

	// Print and save: the print page opens, the article is saved in the background, and the print page says so.
	await extensionPage.evaluate(() => chrome.storage.sync.set({ saveWhenPrinting: true }));
	const printAndSavePage = await openPrintPage();
	await printAndSavePage.locator(".save-status:has-text('Saved to your library')").waitFor({ timeout: 30000 });
	assert.equal(uploads.length, 2);
	assert.equal(await printAndSavePage.locator(".save-actions a").textContent(), "Open");
	await printAndSavePage.close();
	await extensionPage.evaluate(() => chrome.storage.sync.set({ saveWhenPrinting: false }));

	// The door, end to end: a guest previews a locked design, continues with email from the footer pill (the
	// sign-in tab opens next to the print tab and the intent waits in session storage, with no second card), reloads
	// the page (the wait comes back), signs in, and the print page applies the design once.
	const doorPage = await openPrintPage();
	const doorRow = doorPage.locator(".others .pick[data-locked]").first();
	const doorStyle = await doorRow.getAttribute("data-style");
	await doorRow.click();
	await doorPage.locator(".desk-banner:not([hidden])").waitFor();
	await doorPage.click(".continue-button");
	await doorPage.locator(".door.waiting").waitFor();
	// The sign-in tab opens right after the print tab. The stand-in server has no sign-up page (it answers 404, and
	// Chrome then hides the tab's address), so the server's request log shows where it went.
	const tabs = await doorPage.evaluate(async () => {
		const current = await chrome.tabs.getCurrent();
		const [next] = await chrome.tabs.query({ windowId: current.windowId, index: current.index + 1 });
		return { opener: next && next.openerTabId, current: current.id, nextId: next && next.id };
	});
	assert.equal(tabs.opener, tabs.current);
	assert.ok(log.some(line => line.startsWith("GET /signup/ ")), "sign-up page requested:\n" + log.slice(-5).join("\n"));
	const intent = await doorPage.evaluate(() => chrome.storage.session.get("sbIntent"));
	assert.equal(intent.sbIntent.kind, "design");
	assert.equal(intent.sbIntent.design, doorStyle);
	assert.equal(intent.sbIntent.signInTabId, tabs.nextId);
	await doorPage.reload();
	await doorPage.waitForSelector("body:not(.is-loading)", { timeout: 60000 });
	await doorPage.locator(".door-slot-print .door.waiting").waitFor();
	me = { plan: "free", email: "reader@example.com", name: "Reader" };
	await doorPage.locator(".signed-in-line:not([hidden])").waitFor({ timeout: 10000 });
	assert.match(await doorPage.locator(".signed-in-line").textContent(), /^You're in\. .+ is ready to print\.$/);
	assert.ok((await deskStyle(doorPage)).includes("style-" + doorStyle));
	assert.equal(await doorPage.locator(".desk-banner").isHidden(), true);
	assert.equal(await doorPage.locator(".act-print").isVisible(), true);
	assert.deepEqual(await doorPage.evaluate(() => chrome.storage.session.get("sbIntent")), {});
	await doorPage.evaluate(id => chrome.tabs.remove(id), tabs.nextId);
	await doorPage.close();

	// A free account: every design and option is open, with no lock and no guest line.
	const accountPage = await openPrintPage();
	assert.equal(await accountPage.locator("[data-locked]").count(), 0);
	assert.equal(await accountPage.locator(".guest-line").isHidden(), true);
	assert.equal(await accountPage.locator(".locked-group").isHidden(), true);
	assert.deepEqual(await accountPage.locator(".who a").allTextContents(), ["Settings", "Reader"]);
	await accountPage.locator("[data-name=pictures] label[data-value=ink]").click();
	await accountPage.waitForFunction(() => document.querySelector(".summary").textContent);
	assert.equal(await accountPage.locator(".desk-banner").isHidden(), true);
	// A design with more than one page: the two-sided line shows under Print, and the pick loses its green edge.
	const longer = accountPage.locator(".others .pick").first();
	const longerStyle = await longer.getAttribute("data-style");
	await longer.click();
	await accountPage.waitForFunction(style => document.querySelector(".sheet-holder.shown iframe").contentDocument.body.classList.contains("style-" + style), longerStyle);
	const longerPages = await accountPage.evaluate(() => document.querySelector(".sheet-holder.shown iframe").contentDocument.querySelectorAll(".page").length);
	assert.ok(longerPages > 1, "the first other design runs to more than one page");
	assert.equal(await accountPage.locator(".duplex-hint").isVisible(), true);
	assert.equal(await accountPage.locator(".duplex-hint").textContent(), "To print on both sides, turn on Two-sided in the print window.");
	assert.equal(await accountPage.locator(".print-label").textContent(), `Print ${longerPages} pages`);
	assert.notEqual(await accountPage.evaluate(() => getComputedStyle(document.querySelector(".pick.picked")).borderTopColor), SIGNAL);
	await accountPage.close();
	me = null;

	// Changing the default action changes what the button does.
	await extensionPage.evaluate(() => chrome.storage.sync.set({ defaultAction: "print" }));
	await new Promise(resolve => setTimeout(resolve, 300));
	assert.deepEqual(await buttonState(), { popup: "", title: "Screenbreak: print this article" });

	console.log("All checks passed"); // eslint-disable-line no-console
} finally {
	await context.close();
	server.close();
}

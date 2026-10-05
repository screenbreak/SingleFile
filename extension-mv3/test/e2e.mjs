// End-to-end check of Save and Print in a real Chromium with the built extension loaded.
// Run `npm run build && npm test`. Set CHROMIUM_PATH to use a specific Chromium binary.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, log, uploads } from "./server.mjs";

const EXTENSION_PATH = new URL("../dist", import.meta.url).pathname;
const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const ARTICLE_URL = BASE + "/article.html";

const server = await start(PORT);
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-e2e-")), {
	executablePath: process.env.CHROMIUM_PATH || undefined,
	headless: true,
	args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
});
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const extensionId = worker.url().split("/")[2];
	const buttonState = () => worker.evaluate(async () => ({ popup: await chrome.action.getPopup({}), title: await chrome.action.getTitle({}) }));

	// Default: the button opens the Save/Print menu.
	await new Promise(resolve => setTimeout(resolve, 500));
	assert.match((await buttonState()).popup, /popup\.html$/);

	const article = await context.newPage();
	await article.goto(ARTICLE_URL);
	const extensionPage = await context.newPage();
	await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);
	await extensionPage.evaluate(base => chrome.storage.sync.set({ serverUrl: base, print: { font: "sans", size: "normal", columns: 1, images: true, openPrintDialog: false } }), BASE);
	const run = action => extensionPage.evaluate(async ({ action, url }) => {
		const [tab] = await chrome.tabs.query({ url });
		return chrome.runtime.sendMessage({ method: "screenbreak.run", action, tab });
	}, { action, url: ARTICLE_URL });

	// Print: the article opens in the print page, cleaned up, with code-built charts turned into images.
	const printPagePromise = context.waitForEvent("page", page => page.url().includes("print.html"));
	await run("print");
	const printPage = await printPagePromise;
	await printPage.waitForSelector("article:not([hidden])");
	const printed = await printPage.evaluate(() => ({
		title: document.querySelector("h1.title").textContent,
		meta: document.querySelector(".meta").textContent,
		images: Array.from(document.querySelectorAll(".content img")).map(image => image.getAttribute("src").split(/[,;]/)[0]),
		tables: document.querySelectorAll(".content table").length,
		embeds: document.querySelectorAll(".embed-link").length,
		text: document.querySelector(".content").textContent
	}));
	assert.equal(printed.title, "The Quiet Return of Paper");
	assert.match(printed.meta, /Longform Weekly.*Maria Papadopoulou/);
	assert.deepEqual(printed.images, [BASE + "/photo.png", "data:image/svg+xml", "data:image/png"]);
	assert.equal(printed.tables, 1);
	assert.equal(printed.embeds, 1);
	assert.doesNotMatch(printed.text, /Most popular|Advertisement|Privacy|By Maria/);

	// Save: not logged in, so the login page opens; once logged in the upload goes through.
	const loginPagePromise = context.waitForEvent("page", page => page.url().includes("/login/"));
	await run("save");
	await loginPagePromise;
	for (let attempt = 0; attempt < 60 && !uploads.length; attempt++) {
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	assert.equal(uploads.length, 1, "upload received:\n" + log.join("\n"));
	assert.match(uploads[0], /Page saved with SingleFile/);
	assert.match(uploads[0], /data:image\/png;base64/);
	assert.doesNotMatch(uploads[0], /<script|screenbreak-status/);

	// Changing the default action changes what the button does.
	await extensionPage.evaluate(() => chrome.storage.sync.set({ defaultAction: "print" }));
	await new Promise(resolve => setTimeout(resolve, 300));
	assert.deepEqual(await buttonState(), { popup: "", title: "Screenbreak: print this article" });

	console.log("All checks passed"); // eslint-disable-line no-console
} finally {
	await context.close();
	server.close();
}

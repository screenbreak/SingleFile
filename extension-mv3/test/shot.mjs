// Dev helper: screenshots of the print page and Settings with the built extension. node test/shot.mjs <out_dir> [article_url]
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start } from "./server.mjs";

const EXTENSION_PATH = new URL("../dist", import.meta.url).pathname;
const OUT = process.argv[2] || "shots";
const PORT = 8766;
const ARTICLE_URL = process.argv[3] || `http://localhost:${PORT}/article.html`;
const server = await start(PORT);
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-shot-")), {
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
	headless: true, viewport: { width: 1440, height: 900 },
	args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
});
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const extensionId = worker.url().split("/")[2];
	const article = await context.newPage();
	article.on("console", m => console.log("article:", m.text()));
	await article.goto(ARTICLE_URL);
	const extensionPage = await context.newPage();
	await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);
	await extensionPage.evaluate(base => chrome.storage.sync.set({ serverUrl: base }), `http://localhost:${PORT}`);
	const printPagePromise = context.waitForEvent("page", page => page.url().includes("print.html"));
	await extensionPage.evaluate(async url => {
		const [tab] = await chrome.tabs.query({ url });
		return chrome.runtime.sendMessage({ method: "screenbreak.run", action: "print", tab });
	}, ARTICLE_URL);
	const printPage = await printPagePromise;
	printPage.on("console", m => console.log("print:", m.text()));
	printPage.on("pageerror", e => console.log("print error:", e.message));
	await printPage.setViewportSize({ width: 1440, height: 900 });
	await printPage.waitForTimeout(700);
	await printPage.screenshot({ path: `${OUT}/print-wait.png` });
	await printPage.waitForSelector("body:not(.is-loading)", { timeout: 60000 });
	await printPage.waitForTimeout(800);
	await printPage.screenshot({ path: `${OUT}/print.png` });
	await printPage.click(".all-toggle");
	await printPage.locator(".tile", { hasText: "Riso zine" }).click();
	await printPage.waitForTimeout(1500);
	await printPage.screenshot({ path: `${OUT}/print-riso.png` });
	await extensionPage.setViewportSize({ width: 1440, height: 900 });
	await extensionPage.reload();
	await extensionPage.waitForTimeout(4000);
	await extensionPage.screenshot({ path: `${OUT}/settings.png` });
} finally {
	await context.close();
	server.close();
}

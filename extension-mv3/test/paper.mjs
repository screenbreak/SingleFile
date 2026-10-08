// The paper surface (research 05 §7), in a real Chromium with the built extension: the print address, the
// page-1 imprint, the end block and its margin line, for every design, both papers and every fixture article.
// The gift line has no UI (2026-10-08); the engine keeps it, so its escaping (T6) is still checked here.
// Run `npm run build && node test/paper.mjs`. Prints a table; writes one PDF per end-block mode to
// design/after/paper/ (pdftotext/pdffonts check them when installed). Set CHROMIUM_PATH to use another Chromium;
// SB_TEST_PORT for the test server's port; PAPER_FIXTURE=<name> runs one fixture and no PDFs (for tuning a fixture).
// Page counts are compared with test/paper-baseline.json (the engine without the end block); after a change to
// the engine that is meant to move pages, regenerate it with SB_PAPER_BASELINE=write node test/paper.mjs.
import { chromium } from "playwright";
import * as esbuild from "esbuild";
import QRCode from "qrcode";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { printURL, cleanURL } from "../src/engine/print-url.js";
import { giftLine, cssString, endLines } from "../src/engine/layout.js";
import { DESIGNS } from "../src/designs.js";
import { start } from "./server.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const EXTENSION_PATH = ROOT + "dist";
const PDF_DIR = ROOT + "design/after/paper";
const BASELINE = new URL("paper-baseline.json", import.meta.url);
const PORT = Number(process.env.SB_TEST_PORT) || 8775;
const BASE = `http://localhost:${PORT}`;
const LONG_PATH = "/environment/2026/oct/07/the-library-that-lends-seeds-how-a-small-town-library-in-the-hills-started-lending-tomato-bean-and-squash-seeds-and-what-came-back-in-the-autumn?section=environment&series=local-heroes";
const FIXTURES = {
	article: { url: BASE + "/article.html", printURL: BASE + "/article.html" },
	"one-page": { url: BASE + "/pages/one-page.html", printURL: BASE + "/pages/one-page.html" },
	"full-last": { url: BASE + "/pages/full-last-page.html", printURL: BASE + "/pages/full-last-page.html" },
	tracking: { url: BASE + "/pages/tracking.html?ref=home&utm_source=newsletter&fbclid=AbC123&gift=9f8e7d#comments", printURL: BASE + "/culture/2026/oct/07/paper-maps?id=42" },
	"long-url": { url: BASE + "/pages/long-url.html?utm_medium=email", printURL: BASE + LONG_PATH },
	// Swiss with 8 to 20mm free on the last page: mode B (one line), not A, not C.
	"swiss-b": { url: BASE + "/pages/swiss-b.html", printURL: BASE + "/pages/swiss-b.html" },
	// Full last pages with the long address (?sb-long below): the mode C margin line is cut to one line of the box,
	// two lines with the imprint on a one-page print.
	"full-last-long": { url: BASE + "/pages/full-last-page.html?sb-long=1", printURL: BASE + LONG_PATH },
	"tracking-long": { url: BASE + "/pages/tracking.html?sb-long=1", printURL: BASE + LONG_PATH }
};
// T6: a gift line that tries to close the CSS string and add its own page rule.
const GIFT = { for: "\"; } @page { margin: 0 } x {", from: "Yorgos\\" };
const STYLES = Object.keys(DESIGNS);
const PAPERS = ["A4", "Letter"];
const IMPRINT = "Printed with myscreenbreak.com";
const ONLY = process.env.PAPER_FIXTURE;
const WRITE_BASELINE = process.env.SB_PAPER_BASELINE == "write";

// 1. The print address, without a browser (T8).
const CASES = [
	[{ href: "https://www.theguardian.com/world/2026/oct/07/slug?CMP=share_btn_link&utm_source=x#comments" }, "https://www.theguardian.com/world/2026/oct/07/slug"],
	[{ href: "https://example.com/a?p=123&utm_medium=email&utm_campaign=x" }, "https://example.com/a?p=123"],
	[{ href: "https://example.com/a?fbclid=1&gclid=2&dclid=3&msclkid=4&mc_cid=5&mc_eid=6" }, "https://example.com/a"],
	[{ href: "https://example.com/a?_hsenc=1&_hsmi=2&igshid=3&ref=4&ref_src=5&smid=6&sgrp=7&cmpid=8" }, "https://example.com/a"],
	[{ href: "https://www.nytimes.com/2026/10/07/arts/x.html?unlocked_article_code=1.AbC&smid=url-share" }, "https://www.nytimes.com/2026/10/07/arts/x.html"],
	[{ href: "https://www.ft.com/content/abc?shareType=nongift&accessToken=zwAAA&giftToken=1" }, "https://www.ft.com/content/abc"],
	[{ href: "https://www.washingtonpost.com/a/?pwapi_token=eyJ&reflink=share" }, "https://www.washingtonpost.com/a/"],
	[{ href: "https://www.theatlantic.com/a/1/?gift=xyz&token=abc" }, "https://www.theatlantic.com/a/1/"],
	[{ href: "https://www.economist.com/a?giftId=1&share_id=2&shared=3" }, "https://www.economist.com/a"],
	[{ href: "https://example.com/a?id=7&page=2" }, "https://example.com/a?id=7&page=2"],
	[{ href: "https://example.com/a?q=a%20b&utm_x=1" }, "https://example.com/a?q=a%20b"],
	[{ href: "https://example.com/a?UTM_Source=x&Ref=y" }, "https://example.com/a"],
	[{ href: "https://example.com/a#section-2" }, "https://example.com/a"],
	[{ href: "https://example.com/a?" }, "https://example.com/a"],
	[{ href: "https://example.com/amp/a", canonical: "https://example.com/a" }, "https://example.com/a"],
	[{ href: "https://example.com/a", canonical: "https://www.example.com/a?utm_source=x" }, "https://www.example.com/a"],
	[{ href: "https://www.example.com/a", canonical: "https://example.com/a" }, "https://example.com/a"],
	[{ href: "https://example.com/a", canonical: "https://other.com/a" }, "https://example.com/a"],
	[{ href: "https://example.com/a", canonical: "https://other.com/a", ogURL: "https://example.com/a-og" }, "https://example.com/a-og"],
	[{ href: "https://example.com/a", canonical: "https://example.com/" }, "https://example.com/a"],
	[{ href: "https://example.com/", canonical: "https://example.com/" }, "https://example.com/"],
	[{ href: "https://example.com/a", canonical: "https://example.com/", ogURL: "https://example.com/b" }, "https://example.com/b"],
	[{ href: "https://example.com/a", canonical: "ftp://example.com/a" }, "https://example.com/a"],
	[{ href: "https://example.com/a", canonical: "not a url" }, "https://example.com/a"],
	[{ href: "https://m.example.com/a", canonical: "https://example.com/a" }, "https://m.example.com/a"],
	[{ href: "https://shop.example.com/a", canonical: "https://example.com/a" }, "https://shop.example.com/a"],
	[{ href: "https://example.com/a?p=1", canonical: "https://example.com/a?p=1#x" }, "https://example.com/a?p=1"],
	[{ href: "https://example.com/a", ogURL: "https://example.com/a?utm_source=og" }, "https://example.com/a"],
	[{ href: "http://example.com/a?utm_source=x" }, "http://example.com/a"],
	[{ href: "file:///Users/x/a.html" }, "file:///Users/x/a.html"]
];
for (const [input, expected] of CASES) {
	assert.equal(printURL(input), expected, JSON.stringify(input));
}
assert.equal(cleanURL("chrome://settings"), null);

// 2. The gift line (T6): one line, at most 32 characters a name, escaped for a CSS string.
assert.equal(giftLine({ for: "Maria", from: "Yorgos" }), "Printed for Maria, from Yorgos");
assert.equal(giftLine({ for: " Maria " }), "Printed for Maria");
assert.equal(giftLine({ from: "Yorgos" }), "From Yorgos");
assert.equal(giftLine({ for: "  ", from: "" }), "");
assert.equal(giftLine({ for: "Ma\nria\u0000 x" }), "Printed for Ma ria x");
assert.equal(giftLine({ for: "x".repeat(60) }), "Printed for " + "x".repeat(32));
assert.equal(giftLine({ for: "😀".repeat(40) }), "Printed for " + "😀".repeat(32));
assert.equal(giftLine({ for: "مريم", from: "Γιώργος" }), "Printed for مريم, from Γιώργος");
assert.equal(cssString("a\"b\\c</style>"), "\"a\\\"b\\\\c\\3c /style>\"");
assert.equal(cssString(giftLine(GIFT)), "\"Printed for \\\"; } @page { margin: 0 } x {, from Yorgos\\\\\"");

// The margin line of a full last page (mode C): one line of the 150mm box, 95 characters (80 in Large print);
// a short address stays whole, a long one keeps its start and its end.
for (const [style, chars] of [["classic", 95], ["book", 95], ["large", 80]]) {
	const long = endLines(style, BASE + LONG_PATH), short = endLines(style, "https://www.example.com/a/b");
	assert.equal(Array.from(long.end).length, chars, `${style}: long end line ${long.end}`);
	assert.equal(Array.from(long.first).length, chars, `${style}: long first end line ${long.first}`);
	assert.ok(long.end.endsWith(" · " + IMPRINT) && long.first.startsWith("Original: localhost:") && long.first.endsWith("series=local-heroes"), `${style}: the cut keeps both ends`);
	assert.deepEqual(short, { end: "Original: example.com/a/b · " + IMPRINT, first: "Original: example.com/a/b" }, `${style}: short address stays whole`);
}

// 3. In Chromium: capture each fixture with the extension, then compose and paginate every design twice, with
// and without the end block.
const engine = (await esbuild.build({
	stdin: { contents: "import { prepare, compose } from './src/engine/layout.js'; import { sanitize } from './src/engine/sanitize.js'; window.__engine = { prepare, compose, sanitize };", resolveDir: ROOT },
	bundle: true, write: false, format: "iife", logLevel: "silent"
})).outputFiles[0].text;

const server = await start(PORT);
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sb-paper-")), {
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
	headless: true,
	args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
});
// The new fixtures live in test/pages/ (server.mjs serves test/fixtures/ only). ?sb-long serves the page with the
// long canonical address instead of its own.
await context.route(`${BASE}/pages/**`, route => {
	const address = new URL(route.request().url());
	const file = new URL("pages/" + address.pathname.split("/").pop(), import.meta.url);
	if (!existsSync(file)) {
		return route.fulfill({ status: 404 });
	}
	let body = readFileSync(file, "utf8");
	if (address.searchParams.has("sb-long")) {
		body = body.replace(/<link rel="canonical"[^>]*>/, "").replace("<meta charset=\"utf-8\">", `<meta charset="utf-8"><link rel="canonical" href="${LONG_PATH.replace(/&/g, "&amp;")}">`);
	}
	return route.fulfill({ contentType: "text/html", body });
});
const rows = [];
const articles = {};
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const moved = [];
// The PDFs: [file label, fixture, design, the end mode the table must show for it] (A4).
const PDFS = [["A", "tracking", "classic", "A"], ["A-one-page", "one-page", "classic", "A"], ["B", "long-url", "classic", "B"],
	["B-swiss", "swiss-b", "swiss", "B"], ["C", "full-last", "classic", "C"], ["C-long", "full-last-long", "classic", "C"],
	["C-one-page", "article", "riso", "C"], ["C-one-page-long", "tracking-long", "large", "C"], ["A-book", "full-last", "book", "A"]];
try {
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const extensionId = worker.url().split("/")[2];
	const host = await context.newPage();
	await host.goto(`chrome-extension://${extensionId}/sheet.html`);
	await host.evaluate(engine);

	for (const [name, fixture] of Object.entries(FIXTURES).filter(([name]) => !ONLY || name == ONLY)) {
		const tab = await context.newPage();
		await tab.goto(fixture.url);
		const article = await worker.evaluate(async url => {
			const tab = (await chrome.tabs.query({})).find(tab => tab.url == url);
			await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-print.js"] });
			const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__screenbreakExtract() });
			return injection.result;
		}, fixture.url);
		await tab.close();
		assert.ok(article && article.content, `${name}: captured`);
		articles[name] = article;
		assert.equal(article.url, fixture.url, `${name}: url stays the page address`);
		assert.equal(article.printURL, fixture.printURL, `${name}: printURL`);
		assert.ok(Number.isInteger(article.screens) && article.screens >= 1, `${name}: screens ${article.screens}`);
		const facts = await host.evaluate(async article => {
			const { prepare, sanitize } = window.__engine;
			window.__prepared = await prepare({ ...article, content: sanitize(article.content, article.url) });
			return { screens: window.__prepared.facts.screens, printURL: window.__prepared.man.printURL, url: window.__prepared.man.url };
		}, article);
		assert.deepEqual(facts, { screens: article.screens, printURL: fixture.printURL, url: fixture.url }, `${name}: prepare() keeps screens and printURL`);
		// The QR's dark modules, as the qrcode package draws them for printURL (the page serialises the SVG its own way).
		const modules = svg => (/stroke="#000000" d="([^"]+)"/.exec(svg || "") || [])[1];
		const expectedQR = modules(await QRCode.toString(fixture.printURL, { type: "svg", margin: 0, errorCorrectionLevel: "M" }));

		const qrModules = (() => {
			try {
				return QRCode.create(fixture.printURL, { errorCorrectionLevel: "M" }).modules.size;
			} catch {
				return 0;
			}
		})();

		for (const [paper, style] of PAPERS.flatMap(paper => STYLES.map(style => [paper, style]))) {
			const result = await host.evaluate(async ({ style, paper, gift }) => {
				const doc = await window.__engine.compose(window.__prepared, { style, pictures: "colour", references: "small", paper, gift });
				const render = async doc => {
					const frame = document.createElement("iframe");
					frame.style.cssText = "width: 900px; height: 1200px";
					document.body.append(frame);
					await new Promise(resolve => { frame.onload = resolve; frame.src = "sheet.html"; });
					const out = await frame.contentWindow.renderSheet(doc);
					const sheet = frame.contentDocument;
					const pages = [...sheet.querySelectorAll("#book .page")];
					const block = sheet.querySelector(".endblock");
					const last = pages[pages.length - 1];
					const clipped = block ? block.getBoundingClientRect().bottom > last.getBoundingClientRect().bottom + 1 : false;
					const qr = block && block.classList.contains("mode-a") ? block.querySelector(".qr svg").outerHTML : null;
					const margins = [...sheet.querySelectorAll(".sb-margin")].map(box => box.textContent);
					const mm = px => +(px / (96 / 25.4)).toFixed(2);
					// The bottom margin lines as the preview draws them (sheet.css: the same face, size and 150mm box).
					const lines = box => {
						const range = sheet.createRange();
						range.selectNodeContents(box);
						return new Set([...range.getClientRects()].filter(rect => rect.width).map(rect => Math.round(rect.top))).size;
					};
					const sheets = [...sheet.querySelectorAll(".paper")];
					const bottomLines = sheets.map(paper => paper.querySelector(".sb-margin.bottom")).map(box => box ? lines(box) : 0);
					// The block's own imprint, as printed (innerText leaves out what is hidden), and the QR's quiet zone:
					// the padding under the rule, and in Swiss the gap down to the progress bar.
					const blockText = block && block.isConnected ? block.innerText : "";
					const quietMM = block && block.isConnected ? mm(parseFloat(getComputedStyle(block).paddingTop)) : null;
					const bar = last.querySelector(".progress"), code = block && block.isConnected && block.querySelector(".mode-a .qr, .qr");
					const barGapMM = bar && code && getComputedStyle(bar).display != "none" && block.classList.contains("mode-a") ? mm(bar.getBoundingClientRect().top - code.getBoundingClientRect().bottom) : null;
					frame.remove();
					return { pages: out.pages, end: out.end, clipped, qr, margins, bottomLines, blockText, quietMM, barGapMM, lastPage: last.style.page || "" };
				};
				const withBlock = await render(doc);
				const without = await render({ ...doc, bodyHTML: doc.bodyHTML.replace(/<footer class="endblock"[\s\S]*?<\/footer>/, "") });
				// The CSS as Chrome reads it: the gift line must stay inside its string (no extra page rule).
				const parsed = new CSSStyleSheet();
				parsed.replaceSync(doc.css.replace(/@font-face\{[^}]*\}/g, ""));
				const pageRules = [...parsed.cssRules].filter(rule => rule instanceof CSSPageRule);
				return { withBlock, without, css: doc.css, pageRules: pageRules.map(rule => ({ selector: rule.selectorText, margin: rule.style.margin, text: rule.cssText })) };
			}, { style, paper, gift: GIFT });
			const { withBlock, without, css, pageRules } = result;
			const label = `${name} / ${style} / ${paper}`, key = `${name}/${style}/${paper}`;
			assert.equal(withBlock.pages, without.pages, `${label}: the end block changed the page count`);
			// The page count against the committed baseline (the engine without the end block).
			if (WRITE_BASELINE) {
				baseline[key] = without.pages;
			} else if (baseline[key] !== withBlock.pages) {
				moved.push(`${label}: ${withBlock.pages} page(s), baseline ${baseline[key] ?? "missing"}`);
			}
			assert.ok(withBlock.end && /^[ABC]$/.test(withBlock.end.mode), `${label}: end mode reported`);
			assert.equal(withBlock.clipped, false, `${label}: end block cut off by the page edge`);
			assert.equal(withBlock.lastPage, withBlock.end.mode == "C" ? "sb-end" : "", `${label}: named page only in mode C`);
			if (style == "notes" || fixture.printURL.length > 122) {
				assert.notEqual(withBlock.end.mode, "A", `${label}: mode B at most`);
			}
			if (withBlock.end.mode == "A") {
				assert.equal(modules(withBlock.qr), expectedQR, `${label}: the QR is printURL`);
				assert.ok(withBlock.end.qrMM >= (style == "large" ? 18 : 16) && withBlock.end.qrMM <= 20, `${label}: QR size ${withBlock.end.qrMM}mm`);
				const quiet = Math.max(2, 4 * withBlock.end.qrMM / qrModules);
				assert.ok(withBlock.quietMM >= quiet - 0.05, `${label}: ${withBlock.quietMM}mm over the QR, 4 modules are ${quiet.toFixed(2)}mm`);
				if (withBlock.barGapMM !== null) {
					assert.ok(withBlock.barGapMM >= 1.7, `${label}: ${withBlock.barGapMM}mm between the QR and the progress bar`);
				}
			}
			// The imprint prints once on a one-page print (page 1's margin), twice on longer prints (page 1's margin
			// and the end block or the last page's margin).
			if (withBlock.end.mode != "C") {
				assert.equal(withBlock.blockText.includes(IMPRINT), withBlock.pages > 1, `${label}: imprint in the end block of a ${withBlock.pages}-page print`);
				assert.match(withBlock.blockText, /Original/, `${label}: the end block keeps the original address`);
			} else {
				// Mode C: one margin line on the last page, or the imprint and the address (two lines) on a one-page print.
				const expected = withBlock.pages > 1 ? [1, ...Array(withBlock.pages - 2).fill(0), 1] : [2];
				assert.deepEqual(withBlock.bottomLines, expected, `${label}: lines in the bottom margins`);
			}
			const imprintBox = style == "book" ? "bottom-center" : "bottom-left", giftBox = style == "book" ? "top-center" : "top-left";
			assert.ok(css.includes(`@page :first { @${imprintBox} { content: "Printed with myscreenbreak.com";`), `${label}: imprint on page 1`);
			assert.ok(css.includes(`@page :first { @${giftBox} { content: ${cssString(giftLine(GIFT))};`), `${label}: gift line escaped`);
			assert.ok(!pageRules.some(rule => rule.margin == "0px"), `${label}: the gift line broke out of its string`);
			assert.ok(pageRules.some(rule => rule.selector == ":first" && rule.text.includes("Printed for")), `${label}: gift rule parsed`);
			assert.ok(!/utm_|fbclid|gift=|#comments/.test(css + withBlock.margins.join(" ")), `${label}: tracking in the print`);
			assert.equal(withBlock.margins[0], giftLine(GIFT), `${label}: gift line on the preview`);
			rows.push({ fixture: name, design: style, paper, pages: withBlock.pages, without: without.pages, end: withBlock.end.mode, qrMM: withBlock.end.qrMM, roomMM: withBlock.end.roomMM });
		}
	}

	if (WRITE_BASELINE) {
		const sorted = Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
		writeFileSync(BASELINE, JSON.stringify(sorted, null, "\t") + "\n");
		console.log(`Wrote ${Object.keys(sorted).length} page counts to test/paper-baseline.json`); // eslint-disable-line no-console
	}
	assert.equal(moved.length, 0, `Page counts moved from test/paper-baseline.json:\n  ${moved.join("\n  ")}\n` +
		"If the engine change is meant to move pages, regenerate the baseline: SB_PAPER_BASELINE=write node test/paper.mjs");

	// What the fixtures are for: a one-page print, a last page too full for the end block (under 8mm free), Swiss
	// with 8 to 20mm free, and full last pages with the long address.
	const row = (fixture, design, paper = "A4") => rows.find(r => r.fixture == fixture && r.design == design && r.paper == paper);
	if (!ONLY) {
		assert.equal(row("one-page", "classic").pages, 1, "one-page fixture: one page in Classic");
		assert.ok(row("full-last", "classic").pages > 1 && row("full-last", "classic").roomMM < 8, "full-last fixture: a full last page in Classic");
		assert.ok(row("swiss-b", "swiss").roomMM >= 8 && row("swiss-b", "swiss").roomMM <= 20 && row("swiss-b", "swiss").end == "B", "swiss-b fixture: 8 to 20mm free in Swiss, mode B");
		assert.ok(row("full-last-long", "classic").pages > 1 && row("full-last-long", "classic").end == "C", "full-last-long fixture: mode C on a print of several pages");
		assert.ok(row("tracking-long", "large").pages == 1 && row("tracking-long", "large").end == "C", "tracking-long fixture: mode C on a one-page print");
		for (const mode of ["A", "B", "C"]) {
			assert.ok(rows.some(r => r.end == mode), `no fixture printed in mode ${mode}`);
		}
	}

	// 4. PDFs as Chrome prints them, one per mode: the words on paper (T4, T5).
	mkdirSync(PDF_DIR, { recursive: true });
	const hasPoppler = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();
	for (const [mode, name, style, expected] of ONLY ? [] : PDFS) {
		assert.equal(row(name, style).end, expected, `${name} / ${style}: end mode for the ${mode} PDF`);
		const example = { name, style, paper: "A4", article: articles[name] };
		const page = await context.newPage();
		await page.goto(`chrome-extension://${extensionId}/sheet.html`);
		await page.evaluate(engine);
		const pages = await page.evaluate(async ({ article, style, paper }) => {
			const { prepare, compose, sanitize } = window.__engine;
			const prepared = await prepare({ ...article, content: sanitize(article.content, article.url) });
			const out = await window.renderSheet(await compose(prepared, { style, paper }));
			return out.pages;
		}, example);
		const lines = endLines(style, FIXTURES[name].printURL);
		const file = `${PDF_DIR}/mode-${mode}-${name}-${style}.pdf`;
		await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
		await page.close();
		if (hasPoppler) {
			const text = n => execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), file, "-"]).toString();
			const count = +/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [file]).toString())[1];
			assert.equal(count, pages, `${file}: the PDF has the pages the sheet built`);
			assert.match(text(1), /Printed with myscreenbreak\.com/, `${file}: imprint on page 1`);
			assert.doesNotMatch(text(1), /Printed for/, `${file}: no gift line`);
			assert.match(text(count), /Original/, `${file}: the original address on the last page`);
			const all = execFileSync("pdftotext", [file, "-"]).toString();
			assert.equal(all.split(IMPRINT).length - 1, count > 1 ? 2 : 1, `${file}: the imprint prints once on one page, twice on more`);
			if (expected == "C") {
				// The margin line on one line of the box: with the imprint after it, or under the imprint on one page.
				// (pdftotext -layout puts the page number at the end of the same line, or on a line of its own.)
				const last = text(count).split("\n").map(line => line.trim().replace(/\s{2,}\d+$/, "")).filter(line => line && !/^\d+$/.test(line)), at = last.findIndex(line => line.startsWith("Original:"));
				const line = count > 1 ? lines.end : lines.first;
				assert.equal(last[at], line, `${file}: the margin line, on one line`);
				assert.equal(last.length - 1 - at, 0, `${file}: nothing under the margin line`);
				if (count == 1) {
					assert.equal(last[at - 1], IMPRINT, `${file}: the imprint over the margin line`);
				}
			}
			assert.doesNotMatch(all, /utm_|fbclid|gift=|#comments/, `${file}: no tracking on paper`);
			assert.match(execFileSync("pdffonts", [file]).toString(), /IBMPlexMono/, `${file}: the imprint face is embedded`);
		}
		console.log(`PDF ${mode}: ${file.replace(ROOT, "")} (${pages} page${pages > 1 ? "s" : ""})`); // eslint-disable-line no-console
	}
} finally {
	await context.close();
	server.close();
}

const pad = (value, width) => String(value).padEnd(width);
console.log(["fixture", "design", "paper", "pages", "w/o", "end", "qr mm", "room mm"].map((h, i) => pad(h, [10, 11, 7, 6, 5, 4, 6, 7][i])).join(" ")); // eslint-disable-line no-console
for (const row of rows) {
	console.log([row.fixture, row.design, row.paper, row.pages, row.without, row.end, row.qrMM || "-", row.roomMM].map((v, i) => pad(v, [10, 11, 7, 6, 5, 4, 6, 7][i])).join(" ")); // eslint-disable-line no-console
}
const spread = ["A", "B", "C"].map(mode => `${mode} ${rows.filter(row => row.end == mode).length}`).join(" · ");
console.log(`${rows.length} prints, page counts equal with and without the end block. Modes: ${spread}.`); // eslint-disable-line no-console
console.log("All paper checks passed"); // eslint-disable-line no-console

// Dev harness for the done state (not shipped): bundles src/done.js, src/offers.js and src/receipt.js, loads them
// into design/done-harness.html (the print page's markup with the real stylesheets), drives every state at 1280
// and 390 px, screenshots them and measures the text left edges.
// Run from extension-mv3: `node design/done-harness.mjs` (it runs the build first; SB_CAPTURE_PORT for another
// port). Output: design/after/done/.
import { chromium } from "playwright";
import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "design/after/done");
mkdirSync(OUT, { recursive: true });
execFileSync("node", ["build.mjs"], { cwd: ROOT, stdio: "ignore" });

const bundle = await esbuild.build({
	stdin: { contents: `import * as done from "./src/done.js"; import * as offers from "./src/offers.js"; import * as receipt from "./src/receipt.js"; window.SB = { done, offers, receipt };`, resolveDir: ROOT },
	bundle: true, format: "iife", target: "chrome110", write: false
});
const harnessJS = bundle.outputFiles[0].text;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
	const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
	let body, file;
	if (path == "/") file = join(ROOT, "design/done-harness.html");
	else if (path == "/harness.js") body = harnessJS;
	else file = join(ROOT, "dist", path);
	if (file && !existsSync(file)) {
		response.writeHead(404).end();
		return;
	}
	response.writeHead(200, { "content-type": TYPES[extname(file || path)] || "application/octet-stream" });
	response.end(body ?? readFileSync(file));
});
const PORT = Number(process.env.SB_CAPTURE_PORT) || 8767;
await new Promise(resolve => server.listen(PORT, resolve));
const BASE = `http://localhost:${PORT}/`;

const REASON = "4 photos and 2,100 words fit two newspaper pages.";
const BROADSHEET = { id: "broadsheet", name: "Broadsheet" };
// Each state: how many distinct articles were printed before (the last one is this print), and the showDone options.
const STATES = [
	{ name: "01-first-print", seed: { distinct: 1 }, show: {} },
	{ name: "02-print-window-closed", seed: { distinct: 2, reviewAsked: true }, show: {} },
	{ name: "03-pdf", seed: { distinct: 2 }, show: { kind: "pdf" } },
	{ name: "04-one-page", seed: { distinct: 2, reviewAsked: true, pages: 1, screens: 3 }, show: { pages: 1, screens: 3, reason: "A short piece: it fits one page with room to spare." } },
	{ name: "05-review-3-articles", seed: { distinct: 3 }, show: {} },
	{ name: "06-receipt-5-articles", seed: { distinct: 5, reviewAsked: true }, show: {}, expect: "receipt" },
	{ name: "07-account-10-articles", seed: { distinct: 10, reviewAsked: true }, show: {}, expect: "account" },
	{ name: "08-unlock-after-locked-click", seed: { distinct: 2 }, show: { lockedClicked: true }, expect: "account" },
	{ name: "09-year-card", seed: { distinct: 6, reviewAsked: true, start: new Date(2026, 10, 27).getTime() }, show: {}, expect: "year" },
	{ name: "10-long-title", seed: { distinct: 2, reviewAsked: true, pages: 12, screens: 41 }, show: { design: { id: "cover", name: "Cover story" }, pages: 12, screens: 41, reason: "A sharp lead photo and a long feature with eleven sections, so the lead photo fills page one and the text follows in two columns." } },
	{ name: "11-no-screens", seed: { distinct: 2, reviewAsked: true, screens: null }, show: { screens: null } },
	// thumb: what print.js passes, desk.thumbnail(desk.current, 52) (a live frame element), or null before it exists.
	{ name: "15-thumb-element", seed: { distinct: 2, reviewAsked: true }, show: {}, thumb: "element" },
	{ name: "16-no-thumb", seed: { distinct: 2, reviewAsked: true }, show: {}, thumb: "none" }
];

const report = { checks: [], files: [] };
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }), headless: true });
try {
	for (const width of [1280, 390]) {
		const context = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 2 });
		await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE.slice(0, -1) });
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.goto(BASE);
		await page.evaluate(() => {
			document.querySelector(".wait").hidden = true;
			document.querySelector(".source-title").textContent = "The Quiet Return of Paper";
			document.querySelector(".source-site").textContent = "· example.com";
			document.querySelector(".sheets").innerHTML = Array.from({ length: 3 }, () => `<img src="designs/broadsheet.webp" alt="" style="width:min(520px,90%);margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,.18);background:#fff">`).join("");
			document.querySelector(".summary").textContent = "Broadsheet · 5 pages";
		});
		await page.evaluate(() => document.fonts.ready);

		for (const state of STATES) {
			const result = await page.evaluate(async ({ seed, show, thumbKind, REASON, BROADSHEET }) => {
				const { offers, done } = window.SB;
				window.current?.close();
				await chrome.storage.local.clear();
				await chrome.storage.session.clear();
				let time = seed.start || new Date(2026, 9, 1, 9).getTime();
				offers.clock.now = () => time;
				for (let i = 0; i < seed.distinct; i++) {
					time += 864e5;
					await offers.recordPrint({ url: `https://example.com/story/${i}`, design: "broadsheet", pages: seed.pages ?? 5, screens: seed.screens === undefined ? 14 : seed.screens, words: 2100, photos: 4 });
				}
				if (seed.reviewAsked) await chrome.storage.local.set({ reviewAsk: { at: 1 } });
				for (const node of document.querySelectorAll(".panel-body > :not(.done)")) node.hidden = true;
				const log = [];
				// The same shape desk.thumbnail() returns: a span holding a scaled page, sized inline.
				const live = () => {
					const holder = document.createElement("span");
					holder.className = "thumb-live";
					holder.style.cssText = "display:block;overflow:hidden;width:52px;height:74px;";
					holder.innerHTML = `<img src="designs/broadsheet.webp" alt="" style="width:52px;height:74px;object-fit:cover">`;
					return holder;
				};
				const thumb = thumbKind == "none" ? null : thumbKind == "element" ? live() : "designs/broadsheet.webp";
				window.current = done.showDone(document.querySelector(".panel-body .done"), {
					kind: "print", design: BROADSHEET, pages: 5, reason: REASON, screens: 14, account: { state: "guest" }, serverUrl: "https://myscreenbreak.com",
					thumb,
					onBack: () => log.push("back"), onPrintAgain: () => log.push("again"), openDoor: intent => log.push(intent),
					onChange: () => { for (const node of document.querySelectorAll(".panel-body > :not(.done)")) node.hidden = false; log.push("change"); },
					...show
				});
				await new Promise(resolve => setTimeout(resolve, 400));
				const slot = document.querySelector(".done-offer");
				return { offer: slot.hidden ? null : slot.textContent, eyebrow: document.querySelector(".done-eyebrow-text").textContent, focused: document.activeElement?.className };
			}, { seed: state.seed, show: state.show, thumbKind: state.thumb, REASON, BROADSHEET });
			if (state.expect) await page.waitForSelector(".done-offer:not([hidden])");
			await page.waitForTimeout(150);
			const file = `${state.name}-${width}.png`;
			await page.screenshot({ path: join(OUT, file) });
			report.files.push(file);

			// Text left edges: eyebrow, title, reason, saving, pill, links, offer.
			const edges = await page.evaluate(() => {
				const textLeft = element => {
					const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() ? 1 : 3 });
					const text = walker.nextNode();
					if (!text) return element.getBoundingClientRect().left;
					const range = document.createRange();
					range.selectNodeContents(text);
					return range.getClientRects()[0].left;
				};
				const out = {};
				for (const [name, selector, box] of [
					["eyebrow", ".done-eyebrow-text"], ["title", ".done-title"], ["reason", ".done-reason"], ["saving", ".done-saving"],
					["back pill", ".done-back", true], ["print again", ".done-again"], ["offer text", ".done-offer p"], ["offer action", ".done-offer .pill, .done-offer .done-link, .done-preview", true],
					["change", ".done-change .link-button"]
				]) {
					const element = document.querySelector(selector);
					if (!element || !element.getClientRects().length) continue;
					out[name] = Math.round((box ? element.getBoundingClientRect().left : textLeft(element)) * 10) / 10;
				}
				return out;
			});
			const values = Object.values(edges);
			const ok = Math.max(...values) - Math.min(...values) <= 0.5 && (width > 860 || Math.abs(values[0] - 16) <= 0.5);
			report.checks.push({ state: state.name, width, ok, edges, offer: result.offer && result.offer.slice(0, 60), eyebrow: result.eyebrow, focused: result.focused });

			// The top block's rhythm (FIX-2 D2-1), box to box: eyebrow 12 title 16 reason 16 saving 24 pill 14
			// "Print again" 20 hairline. No two-sided hint here (it sits under Print now), and no ring on the title
			// after its script focus.
			const rhythm = await page.evaluate(() => {
				const box = selector => { const node = document.querySelector(selector); return node && node.getClientRects().length ? node.getBoundingClientRect() : null; };
				const chain = [".done-eyebrow", ".done-title", ".done-reason", ".done-saving", ".done-back", ".done-again"].map(box).filter(Boolean);
				const gaps = chain.slice(1).map((next, i) => Math.round((next.top - chain[i].bottom) * 10) / 10);
				const offer = box(".done-offer"), change = box(".done-change"), again = box(".done-again");
				const hairline = offer || change;
				const title = document.querySelector(".done-title");
				return {
					gaps, names: [".done-eyebrow", ".done-title", ".done-reason", ".done-saving", ".done-back", ".done-again"].filter(box),
					hairline: Math.round((hairline.top - again.bottom) * 10) / 10,
					afterOffer: offer ? Math.round((change.top - offer.bottom) * 10) / 10 : null,
					hint: !!document.querySelector(".done-hint") || /Two-sided/.test(document.querySelector(".done").textContent),
					ring: document.activeElement == title ? getComputedStyle(title).outlineStyle : "not focused"
				};
			});
			const want = { ".done-title": 12, ".done-reason": 16, ".done-saving": 16, ".done-back": 24, ".done-again": 14 };
			// A missing reason or saving line leaves the next one at its own gap from the line above.
			const wantGaps = rhythm.names.slice(1).map(name => want[name]);
			report.checks.push({
				state: `${state.name} rhythm`, width, rhythm: { gaps: rhythm.gaps, hairline: rhythm.hairline, afterOffer: rhythm.afterOffer, ring: rhythm.ring },
				ok: rhythm.gaps.every((gap, i) => Math.abs(gap - wantGaps[i]) <= 0.5) && Math.abs(rhythm.hairline - 20) <= 0.5
					&& (rhythm.afterOffer == null || Math.abs(rhythm.afterOffer - 20) <= 0.5) && !rhythm.hint && rhythm.ring == "none"
			});

			// The tick hangs in the gutter: on screen, and clear of the text edge. Page 1 shows at 52 x 74 in the
			// narrow sheet when a thumb is passed, never in the wide panel, and is absent when thumb is null.
			const marks = await page.evaluate(() => {
				const tick = document.querySelector(".done-tick").getBoundingClientRect();
				const thumb = document.querySelector(".done-thumb");
				const box = thumb?.getBoundingClientRect();
				const title = document.querySelector(".done-title").getBoundingClientRect();
				return {
					tick: [Math.round(tick.left * 10) / 10, Math.round(tick.right * 10) / 10],
					thumb: !thumb ? "none" : box.width ? [Math.round(box.width), Math.round(box.height)] : "hidden",
					// Beside the title, and above the full-width reason (or saving line, or pill) below it.
					thumbClear: !box?.width || box.left >= title.right && box.bottom <= document.querySelector(".done-fact > :nth-child(3), .done-back").getBoundingClientRect().top
				};
			});
			const wantThumb = state.thumb == "none" ? "none" : width > 860 ? "hidden" : [52, 74];
			report.checks.push({
				state: `${state.name} tick + thumb`, width, marks,
				ok: marks.tick[0] >= 0 && marks.tick[1] <= values[0] && JSON.stringify(marks.thumb) == JSON.stringify(wantThumb) && marks.thumbClear
			});
		}

		// The receipt sheet, opened from the 5-article state, and the copy toast.
		await page.evaluate(async () => {
			const { offers, done } = window.SB;
			window.current?.close();
			await chrome.storage.local.clear();
			await chrome.storage.session.clear();
			let time = new Date(2026, 9, 1, 9).getTime();
			offers.clock.now = () => time;
			for (let i = 0; i < 5; i++) {
				time += 864e5;
				await offers.recordPrint({ url: `https://example.com/story/${i}`, design: "broadsheet", pages: 5, screens: 14, words: 2100, photos: 4 });
			}
			await chrome.storage.local.set({ reviewAsk: { at: 1 } });
			for (const node of document.querySelectorAll(".panel-body > :not(.done)")) node.hidden = true;
			window.current = done.showDone(document.querySelector(".panel-body .done"), { kind: "print", design: { id: "broadsheet", name: "Broadsheet" }, pages: 5, reason: "4 photos and 2,100 words fit two newspaper pages.", screens: 14, account: { state: "guest" },
				onChange: () => { for (const node of document.querySelectorAll(".panel-body > :not(.done)")) node.hidden = false; } });
		});
		await page.click(".done-offer .pill");
		await page.waitForSelector("dialog.receipt-sheet[open] img");
		await page.waitForTimeout(200);
		await page.screenshot({ path: join(OUT, `12-receipt-sheet-${width}.png`) });
		report.files.push(`12-receipt-sheet-${width}.png`);
		await page.click("dialog.receipt-sheet .pill-ink");
		const toast = await (await page.waitForSelector(".sb-toast")).textContent();
		await page.screenshot({ path: join(OUT, `13-toast-${width}.png`) });
		report.files.push(`13-toast-${width}.png`);
		report.checks.push({ state: "13-toast", width, ok: toast == "Picture copied", toast });
		await page.keyboard.press("Escape");
		const sheetGone = await page.waitForSelector("dialog.receipt-sheet", { state: "detached", timeout: 2000 }).then(() => true, () => false);
		report.checks.push({ state: "escape closes the sheet", width, ok: sheetGone, probe: sheetGone ? undefined : await page.evaluate(() => ({ open: document.querySelector("dialog.receipt-sheet")?.open, active: document.activeElement?.outerHTML.slice(0, 80) })) });
		await page.keyboard.press("Escape");
		report.checks.push({ state: "escape = change something", width, ok: await page.evaluate(() => document.querySelector(".panel-body .done").hidden && !document.querySelector(".panel-body .sec").hidden) });

		// Settings "Your prints": 28 articles over several months.
		await page.evaluate(async () => {
			const { offers, done } = window.SB;
			await chrome.storage.local.clear();
			let time = new Date(2026, 3, 2, 9).getTime();
			offers.clock.now = () => time;
			for (let i = 0; i < 27; i++) {
				time += 6.5 * 864e5;
				await offers.recordPrint({ url: `https://example.com/story/${i}`, design: "classic", pages: 4, screens: 11, words: 1800, photos: 2 });
			}
			// One short article this month: "4 minutes of reading", not 0.
			time = new Date(2026, 9, 6, 9).getTime();
			await offers.recordPrint({ url: "https://example.com/short", design: "classic", pages: 1, screens: 3, words: 900, photos: 0 });
			offers.clock.now = () => new Date(2026, 9, 8, 12).getTime();
			for (const node of document.querySelectorAll(".panel-body > *")) node.hidden = true;
			const holder = document.createElement("section");
			holder.className = "sec harness-prints";
			// Settings under 860 px puts a 16 px gutter on every section (options.css); the panel gives 24 px above.
			if (innerWidth <= 860) holder.style.paddingInline = "16px";
			holder.innerHTML = `<div class="sec-h"><h2>Your prints</h2></div>`;
			const body = document.createElement("div");
			holder.append(body);
			document.querySelector(".panel-body").append(holder);
			await done.renderYourPrints(body);
		});
		// Under 860 px .panel is display: contents (no box), so shoot the section itself.
		await page.locator(width > 860 ? ".panel" : ".harness-prints").screenshot({ path: join(OUT, `14-your-prints-${width}.png`) });
		report.files.push(`14-your-prints-${width}.png`);
		const prints = await page.evaluate(() => {
			const textLeft = node => { const range = document.createRange(); range.selectNodeContents(node.firstChild); return range.getClientRects()[0].left; };
			const marks = [...document.querySelectorAll(".ladder .done-tick, .ladder-dot")].map(mark => mark.getBoundingClientRect());
			return {
				edges: {
					heading: document.querySelector(".harness-prints h2").getBoundingClientRect().left,
					card: document.querySelector(".yp-card").getBoundingClientRect().left,
					rung: textLeft(document.querySelector(".ladder-name"))
				},
				marks: [Math.round(Math.min(...marks.map(box => box.left)) * 10) / 10, Math.round(Math.max(...marks.map(box => box.right)) * 10) / 10],
				reading: [...document.querySelectorAll(".yp-numbers")].map(list => list.children[2]?.textContent || "").join(" / ")
			};
		});
		// The ladder marks hang in the gutter, on screen; month and year both show minutes or hours of reading.
		report.checks.push({ state: "14-your-prints", width, edges: prints.edges, marks: prints.marks, reading: prints.reading,
			ok: new Set(Object.values(prints.edges)).size == 1 && prints.marks[0] >= 0 && prints.marks[1] <= prints.edges.rung && /^4 minutes of reading \/ [\d.]+ hours of reading$/.test(prints.reading) });

		// The cards themselves, full size.
		if (width == 1280) {
			const pngs = await page.evaluate(async () => {
				const { receipt } = window.SB;
				const asData = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.readAsDataURL(blob); });
				const out = {};
				out["receipt-broadsheet-5"] = await asData(await receipt.drawReceipt({ screens: 14, pages: 5, design: { id: "broadsheet", name: "Broadsheet" }, photos: 4, words: 2100 }));
				out["receipt-book-1"] = await asData(await receipt.drawReceipt({ screens: 4, pages: 1, design: { id: "book", name: "Book" }, words: 900 }));
				out["receipt-classic-23"] = await asData(await receipt.drawReceipt({ screens: 63, pages: 23, design: { id: "classic", name: "Classic" }, photos: 12, words: 11400 }));
				out["receipt-boxes"] = await asData(await receipt.drawReceipt({ screens: 9, pages: 2, design: { id: "magazine", name: "Magazine" }, photos: 1, words: 1300, boxes: [
					[{ kind: "title", x: 0, y: 0, w: .9, h: .07 }, { kind: "photo", x: 0, y: .12, w: 1, h: .35 }, { kind: "text", x: 0, y: .52, w: .47, h: .48 }, { kind: "text", x: .53, y: .52, w: .47, h: .48 }],
					[{ kind: "text", x: 0, y: 0, w: .47, h: .6 }, { kind: "text", x: .53, y: 0, w: .47, h: 1 }]] }));
				out["year-2026"] = await asData(await receipt.drawYearCard({ articles: 48, pages: 212, minutes: 438, label: "2026 on paper" }));
				const blob = await receipt.drawReceipt({ screens: 14, pages: 5, design: "broadsheet" });
				out.check = { type: blob.type, size: blob.size, bitmap: await createImageBitmap(blob).then(image => [image.width, image.height]) };
				return out;
			});
			report.receiptBlob = pngs.check;
			delete pngs.check;
			for (const [name, data] of Object.entries(pngs)) {
				writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
				report.files.push(`${name}.png`);
			}
		}
		// "Didn't print? Print again" calls onPrintAgain and blocks every offer for this session.
		// Last on this page: the block also lives in the page's module, so nothing after it could get an offer.
		const again = await page.evaluate(async () => {
			const { offers, done } = window.SB;
			window.current?.close();
			await chrome.storage.local.clear();
			await chrome.storage.session.clear();
			let time = new Date(2026, 9, 1, 9).getTime();
			offers.clock.now = () => time;
			for (let i = 0; i < 2; i++) await offers.recordPrint({ url: `https://example.com/story/${i}`, pages: 5, screens: 14 });
			await chrome.storage.local.set({ reviewAsk: { at: 1 } });   // two articles in a day would bring the review
			const log = [];
			window.current = done.showDone(document.querySelector(".panel-body .done"), { kind: "print", design: { id: "broadsheet", name: "Broadsheet" }, pages: 5, account: { state: "guest" }, onPrintAgain: () => log.push("again") });
			await new Promise(resolve => setTimeout(resolve, 200));
			const before = document.querySelector(".done-offer").hidden;
			document.querySelector(".done-again").click();
			await new Promise(resolve => setTimeout(resolve, 100));
			await offers.recordPrint({ url: "https://example.com/story/9", pages: 5, screens: 14 });
			return { log, before, offer: await offers.nextOffer({ account: { state: "guest" }, lockedClicked: true }) };
		});
		report.checks.push({ state: "print again blocks offers", width, ok: again.before && again.log.join() == "again" && again.offer == null });

		report.checks.push({ state: "page errors", width, ok: errors.length == 0, errors });
		await context.close();
	}
} finally {
	await browser.close();
	server.close();
}
writeFileSync(join(OUT, "measures.json"), JSON.stringify(report, null, 2));
const failed = report.checks.filter(check => check.ok === false);
for (const check of report.checks) console.log(`${check.ok === false ? "FAIL" : "ok  "} ${check.state} @${check.width}${check.edges ? " " + JSON.stringify(check.edges) : ""}${check.eyebrow ? " · " + check.eyebrow : ""}${check.offer ? " · offer: " + check.offer : ""}${check.toast ? " · " + check.toast : ""}${check.marks ? " " + JSON.stringify(check.marks) : ""}${check.reading ? " · " + check.reading : ""}${check.rhythm ? " " + JSON.stringify(check.rhythm) : ""}${check.errors?.length ? " " + check.errors.join("; ") : ""}`);
console.log(`receipt blob: ${JSON.stringify(report.receiptBlob)}`);
console.log(`${report.files.length} files in ${OUT}; ${failed.length} failed checks`);
process.exit(failed.length ? 1 : 0);

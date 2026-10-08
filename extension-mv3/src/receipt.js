// The before-and-after receipt (SPEC B4) and the yearly card (C7): 1080 x 1080 PNGs drawn on a canvas on this
// computer. Nothing is uploaded. The card carries shapes and numbers only: no article text, title, photo, site
// or URL, so it is safe to post and says nothing about what the person reads.
import { readingTime } from "./offers.js";

const SIZE = 1080;
const MARGIN = 72;

// Colours come from the brand tokens in ui.css; the fallbacks are the same values for pages without ui.css.
const FALLBACK = { "--bg": "#f7f5ef", "--desk": "#efece3", "--surface": "#ffffff", "--paper": "#fffdf8", "--ink": "#161a18", "--muted": "#6a706c", "--line": "#dedad0", "--signal": "#4b9b6f", "--mark": "#b8f0dc" };
function tokens() {
	const style = globalThis.getComputedStyle?.(document.documentElement);
	return Object.fromEntries(Object.entries(FALLBACK).map(([name, value]) => [name, style?.getPropertyValue(name).trim() || value]));
}

const SERIF = '"Source Serif 4", Georgia, serif';
const SANS = '"Work Sans", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

// Designs set in several columns, for the generic page silhouettes when the engine gives no boxes.
const COLUMNS = { broadsheet: 3, ecoprint: 3, classic: 2, magazine: 2, riso: 2, cover: 2, swiss: 2 };

const plural = (n, word) => `${n.toLocaleString("en")} ${word}${n == 1 ? "" : "s"}`;

async function fontsReady() {
	if (!globalThis.document?.fonts) return;
	await Promise.all([`400 96px ${SERIF}`, `400 28px ${MONO}`, `500 26px ${SANS}`].map(font => document.fonts.load(font).catch(() => {})));
}

// The Pile S mark from icons/mark.svg; if it cannot load, the same five bars are drawn from its geometry.
const MARK_BARS = [[8, 0, 24, 4, "ink"], [0, 6, 14, 4, "ink"], [0, 12, 32, 6, "signal"], [18, 20, 14, 4, "ink"], [0, 26, 24, 6, "ink"]];
function loadMark() {
	return new Promise(resolve => {
		const image = new Image();
		const timer = setTimeout(() => resolve(null), 1500);
		image.onload = () => { clearTimeout(timer); resolve(image); };
		image.onerror = () => { clearTimeout(timer); resolve(null); };
		image.src = new URL("icons/mark.svg", location.href).href;
	});
}

function make(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

// A token colour at some opacity, for the grey silhouettes (canvas colours stay plain rgba).
function fade(hex, alpha) {
	const value = parseInt(hex.replace("#", "").replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3"), 16);
	return `rgba(${value >> 16 & 255}, ${value >> 8 & 255}, ${value & 255}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

function newCard() {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = SIZE;
	const ctx = canvas.getContext("2d");
	const t = tokens();
	ctx.fillStyle = t["--bg"];
	ctx.fillRect(0, 0, SIZE, SIZE);
	return { canvas, ctx, t };
}

function eyebrow(ctx, t, text) {
	ctx.font = `400 28px ${MONO}`;
	ctx.letterSpacing = "1.7px";
	ctx.fillStyle = t["--muted"];
	ctx.textBaseline = "alphabetic";
	ctx.fillText(text.toUpperCase(), MARGIN, MARGIN + 24);
	ctx.letterSpacing = "0px";
}

async function footer(ctx, t) {
	const mark = await loadMark();
	const y = SIZE - MARGIN - 40;
	if (mark) {
		ctx.drawImage(mark, MARGIN, y, 40, 40);
	} else {
		for (const [x, top, w, h, colour] of MARK_BARS) {
			ctx.fillStyle = colour == "signal" ? t["--signal"] : t["--ink"];
			roundRect(ctx, MARGIN + x * 1.25, y + top * 1.25, w * 1.25, h * 1.25, 2);
			ctx.fill();
		}
	}
	ctx.font = `500 26px ${SANS}`;
	ctx.fillStyle = t["--ink"];
	ctx.textBaseline = "middle";
	ctx.fillText("printed with myscreenbreak.com", MARGIN + 56, y + 21);
	ctx.textBaseline = "alphabetic";
}

// A run of text in parts; the part flagged `mark` sits on the highlighter. Shrinks to fit the width.
function markedLine(ctx, t, parts, { font, size, min, y, width }) {
	let px = size;
	const measure = () => {
		ctx.font = font(px);
		return parts.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
	};
	while (px > min && measure() > width) px -= 2;
	let x = MARGIN;
	for (const part of parts) {
		const w = ctx.measureText(part.text).width;
		if (part.mark) {
			ctx.fillStyle = t["--mark"];
			roundRect(ctx, x - px * .1, y - px * .74, w + px * .2, px * .94, 4);
			ctx.fill();
		}
		ctx.fillStyle = t["--ink"];
		ctx.fillText(part.text, x, y);
		x += w;
	}
}

// Left: the web page as a long grey strip, one dotted break per screen of scrolling.
function webSilhouette(ctx, t, { x, y, w, h, screens }) {
	ctx.save();
	ctx.fillStyle = t["--surface"];
	ctx.strokeStyle = t["--line"];
	ctx.lineWidth = 2;
	roundRect(ctx, x, y, w, h, 6);
	ctx.fill();
	ctx.stroke();
	ctx.clip();
	const screen = h / screens;
	const dense = screen < 16;
	// The page's furniture repeats per screen; on a very long page it repeats in blocks a screen would hold
	// at a readable size, and the breaks below still count every screen.
	const unit = dense ? 48 : screen;
	const blocks = Math.ceil(h / unit);
	const grey = percent => fade(t["--muted"], percent / 100);
	const nav = Math.min(26, unit * .3);
	// Nav bar across the top.
	ctx.fillStyle = grey(45);
	ctx.fillRect(x, y, w, nav);
	// Per block: lines of text, a side ad (hatched) on every other block.
	for (let i = 0; i < blocks; i++) {
		const top = y + i * unit + (i == 0 ? nav : 0);
		const bottom = y + (i + 1) * unit;
		const ad = i % 2 == 0 && unit > 30;
		const textWidth = ad ? w * .58 : w - 32;
		ctx.fillStyle = grey(28);
		for (let line = top + 12; line < bottom - 8; line += Math.max(5, Math.min(11, unit / 6))) {
			ctx.fillRect(x + 16, line, textWidth - (line % 3 == 0 ? 20 : 0), Math.max(1.5, Math.min(4, unit / 30)));
		}
		if (ad) {
			const adX = x + w * .58 + 30, adY = top + 10, adW = w - (w * .58 + 30) - 14, adH = Math.min(unit * .6, 120);
			ctx.save();
			ctx.strokeStyle = grey(40);
			ctx.lineWidth = 1.5;
			ctx.strokeRect(adX, adY, adW, adH);
			ctx.beginPath();
			ctx.rect(adX, adY, adW, adH);
			ctx.clip();
			ctx.beginPath();
			for (let d = -adH; d < adW; d += 9) {
				ctx.moveTo(adX + d, adY + adH);
				ctx.lineTo(adX + d + adH, adY);
			}
			ctx.stroke();
			ctx.restore();
		}
	}
	// The cookie bar over the foot of the first screen.
	ctx.fillStyle = grey(60);
	const cookie = Math.max(8, Math.min(30, unit * .3));
	roundRect(ctx, x + 10, y + Math.max(unit - cookie - 4, nav + 2), w - 20, cookie, 4);
	ctx.fill();
	// A dotted break at each screen height. On a very long page full-width lines would hide the page, so the
	// breaks become ruler ticks on both edges (still one per screen).
	ctx.strokeStyle = grey(70);
	ctx.lineWidth = 2;
	ctx.setLineDash(dense ? [] : [4, 5]);
	for (let i = 1; i < screens; i++) {
		ctx.beginPath();
		if (dense) {
			ctx.moveTo(x, y + i * screen);
			ctx.lineTo(x + 12, y + i * screen);
			ctx.moveTo(x + w - 12, y + i * screen);
			ctx.lineTo(x + w, y + i * screen);
		} else {
			ctx.moveTo(x, y + i * screen);
			ctx.lineTo(x + w, y + i * screen);
		}
		ctx.stroke();
	}
	ctx.restore();
}

// One small sheet with its layout as silhouettes: the title as an ink bar, photos as solid blocks, text as lines.
function sheet(ctx, t, { x, y, w, h, boxes, index, columns }) {
	ctx.save();
	ctx.shadowColor = "rgba(22, 26, 24, .14)";
	ctx.shadowBlur = Math.max(4, w * .08);
	ctx.shadowOffsetY = Math.max(1, w * .02);
	ctx.fillStyle = t["--paper"];
	roundRect(ctx, x, y, w, h, 2);
	ctx.fill();
	ctx.restore();
	const pad = w * .1;
	const inner = { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2 };
	const list = boxes?.length ? boxes : genericBoxes(index, columns);
	const lineGap = Math.max(2.5, h / 42);
	for (const box of list) {
		const bx = inner.x + box.x * inner.w, by = inner.y + box.y * inner.h, bw = box.w * inner.w, bh = box.h * inner.h;
		if (box.kind == "title") {
			ctx.fillStyle = t["--ink"];
			ctx.fillRect(bx, by, bw, Math.max(2, bh));
		} else if (box.kind == "photo") {
			ctx.fillStyle = t["--line"];
			ctx.fillRect(bx, by, bw, bh);
		} else {
			ctx.fillStyle = fade(t["--muted"], .55);
			for (let line = by; line < by + bh - 1; line += lineGap) ctx.fillRect(bx, line, bw, Math.max(1, lineGap * .38));
		}
	}
}

function genericBoxes(index, columns) {
	const boxes = [];
	let top = 0;
	if (index == 0) {
		boxes.push({ kind: "title", x: 0, y: 0, w: .8, h: .05 }, { kind: "title", x: 0, y: .07, w: .5, h: .05 });
		boxes.push({ kind: "photo", x: 0, y: .17, w: 1, h: .28 });
		top = .5;
	} else if (index % 3 == 2) {
		boxes.push({ kind: "photo", x: 0, y: 0, w: columns > 1 ? (2 / columns) - .03 : 1, h: .24 });
		top = .28;
	}
	const gap = .05, width = (1 - gap * (columns - 1)) / columns;
	for (let c = 0; c < columns; c++) boxes.push({ kind: "text", x: c * (width + gap), y: top, w: width, h: 1 - top });
	return boxes;
}

// Fit n sheets (A4 portrait) into a w x h area as large as they can be.
function sheetGrid(n, w, h) {
	let best = null;
	for (let cols = 1; cols <= n; cols++) {
		const rows = Math.ceil(n / cols);
		const gap = Math.max(6, Math.min(18, 120 / cols));
		const sheetW = Math.min((w - gap * (cols - 1)) / cols, ((h - gap * (rows - 1)) / rows) / 1.414);
		if (!best || sheetW > best.sheetW) best = { cols, rows, gap, sheetW, sheetH: sheetW * 1.414 };
	}
	return best;
}

function toBlob(canvas) {
	return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The picture could not be made.")), "image/png"));
}

export function receiptText({ screens, pages }) {
	return `${screens} screens of scrolling became ${plural(pages, "page")}. myscreenbreak.com`;
}

// design: { id, name } or an id; boxes: per-page arrays of { x, y, w, h, kind } in 0-1 units of the page.
export async function drawReceipt({ screens, pages, design, photos, words, boxes } = {}) {
	await fontsReady();
	const { canvas, ctx, t } = newCard();
	const id = design?.id || design || "";
	const name = design?.name || id;
	eyebrow(ctx, t, "This page, on paper");

	const top = 150, height = 540;
	webSilhouette(ctx, t, { x: MARGIN, y: top, w: 300, h: height, screens: Math.max(1, screens || 1) });
	// The arrow between before and after.
	ctx.strokeStyle = t["--muted"];
	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(MARGIN + 330, top + height / 2);
	ctx.lineTo(MARGIN + 380, top + height / 2);
	ctx.moveTo(MARGIN + 366, top + height / 2 - 12);
	ctx.lineTo(MARGIN + 380, top + height / 2);
	ctx.lineTo(MARGIN + 366, top + height / 2 + 12);
	ctx.stroke();

	const area = { x: MARGIN + 412, y: top, w: SIZE - MARGIN - (MARGIN + 412), h: height };
	const count = Math.max(1, pages || 1);
	const grid = sheetGrid(count, area.w, area.h);
	const usedH = grid.rows * grid.sheetH + (grid.rows - 1) * grid.gap;
	for (let i = 0; i < count; i++) {
		const col = i % grid.cols, row = Math.floor(i / grid.cols);
		sheet(ctx, t, {
			x: area.x + col * (grid.sheetW + grid.gap),
			y: area.y + (area.h - usedH) / 2 + row * (grid.sheetH + grid.gap),
			w: grid.sheetW, h: grid.sheetH, index: i, boxes: boxes?.[i], columns: COLUMNS[id] || 1
		});
	}

	ctx.textBaseline = "alphabetic";
	markedLine(ctx, t, [{ text: `${screens} screens became ` }, { text: String(pages), mark: true }, { text: ` page${pages == 1 ? "" : "s"}` }],
		{ font: px => `400 ${px}px ${SERIF}`, size: 96, min: 56, y: 826, width: SIZE - MARGIN * 2 });

	const facts = [name, photos ? plural(photos, "photo") : null, words ? plural(words, "word") : null].filter(Boolean).join(" · ");
	ctx.font = `400 24px ${MONO}`;
	ctx.letterSpacing = "1.4px";
	ctx.fillStyle = t["--muted"];
	ctx.fillText(facts.toUpperCase(), MARGIN, 884);
	ctx.letterSpacing = "0px";

	await footer(ctx, t);
	return toBlob(canvas);
}

// The year (or month) on paper: three numbers, the same footer. label is the eyebrow, e.g. "2026 on paper".
// minutes: whole minutes of reading (periodStats); the reading row is left out at 0.
export async function drawYearCard({ articles = 0, pages = 0, minutes = 0, label = `${new Date().getFullYear()} on paper` } = {}) {
	await fontsReady();
	const { canvas, ctx, t } = newCard();
	eyebrow(ctx, t, label);
	const reading = readingTime(minutes);
	const rows = [[articles.toLocaleString("en"), `article${articles == 1 ? "" : "s"}`, true], reading, [pages.toLocaleString("en"), `page${pages == 1 ? "" : "s"}`]].filter(Boolean);
	let y = 380;
	for (const [number, word, mark] of rows) {
		ctx.font = `400 150px ${SERIF}`;
		const w = ctx.measureText(number).width;
		if (mark) {
			ctx.fillStyle = t["--mark"];
			roundRect(ctx, MARGIN - 12, y - 112, w + 24, 136, 6);
			ctx.fill();
		}
		ctx.fillStyle = t["--ink"];
		ctx.fillText(number, MARGIN, y);
		ctx.font = `400 40px ${SANS}`;
		ctx.fillStyle = t["--ink"];
		ctx.fillText(word, MARGIN + w + 28, y);
		y += 215;
	}
	await footer(ctx, t);
	return toBlob(canvas);
}

// A short toast. Inside an open dialog it must live in the dialog (the top layer covers the page).
export function showToast(text, host = document.querySelector("dialog[open]") || document.body) {
	host.querySelector(":scope > .sb-toast")?.remove();
	const toast = document.createElement("div");
	toast.className = "sb-toast";
	toast.setAttribute("role", "status");
	toast.textContent = text;
	host.append(toast);
	setTimeout(() => toast.remove(), 2600);
	return toast;
}

// The share sheet: the picture, Copy picture, Save picture and (when the system can share files) Share…
export function openReceiptSheet({ blob, text, heading = "Before and after", alt = "", filename = "screenbreak-receipt.png" }) {
	const opener = document.activeElement;
	const url = URL.createObjectURL(blob);
	const file = new File([blob], filename, { type: "image/png" });
	const dialog = make("dialog", { className: "receipt-sheet" });
	dialog.setAttribute("aria-labelledby", "receipt-heading");
	const close = make("button", { type: "button", className: "receipt-close", textContent: "×" });
	close.setAttribute("aria-label", "Close");
	close.addEventListener("click", () => dialog.close());

	const copy = make("button", { type: "button", className: "pill pill-ink", textContent: "Copy picture" });
	copy.addEventListener("click", async () => {
		try {
			await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
			showToast("Picture copied", dialog);
		} catch {
			showToast("The picture could not be copied. Use Save picture.", dialog);
		}
	});
	const save = make("a", { className: "pill pill-secondary", href: url, download: filename, textContent: "Save picture" });
	save.addEventListener("click", () => setTimeout(() => showToast("Picture saved", dialog), 300));
	const actions = make("div", { className: "receipt-actions" }, copy, save);
	if (navigator.canShare?.({ files: [file] })) {
		const share = make("button", { type: "button", className: "pill pill-secondary", textContent: "Share…" });
		share.addEventListener("click", () => navigator.share({ files: [file], text }).catch(() => {}));
		actions.append(share);
	}
	dialog.append(
		make("div", { className: "receipt-head" }, make("h2", { id: "receipt-heading", textContent: heading }), close),
		make("img", { className: "receipt-image", src: url, alt: alt || text, width: 1080, height: 1080 }),
		actions);
	dialog.addEventListener("close", () => {
		dialog.remove();
		URL.revokeObjectURL(url);
		if (opener?.isConnected) opener.focus();
	});
	document.body.append(dialog);
	dialog.showModal();
	copy.focus();
	return dialog;
}

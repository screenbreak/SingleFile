// The print engine, running in the extension: turns an extracted article into the same A4 pages the
// Screenbreak print lab makes. Ported from screenbreak/webapp printlab/layout.js (branch
// claude/project-thread-2c6roz, 6346675): the article clean-up, the design picker, image placement,
// sidenotes, pull quotes and the halftone screen are the lab's code; Node and file handling are replaced by
// browser calls. The pages themselves are built by printlab's paginate.js, unchanged, in sheet.html.
//
// This runs in the extension until rendering moves to the Screenbreak server (Yorgos, 2026-10-07); the
// print page only calls prepare() and compose(), so that move doesn't change it.
import QRCode from "qrcode";
import { recommend } from "./recommend.js";
import { FONTS } from "./fonts.js";
import { cleanURL } from "./print-url.js";

const PAGE = { w: 210, h: 297, side: 15 };
const MEASURE = PAGE.w - 2 * PAGE.side;              // 180mm
const GAP = 7, COL = (MEASURE - GAP) / 2;            // 86.5mm
const GEOMETRY = { news: COL, data: COL, interview: COL, recipe: COL, photo: COL, essay: 120, tutorial: 150, thread: 120 };
export const STYLES = {
	classic:    { cols: 2, gap: 7 },
	house:      { cols: 2, gap: 4.2 },
	broadsheet: { cols: 3, gap: 5 },
	magazine:   { cols: 2, gap: 8 },
	book:       { cols: 1, width: 118 },
	modern:     { cols: 2, gap: 6 },
	large:      { cols: 1, width: 150 },
	cover:      { cols: 2, gap: 7, cover: true },
	notes:      { cols: 1, width: 116, sidenotes: true },
	swiss:      { cols: 1, width: 134 },
	riso:       { cols: 2, gap: 6, halftone: "#1d4ed8" },
	gallery:    { cols: 1, width: 132 },
	conversation: { cols: 1, width: 140 },
	quiet:      { cols: 2, gap: 12 },
	loud:       { cols: 2, gap: 7 },
	bulletin:   { cols: 3, gap: 5 },
	ecoprint:   { cols: 3, gap: 4, halftone: "#4b4b4b" },
	dossier:    { cols: 1, width: 140 }
};
const colWidth = s => s.cols === 1 ? s.width : (MEASURE - s.gap * (s.cols - 1)) / s.cols;
// Paper sizes. The text measure stays 180mm; Letter is shorter and a little wider, so its side margins grow.
export const PAPERS = {
	A4: { label: "A4", width: 210, height: 297, contentHeight: 262 },
	Letter: { label: "US Letter", width: 215.9, height: 279.4, contentHeight: 244 }
};
const CSS_FILES = ["magazine.css", "types.css", "styles.css", "concepts.css", "styles-more.css"];
// Reference lists at least this long count as "long" for the reader's references setting.
const LONG_REFERENCES = 15;
const IMAGE_TIMEOUT = 8000;
const MIN_PICTURE = 48;

const PX_MM = 25.4 / 96;
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const decode = s => String(s || "").replace(/&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (m, e) => ({ nbsp: "\u00a0", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" }[e.toLowerCase()] ??
	String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))));

function classify(f) {
	const why = [];
	const pick = (t, reason) => { why.push(reason); return { type: t, why: why.join("; ") }; };
	if (f.thread) return pick("thread", "a discussion page: the thread is the article");
	if (f.recipeSchema || (f.ingredients && f.listItems >= 5)) return pick("recipe", f.recipeSchema ? "Recipe schema" : "ingredients heading + lists");
	if (f.qaParas >= 4 && f.qaParas / Math.max(1, f.paras) > 0.12) return pick("interview", `${f.qaParas} question/answer paragraphs`);
	if (f.codeBlocks >= 2) return pick("tutorial", `${f.codeBlocks} code blocks`);
	if (f.charts >= 2 && f.charts * 700 >= f.words) return pick("data", `${f.charts} charts for ${f.words} words`);
	if (f.photos >= 5 && f.words / f.photos < 220) return pick("photo", `${f.photos} photos, ${Math.round(f.words / f.photos)} words per photo`);
	if (f.words >= 2500 && f.photos + f.charts + f.graphics <= 4) return pick("essay", `${f.words} words, few images`);
	return pick("news", "default");
}

// Pictures

function withTimeout(promise, ms) {
	return Promise.race([promise, new Promise((resolve, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// The extension may fetch any page's images (host permissions), so pictures can be drawn on a canvas for the
// checks below and for the halftone screen. A blob URL also keeps the image when the page goes away.
async function loadPicture(v) {
	try {
		const response = await withTimeout(fetch(v.src, { credentials: "omit" }), IMAGE_TIMEOUT);
		if (!response.ok) throw new Error(response.status);
		const blob = await response.blob();
		if (!/^image\//.test(blob.type) && !/^data:image/.test(v.src)) throw new Error("not an image");
		v.asset = URL.createObjectURL(blob);
		const image = new Image();
		image.src = v.asset;
		await withTimeout(image.decode(), IMAGE_TIMEOUT);
		v.px = { w: image.naturalWidth, h: image.naturalHeight };
		Object.assign(v, inspect(image, v.strategy === "original_file"));
	} catch (error) {
		// Unreadable here (a blocked host, a broken file): print the page's own URL and let Chrome try.
		v.asset = v.src;
		v.px = v.px || v.attr || null;
	}
}

// Photo or drawing, blank or not, and the focal point for crops (printlab inspectImages, without trimming).
function inspect(image, isFile) {
	const scale = Math.min(1, 400 / image.naturalWidth);
	const W = Math.max(1, Math.round(image.naturalWidth * scale)), H = Math.max(1, Math.round(image.naturalHeight * scale));
	const c = document.createElement("canvas"); c.width = W; c.height = H;
	const x = c.getContext("2d", { willReadFrequently: true });
	x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(image, 0, 0, W, H);
	const d = x.getImageData(0, 0, W, H).data;
	let sum = 0, sum2 = 0, n = 0, white = 0; const tones = new Set();
	for (let y = 0; y < H; y += 2) for (let i = 0; i < W; i += 2) { const p = (y * W + i) * 4, l = (d[p] + d[p + 1] + d[p + 2]) / 3;
		sum += l; sum2 += l * l; n++; if (d[p] > 238 && d[p + 1] > 238 && d[p + 2] > 238) white++; tones.add((d[p] >> 4) << 8 | (d[p + 1] >> 4) << 4 | d[p + 2] >> 4); }
	const sd = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)), out = { blank: sd < 4, photoLike: white / n < 0.3 && tones.size > 180 };
	{ const G = 24, cw = W / G, ch = H / G, e = new Float32Array(G * G), lum = q => d[q] * .299 + d[q + 1] * .587 + d[q + 2] * .114;
		const step = 2;
		for (let y = step; y < H - step; y += step) for (let i = step; i < W - step; i += step) { const q = (y * W + i) * 4;
			const g = Math.abs(lum(q) - lum(q + 4 * step)) + Math.abs(lum(q) - lum(q + 4 * W * step)), r = d[q], gg = d[q + 1], b = d[q + 2];
			const skin = r > 95 && gg > 40 && b > 20 && r > gg && r > b && r - gg > 15 && Math.max(r, gg, b) - Math.min(r, gg, b) > 15 ? 60 : 0;
			e[Math.min(G - 1, (y / ch) | 0) * G + Math.min(G - 1, (i / cw) | 0)] += g + skin; }
		const sorted = [...e].sort((a, b) => b - a), cut = sorted[Math.floor(G * G / 4)] || 0; let sx = 0, sy = 0, sw = 0;
		for (let k = 0; k < G * G; k++) if (e[k] >= cut && e[k] > 0) { const w = e[k]; sx += ((k % G) + .5) / G * w; sy += (((k / G) | 0) + .5) / G * w; sw += w; }
		if (sw) { const fx = sx / sw, fy = sy / sw; let vx = 0, vy = 0;
			for (let k = 0; k < G * G; k++) if (e[k] >= cut && e[k] > 0) { vx += e[k] * (((k % G) + .5) / G - fx) ** 2; vy += e[k] * ((((k / G) | 0) + .5) / G - fy) ** 2; }
			if (Math.sqrt(vx / sw) < 0.22 || Math.sqrt(vy / sw) < 0.22) out.focus = { x: Math.round(fx * 100), y: Math.round(fy * 100) }; } }
	const whiteShare = white / n;
	if (isFile) {
		out.graphic = !out.photoLike && (whiteShare >= 0.6 || whiteShare >= 0.3 && tones.size <= 120);
		out.whole = !out.photoLike && whiteShare >= 0.3 && !out.graphic;
	}
	return out;
}

// Photos as dots of one ink (printlab halftone), cached per picture, ink and width.
const halftones = new Map();
async function halftone(v, widthMm, ink, cover) {
	if (v.strategy !== "original_file" || !v.asset || !v.asset.startsWith("blob:") || v.photoLike === false || /\.(svg|gif)(\?|$)/i.test(v.src)) return v.asset;
	const key = [v.asset, Math.round(widthMm), ink, cover].join("|");
	if (!halftones.has(key)) halftones.set(key, (async () => {
		const img = new Image(); img.src = v.asset; await img.decode().catch(() => null); if (!img.naturalWidth) return v.asset;
		const W = Math.round(widthMm / 25.4 * 300), H = Math.round(img.naturalHeight * W / img.naturalWidth);
		const src = document.createElement("canvas"); src.width = W; src.height = H; const s = src.getContext("2d", { willReadFrequently: true });
		s.drawImage(img, 0, 0, W, H); const px = s.getImageData(0, 0, W, H).data;
		const hist = new Uint32Array(256); for (let k = 0; k < px.length; k += 16) hist[(0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]) | 0]++;
		const tot = hist.reduce((a, b) => a + b, 0); let acc = 0, lo = 0, hi = 255;
		for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc < tot * 0.02) lo = t; if (acc <= tot * 0.98) hi = t; }
		const mean = [...hist].reduce((a, c, t) => a + c * t, 0) / tot / 255, gamma = mean < 0.3 ? 0.75 : mean < 0.4 ? 0.88 : 1;
		if (hi - lo > 200) { lo = 0; hi = 255; }
		const level = l => Math.pow(Math.min(1, Math.max(0, (l * 255 - lo) / Math.max(1, hi - lo))), gamma);
		const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
		x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.fillStyle = ink;
		const cell = Math.max(6, Math.round(300 / 25.4 * 0.85)), ang = Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang), R = Math.hypot(W, H);
		for (let u = -R; u < R; u += cell) for (let w = -R; w < R; w += cell) {
			const X = u * ca - w * sa, Y = u * sa + w * ca; if (X < -cell || Y < -cell || X > W + cell || Y > H + cell) continue;
			const xi = Math.min(W - 1, Math.max(0, X | 0)), yi = Math.min(H - 1, Math.max(0, Y | 0)), k = (yi * W + xi) * 4;
			const lum = level((0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]) / 255);
			const dark = Math.min(1, Math.max(0, (1 - lum) * 1.25 - 0.04));
			const r = cell * Math.sqrt(cover * dark / Math.PI); if (r < 0.4) continue;
			x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill(); }
		const blob = await new Promise(resolve => c.toBlob(resolve, "image/png"));
		return blob ? URL.createObjectURL(blob) : v.asset;
	})());
	return halftones.get(key);
}

const strip = v => { const d = v.px || v.box; if (v.kind !== "img" || !d || !d.h || !v.box) return false;
	return d.w / d.h > 20 && v.box.h < 120 || d.w / d.h > 10 && v.box.h < 40; };

function place(v, G = { COL, MEASURE }) {
	const { COL: C, MEASURE: M } = G;
	const code = v.strategy === "screenshot";
	if (code) {
		const w = v.box.w * PX_MM;
		return w > C * 1.3 ? { cls: "wide graphic", w: Math.min(w, M) } : { cls: "col graphic", w: Math.min(w, C) };
	}
	const px = v.px || { w: v.box.w * 3, h: v.box.h * 3 }, aspect = px.w / px.h;
	const maxW = px.w / 200 * 25.4;
	if (v.graphic) return aspect > 1.25 && maxW >= M * 0.8 ? { cls: "wide graphic", w: Math.min(M, maxW) } : { cls: "col graphic", w: maxW >= C * 0.9 ? C : Math.max(35, maxW) };
	if (v.isHero && maxW > Math.min(C, COL)) return { cls: "hero", w: M };
	if (aspect > 1.25 && maxW >= M * 0.8) return { cls: v.whole ? "wide photo whole" : "wide photo", w: Math.min(M, 95 * aspect) };
	if (maxW >= C * 0.9) return { cls: "col photo", w: C };
	return { cls: "col photo lowres", w: Math.max(35, maxW) };
}

function figureHtml(v, asset, p, captionHtml) {
	const cap = captionHtml ? `<figcaption>${captionHtml}</figcaption>` : "";
	const fp = v.focus ? `object-position:${v.focus.x}% ${Math.max(0, v.focus.y - 6)}%;` : "";
	const style = p.cls === "hero" ? (fp ? ` style="${fp}"` : "") : ` style="width:${p.w.toFixed(1)}mm;${fp}"`;
	const dims = v.px && v.px.w ? ` width="${v.px.w}" height="${v.px.h}"` : "";
	return `<figure class="${p.cls}"><img src="${esc(asset)}"${dims}${style} alt="${esc(v.alt)}">${cap}</figure>`;
}

// Step 1: read the article once. Pictures are fetched and checked, the text is tidied, and the designs are
// ranked for it. Returns what compose() needs for any design.
export async function prepare(article) {
	const man = {
		title: decode(article.title), excerpt: decode(article.excerpt || ""), byline: decode(article.byline || ""),
		siteName: article.siteName || "", url: article.url, published: article.publishedTime, lang: article.lang || "en",
		// The address on paper and in every QR (content-print.js); url stays for footnote anchors.
		printURL: article.printURL || cleanURL(article.url) || article.url || ""
	};
	const doc = new DOMParser().parseFromString("<!doctype html><body><div id=sb-root></div></body>", "text/html");
	const root = doc.getElementById("sb-root");
	root.append(article.content.cloneNode(true));
	// The page's share image, when the article body doesn't open with it, becomes its lead picture.
	if (article.heroImage && !hasImage(root, article.heroImage)) {
		const figure = doc.createElement("figure"), img = doc.createElement("img");
		img.src = article.heroImage; figure.append(img); root.prepend(figure);
	}
	const visuals = [];
	for (const img of [...root.querySelectorAll("img")]) {
		const attr = { w: +img.getAttribute("width") || 0, h: +img.getAttribute("height") || 0 };
		const rendered = img.classList.contains("screenbreak-rendered-graphic");
		if (!rendered && attr.w && attr.w < MIN_PICTURE && attr.h && attr.h < MIN_PICTURE) continue;      // icons, avatars
		const v = { id: visuals.length, src: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "", attr: attr.w && attr.h ? attr : null,
			kind: rendered ? "chart" : "img", strategy: rendered ? "screenshot" : "original_file", box: attr.w && attr.h ? attr : { w: 600, h: 400 } };
		if (!v.src) continue;
		img.setAttribute("data-sb-vid", v.id);
		visuals.push(v);
	}
	await Promise.all(visuals.map(v => v.strategy === "original_file" ? loadPicture(v) : (v.asset = v.src)));
	for (const v of visuals) if (v.blank || (v.px && v.px.w < MIN_PICTURE && v.px.h < MIN_PICTURE)) v.broken = true;
	const byId = Object.fromEntries(visuals.map(v => [v.id, v]));
	const body = structure(root, man);
	const f = { ...body.features, photos: 0, charts: 0, graphics: 0, videos: 0, recipeSchema: false };
	// As in printlab: a graphic saved as an image file (a chart, a screenshot or a logo) is counted on its own, not as a photo or a chart.
	for (const b of body.blocks) { const v = byId[b.id]; if (!v || v.broken || strip(v)) continue;
		if (v.kind === "img" && v.graphic) f.graphics++; else if (v.kind === "img") f.photos++; else f.charts++; }
	const cls = classify(f);
	const rec = recommend(f, { man, byId, blocks: body.blocks, heroId: body.heroId, type: cls.type });
	// screens: how many screens of scrolling the page was at capture (content-print.js); null when unknown.
	const screens = Number.isInteger(article.screens) && article.screens >= 1 ? article.screens : null;
	return { man, byId, body, features: f, type: cls.type, picks: rec.picks, options: rec.options, facts: { ...rec.facts, screens } };
}

function hasImage(root, url) {
	const name = imageName(url);
	return [...root.querySelectorAll("img")].some(image => imageName(image.getAttribute("src") || "") == name);
}

function imageName(url) {
	try {
		return new URL(url).pathname.split("/").pop().replace(/[-_]?\d+x\d+(?=\.)/, "");
	} catch (error) {
		return url;
	}
}

// printlab layout.js, first page.evaluate: tidy the structure and measure the article.
function structure(root, man) {
	const document = root.ownerDocument;
	for (let i = 0; i < 4; i++) for (const d of [...root.querySelectorAll("div, section, article, main, header:not(:has(h1)), span:not([class])")])
		if (!d.closest("figure, table, pre")) d.replaceWith(...d.childNodes);
	for (const l of [...root.querySelectorAll("ul, ol")]) { if (l.closest("figure, table, pre")) continue;
		if ([...l.children].some(li => li.querySelectorAll(":scope > p, :scope > h2, :scope > h3, :scope > h4, :scope > figure").length >= 2)) {
			const frag = document.createDocumentFragment();
			for (const li of [...l.children]) { const hasBlocks = li.querySelector(":scope > p, :scope > h2, :scope > h3, :scope > figure");
				if (hasBlocks) frag.append(...li.childNodes); else { const p = document.createElement("p"); p.append(...li.childNodes); frag.append(p); } }
			l.replaceWith(frag); } }
	const norm = s => (s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
	const head = [...root.querySelectorAll("h1, h2")].slice(0, 2).find(h => { const a = norm(h.textContent), b = norm(man.title);
		return a && b && (a === b || a.includes(b.slice(0, 25)) || b.includes(a.slice(0, 25))); });
	let title = man.title; if (head) { if (head.textContent.trim().length > (title || "").length) title = head.textContent.trim(); head.remove(); }
	for (const svg of [...root.querySelectorAll("svg")]) { const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
		if (!svg.closest("figure") && (vb.length < 4 || !vb[2] || vb[2] <= 64)) svg.remove(); }
	for (const p of root.querySelectorAll("p")) if (!p.textContent.trim() && !p.querySelector("img")) p.remove();
	const blocks = [...root.querySelectorAll("img[data-sb-vid]")].map(img => {
		const fig = img.closest("figure"); const cap = fig?.querySelector("figcaption");
		const host = fig && fig.querySelectorAll("img[data-sb-vid]").length === 1 ? fig : (img.closest("p") && img.closest("p").textContent.trim() === "" ? img.closest("p") : img);
		host.setAttribute("data-host", img.dataset.sbVid);
		return { id: +img.dataset.sbVid, caption: cap ? cap.innerHTML.trim() : "" };
	});
	const BOILER = /^(cite this (work|article)|reuse this work|share this|related (articles|stories|posts)|more from|read more|sign up|newsletter|support (us|our)|about the author)\b/i;
	for (const h of [...root.querySelectorAll("h2, h3, h4")]) if (BOILER.test(h.textContent.trim())) {
		let n = h.nextElementSibling; while (n && !/^H[2-4]$/.test(n.tagName)) { const nx = n.nextElementSibling; n.remove(); n = nx; } h.remove(); }
	const JUNK = /(click|tap) .{0,40}(allow|accept|consent|opt in)|\bcookies?\b.{0,60}\b(allow|accept|consent|opt in|enable)|^\d+\s*comments?$|^follow (topics|this author|us)|^(sign up|subscribe) (for|to) (our|the)\b|^this content (isn.t|is not) available|^cite this (article|work)/i;
	for (const p of [...root.querySelectorAll("p, li, div, span, a, h2, h3, h4")]) if (p.isConnected && p.textContent.trim().length < 300 && JUNK.test(p.textContent.trim())) p.remove();
	const ex = (man.excerpt || "").replace(/\s+/g, " ").trim();
	if (ex.length > 40) for (const p of [...root.querySelectorAll("p, h2, h3")].slice(0, 6)) if (p.textContent.replace(/\s+/g, " ").trim() === ex) p.remove();
	for (const li of [...root.querySelectorAll("li")]) if (!li.textContent.trim() && !li.querySelector("img, [data-host]")) li.remove();
	for (const ul of [...root.querySelectorAll("ul, ol")]) if (!ul.textContent.trim() && !ul.querySelector("img, [data-host]")) ul.remove();
	const by = (man.byline || "").trim().toLowerCase();
	if (by) for (const ul of [...root.querySelectorAll("ul")]) if (ul.textContent.trim().toLowerCase() === by) ul.remove();
	const first = root.querySelector("[data-host], p:nth-of-type(2)");
	const paras = [...root.querySelectorAll("p")];
	const text = root.textContent || "";
	const features = {
		words: text.split(/\s+/).filter(Boolean).length, paras: paras.length,
		thread: !!root.querySelector("p.comment-meta"),
		qaParas: paras.filter(p => { const t = p.textContent.trim(), b = p.firstElementChild;
			return /^(Q|A|Q\.|A\.)\s*[:.\u2014-]/.test(t) || (b && /^(B|STRONG)$/.test(b.tagName) && t.startsWith(b.textContent.trim()) && b.textContent.trim().length < 40 && t.length > b.textContent.trim().length + 20); }).length,
		codeBlocks: [...root.querySelectorAll("pre")].filter(p => !p.querySelector("img") && p.textContent.trim().length > 20).length,
		ingredients: [...root.querySelectorAll("h2, h3, h4, p > strong, p > b")].some(h => /^\s*ingredients?\b/i.test(h.textContent)),
		listItems: root.querySelectorAll("li").length,
		footnotes: [...root.querySelectorAll("a[href*='#']")].filter(a => { const id = footnoteId(a, man.url); if (!id) return false;
			try { const t = root.querySelector("#" + CSS.escape(id)); return t && t.closest("li") && !t.closest("li").contains(a); } catch { return false; } }).length,
		sections: root.querySelectorAll("h2").length, subsections: root.querySelectorAll("h3").length,
		quotes: root.querySelectorAll("blockquote").length, tables: root.querySelectorAll("table").length };
	return { features, blocks, title, heroId: first && first.dataset.host !== undefined ? +first.dataset.host : null, html: root.innerHTML };
}

// The extension makes every link absolute (https://site/page#cite-1); a footnote link still points into the article.
function footnoteId(a, pageURL) {
	const href = a.getAttribute("href") || "";
	const hash = href.indexOf("#");
	if (hash < 0) return "";
	const base = href.slice(0, hash);
	if (base && base.split("#")[0] != (pageURL || "").split("#")[0] && !href.startsWith("#")) return "";
	try { return decodeURIComponent(href.slice(hash + 1)); } catch { return ""; }
}

let cssText;
async function engineCSS() {
	if (!cssText) cssText = Promise.all(CSS_FILES.map(file => fetch(chrome.runtime.getURL("engine/" + file)).then(r => r.text()))).then(parts => parts.join("\n"));
	return cssText;
}

function fontFaces() {
	const dir = chrome.runtime.getURL("engine/fonts/");
	return FONTS.flatMap(([fam, slug, ws, it]) => ws.flatMap(w => ["normal", ...(it ? ["italic"] : [])].map(st =>
		`@font-face{font-family:"${fam}";font-weight:${w};font-style:${st};src:url(${dir}${slug}-latin-${w}-${st}.woff2)}` +
		`@font-face{font-family:"${fam}";font-weight:${w};font-style:${st};src:url(${dir}${slug}-latin-ext-${w}-${st}.woff2);unicode-range:U+0100-02BA,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0}`))).join("\n");
}

// Step 2: the print document for one design. options: { style, pictures: colour|ink|bw|none, references: leave|small|keep }.
// Returns { css, bodyClass, bodyHTML, lang, title } for sheet.html, which builds the pages.
export async function compose(prepared, { style = "classic", pictures = "colour", references = "small", paper = "A4" } = {}) {
	const P = PAPERS[paper] || PAPERS.A4;
	const { man, byId, body, type } = prepared;
	style = STYLES[style] ? style : "classic";
	const S = STYLES[style];
	const G = { COL: type === "tutorial" ? GEOMETRY.tutorial : style === "classic" ? (GEOMETRY[type] || COL) : colWidth(S), MEASURE };
	const noPictures = pictures === "none";
	const assets = {};
	for (const b of body.blocks) { const v = byId[b.id]; if (!v || v.broken || noPictures) continue;
		v.isHero = b.id === body.heroId && v.kind === "img" && !v.graphic;
		const p = place(v, G), width = p.cls === "hero" ? MEASURE : (p.w || G.COL);
		assets[b.id] = S.halftone || pictures === "ink" ? await halftone(v, width, S.halftone || "#2a2a2a", S.halftone ? 0.6 : 0.45) : v.asset; }
	const swaps = body.blocks.map(b => {
		const v = byId[b.id];
		if (!v || v.broken || noPictures || strip(v)) return { id: b.id, html: "" };
		v.isHero = b.id === body.heroId && v.kind === "img" && !v.graphic;
		const p = place(v, G); v.placed = p;
		return { id: b.id, html: figureHtml(v, assets[b.id], p, b.caption), hero: p.cls === "hero" };
	});
	const doc = new DOMParser().parseFromString("<!doctype html><body><div></div></body>", "text/html");
	const root = doc.body.firstElementChild;
	root.innerHTML = body.html;
	const standfirst = man.excerpt && man.excerpt.length < 400 ? man.excerpt : "";
	const out = finish(root, { swaps, colMM: G.COL, sidenotes: !!S.sidenotes, standfirst, byline: man.byline, references, pageURL: man.url });
	const heroV = Object.values(byId).find(v => v.placed && v.placed.cls === "hero"), heroPx = heroV && heroV.px;
	const coverOk = !!(S.cover && out.hero && heroPx && heroPx.h >= P.contentHeight / 25.4 * 150);
	const address = man.printURL || man.url || "https://myscreenbreak.com";
	const words = body.features.words, qr = await QRCode.toString(address, { type: "svg", margin: 0 });
	const readcard = `<aside class="sidenote readcard"><div class="qr">${qr}</div><p><b>${Math.max(1, Math.round(words / 230))} min read</b> · ${words.toLocaleString("en")} words</p><p>Scan for the original, with video and links.</p></aside>`;
	const title = decode(body.title || man.title);
	let site = man.siteName;
	try { site = site || new URL(man.url).hostname.replace(/^www\./, ""); } catch { site = site || ""; }
	const date = man.published ? new Date(man.published) : null;
	const dateStr = date && !isNaN(date) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
	const cut = (t, n) => t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…";
	const runHead = `${site} · ${cut(title || "", 80)}`;
	const css = `${fontFaces()}\n@page { @bottom-left { content: "${runHead.replace(/["\\]/g, "").replace(/\s+/g, " ")}"; } }\n${await engineCSS()}
html.sb-greys img, html.sb-greys svg { filter: grayscale(1); }
${P === PAPERS.A4 ? "" : `@page { size: ${P.width}mm ${P.height}mm; margin: 16mm ${((P.width - MEASURE) / 2).toFixed(2)}mm 18mm; }
.page { height: ${P.contentHeight}mm; }`}`;
	const bodyClass = `type-${type} style-${style}${coverOk ? " has-cover" : ""}`;
	const bodyHTML = `<header class="masthead"><p class="kicker">${esc(site)}</p><h1>${esc(title)}</h1>
${standfirst && type !== "thread" && !out.dropStandfirst ? `<p class="standfirst">${esc(standfirst)}</p>` : ""}
<p class="byline">${[man.byline, dateStr].filter(Boolean).map(esc).join(" · ")}</p></header>
${out.hero}
<main class="flow">${readcard}${out.html}</main>
<footer class="source">Saved from <span>${esc(man.url)}</span> · printed with Screenbreak</footer>`;
	return { css, bodyClass, bodyHTML, lang: man.lang, title, greys: pictures === "bw", paper: { ...P, side: (P.width - MEASURE) / 2 } };
}

// printlab layout.js, second page.evaluate: figures in, notes, sidenotes, pull quotes, transcript turns.
// Plus the reader's choice for long reference lists.
function finish(root, { swaps, colMM, sidenotes, standfirst, byline, references, pageURL }) {
	const document = root.ownerDocument;
	let hero = "";
	for (const s of swaps) { const host = root.querySelector(`[data-host="${s.id}"]`); if (!host) continue;
		if (s.hero) { hero = s.html; host.remove(); continue; }
		const t = document.createElement("template"); t.innerHTML = s.html; host.replaceWith(t.content); }
	for (const f of root.querySelectorAll("p > figure")) { const p = f.parentElement; p.after(f); }
	for (const f of root.querySelectorAll("figure")) { const n = f.nextElementSibling;
		if (!n || n.tagName !== "P" || f.querySelector("figcaption") || f.classList.contains("video-card")) continue;
		const t = n.textContent.trim(), em = n.querySelector("em, i"), allEm = !!em && em.textContent.trim() === t;
		if (t && t.length <= 300 && (/^(figure|fig\.?|chart|table|graph|exhibit|image|source)\s*[\w.-]{0,4}\s*[:.\u2013\u2014-]/i.test(t) || allEm && t.length <= 200)) {
			const fc = document.createElement("figcaption"); fc.innerHTML = n.innerHTML; f.append(fc); n.remove(); } }
	const chars = Math.floor(colMM / 1.8);
	if (colMM < 100) for (const t of root.querySelectorAll("table")) if (t.querySelectorAll("tr:first-child > *").length > 4) t.classList.add("wide");
	for (const pre of root.querySelectorAll("pre")) { const lines = pre.textContent.split("\n");
		if (lines.some(l => l.length > chars)) pre.classList.add(colMM < 100 && lines.length <= 45 ? "wide" : "long-lines"); }
	// Notes and references print small; long lists follow the reader's setting.
	for (const h of root.querySelectorAll("h2, h3, h4")) if (/^(end ?notes|notes|footnotes|references|sources|bibliography|citations|works cited)\s*$/i.test(h.textContent.trim())) {
		h.classList.add("notes-head"); let n = h.nextElementSibling; while (n && !/^H[2-4]$/.test(n.tagName)) { n.classList.add("notes"); n = n.nextElementSibling; } }
	for (const list of root.querySelectorAll("ol.references, ul.references, .reflist ol, .refbegin ul")) list.classList.add("notes");
	applyReferences(root, references);
	// The extension makes in-page links absolute; footnote references point back into the article.
	for (const a of root.querySelectorAll("a[href*='#']")) { const id = footnoteId(a, pageURL); if (id && !a.getAttribute("href").startsWith("#")) a.setAttribute("href", "#" + encodeURIComponent(id)); }
	if (sidenotes) {
		let moved = 0;
		for (const a of [...root.querySelectorAll("a[href^='#']")]) {
			let id; try { id = decodeURIComponent(a.getAttribute("href").slice(1)); } catch { continue; } if (!id) continue;
			const li = root.querySelector(`li[id="${CSS.escape(id)}"]`) || root.querySelector(`[id="${CSS.escape(id)}"]`)?.closest("li");
			const host = a.closest("p, li, blockquote"); if (!li || !host || li.contains(a) || host.closest(".notes")) continue;
			const num = a.textContent.trim().replace(/[[\]]/g, "") || String(++moved);
			const note = document.createElement("aside"); note.className = "sidenote";
			const copy = li.cloneNode(true); copy.querySelectorAll("a[href^='#']").forEach(x => { if (/^\W*(\^|↑|back)/i.test(x.textContent.trim()) || x.textContent.trim() === "↩") x.remove(); });
			note.innerHTML = `<b>${esc(num)}</b> ${copy.innerHTML.replace(/<\/?p[^>]*>/g, " ")}`;
			if (note.textContent.length > 380) { const t = note.textContent.slice(0, 340).replace(/\s+\S*$/, ""); note.innerHTML = `<b>${esc(num)}</b> ${esc(t.slice(num.length + 1))}…`; }
			(host.closest("ul, ol, blockquote") || host).before(note); li.dataset.moved = "1"; a.classList.add("noteref"); moved++;
		}
		for (const list of [...root.querySelectorAll("ol, ul")]) { const items = [...list.children];
			if (items.length && items.every(li => li.dataset.moved)) { const h = list.previousElementSibling; if (h && /^H[2-4]$/.test(h.tagName)) h.remove(); list.remove(); } }
		for (const f of root.querySelectorAll("figure.col:not(.video-card) figcaption")) { const s = document.createElement("aside"); s.className = "sidenote caption"; s.innerHTML = f.innerHTML; f.closest("figure").before(s); f.remove(); }
	}
	{ const paras = [...root.querySelectorAll("p")].filter(p => !p.closest("li, blockquote, figure, table, .ingredients") && !p.classList.contains("notes") && p.textContent.trim().length > 80);
		const words = paras.reduce((n, p) => n + p.textContent.split(/\s+/).length, 0), want = words < 700 ? 0 : Math.min(3, 1 + Math.floor(words / 2000));
		const cands = [];
		paras.forEach((p, i) => { if (i < paras.length * 0.2 || i > paras.length * 0.85) return;
			const lead = p.firstElementChild; if (lead && /^(STRONG|B)$/.test(lead.tagName) && /:\s*$/.test(lead.textContent)) return;
			for (const s0 of p.textContent.replace(/(\d)\.(\d)/g, "$1\u2024$2").match(/[^.!?]+[.!?]["”’]?/g) || []) { const s = s0.replace(/\u2024/g, "."), t = s.trim(), w = t.split(/\s+/).length;
				const marks = (t.match(/["“”]/g) || []).length;
				if (w >= 11 && w <= 26 && marks % 2 === 0 && !/^[^"“]*”/.test(t) && !/^[a-z’']/.test(t) && !/\d{3,}|https?:|\(|\[|cookie|click|subscribe|sign up|newsletter/i.test(t)) cands.push({ i, t, score: (/[“"]/.test(t) ? 2 : 0) + (/\b(I|we|you)\b/.test(t) ? 1 : 0) - Math.abs(w - 17) / 10 }); } });
		const picked = [];
		for (let k = 0; k < want; k++) {
			const lo = paras.length * (0.2 + 0.65 * k / want), hi = paras.length * (0.2 + 0.65 * (k + 1) / want);
			const best = cands.filter(c => c.i >= lo && c.i < hi).sort((a, b) => b.score - a.score)[0]; if (best) picked.push(best); }
		const cum = []; paras.reduce((n, p, k) => (cum[k] = n + p.textContent.split(/\s+/).length), 0);
		const heads = [...root.querySelectorAll("h2, h3")], sec = el => heads.filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).length;
		for (const c of picked) { const q = document.createElement("p"); q.className = "pullquote";
			q.textContent = /^["“][^"“”]*["”]$/.test(c.t) ? c.t.slice(1, -1) : c.t;
			const mySec = sec(paras[c.i]), same = k => sec(paras[k]) === mySec;
			let k = c.i; while (k > 0 && same(k - 1) && cum[c.i] - cum[k] < 650) k--;
			if (cum[c.i] - cum[k] < 300) { k = c.i; while (k < paras.length - 1 && same(k + 1) && cum[k] - cum[c.i] < 650) k++; if (cum[k] - cum[c.i] < 300) continue; }
			paras[k].before(q); } }
	for (const p of root.querySelectorAll("p")) { const b = p.firstElementChild;
		if (b && /^(STRONG|B)$/.test(b.tagName) && p.textContent.trimStart().startsWith(b.textContent.trim()) && /^[^:]{1,40}:\s*$/.test(b.textContent.trim())) {
			const who = b.textContent.trim().replace(/:\s*$/, ""); b.remove(); p.classList.add("turn");
			const s = document.createElement("span"); s.className = "speaker"; s.textContent = who; p.prepend(s); } }
	for (const p of root.querySelectorAll("p")) { const t = p.textContent.trim(), b = [...p.querySelectorAll("strong, b")].map(x => x.textContent).join("").trim();
		if (/^(Q|Q\.)\s*[:.\u2014-]/.test(t) || (b.length > 15 && b.length >= t.length * 0.9 && /\?\s*$/.test(t))) p.classList.add("q");
		else if (/^(A|A\.)\s*[:.\u2014-]/.test(t)) p.classList.add("a"); }
	for (const h of root.querySelectorAll("h2, h3, h4, p")) {
		const t = h.textContent.trim();
		if (/^ingredients?\b/i.test(t) && t.length < 40) { const box = document.createElement("div"); box.className = "ingredients"; h.before(box);
			let n = h; const take = [h]; while ((n = n.nextElementSibling) && !/^H[1-4]$/.test(n.tagName) && !(n.tagName === "P" && /^(method|instructions|directions|steps)\b/i.test(n.textContent.trim()))) take.push(n);
			box.append(...take); }
		if (/^(method|instructions|directions|steps|preparation)\b/i.test(t) && t.length < 40) { let n = h.nextElementSibling; while (n && n.tagName !== "OL" && !/^H[1-4]$/.test(n.tagName)) n = n.nextElementSibling; if (n && n.tagName === "OL") n.classList.add("steps"); }
	}
	const isThread = !!root.querySelector("p.comment-meta");
	if (byline && !isThread) { const nm = byline.toLowerCase().split(/\s+and\s+|,\s*/)[0].trim();
		for (const el of [...root.querySelectorAll("p, div, span, h4, h5, h6")].slice(0, 12)) { const t = el.textContent.replace(/\s+/g, " ").trim();
			const rest = t.toLowerCase().replace(nm, "").replace(/\bby\b/g, "").trim(), words = rest.split(/\s+/).filter(Boolean).length;
			if (nm && t.length < 140 && t.toLowerCase().includes(nm) && !/:/.test(t) && words <= 8 && !/edited by|reporting by|additional reporting|contributed/i.test(t) &&
					!el.matches(".turn, .q, .a, .speaker") && !el.closest(".turn") && !el.querySelector("img, figure, [data-host], .speaker")) { el.remove(); } } }
	let dropStandfirst = false;
	if (standfirst && !isThread) { const toks = t => new Set((t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
		const sf = toks(standfirst), sfText = standfirst.toLowerCase().replace(/\W+/g, " ").trim();
		for (const p of [...root.querySelectorAll("p, h2, h3")].slice(0, 3)) { const t = p.textContent.toLowerCase().replace(/\W+/g, " ").trim(); if (!t) continue;
			const pt = toks(p.textContent), both = [...pt].filter(w => sf.has(w)).length;
			if (t.startsWith(sfText.slice(0, 60)) || sfText.startsWith(t.slice(0, 60)) || both / Math.max(pt.size, sf.size) > 0.6) {
				if (t.length > sfText.replace(/\s*(\.\.\.|…)$/, "").length + 20) dropStandfirst = true; else p.remove();
				break; } } }
	for (const q of root.querySelectorAll("blockquote")) if (q.textContent.trim().length > 500) q.classList.add("long");
	const firstP = isThread ? null : [...root.querySelectorAll("p")].find(p => p.textContent.trim().length > 120); if (firstP) firstP.classList.add("lede");
	const ps = [...root.querySelectorAll("p")].filter(p => p.textContent.trim().length > 40); if (ps.length) ps.pop().insertAdjacentHTML("beforeend", "<span class=\"endmark\"></span>");
	return { hero, html: root.innerHTML, dropStandfirst };
}

// Long reference lists (a Wikipedia biography ends with hundreds): leave them out, print them small (the
// default, as notes), or keep them at text size. Short notes lists always print as notes.
export function referenceCount(root) {
	return [...root.querySelectorAll(".notes")].reduce((n, el) => n + (el.matches("li") ? 1 : el.querySelectorAll("li").length), 0);
}
function applyReferences(root, references) {
	if (referenceCount(root) < LONG_REFERENCES) return;
	if (references === "leave") {
		root.querySelectorAll(".notes-head, .notes").forEach(el => el.remove());
		const note = root.ownerDocument.createElement("p");
		note.className = "notes references-left-out";
		note.textContent = "The article's reference list is left out of this print. It is on the original page.";
		root.append(note);
	} else if (references === "keep") {
		root.querySelectorAll(".notes").forEach(el => el.classList.remove("notes"));
	}
}

// For the print page's summary: does this article have a long reference list?
export function hasLongReferences(prepared) {
	const doc = new DOMParser().parseFromString("<!doctype html><body><div></div></body>", "text/html");
	const root = doc.body.firstElementChild;
	root.innerHTML = prepared.body.html;
	for (const h of root.querySelectorAll("h2, h3, h4")) if (/^(end ?notes|notes|footnotes|references|sources|bibliography|citations|works cited)\s*$/i.test(h.textContent.trim())) {
		let n = h.nextElementSibling; while (n && !/^H[2-4]$/.test(n.tagName)) { n.classList.add("notes"); n = n.nextElementSibling; } }
	for (const list of root.querySelectorAll("ol.references, ul.references, .reflist ol, .refbegin ul")) list.classList.add("notes");
	return referenceCount(root) >= LONG_REFERENCES;
}

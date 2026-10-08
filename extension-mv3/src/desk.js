// The desk: the pages exactly as they print, scaled to fit. Each design is its own document (sheet.html),
// kept once built, so switching back to a design is instant.
const MM = 96 / 25.4;
const PAGE_WIDTH = 216 * MM;
const PAD = 24;

function blockPrint(entry, blocked) {
	const win = entry && entry.iframe.contentWindow;
	if (win && win.setPrintBlocked) {
		win.setPrintBlocked(!!blocked);
	}
}

export class Desk {
	constructor(element) {
		this.element = element;
		this.frames = new Map();
		this.current = null;
		this.spread = false;
		this.printBlocked = false;
		new ResizeObserver(() => this.fit()).observe(element);
	}

	// Builds (or reuses) the document for key. doc is a promise of compose()'s result.
	render(key, doc) {
		if (this.frames.has(key)) {
			return this.frames.get(key).ready;
		}
		const iframe = document.createElement("iframe");
		iframe.className = "sheet-frame";
		iframe.setAttribute("tabindex", "-1");
		// Laid out while it builds (the paginator measures), so never display: none; just out of sight.
		iframe.style.width = PAGE_WIDTH + 2 * PAD + "px";
		iframe.style.height = "1200px";
		const holder = document.createElement("div");
		holder.className = "sheet-holder";
		holder.append(iframe);
		this.element.append(holder);
		const entry = { key, iframe, holder, pages: 0 };
		entry.ready = new Promise((resolve, reject) => {
			iframe.addEventListener("load", async () => {
				try {
					const result = await iframe.contentWindow.renderSheet(await doc);
					entry.pages = result.pages;
					entry.pageWidth = result.paperWidth * MM;
					resolve(entry);
				} catch (error) {
					reject(error);
				}
			}, { once: true });
			iframe.src = "sheet.html";
		});
		this.frames.set(key, entry);
		entry.ready.catch(() => this.frames.delete(key));
		return entry.ready;
	}

	async show(key, doc) {
		const entry = await this.render(key, doc);
		if (this.current && this.current != entry) {
			this.current.holder.classList.remove("shown");
			blockPrint(this.current, false);
		}
		this.current = entry;
		entry.holder.classList.add("shown");
		blockPrint(entry, this.printBlocked);
		this.fit();
		return entry;
	}

	// A locked preview: a print started from inside the shown sheet (not through print()) prints nothing.
	setPrintBlocked(blocked) {
		this.printBlocked = blocked;
		blockPrint(this.current, blocked);
	}

	setSpread(spread) {
		this.spread = spread;
		this.fit();
	}

	// Pages at their real size when there is room; smaller when the desk is narrow.
	fit() {
		const entry = this.current;
		if (!entry) {
			return;
		}
		const win = entry.iframe.contentWindow;
		if (win && win.setSpread) {
			win.setSpread(this.spread);
		}
		const across = this.spread && entry.pages > 1 ? 2 : 1;
		const naturalWidth = across * (entry.pageWidth || PAGE_WIDTH) + (across - 1) * 18 + 2 * PAD;
		const available = this.element.clientWidth;
		const scale = Math.min(1, available / naturalWidth);
		const height = entry.iframe.contentDocument ? entry.iframe.contentDocument.documentElement.scrollHeight : 0;
		entry.iframe.style.width = naturalWidth + "px";
		entry.iframe.style.height = height + "px";
		entry.iframe.style.transform = `scale(${scale})`;
		entry.holder.style.width = naturalWidth * scale + "px";
		entry.holder.style.height = height * scale + "px";
	}

	// Page 1 of a built document as a small still picture, width px wide: a copy of the page's markup without its
	// scripts, in a frame that cannot run any. Same origin, so the article's pictures (blob URLs) still load.
	thumbnail(entry, width) {
		const doc = entry && entry.iframe.contentDocument;
		const paper = doc && doc.querySelector("#book > .paper");
		if (!paper) {
			return null;
		}
		const copy = doc.documentElement.cloneNode(true);
		copy.querySelectorAll("script").forEach(script => script.remove());
		copy.querySelectorAll("#book > .paper").forEach((page, index) => index && page.remove());
		const style = doc.createElement("style");
		style.textContent = "html, body { margin: 0; overflow: hidden; background: #fff; } #book { display: block !important; padding: 0 !important; } .paper { box-shadow: none !important; }";
		copy.querySelector("head").append(style);
		const scale = width / paper.offsetWidth;
		const frame = document.createElement("iframe");
		frame.className = "thumb-frame";
		frame.setAttribute("sandbox", "allow-same-origin");
		frame.setAttribute("tabindex", "-1");
		frame.setAttribute("aria-hidden", "true");
		frame.style.cssText = `width:${paper.offsetWidth}px;height:${paper.offsetHeight}px;transform:scale(${scale});transform-origin:0 0;border:0;pointer-events:none;`;
		frame.srcdoc = "<!doctype html>" + copy.outerHTML;
		const holder = document.createElement("span");
		holder.className = "thumb-live";
		holder.style.cssText = `display:block;overflow:hidden;width:${width}px;height:${Math.round(paper.offsetHeight * scale)}px;`;
		holder.append(frame);
		return holder;
	}

	// The browser's print dialog for the design on show. Resolves after the dialog closes.
	print() {
		const win = this.current.iframe.contentWindow;
		// Only reached for a print the page allows: lift the locked-preview block first.
		this.setPrintBlocked(false);
		return new Promise(resolve => {
			win.addEventListener("afterprint", () => resolve(), { once: true });
			win.focus();
			win.print();
			// print() blocks until the dialog closes; afterprint may not fire when it is cancelled early.
			setTimeout(resolve, 0);
		});
	}

	clear() {
		this.frames.forEach(entry => entry.holder.remove());
		this.frames.clear();
		this.current = null;
	}
}

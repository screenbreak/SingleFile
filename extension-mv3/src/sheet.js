// The document the print page previews and prints: one per design. The print page hands it the article as
// printlab composes it (engine/layout.js); printlab's paginate.js then builds the A4 pages, unchanged.
window.renderSheet = async function ({ css, bodyClass, bodyHTML, lang, title, greys, paper }) {
	document.documentElement.lang = lang || "";
	document.documentElement.classList.toggle("sb-greys", !!greys);
	document.title = title || "Print";
	// The paper the pages are built for: the paginator's page height, and the sheet drawn around each page.
	window.__sbContentHeight = paper.contentHeight;
	const root = document.documentElement.style;
	root.setProperty("--paper-w", paper.width + "mm");
	root.setProperty("--paper-h", paper.height + "mm");
	root.setProperty("--paper-side", paper.side + "mm");
	const style = document.createElement("style");
	style.textContent = css;
	document.head.append(style);
	document.body.className = bodyClass;
	document.body.innerHTML = bodyHTML;
	await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => null)));
	// paginate.js starts on the window's load event, which has fired already: load it, then fire it again.
	await new Promise(resolve => {
		const script = document.createElement("script");
		script.src = "engine/paginate.js";
		script.onload = resolve;
		document.head.append(script);
	});
	dispatchEvent(new Event("load"));
	await new Promise(resolve => {
		const check = () => window.__paged ? resolve() : setTimeout(check, 30);
		check();
	});
	Array.from(document.querySelectorAll("#book > .page")).forEach((page, index, pages) => {
		const paper = document.createElement("div");
		paper.className = "paper";
		paper.dataset.n = `${index + 1} / ${pages.length}`;
		page.before(paper);
		paper.append(page);
	});
	drawMargins();
	return { pages: window.__paged.pages, paperWidth: paper.width };
};

// On paper Chrome prints the imprint and the gift line from compose()'s @page rules;
// a screen has no page margins, so the preview draws the same lines on the sheets (screen only, sheet.css).
function drawMargins() {
	const data = document.querySelector(".sb-margins");
	const sheets = Array.from(document.querySelectorAll(".paper"));
	if (!data || !sheets.length) {
		return;
	}
	const add = (sheet, place, text) => {
		if (text) {
			const box = document.createElement("div");
			box.className = "sb-margin " + place;
			box.setAttribute("aria-hidden", "true");
			box.textContent = text;
			sheet.append(box);
		}
	};
	add(sheets[0], "top", data.dataset.gift);
	add(sheets[0], "bottom", data.dataset.imprint);
}

window.setSpread = function (spread) {
	document.documentElement.classList.toggle("spread", spread);
};

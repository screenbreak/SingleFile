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
	// end: how the end block printed ({ mode: "A" | "B" | "C", qrMM, roomMM }; paginate.js).
	return { pages: window.__paged.pages, paperWidth: paper.width, end: window.__paged.report.end };
};

// On paper Chrome prints the imprint, the gift line and a full last page's end line from compose()'s @page rules;
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
	const last = sheets[sheets.length - 1];
	const endInMargin = last.querySelector(".page").style.page == "sb-end";
	add(sheets[0], "top", data.dataset.gift);
	add(sheets[0], "bottom", endInMargin && sheets.length == 1 ? data.dataset.endFirst : data.dataset.imprint);
	if (endInMargin && sheets.length > 1) {
		add(last, "bottom", data.dataset.end);
	}
}

window.setSpread = function (spread) {
	document.documentElement.classList.toggle("spread", spread);
};

// Keys pressed while the desk has focus belong to the page around it: Cmd/Ctrl+P does what that page's main pill
// does (in a locked preview, the door), and Escape closes its gallery, sheet, door or preview. Same origin, so the
// key is handed to the parent window as its own keydown.
addEventListener("keydown", event => {
	const print = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() == "p";
	if ((!print && event.key != "Escape") || parent == window) {
		return;
	}
	event.preventDefault();
	const { key, code, metaKey, ctrlKey, shiftKey, altKey } = event;
	parent.dispatchEvent(new parent.KeyboardEvent("keydown", { key, code, metaKey, ctrlKey, shiftKey, altKey, bubbles: true, cancelable: true }));
});

// While the desk shows a design or option this reader cannot print yet, a print started from inside the frame
// (right-click Print…) prints nothing. The print page lifts it just before a print it allows (Desk.print).
window.setPrintBlocked = function (blocked) {
	let style = document.getElementById("sb-print-blocked");
	if (blocked && !style) {
		style = document.createElement("style");
		style.id = "sb-print-blocked";
		style.textContent = "@media print { #book { display: none !important; } }";
		document.head.append(style);
	} else if (!blocked && style) {
		style.remove();
	}
};

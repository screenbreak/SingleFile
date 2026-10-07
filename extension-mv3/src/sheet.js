// The document the print page previews and prints: one per design. The print page hands it the article as
// printlab composes it (engine/layout.js); printlab's paginate.js then builds the A4 pages, unchanged.
window.renderSheet = async function ({ css, bodyClass, bodyHTML, lang, title, greys }) {
	document.documentElement.lang = lang || "";
	document.documentElement.classList.toggle("sb-greys", !!greys);
	document.title = title || "Print";
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
	return { pages: window.__paged.pages };
};

window.setSpread = function (spread) {
	document.documentElement.classList.toggle("spread", spread);
};

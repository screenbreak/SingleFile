// The print page: shows the extracted article with the print layout, lets the user adjust it, and opens
// the browser's print dialog (which also offers "Save as PDF").
import { getSettings, updateSettings } from "./settings.js";

const REMOVED_ELEMENTS = "script, style, link, meta, noscript, form, input, button, select, textarea, object, embed, applet, frame, frameset";
const IMAGE_LOAD_TIMEOUT = 8000;

const form = document.querySelector(".toolbar");
const articleElement = document.querySelector("article");
const messageElement = document.querySelector(".message");

init();

async function init() {
	const id = location.hash.substring(1);
	const [article, settings] = await Promise.all([chrome.runtime.sendMessage({ method: "screenbreak.getPrintJob", id }), getSettings()]);
	if (!article) {
		showMessage("This print preview has expired. Go back to the article and click Print again.");
		return;
	}
	applyOptions(settings.print);
	initForm(settings.print);
	render(article);
	if (settings.print.openPrintDialog) {
		await waitForImages();
		window.print();
	}
}

function render(article) {
	document.title = article.title;
	document.documentElement.lang = article.lang || "";
	articleElement.dir = article.dir || "auto";
	document.documentElement.style.setProperty("--sb-title", JSON.stringify(article.title || ""));
	setText(".site", article.siteName);
	setText(".byline", article.byline && article.byline != article.siteName ? article.byline : "");
	setText(".date", formatDate(article.publishedTime));
	setText(".title", article.title);
	const content = sanitize(article.content, article.url);
	removeRepeatedByline(content, article.byline);
	setText(".excerpt", article.excerpt && !content.textContent.trim().startsWith(article.excerpt.trim().substring(0, 60)) ? article.excerpt : "");
	if (article.heroImage && !hasImage(content, article.heroImage)) {
		const hero = articleElement.querySelector(".hero");
		hero.querySelector("img").src = article.heroImage;
		hero.hidden = false;
	}
	articleElement.querySelector(".content").replaceChildren(...content.childNodes);
	const source = articleElement.querySelector(".source");
	source.href = article.url;
	source.textContent = article.url;
	articleElement.hidden = false;
}

// The article HTML comes from an arbitrary web page: keep its markup, drop anything active.
function sanitize(html, baseURL) {
	const doc = new DOMParser().parseFromString(html, "text/html");
	doc.querySelectorAll("iframe").forEach(iframe => {
		// Embeds (videos, tweets, maps) can't be printed; leave a link to them.
		const src = iframe.getAttribute("src");
		if (src && /^https?:/.test(src)) {
			const paragraph = doc.createElement("p");
			paragraph.className = "embed-link";
			const link = doc.createElement("a");
			link.href = src;
			link.textContent = "Embedded content: " + src;
			paragraph.append(link);
			iframe.replaceWith(paragraph);
		} else {
			iframe.remove();
		}
	});
	doc.querySelectorAll(REMOVED_ELEMENTS).forEach(element => element.remove());
	doc.querySelectorAll("*").forEach(element => {
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			const isURL = ["href", "src", "xlink:href", "action", "formaction", "poster"].includes(name);
			if (name.startsWith("on") || name == "srcdoc" || (isURL && /^\s*javascript:/i.test(attribute.value))) {
				element.removeAttribute(attribute.name);
			} else if (isURL && attribute.value && !/^(data|https?|mailto):/i.test(attribute.value)) {
				try {
					element.setAttribute(attribute.name, new URL(attribute.value, baseURL).href);
				} catch (error) {
					element.removeAttribute(attribute.name);
				}
			}
		}
		if (element.localName == "img") {
			element.loading = "eager";
		}
	});
	const container = document.createElement("div");
	container.append(...Array.from(doc.body.childNodes).map(node => document.adoptNode(node)));
	return container;
}

// The header already shows the author; drop a "By …" line the article body opens with.
function removeRepeatedByline(content, byline) {
	if (!byline) {
		return;
	}
	const normalize = text => text.replace(/\s+/g, " ").trim().toLowerCase().replace(/^by\s+/, "");
	const firstBlocks = Array.from(content.querySelectorAll("p, div, span, address")).slice(0, 5);
	const bylineElement = firstBlocks.find(element => normalize(element.textContent) == normalize(byline));
	if (bylineElement) {
		bylineElement.remove();
	}
}

function hasImage(content, url) {
	const name = imageName(url);
	return Array.from(content.querySelectorAll("img")).some(image => imageName(image.getAttribute("src") || "") == name);
}

function imageName(url) {
	try {
		return new URL(url).pathname.split("/").pop().replace(/[-_]?\d+x\d+(?=\.)/, "");
	} catch (error) {
		return url;
	}
}

function initForm(options) {
	form.elements.font.value = options.font;
	form.elements.size.value = options.size;
	form.elements.columns.value = String(options.columns);
	form.elements.images.checked = options.images;
	form.addEventListener("change", async () => {
		const settings = await getSettings();
		const print = {
			...settings.print,
			font: form.elements.font.value,
			size: form.elements.size.value,
			columns: Number(form.elements.columns.value),
			images: form.elements.images.checked
		};
		applyOptions(print);
		// Remember the choice for next time.
		updateSettings({ print });
	});
	form.querySelector(".print-button").addEventListener("click", async () => {
		// A font picked a moment ago may still be loading; printing now would leave its text blank.
		await document.fonts.ready;
		window.print();
	});
}

function applyOptions(options) {
	const classList = document.body.classList;
	classList.remove("font-serif", "font-sans", "size-small", "size-normal", "size-large", "columns-1", "columns-2", "no-images");
	classList.add("font-" + options.font, "size-" + options.size, "columns-" + options.columns);
	if (!options.images) {
		classList.add("no-images");
	}
}

async function waitForImages() {
	const pending = Array.from(document.images).filter(image => !image.complete);
	const loaded = Promise.all(pending.map(image => new Promise(resolve => {
		image.addEventListener("load", resolve, { once: true });
		image.addEventListener("error", resolve, { once: true });
	})));
	await Promise.race([Promise.all([loaded, document.fonts.ready]), new Promise(resolve => setTimeout(resolve, IMAGE_LOAD_TIMEOUT))]);
}

function formatDate(value) {
	const date = value ? new Date(value) : null;
	return date && !isNaN(date) ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
}

function setText(selector, text) {
	articleElement.querySelector(selector).textContent = text || "";
}

function showMessage(text) {
	messageElement.textContent = text;
	messageElement.hidden = false;
	form.hidden = true;
}

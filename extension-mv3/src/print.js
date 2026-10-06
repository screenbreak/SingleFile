// The print page: shows the extracted article with the print layout, lets the user adjust it, and opens
// the browser's print dialog (which also offers "Save as PDF").
import { getSettings, updateSettings } from "./settings.js";
import { renderKeys } from "./shortcuts.js";

const REMOVED_ELEMENTS = "script, style, link, meta, noscript, form, input, button, select, textarea, object, embed, applet, frame, frameset";
const IMAGE_LOAD_TIMEOUT = 8000;
const LONG_TITLE = 90;
const MIN_ARTICLE_TEXT = 140;
const MEDIA = "img, svg, video, picture, canvas, table, figure";

const form = document.querySelector(".options");
const articleElement = document.querySelector(".article");
const printButton = document.querySelector(".print-button");
const printStatus = document.querySelector(".print-status");

init();

async function init() {
	const id = location.hash.substring(1);
	const [article, settings] = await Promise.all([chrome.runtime.sendMessage({ method: "screenbreak.getPrintJob", id }), getSettings()]);
	initCloseTab();
	if (!article) {
		const { printJobSources = {} } = await chrome.storage.local.get("printJobSources");
		const source = printJobSources[id];
		showMessage({
			title: "This print preview has expired",
			text: "Screenbreak keeps an article only until Chrome closes. Go back to the article and click Print again.",
			action: source && { label: "Open the article", url: source.url }
		});
		return;
	}
	applyOptions(settings.print);
	initToolbar(settings.print);
	render(article);
	// Readability returns its best guess even on pages without an article (a login form, an app shell).
	const content = articleElement.querySelector(".content");
	if (content.textContent.trim().length < MIN_ARTICLE_TEXT && !content.querySelector("img")) {
		showMessage({
			title: "There's no article to print",
			text: "Screenbreak couldn't find the text of this page. Go back to the page to print it as it is.",
			action: { label: "Back to the page", url: article.url }
		});
		return;
	}
	document.body.classList.remove("is-loading");
	trackImages();
	watchSave(id);
	if (settings.print.openPrintDialog) {
		printWhenReady();
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
	articleElement.querySelector(".title").classList.toggle("long", (article.title || "").length > LONG_TITLE);
	const content = sanitize(article.content, article.url);
	removeRepeatedByline(content, article.byline);
	setText(".excerpt", showExcerpt(article, content) ? article.excerpt : "");
	if (article.heroImage && !hasImage(content, article.heroImage)) {
		const hero = articleElement.querySelector(".hero");
		hero.querySelector("img").src = article.heroImage;
		hero.hidden = false;
	}
	articleElement.querySelector(".content").replaceChildren(...content.childNodes);
	markLeadingElements(articleElement.querySelector(".content"));
	const source = articleElement.querySelector(".source");
	source.href = article.url;
	source.replaceChildren(...breakableURL(article.url));
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
	const firstBlocks = Array.from(content.querySelectorAll("p, div, span, address")).slice(0, 5);
	const bylineElement = firstBlocks.find(element => normalize(element.textContent) == normalize(byline));
	if (bylineElement) {
		bylineElement.remove();
	}
}

// The standfirst is worth showing only when it adds something: not the byline again, not the first paragraph again.
function showExcerpt(article, content) {
	const excerpt = normalize(article.excerpt || "");
	if (!excerpt || (article.byline && excerpt == normalize(article.byline))) {
		return false;
	}
	return !normalize(content.textContent).startsWith(excerpt.substring(0, 60));
}

function normalize(text) {
	return text.replace(/\s+/g, " ").trim().toLowerCase().replace(/^by\s+/, "");
}

// Wrappers at the top of the content often bring their own top margins, which push the first column
// of a two-column print below the second. The chain of first elements starts flush instead.
function markLeadingElements(content) {
	let element = content.firstElementChild;
	while (element) {
		const isEmpty = !element.textContent.trim() && !element.matches(MEDIA) && !element.querySelector(MEDIA);
		const next = isEmpty ? element.nextElementSibling : element.firstElementChild;
		if (isEmpty) {
			element.remove();
		} else {
			element.classList.add("sb-lead");
		}
		element = next;
	}
}

// Long links break after "/", "?", "&" and "=", not in the middle of a word.
function breakableURL(url) {
	return url.split(/(?<=[/?&=])/).flatMap((part, index) => index ? [document.createElement("wbr"), document.createTextNode(part)] : [document.createTextNode(part)]);
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

// Toolbar

async function initToolbar(options) {
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
		trackImages();
		// Remember the choice for next time.
		updateSettings({ print });
	});
	printButton.addEventListener("click", printWhenReady);
	// Cmd/Ctrl+P takes the same path as the button, so fonts and images are ready first.
	addEventListener("keydown", event => {
		if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() == "p") {
			event.preventDefault();
			printWhenReady();
		}
	});
	const isMac = navigator.platform.startsWith("Mac");
	document.querySelector(".print-keys").append(renderKeys(isMac ? ["⌘", "P"] : ["Ctrl", "P"]));
	const toggle = document.querySelector(".options-toggle");
	toggle.addEventListener("click", () => {
		const open = form.classList.toggle("open");
		toggle.setAttribute("aria-expanded", String(open));
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

function visibleImages() {
	return document.body.classList.contains("no-images") ? [] : Array.from(articleElement.querySelectorAll("img"));
}

// "Loading images · 3 of 7" beside Print until every image has arrived.
function trackImages() {
	const update = () => {
		const images = visibleImages();
		const loaded = images.filter(image => image.complete).length;
		printStatus.textContent = loaded < images.length ? `Loading images · ${loaded} of ${images.length}` : "";
	};
	visibleImages().forEach(image => {
		image.addEventListener("load", update, { once: true });
		image.addEventListener("error", update, { once: true });
	});
	update();
}

async function printWhenReady() {
	if (printButton.getAttribute("aria-busy") == "true") {
		return;
	}
	printButton.setAttribute("aria-busy", "true");
	document.querySelector(".print-label").textContent = "Preparing…";
	await waitForImages();
	printButton.removeAttribute("aria-busy");
	document.querySelector(".print-label").textContent = "Print";
	window.print();
}

async function waitForImages() {
	// A font picked a moment ago may still be loading; printing now would leave its text blank.
	const pending = visibleImages().filter(image => !image.complete);
	const loaded = Promise.all(pending.map(image => new Promise(resolve => {
		image.addEventListener("load", resolve, { once: true });
		image.addEventListener("error", resolve, { once: true });
	})));
	await Promise.race([Promise.all([loaded, document.fonts.ready]), new Promise(resolve => setTimeout(resolve, IMAGE_LOAD_TIMEOUT))]);
}

// Print and save: the article is saved in the background, and its status shows in the toolbar.

const SAVE_ICONS = {
	working: `<svg viewBox="0 0 16 16" class="spinner"><circle cx="8" cy="8" r="6.25" fill="none" stroke-width="1.75" opacity=".2"/><path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" fill="none" stroke-width="1.75" stroke-linecap="round"/></svg>`,
	done: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" class="fill"/><path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	error: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" class="fill"/><path d="M8 4.6v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r=".95" fill="#fff"/></svg>`,
	login: `<svg viewBox="0 0 16 16"><circle cx="8" cy="5.6" r="2.6" fill="none" stroke-width="1.5"/><path d="M2.9 14c.6-2.6 2.6-4 5.1-4s4.5 1.4 5.1 4" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`
};
// Actions that only make sense on the article page itself.
const PAGE_ONLY_ACTIONS = ["print-instead", "print-page"];

function watchSave(id) {
	chrome.runtime.onMessage.addListener(message => {
		if (message.method == "screenbreak.saveStatus" && message.id == id) {
			showSaveStatus(message);
		}
	});
	chrome.runtime.sendMessage({ method: "screenbreak.getSaveStatus", id }).then(message => message && showSaveStatus(message));
}

function showSaveStatus({ status, articleTabId }) {
	const element = document.querySelector(".save-status");
	clearTimeout(element.timeout);
	if (!status) {
		element.hidden = true;
		return;
	}
	const { state, title, detail, autoHide } = status;
	element.className = "save-status " + state;
	element.title = detail || "";
	element.querySelector(".save-icon").innerHTML = SAVE_ICONS[state] || "";
	element.querySelector(".save-text").textContent = state == "working" && title.startsWith("Saving") ? "Saving to Screenbreak…" : state == "login" ? "Not saved yet" : title;
	const actions = (status.actions || []).filter(action => !PAGE_ONLY_ACTIONS.includes(action.action)).map(({ label, action, href }) => {
		const control = document.createElement(href ? "a" : "button");
		control.textContent = label == "Open in Screenbreak" ? "Open" : label;
		if (href) {
			control.href = href;
			control.target = "_blank";
		} else {
			control.type = "button";
			control.className = "link-button";
			control.addEventListener("click", () => chrome.runtime.sendMessage({ method: "screenbreak.statusAction", action, tabId: articleTabId }));
		}
		control.dataset.action = action || "";
		return control;
	});
	element.querySelector(".save-actions").replaceChildren(...actions);
	element.hidden = false;
	if (autoHide) {
		// Undo is offered for a moment, like on the card; a passing note ("Removed", "Not saved") then goes away.
		element.timeout = setTimeout(() => {
			if (state == "done") {
				element.querySelector("[data-action=undo]")?.remove();
			} else {
				element.hidden = true;
			}
		}, autoHide);
	}
}

// Messages (expired, nothing to print)

function showMessage({ title, text, action }) {
	document.title = title + " · Screenbreak";
	document.body.classList.remove("is-loading");
	document.body.classList.add("is-message");
	articleElement.hidden = true;
	const message = document.querySelector(".message");
	message.querySelector(".message-title").textContent = title;
	message.querySelector(".message-text").textContent = text;
	const primary = message.querySelector(".message-primary");
	if (action && action.url) {
		primary.textContent = action.label;
		primary.href = action.url;
		primary.hidden = false;
	}
	message.hidden = false;
}

function initCloseTab() {
	document.querySelector(".close-tab").addEventListener("click", async () => {
		const tab = await chrome.tabs.getCurrent();
		chrome.tabs.remove(tab.id);
	});
}

function formatDate(value) {
	const date = value ? new Date(value) : null;
	return date && !isNaN(date) ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
}

function setText(selector, text) {
	articleElement.querySelector(selector).textContent = text || "";
}

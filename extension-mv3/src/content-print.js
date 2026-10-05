// "Print": pull the article out of the live page with Readability and return it to the background
// worker, which opens it in the extension's print page. Nothing is uploaded.
import { Readability } from "@mozilla/readability";
import { showStatus, hideStatus } from "./overlay.js";

// Images drawn by code (canvas charts, inline SVG diagrams) don't survive extraction or printing as is,
// so they are turned into plain <img> elements before the page is cloned.
const CODE_BUILT_IMAGES_SELECTOR = "canvas, svg";
const MIN_IMAGE_SIZE = 24;

globalThis.__screenbreakExtract = async function extract() {
	showStatus({ state: "working", title: "Preparing to print", detail: "Finding the article…" });
	try {
		const doc = cloneWithImages(document);
		const metadata = getMetadata(document);
		const article = new Readability(doc, { charThreshold: 300 }).parse();
		if (!article || !article.content) {
			throw new Error("Couldn't find an article on this page.");
		}
		hideStatus();
		return {
			url: location.href,
			title: article.title || document.title,
			byline: article.byline || metadata.author,
			siteName: article.siteName || metadata.siteName || location.hostname.replace(/^www\./, ""),
			publishedTime: article.publishedTime || metadata.publishedTime,
			excerpt: article.excerpt,
			heroImage: metadata.image,
			lang: article.lang || document.documentElement.lang,
			dir: article.dir,
			content: article.content
		};
	} catch (error) {
		showStatus({ state: "error", title: "Couldn't prepare this page for printing", detail: error.message });
		throw error;
	}
};

function cloneWithImages(liveDocument) {
	const liveElements = getCodeBuiltImages(liveDocument);
	const replacements = liveElements.map(toImage);
	const liveImages = Array.from(liveDocument.images);
	const doc = liveDocument.cloneNode(true);
	// cloneNode keeps document order, so elements line up by index.
	getCodeBuiltImages(doc).forEach((element, index) => {
		if (replacements[index]) {
			element.replaceWith(replacements[index]);
		} else if (element.localName == "canvas") {
			element.remove();
		}
	});
	Array.from(doc.images).forEach((image, index) => {
		const liveImage = liveImages[index];
		// Use the image the browser actually picked from srcset/<picture>, as an absolute URL.
		if (liveImage && liveImage.currentSrc && !image.src.startsWith("data:")) {
			image.setAttribute("src", liveImage.currentSrc);
			image.removeAttribute("srcset");
			image.removeAttribute("sizes");
		}
	});
	doc.querySelectorAll("screenbreak-status, picture > source").forEach(element => element.remove());
	return doc;
}

function getCodeBuiltImages(doc) {
	return Array.from(doc.querySelectorAll(CODE_BUILT_IMAGES_SELECTOR)).filter(element => !element.parentElement || !element.parentElement.closest("svg"));
}

function toImage(element) {
	const box = element.getBoundingClientRect();
	if (box.width < MIN_IMAGE_SIZE || box.height < MIN_IMAGE_SIZE) {
		// Icons and decorations: leave inline SVGs alone, drop tiny canvases.
		return null;
	}
	let src;
	try {
		if (element.localName == "canvas") {
			src = element.toDataURL("image/png");
		} else {
			const svg = element.cloneNode(true);
			svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			svg.setAttribute("width", box.width);
			svg.setAttribute("height", box.height);
			inlineSvgStyles(element, svg);
			src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
		}
	} catch (error) {
		// A canvas that drew cross-origin images can't be read back.
		return null;
	}
	const image = document.createElement("img");
	image.src = src;
	image.width = Math.round(box.width);
	image.height = Math.round(box.height);
	image.alt = element.getAttribute("aria-label") || "";
	image.className = "screenbreak-rendered-graphic";
	return image;
}

// SVG charts are often styled by page CSS that won't exist on the print page; copy the computed
// paint properties onto each shape so the image looks the same on its own.
const SVG_STYLE_PROPERTIES = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "visibility", "display"];

function inlineSvgStyles(liveSvg, clonedSvg) {
	const liveNodes = [liveSvg, ...liveSvg.querySelectorAll("*")];
	const clonedNodes = [clonedSvg, ...clonedSvg.querySelectorAll("*")];
	liveNodes.forEach((liveNode, index) => {
		const clonedNode = clonedNodes[index];
		if (!clonedNode) {
			return;
		}
		const style = getComputedStyle(liveNode);
		const inline = SVG_STYLE_PROPERTIES.map(property => `${property}:${style.getPropertyValue(property)}`).join(";");
		clonedNode.setAttribute("style", inline + ";" + (clonedNode.getAttribute("style") || ""));
	});
}

function getMetadata(doc) {
	const meta = selector => {
		const element = doc.querySelector(selector);
		return element ? element.getAttribute("content") : undefined;
	};
	return {
		author: meta("meta[name=author]") || meta("meta[property='article:author']"),
		siteName: meta("meta[property='og:site_name']"),
		publishedTime: meta("meta[property='article:published_time']") || meta("meta[itemprop=datePublished]"),
		image: absoluteURL(meta("meta[property='og:image']") || meta("meta[name='twitter:image']"))
	};
}

function absoluteURL(url) {
	try {
		return url ? new URL(url, location.href).href : undefined;
	} catch (error) {
		return undefined;
	}
}

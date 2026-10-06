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
			content: removeSiteFurniture(article.content)
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
	// cloneNode keeps document order, so elements line up by index. Photos are paired first: each code-built
	// image swapped in below adds an <img>, which would shift every photo after it onto the wrong source.
	Array.from(doc.images).forEach((image, index) => {
		const src = bestSource(liveImages[index]);
		if (src) {
			image.setAttribute("src", src);
			image.removeAttribute("srcset");
			image.removeAttribute("sizes");
		}
	});
	getCodeBuiltImages(doc).forEach((element, index) => {
		if (replacements[index]) {
			element.replaceWith(replacements[index]);
		} else if (element.localName == "canvas") {
			element.remove();
		}
	});
	doc.querySelectorAll("screenbreak-status, picture > source").forEach(element => element.remove());
	return doc;
}

// The image the browser picked from srcset/<picture>, as an absolute URL. A lazy image below the fold has
// none yet: take the largest candidate from its srcset, its <picture> sources or a lazy loader's data- attribute.
const LAZY_ATTRIBUTES = ["data-src", "data-lazy-src", "data-original", "data-srcset", "data-lazy-srcset"];

function bestSource(image) {
	if (!image) {
		return null;
	}
	if (image.currentSrc && !image.currentSrc.startsWith("data:")) {
		return image.currentSrc;
	}
	const picture = image.closest("picture");
	const sources = picture ? Array.from(picture.querySelectorAll("source[srcset]")).filter(source => !source.media || matchMedia(source.media).matches) : [];
	const candidates = [image.getAttribute("srcset"), ...sources.map(source => source.getAttribute("srcset")), ...LAZY_ATTRIBUTES.map(name => image.getAttribute(name))];
	for (const value of candidates) {
		const url = largestCandidate(value);
		if (url) {
			try {
				return new URL(url, document.baseURI).href;
			} catch (error) {
				// Not a URL: try the next candidate.
			}
		}
	}
	return null;
}

function largestCandidate(srcset) {
	if (!srcset) {
		return null;
	}
	const candidates = srcset.split(/,\s+/).map(entry => {
		const [url, descriptor = "1x"] = entry.trim().split(/\s+/);
		return { url, size: parseFloat(descriptor) || 1 };
	}).filter(candidate => candidate.url && !candidate.url.startsWith("data:"));
	candidates.sort((a, b) => b.size - a.size);
	return candidates.length ? candidates[0].url : null;
}

// Short lines that sit inside article bodies but aren't the article: newsletter and subscribe prompts, "skip past"
// links, "related" labels, reading times. Same wording as printlab's furniture rules (capture.js JUNK_TEXT).
const JUNK_TEXT = /^(skip (past|to) |after newsletter promotion|sign up|subscribe|support (independent|our|us)|become a .{0,40}member|you might also like|more about|related( stories| articles| content)?:?$|read more|recommended( stories)?$|sponsored( content)?|advertisement|most (read|popular)|listen to (this|the) article|digital subscribers can listen|share this|follow us|add us on google|mehr zum thema|lesen sie auch|à lire aussi|sur le même sujet|lee también|leia também|leggi anche|\d+ min(ute)? read$|published on)/i;

function removeSiteFurniture(html) {
	const doc = new DOMParser().parseFromString(html, "text/html");
	for (const element of doc.body.querySelectorAll("p, div, section, li, span, h2, h3, h4, figure")) {
		const text = element.isConnected ? element.textContent.replace(/\s+/g, " ").trim() : "";
		if (text && text.length < 400 && JUNK_TEXT.test(text)) {
			element.remove();
		}
	}
	return doc.body.innerHTML;
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

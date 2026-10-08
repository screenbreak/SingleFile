// Clean-up of the extracted article before the print engine reads it.
const REMOVED_ELEMENTS = "script, style, link, meta, noscript, form, input, button, select, textarea, object, embed, applet, frame, frameset";

// The article HTML comes from an arbitrary web page: keep its markup, drop anything active.
export function sanitize(html, baseURL) {
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
export function removeRepeatedByline(content, byline) {
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
export function showExcerpt(article, content) {
	const excerpt = normalize(article.excerpt || "");
	if (!excerpt || (article.byline && excerpt == normalize(article.byline))) {
		return false;
	}
	return !normalize(content.textContent).startsWith(excerpt.substring(0, 60));
}

function normalize(text) {
	return text.replace(/\s+/g, " ").trim().toLowerCase().replace(/^by\s+/, "");
}


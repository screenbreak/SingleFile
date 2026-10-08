// The print designs offered in the extension, in the order "See all designs" lists them, with the line that
// describes each. Ids are printlab style names. Thumbnails in static/designs/ are page 1 of the sample article.
export const DESIGNS = {
	classic: { name: "Classic", line: "Two columns, serif text. The safe choice." },
	magazine: { name: "Magazine", line: "Big display title, drop cap, photo across the top." },
	cover: { name: "Cover story", line: "The lead photo fills page one." },
	notes: { name: "Notes margin", line: "One column with a wide margin for your notes." },
	broadsheet: { name: "Broadsheet", line: "Three newspaper columns, fewer pages." },
	book: { name: "Book", line: "One column at a novel's measure." },
	large: { name: "Large print", line: "Bigger type in one wide column." },
	riso: { name: "Riso zine", line: "Two inks and halftone photos. Light on ink." },
	swiss: { name: "Swiss grid", line: "Numbered sections on an open grid." },
	modern: { name: "Modern", line: "All sans serif, ragged right." },
	ecoprint: { name: "Eco print", line: "Three tight columns. The least paper and ink." }
};

// "short" is the label under 400 px.
export const PICTURES = {
	colour: { label: "Colour", help: "Photos and charts print as they look on screen." },
	ink: { label: "Ink saver", short: "Ink", help: "Photos print as light dots. Uses much less ink." },
	bw: { label: "Greys", help: "Pictures print in greys, for printers without colour." },
	none: { label: "None", help: "Words only. Photos, charts and diagrams are left out." }
};

export const PAPER = {
	A4: { label: "A4" },
	Letter: { label: "US Letter" }
};

export const REFERENCES = {
	leave: { label: "Leave out", help: "The list stays on the original page." },
	small: { label: "Small type", help: "The list prints in small type at the end." },
	keep: { label: "Keep", help: "The list prints at the same size as the text." }
};

// The picker's reasons start lower case ("a sharp lead photo…"); on the page they are sentences.
export function sentence(text) {
	const clean = (text || "").trim();
	return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) + (/[.!?)]$/.test(clean) ? "" : ".") : "";
}

// The top picks for an article: the picker's ranking, limited to the designs offered here.
export function topPicks(prepared, count = 3) {
	return prepared.picks.filter(pick => DESIGNS[pick.style]).slice(0, count);
}

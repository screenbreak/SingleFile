// Every state of the status card, in one place: what it says and which actions it offers.
// An action has either `href` (a link) or `action` (sent back to the background worker).

export const TIP = "Tip: right-click any page to save or print it.";

// PLACEHOLDER until the free library size is decided (SPEC section 0: "library up to N articles").
export const LIBRARY_LIMIT_PLACEHOLDER = 50;

// The meter on saves shows only when the library is nearly full (SPEC B2 row 4), never at low use.
const METER_FROM = 0.8;

export const uploading = () => ({ state: "working", title: "Saving to your library", detail: "Uploading…", step: 3 });

// The one door for a guest's Save (SPEC A3). The sign-up page signs existing readers in too.
export const loginRequired = () => ({
	state: "login",
	title: "Save this article to your library",
	detail: `Your library keeps what you print and save, on any computer. Free for up to ${LIBRARY_LIMIT_PLACEHOLDER} articles.`,
	actions: [{ label: "Continue with email", action: "login", primary: true }, { label: "Print instead", action: "print-instead" }]
});

export const waitingForLogin = () => ({
	state: "working",
	title: "Waiting for you to sign in",
	detail: "Finish on the Screenbreak tab. This article saves by itself.",
	actions: [{ label: "Open the sign-in tab", action: "focus-login" }, { label: "Cancel", action: "cancel" }]
});

export const loginTimedOut = () => ({
	state: "error",
	title: "Still not signed in",
	detail: "We stopped waiting, so this article isn't saved yet.",
	actions: [{ label: "Try again", action: "login", primary: true }, { label: "Dismiss", action: "dismiss" }]
});

// `saves` is { used, limit } when the server's answer to the upload carries counts; without it there is no meter.
// The link keeps the label "Open": the print page shows the same action under its Print button.
export const saved = ({ title, articleURL, tip, saves }) => ({
	state: "done",
	title: "Saved to your library",
	quote: title,
	detail: saves && saves.limit && saves.used / saves.limit >= METER_FROM ? `${saves.used} of ${saves.limit} saves this month` : null,
	tip,
	actions: [{ label: "Open", href: articleURL }, { label: "Undo", action: "undo" }],
	autoHide: 8000
});

export const notSaved = () => ({ state: "info", title: "Not saved", detail: "You can save this article any time.", autoHide: 4000 });

export const removing = () => ({ state: "working", title: "Removing from your library" });

export const removed = () => ({
	state: "info",
	title: "Removed from your library",
	actions: [{ label: "Save again", action: "retry" }],
	autoHide: 5000
});

export const undoFailed = articleURL => ({
	state: "error",
	title: "Couldn't remove the article",
	detail: "It's still in your library. You can remove it there.",
	actions: [{ label: "Open", href: articleURL }]
});

export const captureFailed = () => ({
	state: "error",
	title: "Couldn't capture this page",
	detail: "Reload the page, then try again.",
	actions: [{ label: "Try again", action: "retry", primary: true }]
});

// `plusURL` is the library-full link when the server sends none.
export function saveFailed(error, { plusURL } = {}) {
	switch (error.kind) {
		case "offline":
			return { state: "error", title: "You're offline", detail: "Nothing was saved. It saves as soon as you're back online.", actions: [{ label: "Try again", action: "retry", primary: true }], retryWhenOnline: true };
		case "unreachable":
			return { state: "error", title: "Can't reach Screenbreak", detail: "Nothing was saved. Check your connection and try again.", actions: [{ label: "Try again", action: "retry", primary: true }] };
		case "limit": {
			// Our words, not the server's: its title and button speak of monthly uploads and upgrades.
			// Nothing went wrong, so the card is neutral: info (role=status) with the library icon, not the red error.
			const href = error.actionURL || plusURL;
			return {
				state: "info",
				icon: "library",
				title: "Your library is full",
				detail: "Plus keeps as many articles as you like. Printing is still free.",
				actions: [...(href ? [{ label: "See Plus", href, primary: true }] : []), { label: "Print instead", action: "print-instead" }]
			};
		}
		default:
			return { state: "error", title: "Couldn't save this article", detail: "Something went wrong on our side. Try again in a moment.", actions: [{ label: "Try again", action: "retry", primary: true }] };
	}
}

export const printFailed = () => ({
	state: "error",
	title: "Couldn't find an article here",
	detail: "Screenbreak prints articles and blog posts. You can still print the whole page.",
	actions: [{ label: "Print the whole page", action: "print-page" }]
});

// Back on the article after a "Print straight away" print (contract C-5). No offers on this card.
export const printed = ({ design, pages }) => ({
	state: "done",
	title: pages ? `${design}, ${pages} page${pages == 1 ? "" : "s"}` : design,
	actions: [{ label: "Print again", action: "print-again" }],
	autoHide: 6000
});

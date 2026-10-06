// Every state of the status card, in one place: what it says and which actions it offers.
// An action has either `href` (a link) or `action` (sent back to the background worker).

export const TIP = "Tip: right-click any page to save or print it.";

export const uploading = () => ({ state: "working", title: "Saving to Screenbreak", detail: "Uploading…", step: 3 });

export const loginRequired = () => ({
	state: "login",
	title: "Log in to save this article",
	detail: "We'll open Screenbreak in a new tab and save this article as soon as you're in.",
	actions: [{ label: "Log in", action: "login", primary: true }, { label: "Print instead", action: "print-instead" }]
});

export const waitingForLogin = () => ({
	state: "working",
	title: "Waiting for you to log in",
	detail: "Finish logging in on the Screenbreak tab. This article saves by itself.",
	actions: [{ label: "Open login tab", action: "focus-login" }, { label: "Cancel", action: "cancel" }]
});

export const loginTimedOut = () => ({
	state: "error",
	title: "Still not logged in",
	detail: "We stopped waiting, so this article isn't saved yet.",
	actions: [{ label: "Try again", action: "login", primary: true }, { label: "Dismiss", action: "dismiss" }]
});

export const saved = ({ title, articleURL, tip }) => ({
	state: "done",
	title: "Saved to Screenbreak",
	quote: title,
	tip,
	actions: [{ label: "Open in Screenbreak", href: articleURL }, { label: "Undo", action: "undo" }],
	autoHide: 8000
});

export const notSaved = () => ({ state: "info", title: "Not saved", detail: "You can save this article any time.", autoHide: 4000 });

export const removing = () => ({ state: "working", title: "Removing from Screenbreak" });

export const removed = () => ({
	state: "info",
	title: "Removed from Screenbreak",
	actions: [{ label: "Save again", action: "retry" }],
	autoHide: 5000
});

export const undoFailed = articleURL => ({
	state: "error",
	title: "Couldn't remove the article",
	detail: "It's still in your Screenbreak account. You can remove it there.",
	actions: [{ label: "Open in Screenbreak", href: articleURL }]
});

export const captureFailed = () => ({
	state: "error",
	title: "Couldn't capture this page",
	detail: "Reload the page, then try again.",
	actions: [{ label: "Try again", action: "retry", primary: true }]
});

export function saveFailed(error) {
	switch (error.kind) {
		case "offline":
			return { state: "error", title: "You're offline", detail: "Nothing was saved. It saves as soon as you're back online.", actions: [{ label: "Try again", action: "retry", primary: true }], retryWhenOnline: true };
		case "unreachable":
			return { state: "error", title: "Can't reach Screenbreak", detail: "Nothing was saved. Check your connection and try again.", actions: [{ label: "Try again", action: "retry", primary: true }] };
		case "limit":
			return {
				state: "error",
				title: error.title || "Monthly limit reached",
				detail: error.message,
				actions: [...(error.actionURL ? [{ label: error.actionLabel || "See plans", href: error.actionURL, primary: true }] : []), { label: "Print instead", action: "print-instead" }]
			};
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

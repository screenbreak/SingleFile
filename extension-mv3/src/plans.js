// What each reader gets (SPEC 0, 2026-10-08). Printing is free and unlimited for everyone; nothing here counts prints.
// A guest prints the engine's pick with Colour, Greys or None; a free account opens every design and option.

// Pictures a guest can print with. "ink" (Ink saver) needs a free account.
export const FREE_PICTURES = ["colour", "bw", "none"];

// The sign-in intent waits in session storage while the reader signs in on the server's tab:
// { kind: "design" | "option" | "save" | "keep", design?, option?: { name, value }, printJobId?, printTabId?, sourceUrl, title, created }
export const INTENT_KEY = "sbIntent";

// Whether this reader may print with this value. kind: "design" | "pictures" | "references" (paper is open to everyone).
// For a guest, a design is open only when it is the engine's pick for this article.
export function canUse(account, kind, value, { pick } = {}) {
	if (account && (account.state == "free" || account.state == "plus")) {
		return true;
	}
	if (kind == "design") {
		return value == pick;
	}
	if (kind == "pictures") {
		return FREE_PICTURES.includes(value);
	}
	if (kind == "references") {
		return value == "small";
	}
	return true;
}

// The account the reader is logged in to on the Screenbreak server. The webapp has no "who am I" call yet
// (webapp#103): until /api/v1/me/ answers, everyone is a guest.
export async function getAccount(serverUrl) {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2500);
		const response = await fetch(`${serverUrl}/api/v1/me/`, { credentials: "include", signal: controller.signal });
		clearTimeout(timeout);
		if (!response.ok) {
			return { state: "guest" };
		}
		const me = await response.json();
		return {
			state: me.plan == "plus" ? "plus" : "free",
			name: me.name || me.email || "",
			email: me.email || "",
			// The library meter, when the server sends it (fields asked for on webapp#103).
			savesUsed: Number.isFinite(me.saves_used) ? me.saves_used : null,
			savesLimit: Number.isFinite(me.saves_limit) ? me.saves_limit : null
		};
	} catch (error) {
		return { state: "guest" };
	}
}

export function signupURL(serverUrl) {
	return `${serverUrl}/signup/`;
}

export function loginPageURL(serverUrl) {
	return `${serverUrl}/login/`;
}

export function libraryURL(serverUrl) {
	return `${serverUrl}/articles/`;
}

// The door's two ways in. Best guesses, to confirm with webapp#103: the server makes the account if the email is
// new, then sends the reader to the page that tells them to go back to Chrome.
export const DOOR_NEXT = "/extension/signed-in/";
export function doorEmailURL(serverUrl) {
	return `${serverUrl}/signup/?from=extension&next=${DOOR_NEXT}`;
}
export function doorGoogleURL(serverUrl) {
	return `${serverUrl}/accounts/google/login/?from=extension&next=${DOOR_NEXT}`;
}

// PLACEHOLDER: there is no Plus page yet.
export function plusURL(serverUrl) {
	return `${serverUrl}/plus/`;
}

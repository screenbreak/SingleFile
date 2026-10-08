// What each reader gets. PLACEHOLDERS until Yorgos decides the free and paid limits (2026-10-07).
export const GUEST_FREE_PRINTS = 3;           // per browser, before a free account is needed
export const ACCOUNT_MONTHLY_PRINTS = 10;     // per month on a free account

// The account the reader is logged in to on the Screenbreak server. The webapp has no "who am I" call yet
// (see README, Not done yet): until /api/v1/me/ answers, everyone is a guest.
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
		return { state: me.plan == "plus" ? "plus" : "free", name: me.name || me.email || "", email: me.email || "" };
	} catch (error) {
		return { state: "guest" };
	}
}

const monthKey = () => new Date().toISOString().slice(0, 7);

// Prints counted on this browser. A guest's count never resets; a free account's resets each month.
export async function getQuota(account) {
	if (account.state == "plus") {
		return { unlimited: true };
	}
	const { guestPrints = 0, monthPrints = {} } = await chrome.storage.local.get(["guestPrints", "monthPrints"]);
	const total = account.state == "guest" ? GUEST_FREE_PRINTS : ACCOUNT_MONTHLY_PRINTS;
	const used = account.state == "guest" ? guestPrints : monthPrints[monthKey()] || 0;
	return { total, used, left: Math.max(0, total - used), guest: account.state == "guest" };
}

export async function countPrint(account) {
	if (account.state == "plus") {
		return;
	}
	const { guestPrints = 0, monthPrints = {} } = await chrome.storage.local.get(["guestPrints", "monthPrints"]);
	if (account.state == "guest") {
		await chrome.storage.local.set({ guestPrints: guestPrints + 1 });
	} else {
		await chrome.storage.local.set({ monthPrints: { [monthKey()]: (monthPrints[monthKey()] || 0) + 1 } });
	}
}

export async function resetQuota() {
	await chrome.storage.local.remove(["guestPrints", "monthPrints"]);
}

export function signupURL(serverUrl) {
	return `${serverUrl}/signup/`;
}

export function loginPageURL(serverUrl) {
	return `${serverUrl}/login/`;
}

// PLACEHOLDER: there is no Plus page yet.
export function plusURL(serverUrl) {
	return `${serverUrl}/plus/`;
}

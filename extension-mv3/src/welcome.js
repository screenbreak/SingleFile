// The page Chrome opens after install (SPEC A5), and "What's new" (#updated) after an update from 1.x.
import { getSettings, updateSettings } from "./settings.js";
import { getShortcuts, renderKeys, openShortcutSettings } from "./shortcuts.js";
import { getAccount, doorEmailURL, doorGoogleURL } from "./plans.js";

const PIN_CHECK_INTERVAL = 1500;
const SAVED_DELAY = 1500;
// The sample stays on Wikipedia until the site has a sample article of its own.
const SAMPLE_URL = "https://en.wikipedia.org/wiki/History_of_paper";
const updated = location.hash == "#updated";
const callout = document.querySelector(".pin-callout");

init();

async function init() {
	const settings = await getSettings();
	if (updated) {
		// 1.x readers have accounts and saved articles: say those are safe, then what's new. No setup steps.
		document.querySelector(".intro-title").textContent = "Screenbreak now prints.";
		document.querySelector(".intro-text").textContent = "Your account and your saved articles are where you left them.";
		document.querySelector(".whats-new").hidden = false;
		for (const selector of [".click", ".without", ".setup"]) {
			document.querySelector(selector).hidden = true;
		}
		// Signed out, the door is the one ask: it names the library they already have. There is no "step one" here.
		document.querySelector(".door .eyebrow").hidden = true;
		document.querySelector("#door-heading").textContent = "Sign in to see your library";
	}
	document.querySelector(".door-email").href = doorEmailURL(settings.serverUrl);
	document.querySelector(".door-google").href = doorGoogleURL(settings.serverUrl);
	document.querySelector(".open-sample").addEventListener("click", openSample);
	const radios = document.querySelectorAll("input[name=defaultAction]");
	radios.forEach(radio => {
		radio.checked = radio.value == settings.defaultAction;
		radio.addEventListener("change", async () => {
			await updateSettings({ defaultAction: radio.value });
			const saved = document.querySelector(".saved");
			saved.textContent = "Saved";
			setTimeout(() => saved.textContent = "", SAVED_DELAY);
		});
	});
	const alsoSave = document.querySelector("input[name=saveWhenPrinting]");
	alsoSave.checked = settings.saveWhenPrinting;
	alsoSave.addEventListener("change", () => updateSettings({ saveWhenPrinting: alsoSave.checked }));
	const shortcuts = await getShortcuts();
	document.querySelectorAll("[data-shortcut]").forEach(element => {
		const keys = shortcuts[element.dataset.shortcut];
		element.replaceChildren(keys.length ? renderKeys(keys) : Object.assign(document.createElement("span"), { className: "not-set", textContent: "Not set" }));
	});
	document.querySelector(".shortcuts").addEventListener("click", openShortcutSettings);
	document.querySelector(".close-tab").addEventListener("click", async () => chrome.tabs.remove((await chrome.tabs.getCurrent()).id));
	const { printedOnce } = await chrome.storage.local.get("printedOnce");
	setDone("printed", Boolean(printedOnce));
	chrome.storage.onChanged.addListener((changes, area) => area == "local" && changes.printedOnce && setDone("printed"));
	watchPinned();
	await showAccount(settings);
	// Back from the sign-in tab: the account check and the door follow without a reload.
	addEventListener("focus", () => showAccount(settings));
}

// One door, only for a reader who is signed out. "What's new" says who is signed in instead; signed out, the
// door is the only ask (no second sign-in link).
async function showAccount(settings) {
	const account = await getAccount(settings.serverUrl);
	const guest = account.state == "guest";
	setDone("account", !guest);
	document.querySelector(".door").hidden = !guest;
	document.querySelector(".also-save").hidden = guest;
	if (updated) {
		const line = document.querySelector(".signed-in");
		line.textContent = guest ? "" : account.email ? `Signed in as ${account.email}` : "You're signed in.";
		line.hidden = guest;
	}
	// Says the account parts are final (design/capture-small.mjs waits for it).
	document.body.dataset.account = account.state;
}

// Opens the sample and runs Print on it once it has loaded, as the button would.
async function openSample() {
	const tab = await chrome.tabs.create({ url: SAMPLE_URL });
	const onUpdated = (tabId, change, updatedTab) => {
		if (tabId == tab.id && change.status == "complete") {
			chrome.tabs.onUpdated.removeListener(onUpdated);
			chrome.runtime.sendMessage({ method: "screenbreak.run", action: "print", tab: updatedTab });
		}
	};
	chrome.tabs.onUpdated.addListener(onUpdated);
}

// Chrome tells whether the button is on the toolbar; check until it is, then put the callout away.
async function watchPinned() {
	const pinned = await isPinned();
	setDone("pinned", pinned);
	callout.hidden = pinned;
	if (!pinned) {
		setTimeout(watchPinned, PIN_CHECK_INTERVAL);
	}
}

async function isPinned() {
	try {
		return (await chrome.action.getUserSettings()).isOnToolbar;
	} catch (error) {
		return false;
	}
}

function setDone(name, done = true) {
	const item = document.querySelector(`[data-check=${name}]`);
	item.classList.toggle("is-done", Boolean(done));
	const check = item.querySelector(".check");
	check.removeAttribute("aria-hidden");
	check.setAttribute("role", "img");
	check.setAttribute("aria-label", done ? "Done:" : "Not yet:");
}

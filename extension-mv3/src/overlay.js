// The status card shown in the bottom-right corner of the page while Screenbreak works.
// One card per tab: each new status changes it in place (design/REFERENCES.md, research/02-toasts.md).
// It lives in a closed shadow root so the page's CSS can't touch it (and vice versa).

const HOST_TAG = "screenbreak-status";
const STILL_WORKING_DELAY = 12000;
const FONT_FAMILY = "Screenbreak Work Sans";
const SERIF_FAMILY = "Screenbreak Source Serif";
const ICONS = {
	working: `<svg viewBox="0 0 16 16" class="spinner"><circle cx="8" cy="8" r="6.25" fill="none" stroke-width="1.75" opacity=".2"/><path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" fill="none" stroke-width="1.75" stroke-linecap="round"/></svg>`,
	done: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" class="fill"/><path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	error: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" class="fill"/><path d="M8 4.6v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r=".95" fill="#fff"/></svg>`,
	login: `<svg viewBox="0 0 16 16"><circle cx="8" cy="5.6" r="2.6" fill="none" stroke-width="1.5"/><path d="M2.9 14c.6-2.6 2.6-4 5.1-4s4.5 1.4 5.1 4" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`,
	info: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.25" fill="none" stroke-width="1.5"/><path d="M8 7.4v3.6" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r=".9" class="fill"/></svg>`
};

// Kept on globalThis because the save and print scripts each bundle this module but must share one card.
const ui = globalThis.__screenbreakStatusUI || (globalThis.__screenbreakStatusUI = {});

export function showStatus(status) {
	ensureCard();
	const { state, title, detail, quote, tip, actions = [], autoHide, step } = status;
	const card = ui.card;
	clearTimers();
	card.className = "card " + state;
	card.setAttribute("role", state == "error" ? "alert" : "status");
	card.querySelector(".icon").innerHTML = ICONS[state] || "";
	card.querySelector(".title").textContent = title || "";
	setText(card.querySelector(".detail"), detail);
	const quoteElement = card.querySelector(".quote");
	quoteElement.hidden = !quote;
	if (quote) {
		quoteElement.querySelector(".quote-title").textContent = quote;
		quoteElement.querySelector(".quote-site").textContent = location.hostname.replace(/^www\./, "");
	}
	setText(card.querySelector(".tip"), tip);
	card.querySelector(".actions").replaceChildren(...actions.map(createAction));
	card.querySelector(".actions").hidden = !actions.length;
	// Bottom edge: the three save steps while working, or the time left before a card closes by itself.
	const bar = card.querySelector(".bar");
	bar.className = "bar";
	bar.style.removeProperty("--duration");
	if (state == "working" && step) {
		bar.classList.add("steps", "step-" + step);
	} else if (autoHide) {
		bar.classList.add("countdown");
		bar.style.setProperty("--duration", autoHide + "ms");
		startAutoHide(autoHide);
	}
	if (state == "working" && detail) {
		ui.stillWorkingTimeout = setTimeout(() => setText(card.querySelector(".detail"), "Still working. Large pages take a little longer."), STILL_WORKING_DELAY);
	}
	ui.retryWhenOnline = status.retryWhenOnline;
	if (!ui.host.classList.contains("shown")) {
		requestAnimationFrame(() => ui.host.classList.add("shown"));
	}
}

export function hideStatus() {
	clearTimers();
	if (ui.host) {
		const host = ui.host;
		ui.host = null;
		host.classList.remove("shown");
		setTimeout(() => host.remove(), 140);
	}
}

function setText(element, text) {
	element.textContent = text || "";
	element.hidden = !text;
}

function createAction({ label, action, href, primary }) {
	const element = document.createElement(href ? "a" : "button");
	element.textContent = label;
	element.className = primary ? "primary" : "secondary";
	if (href) {
		element.href = href;
		element.target = "_blank";
		element.rel = "noopener";
	} else {
		element.type = "button";
		element.addEventListener("click", () => sendAction(action));
	}
	return element;
}

function sendAction(action) {
	chrome.runtime.sendMessage({ method: "screenbreak.statusAction", action }).catch(() => {});
}

// The countdown pauses while the pointer or keyboard focus is on the card, so Undo can't slip away.
function startAutoHide(duration) {
	ui.remaining = duration;
	ui.paused = false;
	resumeAutoHide();
}

function resumeAutoHide() {
	ui.startedAt = Date.now();
	ui.hideTimeout = setTimeout(hideStatus, ui.remaining);
	ui.card.classList.remove("paused");
}

function pauseAutoHide() {
	if (ui.hideTimeout) {
		clearTimeout(ui.hideTimeout);
		ui.hideTimeout = null;
		ui.remaining -= Date.now() - ui.startedAt;
		ui.card.classList.add("paused");
	}
}

function clearTimers() {
	clearTimeout(ui.hideTimeout);
	clearTimeout(ui.stillWorkingTimeout);
	ui.hideTimeout = null;
	ui.remaining = 0;
}

function ensureCard() {
	if (ui.host && ui.host.isConnected) {
		return;
	}
	loadFont();
	ui.host = document.createElement(HOST_TAG);
	// SingleFile leaves elements with this class out of the capture.
	ui.host.className = "single-file-ui-element";
	ui.host.style.setProperty("all", "initial", "important");
	ui.host.style.setProperty("position", "fixed", "important");
	ui.host.style.setProperty("z-index", "2147483647", "important");
	ui.host.style.setProperty("right", "20px", "important");
	ui.host.style.setProperty("bottom", "20px", "important");
	const shadowRoot = ui.host.attachShadow({ mode: "closed" });
	shadowRoot.innerHTML = `
		<style>
			:host { opacity: 0; transform: translateY(8px); transition: opacity .16s ease-out, transform .16s ease-out; }
			:host(.shown) { opacity: 1; transform: none; }
			* { box-sizing: border-box; }
			.card {
				position: relative; display: grid; grid-template-columns: 16px 1fr; column-gap: 10px; width: min(320px, calc(100vw - 40px));
				padding: 14px 40px 16px 16px; overflow: hidden; color: #1d1d1b; background: #fff; border: 1px solid rgba(29, 29, 27, .10);
				border-radius: 10px; box-shadow: 0 1px 2px rgba(29, 29, 27, .06), 0 8px 24px rgba(29, 29, 27, .12);
				font: 400 13px/18px "${FONT_FAMILY}", system-ui, -apple-system, "Segoe UI", sans-serif; text-align: left; letter-spacing: normal;
				-webkit-font-smoothing: antialiased;
			}
			.icon { grid-row: 1 / span 6; width: 16px; height: 16px; margin-top: 2px; color: #005d4c; }
			.icon svg { display: block; width: 16px; height: 16px; stroke: currentColor; }
			.icon .fill { fill: currentColor; stroke: none; }
			.error .icon { color: #b3261e; }
			.info .icon, .login .icon { color: #4a5250; }
			.spinner { animation: spin .8s linear infinite; }
			@keyframes spin { to { transform: rotate(360deg); } }
			.content { min-width: 0; }
			.title { font-weight: 600; font-size: 14px; line-height: 20px; }
			.detail { margin-top: 2px; color: rgba(29, 29, 27, .72); text-wrap: pretty; }
			.quote { margin-top: 6px; }
			.quote-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
				font: 400 15px/20px "${SERIF_FAMILY}", Georgia, serif; color: #161a18; }
			.quote-site { margin-top: 2px; font-size: 12px; line-height: 16px; color: #6b7370; }
			.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 12px; }
			.actions a, .actions button { font-family: inherit; font-size: 13px; font-weight: 600; line-height: 20px; color: #005d4c; text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; }
			.actions a:hover, .actions button:hover { text-decoration: underline; text-underline-offset: 2px; }
			.actions .primary { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; color: #fff; background: #005d4c; border-radius: 8px; }
			.actions .primary:hover { background: #00483b; text-decoration: none; }
			:focus-visible { outline: 2px solid #005d4c; outline-offset: 2px; border-radius: 4px; }
			.tip { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(29, 29, 27, .10); font-size: 12px; line-height: 16px; color: #4a5250; text-wrap: pretty; }
			[hidden] { display: none !important; }
			.close { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; display: grid; place-items: center; padding: 0;
				color: #6b7370; background: none; border: 0; border-radius: 6px; cursor: pointer; }
			.close:hover { color: #1d1d1b; background: rgba(29, 29, 27, .06); }
			.close svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
			.working .close { display: none; }
			.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; }
			.bar.steps { background: linear-gradient(90deg, #4c9b6e var(--done), #edf2ee var(--done)); }
			.bar.step-1 { --done: 33.4%; } .bar.step-2 { --done: 66.7%; } .bar.step-3 { --done: 100%; }
			.bar.countdown { background: #edf2ee; }
			.bar.countdown::after { content: ""; position: absolute; inset: 0; background: #4c9b6e; transform-origin: left;
				animation: countdown var(--duration) linear forwards; }
			.paused .bar.countdown::after { animation-play-state: paused; }
			@keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
			@media (prefers-reduced-motion: reduce) { :host { transition: none; } .spinner { animation-duration: 2.4s; } }
		</style>
		<div class="card" aria-live="polite">
			<div class="icon" aria-hidden="true"></div>
			<div class="content">
				<div class="title"></div>
				<div class="detail"></div>
				<div class="quote" hidden><div class="quote-title"></div><div class="quote-site"></div></div>
				<div class="actions" hidden></div>
				<div class="tip" hidden></div>
			</div>
			<button type="button" class="close" aria-label="Close"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg></button>
			<div class="bar" aria-hidden="true"></div>
		</div>`;
	ui.card = shadowRoot.querySelector(".card");
	shadowRoot.querySelector(".close").addEventListener("click", hideStatus);
	ui.card.addEventListener("mouseenter", pauseAutoHide);
	ui.card.addEventListener("focusin", pauseAutoHide);
	ui.card.addEventListener("mouseleave", () => ui.remaining > 0 && !ui.card.matches(":focus-within") && resumeAutoHide());
	ui.card.addEventListener("focusout", () => ui.remaining > 0 && !ui.card.matches(":hover") && resumeAutoHide());
	document.documentElement.appendChild(ui.host);
}

// The page's own fonts can't reach into the shadow root, so Work Sans is added to the page under its own name.
function loadFont() {
	if (ui.fontRequested) {
		return;
	}
	ui.fontRequested = true;
	for (const [family, file, weight] of [[FONT_FAMILY, "fonts/WorkSans-latin.woff2", "100 900"], [SERIF_FAMILY, "engine/fonts/source-serif-4-latin-400-normal.woff2", "400"]]) {
		try {
			const font = new FontFace(family, `url(${chrome.runtime.getURL(file)})`, { weight });
			document.fonts.add(font);
			font.load().catch(() => {});
		} catch (error) {
			// The fallback fonts are fine.
		}
	}
}

// The background service worker drives the card for steps that run there (uploading, logging in, undo).
if (!globalThis.__screenbreakStatusListener) {
	globalThis.__screenbreakStatusListener = true;
	chrome.runtime.onMessage.addListener(message => {
		if (message.method == "screenbreak.status") {
			if (message.hide) {
				hideStatus();
			} else {
				showStatus(message.status);
			}
		}
	});
	addEventListener("keydown", event => {
		if (event.key == "Escape" && ui.host && !ui.card.classList.contains("working")) {
			hideStatus();
		}
	});
	addEventListener("online", () => {
		if (ui.host && ui.retryWhenOnline) {
			sendAction("retry");
		}
	});
}

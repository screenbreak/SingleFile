// A small status card shown in the corner of the page while the extension works.
// It lives in a closed shadow root so the page's CSS can't touch it (and vice versa).

const HOST_TAG = "screenbreak-status";
const AUTO_HIDE_DELAY = 8000;

// Kept on globalThis because the save and print scripts each bundle this module but must share one card.
const ui = globalThis.__screenbreakStatusUI || (globalThis.__screenbreakStatusUI = {});

export function showStatus({ state, title, detail, links = [] }) {
	ensureCard();
	clearTimeout(ui.hideTimeout);
	ui.card.className = "card " + state;
	ui.card.querySelector(".title").textContent = title || "";
	ui.card.querySelector(".detail").textContent = detail || "";
	const linksElement = ui.card.querySelector(".links");
	linksElement.replaceChildren(...links.map(link => {
		const anchor = document.createElement("a");
		anchor.href = link.url;
		anchor.target = "_blank";
		anchor.rel = "noopener";
		anchor.textContent = link.label;
		return anchor;
	}));
	if (state == "done") {
		ui.hideTimeout = setTimeout(hideStatus, AUTO_HIDE_DELAY);
	}
}

export function hideStatus() {
	clearTimeout(ui.hideTimeout);
	if (ui.host) {
		ui.host.remove();
		ui.host = null;
	}
}

function ensureCard() {
	if (ui.host && ui.host.isConnected) {
		return;
	}
	ui.host = document.createElement(HOST_TAG);
	// SingleFile leaves elements with this class out of the capture.
	ui.host.className = "single-file-ui-element";
	ui.host.style.setProperty("all", "initial", "important");
	ui.host.style.setProperty("position", "fixed", "important");
	ui.host.style.setProperty("z-index", "2147483647", "important");
	ui.host.style.setProperty("right", "16px", "important");
	ui.host.style.setProperty("bottom", "16px", "important");
	const shadowRoot = ui.host.attachShadow({ mode: "closed" });
	shadowRoot.innerHTML = `
		<style>
			.card { font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d1b; background: #fff;
				border-radius: 10px; box-shadow: 0 6px 24px rgba(0, 0, 0, .18); padding: 14px 40px 14px 16px; width: 300px;
				border-left: 4px solid #005D4C; position: relative; }
			.ui.card.error { border-left-color: #b3261e; }
			.title { font-weight: 600; }
			.detail { color: #555; margin-top: 2px; }
			.detail:empty { display: none; }
			.links { margin-top: 8px; display: flex; gap: 12px; }
			.links:empty { display: none; }
			a { color: #005D4C; font-weight: 600; text-decoration: none; }
			a:hover { text-decoration: underline; }
			.working .title::after { content: ""; display: inline-block; width: 10px; height: 10px; margin-left: 8px;
				border: 2px solid #005D4C; border-right-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; }
			@keyframes spin { to { transform: rotate(360deg); } }
			button { position: absolute; top: 8px; right: 8px; border: 0; background: none; font-size: 18px; line-height: 1;
				color: #888; cursor: pointer; padding: 4px; }
		</style>
		<div class="card" role="status" aria-live="polite">
			<div class="title"></div>
			<div class="detail"></div>
			<div class="links"></div>
			<button type="button" aria-label="Close">×</button>
		</div>`;
	ui.card = shadowRoot.querySelector(".card");
	shadowRoot.querySelector("button").addEventListener("click", hideStatus);
	document.documentElement.appendChild(ui.host);
}

// The background service worker drives the card for steps that run there (uploading, opening the print page).
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
}

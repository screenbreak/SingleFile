/* global browser, screenbreak */

screenbreak.extension.ui.bg.button = (() => {

	const DEFAULT_ICON_PATH = "/extension/ui/resources/icon_128.png";
	const BUTTON_DEFAULT_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonDefaultTooltip");
	const BUTTON_BLOCKED_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonBlockedTooltip");
	const BUTTON_DEFAULT_BADGE_MESSAGE = "";
	const BUTTON_BLOCKED_BADGE_MESSAGE = browser.i18n.getMessage("buttonBlockedBadge");
	const DEFAULT_COLOR = [2, 147, 20, 192];
	const FORBIDDEN_COLOR = [255, 255, 255, 1];

	const BUTTON_STATES = {
		default: {
			setBadgeBackgroundColor: { color: DEFAULT_COLOR },
			setBadgeText: { text: BUTTON_DEFAULT_BADGE_MESSAGE },
			setTitle: { title: BUTTON_DEFAULT_TOOLTIP_MESSAGE },
			setIcon: { path: DEFAULT_ICON_PATH }
		},
		forbidden: {
			setBadgeBackgroundColor: { color: FORBIDDEN_COLOR },
			setBadgeText: { text: BUTTON_BLOCKED_BADGE_MESSAGE },
			setTitle: { title: BUTTON_BLOCKED_TOOLTIP_MESSAGE },
			setIcon: { path: DEFAULT_ICON_PATH }
		}
	};

	browser.browserAction.onClicked.addListener(async tab => {
		const business = screenbreak.extension.core.bg.business;
		if (!business.isSavingTab(tab)) {
			business.saveTabs([tab]);
		}
	});

	return {
		onMessage,
		onForbiddenDomain,
		onCancelled,
		refreshTab
	};

	function onMessage(message, sender) {
		if (message.method.endsWith(".processInit")) {
			const tabsData = screenbreak.extension.core.bg.tabsData.getTemporary(sender.tab.id);
			delete tabsData[sender.tab.id].button;
			refreshTab(sender.tab);
		}
		if (message.method.endsWith(".processCancelled")) {
			onCancelled(sender.tab);
		}
		return Promise.resolve({});
	}

	function onForbiddenDomain(tab) {
		refresh(tab.id, getButtonState("forbidden"));
	}

	function onCancelled(tab) {
		refreshTab(tab);
	}

	async function refreshTab(tab) {
		const state = getButtonState("default");
		await refresh(tab.id, state);
	}

	async function refresh(tabId, state) {
		const tabsData = screenbreak.extension.core.bg.tabsData.getTemporary(tabId);
		if (tabsData[tabId] && state) {
			if (!tabsData[tabId].button) {
				tabsData[tabId].button = { lastState: null };
			}
			const lastState = tabsData[tabId].button.lastState || {};
			const newState = {};
			Object.keys(state).forEach(property => {
				if (state[property] !== undefined && (JSON.stringify(lastState[property]) != JSON.stringify(state[property]))) {
					newState[property] = state[property];
				}
			});
			if (Object.keys(newState).length) {
				tabsData[tabId].button.lastState = state;
				await refreshAsync(tabId, newState);
			}
		}
	}

	async function refreshAsync(tabId, state) {
		for (const browserActionMethod of Object.keys(state)) {
			await refreshProperty(tabId, browserActionMethod, state[browserActionMethod]);
		}
	}

	async function refreshProperty(tabId, browserActionMethod, browserActionParameter) {
		if (browser.browserAction[browserActionMethod]) {
			const parameter = JSON.parse(JSON.stringify(browserActionParameter));
			parameter.tabId = tabId;
			await browser.browserAction[browserActionMethod](parameter);
		}
	}

	function getButtonState(name) {
		return JSON.parse(JSON.stringify(BUTTON_STATES[name]));
	}

})();
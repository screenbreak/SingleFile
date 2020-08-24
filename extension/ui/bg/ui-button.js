/*
 * Copyright 2010-2020 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or 
 *   modify it under the terms of the GNU Affero General Public License 
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 * 
 *   The code in this file is distributed in the hope that it will be useful, 
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero 
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may 
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU 
 *   AGPL normally required by section 4, provided you include this license 
 *   notice and a URL through which recipients can access the Corresponding 
 *   Source.
 */

/* global browser, screenbreak */

screenbreak.extension.ui.bg.button = (() => {

	const DEFAULT_ICON_PATH = "/extension/ui/resources/icon_128.png";
	const BUTTON_DEFAULT_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonDefaultTooltip");
	const BUTTON_BLOCKED_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonBlockedTooltip");
	const BUTTON_DEFAULT_BADGE_MESSAGE = "";
	const BUTTON_INITIALIZING_BADGE_MESSAGE = browser.i18n.getMessage("buttonInitializingBadge");
	const BUTTON_INITIALIZING_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonInitializingTooltip");
	const BUTTON_BLOCKED_BADGE_MESSAGE = browser.i18n.getMessage("buttonBlockedBadge");
	const BUTTON_OK_BADGE_MESSAGE = browser.i18n.getMessage("buttonOKBadge");
	const BUTTON_SAVE_PROGRESS_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonSaveProgressTooltip");
	const BUTTON_UPLOAD_PROGRESS_TOOLTIP_MESSAGE = browser.i18n.getMessage("buttonUploadProgressTooltip");
	const DEFAULT_COLOR = [2, 147, 20, 192];
	const ACTIVE_COLOR = [4, 229, 36, 192];
	const FORBIDDEN_COLOR = [255, 255, 255, 1];
	const INJECT_SCRIPTS_STEP = 1;

	const BUTTON_STATES = {
		default: {
			setBadgeBackgroundColor: { color: DEFAULT_COLOR },
			setBadgeText: { text: BUTTON_DEFAULT_BADGE_MESSAGE },
			setTitle: { title: BUTTON_DEFAULT_TOOLTIP_MESSAGE },
			setIcon: { path: DEFAULT_ICON_PATH }
		},
		inject: {
			setBadgeBackgroundColor: { color: DEFAULT_COLOR },
			setBadgeText: { text: BUTTON_INITIALIZING_BADGE_MESSAGE },
			setTitle: { title: BUTTON_INITIALIZING_TOOLTIP_MESSAGE },
		},
		execute: {
			setBadgeBackgroundColor: { color: ACTIVE_COLOR },
			setBadgeText: { text: BUTTON_INITIALIZING_BADGE_MESSAGE },
		},
		progress: {
			setBadgeBackgroundColor: { color: ACTIVE_COLOR },
			setBadgeText: { text: BUTTON_DEFAULT_BADGE_MESSAGE }
		},
		end: {
			setBadgeBackgroundColor: { color: ACTIVE_COLOR },
			setBadgeText: { text: BUTTON_OK_BADGE_MESSAGE },
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
		const allTabs = await screenbreak.extension.core.bg.tabs.get({ currentWindow: true, highlighted: true });
		if (allTabs.length <= 1) {
			toggleSaveTab(tab);
		} else {
			business.saveTabs(allTabs);
		}

		function toggleSaveTab(tab) {
			if (business.isSavingTab(tab)) {
				business.cancelTab(tab.id);
			} else {
				business.saveTabs([tab]);
			}
		}
	});

	return {
		onMessage,
		onStart,
		onUploadProgress,
		onForbiddenDomain,
		onEnd,
		onCancelled,
		refreshTab
	};

	function onMessage(message, sender) {
		if (message.method.endsWith(".processInit")) {
			const tabsData = screenbreak.extension.core.bg.tabsData.getTemporary(sender.tab.id);
			delete tabsData[sender.tab.id].button;
			refreshTab(sender.tab);
		}
		if (message.method.endsWith(".processProgress")) {
			if (message.maxIndex) {
				onSaveProgress(sender.tab.id, message.index, message.maxIndex);
			}
		}
		if (message.method.endsWith(".processEnd")) {
			onEnd(sender.tab.id);
		}
		if (message.method.endsWith(".processCancelled")) {
			onCancelled(sender.tab);
		}
		return Promise.resolve({});
	}

	function onStart(tabId, step) {
		let state;
		state = step == INJECT_SCRIPTS_STEP ? getButtonState("inject") : getButtonState("execute");
		state.setTitle = { title: BUTTON_INITIALIZING_TOOLTIP_MESSAGE + " (" + step + "/2)" };
		refresh(tabId, state);
	}

	function onEnd(tabId) {
		refresh(tabId, getButtonState("end"));
	}

	function onForbiddenDomain(tab) {
		refresh(tab.id, getButtonState("forbidden"));
	}

	function onCancelled(tab) {
		refreshTab(tab);
	}

	function onSaveProgress(tabId, index, maxIndex) {
		onProgress(tabId, index, maxIndex, BUTTON_SAVE_PROGRESS_TOOLTIP_MESSAGE);
	}

	function onUploadProgress(tabId, index, maxIndex) {
		onProgress(tabId, index, maxIndex, BUTTON_UPLOAD_PROGRESS_TOOLTIP_MESSAGE);
	}

	function onProgress(tabId, index, maxIndex, tooltipMessage) {
		const progress = Math.max(Math.min(20, Math.floor((index / maxIndex) * 20)), 0);
		const state = getButtonState("progress");
		state.setTitle = { title: tooltipMessage + (progress * 5) + "%" };
		refresh(tabId, state);
	}

	async function refreshTab(tab) {
		const state = getButtonState("default");
		await refresh(tab.id, state);
	}

	async function refresh(tabId, state) {
		const tabsData = screenbreak.extension.core.bg.tabsData.getTemporary(tabId);
		if (state) {
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
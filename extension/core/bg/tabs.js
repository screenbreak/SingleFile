/* global browser, screenbreak, setTimeout */

screenbreak.extension.core.bg.tabs = (() => {

	const DELAY_MAYBE_INIT = 1500;
	let pendingAuthInfo;

	browser.tabs.onRemoved.addListener(tabId => screenbreak.extension.core.bg.business.onTabRemoved(tabId));
	browser.tabs.onUpdated.addListener((tabId, changeInfo) => onTabUpdated(tabId, changeInfo));
	return {
		onMessage,
		get: async options => {
			const tabs = await browser.tabs.query(options);
			return tabs.sort((tab1, tab2) => tab1.index - tab2.index);
		},
		sendMessage: (tabId, message, options) => browser.tabs.sendMessage(tabId, message, options),
		launchWebAuthFlow: async (pageTabId, url) => {
			const tab = await browser.tabs.create({ url, active: true });
			return new Promise((resolve, reject) => {
				pendingAuthInfo = { pageTabId, tabId: tab.id, resolve };
				browser.tabs.onRemoved.addListener(onTabRemoved);
				function onTabRemoved(tabId) {
					if (tabId == tab.id) {
						browser.tabs.onRemoved.removeListener(onTabRemoved);
						if (pendingAuthInfo) {
							pendingAuthInfo = null;
							reject(new Error("Forbidden"));
						}
					}
				}
			});
		}
	};

	async function onMessage(message, sender) {
		if (message.method.endsWith(".init")) {
			screenbreak.extension.core.bg.business.onInit(sender.tab);
		}
		if (message.method.endsWith(".loggedIn")) {
			const tabId = sender.tab.id;
			if (pendingAuthInfo && tabId == pendingAuthInfo.tabId) {
				await browser.tabs.update(pendingAuthInfo.pageTabId, { highlighted: true });
				pendingAuthInfo.resolve();
				pendingAuthInfo = null;
				await browser.tabs.remove(tabId);
			}
		}
	}

	function onTabUpdated(tabId, changeInfo) {
		if (changeInfo.status == "complete") {
			setTimeout(async () => {
				try {
					await browser.tabs.sendMessage(tabId, { method: "content.maybeInit" });
				}
				catch (error) {
					// ignored
				}
			}, DELAY_MAYBE_INIT);
		}
	}

})();
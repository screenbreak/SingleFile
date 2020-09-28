/* global browser, screenbreak, setTimeout */

screenbreak.extension.core.bg.tabs = (() => {

	const DELAY_MAYBE_INIT = 1500;

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
			try {
				await browser.tabs.sendMessage(pageTabId, { method: "downloads.authenticating" });
			}
			catch (error) {
				// ignored
			}
			return browser.tabs.create({ url, active: true });
		}
	};

	async function onMessage(message, sender) {
		if (message.method.endsWith(".init")) {
			screenbreak.extension.core.bg.business.onInit(sender.tab);
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
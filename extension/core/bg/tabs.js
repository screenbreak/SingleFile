/* global browser, screenbreak, setTimeout */

screenbreak.extension.core.bg.tabs = (() => {

	const DELAY_MAYBE_INIT = 1500;
	let pendingAuthInfo;

	browser.tabs.onCreated.addListener(tab => onTabCreated(tab));
	browser.tabs.onActivated.addListener(activeInfo => onTabActivated(activeInfo));
	browser.tabs.onRemoved.addListener(tabId => onTabRemoved(tabId));
	browser.tabs.onUpdated.addListener((tabId, changeInfo) => onTabUpdated(tabId, changeInfo));
	return {
		onMessage,
		get: async options => {
			const tabs = await browser.tabs.query(options);
			return tabs.sort((tab1, tab2) => tab1.index - tab2.index);
		},
		create: createProperties => browser.tabs.create(createProperties),
		createAndWait: async createProperties => {
			const tab = await browser.tabs.create(createProperties);
			return new Promise((resolve, reject) => {
				browser.tabs.onUpdated.addListener(onTabUpdated);
				browser.tabs.onRemoved.addListener(onTabRemoved);
				function onTabUpdated(tabId, changeInfo) {
					if (tabId == tab.id && changeInfo.status == "complete") {
						resolve(tab);
						browser.tabs.onUpdated.removeListener(onTabUpdated);
						browser.tabs.onRemoved.removeListener(onTabRemoved);
					}
				}
				function onTabRemoved(tabId) {
					if (tabId == tab.id) {
						reject(tabId);
						browser.tabs.onRemoved.removeListener(onTabRemoved);
					}
				}
			});
		},
		sendMessage: (tabId, message, options) => browser.tabs.sendMessage(tabId, message, options),
		launchWebAuthFlow: async url => {
			const tab = await browser.tabs.create({ url, active: true });
			return new Promise((resolve, reject) => {
				pendingAuthInfo = { tabId: tab.id, resolve };
				browser.tabs.onRemoved.addListener(onTabRemoved);
				function onTabRemoved(tabId) {
					if (pendingAuthInfo && tabId == tab.id) {
						pendingAuthInfo = null;
						browser.tabs.onRemoved.removeListener(onTabRemoved);
						reject(new Error("Forbidden"));
					}
				}
			});
		}
	};

	async function onMessage(message, sender) {
		if (message.method.endsWith(".init")) {
			await onInit(sender.tab, message);
			screenbreak.extension.ui.bg.main.onInit(sender.tab);
			screenbreak.extension.core.bg.business.onInit(sender.tab);
		}
		if (message.method.endsWith(".getOptions")) {
			return screenbreak.extension.core.bg.config.getOptions(message.url);
		}
		if (message.method.endsWith(".loggedIn")) {
			const tabId = sender.tab.id;
			if (pendingAuthInfo && tabId == pendingAuthInfo.tabId) {
				pendingAuthInfo.resolve();
				pendingAuthInfo = null;
				browser.tabs.remove(tabId);
			}
		}
	}

	async function onInit(tab, options) {
		await screenbreak.extension.core.bg.tabsData.remove(tab.id);
		const tabsData = await screenbreak.extension.core.bg.tabsData.get(tab.id);
		tabsData[tab.id].savedPageDetected = options.savedPageDetected;
		await screenbreak.extension.core.bg.tabsData.set(tabsData);
	}

	async function onTabUpdated(tabId, changeInfo) {
		if (changeInfo.status == "complete") {
			setTimeout(() => browser.tabs.sendMessage(tabId, { method: "content.maybeInit" }), DELAY_MAYBE_INIT);
		}
	}

	function onTabCreated(tab) {
		screenbreak.extension.ui.bg.main.onTabCreated(tab);
	}

	async function onTabActivated(activeInfo) {
		const tab = await browser.tabs.get(activeInfo.tabId);
		screenbreak.extension.ui.bg.main.onTabActivated(tab);
	}

	function onTabRemoved(tabId) {
		screenbreak.extension.core.bg.tabsData.remove(tabId);
		screenbreak.extension.core.bg.business.onTabRemoved(tabId);
	}

})();
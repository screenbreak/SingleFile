/* global browser, screenbreak, setTimeout */

screenbreak.extension.core.bg.tabsData = (() => {

	let persistentData, temporaryData, cleanedUp;
	setTimeout(() => getPersistent().then(tabsData => persistentData = tabsData), 0);
	return {
		onMessage,
		getTemporary,
		get: getPersistent,
		set: setPersistent,
		remove
	};

	function onMessage(message) {
		if (message.method.endsWith(".get")) {
			return getPersistent();
		}
		if (message.method.endsWith(".set")) {
			return setPersistent(message.tabsData);
		}
	}

	async function remove(tabId) {
		if (temporaryData) {
			delete temporaryData[tabId];
		}
	}

	function getTemporary(desiredTabId) {
		if (!temporaryData) {
			temporaryData = {};
		}
		if (desiredTabId !== undefined && !temporaryData[desiredTabId]) {
			temporaryData[desiredTabId] = {};
		}
		return temporaryData;
	}

	async function getPersistent(desiredTabId) {
		if (!persistentData) {
			const config = await browser.storage.local.get();
			persistentData = config.tabsData || {};
		}
		cleanup();
		if (desiredTabId !== undefined && !persistentData[desiredTabId]) {
			persistentData[desiredTabId] = {};
		}
		return persistentData;
	}

	async function setPersistent(tabsData) {
		persistentData = tabsData;
		await browser.storage.local.set({ tabsData });
	}

	async function cleanup() {
		if (!cleanedUp && screenbreak.extension.core.bg.tabs) {
			cleanedUp = true;
			const allTabs = await screenbreak.extension.core.bg.tabs.get({ currentWindow: true, highlighted: true });
			Object.keys(persistentData).filter(key => {
				return !allTabs.find(tab => tab.id == key);
			}).forEach(tabId => delete persistentData[tabId]);
			await browser.storage.local.set({ tabsData: persistentData });
		}
	}

})();
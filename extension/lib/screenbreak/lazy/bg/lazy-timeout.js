/* global browser, setTimeout, clearTimeout */

(() => {

	"use strict";

	const timeouts = new Map();

	browser.runtime.onMessage.addListener((message, sender) => {
		if (message.method == "singlefile.lazyTimeout.setTimeout") {
			let tabTimeouts = timeouts.get(sender.tab.id);
			if (tabTimeouts) {
				const previousTimeoutId = tabTimeouts.get(message.type);
				if (previousTimeoutId) {
					clearTimeout(previousTimeoutId);
				}
			}
			const timeoutId = setTimeout(async () => {
				try {
					const tabTimeouts = timeouts.get(sender.tab.id);
					if (tabTimeouts) {
						deleteTimeout(tabTimeouts, sender.tab.id, message.type);
					}
					await browser.tabs.sendMessage(sender.tab.id, { method: "singlefile.lazyTimeout.onTimeout", type: message.type });
				} catch (error) {
					// ignored
				}
			}, message.delay);
			if (!tabTimeouts) {
				tabTimeouts = new Map();
				timeouts.set(sender.tab.id, tabTimeouts);
			}
			tabTimeouts.set(message.type, timeoutId);
			return Promise.resolve({});
		}
		if (message.method == "singlefile.lazyTimeout.clearTimeout") {
			let tabTimeouts = timeouts.get(sender.tab.id);
			if (tabTimeouts) {
				const timeoutId = tabTimeouts.get(message.type);
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				deleteTimeout(tabTimeouts, sender.tab.id, message.type);
			}
			return Promise.resolve({});
		}
	});

	browser.tabs.onRemoved.addListener(tabId => timeouts.delete(tabId));

	function deleteTimeout(tabTimeouts, tabId, type) {
		tabTimeouts.delete(type);
		if (!tabTimeouts.size) {
			timeouts.delete(tabId);
		}
	}

})();
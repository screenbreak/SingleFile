/* global browser, setTimeout, clearTimeout */

(() => {

	"use strict";

	browser.runtime.onMessage.addListener((message, sender) => {
		if (message.method == "singlefile.lazyTimeout.setTimeout") {
			const timeoutId = setTimeout(async () => {
				try {
					await browser.tabs.sendMessage(sender.tab.id, { method: "singlefile.lazyTimeout.onTimeout", id: timeoutId });
				} catch (error) {
					// ignored
				}
			}, message.delay);
			return Promise.resolve(timeoutId);
		}
		if (message.method == "singlefile.lazyTimeout.clearTimeout") {
			clearTimeout(message.id);
			return Promise.resolve({ id: message.id });
		}
	});

})();
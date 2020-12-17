/* global browser, screenbreak */

const WELCOME_PAGE_URL = "https://app.myscreenbreak.com/extension/welcome/";

screenbreak.extension.ui.bg.main = (() => {

	browser.runtime.onInstalled.addListener(() => browser.tabs.create({
		url: WELCOME_PAGE_URL
	}));

	return {
		onMessage(message, sender) {
			return screenbreak.extension.ui.bg.button.onMessage(message, sender);
		},
		async refreshTab(tab) {
			return Promise.all([screenbreak.extension.ui.bg.button.refreshTab(tab)]);
		},
		onForbiddenDomain(tab) {
			screenbreak.extension.ui.bg.button.onForbiddenDomain(tab);
		},
		onUploadStart(tabId) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadProgress", progress: 0 });
		},
		onUploadProgress(tabId, progress) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadProgress", progress });
		},
		onError(tabId, error) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadError", error });
			screenbreak.extension.ui.bg.button.onCancelled(tabId);
		},
		onEnd(tabId, downloadURL) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadEnd", downloadURL });
		},
		onCancelled(tabId) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadCancelled" });
			screenbreak.extension.ui.bg.button.onCancelled(tabId);
		}
	};

})();
/* global screenbreak */

screenbreak.extension.ui.bg.main = (() => {

	return {
		onMessage(message, sender) {
			if (message.method.endsWith(".refreshMenu")) {
				return screenbreak.extension.ui.bg.menus.onMessage(message, sender);
			} else {
				return screenbreak.extension.ui.bg.button.onMessage(message, sender);
			}
		},
		async refreshTab(tab) {
			return Promise.all([screenbreak.extension.ui.bg.menus.refreshTab(tab), screenbreak.extension.ui.bg.button.refreshTab(tab)]);
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
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadError", error: error.message });
			screenbreak.extension.ui.bg.button.onCancelled(tabId);
		},
		onEnd(tabId) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadEnd" });
		},
		onCancelled(tabId) {
			screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "downloads.uploadCancelled" });
			screenbreak.extension.ui.bg.button.onCancelled(tabId);
		},
		onTabCreated(tab) {
			screenbreak.extension.ui.bg.menus.onTabCreated(tab);
		},
		onTabActivated(tab) {
			screenbreak.extension.ui.bg.menus.onTabActivated(tab);
		},
		onInit(tab) {
			screenbreak.extension.ui.bg.menus.onInit(tab);
		}
	};

})();
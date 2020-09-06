/* global browser, screenbreak, */

screenbreak.extension.core.bg.messages = (() => {

	browser.runtime.onMessage.addListener((message, sender) => {
		if (message.method.startsWith("tabs.")) {
			return screenbreak.extension.core.bg.tabs.onMessage(message, sender);
		}
		if (message.method.startsWith("downloads.")) {
			return screenbreak.extension.core.bg.downloads.onMessage(message, sender);
		}
		if (message.method.startsWith("ui.")) {
			return screenbreak.extension.ui.bg.main.onMessage(message, sender);
		}
		if (message.method.startsWith("tabsData.")) {
			return screenbreak.extension.core.bg.tabsData.onMessage(message, sender);
		}
	});
	return {};

})();
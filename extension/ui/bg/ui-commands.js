/* global browser, screenbreak */

screenbreak.extension.ui.bg.commands = (() => {

	const commands = browser.commands;
	const BROWSER_COMMANDS_API_SUPPORTED = commands && commands.onCommand && commands.onCommand.addListener;

	if (BROWSER_COMMANDS_API_SUPPORTED) {
		commands.onCommand.addListener(async command => {
			if (command == "save-tab") {
				const allTabs = await screenbreak.extension.core.bg.tabs.get({ currentWindow: true, active: true });
				allTabs.length = 1;
				screenbreak.extension.core.bg.business.saveTabs(allTabs);
			}
		});
	}

})();
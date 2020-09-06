/* global browser, screenbreak */

screenbreak.extension.ui.bg.menus = (() => {

	const menus = browser.menus || browser.contextMenus;
	const BROWSER_MENUS_API_SUPPORTED = menus && menus.onClicked && menus.create && menus.removeAll;
	const MENU_ID_SAVE_PAGE = "save-page";
	const MENU_SAVE_PAGE_MESSAGE = browser.i18n.getMessage("menuSavePage");

	initialize();
	return {};

	async function createMenus() {
		if (BROWSER_MENUS_API_SUPPORTED) {
			await menus.removeAll();
			menus.create({
				id: MENU_ID_SAVE_PAGE,
				contexts: ["page", "image", "video", "audio", "browser_action"],
				title: MENU_SAVE_PAGE_MESSAGE
			});
		}
	}

	async function initialize() {
		const business = screenbreak.extension.core.bg.business;
		if (BROWSER_MENUS_API_SUPPORTED) {
			createMenus();
			menus.onClicked.addListener(async (event, tab) => {
				if (event.menuItemId == MENU_ID_SAVE_PAGE) {
					business.saveTabs([tab]);
				}
			});
		}
	}

})();
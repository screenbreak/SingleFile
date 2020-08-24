/* global browser, screenbreak */

screenbreak.extension.ui.bg.menus = (() => {

	const menus = browser.menus || browser.contextMenus;
	const BROWSER_MENUS_API_SUPPORTED = menus && menus.onClicked && menus.create && menus.update && menus.removeAll;
	const MENU_ID_SAVE_PAGE = "save-page";
	const MENU_ID_SAVE_SELECTED = "save-selected";
	const MENU_ID_SAVE_FRAME = "save-frame";
	const MENU_SAVE_PAGE_MESSAGE = browser.i18n.getMessage("menuSavePage");
	const MENU_SAVE_SELECTION_MESSAGE = browser.i18n.getMessage("menuSaveSelection");
	const MENU_SAVE_FRAME_MESSAGE = browser.i18n.getMessage("menuSaveFrame");
	const MENU_TOP_VISIBLE_ENTRIES = [
		MENU_ID_SAVE_SELECTED,
		MENU_ID_SAVE_FRAME
	];

	let contextMenuVisibleState = true;
	let allMenuVisibleState = true;
	let menusCreated, pendingRefresh;
	initialize();
	return {
		onMessage,
		onTabCreated: refreshTab,
		onTabActivated: refreshTab,
		onInit: tab => refreshTab(tab),
		refreshTab: createMenus
	};

	function onMessage(message) {
		if (message.method.endsWith("refreshMenu")) {
			createMenus();
			return Promise.resolve({});
		}
	}

	async function createMenus(tab) {
		const config = screenbreak.extension.core.bg.config;
		const options = await config.getOptions(tab && tab.url);
		if (BROWSER_MENUS_API_SUPPORTED && options) {
			const pageContextsEnabled = ["page", "frame", "image", "link", "video", "audio", "selection"];
			const defaultContextsDisabled = [];
			defaultContextsDisabled.push("browser_action");
			await menus.removeAll();
			const defaultContextsEnabled = defaultContextsDisabled.concat(...pageContextsEnabled);
			const defaultContexts = options.contextMenuEnabled ? defaultContextsEnabled : defaultContextsDisabled;
			menus.create({
				id: MENU_ID_SAVE_PAGE,
				contexts: defaultContexts,
				title: MENU_SAVE_PAGE_MESSAGE
			});
			if (options.contextMenuEnabled) {
				menus.create({
					id: "separator-1",
					contexts: pageContextsEnabled,
					type: "separator"
				});
			}
			menus.create({
				id: MENU_ID_SAVE_SELECTED,
				contexts: defaultContexts,
				title: MENU_SAVE_SELECTION_MESSAGE
			});
			if (options.contextMenuEnabled) {
				menus.create({
					id: MENU_ID_SAVE_FRAME,
					contexts: ["frame"],
					title: MENU_SAVE_FRAME_MESSAGE
				});
			}
		}
		menusCreated = true;
		if (pendingRefresh) {
			pendingRefresh = false;
			(await screenbreak.extension.core.bg.tabs.get({})).forEach(async tab => await refreshTab(tab));
		}
	}

	async function initialize() {
		const business = screenbreak.extension.core.bg.business;
		const tabs = screenbreak.extension.core.bg.tabs;
		if (BROWSER_MENUS_API_SUPPORTED) {
			createMenus();
			menus.onClicked.addListener(async (event, tab) => {
				if (event.menuItemId == MENU_ID_SAVE_PAGE) {
					if (event.linkUrl) {
						business.saveUrls([event.linkUrl]);
					} else {
						business.saveTabs([tab]);
					}
				}
				if (event.menuItemId == MENU_ID_SAVE_SELECTED) {
					business.saveTabs([tab], { selected: true });
				}
				if (event.menuItemId == MENU_ID_SAVE_FRAME) {
					business.saveTabs([tab], { frameId: event.frameId });
				}
			});
			if (menusCreated) {
				pendingRefresh = true;
			} else {
				(await tabs.get({})).forEach(async tab => await refreshTab(tab));
			}
		}
	}

	async function refreshTab(tab) {
		const config = screenbreak.extension.core.bg.config;
		if (BROWSER_MENUS_API_SUPPORTED && menusCreated) {
			const promises = [];
			updateAllVisibleValues(true);
			if (tab && tab.url) {
				const options = await config.getOptions(tab.url);
				promises.push(updateVisibleValue(tab, options.contextMenuEnabled));
				promises.push(menus.update(MENU_ID_SAVE_SELECTED, { visible: true }));
			}
			await Promise.all(promises);
		}
	}

	async function updateAllVisibleValues(visible) {
		const lastVisibleState = allMenuVisibleState;
		allMenuVisibleState = visible;
		if (lastVisibleState === undefined || lastVisibleState != visible) {
			const promises = [];
			try {
				MENU_TOP_VISIBLE_ENTRIES.forEach(id => promises.push(menus.update(id, { visible })));
				await Promise.all(promises);
			} catch (error) {
				// ignored
			}
		}
	}

	async function updateVisibleValue(tab, visible) {
		const lastVisibleState = contextMenuVisibleState;
		contextMenuVisibleState = visible;
		if (lastVisibleState === undefined || lastVisibleState != visible) {
			await createMenus(tab);
		}
	}

})();
/* global browser, screenbreak, navigator */

screenbreak.extension.core.bg.config = (() => {

	const DEFAULT_PROFILE_NAME = "__Default_Settings__";

	const DEFAULT_CONFIG = {
		removeHiddenElements: true,
		removeUnusedStyles: true,
		removeUnusedFonts: true,
		removeFrames: false,
		removeImports: true,
		removeScripts: true,
		compressHTML: false,
		compressCSS: false,
		loadDeferredImages: true,
		loadDeferredImagesMaxIdleTime: 1500,
		contextMenuEnabled: true,
		tabMenuEnabled: true,
		browserActionMenuEnabled: true,
		maxResourceSizeEnabled: false,
		maxResourceSize: 10,
		removeAudioSrc: true,
		removeVideoSrc: true,
		removeAlternativeFonts: true,
		removeAlternativeMedias: true,
		removeAlternativeImages: true,
		groupDuplicateImages: true,
		resolveFragmentIdentifierURLs: false,
		saveFavicon: true
	};

	let configStorage;
	let pendingUpgradePromise = upgrade();
	return {
		DEFAULT_PROFILE_NAME,
		get: getConfig,
		getOptions,
		getProfiles,
		onMessage
	};

	async function upgrade() {
		const { sync } = await browser.storage.local.get();
		if (sync) {
			configStorage = browser.storage.sync;
		} else {
			configStorage = browser.storage.local;
		}
		const config = await configStorage.get();
		if (!config.profiles) {
			const defaultConfig = config;
			delete defaultConfig.tabsData;
			applyUpgrade(defaultConfig);
			const newConfig = { profiles: {} };
			newConfig.profiles[DEFAULT_PROFILE_NAME] = defaultConfig;
			configStorage.remove(Object.keys(DEFAULT_CONFIG));
			await configStorage.set(newConfig);
		} else {
			Object.keys(config.profiles).forEach(profileName => applyUpgrade(config.profiles[profileName]));
			await configStorage.remove(["profiles", "defaultProfile"]);
			await configStorage.set({ profiles: config.profiles });
		}
		if (!config.maxParallelWorkers) {
			await configStorage.set({ maxParallelWorkers: navigator.hardwareConcurrency || 4 });
		}
	}

	function applyUpgrade(config) {
		Object.keys(DEFAULT_CONFIG).forEach(configKey => upgradeConfig(config, configKey));
	}

	function upgradeConfig(config, key) {
		if (config[key] === undefined) {
			config[key] = DEFAULT_CONFIG[key];
		}
	}

	async function getConfig() {
		await pendingUpgradePromise;
		return configStorage.get(["profiles", "maxParallelWorkers"]);
	}

	async function onMessage(message) {
		if (message.method.endsWith(".resetProfiles")) {
			await resetProfiles();
		}
		if (message.method.endsWith(".updateProfile")) {
			await updateProfile(message.profileName, message.profile);
		}
		if (message.method.endsWith(".getConstants")) {
			return {
				DEFAULT_PROFILE_NAME
			};
		}
		if (message.method.endsWith(".getProfiles")) {
			return getProfiles();
		}
		if (message.method.endsWith(".enableSync")) {
			await browser.storage.local.set({ sync: true });
			const syncConfig = await browser.storage.sync.get();
			if (!syncConfig || !syncConfig.profiles) {
				const localConfig = await browser.storage.local.get();
				await browser.storage.sync.set({ profiles: localConfig.profiles, maxParallelWorkers: localConfig.maxParallelWorkers });
			}
			configStorage = browser.storage.sync;
			return {};
		}
		if (message.method.endsWith(".disableSync")) {
			await browser.storage.local.set({ sync: false });
			const syncConfig = await browser.storage.sync.get();
			if (syncConfig && syncConfig.profiles) {
				await browser.storage.local.set({ profiles: syncConfig.profiles, maxParallelWorkers: syncConfig.maxParallelWorkers });
			}
			configStorage = browser.storage.local;
		}
		if (message.method.endsWith(".isSync")) {
			return { sync: (await browser.storage.local.get()).sync };
		}
		return {};
	}

	async function getProfiles() {
		const config = await getConfig();
		return config.profiles;
	}

	async function getOptions() {
		const config = await getConfig();
		const tabProfileName = DEFAULT_PROFILE_NAME;
		return config.profiles[tabProfileName];
	}

	async function updateProfile(profileName, profile) {
		const config = await getConfig();
		if (!Object.keys(config.profiles).includes(profileName)) {
			throw new Error("Profile not found");
		}
		Object.keys(profile).forEach(key => config.profiles[profileName][key] = profile[key]);
		await configStorage.set({ profiles: config.profiles });
	}

	async function resetProfiles() {
		await pendingUpgradePromise;
		const tabsData = await screenbreak.extension.core.bg.tabsData.get();
		await screenbreak.extension.core.bg.tabsData.set(tabsData);
		await configStorage.remove(["profiles", "maxParallelWorkers"]);
		await browser.storage.local.set({ sync: false });
		configStorage = browser.storage.local;
		await upgrade();
	}

})();

/* global browser, window, document, location */

(async () => {

	const { DEFAULT_PROFILE_NAME } = await browser.runtime.sendMessage({ method: "config.getConstants" });
	const removeHiddenElementsLabel = document.getElementById("removeHiddenElementsLabel");
	const removeUnusedStylesLabel = document.getElementById("removeUnusedStylesLabel");
	const removeUnusedFontsLabel = document.getElementById("removeUnusedFontsLabel");
	const removeFramesLabel = document.getElementById("removeFramesLabel");
	const loadDeferredImagesLabel = document.getElementById("loadDeferredImagesLabel");
	const loadDeferredImagesMaxIdleTimeLabel = document.getElementById("loadDeferredImagesMaxIdleTimeLabel");
	const addMenuEntryLabel = document.getElementById("addMenuEntryLabel");
	const setMaxResourceSizeLabel = document.getElementById("setMaxResourceSizeLabel");
	const maxResourceSizeLabel = document.getElementById("maxResourceSizeLabel");
	const removeAudioLabel = document.getElementById("removeAudioLabel");
	const removeVideoLabel = document.getElementById("removeVideoLabel");
	const removeAlternativeFontsLabel = document.getElementById("removeAlternativeFontsLabel");
	const removeAlternativeImagesLabel = document.getElementById("removeAlternativeImagesLabel");
	const removeAlternativeMediasLabel = document.getElementById("removeAlternativeMediasLabel");
	const titleLabel = document.getElementById("titleLabel");
	const userInterfaceLabel = document.getElementById("userInterfaceLabel");
	const htmlContentLabel = document.getElementById("htmlContentLabel");
	const imagesLabel = document.getElementById("imagesLabel");
	const stylesheetsLabel = document.getElementById("stylesheetsLabel");
	const fontsLabel = document.getElementById("fontsLabel");
	const otherResourcesLabel = document.getElementById("otherResourcesLabel");
	const groupDuplicateImagesLabel = document.getElementById("groupDuplicateImagesLabel");
	const miscLabel = document.getElementById("miscLabel");
	const synchronizeLabel = document.getElementById("synchronizeLabel");
	const resetButton = document.getElementById("resetButton");
	const removeHiddenElementsInput = document.getElementById("removeHiddenElementsInput");
	const removeUnusedStylesInput = document.getElementById("removeUnusedStylesInput");
	const removeUnusedFontsInput = document.getElementById("removeUnusedFontsInput");
	const removeFramesInput = document.getElementById("removeFramesInput");
	const loadDeferredImagesInput = document.getElementById("loadDeferredImagesInput");
	const loadDeferredImagesMaxIdleTimeInput = document.getElementById("loadDeferredImagesMaxIdleTimeInput");
	const contextMenuEnabledInput = document.getElementById("contextMenuEnabledInput");
	const maxResourceSizeInput = document.getElementById("maxResourceSizeInput");
	const maxResourceSizeEnabledInput = document.getElementById("maxResourceSizeEnabledInput");
	const removeAudioSrcInput = document.getElementById("removeAudioSrcInput");
	const removeVideoSrcInput = document.getElementById("removeVideoSrcInput");
	const removeAlternativeFontsInput = document.getElementById("removeAlternativeFontsInput");
	const removeAlternativeImagesInput = document.getElementById("removeAlternativeImagesInput");
	const removeAlternativeMediasInput = document.getElementById("removeAlternativeMediasInput");
	const groupDuplicateImagesInput = document.getElementById("groupDuplicateImagesInput");
	const expandAllButton = document.getElementById("expandAllButton");
	const synchronizeInput = document.getElementById("synchronizeInput");
	const resetAllButton = document.getElementById("resetAllButton");
	const resetCancelButton = document.getElementById("resetCancelButton");
	const confirmButton = document.getElementById("confirmButton");
	const cancelButton = document.getElementById("cancelButton");
	const promptCancelButton = document.getElementById("promptCancelButton");
	const promptConfirmButton = document.getElementById("promptConfirmButton");

	let pendingSave = Promise.resolve();
	resetButton.addEventListener("click", async () => {
		const choice = await reset();
		if (choice) {
			if (choice == "all") {
				await browser.runtime.sendMessage({ method: "config.resetProfiles" });
				await refresh(DEFAULT_PROFILE_NAME);
				await refreshExternalComponents();
			}
			await update();
		}
	}, false);
	expandAllButton.addEventListener("click", () => {
		if (expandAllButton.className) {
			expandAllButton.className = "";
		} else {
			expandAllButton.className = "opened";
		}
		document.querySelectorAll("details").forEach(detailElement => detailElement.open = Boolean(expandAllButton.className));
	}, false);
	synchronizeInput.checked = (await browser.runtime.sendMessage({ method: "config.isSync" })).sync;
	synchronizeInput.addEventListener("click", async () => {
		if (synchronizeInput.checked) {
			await browser.runtime.sendMessage({ method: "config.enableSync" });
			await refresh(DEFAULT_PROFILE_NAME);
		} else {
			await browser.runtime.sendMessage({ method: "config.disableSync" });
			await refresh();
		}
	}, false);
	document.body.onchange = async event => {
		let target = event.target;
		await update();
		if (target == contextMenuEnabledInput) {
			await browser.runtime.sendMessage({ method: "ui.refreshMenu" });
		}
		await refresh();
	};
	removeHiddenElementsLabel.textContent = browser.i18n.getMessage("optionRemoveHiddenElements");
	removeUnusedStylesLabel.textContent = browser.i18n.getMessage("optionRemoveUnusedStyles");
	removeUnusedFontsLabel.textContent = browser.i18n.getMessage("optionRemoveUnusedFonts");
	removeFramesLabel.textContent = browser.i18n.getMessage("optionRemoveFrames");
	loadDeferredImagesLabel.textContent = browser.i18n.getMessage("optionLoadDeferredImages");
	loadDeferredImagesMaxIdleTimeLabel.textContent = browser.i18n.getMessage("optionLoadDeferredImagesMaxIdleTime");
	addMenuEntryLabel.textContent = browser.i18n.getMessage("optionAddMenuEntry");
	setMaxResourceSizeLabel.textContent = browser.i18n.getMessage("optionSetMaxResourceSize");
	maxResourceSizeLabel.textContent = browser.i18n.getMessage("optionMaxResourceSize");
	removeAudioLabel.textContent = browser.i18n.getMessage("optionRemoveAudio");
	removeVideoLabel.textContent = browser.i18n.getMessage("optionRemoveVideo");
	removeAlternativeFontsLabel.textContent = browser.i18n.getMessage("optionRemoveAlternativeFonts");
	removeAlternativeImagesLabel.textContent = browser.i18n.getMessage("optionRemoveAlternativeImages");
	removeAlternativeMediasLabel.textContent = browser.i18n.getMessage("optionRemoveAlternativeMedias");
	groupDuplicateImagesLabel.textContent = browser.i18n.getMessage("optionGroupDuplicateImages");
	titleLabel.textContent = browser.i18n.getMessage("optionsTitle");
	userInterfaceLabel.textContent = browser.i18n.getMessage("optionsUserInterfaceSubTitle");
	htmlContentLabel.textContent = browser.i18n.getMessage("optionsHTMLContentSubTitle");
	imagesLabel.textContent = browser.i18n.getMessage("optionsImagesSubTitle");
	stylesheetsLabel.textContent = browser.i18n.getMessage("optionsStylesheetsSubTitle");
	fontsLabel.textContent = browser.i18n.getMessage("optionsFontsSubTitle");
	otherResourcesLabel.textContent = browser.i18n.getMessage("optionsOtherResourcesSubTitle");
	miscLabel.textContent = browser.i18n.getMessage("optionsMiscSubTitle");
	resetButton.textContent = browser.i18n.getMessage("optionsResetButton");
	resetButton.title = browser.i18n.getMessage("optionsResetTooltip");
	synchronizeLabel.textContent = browser.i18n.getMessage("optionSynchronize");
	resetAllButton.textContent = browser.i18n.getMessage("optionsResetAllButton");
	resetCancelButton.textContent = promptCancelButton.textContent = cancelButton.textContent = browser.i18n.getMessage("optionsCancelButton");
	confirmButton.textContent = promptConfirmButton.textContent = browser.i18n.getMessage("optionsOKButton");
	document.getElementById("resetConfirmLabel").textContent = browser.i18n.getMessage("optionsResetConfirm");
	if (location.href.endsWith("#")) {
		document.querySelector(".new-window-link").remove();
		document.documentElement.classList.add("maximized");
	}
	refresh(DEFAULT_PROFILE_NAME);

	async function refresh() {
		const profiles = await browser.runtime.sendMessage({ method: "config.getProfiles" });
		const selectedProfileName = DEFAULT_PROFILE_NAME;
		const profileOptions = profiles[selectedProfileName];
		removeHiddenElementsInput.checked = profileOptions.removeHiddenElements;
		removeUnusedStylesInput.checked = profileOptions.removeUnusedStyles;
		removeUnusedFontsInput.checked = profileOptions.removeUnusedFonts;
		removeFramesInput.checked = profileOptions.removeFrames;
		loadDeferredImagesInput.checked = profileOptions.loadDeferredImages;
		loadDeferredImagesMaxIdleTimeInput.value = profileOptions.loadDeferredImagesMaxIdleTime;
		loadDeferredImagesMaxIdleTimeInput.disabled = !profileOptions.loadDeferredImages;
		contextMenuEnabledInput.checked = profileOptions.contextMenuEnabled;
		maxResourceSizeEnabledInput.checked = profileOptions.maxResourceSizeEnabled;
		maxResourceSizeInput.value = profileOptions.maxResourceSize;
		maxResourceSizeInput.disabled = !profileOptions.maxResourceSizeEnabled;
		removeAudioSrcInput.checked = profileOptions.removeAudioSrc;
		removeVideoSrcInput.checked = profileOptions.removeVideoSrc;
		removeAlternativeFontsInput.checked = profileOptions.removeAlternativeFonts;
		removeAlternativeImagesInput.checked = profileOptions.removeAlternativeImages;
		groupDuplicateImagesInput.checked = profileOptions.groupDuplicateImages;
		removeAlternativeMediasInput.checked = profileOptions.removeAlternativeMedias;
	}

	async function update() {
		await pendingSave;
		pendingSave = browser.runtime.sendMessage({
			method: "config.updateProfile",
			profile: {
				removeHiddenElements: removeHiddenElementsInput.checked,
				removeUnusedStyles: removeUnusedStylesInput.checked,
				removeUnusedFonts: removeUnusedFontsInput.checked,
				removeFrames: removeFramesInput.checked,				
				loadDeferredImages: loadDeferredImagesInput.checked,
				loadDeferredImagesMaxIdleTime: Math.max(loadDeferredImagesMaxIdleTimeInput.value, 0),
				contextMenuEnabled: contextMenuEnabledInput.checked,
				maxResourceSizeEnabled: maxResourceSizeEnabledInput.checked,
				maxResourceSize: Math.max(maxResourceSizeInput.value, 0),
				removeAudioSrc: removeAudioSrcInput.checked,
				removeVideoSrc: removeVideoSrcInput.checked,
				removeAlternativeFonts: removeAlternativeFontsInput.checked,
				removeAlternativeImages: removeAlternativeImagesInput.checked,
				removeAlternativeMedias: removeAlternativeMediasInput.checked,
				groupDuplicateImages: groupDuplicateImagesInput.checked
			}
		});
		await pendingSave;
	}

	async function refreshExternalComponents() {
		try {
			await browser.runtime.sendMessage({ method: "ui.refreshMenu" });
		} catch (error) {
			// ignored
		}
	}

	async function reset() {
		document.getElementById("formResetContainer").style.setProperty("display", "flex");
		resetCancelButton.focus();
		document.body.style.setProperty("overflow-y", "hidden");
		return new Promise(resolve => {
			resetAllButton.onclick = event => hideAndResolve(event, "all");
			resetCancelButton.onclick = event => hideAndResolve(event);
			window.onkeyup = event => {
				if (event.key == "Escape") {
					hideAndResolve(event);
				}
			};

			function hideAndResolve(event, value) {
				event.preventDefault();
				document.getElementById("formResetContainer").style.setProperty("display", "none");
				document.body.style.setProperty("overflow-y", "");
				resolve(value);
			}
		});
	}

})();

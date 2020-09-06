/* global screenbreak, navigator */

screenbreak.extension.core.bg.config = (() => {

	const DEFAULT_CONFIG = {
		maxParallelWorkers: navigator.hardwareConcurrency || 4,
		removeHiddenElements: true,
		removeUnusedStyles: true,
		removeUnusedFonts: true,
		removeFrames: false,
		removeImports: true,
		removeScripts: true,
		compressHTML: false,
		compressCSS: false,
		loadDeferredImages: true,
		loadDeferredImagesMaxIdleTime: 1000,
		maxResourceSizeEnabled: false,
		maxResourceSize: 10,
		removeAudioSrc: true,
		removeVideoSrc: true,
		removeAlternativeFonts: true,
		removeAlternativeMedias: true,
		removeAlternativeImages: true,
		groupDuplicateImages: true,
		resolveFragmentIdentifierURLs: false,
		saveFavicon: true,
		gzip: false
	};

	return {
		get: () => DEFAULT_CONFIG,
	};

})();

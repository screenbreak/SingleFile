/* global browser, document, getComputedStyle */

this.screenbreak.extension.ui.content.main = this.screenbreak.extension.ui.content.main || (() => {

	const LOADING_PAGE_URL = "/extension/ui/overlay/loading.html";
	const ERROR_PAGE_URL = "/extension/ui/overlay/error.html";
	const SUCCESS_PAGE_URL = "/extension/ui/overlay/success.html";

	const SINGLE_FILE_UI_ELEMENT_CLASS = "single-file-ui-element";
	const OVERLAY_TAGNAME = "screenbreak-overlay";

	const initializationTitleLabel = browser.i18n.getMessage("overlayInitializationTitle");
	const overlaySuccessTitleLabel = browser.i18n.getMessage("overlaySuccessTitle");
	const savingTitleLabel = browser.i18n.getMessage("overlaySavingTitle");
	const savingDetailsLabel = browser.i18n.getMessage("overlaySavingDetails");
	const authenticatingTitleLabel = browser.i18n.getMessage("overlayAuthenticatingTitle");
	const uploadingTitleLabel = browser.i18n.getMessage("overlayUploadingTitle");
	const uploadingDetailsLabel = browser.i18n.getMessage("overlayUploadingDetails");
	const cancelButtonLabel = browser.i18n.getMessage("overlayCancelButton");
	const closeButtonLabel = browser.i18n.getMessage("overlayCloseButton");
	const downloadButtonLabel = browser.i18n.getMessage("overlayDownloadButton");
	const linkLabel = browser.i18n.getMessage("overlayLink");

	let overlayIframeElement, overlayElement;
	const allProperties = new Set();
	Array.from(getComputedStyle(document.body)).forEach(property => allProperties.add(property));

	return {
		onStartPage() {
			createOverlayElement();
		},
		onError(error) {
			overlayIframeElement.src = browser.runtime.getURL(ERROR_PAGE_URL) + "?" + JSON.stringify({ error, closeButtonLabel });
		},
		onAuthenticating() {
			overlayIframeElement.contentWindow.postMessage(JSON.stringify({
				method: "screenbreak.authenticating",
				titleLabel: authenticatingTitleLabel
			}), "*");
		},
		onUploadProgress(index, maxIndex) {
			overlayIframeElement.contentWindow.postMessage(JSON.stringify({
				method: "screenbreak.uploadProgress",
				index,
				maxIndex,
				titleLabel: uploadingTitleLabel,
				detailsLabel: uploadingDetailsLabel
			}), "*");
		},
		onUploadEnd(downloadURL) {
			overlayIframeElement.src = browser.runtime.getURL(SUCCESS_PAGE_URL) + "?" + JSON.stringify({ titleLabel: overlaySuccessTitleLabel, downloadButtonLabel, linkLabel, downloadURL });
		},
		onLoadResource(index, maxIndex) {
			overlayIframeElement.contentWindow.postMessage(JSON.stringify({
				method: "screenbreak.saveProgress",
				index,
				maxIndex,
				titleLabel: savingTitleLabel,
				detailsLabel: savingDetailsLabel
			}), "*");
		},
		onCancelled() {
			overlayElement.remove();
		}
	};

	function createOverlayElement() {
		overlayElement = document.createElement(OVERLAY_TAGNAME);
		overlayElement.className = SINGLE_FILE_UI_ELEMENT_CLASS;
		initStyle(overlayElement);
		overlayElement.style.setProperty("position", "fixed", "important");
		overlayElement.style.setProperty("z-index", 2147483647, "important");
		overlayElement.style.setProperty("background-color", "transparent", "important");
		overlayElement.style.setProperty("top", "50%", "important");
		overlayElement.style.setProperty("left", "50%", "important");
		overlayElement.style.setProperty("margin-right", "-50%;", "important");
		overlayElement.style.setProperty("transform", "translate(-50%, -50%)", "important");
		overlayElement.style.setProperty("width", "100%", "important");
		overlayElement.style.setProperty("height", "100%", "important");
		overlayElement.style.setProperty("overflow", "hidden", "important");
		overlayIframeElement = document.createElement("iframe");
		initStyle(overlayIframeElement);
		overlayIframeElement.style.setProperty("width", "100%", "important");
		overlayIframeElement.style.setProperty("height", "100%", "important");
		overlayIframeElement.style.setProperty("background-color", "transparent", "important");
		overlayIframeElement.style.setProperty("overflow", "hidden", "important");
		overlayIframeElement.sandbox = "allow-scripts allow-popups allow-popups-to-escape-sandbox";
		const shadowRoot = overlayElement.attachShadow({ mode: "closed" });
		shadowRoot.appendChild(overlayIframeElement);
		overlayIframeElement.src = browser.runtime.getURL(LOADING_PAGE_URL) + "?" + JSON.stringify({ defaultTitle: initializationTitleLabel, defaultDetails: savingDetailsLabel, cancelButtonLabel });
		document.body.appendChild(overlayElement);
	}

	function initStyle(element) {
		allProperties.forEach(property => element.style.setProperty(property, "initial", "important"));
	}

})();

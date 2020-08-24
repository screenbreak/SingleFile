/* global window, document, location */

(() => {

	const labelElement = document.querySelector(".title");
	const progressBarElement = document.querySelector(".progress_bar");
	const progressLabelElement = document.querySelector(".progress_text");
	const cancelButton = document.querySelector(".cancel");

	const data = JSON.parse(decodeURIComponent(location.search.substring(1)));
	cancelButton.textContent = data.cancelButtonLabel;
	refreshStatus(data.defaultDetails, data.defaultTitle);

	window.onmessage = event => {
		const message = JSON.parse(event.data);
		if (message.method == "screenbreak.saveProgress") {
			const progressLabel = message.titleLabel + " " + Math.min(Math.floor(100 * message.index / message.maxIndex || 1), 100) + "% …";
			refreshStatus(message.detailsLabel, progressLabel, message.index, message.maxIndex);
		}
		if (message.method == "screenbreak.uploadProgress") {
			const progressLabel = message.titleLabel + " " + Math.min(Math.floor(100 * message.index / message.maxIndex || 1), 100) + "% …";
			refreshStatus(message.detailsLabel, progressLabel, message.index, message.maxIndex);
		}
	};

	cancelButton.onclick = event => {
		window.parent.postMessage(JSON.stringify({ method: "screenbreak.cancel" }), "*");
		event.preventDefault();
	};

	function refreshStatus(label, progressLabel, progressIndex, progressMax) {
		progressBarElement.value = progressIndex || 0;
		progressBarElement.max = progressMax || 1;
		labelElement.textContent = label;
		progressLabelElement.textContent = progressLabel;
	}

})();
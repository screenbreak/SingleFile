/* global window, document */

(() => {

	const labelElement = document.querySelector(".title");
	const progressBarElement = document.querySelector(".progress_bar");
	const progressLabelElement = document.querySelector(".progress_text");

	refreshStatus("Saving the article", "Initialization…");

	window.onmessage = event => {
		const message = JSON.parse(event.data);
		if (message.method == "screenbreak.saveProgress") {
			const progressLabel = "Saving " + Math.min(Math.floor(100 * message.index / message.maxIndex || 1), 100) + "% …";
			refreshStatus("Saving the article", progressLabel, message.index, message.maxIndex);
		}
		if (message.method == "screenbreak.uploadProgress") {
			const progressLabel = "Uploading " + Math.min(Math.floor(100 * message.index / message.maxIndex || 1), 100) + "% …";
			refreshStatus("Uploading the article", progressLabel, message.index, message.maxIndex);
		}
	};

	document.querySelector(".cancel").onclick = event => {
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
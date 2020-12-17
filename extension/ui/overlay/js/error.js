/* global document, location */

(() => {

	const labelElement = document.querySelector(".title");
	const errorLabelElement = document.querySelector(".text");
	const subscribeButton = document.querySelector(".subscribe");
	const closeButton = document.querySelector(".cancel");

	const data = JSON.parse(decodeURIComponent(location.search.substring(1)));
	closeButton.textContent = data.closeButtonLabel;
	refreshStatus(data.error);

	function refreshStatus(error) {
		labelElement.textContent = error.title;
		errorLabelElement.textContent = error.message;
		if (error.actionLabel && error.actionURL) {
			subscribeButton.classList.remove("hidden");
			subscribeButton.textContent = error.actionLabel;
			subscribeButton.href = error.actionURL;
		}
	}

})();
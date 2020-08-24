/* global document, location */

(() => {

	const labelElement = document.querySelector(".title");
	const errorLabelElement = document.querySelector(".text");
	const closeButton = document.querySelector(".cancel");

	const data = JSON.parse(decodeURIComponent(location.search.substring(1)));
	closeButton.textContent = data.closeButtonLabel;
	refreshStatus(data.error, data.details);

	function refreshStatus(label, errorLabel) {
		labelElement.textContent = label;
		errorLabelElement.textContent = errorLabel;
	}

})();
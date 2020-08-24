/* global window, document, location */

(() => {

	const labelElement = document.querySelector(".title");
	const errorLabelElement = document.querySelector(".text");

	const data = JSON.parse(decodeURIComponent(location.search.substring(1)));
	refreshStatus(data.error, data.details);

	document.querySelector(".cancel").onclick = event => {
		window.parent.postMessage(JSON.stringify({ method: "screenbreak.cancel" }), "*");
		event.preventDefault();
	};

	function refreshStatus(label, errorLabel) {
		labelElement.textContent = label;
		errorLabelElement.textContent = errorLabel;
	}

})();
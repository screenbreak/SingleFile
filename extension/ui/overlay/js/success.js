/* global document, location */

(() => {

	const labelElement = document.querySelector(".title");
	const downloadElement = document.querySelector(".download");
	const linkElement = document.querySelector(".goTo");

	const data = JSON.parse(decodeURIComponent(location.search.substring(1)));
	labelElement.textContent = data.titleLabel;
	downloadElement.textContent = data.downloadButtonLabel;
	linkElement.textContent = data.linkLabel;
	downloadElement.href = data.downloadURL;

})();
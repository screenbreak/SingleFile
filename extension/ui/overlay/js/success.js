/* global document, location */

(() => {

	const labelElement = document.querySelector(".title");

	const data = JSON.parse(decodeURIComponent(location.search.substring(1)));
	labelElement.textContent = data.titleLabel;

})();
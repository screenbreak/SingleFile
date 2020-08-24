/* global window, document */

(() => {

	document.onclick = event => {
		if (!event.target.closest(".box") || event.target.className == "cancel") {
			window.parent.postMessage(JSON.stringify({ method: "screenbreak.cancel" }), "*");
			event.preventDefault();
		}
	};

})();
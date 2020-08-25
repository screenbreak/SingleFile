/* global browser, document, location */

this.screenbreak.extension.core.content.bootstrap = this.screenbreak.extension.core.content.bootstrap || (() => {

	const SCREENBREAK_URL = "https://app.myscreenbreak.com/";

	const screenbreak = this.screenbreak;

	let previousLocationHref;
	document.addEventListener("DOMContentLoaded", init, false);
	return {};

	function init() {
		if (previousLocationHref != location.href && !screenbreak.extension.core.processing) {
			previousLocationHref = location.href;
			browser.runtime.sendMessage({ method: "tabs.init" });
			browser.runtime.sendMessage({ method: "ui.processInit" });
		}
		if (location.href.startsWith(SCREENBREAK_URL) && document.querySelector("a[href$=\"/logout/\"]")) {
			browser.runtime.sendMessage({ method: "tabs.loggedIn" });
		}
	}

})();
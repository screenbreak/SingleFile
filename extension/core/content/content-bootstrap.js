/* global browser, document, location */

this.screenbreak.extension.core.content.bootstrap = this.screenbreak.extension.core.content.bootstrap || (() => {

	const screenbreak = this.screenbreak;

	let previousLocationHref;
	document.addEventListener("DOMContentLoaded", init, false);
	browser.runtime.onMessage.addListener(message => {
		if (message.method == "content.maybeInit") {
			return onMessage(message);
		}
	});
	return {};

	async function onMessage(message) {
		if (message.method == "content.maybeInit") {
			init();
			return {};
		}
	}

	function init() {
		if (previousLocationHref != location.href && !screenbreak.extension.core.processing) {
			previousLocationHref = location.href;
			browser.runtime.sendMessage({ method: "tabs.init" });
			browser.runtime.sendMessage({ method: "ui.processInit" });
		}
	}

})();
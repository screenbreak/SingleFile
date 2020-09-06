/* global screenbreak */

screenbreak.extension.core.bg.tabsData = (() => {

	let temporaryData;

	return {
		getTemporary
	};

	function getTemporary(desiredTabId) {
		if (!temporaryData) {
			temporaryData = {};
		}
		if (desiredTabId !== undefined && !temporaryData[desiredTabId]) {
			temporaryData[desiredTabId] = {};
		}
		return temporaryData;
	}

})();
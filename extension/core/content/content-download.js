/* global browser */

this.screenbreak.extension.core.content.download = this.screenbreak.extension.core.content.download || (() => {

	const MAX_CONTENT_SIZE = 32 * (1024 * 1024);

	return { downloadPage };

	async function downloadPage(pageData, options) {
		for (let blockIndex = 0; blockIndex * MAX_CONTENT_SIZE < pageData.content.length; blockIndex++) {
			const message = {
				method: "downloads.download",
				taskId: options.taskId,
				compressHTML: options.compressHTML,
				url: options.url,
				title: pageData.title
			};
			message.truncated = pageData.content.length > MAX_CONTENT_SIZE;
			if (message.truncated) {
				message.finished = (blockIndex + 1) * MAX_CONTENT_SIZE > pageData.content.length;
				message.content = pageData.content.substring(blockIndex * MAX_CONTENT_SIZE, (blockIndex + 1) * MAX_CONTENT_SIZE);
			} else {
				message.content = pageData.content;
			}
			await browser.runtime.sendMessage(message);
		}
	}

})();
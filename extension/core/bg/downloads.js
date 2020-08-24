/* global screenbreak, Blob, URL */

screenbreak.extension.core.bg.downloads = (() => {

	const partialContents = new Map();
	const MIMETYPE_HTML = "text/html";

	return {
		onMessage
	};

	async function onMessage(message, sender) {
		if (message.method.endsWith(".download")) {
			return downloadTabPage(message, sender.tab);
		}
		if (message.method.endsWith(".end")) {
			screenbreak.extension.core.bg.business.onSaveEnd(message.taskId);
			return {};
		}
	}

	async function downloadTabPage(message, tab) {
		let contents;
		if (message.truncated) {
			contents = partialContents.get(tab.id);
			if (!contents) {
				contents = [];
				partialContents.set(tab.id, contents);
			}
			contents.push(message.content);
			if (message.finished) {
				partialContents.delete(tab.id);
			}
		} else if (message.content) {
			contents = [message.content];
		}
		if (!message.truncated || message.finished) {
			try {
				await screenbreak.extension.core.bg.api.saveArticle(tab.id, message.url, message.title, new Blob([contents], { type: MIMETYPE_HTML }), {
					onloadstart: () => {
						screenbreak.extension.ui.bg.main.onUploadStart(tab.id, 0);
					},
					onprogress: event => {
						if (event.total) {
							screenbreak.extension.ui.bg.main.onUploadProgress(tab.id, event.loaded / event.total);
						}
					},
					onabort: () => {
						screenbreak.extension.ui.bg.main.onError(tab.id, new Error("Upload aborted"));
					},
					onerror: () => {
						screenbreak.extension.ui.bg.main.onError(tab.id, new Error("Upload error"));
					},
					onload: () => {
						screenbreak.extension.ui.bg.main.onUploadProgress(tab.id, 1);
					},
					ontimeout: () => {
						screenbreak.extension.ui.bg.main.onError(tab.id, new Error("Timeout error"));
					}
				});
				screenbreak.extension.ui.bg.main.onEnd(tab.id);
			} catch (error) {
				console.error(error); // eslint-disable-line no-console
				screenbreak.extension.ui.bg.main.onError(tab.id, error);
			} finally {
				if (message.url) {
					URL.revokeObjectURL(message.url);
				}
			}
		}
		return {};
	}

})();

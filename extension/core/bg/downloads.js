/* global screenbreak, Blob, URL, pako */

screenbreak.extension.core.bg.downloads = (() => {

	const partialContents = new Map(), currentUploads = {};
	const MIMETYPE_HTML = "text/html";
	const MIMETYPE_GZIP = "application/gzip";
	const DEFAULT_ERROR_TITLE = "Upload error";

	class DownloadError extends Error {
		constructor(message) {
			super();
			this.message = message;
			this.title = DEFAULT_ERROR_TITLE;
		}
	}

	return {
		onMessage
	};

	async function onMessage(message, sender) {
		if (message.method.endsWith(".download")) {
			return downloadTabPage(message, sender.tab);
		}
		if (message.method.endsWith(".cancel")) {
			const tabId = sender.tab.id;
			screenbreak.extension.core.bg.business.cancelTab(tabId);
			if (currentUploads[tabId]) {
				currentUploads[tabId].cancel();
			}
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
				const eventHandlers = {
					onloadstart: () => {
						screenbreak.extension.ui.bg.main.onUploadStart(tab.id, 0);
					},
					onprogress: event => {
						if (event.total) {
							screenbreak.extension.ui.bg.main.onUploadProgress(tab.id, event.loaded / event.total);
						}
					},
					onabort: () => {
						screenbreak.extension.ui.bg.main.onError(tab.id, new DownloadError("Upload aborted"));
					},
					onerror: () => {
						screenbreak.extension.ui.bg.main.onError(tab.id, new DownloadError("Unknown error"));
					},
					onload: () => {
						screenbreak.extension.ui.bg.main.onUploadProgress(tab.id, 1);
					},
					ontimeout: () => {
						screenbreak.extension.ui.bg.main.onError(tab.id, new DownloadError("Timeout error"));
					}
				};
				const content = message.gzip ?
					new Blob([pako.gzip(contents.join(""))], { type: MIMETYPE_GZIP }) :
					new Blob([contents], { type: MIMETYPE_HTML });
				const uploadTask = await screenbreak.extension.core.bg.api.saveArticle(tab.id, message.url, message.title, content, eventHandlers);
				currentUploads[tab.id] = uploadTask;
				const url = await uploadTask.promise;
				screenbreak.extension.ui.bg.main.onEnd(tab.id, url);
			} catch (error) {
				console.error(error); // eslint-disable-line no-console
				screenbreak.extension.ui.bg.main.onError(tab.id,
					error instanceof screenbreak.extension.core.bg.api.APIError ? error : new DownloadError(error.message));
			} finally {
				if (message.url) {
					URL.revokeObjectURL(message.url);
				}
				currentUploads[tab.id] = null;
				screenbreak.extension.core.bg.business.onSaveEnd();
			}
		}
		return {};
	}

})();

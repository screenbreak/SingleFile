/* global browser, document, window, location, setTimeout */

this.screenbreak.extension.core.content.main = this.screenbreak.extension.core.content.main || (() => {

	const screenbreak = this.screenbreak;
	const singlefile = this.singlefile;
	const MOZ_EXTENSION_PROTOCOL = "moz-extension:";

	let ui, processor;

	singlefile.lib.main.init({
		fetch: screenbreak.extension.lib.fetch.content.resources.fetch,
		frameFetch: screenbreak.extension.lib.fetch.content.resources.frameFetch
	});
	browser.runtime.onMessage.addListener(message => {
		if (message.method == "content.save" ||
			message.method == "content.cancelSave" ||
			message.method == "downloads.uploadProgress" ||
			message.method == "downloads.uploadEnd" ||
			message.method == "downloads.uploadCancelled" ||
			message.method == "downloads.uploadError") {
			return onMessage(message);
		}
	});
	window.addEventListener("message", event => {
		let message;
		try {
			message = JSON.parse(event.data);
		} catch (error) {
			// ignored
		}
		if (message && message.method == "screenbreak.cancel") {
			browser.runtime.sendMessage({ method: "downloads.cancel" });
			cancelSave();
		}

	}, false);
	return {};

	async function onMessage(message) {
		if (!ui) {
			ui = screenbreak.extension.ui.content.main;
		}
		if (!location.href.startsWith(MOZ_EXTENSION_PROTOCOL)) {
			if (message.method == "content.save") {
				await savePage(message);
				return {};
			}
			if (message.method == "content.cancelSave") {
				cancelSave();
				return {};
			}
			if (message.method == "downloads.uploadProgress") {
				ui.onUploadProgress(message.progress, 1);
				return {};
			}
			if (message.method == "downloads.uploadEnd") {
				ui.onUploadEnd(message.downloadURL);
				return {};
			}
			if (message.method == "downloads.uploadCancelled") {
				cancelSave();
				return {};
			}
			if (message.method == "downloads.uploadError") {
				ui.onError("Upload error", message.error);
				return {};
			}
		}
	}

	function cancelSave() {
		screenbreak.extension.core.processing = false;
		if (processor) {
			processor.cancel();
		}
		ui.onCancelled();
		browser.runtime.sendMessage({ method: "ui.processCancelled" });
	}

	async function savePage(message) {
		const options = message.options;
		if (!screenbreak.extension.core.processing) {
			screenbreak.extension.core.processing = true;
			try {
				const pageData = await processPage(options);
				if (pageData) {
					await screenbreak.extension.core.content.download.downloadPage(pageData, options);
				}
			} catch (error) {
				if (!processor.cancelled) {
					console.error(error); // eslint-disable-line no-console
					ui.onError("Save error", error.message);
				}
			}
			screenbreak.extension.core.processing = false;
		}
	}

	async function processPage(options) {
		const frames = singlefile.lib.processors.frameTree.content.frames;
		singlefile.lib.helper.initDoc(document);
		ui.onStartPage();
		processor = new singlefile.lib.SingleFile(options);
		const preInitializationPromises = [];
		options.insertSingleFileComment = true;
		options.insertCanonicalLink = true;
		if (!options.removeFrames && frames && window.frames && window.frames.length) {
			let frameTreePromise;
			if (options.loadDeferredImages) {
				frameTreePromise = new Promise(resolve => setTimeout(() => resolve(frames.getAsync(options)), options.loadDeferredImagesMaxIdleTime - frames.TIMEOUT_INIT_REQUEST_MESSAGE));
			} else {
				frameTreePromise = frames.getAsync(options);
			}
			preInitializationPromises.push(frameTreePromise);
		}
		if (options.loadDeferredImages) {
			const lazyLoadPromise = singlefile.lib.processors.lazy.content.loader.process(options);
			preInitializationPromises.push(lazyLoadPromise);
		}
		let index = 0, maxIndex = 0;
		options.onprogress = event => {
			if (!processor.cancelled) {
				if (event.type == event.RESOURCES_INITIALIZED) {
					maxIndex = event.detail.max;
				}
				if (event.type == event.RESOURCES_INITIALIZED || event.type == event.RESOURCE_LOADED) {
					if (event.type == event.RESOURCE_LOADED) {
						index++;
					}
					ui.onLoadResource(index, maxIndex, options);
				}
			}
		};
		[options.frames] = await new Promise(resolve => {
			const preInitializationAllPromises = Promise.all(preInitializationPromises);
			const cancelProcessor = processor.cancel.bind(processor);
			processor.cancel = function () {
				cancelProcessor();
				resolve([[]]);
			};
			preInitializationAllPromises.then(() => resolve(preInitializationAllPromises));

		});
		options.win = window;
		options.doc = document;
		if (!processor.cancelled) {
			await processor.run();
		}
		if (!options.removeFrames && frames) {
			frames.cleanup(options);
		}
		let page;
		if (!processor.cancelled) {
			page = await processor.getPageData();
		}
		return page;
	}

})();
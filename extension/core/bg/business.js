/* global screenbreak */

screenbreak.extension.core.bg.business = (() => {

	const ERROR_CONNECTION_ERROR_CHROMIUM = "Could not establish connection. Receiving end does not exist.";
	const ERROR_CONNECTION_LOST_CHROMIUM = "The message port closed before a response was received.";
	const ERROR_CONNECTION_LOST_GECKO = "Message manager disconnected";

	const extensionScriptFiles = [
		"extension/index.js",
		"extension/lib/screenbreak/index.js",
		"extension/core/index.js",
		"extension/ui/index.js",
		"extension/core/content/content-main.js",
		"extension/core/content/content-download.js",
		"extension/ui/content/content-ui-main.js"
	];

	const tasks = [];
	let currentTaskId = 0, maxParallelWorkers;

	return {
		isSavingTab: tab => Boolean(tasks.find(taskInfo => taskInfo.tab.id == tab.id)),
		saveTabs,
		saveUrls,
		cancelTab,
		onSaveEnd: taskId => {
			const taskInfo = tasks.find(taskInfo => taskInfo.id == taskId);
			if (taskInfo) {
				taskInfo.resolve();
			}
		},
		onInit: tab => cancelTab(tab.id),
		onTabRemoved: cancelTab
	};

	async function saveUrls(urls, options = {}) {
		await initMaxParallelWorkers();
		await Promise.all(urls.map(async url => {
			const tabOptions = await screenbreak.extension.core.bg.config.getOptions(url);
			Object.keys(options).forEach(key => tabOptions[key] = options[key]);
			tabOptions.extensionScriptFiles = extensionScriptFiles;
			tasks.push({ id: currentTaskId, status: "pending", tab: { url }, options: tabOptions, method: "content.save" });
			currentTaskId++;
		}));
		runTasks();
	}

	async function saveTabs(tabs, options = {}) {
		const config = screenbreak.extension.core.bg.config;
		const ui = screenbreak.extension.ui.bg.main;
		await initMaxParallelWorkers();
		await Promise.all(tabs.map(async tab => {
			const tabId = tab.id;
			const tabOptions = await config.getOptions(tab.url);
			Object.keys(options).forEach(key => tabOptions[key] = options[key]);
			tabOptions.tabId = tabId;
			tabOptions.tabIndex = tab.index;
			tabOptions.extensionScriptFiles = extensionScriptFiles;
			const scriptsInjected = await screenbreak.extension.injectScript(tabId, tabOptions);
			if (scriptsInjected) {
				tasks.push({ id: currentTaskId, status: "pending", tab, options: tabOptions, method: "content.save" });
				currentTaskId++;
			} else {
				ui.onForbiddenDomain(tab);
			}
		}));
		runTasks();
	}

	async function initMaxParallelWorkers() {
		if (!maxParallelWorkers) {
			maxParallelWorkers = (await screenbreak.extension.core.bg.config.get()).maxParallelWorkers;
		}
	}

	function runTasks() {
		const processingCount = tasks.filter(taskInfo => taskInfo.status == "processing").length;
		for (let index = 0; index < Math.min(tasks.length - processingCount, (maxParallelWorkers - processingCount)); index++) {
			const taskInfo = tasks.find(taskInfo => taskInfo.status == "pending");
			if (taskInfo) {
				runTask(taskInfo);
			}
		}
	}

	function runTask(taskInfo) {
		const ui = screenbreak.extension.ui.bg.main;
		const tabs = screenbreak.extension.core.bg.tabs;
		const taskId = taskInfo.id;
		return new Promise(async (resolve, reject) => {
			taskInfo.status = "processing";
			taskInfo.resolve = () => {
				tasks.splice(tasks.findIndex(taskInfo => taskInfo.id == taskId), 1);
				resolve();
				runTasks();
			};
			taskInfo.reject = error => {
				tasks.splice(tasks.findIndex(taskInfo => taskInfo.id == taskId), 1);
				reject(error);
				runTasks();
			};
			if (!taskInfo.tab.id) {
				let scriptsInjected;
				try {
					const tab = await tabs.createAndWait({ url: taskInfo.tab.url, active: false });
					taskInfo.tab.id = taskInfo.options.tabId = tab.id;
					taskInfo.tab.index = taskInfo.options.tabIndex = tab.index;
					scriptsInjected = await screenbreak.extension.injectScript(taskInfo.tab.id, taskInfo.options);
				} catch (tabId) {
					taskInfo.tab.id = tabId;
				}
				if (!scriptsInjected) {
					taskInfo.reject();
					return;
				}
			}
			taskInfo.options.taskId = taskId;
			tabs.sendMessage(taskInfo.tab.id, { method: taskInfo.method, options: taskInfo.options })
				.catch(error => {
					if (error && (!error.message || (error.message != ERROR_CONNECTION_LOST_CHROMIUM && error.message != ERROR_CONNECTION_ERROR_CHROMIUM && error.message != ERROR_CONNECTION_LOST_GECKO))) {
						console.log(error); // eslint-disable-line no-console
						ui.onError(taskInfo.tab.id);
						taskInfo.reject(error);
					}
				});
		});
	}

	function cancelTab(tabId) {
		Array.from(tasks).filter(taskInfo => taskInfo.tab.id == tabId).forEach(cancelTask);
	}

	function cancelTask(taskInfo) {
		const tabId = taskInfo.tab.id;
		const taskId = taskInfo.id;
		taskInfo.cancelled = true;
		screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "content.cancelSave" });
		if (taskInfo.cancel) {
			taskInfo.cancel();
		}
		screenbreak.extension.ui.bg.main.onCancelled(tabId);
		tasks.splice(tasks.findIndex(taskInfo => taskInfo.id == taskId), 1);
		if (taskInfo.resolve) {
			taskInfo.resolve();
		}
	}

})();

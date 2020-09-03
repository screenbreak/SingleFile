/* global screenbreak */

screenbreak.extension.core.bg.business = (() => {

	const ERROR_CONNECTION_ERROR_CHROMIUM = "Could not establish connection. Receiving end does not exist.";
	const ERROR_CONNECTION_LOST_CHROMIUM = "The message port closed before a response was received.";
	const ERROR_CONNECTION_LOST_GECKO = "Message manager disconnected";
	const MESSAGE_OPTIONS_MAIN_PAGE = { frameId: 0 };
	const TASK_PENDING_STATE = "pending";
	const TASK_PROCESSING_STATE = "processing";

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
		cancelTab,
		onSaveEnd: taskId => {
			const taskInfo = tasks.find(taskInfo => taskInfo.id == taskId);
			if (taskInfo) {
				taskInfo.done();
			}
		},
		onInit: tab => cancelTab(tab.id),
		onTabRemoved: cancelTab
	};

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
				await screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "content.initSave" }, MESSAGE_OPTIONS_MAIN_PAGE);
				tasks.push({
					id: currentTaskId,
					status: TASK_PENDING_STATE,
					tab,
					options: tabOptions,
					done: () => {
						tasks.splice(tasks.findIndex(taskInfo => taskInfo.id == currentTaskId), 1);
						runTasks();
					}
				});
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
		const processingCount = tasks.filter(taskInfo => taskInfo.status == TASK_PROCESSING_STATE).length;
		for (let index = 0; index < Math.min(tasks.length - processingCount, (maxParallelWorkers - processingCount)); index++) {
			const taskInfo = tasks.find(taskInfo => taskInfo.status == TASK_PENDING_STATE);
			if (taskInfo) {
				runTask(taskInfo);
			}
		}
	}

	function runTask(taskInfo) {
		const ui = screenbreak.extension.ui.bg.main;
		const tabs = screenbreak.extension.core.bg.tabs;
		const taskId = taskInfo.id;
		taskInfo.status = TASK_PROCESSING_STATE;
		taskInfo.options.taskId = taskId;
		tabs.sendMessage(taskInfo.tab.id, { method: "content.save", options: taskInfo.options }, MESSAGE_OPTIONS_MAIN_PAGE)
			.catch(error => {
				if (error && (!error.message || !isIgnoredError(error))) {
					console.log(error); // eslint-disable-line no-console
					ui.onError(taskInfo.tab.id, error);
					taskInfo.done();
				}
			});
	}

	function isIgnoredError(error) {
		return error.message == ERROR_CONNECTION_LOST_CHROMIUM ||
			error.message == ERROR_CONNECTION_ERROR_CHROMIUM ||
			error.message == ERROR_CONNECTION_LOST_GECKO;
	}

	function cancelTab(tabId) {
		Array.from(tasks).filter(taskInfo => taskInfo.tab.id == tabId).forEach(cancelTask);
	}

	function cancelTask(taskInfo) {
		const tabId = taskInfo.tab.id;
		screenbreak.extension.core.bg.tabs.sendMessage(tabId, { method: "content.cancelSave" }, MESSAGE_OPTIONS_MAIN_PAGE);
		screenbreak.extension.ui.bg.main.onCancelled(tabId);
		taskInfo.done();
	}

})();

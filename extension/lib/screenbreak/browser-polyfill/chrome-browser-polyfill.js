(() => {

	const FEATURE_TESTS = {};
	const NON_COMPLIANT_IMPLEMENTATION = this.origin.startsWith("safari-web-extension://");

	if ((!this.browser || NON_COMPLIANT_IMPLEMENTATION) && this.chrome) {
		const nativeAPI = this.chrome;
		this.__defineGetter__("browser", () => ({
			browserAction: {
				onClicked: {
					addListener: listener => nativeAPI.browserAction.onClicked.addListener(listener)
				},
				setBadgeText: options => new Promise((resolve, reject) => {
					if (!FEATURE_TESTS["browserAction.setBadgeText"] || !FEATURE_TESTS["browserAction.setBadgeText"].callbackNotSupported) {
						try {
							nativeAPI.browserAction.setBadgeText(options, () => {
								if (nativeAPI.runtime.lastError) {
									reject(nativeAPI.runtime.lastError);
								} else {
									resolve();
								}
							});
						} catch (error) {
							FEATURE_TESTS["browserAction.setBadgeText"] = { callbackNotSupported: true };
						}
					}
					if (FEATURE_TESTS["browserAction.setBadgeText"] && FEATURE_TESTS["browserAction.setBadgeText"].callbackNotSupported) {
						nativeAPI.browserAction.setBadgeText(options);
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve();
						}
					}
				}),
				setBadgeBackgroundColor: options => new Promise((resolve, reject) => {
					if (!FEATURE_TESTS["browserAction.setBadgeBackgroundColor"] || !FEATURE_TESTS["browserAction.setBadgeBackgroundColor"].callbackNotSupported) {
						try {
							nativeAPI.browserAction.setBadgeBackgroundColor(options, () => {
								if (nativeAPI.runtime.lastError) {
									reject(nativeAPI.runtime.lastError);
								} else {
									resolve();
								}
							});
						} catch (error) {
							FEATURE_TESTS["browserAction.setBadgeBackgroundColor"] = { callbackNotSupported: true };
						}
					}
					if (FEATURE_TESTS["browserAction.setBadgeBackgroundColor"] && FEATURE_TESTS["browserAction.setBadgeBackgroundColor"].callbackNotSupported) {
						nativeAPI.browserAction.setBadgeBackgroundColor(options);
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve();
						}
					}
				}),
				setTitle: options => new Promise((resolve, reject) => {
					if (!FEATURE_TESTS["browserAction.setTitle"] || !FEATURE_TESTS["browserAction.setTitle"].callbackNotSupported) {
						try {
							nativeAPI.browserAction.setTitle(options, () => {
								if (nativeAPI.runtime.lastError) {
									reject(nativeAPI.runtime.lastError);
								} else {
									resolve();
								}
							});
						} catch (error) {
							FEATURE_TESTS["browserAction.setTitle"] = { callbackNotSupported: true };
						}
					}
					if (FEATURE_TESTS["browserAction.setTitle"] && FEATURE_TESTS["browserAction.setTitle"].callbackNotSupported) {
						nativeAPI.browserAction.setTitle(options);
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve();
						}
					}
				}),
				setIcon: options => new Promise((resolve, reject) => {
					if (!FEATURE_TESTS["browserAction.setIcon"] || !FEATURE_TESTS["browserAction.setIcon"].callbackNotSupported) {
						try {
							nativeAPI.browserAction.setIcon(options, () => {
								if (nativeAPI.runtime.lastError) {
									reject(nativeAPI.runtime.lastError);
								} else {
									resolve();
								}
							});
						} catch (error) {
							FEATURE_TESTS["browserAction.setIcon"] = { callbackNotSupported: true };
						}
					}
					if (FEATURE_TESTS["browserAction.setIcon"] && FEATURE_TESTS["browserAction.setIcon"].callbackNotSupported) {
						nativeAPI.browserAction.setIcon(options);
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve();
						}
					}
				})
			},
			commands: {
				onCommand: {
					addListener: listener => nativeAPI.commands.onCommand.addListener(listener)
				}
			},
			i18n: {
				getMessage: (messageName, substitutions) => nativeAPI.i18n.getMessage(messageName, substitutions)
			},
			menus: {
				onClicked: {
					addListener: listener => nativeAPI.contextMenus.onClicked.addListener(listener)
				},
				create: options => nativeAPI.contextMenus.create(options),
				removeAll: () => new Promise((resolve, reject) => {
					nativeAPI.contextMenus.removeAll(() => {
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve();
						}
					});
				})
			},
			runtime: {
				onMessage: {
					addListener: listener => nativeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
						const response = listener(message, sender);
						if (response && typeof response.then == "function") {
							response
								.then(response => {
									if (response !== undefined) {
										try {
											sendResponse(response);
										} catch (error) {
											// ignored
										}
									}
								});
							return true;
						}
					}),
					removeListener: listener => nativeAPI.runtime.onMessage.removeListener(listener)
				},
				onInstalled: {
					addListener: listener => nativeAPI.runtime.onInstalled.addListener(listener)
				},
				sendMessage: message => new Promise((resolve, reject) => {
					nativeAPI.runtime.sendMessage(message, response => {
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve(response);
						}
					});
					if (nativeAPI.runtime.lastError) {
						reject(nativeAPI.runtime.lastError);
					}
				}),
				getURL: (path) => nativeAPI.runtime.getURL(path),
				get lastError() {
					return nativeAPI.runtime.lastError;
				},
				getManifest: () => nativeAPI.runtime.getManifest()
			},
			tabs: {
				onUpdated: {
					addListener: listener => nativeAPI.tabs.onUpdated.addListener(listener),
					removeListener: listener => nativeAPI.tabs.onUpdated.removeListener(listener)
				},
				onRemoved: {
					addListener: listener => nativeAPI.tabs.onRemoved.addListener(listener),
					removeListener: listener => nativeAPI.tabs.onRemoved.removeListener(listener)
				},
				executeScript: (tabId, details) => new Promise((resolve, reject) => {
					nativeAPI.tabs.executeScript(tabId, details, () => {
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve();
						}
					});
				}),
				sendMessage: (tabId, message, options = {}) => new Promise((resolve, reject) => {
					nativeAPI.tabs.sendMessage(tabId, message, options, response => {
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve(response);
						}
					});
					if (nativeAPI.runtime.lastError) {
						reject(nativeAPI.runtime.lastError);
					}
				}),
				query: options => new Promise((resolve, reject) => {
					nativeAPI.tabs.query(options, tabs => {
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve(tabs);
						}
					});
				}),
				create: createProperties => new Promise((resolve, reject) => {
					nativeAPI.tabs.create(createProperties, tab => {
						if (nativeAPI.runtime.lastError) {
							reject(nativeAPI.runtime.lastError);
						} else {
							resolve(tab);
						}
					});
				})
			}
		}));
	}

})();
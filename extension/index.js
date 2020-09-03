this.screenbreak = this.screenbreak || {
	extension: {
		injectScript: (tabId, options) => this.screenbreak.extension.lib.core.bg.scripts.inject(tabId, options)
	}
};
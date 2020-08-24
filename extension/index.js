this.screenbreak = this.screenbreak || {
	extension: {
		injectScript: (tabId, options) => this.screenbreak.extension.lib.core.bg.scripts.inject(tabId, options),
		getPageData: (options, doc, win, initOptions = { fetch: this.screenbreak.extension.lib.fetch.content.resources.fetch }) =>
			this.screenbreak.lib.getPageData(options, initOptions, doc, win)
	}
};
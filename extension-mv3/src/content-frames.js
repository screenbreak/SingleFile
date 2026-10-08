// Injected into every frame before a save, so SingleFile can collect the content of iframes (embeds).
import "./browser-shim.js";
import * as frameTree from "single-file-core/single-file-frames.js";

globalThis.singlefile = globalThis.singlefile || {};
globalThis.singlefile.processors = globalThis.singlefile.processors || {};
globalThis.singlefile.processors.frameTree = frameTree;

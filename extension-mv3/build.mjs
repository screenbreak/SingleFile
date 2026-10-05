import * as esbuild from "esbuild";
import { cpSync, rmSync } from "node:fs";

const OUT_DIR = "dist";

rmSync(OUT_DIR, { recursive: true, force: true });
cpSync("static", OUT_DIR, { recursive: true });

await esbuild.build({
	entryPoints: {
		"background": "src/background.js",
		"content-save": "src/content-save.js",
		"content-frames": "src/content-frames.js",
		"content-print": "src/content-print.js",
		"print": "src/print.js",
		"popup": "src/popup.js",
		"options": "src/options.js"
	},
	outdir: OUT_DIR,
	bundle: true,
	format: "iife",
	target: "chrome110",
	legalComments: "inline",
	logLevel: "info"
});

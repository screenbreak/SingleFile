import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const OUT_DIR = "dist";

rmSync(OUT_DIR, { recursive: true, force: true });
cpSync("static", OUT_DIR, { recursive: true });
// Work Sans as one variable font (weights 100–900), latin and latin-ext only.
mkdirSync(`${OUT_DIR}/fonts`, { recursive: true });
for (const subset of ["latin", "latin-ext"]) {
	cpSync(`node_modules/@fontsource-variable/work-sans/files/work-sans-${subset}-wght-normal.woff2`, `${OUT_DIR}/fonts/WorkSans-${subset}.woff2`);
}

await esbuild.build({
	entryPoints: {
		"background": "src/background.js",
		"content-save": "src/content-save.js",
		"content-frames": "src/content-frames.js",
		"content-print": "src/content-print.js",
		"print": "src/print.js",
		"popup": "src/popup.js",
		"options": "src/options.js",
		"welcome": "src/welcome.js"
	},
	outdir: OUT_DIR,
	bundle: true,
	format: "iife",
	target: "chrome110",
	legalComments: "inline",
	logLevel: "info"
});

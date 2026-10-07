import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { FONTS } from "./src/engine/fonts.js";

const OUT_DIR = "dist";

rmSync(OUT_DIR, { recursive: true, force: true });
cpSync("static", OUT_DIR, { recursive: true });
// Work Sans as one variable font (weights 100–900), latin and latin-ext only.
mkdirSync(`${OUT_DIR}/fonts`, { recursive: true });
for (const subset of ["latin", "latin-ext"]) {
	cpSync(`node_modules/@fontsource-variable/work-sans/files/work-sans-${subset}-wght-normal.woff2`, `${OUT_DIR}/fonts/WorkSans-${subset}.woff2`);
}

// The print engine's designs (engine/, from printlab) and the open-licence fonts they use, latin and latin-ext.
cpSync("engine", `${OUT_DIR}/engine`, { recursive: true });
mkdirSync(`${OUT_DIR}/engine/fonts`, { recursive: true });
for (const [, slug, weights, italics] of FONTS) {
	for (const weight of weights) {
		for (const style of italics ? ["normal", "italic"] : ["normal"]) {
			for (const subset of ["latin", "latin-ext"]) {
				const file = `${slug}-${subset}-${weight}-${style}.woff2`;
				cpSync(`node_modules/@fontsource/${slug}/files/${file}`, `${OUT_DIR}/engine/fonts/${file}`);
			}
		}
	}
}

await esbuild.build({
	entryPoints: {
		"background": "src/background.js",
		"content-save": "src/content-save.js",
		"content-frames": "src/content-frames.js",
		"content-print": "src/content-print.js",
		"print": "src/print.js",
		"sheet": "src/sheet.js",
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

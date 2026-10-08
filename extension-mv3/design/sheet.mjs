// Lays screenshots out on one review sheet. Usage: node design/sheet.mjs <dir> <out.png> <title> <file>=<caption> ...
import { chromium } from "playwright";
import { writeFileSync, rmSync } from "node:fs";
const [dir, out, title, ...items] = process.argv.slice(2);
const cards = items.map(item => { const [file, caption] = item.split("="); return `<figure><img src="${file}"><figcaption>${caption}</figcaption></figure>`; }).join("");
const html = `<!doctype html><meta charset=utf-8><style>
body{margin:0;padding:32px;width:1536px;font:14px/1.4 -apple-system,system-ui,sans-serif;color:#1d1d1b;background:#f4f6f5}
h1{margin:0 0 24px;font-size:22px}.grid{columns:3;column-gap:24px}
figure{break-inside:avoid;margin:0 0 24px;padding:14px;background:#fff;border:1px solid #dde3e0;border-radius:8px}
img{display:block;max-width:100%;margin-bottom:10px;border:1px solid #eee}figcaption{font-weight:600}</style>
<h1>${title}</h1><div class=grid>${cards}</div>`;
writeFileSync(dir + "/sheet.html", html);
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("file://" + dir + "/sheet.html", { waitUntil: "load" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
rmSync(dir + "/sheet.html");

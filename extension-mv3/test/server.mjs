// A test page plus a stand-in for the Screenbreak API (same endpoints and responses as webapp/api/views.py).
// `state.mode` makes the API answer like a full free plan ("limit") or a broken server ("error").
import http from "node:http"; import fs from "node:fs"; import zlib from "node:zlib";
export const log = [];
export const uploads = [];
export const removed = [];
export const state = { mode: "ok" };
const page = (res, title, body = "") => { res.setHeader("content-type", "text/html"); res.end(`<!doctype html><title>${title}</title><h1>${title}</h1>${body}`); };
export function start(port) {
	return new Promise(resolve => {
		const server = http.createServer(async (req, res) => {
			const url = new URL(req.url, "http://x");
			const loggedIn = (req.headers.cookie || "").includes("sbsession=ok");
			log.push(`${req.method} ${url.pathname} loggedIn=${loggedIn}`);
			if (url.pathname.startsWith("/fixtures/")) {
				const file = new URL("fixtures/" + url.pathname.split("/").pop(), import.meta.url);
				if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
				res.setHeader("content-type", file.pathname.endsWith(".png") ? "image/png" : "text/html");
				return res.end(fs.readFileSync(file));
			}
			if (url.pathname == "/article.html") { res.setHeader("content-type", "text/html"); return res.end(fs.readFileSync(new URL("fixtures/article.html", import.meta.url))); }
			if (url.pathname == "/photo.png") { res.setHeader("content-type", "image/png"); return res.end(fs.readFileSync(new URL("fixtures/photo.png", import.meta.url))); }
			if (url.pathname == "/login/") { res.setHeader("set-cookie", "sbsession=ok; Path=/"); return page(res, "Logged in"); }
			if (url.pathname == "/logout/") { res.setHeader("set-cookie", "sbsession=; Path=/; Max-Age=0"); return page(res, "Logged out"); }
			if (url.pathname == "/articles/") { return page(res, "My articles"); }
			if (url.pathname.startsWith("/articles/delete/")) {
				removed.push(url.pathname.split("/")[3]);
				res.statusCode = 302; res.setHeader("location", "/articles/"); return res.end();
			}
			if (url.pathname.startsWith("/articles/")) { return page(res, "Article " + url.pathname.split("/")[2]); }
			if (url.pathname == "/api/v1/csrf/") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ csrf_token: "tok123" })); }
			if (url.pathname == "/api/v1/article/" && req.method == "POST") {
				let body = ""; for await (const c of req) body += c;
				log.push("create " + body + " csrf=" + req.headers["x-csrftoken"] + " version=" + req.headers["x-extension-version"]);
				if (!loggedIn) { res.statusCode = 403; return res.end("{}"); }
				if (state.mode == "error") { res.statusCode = 500; return res.end("Internal Server Error"); }
				if (state.mode == "limit") {
					res.statusCode = 429; res.setHeader("content-type", "application/json");
					return res.end(JSON.stringify({ title: "October uploads limit reached", message: "Your account reached the upload limits for the month of October. Upload limits apply for free accounts.", action_label: "Upgrade to go unlimited", action_url: "http://localhost/subscriptions/?source=extension" }));
				}
				res.statusCode = 201; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ ref_id: "abc123" }));
			}
			if (url.pathname == "/api/v1/article/abc123/" && req.method == "POST") {
				const chunks = []; for await (const c of req) chunks.push(c);
				const buf = Buffer.concat(chunks);
				const ct = req.headers["content-type"]; const boundary = ct.split("boundary=")[1];
				const start = buf.indexOf("\r\n\r\n") + 4; const end = buf.lastIndexOf("\r\n--" + boundary);
				const head = buf.subarray(0, start).toString();
				const html = zlib.gunzipSync(buf.subarray(start, end)).toString();
				uploads.push(html);
				log.push("upload part-headers=" + JSON.stringify(head.split("\r\n").filter(l => l.startsWith("Content-"))) + " htmlBytes=" + html.length);
				res.statusCode = 201; return res.end();
			}
			res.statusCode = 404; res.end();
		});
		server.listen(port, () => resolve(server));
	});
}

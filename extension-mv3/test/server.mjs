// A test page plus a stand-in for the Screenbreak API (same endpoints and responses as webapp/api/views.py).
import http from "node:http"; import fs from "node:fs"; import zlib from "node:zlib";
export const log = [];
export const uploads = [];
export function start(port) {
	return new Promise(resolve => {
		const server = http.createServer(async (req, res) => {
			const url = new URL(req.url, "http://x");
			const loggedIn = (req.headers.cookie || "").includes("sbsession=ok");
			log.push(`${req.method} ${url.pathname} loggedIn=${loggedIn}`);
			if (url.pathname == "/article.html") { res.setHeader("content-type", "text/html"); return res.end(fs.readFileSync(new URL("fixtures/article.html", import.meta.url))); }
			if (url.pathname == "/photo.png") { res.setHeader("content-type", "image/png"); return res.end(fs.readFileSync(new URL("fixtures/photo.png", import.meta.url))); }
			if (url.pathname == "/login/") { res.setHeader("set-cookie", "sbsession=ok; Path=/"); return res.end("<h1>Logged in</h1>"); }
			if (url.pathname == "/api/v1/csrf/") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ csrf_token: "tok123" })); }
			if (url.pathname == "/api/v1/article/" && req.method == "POST") {
				let body = ""; for await (const c of req) body += c;
				log.push("create " + body + " csrf=" + req.headers["x-csrftoken"] + " version=" + req.headers["x-extension-version"]);
				if (!loggedIn) { res.statusCode = 403; return res.end("{}"); }
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

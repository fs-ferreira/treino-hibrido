import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      const { handler } = await import("../server/runtime.js");
      return handler(req, res);
    }
    const url = new URL(req.url, "http://localhost");
    let relative = decodeURIComponent(url.pathname).replace(
      /^\/treino-hibrido\//,
      "/",
    );
    if (relative === "/") relative = "/index.html";
    const file = path.resolve(root, "." + relative);
    const normalized = path.relative(root, file).split(path.sep).join("/");
    const allowed =
      [
        "index.html",
        "app.js",
        "bootstrap.js",
        "styles.css",
        "scripts/movement-lab-ui.js",
        "scripts/movement-lab-examples.js",
      ].includes(normalized) || /^(assets|lib|test-results)\//.test(normalized);
    if (
      !file.startsWith(root + path.sep) ||
      relative.includes("/.") ||
      !allowed
    ) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(Number(process.env.HYBRID_PORT || 4173), "127.0.0.1", function () {
    console.log("Local: http://127.0.0.1:" + this.address().port);
  });

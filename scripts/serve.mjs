// Local preview: rebuilds _site/ when the page is opened, then serves it.
// Usage: node scripts/serve.mjs   (PORT env, default 8771)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "_site");
const port = Number(process.env.PORT) || 8771;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".log": "text/plain; charset=utf-8" };

function build() {
  try { execFileSync(process.execPath, [path.join(root, "scripts", "build.mjs")], { stdio: "inherit" }); return true; }
  catch { return false; }
}
build();
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") { if (!build()) { res.writeHead(500); return res.end("Build failed - see terminal"); } p = "/index.html"; }
  const file = path.join(site, path.normalize(p));
  if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));

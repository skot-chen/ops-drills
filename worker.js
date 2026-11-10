// Runs learner code with Pyodide inside a Web Worker, so an endless loop can be stopped by terminating the worker.
// Messages in:  {type: "run", id, code, files: [path]}      out: {type: "ready"} | {type: "result", id, out, err}
/* global importScripts, loadPyodide */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let py = null;
const loaded = new Set();

async function boot() {
  py = await loadPyodide();
  self.postMessage({ type: "ready" });
}
const booting = boot().catch((e) => self.postMessage({ type: "fatal", err: String(e) }));

async function ensureFiles(files) {
  for (const p of files || []) {
    if (loaded.has(p)) continue;
    const res = await fetch("files/" + p);
    if (!res.ok) throw new Error("数据文件下载失败：" + p);
    const buf = new Uint8Array(await res.arrayBuffer());
    // Pyodide's FS needs absolute paths here; the code itself runs in cwd, so "samples/demo.log" works there.
    const base = py.FS.cwd();
    const dir = p.split("/").slice(0, -1).join("/");
    if (dir) py.FS.mkdirTree(base + "/" + dir);
    py.FS.writeFile(base + "/" + p, buf);
    loaded.add(p);
  }
}

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type !== "run") return;
  await booting;
  let out = "";
  const dec = new TextDecoder();
  py.setStdout({ write: (b) => { out += dec.decode(b, { stream: true }); return b.length; } });
  py.setStderr({ write: (b) => { out += dec.decode(b, { stream: true }); return b.length; } });
  try {
    await ensureFiles(m.files);
    // A fresh namespace per run, so old variables never leak into the next try.
    const ns = py.globals.get("dict")();
    await py.runPythonAsync(m.code, { globals: ns, filename: "<exec>" });
    ns.destroy();
    self.postMessage({ type: "result", id: m.id, out, err: "" });
  } catch (e) {
    self.postMessage({ type: "result", id: m.id, out, err: e && e.message ? String(e.message) : e && e.errno ? "文件系统错误 errno " + e.errno : String(e) });
  }
};

# Ops Drills — notes for Claude

Lesson format and the rules for adding lessons: **[AGENTS.md](AGENTS.md)** (shared with other AIs). Spec: [SPEC.md](SPEC.md). State: [PROGRESS.md](PROGRESS.md).

- **What**: public static practice site (GitHub Pages, `skot-chen/ops-drills`). The owner's private study plan (kept outside
  this repo) decides *what* to teach; this site is *where* they practise. This repo is PUBLIC — nothing personal in it.
- **Users**: one Chinese-speaking learner (rusty Python). UI text = simple Chinese. Explain to the user in simple Chinese.
- **Stack**: zero npm deps. `index.html` + `style.css` + ES modules: `core.js` (pure logic, tested), `app.js` (UI, hash routes),
  `worker.js` (Pyodide 0.26.4 from jsDelivr in a Web Worker; 10 s timeout = terminate + restart).
- **Build**: `scripts/build.mjs` validates `lessons/*.json`, runs every example / quiz / drill solution with local Python
  (`python -I -X utf8 -`, cwd `files/`), stores outputs in `_site/data.json`, cache-busts file references with `?v=hash`.
- **Commands**: `npm run check` (build + `node --test "tests/*.test.mjs"`), `npm run dev` → http://localhost:8771 (rebuilds on `/`).
  Preview: launch config `ops-drills` in `Desktop\11-05\.claude\launch.json`.
- **Progress** lives only in the browser (`localStorage`, prefix `od.`). Item ids `<lesson>.<block>.<item>` — never rename ids.
- **Gotchas**: Pyodide FS needs absolute paths for mkdir/write (use `FS.cwd()`); `python -I` ignores PYTHON* env vars, hence `-X utf8`;
  `files/samples/demo.log` must stay LF (`.gitattributes`). On Windows `node --test tests/` fails — use the quoted glob.

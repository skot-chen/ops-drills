// Validates lessons/*.json, runs every code snippet with real Python, and builds the website into _site/.
// Usage: node scripts/build.mjs        (exit code 1 = a lesson file has an error; the site is NOT rebuilt)
// Python: $PYTHON, else "python" on Windows / "python3" elsewhere. Snippets run with cwd = files/.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lessonsDir = path.join(root, "lessons");
const filesDir = path.join(root, "files");
const outDir = path.join(root, "_site");
const SITE_FILES = ["index.html", "style.css", "core.js", "app.js", "worker.js"];
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const errors = [];
const warnings = [];
let runs = 0;

/** Run a snippet; returns {ok, out, err}. */
function runPy(code) {
  runs++;
  const r = spawnSync(PY, ["-I", "-X", "utf8", "-"], {
    input: code, cwd: filesDir, encoding: "utf8", timeout: 15000,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
  if (r.error) { console.error(`Cannot run Python (${PY}): ${r.error.message}`); process.exit(2); }
  return { ok: r.status === 0, out: (r.stdout || "").replace(/\r\n/g, "\n"), err: (r.stderr || "").trim() };
}
const norm = (s) => String(s).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
const str = (v) => typeof v === "string" && v.trim() !== "";
const ID = /^[a-z0-9-]+$/i;

const files = fs.readdirSync(lessonsDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const lessons = [];
const lessonIds = new Set();

for (const f of files) {
  const at0 = `lessons/${f}`;
  let L;
  try { L = JSON.parse(fs.readFileSync(path.join(lessonsDir, f), "utf8").replace(/^﻿/, "")); }
  catch (e) { errors.push(`${at0}: invalid JSON – ${e.message}`); continue; }
  if (!str(L.id) || !ID.test(L.id)) { errors.push(`${at0}: "id" is required (letters, digits, -)`); continue; }
  if (f !== `${L.id}.json`) errors.push(`${at0}: file name must be "${L.id}.json"`);
  if (lessonIds.has(L.id)) errors.push(`${at0}: duplicate lesson id ${L.id}`);
  lessonIds.add(L.id);
  if (typeof L.stage !== "number") errors.push(`${at0}: "stage" must be a number`);
  if (!str(L.title)) errors.push(`${at0}: "title" is required`);
  if (!Array.isArray(L.blocks) || !L.blocks.length) { errors.push(`${at0}: "blocks" must be a non-empty array`); continue; }
  if (L.questions != null && (!Array.isArray(L.questions) || !L.questions.every(str))) errors.push(`${at0}: "questions" must be a list of strings`);

  const blockIds = new Set();
  const blocks = L.blocks.map((b, bi) => {
    const at = `${at0} blocks[${bi}]`;
    if (!str(b.id) || !ID.test(b.id)) errors.push(`${at}: "id" is required`);
    if (blockIds.has(b.id)) errors.push(`${at}: duplicate block id ${b.id}`);
    blockIds.add(b.id);
    if (!str(b.title)) errors.push(`${at}: "title" is required`);
    if (!str(b.body)) errors.push(`${at}: "body" is required`);
    const lang = b.lang || "python";
    const gid = `${L.id}.${b.id}`;
    const out = { id: gid, title: b.title, body: b.body, lang, example: b.example || "", exampleOut: "", files: b.files || [],
      tweaks: [], quiz: [], drills: [] };
    for (const p of out.files) if (!fs.existsSync(path.join(filesDir, p))) errors.push(`${at}: data file files/${p} not found`);

    if (str(b.example) && lang === "python") {
      const r = runPy(b.example);
      if (!r.ok) errors.push(`${at} example raises an error:\n${r.err}`);
      out.exampleOut = r.out;
    }
    for (const [ti, t] of (b.tweaks || []).entries()) {
      if (!str(t.ask)) errors.push(`${at} tweaks[${ti}]: "ask" is required`);
      out.tweaks.push({ ask: t.ask || "", answer: t.answer || "" });
    }
    const itemIds = new Set();
    for (const [qi, q] of (b.quiz || []).entries()) {
      const a = `${at} quiz[${qi}]`;
      if (!str(q.id) || itemIds.has(q.id)) errors.push(`${a}: unique "id" is required`);
      itemIds.add(q.id);
      if (!str(q.code)) { errors.push(`${a}: "code" is required`); continue; }
      let answer = q.answer ?? null;
      let raises = false;
      if (lang === "python") {
        const r = runPy(q.code);
        raises = !r.ok;
        const actual = r.ok ? r.out : r.err.split("\n").pop() || "";
        if (answer != null && norm(answer) !== norm(actual))
          errors.push(`${a}: "answer" does not match what Python prints.\n  answer: ${JSON.stringify(answer)}\n  actual: ${JSON.stringify(actual)}`);
        answer = actual;
      } else if (!str(answer)) errors.push(`${a}: "answer" is required for ${lang}`);
      out.quiz.push({ id: `${gid}.${q.id}`, code: q.code, answer: norm(answer), explain: q.explain || "", error: raises });
    }
    for (const [di, d] of (b.drills || []).entries()) {
      const a = `${at} drills[${di}]`;
      if (!str(d.id) || itemIds.has(d.id)) errors.push(`${a}: unique "id" is required`);
      itemIds.add(d.id);
      if (!str(d.task)) errors.push(`${a}: "task" is required`);
      if (!str(d.solution)) { errors.push(`${a}: "solution" is required`); continue; }
      const dfiles = d.files || out.files;
      for (const p of dfiles) if (!fs.existsSync(path.join(filesDir, p))) errors.push(`${a}: data file files/${p} not found`);
      const r = runPy(d.solution);
      if (!r.ok) { errors.push(`${a}: solution raises an error:\n${r.err}`); continue; }
      if (!r.out.trim()) errors.push(`${a}: solution prints nothing – the checker compares printed output`);
      if (d.expect != null && norm(d.expect) !== norm(r.out))
        errors.push(`${a}: "expect" does not match the solution's output.\n  expect: ${JSON.stringify(d.expect)}\n  actual: ${JSON.stringify(r.out)}`);
      out.drills.push({ id: `${gid}.${d.id}`, task: d.task, hints: d.hints || [], solution: d.solution, starter: d.starter || "",
        expect: norm(r.out), files: dfiles });
    }
    if (!out.quiz.length && !out.drills.length) warnings.push(`${at}: no quiz and no drills – nothing to review later`);
    return out;
  });
  lessons.push({ id: L.id, stage: L.stage, title: L.title, intro: L.intro || "", blocks, questions: L.questions || [] });
}
if (!lessons.length && !errors.length) errors.push("lessons/: no lesson files found");

for (const w of warnings) console.log("WARNING " + w);
if (errors.length) {
  for (const e of errors) console.error("ERROR   " + e);
  console.error(`\n${errors.length} error(s). Fix the lesson file(s) above. The website was NOT updated.`);
  process.exit(1);
}

// Natural sort: 1-2 before 1-10.
lessons.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
const hash = (f) => crypto.createHash("sha1").update(fs.readFileSync(path.join(root, f))).digest("hex").slice(0, 8);
const ver = Object.fromEntries(SITE_FILES.map((f) => [f, hash(f)]));
for (const f of SITE_FILES) {
  let s = fs.readFileSync(path.join(root, f), "utf8");
  // Cache-busting: every reference to another site file gets ?v=<content hash>.
  for (const g of SITE_FILES) if (g !== f && g !== "index.html") s = s.split(`"./${g}"`).join(`"./${g}?v=${ver[g]}"`).split(`"${g}"`).join(`"${g}?v=${ver[g]}"`);
  fs.writeFileSync(path.join(outDir, f), s);
}
if (fs.existsSync(filesDir)) fs.cpSync(filesDir, path.join(outDir, "files"), { recursive: true });
fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify({ built: new Date().toISOString(), lessons }));
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
const n = (k) => lessons.reduce((s, l) => s + l.blocks.reduce((t, b) => t + b[k].length, 0), 0);
console.log(`OK: ${lessons.length} lesson(s), ${n("quiz")} quiz, ${n("drills")} drills, ${runs} Python runs, ${warnings.length} warning(s) -> _site/`);

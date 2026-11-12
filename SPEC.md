# Ops Drills 运维练习本 — SPEC

## Goal
A public, zero-install practice website (GitHub Pages) for a Chinese-speaking learner who is
practising Python for ops automation. Markdown exercises in a repo were too hard to use; the learner wants to **look at content, learn it, write code from memory, bookmark, and review** — in the browser, on
laptop or phone. Python code runs **in the browser** (Pyodide in a Web Worker), so drills are checked automatically.
Success after 4 weeks: the learner opens the site daily, finishes "今日复习", passes most drills from memory, and the coach AI
adds a new lesson file whenever the previous one is passed.

## Core loop (designed around 抄 → 改 → 猜 → 默写, not a copy of daily-words)
1. Open the site → **今天** home: "继续学习" button (exact block where you stopped), 今日复习 count, lesson list with progress.
2. A lesson is a sequence of small **blocks** (one concept each). Each block walks 4 steps:
   **① 学+抄** read the explanation, then type the example yourself (paste discouraged) → ▶ 运行 → ✔ when your output matches.
   **② 改** small "change X, guess first" prompts, tried in the same editor, explanation behind a toggle.
   **③ 猜** see code → guess output → reveal → 不认识 / 模糊 / 认识.
   **④ 默写** only a task sentence → write from an empty editor → ✔/✗ auto-check, 💡 hints one at a time.
3. End of lesson: **🗣️ 讲** 3 questions answered in the page, 📋 copy for the AI to review.
4. **📅 复习**: due 猜 cards + 默写 tasks (spaced repetition). ⭐ any item → **收藏** page.

## Features & acceptance criteria

### F1 Content & build
1. Lessons live in `lessons/<id>.json` (`1-0.json`, `1-1.json`…). `npm run check` validates every file (schema, unique ids)
   **and runs every example/quiz/drill solution with real Python**, failing if a quiz answer or drill `expect` doesn't match
   what the code prints, or an example raises. Broken file → CI fails → live site keeps the previous version.
2. Build writes `_site/` with `data.json` (all lessons) and copies data files from `files/` (e.g. `demo.log`).
3. Lesson menu lists lessons in order with title and stage; the newest is preselected on first visit.

### F2 📖 学 (Learn)
1. Each card shows title, short explanation (simple Chinese, light markdown: paragraphs, `code`, **bold**, lists, tables) and
   an editable code box. ▶ 运行 shows stdout/errors under it. ↺ restores the original code.
2. A "学过了" button marks the card learned; learned cards show ✓ in the lesson's card list.

### F3 🃏 认 (Guess the output)
1. Shows a code snippet (not editable). "看答案" reveals the expected output + explanation.
2. Grading 不认识 / 模糊 / 认识 schedules the card (F6). Next card follows automatically.

### F4 ✍️ 默写 (Write from memory)
1. Shows the task, an empty (or starter) editor, 运行, 💡 提示 (reveals hints one by one), 看答案 (only after ≥1 run).
2. 运行 executes in a Web Worker with Pyodide; stdout is compared to `expect` (trailing spaces/blank lines ignored).
   Match → ✔ 正确 + scheduled as good; mismatch → ✗ with a side-by-side "你的输出 / 应该输出", scheduled as wrong (comes back today).
3. Infinite loop protection: run is killed after 10 s with a clear message; the worker restarts.
4. Data files listed in `files` are available at the same relative path (e.g. `samples/demo.log`).
5. Tab key inserts 4 spaces; the draft is kept per drill.

### F5 🗣️ 讲 + ⭐ 收藏
1. Lesson questions with text areas; answers autosave. "📋 复制答案" copies `lesson id + Q + A` text to the clipboard.
2. Every card/quiz/drill has a ☆ toggle; **⭐ 收藏** tab lists all starred items across lessons, each openable in its mode.

### F6 📅 今日复习 (Spaced repetition)
1. Quiz cards and drills use boxes like daily-words: wrong → today again; good → next box; intervals 1, 2, 4, 7, 15, 30 days;
   模糊 keeps the box but returns tomorrow.
2. 今日复习 lists due items (drills first) with a count in the header; empty state says what to do next.

### F7 Progress
1. All progress in `localStorage` (prefix `od.`). ⚙ 学习进度: export to a JSON file, import from it, reset (confirm).
2. Header shows: current lesson, learned cards x/y, drills passed x/y, due today n.

### F8 Usability
1. Works at 375 px width without horizontal scroll; code boxes scroll internally.
2. Pyodide (~10 MB) loads only on the first ▶ 运行, with a "正在准备 Python（第一次约 10–30 秒）" message.
3. UI text simple Chinese (short English in small type where helpful).

## Non-goals for v1
Accounts / cloud sync; running shell, Docker or K8s commands (those lessons use 学 + 认 only); AI grading inside the site.

## Data model
`lessons/<id>.json`:
```json
{ "id": "1-0", "stage": 1, "title": "Python 快速复习", "intro": "…",
  "blocks": [{ "id": "b1", "title": "变量和打印", "body": "markdown",
      "example": "code to type (its output is computed at build time)",
      "tweaks": [{ "ask": "把 … 改成 …，先猜", "answer": "explanation" }],
      "quiz":   [{ "id": "q1", "code": "…", "answer": "optional; build verifies it", "explain": "…" }],
      "drills": [{ "id": "d1", "task": "markdown", "hints": ["…"], "solution": "…", "starter": "", "files": ["samples/demo.log"] }] }],
  "questions": ["…", "…", "…"] }
```
`lang` other than `python` → no run button (shell/YAML shown as text). `files/` holds data files at their run paths.
localStorage: `od.srs` {itemId: {box, due}}, `od.learned` {cardId: true}, `od.star` {itemId: true}, `od.draft` {drillId: code},
`od.answers` {lessonId: [..]}, `od.lesson` current lesson id.

## Stack + why
Static site, **zero npm dependencies** (workspace rule; same as daily-words). `index.html` + `style.css` + ES modules
(`core.js` pure logic shared with Node tests, `app.js` UI, `worker.js` Pyodide runner). Pyodide 0.26.4 from jsDelivr, the only way
to run real Python in a static page. Node 22 scripts for build/serve/tests (`node:test`). Build uses local `python`
to verify content. GitHub Actions builds + deploys to Pages (public repo `skot-chen/ops-drills`, account confirmed before creation).

## Milestones
Item ids are global as `<lesson>.<block>.<item>` (e.g. `1-0.b1.q1`). Build runs every `example`, `quiz.code` and `drill.solution`
with real Python (cwd = `files/`), stores their outputs, and fails on errors or a quiz `answer` that doesn't match.
- **M0 Skeleton** — build/verify, serve, tests, page shell + routing. (F1)
- **M1 Learn flow** — core.js (SRS, output compare, markdown-lite), Pyodide worker, block 4-step flow, home, stars; lesson 1-0. (F2–F5.2, F6.1, F8.2)
- **M2 Review + 讲 + progress** — review queue, questions + copy, export/import/reset, lesson 1-1 with demo.log, phone pass. (F5.1, F6.2, F7, F8.1)
- **M4 Publish** — GitHub repo + Pages + AGENTS.md (how the coach adds a lesson), link from the private study repo and the coach task.

## v2 (2026-11-12) — daily loop, fun, clarity
- **今日任务** home: ① 复习 (due items) → ② 学新内容 (daily goal 1–3 blocks, set in ⚙) → ③ 讲 (when a lesson is finished)
  → ④ 打卡 (summary of the day + 📋 copy for the AI). Week strip (active / checked-in days), 🔥 streak, XP + levels, badges.
- Own look (navy/indigo, not the vocabulary site's beige/green); each step has its own colour (学 blue, 改 amber, 猜 violet, 默写 teal).
- Hierarchy 今天/课程 → 阶段 (#/stage/N) → 课 → 小块; every non-top page has a back button one level up (stage page goes back to wherever you came from). Lesson progress bar; step nav sticks to the bottom.
- 猜: typed guess is checked against the real output (✔/✗) and the matching grade is highlighted. 📋 copy-to-AI on 抄 errors,
  every 改 prompt, every 猜 card and every failed 默写 (asks for a hint, not the answer).
- Course map (`syllabus.json`): all 6 stages and planned lessons; unpublished ones show 「制作中」.
- `resources` per lesson: verified YouTube videos + GitHub/Reddit/doc links.
- New storage keys: `xp`, `log` (per-day activity), `said`, `doneAt`, `goal`. Old progress is back-filled on load.

# AGENTS.md — how to add a lesson to Ops Drills

You are an AI assistant (often the learner's coach). Your usual job here: **add one new lesson file `lessons/<id>.json`** and push it to `main`.
GitHub Actions runs every code snippet with real Python; if anything doesn't match, the site is not updated.

- Repo: https://github.com/skot-chen/ops-drills · Live site: https://skot-chen.github.io/ops-drills/
- Learner: Chinese native speaker practising Python for ops automation.
  **All learner-facing text is simple Chinese.** Code identifiers stay English.
- The lesson order and topics come from the learner's own study plan (the coach knows where). This repo is **public**: never put
  the learner's answers, plans, names or anything personal here.

## Rules
1. Only add/edit files in `lessons/` (and data files in `files/`). Don't touch `app.js`, `core.js`, `worker.js`, `style.css`,
   `scripts/`, `.github/` unless the owner asks.
2. **Never change or delete the `id` of an existing lesson, block, quiz or drill** — the learner's progress is keyed by them.
   Fixing typos in text is fine.
3. Run `npm run check` before pushing (needs Node 22 + Python 3.12). It must print `OK`.
4. Python only runs for `lang: "python"` (the default). Shell / YAML / PromQL lessons: set `"lang": "shell"` (or `yaml`, `text`)
   on the block; then examples are shown, not run, and every quiz needs an explicit `answer`.
5. Commit message: `lesson <id>: <title>`; push to `main`.
6. **No personal background, ever.** Never mention the learner's past jobs, employers, years of experience, career change
   or job search — in lessons, questions, commit messages or docs. Bridge from generic tools (grep/awk/curl) instead.
7. The lesson must already be listed in `syllabus.json` (the course map shown on the site). Keep its id/title in sync;
   don't reorder or remove planned lessons without the owner's OK.

## Lesson design (this is what makes it work)
Each lesson = 3–8 small **blocks**, one idea each. The site walks every block through 4 steps:
**① 学 + 抄** (read `body`, then type the `example` by hand until the output matches) → **② 改** (`tweaks`: "change X, guess first")
→ **③ 猜** (`quiz`: guess the output, self-grade) → **④ 默写** (`drills`: write from an empty editor, auto-checked).

- `body`: start from familiar command-line ops tools (grep/awk/curl, a monitoring dashboard), then ≤ 5 new ideas. A small table
  "写法 | 意思 | 命令行里的对应" works well. ~10–25 lines.
- `example`: 5–15 lines, realistic ops data (hosts, ports, log lines). Must run without errors. Its output is computed at build time.
- `tweaks`: 1–3. Each asks to change one thing **and guess first**; `answer` explains *why*, linking to real ops when possible.
- `quiz`: 1–3 short snippets (3–6 lines) with one surprise each (off-by-one, KeyError, sorted() not changing the list…).
  You may omit `answer` (build fills it from Python); a snippet that raises is allowed — the answer becomes the error line.
  `explain`: one or two sentences.
- `drills`: 1–2. `task` is a requirement in words + the **exact expected output** in a ``` block (copy it from the build output —
  `npm run check` fails if `expect` is given and wrong). `hints`: 2–3, from gentle to specific, never the full answer.
  `solution`: the simplest code a beginner could write (no comprehensions/lambdas unless taught). Must `print` the result.
- `files`: data files the code reads, relative to `files/` (e.g. `["samples/demo.log"]`). Keep new data files small (< 500 KB) and deterministic.
- `resources`: 3–8 links shown as 「📺 配套视频和案例」 — `{kind: video|case|doc|community, title, url, source, note}`.
  **Videos: YouTube only.** Cases: GitHub repos/folders, Reddit, official docs. **Verify every link before adding it**:
  YouTube via `https://www.youtube.com/oembed?url=<video url>&format=json` (must return the real title/channel — use those),
  others must return HTTP 200. Reddit can't be checked automatically: only link subreddit home pages or wikis, never a
  thread you haven't opened. `note` says which block it matches (e.g. 「对应 b2」) or when to watch it.
- `questions` (讲): exactly 3, answered in the learner's own words: one *why*, one about a real-world ops situation, one reflection. Never refer to the learner's own past jobs or background.

## File format
```json
{
  "id": "1-2", "stage": 1, "title": "正则表达式",
  "intro": "一两句：这课学什么、为什么。",
  "questions": ["…为什么…？", "…真实场景里…？", "…"],
  "blocks": [
    {
      "id": "b1", "title": "第一个正则", "body": "markdown（表格、`代码`、**加粗**、列表、``` 代码块）",
      "example": "import re\nprint(re.findall(r\"\\d+\", \"pool=39 port=5432\"))",
      "tweaks": [{ "ask": "把 `\\d+` 改成 `\\d`，先猜结果", "answer": "…" }],
      "quiz": [{ "id": "q1", "code": "…", "explain": "…" }],
      "drills": [{ "id": "d1", "task": "…\n\n```\n期望输出\n```", "hints": ["…", "…"], "solution": "…", "files": ["samples/demo.log"] }]
    }
  ]
}
```
IDs: lesson `id` = file name; block ids `b1, b2…`; quiz `q1…`, drill `d1…` (unique inside the block).
Lessons 1-0 and 1-1 were generated by `scripts/authoring/gen_1_0_1_1.py`; newer lessons are plain JSON.

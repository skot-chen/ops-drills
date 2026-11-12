// @ts-nocheck
// Ops Drills UI. Hash routes:
//   #/  today · #/lessons · #/l/<lesson> · #/l/<lesson>/<block>/<step 1-4> · #/review · #/stars · #/settings
import { grade, sameOutput, normOut, explainError, md, esc, dueQueue, blockSteps, dayKey, addDays, streak, levelOf, guessMatches } from "./core.js";

const $app = document.getElementById("app");
const STEP_NAMES = ["学 + 抄", "改", "猜", "默写"];
const STEP_KEYS = ["learn", "tweak", "guess", "drill"];
const STEP_NAMES_EN = ["Learn + copy", "Tweak", "Guess", "From memory"];
const STEP_TIPS_EN = [
  "Read the explanation, then type the example yourself (no pasting) and run it. It passes when the output matches.",
  "Change one thing. Write down your guess first, then run it to check.",
  "Read the code and guess the output. Write your guess and the site checks it; if it's unclear, copy it to the AI.",
  "Only a one-line task: write the code from scratch. The site checks it automatically.",
];
const STEP_TIPS = [
  "读讲解，然后把例子自己敲一遍（不要粘贴），运行，输出对上就过关。",
  "按提示改一处。先在「我猜」里写下你猜的结果，再运行验证。",
  "看代码猜输出。把猜的写下来，网站帮你对答案；看不懂就复制给 AI 讲。",
  "只看一句要求，从空白开始写。网站自动判对错。",
];

/* ---------------- storage ---------------- */
const KEYS = ["srs", "copied", "tweaked", "star", "draft", "answers", "days", "last", "xp", "log", "said", "doneAt", "goal", "en"];
const DEFAULTS = { last: null, goal: 2, en: false };
const store = {
  get(k, d) { try { const v = localStorage.getItem("od." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("od." + k, JSON.stringify(v)); } catch { /* private mode: keep in memory only */ } },
};
const fresh = (k) => (k in DEFAULTS ? DEFAULTS[k] : {});
const S = Object.fromEntries(KEYS.map((k) => [k, store.get(k, fresh(k))]));
const save = (k) => store.set(k, S[k]);
const today = () => dayKey(new Date());
function touchDay() { S.days[today()] = (S.days[today()] || 0) + 1; save("days"); }
/** Today's activity log. */
function T() {
  const d = today();
  if (!S.log[d]) S.log[d] = { blocks: [], reviews: 0, quiz: 0, quizRight: 0, drills: 0, drillsOk: 0, checkin: false };
  return S.log[d];
}
function bump(field, n = 1) { T()[field] += n; save("log"); }
function addXP(n, why) {
  const before = levelOf(S.xp.total || 0).lv;
  S.xp.total = (S.xp.total || 0) + n; save("xp");
  const L = levelOf(S.xp.total);
  updateHeader();
  if (L.lv > before) toast(`🎉 升级了！Lv${L.lv} ${L.name}`, 3500);
  else if (why) toast(`${why}  +${n} 经验`);
}

/* ---------------- data ---------------- */
let DATA = { lessons: [], syllabus: [] };
const byId = {};       // global id -> {lesson, block, item, kind}
function index() {
  for (const L of DATA.lessons) for (const b of L.blocks) {
    byId[b.id] = { lesson: L, block: b, kind: "block" };
    for (const q of b.quiz) byId[q.id] = { lesson: L, block: b, item: q, kind: "quiz" };
    for (const d of b.drills) byId[d.id] = { lesson: L, block: b, item: d, kind: "drill" };
  }
}
const allItems = () => Object.entries(byId).filter(([, v]) => v.kind !== "block").map(([id, v]) => ({ id, kind: v.kind }));
const stepsOf = (b) => blockSteps(b, S);
const firstStep = (b) => { const s = stepsOf(b); return !s.copy ? 1 : !s.tweak ? 2 : !s.quiz && b.quiz.length ? 3 : 4; };
const shortId = (b) => b.id.split(".")[1];
const blockHref = (L, b, step) => `#/l/${L.id}/${shortId(b)}/${step || firstStep(b)}`;
function lessonProgress(L) { const done = L.blocks.filter((b) => stepsOf(b).done).length; return { done, total: L.blocks.length }; }
const lessonDone = (L) => L.blocks.every((b) => stepsOf(b).done);
function nextUndone() {
  for (const L of DATA.lessons) for (const b of L.blocks) if (!stepsOf(b).done) return { L, b, step: firstStep(b) };
  return null;
}
function dueCount() { return dueQueue(allItems(), S.srs, today()).length; }
const pendingSay = () => DATA.lessons.filter((L) => lessonDone(L) && L.questions.length && !S.said[L.id]);

/** Call after any step action: records a finished block once (+XP). */
function checkBlockDone(b) {
  if (S.doneAt[b.id] || !stepsOf(b).done) return;
  S.doneAt[b.id] = today(); save("doneAt");
  T().blocks.push(b.id); save("log");
  addXP(20, `✅ 完成一块「${b.title}」`);
  const L = byId[b.id].lesson;
  if (lessonDone(L)) setTimeout(() => toast(`🏁 整课 ${L.id} 学完了！去课程页最下面「讲」一讲`, 4000), 2300);
}

/* ---------------- header ---------------- */
function updateHeader() {
  const n = dueCount(); const b = document.getElementById("due-badge");
  b.hidden = !n; b.textContent = String(n);
  const st = streak(Object.keys(S.days), today());
  const L = levelOf(S.xp.total || 0);
  document.getElementById("me").innerHTML = `<span title="连续学习天数">🔥${st}</span><span title="等级">Lv${L.lv}</span>`;
}

/* ---------------- python runner (Web Worker + Pyodide) ---------------- */
const runner = {
  w: null, ready: false, waiting: null, seq: 0,
  start() {
    this.ready = false;
    this.w = new Worker("worker.js");
    this.w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "ready") { this.ready = true; document.querySelectorAll(".status[data-run]").forEach((s) => (s.textContent = "")); }
      else if (m.type === "fatal") { this.fail("Python 加载失败，请检查网络后刷新页面。\n" + m.err); }
      else if (m.type === "result" && this.waiting && this.waiting.id === m.id) { clearTimeout(this.waiting.timer); const w = this.waiting; this.waiting = null; w.resolve(m); }
    };
    this.w.onerror = () => this.fail("Python 加载失败，请检查网络后刷新页面。");
  },
  fail(msg) { if (this.waiting) { clearTimeout(this.waiting.timer); this.waiting.resolve({ out: "", err: msg }); this.waiting = null; } },
  run(code, files, statusEl) {
    if (!this.w) this.start();
    if (this.waiting) return Promise.resolve({ out: "", err: "上一次运行还没结束。" });
    if (!this.ready && statusEl) statusEl.textContent = "正在准备 Python（第一次大约 10–30 秒，之后就快了）…";
    return new Promise((resolve) => {
      const id = ++this.seq;
      this.waiting = { id, resolve, timer: 0 };
      const arm = () => {
        // The 10 s limit starts once Python is ready, so the first download is not counted.
        if (!this.waiting || this.waiting.id !== id) return;
        if (!this.ready) { setTimeout(arm, 300); return; }
        this.waiting.timer = setTimeout(() => {
          this.w.terminate(); this.w = null; this.ready = false;
          this.fail("运行超过 10 秒被停止了：是不是写了一个停不下来的循环？");
        }, 10000);
      };
      arm();
      this.w.postMessage({ type: "run", id, code, files: files || [] });
    });
  },
};

/* ---------------- English subtitles (hidden until the EN switch is on) ---------------- */
/** zh is already HTML; en is plain text shown as a small inline subtitle. */
const tx = (zh, en) => (en ? `${zh}<span class="en-i">${esc(en)}</span>` : zh);
/** Block-level English version of a markdown text. */
const enMd = (text) => (text ? `<div class="en">${md(text)}</div>` : "");
function applyEn() {
  document.body.classList.toggle("en-on", !!S.en);
  const b = document.getElementById("en-toggle");
  if (b) { b.classList.toggle("on", !!S.en); b.setAttribute("aria-pressed", S.en ? "true" : "false"); b.title = S.en ? "隐藏英文字幕 Hide English" : "显示英文字幕 Show English"; }
}

/* ---------------- small UI helpers ---------------- */
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
function toast(msg, ms = 2200) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), ms); }
function starBtn(id) {
  const b = h(`<button class="star" title="收藏" aria-label="收藏">${S.star[id] ? "⭐" : "☆"}</button>`);
  b.onclick = () => { if (S.star[id]) delete S.star[id]; else S.star[id] = true; save("star"); b.textContent = S.star[id] ? "⭐" : "☆"; toast(S.star[id] ? "已收藏" : "已取消收藏"); };
  return b;
}
/** Copy text; if the browser refuses, show it in a box to copy by hand. */
async function copyText(text, holder, okMsg = "已复制，粘贴给 AI 就行") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { const t = h(`<textarea class="say" readonly></textarea>`); t.value = text; holder.append(t); t.select(); toast("请手动复制下面的文字"); }
}
const fence = (s) => "```\n" + String(s || "").replace(/\n+$/, "") + "\n```";
function aiBtn(label, makeText, holder) {
  const b = h(`<button class="ai">📋 ${tx(label, "Copy for AI")}</button>`);
  b.onclick = () => copyText(makeText(), holder || b.parentElement);
  return b;
}
/** Top bar with an obvious way back. */
function backBar(href, label, right = "", labelEn = "") {
  return h(`<div class="backbar"><a class="back" href="${href}">← ${tx(esc(label), labelEn)}</a><span class="spacer"></span>${right}</div>`);
}
const bar = (pct, cls = "") => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

/** Code editor: Tab = 4 spaces, Enter keeps indentation (+4 after ':'), Ctrl/Cmd+Enter runs. */
function editor({ value = "", placeholder = "", onRun, onChange, rows = 8 }) {
  const ta = h(`<textarea class="ed" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" rows="${rows}"></textarea>`);
  ta.value = value; ta.placeholder = placeholder;
  const ins = (s) => { ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); };
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ins("    "); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun && onRun(); }
    else if (e.key === "Enter" && !e.isComposing) {
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      let ind = (line.match(/^ */) || [""])[0];
      if (/:\s*$/.test(line)) ind += "    ";
      e.preventDefault(); ins("\n" + ind);
    }
  });
  ta.addEventListener("input", () => onChange && onChange(ta.value));
  return ta;
}

/** Shows a run result. want = expected output (optional). Returns true when it matches. */
function showResult(box, res, want) {
  box.innerHTML = "";
  const out = h(`<pre class="out"></pre>`);
  out.textContent = res.out || (res.err ? "" : "（没有输出：记得用 print）");
  box.append(out);
  if (res.err) {
    const e = explainError(res.err);
    box.append(h(`<div class="result err"><b>出错了${e.line ? `（第 ${e.line} 行）` : ""}：</b><code>${esc(e.last)}</code>${e.hint ? `<div class="hint">💡 ${esc(e.hint)}</div>` : ""}</div>`));
    return false;
  }
  if (want == null) return true;
  if (sameOutput(res.out, want)) { box.append(h(`<div class="result ok">✔ 正确！</div>`)); return true; }
  box.append(h(`<div class="result no"><b>✗ 输出不一样</b>，对比一下：<div class="cmp">
    <div><div>你的输出</div><pre class="out">${esc(normOut(res.out)) || "（空）"}</pre></div>
    <div><div>应该输出</div><pre class="out">${esc(want)}</pre></div></div></div>`));
  return false;
}

/* ---------------- today: the daily loop ---------------- */
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const HOW_EN = "Each block has 4 steps:\n\n**① Learn + copy**: read the explanation and **type the example yourself**, then run it until the output matches.\n**② Tweak**: change one thing, **guess the result first**, then run it.\n**③ Guess**: read code and guess its output; the site checks your guess. If it is unclear, tap 「Copy for AI」.\n**④ From memory**: only a one-line task; write the code from an empty editor. The site checks it.\n\nGuess cards and drills come back in 「Review」 after 1, 2, 4, 7, 15 and 30 days; wrong ones come back the same day.\n\n**XP**: copy +10, tweak +5, guess +3 (+2 if right), drill right +15, each review +5, finish a block +20, explain a lesson +30, check in +30.";
function weekStrip() {
  const d0 = today();
  let html = "";
  for (let i = 6; i >= 0; i--) {
    const d = addDays(d0, -i);
    const [y, m, dd] = d.split("-").map(Number);
    const wd = WEEK[new Date(y, m - 1, dd).getDay()];
    const cls = S.log[d]?.checkin ? "full" : S.days[d] ? "some" : "";
    html += `<div class="day ${cls} ${i === 0 ? "now" : ""}" title="${d}"><i></i><span>${i === 0 ? "今天" : wd}</span></div>`;
  }
  return `<div class="week">${html}</div>`;
}

function badges() {
  const st = streak(Object.keys(S.days), today());
  const drillsOk = Object.entries(S.srs).filter(([id, s]) => byId[id]?.kind === "drill" && s.box > 0).length;
  const right = Object.values(S.log).reduce((n, l) => n + (l.quizRight || 0), 0);
  const fullDays = Object.values(S.log).filter((l) => l.checkin).length;
  return [
    ["🐣", "第一步", "第一次抄对一个例子", Object.keys(S.copied).length > 0, "First step"],
    ["🔥", "三天不断", "连续学习 3 天", st >= 3, "3-day streak"],
    ["🏅", "一周不断", "连续学习 7 天", st >= 7, "7-day streak"],
    ["📘", "学完一课", "完成一整课", DATA.lessons.some(lessonDone), "First lesson"],
    ["✍️", "默写十题", "默写写对 10 题", drillsOk >= 10, "10 drills"],
    ["🎯", "神猜手", "猜对 20 次", right >= 20, "Sharp guesser"],
    ["✅", "五天打卡", "完整打卡 5 天", fullDays >= 5, "5 full days"],
  ];
}

function viewHome() {
  const d = today();
  const log = T();
  const due = dueCount();
  const nx = nextUndone();
  const goal = Number(S.goal) || 2;
  const learnedToday = log.blocks.length;
  const say = pendingSay();
  const reviewDone = due === 0;
  const learnDone = learnedToday >= goal || !nx;
  const sayDone = say.length === 0;
  const canCheckin = reviewDone && learnDone;
  const L = levelOf(S.xp.total || 0);
  const st = streak(Object.keys(S.days), d);
  const [y, m, dd] = d.split("-").map(Number);
  const steps = [
    { ok: reviewDone, t: tx("📅 复习", "Review"), sub: reviewDone ? "没有到期的了" : `还有 ${due} 项到期`, a: reviewDone ? "" : `<a class="btn primary" href="#/review">${tx("开始复习", "Start review")}</a>` },
    { ok: learnDone, t: tx("📖 学新内容", "Learn something new"), sub: !nx ? "现有的课都学完了" : `今天 ${learnedToday}/${goal} 块 · 下一块：${esc(nx.L.id)}「${esc(nx.b.title)}」第 ${nx.step} 步`,
      a: nx ? `<a class="btn ${reviewDone && !learnDone ? "primary" : ""}" href="${blockHref(nx.L, nx.b, nx.step)}">${learnDone ? tx("再学一块", "One more block") : tx("继续学", "Continue")}</a>` : "" },
    { ok: sayDone, t: tx("🗣️ 讲", "Explain in your own words"), sub: sayDone ? "学完一整课后，用自己的话讲 3 个问题" : `${say[0].id}「${esc(say[0].title)}」学完了，讲一讲`,
      a: sayDone ? "" : `<a class="btn" href="#/l/${say[0].id}#say">${tx("去讲", "Go explain")}</a>` },
    { ok: log.checkin, t: tx("✅ 打卡", "Check in"), sub: log.checkin ? "今天完成了！" : canCheckin ? "可以打卡了：看看今天学了什么" : "先完成复习和学新内容", a: "" },
  ];
  const doneN = steps.filter((s) => s.ok).length;
  const el = h(`<div>
    <h1>今天 · ${m}月${dd}日 周${WEEK[new Date(y, m - 1, dd).getDay()]}</h1>
    <div class="stats">
      <div><b>🔥 ${st}</b><span>${tx("连续学习天数", "day streak")}</span></div>
      <div><b>Lv${L.lv} ${L.name}</b>${bar(L.pct, "xp")}<span>${S.xp.total || 0}${L.next ? ` / ${L.next}` : ""} ${tx("经验", "XP")}</span></div>
      <div><b>${Object.values(S.log).filter((l) => l.checkin).length}</b><span>${tx("完整打卡天数", "full days")}</span></div>
    </div>
    ${weekStrip()}
    <div class="card mission">
      <div class="row"><h2>${tx("今日任务", "Today's tasks")}</h2><span class="spacer"></span><span class="muted">${doneN}/4</span></div>
      ${bar((100 * doneN) / 4)}
      <ol class="todo"></ol>
      <div id="checkin"></div>
    </div>
    <h2>${tx("总进度", "Overall progress")}</h2><div id="overall"></div>
    <h2>${tx("徽章", "Badges")}</h2><div class="badges"></div>
    <details class="card"><summary><b>${tx("每一小块怎么学？", "How does each block work?")}</b></summary><div class="body">${md("每一小块有 4 步：\n\n**① 学 + 抄**：读讲解，把例子**自己敲一遍**，运行对上结果。\n**② 改**：按提示改一处，**先猜结果再运行**。\n**③ 猜**：看代码猜输出，网站帮你对答案；看不懂点「复制给 AI 讲解」。\n**④ 默写**：只看一句要求，从空白开始写，网站自动判对错。\n\n学过的猜题和默写会在 1、2、4、7、15、30 天后回到「复习」里；做错的当天就回来。\n\n**经验值**：抄对 +10，改 +5，猜 +3（猜对再 +2），默写对 +15，复习一项 +5，完成一块 +20，讲完一课 +30，打卡 +30。")}${enMd(HOW_EN)}</div></details>
  </div>`);
  const ol = el.querySelector(".todo");
  steps.forEach((s, i) => ol.append(h(`<li class="${s.ok ? "ok" : ""}"><span class="tick">${s.ok ? "✓" : i + 1}</span><div><b>${s.t}</b><div class="muted">${s.sub}</div></div><span class="spacer"></span>${s.a}</li>`)));

  const ck = el.querySelector("#checkin");
  if (log.checkin || canCheckin) {
    const card = h(`<div class="summary"><b>${log.checkin ? "🎉 今天完成了" : "今天的小结"}</b><pre class="out">${esc(daySummary())}</pre><div class="row"></div></div>`);
    const row = card.querySelector(".row");
    if (!log.checkin) {
      const b = h(`<button class="primary big">✅ ${tx("打卡，完成今天", "Check in for today")}</button>`);
      b.onclick = () => { T().checkin = true; save("log"); touchDay(); addXP(30, "🎉 今天打卡完成"); viewHome(); };
      row.append(b);
    }
    row.append(aiBtn("复制今日小结给 AI", () => `我今天在 Ops Drills 上的学习小结如下。请：1. 用简单中文点评；2. 根据我错得多的地方，给我明天的复习重点；3. 出 2 道小题考我（先不要给答案）。\n\n${daySummary()}`, card));
    ck.append(card);
  }

  const ov = el.querySelector("#overall");
  for (const s of DATA.syllabus) {
    const pub = DATA.lessons.filter((x) => x.stage === s.stage);
    const tot = pub.reduce((n, x) => n + x.blocks.length, 0);
    const done = pub.reduce((n, x) => n + lessonProgress(x).done, 0);
    ov.append(h(`<a class="card stagecard" href="#/stage/${s.stage}"><div class="row"><b>${tx(`阶段 ${s.stage} · ${esc(s.title)}`, s.title_en && `Stage ${s.stage} · ${s.title_en}`)}</b><span class="spacer"></span><span class="muted">${pub.length}/${s.lessons.length} 课已上线</span></div>
      ${bar(tot ? (100 * done) / tot : 0)}<div class="muted small">${tot ? `学完 ${done}/${tot} 块` : "还没上线：前面的课学完就会做出来"}</div></a>`));
  }
  const bd = el.querySelector(".badges");
  for (const [icon, name, desc, got, nameEn] of badges()) bd.append(h(`<div class="badge ${got ? "got" : ""}" title="${esc(desc)}"><span>${icon}</span><b>${tx(name, nameEn)}</b><small>${esc(desc)}</small></div>`));
  $app.replaceChildren(el);
}

function daySummary() {
  const log = T();
  const names = log.blocks.map((id) => { const it = byId[id]; return it ? `${it.lesson.id}「${it.block.title}」` : id; });
  const right = log.quiz ? `${log.quizRight}/${log.quiz}` : "0";
  const weak = Object.entries(S.srs).filter(([id, s]) => byId[id] && s.wrong >= 2).slice(0, 5)
    .map(([id]) => { const it = byId[id]; return `${it.lesson.id}「${it.block.title}」的${it.kind === "quiz" ? "猜题" : "默写"}`; });
  return [
    `日期：${today()}`,
    `学完的小块：${names.length ? names.join("、") : "无"}`,
    `复习：${log.reviews} 项`,
    `猜输出：猜对 ${right}`,
    `默写：写对 ${log.drillsOk}/${log.drills}`,
    `经常错的：${weak.length ? weak.join("、") : "暂无"}`,
  ].join("\n");
}

/* ---------------- courses: 课程 → 阶段 → 课 → 小块 ---------------- */
function stageStats(s) {
  const pub = DATA.lessons.filter((x) => x.stage === s.stage);
  const total = pub.reduce((n, x) => n + x.blocks.length, 0);
  const done = pub.reduce((n, x) => n + lessonProgress(x).done, 0);
  return { pub, total, done };
}
function lessonList(s) {
  const ul = h(`<ul class="lessons"></ul>`);
  for (const it of s.lessons) {
    const L = DATA.lessons.find((x) => x.id === it.id);
    if (L) {
      const p = lessonProgress(L);
      ul.append(h(`<li><a href="#/l/${L.id}"><span class="lid">${esc(L.id)}</span><span class="t">${tx(esc(L.title), L.title_en || it.title_en)}</span><span class="spacer"></span><span class="muted">${p.done === p.total ? "✅" : `${p.done}/${p.total}`}</span><span class="go">›</span></a>${bar((100 * p.done) / p.total)}</li>`));
    } else {
      const li = h(`<li class="soon" role="button" tabindex="0" title="${esc(SOON_TIP)}"><span class="lid">${esc(it.id)}</span><span class="t">${tx(esc(it.title), it.title_en)}</span><span class="spacer"></span><span class="pill">${tx("制作中 ?", "coming")}</span></li>`);
      li.onclick = () => toast(SOON_TIP, 5000);
      ul.append(li);
    }
  }
  return ul;
}
const SOON_TIP = "「制作中」= 这一课还没上线。你学完前一课、把「讲」的答案发给 AI 检查通过后，AI 会根据你的情况把这一课做好放上来（通常第二天早上就有）。";
const soonNote = () => h(`<div class="soon-note"><span class="pill">制作中</span> 表示这一课<b>还没上线</b>：课是一课一课做的。学完前一课 → 在课程页最下面「讲」→ 复制答案发给 AI 检查 → 通过后，AI 就把下一课做好放上来（通常第二天早上）。这样每一课都能根据你上一课的掌握情况来调整。<div class="en">"Coming" means the lesson is not published yet. Lessons are made one at a time: finish the previous lesson, answer its "Explain" questions, and send them to the AI for review. Once you pass, the AI publishes the next lesson (usually the next morning), adjusted to how the last one went.</div></div>`);

function viewLessons() {
  const el = h(`<div><h1>${tx("课程", "Courses")}</h1>
    <div class="card body note-card">${md("课程分 6 个阶段。点一个阶段看里面的课。**课会一课一课地上线**：你学完一课、「讲」完给 AI 检查，AI 就把下一课做好放上来。灰色的是还没上线的。")}${enMd("The course has 6 stages. Tap a stage to see its lessons. **Lessons are published one at a time**: when you finish a lesson and the AI has reviewed your answers, it publishes the next one. Grey lessons are not published yet.")}</div></div>`);
  for (const s of DATA.syllabus) {
    const st = stageStats(s);
    el.append(h(`<a class="card stagecard" href="#/stage/${s.stage}"><div class="row"><span class="stage">${tx(`阶段 ${s.stage}`, `Stage ${s.stage}`)}</span><span class="spacer"></span><span class="muted small">${st.pub.length}/${s.lessons.length} 课已上线</span><span class="go">›</span></div>
      <b>${tx(esc(s.title), s.title_en)}</b>${bar(st.total ? (100 * st.done) / st.total : 0)}<div class="muted small">${st.total ? `学完 ${st.done}/${st.total} 块` : "还没上线：前面的课学完就会做出来"}</div></a>`));
  }
  $app.replaceChildren(el);
}

function viewStage(s) {
  const st = stageStats(s);
  const i = DATA.syllabus.indexOf(s);
  const prev = DATA.syllabus[i - 1], next = DATA.syllabus[i + 1];
  const from = cameFrom === "home" ? ["#/", "今天", "Today"] : ["#/lessons", "全部阶段", "All stages"];
  const el = h(`<div></div>`);
  el.append(backBar(from[0], from[1], "", from[2]));
  el.append(h(`<div><div class="stage">阶段 ${s.stage} / ${DATA.syllabus.length}</div><h1 style="margin-top:0">${tx(esc(s.title), s.title_en)}</h1>
    ${s.goal ? `<div class="card body note-card"><b>学完能做到：</b>${esc(s.goal)}${s.goal_en ? `<div class="en"><b>After this stage you can:</b> ${esc(s.goal_en)}</div>` : ""}</div>` : ""}
    <div class="row muted small"><span>${st.total ? `本阶段学完 ${st.done}/${st.total} 块` : "本阶段还没有上线的课"}</span><span class="spacer"></span><span>${st.pub.length}/${s.lessons.length} 课已上线</span></div>
    ${bar(st.total ? (100 * st.done) / st.total : 0)}</div>`));
  const card = h(`<div class="card"><h2 style="margin-top:0">${tx("课", "Lessons")}</h2></div>`);
  card.append(lessonList(s));
  if (st.pub.length < s.lessons.length) card.append(soonNote());
  el.append(card);
  const nav = h(`<div class="row"></div>`);
  if (prev) nav.append(h(`<a class="btn" href="#/stage/${prev.stage}">← 阶段 ${prev.stage}</a>`));
  nav.append(h(`<span class="spacer"></span>`));
  if (next) nav.append(h(`<a class="btn" href="#/stage/${next.stage}">阶段 ${next.stage} →</a>`));
  el.append(nav);
  $app.replaceChildren(el);
}

const KIND = { video: ["📺", "视频"], case: ["🧩", "实战案例"], doc: ["📄", "文档"], community: ["💬", "社区"] };
function resourcesCard(L) {
  if (!L.resources?.length) return null;
  const card = h(`<div class="card"><h2 style="margin-top:0">📺 ${tx("配套视频和案例", "Videos and real-world examples")}</h2><p class="muted small">视频是英文的，可以打开 YouTube 的自动字幕（设置 → 字幕 → 自动翻译 → 中文）。先学本课，卡住了再看。</p><ul class="res"></ul></div>`);
  const ul = card.querySelector("ul");
  for (const r of L.resources) {
    const [icon, name] = KIND[r.kind] || ["🔗", "链接"];
    ul.append(h(`<li><span class="ricon">${icon}</span><div><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
      <div class="muted small">${name}${r.source ? ` · ${esc(r.source)}` : ""}${r.note ? ` · ${esc(r.note)}` : ""}</div></div></li>`));
  }
  return card;
}

function viewLesson(L) {
  const p = lessonProgress(L);
  const el = h(`<div></div>`);
  el.append(backBar(`#/stage/${L.stage}`, `阶段 ${L.stage}`, "", `Stage ${L.stage}`));
  el.append(h(`<div><h1>${esc(L.id)} · ${tx(esc(L.title), L.title_en)}</h1>
    <div class="row muted small"><span>本课进度 ${p.done}/${p.total} 块</span></div>${bar((100 * p.done) / p.total)}
    ${L.intro ? `<div class="card body">${md(L.intro)}${enMd(L.intro_en)}</div>` : ""}
    <div class="card"><h2 style="margin-top:0">${tx("小块", "Blocks")}</h2><ul class="blocks"></ul></div></div>`));
  const ul = el.querySelector(".blocks");
  L.blocks.forEach((b, i) => {
    const s = stepsOf(b);
    ul.append(h(`<li><a href="${blockHref(L, b, s.done ? 1 : 0)}"><span>${s.done ? "✅" : "⬜"}</span><span>${i + 1}. ${tx(esc(b.title), b.title_en)}</span>
      <span class="dots">${[s.copy, s.tweak, s.quiz || !b.quiz.length, s.drill || !b.drills.length].map((x, j) => `<i class="${x ? "on " + STEP_KEYS[j] : ""}" title="${STEP_NAMES[j]}"></i>`).join("")}</span></a></li>`));
  });
  const rc = resourcesCard(L);
  if (rc) el.append(rc);
  if (L.questions.length) el.append(sayCard(L));
  $app.replaceChildren(el);
  if (location.hash.endsWith("#say")) el.querySelector("#say")?.scrollIntoView();
}

/** 讲: answer the lesson's questions in your own words; copy to give to the AI. */
function sayCard(L) {
  const ans = S.answers[L.id] || [];
  const done = lessonDone(L);
  const card = h(`<div class="card say-card" id="say"><h2 style="margin-top:0">🗣️ ${tx("讲：用自己的话回答", "Explain it in your own words")}</h2><p class="muted">${done ? "整课学完了！写完点「复制答案」，粘贴给 AI 检查。自动保存。" : "整课学完后再写（现在也可以先写草稿）。自动保存。"}</p></div>`);
  L.questions.forEach((q, i) => {
    card.append(h(`<div><p><b>${i + 1}. </b>${esc(q)}</p>${L.questions_en?.[i] ? `<div class="en">${i + 1}. ${esc(L.questions_en[i])}</div>` : ""}</div>`));
    const ta = h(`<textarea class="say" placeholder="用你自己的话写…"></textarea>`);
    ta.value = ans[i] || "";
    ta.oninput = () => { S.answers[L.id] = S.answers[L.id] || []; S.answers[L.id][i] = ta.value; save("answers"); };
    card.append(ta);
  });
  const btn = h(`<button class="primary" style="margin-top:10px">📋 ${tx("复制答案给 AI 检查", "Copy answers for AI review")}</button>`);
  btn.onclick = async () => {
    const a = S.answers[L.id] || [];
    const text = `${L.id} 做完了，帮我检查。我的「讲」：\n` + L.questions.map((q, i) => `${i + 1}. ${q}\n答：${(a[i] || "").trim() || "（没写）"}`).join("\n\n");
    await copyText(text, card);
    const filled = L.questions.every((_, i) => (a[i] || "").trim());
    if (done && filled && !S.said[L.id]) { S.said[L.id] = today(); save("said"); touchDay(); addXP(30, "🗣️ 讲完一课"); }
  };
  card.append(btn);
  return card;
}

/* ---------------- one block, 4 steps ---------------- */
function viewBlock(L, b, step) {
  const idx = L.blocks.indexOf(b);
  const s = stepsOf(b);
  const short = shortId(b);
  const flags = [s.copy, s.tweak, s.quiz || !b.quiz.length, s.drill || !b.drills.length];
  const p = lessonProgress(L);
  const el = h(`<div class="blockview step-${STEP_KEYS[step - 1]}"></div>`);
  el.append(backBar(`#/l/${L.id}`, `${L.id} 本课目录`, `<span class="muted small">第 ${idx + 1}/${L.blocks.length} 块 · 已学完 ${p.done}</span>`, `Lesson ${L.id}`));
  el.append(h(`<div>${bar((100 * (idx + (flags.filter(Boolean).length / 4))) / L.blocks.length)}
    <div class="row"><h1>${tx(esc(b.title), b.title_en)}</h1><span class="spacer"></span></div>
    <div class="steps">${STEP_NAMES.map((n, i) => `<a href="#/l/${L.id}/${short}/${i + 1}" class="${STEP_KEYS[i]} ${i + 1 === step ? "on" : ""} ${flags[i] ? "done" : ""}">${"①②③④"[i]} ${tx(n, STEP_NAMES_EN[i])}</a>`).join("")}</div>
    <div class="steptip">${STEP_TIPS[step - 1]}<div class="en">${STEP_TIPS_EN[step - 1]}</div></div>
    <div id="stepbody"></div>
    <div class="navrow"></div></div>`));
  el.querySelector(".row").append(starBtn(b.id));
  const body = el.querySelector("#stepbody");
  const nav = el.querySelector(".navrow");
  const go = (st) => { location.hash = `#/l/${L.id}/${short}/${st}`; };
  const nextBlock = L.blocks[idx + 1];
  const prev = step > 1 ? h(`<button>← ${tx("上一步", "Back")}</button>`) : idx > 0 ? h(`<button>← ${tx("上一块", "Previous block")}</button>`) : h(`<a class="btn" href="#/l/${L.id}">← ${tx("本课目录", "Lesson")}</a>`);
  if (step > 1) prev.onclick = () => go(step - 1);
  else if (idx > 0) prev.onclick = () => (location.hash = `#/l/${L.id}/${shortId(L.blocks[idx - 1])}/1`);
  const label = step < 4 ? tx(`下一步：${STEP_NAMES[step]} →`, `Next: ${STEP_NAMES_EN[step]}`) : nextBlock ? tx("下一块 →", "Next block") : tx("完成本课 →", "Finish lesson");
  const next = h(`<button class="primary">${label}</button>`);
  next.onclick = () => {
    if (step === 2 && !S.tweaked[b.id]) { S.tweaked[b.id] = true; save("tweaked"); touchDay(); addXP(5); }
    checkBlockDone(b);
    if (step < 4) go(step + 1);
    else location.hash = nextBlock ? `#/l/${L.id}/${shortId(nextBlock)}/1` : `#/l/${L.id}`;
  };
  nav.append(prev, next);

  if (step === 1) stepCopy(body, b);
  else if (step === 2) stepTweak(body, b);
  else if (step === 3) stepQuiz(body, b.quiz, () => go(4), b);
  else stepDrill(body, b.drills, b);
  S.last = location.hash; save("last");
  $app.replaceChildren(el);
  window.scrollTo(0, 0);
}

function stepCopy(body, b) {
  body.append(h(`<div class="card body stepcard">${md(b.body)}${enMd(b.body_en)}</div>`));
  const markCopied = () => { if (!S.copied[b.id]) { S.copied[b.id] = true; save("copied"); touchDay(); addXP(10, "✍️ 抄对了"); checkBlockDone(b); } };
  if (!b.example) { markCopied(); return; }
  if (b.lang !== "python") {
    body.append(h(`<div class="card stepcard"><b>例子</b><pre class="code">${esc(b.example)}</pre></div>`));
    markCopied();
    return;
  }
  const card = h(`<div class="card stepcard"><b>例子</b><pre class="code">${esc(b.example)}</pre>
    <p><b>✍️ 抄：</b>在下面<b>一个字一个字敲一遍</b>（不要粘贴），然后运行。输出和例子一样就过关。</p><div class="en"><b>Copy:</b> type the example below yourself, character by character (no pasting), then run it. It passes when the output matches.</div></div>`);
  const draftKey = b.id + "#copy";
  const ta = editor({ value: S.draft[draftKey] || "", placeholder: "照着上面的例子敲…（Tab = 4 个空格，Ctrl+Enter = 运行）", onChange: (v) => { S.draft[draftKey] = v; save("draft"); }, onRun: () => run() });
  ta.addEventListener("paste", () => toast("建议自己敲一遍，手会记住写法 🙂"));
  const res = h(`<div></div>`);
  const status = h(`<span class="status" data-run></span>`);
  const btn = h(`<button class="primary">▶ ${tx("运行", "Run")}</button>`);
  const skip = h(`<button>${tx("我已经很熟了，跳过", "I know this, skip")}</button>`);
  async function run() {
    btn.disabled = true;
    const r = await runner.run(ta.value, b.files, status);
    btn.disabled = false; status.textContent = "";
    if (showResult(res, r, b.exampleOut)) { markCopied(); return; }
    const row = h(`<div class="row" style="margin-top:6px"></div>`);
    row.append(aiBtn("看不懂？复制给 AI", () => `我在照着例子抄 Python 代码，但结果不对。请用简单中文告诉我哪里抄错了（指出具体哪一行），不要重写整段。\n\n例子：\n${fence(b.example)}\n我抄的：\n${fence(ta.value)}\n我的输出/报错：\n${fence(r.err || r.out)}`, res));
    res.append(row);
  }
  btn.onclick = run;
  skip.onclick = () => { S.copied[b.id] = true; save("copied"); checkBlockDone(b); toast("好的，下一步：改"); location.hash = location.hash.replace(/\/1$/, "/2"); };
  card.append(ta, h(`<div class="row" style="margin-top:8px"></div>`));
  card.lastChild.append(btn, status, h(`<span class="spacer"></span>`), S.copied[b.id] ? h(`<span class="muted">✓ 已完成</span>`) : skip);
  card.append(res);
  body.append(card);
}

function stepTweak(body, b) {
  const card = h(`<div class="card stepcard"></div>`);
  let ta = null, lastOut = "";
  b.tweaks.forEach((t, i) => {
    const tw = h(`<div class="tweak"><div class="body">${md(`**${i + 1}.** ${t.ask}`)}${t.ask_en ? enMd(`**${i + 1}.** ${t.ask_en}`) : ""}</div></div>`);
    const g = h(`<textarea class="guess" placeholder="我猜：…"></textarea>`);
    const k = `${b.id}#guess${i}`;
    g.value = S.draft[k] || ""; g.oninput = () => { S.draft[k] = g.value; save("draft"); };
    tw.append(g);
    const row = h(`<div class="row"></div>`);
    if (t.answer) row.append(h(`<details><summary>${tx("看解释", "Explanation")}</summary><div class="body">${md(t.answer)}${enMd(t.answer_en)}</div></details>`));
    row.append(h(`<span class="spacer"></span>`), aiBtn("复制给 AI 讲解", () => `我在练 Python「改一处、先猜结果」。请用简单中文给我讲解，并告诉我我猜得对不对、为什么。\n\n题目：${t.ask}\n我猜：${g.value.trim() || "（没写）"}\n\n原来的代码：\n${fence(b.example)}${ta ? `\n我改过的代码：\n${fence(ta.value)}\n运行结果：\n${fence(lastOut)}` : ""}${t.answer ? `\n网站的解释：${t.answer}` : ""}`, tw));
    tw.append(row);
    card.append(tw);
  });
  if (!b.tweaks.length) card.append(h(`<p class="muted">这一块没有改的题，随便改改例子玩一玩就行。</p>`));
  if (b.lang === "python" && b.example) {
    const k = b.id + "#tweak";
    ta = editor({ value: S.draft[k] ?? b.example, onChange: (v) => { S.draft[k] = v; save("draft"); }, onRun: () => run() });
    const res = h(`<div></div>`);
    const status = h(`<span class="status" data-run></span>`);
    const btn = h(`<button class="primary">▶ ${tx("运行", "Run")}</button>`);
    const reset = h(`<button>↺ ${tx("恢复原样", "Reset")}</button>`);
    async function run() { btn.disabled = true; const r = await runner.run(ta.value, b.files, status); btn.disabled = false; status.textContent = ""; lastOut = r.err || r.out; showResult(res, r); }
    btn.onclick = run;
    reset.onclick = () => { ta.value = b.example; S.draft[k] = b.example; save("draft"); res.innerHTML = ""; };
    const row = h(`<div class="row" style="margin-top:8px"></div>`); row.append(btn, status, h(`<span class="spacer"></span>`), reset);
    card.append(h(`<p style="margin-top:14px"><b>${tx("在这里改代码试：", "Try your change here:")}</b></p>`), ta, row, res);
  }
  body.append(card);
}

/** One guess-the-output card. onGraded(result) after self-grading. */
function quizCard(q, onGraded, headline, ctx = "learn") {
  const card = h(`<div class="card stepcard guesscard">${headline || ""}<div class="row"><b>${tx("这段代码会输出什么？", "What does this code print?")}</b><span class="spacer"></span></div><pre class="code">${esc(q.code)}</pre></div>`);
  card.querySelector(".row").append(starBtn(q.id));
  const g = h(`<textarea class="guess" placeholder="把你猜的输出写在这里（写了才能帮你对答案）"></textarea>`);
  const show = h(`<button class="primary">${tx("对答案", "Check")}</button>`);
  card.append(g, h(`<div class="row" style="margin-top:8px"></div>`));
  card.lastChild.append(show);
  show.onclick = () => {
    show.remove();
    const typed = g.value.trim() !== "";
    const right = typed && guessMatches(g.value, q.answer);
    g.readOnly = true;
    const verdict = !typed ? `<div class="verdict none">${tx("你没写猜测：在心里对一下，诚实地选。", "No guess written: compare in your head and grade yourself honestly.")}</div>`
      : right ? `<div class="verdict ok">${tx("✔ 猜对了！", "Correct!")}</div>` : `<div class="verdict no">${tx("✗ 和你猜的不一样，看看差在哪", "Not quite: see what is different")}</div>`;
    const ans = h(`<div>${verdict}<p style="margin:10px 0 4px"><b>${q.error ? tx("会报错：", "It raises an error:") : tx("正确输出：", "Correct output:")}</b></p><pre class="out">${esc(q.answer) || "（没有输出）"}</pre>${q.explain ? `<div class="body">${md(q.explain)}${enMd(q.explain_en)}</div>` : ""}
      <div class="row" style="margin:8px 0"></div>
      <p class="muted" style="margin-bottom:4px">${right ? "猜对了，选一个：" : "诚实地选："}</p><div class="row grades"></div></div>`);
    ans.querySelector(".row").append(aiBtn("复制给 AI 讲解", () => `我在练 Python「看代码猜输出」。请用简单中文：1. 一行一行讲清楚为什么输出是这样；2. 如果我猜错了，指出我错在哪个理解上；3. 再出一道类似的小题考我（先别给答案）。\n\n代码：\n${fence(q.code)}\n我猜的输出：\n${fence(g.value.trim() || "（没写）")}\n正确${q.error ? "报错" : "输出"}：\n${fence(q.answer)}${q.explain ? `\n网站的简短解释：${q.explain}` : ""}`, ans));
    const row = ans.querySelector(".grades");
    for (const [r, label, cls, en] of [["wrong", "不认识", "bad", "Did not know"], ["fuzzy", "模糊", "fuzzy", "Unsure"], ["good", "认识", "good", "Knew it"]]) {
      const bt = h(`<button class="${cls} ${right && r === "good" ? "suggest" : ""} ${typed && !right && r === "wrong" ? "suggest" : ""}" data-grade="${r}">${label}<span class="en-i">${en}</span></button>`);
      bt.onclick = () => {
        S.srs[q.id] = grade(S.srs[q.id], r, today()); save("srs"); touchDay();
        bump("quiz"); if (right) bump("quizRight");
        if (ctx === "review") bump("reviews");
        addXP((ctx === "review" ? 5 : 3) + (right ? 2 : 0), right ? "🎯 猜对" : "");
        checkBlockDone(byId[q.id].block);
        onGraded(r);
      };
      row.append(bt);
    }
    card.append(ans);
  };
  return card;
}

function stepQuiz(body, quiz, done, b) {
  if (!quiz.length) { body.append(h(`<div class="card empty">这一块没有猜题，直接去默写。</div>`)); return; }
  let i = 0;
  const holder = h(`<div></div>`);
  const draw = () => {
    if (i >= quiz.length) { holder.replaceChildren(h(`<div class="card empty">✅ 猜完了。下一步：默写。</div>`)); setTimeout(done, 700); return; }
    holder.replaceChildren(quizCard(quiz[i], () => { i++; draw(); }, `<div class="muted">第 ${i + 1} / ${quiz.length} 题</div>`));
  };
  draw();
  body.append(holder);
}

/** One write-from-memory drill. onGraded(result) when it is passed or given up. */
function drillCard(d, onGraded, headline, ctx = "learn") {
  const card = h(`<div class="card stepcard">${headline || ""}<div class="row"><b>✍️ ${tx("默写", "From memory")}</b><span class="spacer"></span></div><div class="body task">${md(d.task)}${enMd(d.task_en)}</div></div>`);
  card.querySelector(".row").append(starBtn(d.id));
  const k = d.id + "#draft";
  const ta = editor({ value: S.draft[k] ?? d.starter, placeholder: "关掉小抄，从这里开始写…（Ctrl+Enter 运行）", onChange: (v) => { S.draft[k] = v; save("draft"); }, onRun: () => run() });
  const res = h(`<div></div>`);
  const status = h(`<span class="status" data-run></span>`);
  const btn = h(`<button class="primary">▶ ${tx("运行并检查", "Run and check")}</button>`);
  const hintBtn = h(`<button>💡 ${tx("提示", "Hint")}</button>`);
  const solBtn = h(`<button hidden>${tx("看答案", "Show answer")}</button>`);
  const giveUp = h(`<button class="bad" hidden>${tx("不会，下次再练", "Skip for now")}</button>`);
  const hints = h(`<ol class="hints"></ol>`);
  let shown = 0, sawSolution = false, graded = false, last = null;
  if (!d.hints.length) hintBtn.hidden = true;
  const finish = (r) => {
    if (graded) return; graded = true;
    S.srs[d.id] = grade(S.srs[d.id], r, today()); save("srs"); touchDay();
    bump("drills"); if (r !== "wrong") bump("drillsOk");
    if (ctx === "review") bump("reviews");
    if (r !== "wrong") addXP(r === "good" ? 15 : 8, "✍️ 默写写对");
    else if (ctx === "review") addXP(5);
    checkBlockDone(byId[d.id].block);
    onGraded(r);
  };
  async function run() {
    btn.disabled = true;
    const r = await runner.run(ta.value, d.files, status);
    btn.disabled = false; status.textContent = ""; last = r;
    const ok = showResult(res, r, d.expect);
    solBtn.hidden = false; giveUp.hidden = ok;
    if (ok) {
      // Passing after peeking at the answer still counts as "not yet": it comes back today.
      if (sawSolution) res.append(h(`<div class="muted" style="margin-top:6px">看过答案了，今天会再出现一次，到时候不看答案再写一遍。</div>`));
      finish(sawSolution ? "wrong" : shown > 0 ? "fuzzy" : "good");
    } else {
      const row = h(`<div class="row" style="margin-top:6px"></div>`);
      row.append(aiBtn("把我的代码发给 AI 要提示", () => `我在练 Python 默写题，写得不对。请用简单中文给我**一个提示**（指出问题在哪一行、是什么概念），**不要直接给完整答案**。\n\n题目：\n${d.task}\n\n我的代码：\n${fence(ta.value)}\n我的输出/报错：\n${fence(last.err || last.out)}\n应该输出：\n${fence(d.expect)}`, res));
      res.append(row);
    }
  }
  btn.onclick = run;
  hintBtn.onclick = () => { if (shown < d.hints.length) { const he = d.hints_en?.[shown]; hints.append(h(`<li>${md(d.hints[shown]).replace(/^<p>|<\/p>$/g, "")}${he ? `<div class="en">${md(he).replace(/^<p>|<\/p>$/g, "")}</div>` : ""}</li>`)); shown++; } hintBtn.textContent = shown < d.hints.length ? `💡 提示（${shown}/${d.hints.length}）` : "💡 没有更多提示了"; hintBtn.disabled = shown >= d.hints.length; };
  solBtn.onclick = () => { sawSolution = true; solBtn.remove(); res.append(h(`<details open><summary>参考答案（看懂后关掉，自己再写一遍）</summary><pre class="code">${esc(d.solution)}</pre></details>`)); };
  giveUp.onclick = () => { finish("wrong"); toast("没关系，今天晚些时候它会再出现"); };
  const row = h(`<div class="row" style="margin-top:8px"></div>`);
  row.append(btn, status, h(`<span class="spacer"></span>`), hintBtn, solBtn, giveUp);
  card.append(ta, row, hints, res);
  return card;
}

function stepDrill(body, drills) {
  if (!drills.length) { body.append(h(`<div class="card empty">这一块没有默写题。</div>`)); return; }
  drills.forEach((d, i) => {
    const st = S.srs[d.id];
    const head = `<div class="muted">第 ${i + 1} / ${drills.length} 题${st && st.box > 0 ? " · ✓ 写对过" : ""}</div>`;
    body.append(drillCard(d, () => {}, head));
  });
}

/* ---------------- review / stars / settings ---------------- */
function viewReview() {
  const q = dueQueue(allItems(), S.srs, today());
  const el = h(`<div></div>`);
  el.append(backBar("#/", "今天", `<span class="muted small">还剩 <b>${q.length}</b> 项 · 默写在前</span>`, "Today"));
  el.append(h(`<h1>📅 ${tx("今日复习", "Today's review")}</h1>`));
  const box = h(`<div id="rv"></div>`);
  el.append(box);
  if (!q.length) {
    const nx = nextUndone();
    box.append(h(`<div class="card empty">🎉 今天的复习做完了。<br><br>${nx ? `<a class="btn primary" href="${blockHref(nx.L, nx.b, nx.step)}">下一项任务：学新内容</a>` : `<a class="btn primary" href="#/">回到今天</a>`}</div>`));
  } else {
    const it = byId[q[0].id];
    const head = `<div class="crumb">${esc(it.lesson.id)} › ${esc(it.block.title)}</div>`;
    const next = () => setTimeout(viewReview, 700);
    box.append(it.kind === "quiz" ? quizCard(it.item, () => viewReview(), head, "review") : drillCard(it.item, next, head, "review"));
  }
  $app.replaceChildren(el);
}

function viewStars() {
  const ids = Object.keys(S.star).filter((id) => byId[id]);
  const el = h(`<div><h1>⭐ 收藏</h1>${ids.length ? "" : `<div class="card empty">还没有收藏。看到难的、容易忘的，点 ☆ 收藏起来。</div>`}</div>`);
  for (const id of ids) {
    const it = byId[id];
    const step = it.kind === "block" ? 1 : it.kind === "quiz" ? 3 : 4;
    const label = it.kind === "block" ? "讲解" : it.kind === "quiz" ? "猜：" + it.item.code.split("\n")[0] : "默写：" + it.item.task.split("\n")[0];
    el.append(h(`<a class="card lesson" href="#/l/${it.lesson.id}/${shortId(it.block)}/${step}"><div class="muted">${esc(it.lesson.id)} › ${esc(it.block.title)}</div><div class="t">${esc(label.slice(0, 80))}</div></a>`));
  }
  $app.replaceChildren(el);
}

function viewSettings() {
  const el = h(`<div><h1>⚙ 设置</h1>
    <div class="card"><h2 style="margin-top:0">每天学几块新内容</h2><p class="muted">「今日任务」按这个数字判断你今天学够没有。每块大约 20–40 分钟。</p>
      <div class="row" id="goal"></div></div>
    <div class="card"><h2 style="margin-top:0">学习进度</h2><p class="muted">进度只存在<b>这个浏览器</b>里，手机和电脑是分开的。换设备前先导出，到新设备上导入。</p>
      <div class="row"><button id="ex">⬇ 导出进度</button><label class="btn">⬆ 导入进度<input id="im" type="file" accept="application/json" hidden></label><span class="spacer"></span><button id="rs" class="bad">清空进度</button></div></div>
    <div class="card body">${md("**关于**\n\n代码在你的浏览器里运行（Pyodide），不会上传到任何地方。第一次运行要下载约 10MB 的 Python，之后浏览器会记住。\n\n课程内容放在 GitHub 上，每次更新前所有例子和答案都会先用真的 Python 跑一遍。")}<p class="muted">内容更新于 ${esc((DATA.built || "").slice(0, 16).replace("T", " "))}</p></div></div>`);
  const g = el.querySelector("#goal");
  for (const n of [1, 2, 3]) {
    const b = h(`<button class="${Number(S.goal) === n ? "primary" : ""}">${n} 块</button>`);
    b.onclick = () => { S.goal = n; save("goal"); viewSettings(); toast(`好的，每天 ${n} 块`); };
    g.append(b);
  }
  el.querySelector("#ex").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "ops-drills", exported: new Date().toISOString(), data: S }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ops-drills-进度-${today()}.json`; a.click();
  };
  el.querySelector("#im").onchange = async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.app !== "ops-drills" || !j.data) throw new Error();
      for (const k of KEYS) { S[k] = j.data[k] !== undefined ? j.data[k] : fresh(k); save(k); }
      backfill(); toast("导入成功"); updateHeader();
    } catch { toast("这个文件不是 Ops Drills 的进度文件"); }
  };
  el.querySelector("#rs").onclick = () => {
    if (!confirm("确定清空这个浏览器里的全部学习进度吗？清空后不能恢复（建议先导出）。")) return;
    for (const k of KEYS) { S[k] = fresh(k); save(k); }
    toast("已清空"); updateHeader();
  };
  $app.replaceChildren(el);
}

/** Older progress files have no doneAt/xp: count finished blocks as done earlier, without logging them as today. */
function backfill() {
  let changed = false;
  for (const L of DATA.lessons) for (const b of L.blocks) if (!S.doneAt[b.id] && stepsOf(b).done) { S.doneAt[b.id] = "earlier"; changed = true; }
  if (changed) save("doneAt");
  if (S.xp.total == null) {
    S.xp.total = Object.keys(S.copied).length * 10 + Object.keys(S.tweaked).length * 5 + Object.keys(S.srs).length * 5 + Object.keys(S.doneAt).length * 20;
    save("xp");
  }
}

/* ---------------- router ---------------- */
// Where the user came from, so a stage page knows whether "back" means 今天 or 课程.
let cameFrom = "lessons";
let lastTop = "home";
function route() {
  const raw = location.hash.replace(/#say$/, "");
  const parts = raw.replace(/^#\/?/, "").split("/").filter(Boolean);
  const nav = parts[0] === "l" || parts[0] === "stage" ? "lessons" : parts[0] || "home";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  updateHeader();
  if (!parts.length) { lastTop = "home"; return viewHome(); }
  if (parts[0] === "lessons") { lastTop = "lessons"; return viewLessons(); }
  if (parts[0] === "stage") {
    const s = DATA.syllabus.find((x) => x.stage === Number(parts[1]));
    if (!s) return viewLessons();
    cameFrom = lastTop;
    return viewStage(s);
  }
  if (parts[0] === "review") return viewReview();
  if (parts[0] === "stars") return viewStars();
  if (parts[0] === "settings") return viewSettings();
  if (parts[0] === "l") {
    const L = DATA.lessons.find((x) => x.id === parts[1]);
    if (!L) return viewLessons();
    const b = parts[2] && L.blocks.find((x) => x.id === `${L.id}.${parts[2]}`);
    if (!b) return viewLesson(L);
    const step = Math.min(4, Math.max(1, Number(parts[3]) || firstStep(b)));
    return viewBlock(L, b, step);
  }
  viewHome();
}

async function main() {
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    DATA = await res.json();
    DATA.syllabus = DATA.syllabus || [];
  } catch {
    $app.innerHTML = `<div class="card empty">课程加载失败，请检查网络后刷新。</div>`;
    return;
  }
  index();
  backfill();
  applyEn();
  document.getElementById("en-toggle").onclick = () => {
    S.en = !S.en; save("en"); applyEn();
    toast(S.en ? "已显示英文字幕 · English subtitles on" : "已隐藏英文字幕 · English subtitles off");
  };
  window.addEventListener("hashchange", route);
  route();
}
main();

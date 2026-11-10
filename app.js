// @ts-nocheck
// Ops Drills UI. Hash routes:
//   #/  home · #/lessons · #/l/<lesson> · #/l/<lesson>/<block>/<step 1-4> · #/review · #/stars · #/settings
import { grade, isDue, sameOutput, normOut, explainError, md, esc, dueQueue, blockSteps, dayKey } from "./core.js";

const $app = document.getElementById("app");
const STEP_NAMES = ["学 + 抄", "改", "猜", "默写"];

/* ---------------- storage ---------------- */
const KEYS = ["srs", "copied", "tweaked", "star", "draft", "answers", "days", "last"];
const store = {
  get(k, d) { try { const v = localStorage.getItem("od." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("od." + k, JSON.stringify(v)); } catch { /* private mode: keep in memory only */ } },
};
const S = Object.fromEntries(KEYS.map((k) => [k, store.get(k, k === "last" ? null : {})]));
const save = (k) => store.set(k, S[k]);
const today = () => dayKey(new Date());
function touchDay() { S.days[today()] = (S.days[today()] || 0) + 1; save("days"); }

/* ---------------- data ---------------- */
let DATA = { lessons: [] };
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
function lessonProgress(L) { const done = L.blocks.filter((b) => stepsOf(b).done).length; return { done, total: L.blocks.length }; }
function nextUndone() {
  for (const L of DATA.lessons) for (const b of L.blocks) {
    const s = stepsOf(b);
    if (!s.done) return { L, b, step: !s.copy ? 1 : !s.tweak ? 2 : !s.quiz && b.quiz.length ? 3 : 4 };
  }
  return null;
}
function dueCount() { return dueQueue(allItems(), S.srs, today()).length; }
function updateBadge() {
  const n = dueCount(); const b = document.getElementById("due-badge");
  b.hidden = !n; b.textContent = String(n);
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

/* ---------------- small UI helpers ---------------- */
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200); }
function starBtn(id) {
  const b = h(`<button class="star" title="收藏" aria-label="收藏">${S.star[id] ? "⭐" : "☆"}</button>`);
  b.onclick = () => { if (S.star[id]) delete S.star[id]; else S.star[id] = true; save("star"); b.textContent = S.star[id] ? "⭐" : "☆"; toast(S.star[id] ? "已收藏" : "已取消收藏"); };
  return b;
}

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

/* ---------------- views ---------------- */
function viewHome() {
  const nx = nextUndone();
  const due = dueCount();
  const days = Object.keys(S.days).length;
  const learned = DATA.lessons.reduce((n, L) => n + lessonProgress(L).done, 0);
  const totalBlocks = DATA.lessons.reduce((n, L) => n + L.blocks.length, 0);
  const el = h(`<div>
    <h1>今天 · ${today()}</h1>
    <div class="kpis"><div><b>${learned}/${totalBlocks}</b><span>学完的小块</span></div><div><b>${due}</b><span>今天要复习</span></div><div><b>${days}</b><span>练习过的天数</span></div></div>
    ${due ? `<div class="card hero"><div class="row"><div><b>📅 先复习 ${due} 项</b><div class="muted">到期的猜题和默写，先把它们做完。</div></div><span class="spacer"></span><a class="btn primary big" href="#/review">开始复习</a></div></div>` : ""}
    ${nx ? `<div class="card ${due ? "" : "hero"}"><div class="row"><div><b>▶ 继续学习：${esc(nx.L.id)} ${esc(nx.L.title)}</b><div class="muted">${esc(nx.b.title)} · 第 ${nx.step} 步「${STEP_NAMES[nx.step - 1]}」</div></div><span class="spacer"></span><a class="btn ${due ? "" : "primary"} big" href="#/l/${nx.L.id}/${nx.b.id.split(".")[1]}/${nx.step}">继续</a></div></div>`
      : `<div class="card empty">🎉 现有的课都学完了。<br>回答每课最后的「讲」，然后告诉 AI 做下一课。</div>`}
    <h2>每一小块怎么学</h2>
    <div class="card body">${md("**① 学 + 抄**：读讲解，把例子**自己敲一遍**（不要粘贴），运行对上结果。\n**② 改**：按提示改一处，**先猜结果再运行**。\n**③ 猜**：看代码猜输出，诚实地选 不认识 / 模糊 / 认识。\n**④ 默写**：只看一句要求，从空白开始写，网站自动判对错。\n\n学过的猜题和默写会在 1、2、4、7、15、30 天后回到「复习」里；做错的当天就回来。")}</div>
  </div>`);
  $app.replaceChildren(el);
}

function viewLessons() {
  const el = h(`<div><h1>课程</h1></div>`);
  let stage = null;
  for (const L of DATA.lessons) {
    if (L.stage !== stage) { stage = L.stage; el.append(h(`<div class="stage">阶段 ${stage}</div>`)); }
    const p = lessonProgress(L);
    el.append(h(`<a class="card lesson" href="#/l/${L.id}"><div class="row"><span class="t">${esc(L.id)} · ${esc(L.title)}</span><span class="spacer"></span><span class="muted">${p.done}/${p.total}</span></div><div class="bar"><i style="width:${(100 * p.done) / p.total}%"></i></div></a>`));
  }
  $app.replaceChildren(el);
}

function viewLesson(L) {
  const el = h(`<div><div class="crumb"><a href="#/lessons">课程</a> › ${esc(L.id)}</div><h1>${esc(L.id)} · ${esc(L.title)}</h1>
    ${L.intro ? `<div class="card body">${md(L.intro)}</div>` : ""}
    <div class="card"><ul class="blocks"></ul></div></div>`);
  const ul = el.querySelector(".blocks");
  L.blocks.forEach((b, i) => {
    const s = stepsOf(b);
    const step = !s.copy ? 1 : !s.tweak ? 2 : !s.quiz && b.quiz.length ? 3 : 4;
    ul.append(h(`<li><a href="#/l/${L.id}/${b.id.split(".")[1]}/${s.done ? 1 : step}"><span>${s.done ? "✅" : "⬜"}</span><span>${i + 1}. ${esc(b.title)}</span>
      <span class="dots">${[s.copy, s.tweak, s.quiz || !b.quiz.length, s.drill || !b.drills.length].map((x) => `<i class="${x ? "on" : ""}"></i>`).join("")}</span></a></li>`));
  });
  if (L.questions.length) el.append(sayCard(L));
  $app.replaceChildren(el);
}

/** 讲: answer the lesson's questions in your own words; copy to give to the AI. */
function sayCard(L) {
  const ans = S.answers[L.id] || [];
  const card = h(`<div class="card"><h2 style="margin-top:0">🗣️ 讲：用自己的话回答</h2><p class="muted">整课学完后再写。写完点「复制答案」，粘贴给 AI 检查。自动保存。</p></div>`);
  L.questions.forEach((q, i) => {
    card.append(h(`<p><b>${i + 1}. </b>${esc(q)}</p>`));
    const ta = h(`<textarea class="say" placeholder="用你自己的话写…"></textarea>`);
    ta.value = ans[i] || "";
    ta.oninput = () => { S.answers[L.id] = S.answers[L.id] || []; S.answers[L.id][i] = ta.value; save("answers"); };
    card.append(ta);
  });
  const btn = h(`<button class="primary" style="margin-top:10px">📋 复制答案</button>`);
  btn.onclick = async () => {
    const a = S.answers[L.id] || [];
    const text = `${L.id} 做完了，帮我检查。我的「讲」：\n` + L.questions.map((q, i) => `${i + 1}. ${q}\n答：${(a[i] || "").trim() || "（没写）"}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); toast("已复制，粘贴给 AI 就行"); }
    catch { const t = h(`<textarea class="say"></textarea>`); t.value = text; card.append(t); t.select(); toast("请手动复制下面的文字"); }
  };
  card.append(btn);
  return card;
}

function viewBlock(L, b, step) {
  const idx = L.blocks.indexOf(b);
  const s = stepsOf(b);
  const short = b.id.split(".")[1];
  const flags = [s.copy, s.tweak, s.quiz || !b.quiz.length, s.drill || !b.drills.length];
  const el = h(`<div>
    <div class="crumb"><a href="#/lessons">课程</a> › <a href="#/l/${L.id}">${esc(L.id)} ${esc(L.title)}</a> › ${idx + 1}/${L.blocks.length}</div>
    <div class="row"><h1>${esc(b.title)}</h1><span class="spacer"></span></div>
    <div class="steps">${STEP_NAMES.map((n, i) => `<a href="#/l/${L.id}/${short}/${i + 1}" class="${i + 1 === step ? "on" : ""} ${flags[i] ? "done" : ""}">${"①②③④"[i]} ${n}</a>`).join("")}</div>
    <div id="stepbody"></div>
    <div class="navrow"></div></div>`);
  el.querySelector(".row").append(starBtn(b.id));
  const body = el.querySelector("#stepbody");
  const nav = el.querySelector(".navrow");
  const go = (st) => { location.hash = `#/l/${L.id}/${short}/${st}`; };
  const nextBlock = L.blocks[idx + 1];
  const prev = step > 1 ? h(`<button>← 上一步</button>`) : idx > 0 ? h(`<button>← 上一块</button>`) : h(`<span></span>`);
  if (step > 1) prev.onclick = () => go(step - 1);
  else if (idx > 0) prev.onclick = () => (location.hash = `#/l/${L.id}/${L.blocks[idx - 1].id.split(".")[1]}/1`);
  const next = step < 4 ? h(`<button class="primary">下一步 →</button>`) : nextBlock ? h(`<button class="primary">下一块 →</button>`) : h(`<button class="primary">回到本课 →</button>`);
  next.onclick = () => {
    if (step === 2 && !S.tweaked[b.id]) { S.tweaked[b.id] = true; save("tweaked"); }
    if (step < 4) go(step + 1);
    else location.hash = nextBlock ? `#/l/${L.id}/${nextBlock.id.split(".")[1]}/1` : `#/l/${L.id}`;
  };
  nav.append(prev, next);

  if (step === 1) stepCopy(body, b);
  else if (step === 2) stepTweak(body, b);
  else if (step === 3) stepQuiz(body, b.quiz, () => go(4));
  else stepDrill(body, b.drills, () => {});
  S.last = location.hash; save("last");
  $app.replaceChildren(el);
  window.scrollTo(0, 0);
}

function stepCopy(body, b) {
  body.append(h(`<div class="card body">${md(b.body)}</div>`));
  if (!b.example) { if (!S.copied[b.id]) { S.copied[b.id] = true; save("copied"); } return; }
  if (b.lang !== "python") {
    body.append(h(`<div class="card"><b>例子</b><pre class="code">${esc(b.example)}</pre></div>`));
    if (!S.copied[b.id]) { S.copied[b.id] = true; save("copied"); }
    return;
  }
  const card = h(`<div class="card"><b>例子</b><pre class="code">${esc(b.example)}</pre>
    <p><b>✍️ 抄：</b>在下面<b>一个字一个字敲一遍</b>（不要粘贴），然后运行。输出和例子一样就过关。</p></div>`);
  const draftKey = b.id + "#copy";
  const ta = editor({ value: S.draft[draftKey] || "", placeholder: "照着上面的例子敲…（Tab = 4 个空格，Ctrl+Enter = 运行）", onChange: (v) => { S.draft[draftKey] = v; save("draft"); }, onRun: () => run() });
  ta.addEventListener("paste", () => toast("建议自己敲一遍，手会记住写法 🙂"));
  const res = h(`<div></div>`);
  const status = h(`<span class="status" data-run></span>`);
  const btn = h(`<button class="primary">▶ 运行</button>`);
  const skip = h(`<button>我已经很熟了，跳过</button>`);
  async function run() {
    btn.disabled = true;
    const r = await runner.run(ta.value, b.files, status);
    btn.disabled = false; status.textContent = "";
    if (showResult(res, r, b.exampleOut)) { if (!S.copied[b.id]) { S.copied[b.id] = true; save("copied"); touchDay(); } }
  }
  btn.onclick = run;
  skip.onclick = () => { S.copied[b.id] = true; save("copied"); toast("好的，下一步：改"); location.hash = location.hash.replace(/\/1$/, "/2"); };
  card.append(ta, h(`<div class="row" style="margin-top:8px"></div>`));
  card.lastChild.append(btn, status, h(`<span class="spacer"></span>`), S.copied[b.id] ? h(`<span class="muted">✓ 已完成</span>`) : skip);
  card.append(res);
  body.append(card);
}

function stepTweak(body, b) {
  const card = h(`<div class="card"><p><b>🔧 改：</b>每一题都<b>先在「我猜」里写下你猜的结果</b>，再改代码运行，最后看解释。</p></div>`);
  b.tweaks.forEach((t, i) => {
    const tw = h(`<div class="tweak"><div class="body">${md(`**${i + 1}.** ${t.ask}`)}</div></div>`);
    const g = h(`<textarea class="guess" placeholder="我猜：…"></textarea>`);
    const k = `${b.id}#guess${i}`;
    g.value = S.draft[k] || ""; g.oninput = () => { S.draft[k] = g.value; save("draft"); };
    tw.append(g);
    if (t.answer) tw.append(h(`<details><summary>看解释</summary><div class="body">${md(t.answer)}</div></details>`));
    card.append(tw);
  });
  if (!b.tweaks.length) card.append(h(`<p class="muted">这一块没有改的题，随便改改例子玩一玩就行。</p>`));
  if (b.lang === "python" && b.example) {
    const k = b.id + "#tweak";
    const ta = editor({ value: S.draft[k] ?? b.example, onChange: (v) => { S.draft[k] = v; save("draft"); }, onRun: () => run() });
    const res = h(`<div></div>`);
    const status = h(`<span class="status" data-run></span>`);
    const btn = h(`<button class="primary">▶ 运行</button>`);
    const reset = h(`<button>↺ 恢复原样</button>`);
    async function run() { btn.disabled = true; const r = await runner.run(ta.value, b.files, status); btn.disabled = false; status.textContent = ""; showResult(res, r); }
    btn.onclick = run;
    reset.onclick = () => { ta.value = b.example; S.draft[k] = b.example; save("draft"); res.innerHTML = ""; };
    const row = h(`<div class="row" style="margin-top:8px"></div>`); row.append(btn, status, h(`<span class="spacer"></span>`), reset);
    card.append(h(`<p style="margin-top:14px"><b>在这里改代码试：</b></p>`), ta, row, res);
  }
  body.append(card);
}

/** One guess-the-output card. onGraded(result) after self-grading. */
function quizCard(q, onGraded, headline) {
  const card = h(`<div class="card">${headline || ""}<div class="row"><b>这段代码会输出什么？</b><span class="spacer"></span></div><pre class="code">${esc(q.code)}</pre></div>`);
  card.querySelector(".row").append(starBtn(q.id));
  const g = h(`<textarea class="guess" placeholder="先自己猜，写在这里（可以不写，但要在心里想好）"></textarea>`);
  const show = h(`<button class="primary">看答案</button>`);
  card.append(g, h(`<div class="row" style="margin-top:8px"></div>`));
  card.lastChild.append(show);
  show.onclick = () => {
    show.remove();
    const ans = h(`<div><p style="margin:10px 0 4px"><b>${q.error ? "会报错：" : "输出："}</b></p><pre class="out">${esc(q.answer) || "（没有输出）"}</pre>${q.explain ? `<div class="body">${md(q.explain)}</div>` : ""}
      <p class="muted" style="margin-bottom:4px">诚实地选：</p><div class="row"></div></div>`);
    const row = ans.querySelector(".row");
    for (const [r, label, cls] of [["wrong", "不认识", "bad"], ["fuzzy", "模糊", "fuzzy"], ["good", "认识", "good"]]) {
      const bt = h(`<button class="${cls}">${label}</button>`);
      bt.onclick = () => { S.srs[q.id] = grade(S.srs[q.id], r, today()); save("srs"); touchDay(); updateBadge(); onGraded(r); };
      row.append(bt);
    }
    card.append(ans);
  };
  return card;
}

function stepQuiz(body, quiz, done) {
  if (!quiz.length) { body.append(h(`<div class="card empty">这一块没有猜题，直接去默写。</div>`)); return; }
  let i = 0;
  const holder = h(`<div></div>`);
  const draw = () => {
    if (i >= quiz.length) { holder.replaceChildren(h(`<div class="card empty">✅ 猜完了。下一步：默写。</div>`)); setTimeout(done, 600); return; }
    holder.replaceChildren(quizCard(quiz[i], () => { i++; draw(); }, `<div class="muted">第 ${i + 1} / ${quiz.length} 题</div>`));
  };
  draw();
  body.append(holder);
}

/** One write-from-memory drill. onGraded(result) when it is passed or given up. */
function drillCard(d, onGraded, headline) {
  const card = h(`<div class="card">${headline || ""}<div class="row"><b>✍️ 默写</b><span class="spacer"></span></div><div class="body task">${md(d.task)}</div></div>`);
  card.querySelector(".row").append(starBtn(d.id));
  const k = d.id + "#draft";
  const ta = editor({ value: S.draft[k] ?? d.starter, placeholder: "关掉小抄，从这里开始写…（Ctrl+Enter 运行）", onChange: (v) => { S.draft[k] = v; save("draft"); }, onRun: () => run() });
  const res = h(`<div></div>`);
  const status = h(`<span class="status" data-run></span>`);
  const btn = h(`<button class="primary">▶ 运行并检查</button>`);
  const hintBtn = h(`<button>💡 提示</button>`);
  const solBtn = h(`<button hidden>看答案</button>`);
  const giveUp = h(`<button class="bad" hidden>不会，下次再练</button>`);
  const hints = h(`<ol class="hints"></ol>`);
  let shown = 0, sawSolution = false, graded = false, runs = 0;
  if (!d.hints.length) hintBtn.hidden = true;
  const finish = (r) => { if (graded) return; graded = true; S.srs[d.id] = grade(S.srs[d.id], r, today()); save("srs"); touchDay(); updateBadge(); onGraded(r); };
  async function run() {
    btn.disabled = true;
    const r = await runner.run(ta.value, d.files, status);
    btn.disabled = false; status.textContent = ""; runs++;
    const ok = showResult(res, r, d.expect);
    solBtn.hidden = false; giveUp.hidden = ok;
    if (ok) {
      // Passing after peeking at the answer still counts as "not yet": it comes back today.
      if (sawSolution) res.append(h(`<div class="muted" style="margin-top:6px">看过答案了，今天会再出现一次，到时候不看答案再写一遍。</div>`));
      finish(sawSolution ? "wrong" : shown > 0 ? "fuzzy" : "good");
    }
  }
  btn.onclick = run;
  hintBtn.onclick = () => { if (shown < d.hints.length) { hints.append(h(`<li>${md(d.hints[shown]).replace(/^<p>|<\/p>$/g, "")}</li>`)); shown++; } hintBtn.textContent = shown < d.hints.length ? `💡 提示（${shown}/${d.hints.length}）` : "💡 没有更多提示了"; hintBtn.disabled = shown >= d.hints.length; };
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
    body.append(drillCard(d, (r) => { if (r !== "wrong") toast("✔ 写对了！"); }, head));
  });
}

function viewReview() {
  const q = dueQueue(allItems(), S.srs, today());
  const el = h(`<div><h1>📅 今日复习</h1><p class="muted">还剩 <b>${q.length}</b> 项。默写在前，猜题在后。</p><div id="rv"></div></div>`);
  const box = el.querySelector("#rv");
  if (!q.length) {
    const nx = nextUndone();
    box.append(h(`<div class="card empty">🎉 今天的复习做完了。${nx ? `<br><br><a class="btn primary" href="#/l/${nx.L.id}/${nx.b.id.split(".")[1]}/${nx.step}">继续学新内容</a>` : ""}</div>`));
  } else {
    const it = byId[q[0].id];
    const head = `<div class="crumb">${esc(it.lesson.id)} › ${esc(it.block.title)}</div>`;
    const next = () => setTimeout(viewReview, 700);
    box.append(it.kind === "quiz" ? quizCard(it.item, () => viewReview(), head) : drillCard(it.item, next, head));
  }
  $app.replaceChildren(el);
}

function viewStars() {
  const ids = Object.keys(S.star).filter((id) => byId[id]);
  const el = h(`<div><h1>⭐ 收藏</h1>${ids.length ? "" : `<div class="card empty">还没有收藏。看到难的、容易忘的，点 ☆ 收藏起来。</div>`}</div>`);
  for (const id of ids) {
    const it = byId[id];
    const short = it.block.id.split(".")[1];
    const step = it.kind === "block" ? 1 : it.kind === "quiz" ? 3 : 4;
    const label = it.kind === "block" ? "讲解" : it.kind === "quiz" ? "猜：" + it.item.code.split("\n")[0] : "默写：" + it.item.task.split("\n")[0];
    el.append(h(`<a class="card lesson" href="#/l/${it.lesson.id}/${short}/${step}"><div class="muted">${esc(it.lesson.id)} › ${esc(it.block.title)}</div><div class="t">${esc(label.slice(0, 80))}</div></a>`));
  }
  $app.replaceChildren(el);
}

function viewSettings() {
  const el = h(`<div><h1>⚙ 设置</h1>
    <div class="card"><h2 style="margin-top:0">学习进度</h2><p class="muted">进度只存在<b>这个浏览器</b>里，手机和电脑是分开的。换设备前先导出，到新设备上导入。</p>
      <div class="row"><button id="ex">⬇ 导出进度</button><label class="btn">⬆ 导入进度<input id="im" type="file" accept="application/json" hidden></label><span class="spacer"></span><button id="rs" class="bad">清空进度</button></div></div>
    <div class="card body">${md("**关于**\n\n代码在你的浏览器里运行（Pyodide），不会上传到任何地方。第一次运行要下载约 10MB 的 Python，之后浏览器会记住。\n\n课程内容放在 GitHub 上，每次更新前所有例子和答案都会先用真的 Python 跑一遍。")}<p class="muted">内容更新于 ${esc((DATA.built || "").slice(0, 16).replace("T", " "))}</p></div></div>`);
  el.querySelector("#ex").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "ops-drills", exported: new Date().toISOString(), data: S }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ops-drills-进度-${today()}.json`; a.click();
  };
  el.querySelector("#im").onchange = async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.app !== "ops-drills" || !j.data) throw new Error();
      for (const k of KEYS) if (j.data[k] !== undefined) { S[k] = j.data[k]; save(k); }
      toast("导入成功"); updateBadge();
    } catch { toast("这个文件不是 Ops Drills 的进度文件"); }
  };
  el.querySelector("#rs").onclick = () => {
    if (!confirm("确定清空这个浏览器里的全部学习进度吗？清空后不能恢复（建议先导出）。")) return;
    for (const k of KEYS) { S[k] = k === "last" ? null : {}; save(k); }
    toast("已清空"); updateBadge();
  };
  $app.replaceChildren(el);
}

/* ---------------- router ---------------- */
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const nav = parts[0] === "l" ? "lessons" : parts[0] || "home";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  updateBadge();
  if (!parts.length) return viewHome();
  if (parts[0] === "lessons") return viewLessons();
  if (parts[0] === "review") return viewReview();
  if (parts[0] === "stars") return viewStars();
  if (parts[0] === "settings") return viewSettings();
  if (parts[0] === "l") {
    const L = DATA.lessons.find((x) => x.id === parts[1]);
    if (!L) return viewLessons();
    const b = parts[2] && L.blocks.find((x) => x.id === `${L.id}.${parts[2]}`);
    if (!b) return viewLesson(L);
    const step = Math.min(4, Math.max(1, Number(parts[3]) || 1));
    return viewBlock(L, b, step);
  }
  viewHome();
}

async function main() {
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    DATA = await res.json();
  } catch {
    $app.innerHTML = `<div class="card empty">课程加载失败，请检查网络后刷新。</div>`;
    return;
  }
  index();
  window.addEventListener("hashchange", route);
  route();
}
main();

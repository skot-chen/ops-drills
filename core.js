// @ts-check
// Pure logic shared by the page (app.js) and the Node tests. No DOM, no storage.

/** Days until the next review for each box. Box 0 = wrong → again today. */
export const INTERVALS = [0, 1, 2, 4, 7, 15, 30];
export const MAX_BOX = INTERVALS.length - 1;

/** @param {Date} d */
export function dayKey(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** @param {string} key @param {number} n */
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

/**
 * @typedef {{box: number, due: string, seen?: number, wrong?: number}} SrsState
 * @param {SrsState | undefined} cur
 * @param {"good" | "fuzzy" | "wrong"} result
 * @param {string} today  YYYY-MM-DD
 * @returns {SrsState}
 */
export function grade(cur, result, today) {
  const box = cur ? cur.box : 0;
  const seen = (cur?.seen || 0) + 1;
  const wrong = (cur?.wrong || 0) + (result === "wrong" ? 1 : 0);
  if (result === "good") {
    const nb = Math.min(MAX_BOX, box + 1);
    return { box: nb, due: addDays(today, INTERVALS[nb]), seen, wrong };
  }
  if (result === "fuzzy") return { box: Math.max(1, box), due: addDays(today, 1), seen, wrong };
  return { box: 0, due: today, seen, wrong };
}

/** @param {SrsState | undefined} s @param {string} today */
export function isDue(s, today) {
  return !!s && s.due <= today;
}

/** Normalise program output for comparison: \r\n → \n, strip line ends, drop trailing blank lines. */
export function normOut(s) {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/** @param {string} got @param {string} want */
export function sameOutput(got, want) {
  return normOut(got) === normOut(want);
}

/**
 * Turn a Python traceback into its last line plus a short Chinese hint.
 * @param {string} err
 * @returns {{last: string, line: number | null, hint: string}}
 */
export function explainError(err) {
  const lines = String(err || "").trim().split("\n");
  const last = lines[lines.length - 1] || "";
  let line = null;
  for (const l of lines) {
    const m = /File "<exec>", line (\d+)/.exec(l);
    if (m) line = Number(m[1]);
  }
  const hints = [
    [/IndentationError|TabError/, "缩进不对：if / for / def 下面的行要缩进 4 个空格，不要混用 Tab。"],
    [/SyntaxError/, "语法错：检查是不是漏了冒号 :，括号或引号没配对。"],
    [/NameError/, "不认识这个名字：是不是拼错了，或者还没赋值就先用了？"],
    [/KeyError/, "字典里没有这个名字：可以用 .get(名字, 默认值)。"],
    [/IndexError/, "下标超出范围：split 切出来的段数可能比你想的少。"],
    [/TypeError: can only concatenate str|TypeError: unsupported operand/, "字符串和数字不能直接相加：用 str(n) 或 f-string。"],
    [/TypeError/, "类型不对：看看这一行用到的值是字符串、数字还是列表。"],
    [/FileNotFoundError/, "找不到文件：检查路径，比如 samples/demo.log。"],
    [/ValueError/, "值不对：比如 int(\"abc\") 这种转换不了的情况。"],
    [/AttributeError/, "这个类型没有这个方法：比如列表没有 .split()，字符串才有。"],
    [/ZeroDivisionError/, "除以 0 了。"],
  ];
  let hint = "";
  for (const [re, h] of hints) if (/** @type {RegExp} */ (re).test(last)) { hint = /** @type {string} */ (h); break; }
  return { last, line, hint };
}

/** @param {string} s */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}

/** Inline markdown: `code`, **bold**, [text](url). Input is escaped first. @param {string} s */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/**
 * Small, safe markdown subset: paragraphs, ``` fences, "- " lists, "1. " lists, | tables |, > notes.
 * @param {string} md
 */
export function md(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="code">${esc(buf.join("\n"))}</pre>`);
    } else if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (/** @type {string} */ r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      const [head, ...rest] = body;
      out.push(
        "<table><thead><tr>" + cells(head).map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
          rest.map((r) => "<tr>" + cells(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table>",
      );
    } else if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+\. /.test(lines[i]) : /^\s*[-*] /.test(lines[i])))
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.) /, ""));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
    } else if (/^> ?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^> ?/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ""));
      out.push(`<div class="note">${inline(buf.join(" "))}</div>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^```|^\s*\||^\s*[-*] |^\s*\d+\. |^> ?/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
    }
  }
  return out.join("\n");
}

/**
 * Build the review queue: due items, drills first, then oldest due.
 * @param {{id: string, kind: "quiz" | "drill"}[]} items
 * @param {Record<string, SrsState>} srs
 * @param {string} today
 */
export function dueQueue(items, srs, today) {
  return items
    .filter((it) => isDue(srs[it.id], today))
    .sort((a, b) => (a.kind === b.kind ? srs[a.id].due.localeCompare(srs[b.id].due) : a.kind === "drill" ? -1 : 1));
}

/**
 * Progress of one block: which of its 4 steps are done.
 * @param {{id: string, quiz: {id: string}[], drills: {id: string}[]}} block  ids already global
 * @param {{copied: Record<string, boolean>, srs: Record<string, SrsState>, tweaked: Record<string, boolean>}} st
 */
export function blockSteps(block, st) {
  const copy = !!st.copied[block.id];
  const tweak = !!st.tweaked[block.id];
  const quiz = block.quiz.length > 0 && block.quiz.every((q) => !!st.srs[q.id]);
  const drill = block.drills.length > 0 && block.drills.every((d) => (st.srs[d.id]?.box || 0) > 0);
  return { copy, tweak, quiz, drill, done: copy && tweak && (quiz || !block.quiz.length) && (drill || !block.drills.length) };
}

/**
 * Consecutive active days ending today (or yesterday, so the streak isn't "lost" before you study today).
 * @param {string[]} days  YYYY-MM-DD keys with any activity
 * @param {string} today
 */
export function streak(days, today) {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** XP needed for each level and its name. */
export const LEVELS = [[0, "新手"], [100, "入门"], [250, "上手"], [500, "熟练"], [900, "进阶"], [1400, "能手"], [2000, "高手"], [3000, "大师"]];

/** @param {number} xp */
export function levelOf(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= /** @type {number} */ (LEVELS[i + 1][0])) i++;
  const cur = /** @type {number} */ (LEVELS[i][0]);
  const next = i + 1 < LEVELS.length ? /** @type {number} */ (LEVELS[i + 1][0]) : null;
  return { lv: i + 1, name: /** @type {string} */ (LEVELS[i][1]), cur, next, pct: next ? Math.round((100 * (xp - cur)) / (next - cur)) : 100 };
}

/** Does a typed guess match the real output? Ignores outer blank lines, line-end spaces, and spaces at line starts. @param {string} guess @param {string} answer */
export function guessMatches(guess, answer) {
  const n = (/** @type {string} */ s) => normOut(s).split("\n").map((l) => l.trim()).join("\n").trim();
  return n(guess) !== "" && n(guess) === n(answer);
}

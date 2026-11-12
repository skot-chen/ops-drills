import { test } from "node:test";
import assert from "node:assert/strict";
import { grade, addDays, isDue, normOut, sameOutput, explainError, md, dueQueue, blockSteps } from "../core.js";

test("addDays crosses month and year", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("grade: good climbs boxes 1,2,4,7 days", () => {
  let s = grade(undefined, "good", "2026-11-10");
  assert.deepEqual([s.box, s.due], [1, "2026-11-11"]);
  s = grade(s, "good", "2026-11-11");
  assert.deepEqual([s.box, s.due], [2, "2026-11-13"]);
  s = grade(s, "good", "2026-11-13");
  assert.deepEqual([s.box, s.due], [3, "2026-11-17"]);
});

test("grade: wrong comes back today, fuzzy tomorrow, counts kept", () => {
  const w = grade({ box: 3, due: "2026-11-10" }, "wrong", "2026-11-10");
  assert.deepEqual([w.box, w.due, w.wrong], [0, "2026-11-10", 1]);
  const f = grade({ box: 3, due: "2026-11-10" }, "fuzzy", "2026-11-10");
  assert.deepEqual([f.box, f.due], [3, "2026-11-11"]);
  assert.equal(grade(undefined, "fuzzy", "2026-11-10").box, 1);
  assert.ok(isDue(w, "2026-11-10"));
  assert.ok(!isDue(f, "2026-11-10"));
});

test("output compare ignores CRLF, trailing spaces and blank lines", () => {
  assert.equal(normOut("a  \r\nb\n\n"), "a\nb");
  assert.ok(sameOutput("x 1\n", "x 1"));
  assert.ok(!sameOutput("x 1", "x  1"));
});

test("explainError picks the last line, line number and a Chinese hint", () => {
  const e = explainError('Traceback (most recent call last):\n  File "<exec>", line 3, in <module>\nKeyError: \'ftp\'');
  assert.equal(e.last, "KeyError: 'ftp'");
  assert.equal(e.line, 3);
  assert.match(e.hint, /get/);
});

test("md escapes HTML and renders code, lists, tables", () => {
  const h = md("Hi <b>x</b> `a<b`\n\n- one\n- **two**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nx < 1\n```");
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(h.includes("<code>a&lt;b</code>"));
  assert.ok(h.includes("<li><b>two</b></li>"));
  assert.ok(h.includes("<td>2</td>"));
  assert.ok(h.includes('<pre class="code">x &lt; 1</pre>'));
  assert.ok(!md("[x](javascript:alert(1))").includes("href"));
});

test("dueQueue puts drills first", () => {
  const srs = { a: { box: 0, due: "2026-11-09" }, b: { box: 1, due: "2026-11-10" }, c: { box: 1, due: "2026-11-12" } };
  const q = dueQueue([{ id: "a", kind: "quiz" }, { id: "b", kind: "drill" }, { id: "c", kind: "drill" }], srs, "2026-11-10");
  assert.deepEqual(q.map((x) => x.id), ["b", "a"]);
});

test("blockSteps needs every step", () => {
  const block = { id: "L.b1", quiz: [{ id: "L.b1.q1" }], drills: [{ id: "L.b1.d1" }] };
  const st = { copied: { "L.b1": true }, tweaked: { "L.b1": true }, srs: { "L.b1.q1": { box: 0, due: "x" } } };
  assert.equal(blockSteps(block, st).done, false);
  st.srs["L.b1.d1"] = { box: 1, due: "x" };
  assert.equal(blockSteps(block, st).done, true);
});

import { streak, levelOf, guessMatches } from "../core.js";

test("streak counts back from today, or from yesterday if today is empty", () => {
  assert.equal(streak(["2026-11-09", "2026-11-10", "2026-11-11"], "2026-11-11"), 3);
  assert.equal(streak(["2026-11-09", "2026-11-10"], "2026-11-11"), 2);
  assert.equal(streak(["2026-11-08", "2026-11-10"], "2026-11-11"), 1);
  assert.equal(streak(["2026-11-01"], "2026-11-11"), 0);
  assert.equal(streak(["2026-11-30", "2026-12-01"], "2026-12-01"), 2);
});

test("levelOf: thresholds and progress to next level", () => {
  assert.deepEqual([levelOf(0).lv, levelOf(0).name, levelOf(0).pct], [1, "新手", 0]);
  assert.deepEqual([levelOf(175).lv, levelOf(175).pct], [2, 50]);
  assert.equal(levelOf(99999).next, null);
});

test("guessMatches is forgiving about spaces, strict about content", () => {
  assert.ok(guessMatches("  0 a\n1 b \n", "0 a\n1 b"));
  assert.ok(!guessMatches("", ""));
  assert.ok(!guessMatches("0 a", "0 a\n1 b"));
});

"""Generates lessons/1-0.json and lessons/1-1.json (first content, converted from earlier markdown exercises).
Run: python scripts/authoring/gen_1_0_1_1.py   — later lessons are written as JSON directly (see AGENTS.md)."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def block(id, title, body, example, tweaks, quiz, drills, files=None):
    b = {"id": id, "title": title, "body": body.strip(), "example": example.strip("\n"),
         "tweaks": [{"ask": a.strip(), "answer": ans.strip()} for a, ans in tweaks],
         "quiz": [{"id": f"q{i+1}", "code": c.strip("\n"), "explain": e.strip()} for i, (c, e) in enumerate(quiz)],
         "drills": [dict(id=f"d{i+1}", task=t.strip(), hints=h, solution=s.strip("\n")) for i, (t, h, s) in enumerate(drills)]}
    if files:
        b["files"] = files
    return b


L10 = {
    "id": "1-0", "stage": 1, "title": "Python 快速复习",
    "intro": """
把忘掉的语法找回来。一共 8 小块，每块都按 **① 学 + 抄 → ② 改 → ③ 猜 → ④ 默写** 走一遍。
每块 20–40 分钟，不用一次做完。卡住了先看出错提示，再自己试 20 分钟，然后才问 AI 要**提示**（不要答案）。
""",
    "questions": [
        "这 8 块里，哪块最难？卡在哪里？",
        "ports[\"ftp\"] 和 ports.get(\"ftp\", 0)，在处理真实日志时为什么后者更安全？",
        "函数有什么用？为什么要把 level_of 写成函数，而不是每次都写 line.split(\" \")[2]？",
    ],
    "blocks": [
        block("b1", "变量和打印", """
**变量**就是给一个值起名字，像给服务器贴标签。

| 写法 | 意思 |
|---|---|
| `host = "web-01"` | 字符串（文字），要加引号 |
| `cpu = 87.5` | 小数 |
| `count = 3` | 整数 |
| `print(a, b)` | 打印，多个值之间自动加空格 |
| `f"{host} CPU={cpu}%"` | **f-string**：把变量填进 `{}` 里 |
| `f"{host:10}"` | 占 10 格宽，用来让输出对齐 |
""", '''
host = "web-01"
cpu = 87.5
disk_free_gb = 12

print(host, cpu)
print(f"{host} CPU={cpu}% 磁盘剩余 {disk_free_gb}GB")
print(f"{host:10}|{cpu:6}|")
''', [
            ("把 `{host:10}` 改成 `{host:>10}`，输出会有什么变化？",
             "`>` 表示**右对齐**：`    web-01|`。不写或写 `<` 是左对齐。做报表时数字一般右对齐，名字左对齐。"),
            ("加一行 `print(\"剩余 \" + disk_free_gb + \"GB\")`，会怎样？怎么修好？",
             "会报错 `TypeError`：字符串不能和整数直接相加。两种修法：`\"剩余 \" + str(disk_free_gb) + \"GB\"`，或者用 f-string：`f\"剩余 {disk_free_gb}GB\"`（推荐）。"),
        ], [
            ('''
host = "db-01"
print(f"[{host}]")
print(f"[{host:8}]")
''', "`:8` 让它占 8 格，`db-01` 只有 5 个字符，后面补 3 个空格。"),
            ('''
a = "10"
b = 5
print(a + str(b))
print(int(a) + b)
''', "`\"10\" + \"5\"` 是把文字拼起来 → `105`；`int(\"10\") + 5` 才是数学加法 → `15`。读日志时数字都是字符串，要先 `int()`。"),
        ], [
            ("有一台主机 `db-01`，内存使用率 `92`，打印出：\n\n```\ndb-01 内存 92% ⚠\n```",
             ["先用两个变量存主机名和使用率", "用 f-string：`f\"{变量} 内存 {变量}% ⚠\"`"],
             '''
host = "db-01"
mem = 92
print(f"{host} 内存 {mem}% ⚠")
'''),
        ]),

        block("b2", "字符串", """
日志的每一行都是一个**字符串**。最常用的几个方法：

| 方法 | 作用 | 你熟悉的 |
|---|---|---|
| `s.strip()` | 去掉首尾空白和换行 | |
| `s.split(" ")` | 按空格切成列表 | `awk '{print $3}'` |
| `s.split(" ", 4)` | 最多切 4 刀，后面整段保留 | |
| `s.rstrip(":")` | 去掉右边的 `:` | |
| `"timeout" in s` | 是否包含 | `grep timeout` |
| `s.startswith("2026")` | 是否以…开头 | `grep ^2026` |
| `s.lower()` | 转小写 | `grep -i` |

方法可以**连着用**：`s.strip().lower()`。注意：Python 从 **0** 开始数，awk 从 1 开始。
""", '''
line = "  2026-11-10 09:40:01 ERROR payment-svc: connection timeout to db  \\n"
clean = line.strip()
print(clean)
parts = clean.split(" ")
print(parts)
print(parts[2], parts[3])
print(parts[3].rstrip(":"))
print("timeout" in clean)
''', [
            ("把 `split(\" \")` 改成 `split(\" \", 4)`，`parts` 会变成什么样？`parts[4]` 是什么？",
             "最多切 4 刀，变成 5 段：`parts[4]` 是剩下的整段消息 `connection timeout to db`。分析日志时常这样把「前面的固定字段」和「后面的消息」分开。"),
            ("不 `strip()`，直接 `line.split(\" \")`，结果有什么不同？",
             "开头的两个空格会切出两个**空字符串** `''`，末尾还有 `'\\n'`，下标全乱了：`parts[2]` 不再是 ERROR。所以**先 strip 再 split**。"),
        ], [
            ('''
s = "a,b,,c"
print(s.split(","))
print(len(s.split(",")))
''', "两个逗号之间是空的，会切出一个空字符串 `''`，所以一共 4 段。"),
            ('''
s = "WARN order-svc: slow"
print(s.split(" ")[1].rstrip(":").upper())
''', "从左往右：切开 → 取第 2 段 `order-svc:` → 去掉冒号 → 转大写。"),
        ], [
            ("给你：\n\n```\ns = \"2026-11-10 09:41:07 WARN order-svc: slow query 2300ms\"\n```\n\n打印出它的**级别**和**服务名（不带冒号）**，格式：`WARN order-svc`",
             ["先 `split(\" \")`，数一数级别和服务名分别是第几段（从 0 数）", "服务名后面带冒号，用 `rstrip(\":\")` 去掉"],
             '''
s = "2026-11-10 09:41:07 WARN order-svc: slow query 2300ms"
parts = s.split(" ")
print(parts[2], parts[3].rstrip(":"))
'''),
        ]),

        block("b3", "列表", """
**列表**是一串东西，用方括号 `[]`。比如一组主机、一组延迟。

| 写法 | 意思 |
|---|---|
| `hosts.append("x")` | 末尾加一个 |
| `hosts[0]` / `hosts[-1]` | 第一个 / 最后一个 |
| `hosts[1:3]` | 切片：第 1 到第 3 个（**不含** 3） |
| `len(hosts)` | 有几个 |
| `"db-01" in hosts` | 在不在里面 |
| `sorted(x)` / `sorted(x, reverse=True)` | 从小到大 / 从大到小，**返回新列表** |
| `max(x)` / `min(x)` / `sum(x)` | 最大 / 最小 / 求和 |
""", '''
hosts = ["web-01", "web-02", "db-01"]
hosts.append("cache-01")
print(hosts)
print(len(hosts), hosts[0], hosts[-1])
print(hosts[1:3])
print("db-01" in hosts)

latencies = [120, 35, 980, 60]
print(sorted(latencies))
print(sorted(latencies, reverse=True)[0])
''', [
            ("加一行 `print(hosts[4])`，会怎样？",
             "`IndexError: list index out of range`：一共 4 个，下标只有 0–3。处理日志时，`split` 切出来的段数不够，也会报这个错。"),
            ("`sorted(latencies)` 之后，再 `print(latencies)`，它本身变了吗？",
             "没变。`sorted()` 返回一个**新**列表，原来的不动。想原地排序要用 `latencies.sort()`。"),
        ], [
            ('''
x = [3, 1, 2]
y = sorted(x)
print(x, y)
''', "`sorted` 不改原列表。"),
            ('''
hosts = ["a", "b", "c", "d"]
print(hosts[-2:])
''', "`-2:` 表示从倒数第 2 个一直到最后。"),
        ], [
            ("有延迟列表 `[200, 15, 340, 90, 1200]`，打印**最大值、最小值、一共几个**，一行打印，用空格分开：\n\n```\n1200 15 5\n```",
             ["`max()`、`min()`、`len()` 各管一个", "`print(a, b, c)` 会自动用空格分开"],
             '''
lat = [200, 15, 340, 90, 1200]
print(max(lat), min(lat), len(lat))
'''),
        ]),

        block("b4", "判断 if / elif / else", """
判断就是告警规则：**满足条件才执行**。

```
if 条件:
    满足时做的事        ← 缩进 4 个空格
elif 另一个条件:
    前面不满足、这个满足时做的事
else:
    都不满足时做的事
```

比较：`==` 等于、`!=` 不等于、`>` `>=` `<` `<=`。组合：`and` `or` `not`。
**从上往下判断，第一个满足的执行完就结束**，所以顺序很重要。
""", '''
cpu = 85
if cpu > 90:
    print("严重")
elif cpu > 80:
    print("警告")
else:
    print("正常")

level = "FATAL"
if level == "ERROR" or level == "FATAL":
    print("需要处理")
''', [
            ("把 `cpu` 改成 `90`，输出什么？改成 `91` 呢？",
             "`90 > 90` 是 False，所以 90 是「警告」；91 是「严重」。写告警阈值时要想清楚是 `>` 还是 `>=`。"),
            ("把两个判断的顺序对调（先判断 `> 80`），`cpu = 95` 时输出什么？",
             "输出「警告」：95 先满足了 `> 80`，后面的 `> 90` 根本不会被检查。**范围大的条件要放后面**。"),
        ], [
            ('''
x = 80
if x >= 80:
    print("A")
if x > 70:
    print("B")
''', "两个都是独立的 `if`，不是 `elif`，所以两个都会检查，都满足就都打印。"),
            ('''
level = "warn"
if level == "WARN":
    print("告警")
else:
    print("其他")
''', "大小写不一样，`==` 认为不相等。可以先 `level.upper()` 再比较。"),
        ], [
            ("有一个列表 `[5, 15, 50]`，代表三块磁盘的剩余百分比。对每个数：小于 10 打印 `严重`，小于 20 打印 `警告`，否则打印 `正常`。\n\n应该输出三行：严重、警告、正常。",
             ["用 `for free in [5, 15, 50]:` 依次拿出每个数", "先判断 `< 10`，再判断 `< 20`（顺序很重要）"],
             '''
for free in [5, 15, 50]:
    if free < 10:
        print("严重")
    elif free < 20:
        print("警告")
    else:
        print("正常")
'''),
        ]),

        block("b5", "循环 for", """
`for` 把一串东西**一个一个拿出来**处理，像对每台服务器执行同一个检查。

| 写法 | 意思 |
|---|---|
| `for h in hosts:` | 依次拿出列表里的每一个 |
| `for i in range(3):` | 0, 1, 2 |
| `for i in range(1, 4):` | 1, 2, 3（不含 4） |
| `continue` | 跳过这一个，进入下一轮 |
| `break` | 整个循环结束 |

计数的套路：循环前 `n = 0`，满足条件时 `n = n + 1`。
""", '''
hosts = ["web-01", "web-02", "db-01", "cache-01"]
for h in hosts:
    print("检查", h)

for i in range(3):
    print("第", i, "次重试")

for h in hosts:
    if h.startswith("web"):
        continue
    if h == "cache-01":
        break
    print("非 web 主机：", h)
''', [
            ("把 `range(3)` 改成 `range(1, 4)`，输出什么？", "打印第 1、2、3 次。`range(a, b)` 从 a 开始，到 b **之前**停。"),
            ("把最后一段里的 `continue` 和 `break` 互换，会输出什么？",
             "什么都不打印：第一台 `web-01` 一进来就 `break`，循环直接结束了。"),
        ], [
            ('''
n = 0
for x in [3, 8, 1, 9]:
    if x > 5:
        n = n + 1
print(n)
''', "大于 5 的有 8 和 9，两个。"),
            ('''
for i in range(5):
    if i == 3:
        break
    print(i)
''', "到 3 就 break，所以只打印 0 1 2。"),
        ], [
            ("有延迟列表 `[120, 35, 980, 60, 1500, 40]`，用 `for` 把**超过 500** 的一个一个打印出来，最后再打印 `一共 N 个`：\n\n```\n980\n1500\n一共 2 个\n```",
             ["循环前先 `n = 0`", "在 `if x > 500:` 里面打印并让 `n` 加 1", "最后一行在循环外面（不缩进），用 f-string"],
             '''
n = 0
for x in [120, 35, 980, 60, 1500, 40]:
    if x > 500:
        print(x)
        n = n + 1
print(f"一共 {n} 个")
'''),
        ]),

        block("b6", "字典", """
**字典**是一张「名字 → 值」的对照表，用花括号 `{}`。运维里到处都是：端口表、每个服务的错误数。

| 写法 | 意思 |
|---|---|
| `ports["ssh"]` | 取值（**没有这个名字会报错**） |
| `ports.get("ftp", 0)` | 取值，没有就返回 0，**不报错** |
| `ports["https"] = 443` | 新增或修改 |
| `"ssh" in ports` | 有没有这个名字 |
| `for k, v in ports.items():` | 一对一对拿出来 |

**计数的固定写法**（今天最重要的一行）：

```
counts[x] = counts.get(x, 0) + 1
```

这就是 `sort | uniq -c` 的核心。
""", '''
ports = {"ssh": 22, "http": 80}
ports["https"] = 443
print(ports)
print(ports["ssh"], ports.get("ftp", 0))
for name, port in ports.items():
    print(f"{name:6} {port}")

levels = ["INFO", "ERROR", "INFO", "WARN", "ERROR", "INFO"]
counts = {}
for lv in levels:
    counts[lv] = counts.get(lv, 0) + 1
print(counts)
''', [
            ("加一行 `print(ports[\"ftp\"])`，会怎样？和 `ports.get(\"ftp\", 0)` 有什么区别？",
             "`KeyError: 'ftp'`，程序直接停了。`.get` 找不到时返回默认值，程序继续跑。处理日志时会遇到各种没见过的名字，用 `.get` 更安全。"),
            ("把 `counts.get(lv, 0) + 1` 改成 `counts[lv] + 1`，会怎样？",
             "第一次遇到 `INFO` 时字典里还没有它，`counts[\"INFO\"]` 直接 `KeyError`。`.get(lv, 0)` 的意思就是「没有就当 0」。"),
        ], [
            ('''
d = {"a": 1}
d["a"] = d["a"] + 5
d["b"] = 2
print(d)
''', "已有的名字是修改，没有的名字是新增。"),
            ('''
d = {"web": 3, "db": 7, "cache": 1}
for k, v in sorted(d.items(), key=lambda kv: kv[1], reverse=True):
    print(k, v)
''', "`sorted(d.items(), key=lambda kv: kv[1], reverse=True)`：按「值」从大到小排。这一行先当固定写法记住。"),
        ], [
            ("有服务列表 `[\"gateway\", \"db\", \"gateway\", \"payment\", \"gateway\", \"db\"]`，统计每个服务出现几次，**从多到少**打印，每行 `服务名 次数`：\n\n```\ngateway 3\ndb 2\npayment 1\n```",
             ["计数用 `counts[x] = counts.get(x, 0) + 1`",
              "排序用 `sorted(counts.items(), key=lambda kv: kv[1], reverse=True)`",
              "排序后 `for name, n in ...:` 打印"],
             '''
services = ["gateway", "db", "gateway", "payment", "gateway", "db"]
counts = {}
for s in services:
    counts[s] = counts.get(s, 0) + 1
for name, n in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
    print(name, n)
'''),
        ]),

        block("b7", "函数", """
**函数**就是把一段操作起个名字，以后一句话就能调用。就像把一串排查命令写成一个脚本。

```
def 名字(参数):
    做事情
    return 结果          ← 把结果交回去
```

- 没写 `return` 的函数，返回 `None`（什么都没有）。
- 好处：**写一次，到处用**；以后要改，也只改一个地方；还能单独测试。
""", '''
def level_of(line):
    parts = line.split(" ")
    return parts[2]

def is_bad(level):
    return level in ("ERROR", "FATAL")

lines = [
    "2026-11-10 09:00:00 INFO gateway: ok",
    "2026-11-10 09:40:01 FATAL db: too many connections",
    "2026-11-10 09:40:01 ERROR payment-svc: timeout",
]
for l in lines:
    lv = level_of(l)
    print(lv, is_bad(lv))
''', [
            ("把 `return parts[2]` 改成 `print(parts[2])`，输出会变成什么？为什么出现了 `None`？",
             "函数里自己打印了一次级别；但没有 `return`，所以 `lv` 拿到的是 `None`，`is_bad(None)` 是 False，于是打印出 `None False`。**打印不等于返回**。"),
            ("调用 `level_of(\"garbage\")` 会怎样？怎么改，让它遇到这种行返回 `\"UNKNOWN\"`？",
             "`\"garbage\".split(\" \")` 只有 1 段，`parts[2]` 会 `IndexError`。可以先检查：`if len(parts) < 3: return \"UNKNOWN\"`。"),
        ], [
            ('''
def add(a, b):
    print(a + b)

x = add(1, 2)
print(x)
''', "函数里打印了 3，但没有 return，所以 x 是 None。"),
            ('''
def double(n):
    return n * 2

print(double(double(3)))
''', "先算里面：double(3) = 6，再 double(6) = 12。"),
        ], [
            ("写一个函数 `service_of(line)`，返回服务名（不带冒号）。用下面 3 行测试，依次打印：\n\n```\ngateway\ndb\npayment-svc\n```\n\n```\nlines = [\n    \"2026-11-10 09:00:00 INFO gateway: ok\",\n    \"2026-11-10 09:40:01 FATAL db: too many connections\",\n    \"2026-11-10 09:40:01 ERROR payment-svc: timeout\",\n]\n```",
             ["`def service_of(line):` 里面先 split", "服务名是第 4 段（下标 3），记得 `rstrip(\":\")`，然后 `return`", "最后 `for l in lines: print(service_of(l))`"],
             '''
def service_of(line):
    return line.split(" ")[3].rstrip(":")

lines = [
    "2026-11-10 09:00:00 INFO gateway: ok",
    "2026-11-10 09:40:01 FATAL db: too many connections",
    "2026-11-10 09:40:01 ERROR payment-svc: timeout",
]
for l in lines:
    print(service_of(l))
'''),
        ]),

        block("b8", "读写文件", """
真实的日志在文件里。`samples/demo.log` 是一份模拟的线上日志，大约 4 千行，中间藏着一次故障。

```
with open("文件名", encoding="utf-8") as f:   ← 打开，代码块结束后自动关闭
    for line in f:                               ← 一次读一行，10GB 也不怕
        ...
```

写文件：`open("文件名", "w", encoding="utf-8")`，`"w"` 是覆盖，`"a"` 是追加。换行要自己写 `\\n`。
""", '''
n = 0
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        n = n + 1
        if n <= 3:
            print(line.strip())
print("一共", n, "行")
''', [
            ("把 `print(line.strip())` 改成 `print(line)`，输出有什么不同？",
             "每行之间多了一个空行：每一行末尾本来就带着换行符 `\\n`，`print` 又加了一个。"),
            ("把文件名故意写错成 `samples/demo2.log`，看懂报错。",
             "`FileNotFoundError`：找不到文件。看到它先检查路径和文件名。"),
        ], [
            ('''
with open("samples/demo.log", encoding="utf-8") as f:
    first = f.readline()
print(first.split(" ")[2])
''', "`readline()` 只读一行。第一行是一条 INFO。"),
            ('''
n = 0
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        if " FATAL " in line:
            n = n + 1
print(n)
''', "用 `in` 数包含 FATAL 的行，相当于 `grep -c \" FATAL \"`。"),
        ], [
            ("读 `samples/demo.log`，数出**包含 `timeout` 的行**有多少，打印这个数字。\n\n（可以想一想：用命令行的话是 `grep -c timeout samples/demo.log`）",
             ["`with open(...) as f:` 再 `for line in f:`", "`if \"timeout\" in line:` 就加 1", "最后在循环外 `print(n)`"],
             '''
n = 0
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        if "timeout" in line:
            n = n + 1
print(n)
'''),
        ], files=["samples/demo.log"]),
    ],
}

L11 = {
    "id": "1-1", "stage": 1, "title": "用 Python 统计日志",
    "intro": """
以前你会这样查：`grep ERROR app.log | awk '{print $4}' | sort | uniq -c | sort -rn`。
这一课用 Python 做同样的事，并且处理好「脏数据」。这是 AIOps 的第一步：**把手工查日志变成程序**。
数据都是 `samples/demo.log`（约 4300 行，09:40 左右有一次故障）。
""",
    "questions": [
        "for line in f 和「把整个文件一次读进来」相比，好在哪里？如果日志有 10GB，会有什么区别？",
        "日志里那行看不懂的乱码，如果不跳过，脚本会出什么问题？真实环境里还可能有哪些「脏数据」？",
        "看「每个服务的错误数」结果，再翻翻日志：你觉得这次故障最先是哪个服务出的问题？为什么错误最多的服务不一定是根源？",
    ],
    "blocks": [
        block("b1", "一行一行读，数行数", """
日志每一行的格式：

```
2026-11-10 09:00:00 INFO order-svc: order 10494 created by user 2996
日期       时间     级别 服务名:    消息……
```

`for line in f` 是**流式**读取：每次只拿一行，和 `tail`、`grep` 一样，文件再大也不会把内存撑爆。
""", '''
with open("samples/demo.log", encoding="utf-8") as f:
    for i, line in enumerate(f):
        if i >= 5:
            break
        print(line.strip())
''', [
            ("`enumerate(f)` 是什么意思？把 `i >= 5` 改成 `i >= 2` 试试。",
             "`enumerate` 在拿出每一行的同时，给你一个从 0 开始的编号 `i`。改成 2 就只打印前 2 行。"),
        ], [
            ('''
for i, x in enumerate(["a", "b", "c"]):
    print(i, x)
''', "`enumerate` 从 0 开始编号。"),
        ], [
            ("数一数 `samples/demo.log` 一共多少行，打印：\n\n```\n一共 4314 行\n```",
             ["循环前 `n = 0`，每行加 1", "最后 `print(f\"一共 {n} 行\")`"],
             '''
n = 0
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        n = n + 1
print(f"一共 {n} 行")
'''),
        ], files=["samples/demo.log"]),

        block("b2", "跳过脏数据", """
真实日志里经常混着：多行的报错堆栈、被截断的半行、空行、乱码。
**靠谱的脚本遇到看不懂的行要跳过，而不是直接崩溃，也不能算错。**

判断一行「像不像正常日志」的简单办法：

```
parts = line.strip().split(" ")
if len(parts) < 4 or not parts[0].startswith("20"):
    continue          ← 跳过这一行
```
""", '''
lines = [
    "2026-11-10 09:00:00 INFO gateway: ok",
    "this line is garbage and should be skipped",
    "",
    "2026-11-10 09:40:01 ERROR db: timeout",
]
for line in lines:
    parts = line.strip().split(" ")
    if len(parts) < 4 or not parts[0].startswith("20"):
        print("跳过：", repr(line))
        continue
    print("级别：", parts[2])
''', [
            ("去掉 `not parts[0].startswith(\"20\")` 这个条件，结果有什么不同？",
             "乱码那一行有 8 个词，`len(parts) < 4` 拦不住它，于是它的第 3 个词 `garbage` 被当成了「级别」。只看段数不够，还要看格式。"),
        ], [
            ('''
print(len("".split(" ")))
print("".split(" "))
''', "空字符串 split 之后是 `['']`，长度是 1，不是 0。"),
        ], [
            ("统计 `samples/demo.log` 里每种**级别**各有多少条（用字典），**跳过**不像日志的行。按从多到少打印，每行 `级别 数量`：\n\n```\nINFO 3612\nERROR 493\nFATAL 163\nWARN 45\n```",
             ["先不跳过，直接统计，看看结果里多出来的奇怪「级别」是什么", "用上面的判断条件 `continue` 跳过",
              "排序：`sorted(counts.items(), key=lambda kv: kv[1], reverse=True)`"],
             '''
counts = {}
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split(" ")
        if len(parts) < 4 or not parts[0].startswith("20"):
            continue
        lv = parts[2]
        counts[lv] = counts.get(lv, 0) + 1
for lv, n in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
    print(lv, n)
'''),
        ], files=["samples/demo.log"]),

        block("b3", "每个服务的错误数", """
值班时最想知道的：**哪个服务错误最多？**

做法和数级别一样，只是多了一个条件：只看 ERROR 的行，用**服务名**做字典的名字。
服务名后面带着冒号 `order-svc:`，记得去掉。

这一步完成后，你就用 Python 做出了 `grep ERROR | awk '{print $4}' | sort | uniq -c | sort -rn`。
""", '''
lines = [
    "2026-11-10 09:40:01 ERROR db: timeout",
    "2026-11-10 09:40:02 INFO gateway: ok",
    "2026-11-10 09:40:03 ERROR db: timeout",
    "2026-11-10 09:40:04 ERROR gateway: 502",
]
errors = {}
for line in lines:
    parts = line.split(" ")
    if parts[2] != "ERROR":
        continue
    svc = parts[3].rstrip(":")
    errors[svc] = errors.get(svc, 0) + 1
print(errors)
''', [
            ("把 `!= \"ERROR\"` 改成 `not in (\"ERROR\", \"FATAL\")`，结果会怎样？",
             "FATAL 比 ERROR 更严重，通常也要算进来。改了以后，ERROR 和 FATAL 都会被统计。"),
        ], [
            ('''
svc = "payment-svc:"
print(svc.rstrip(":"), svc.strip(":"), svc[:-1])
''', "三种写法都能去掉最后的冒号。`rstrip(\":\")` 最稳：没有冒号时也不会删错字。"),
        ], [
            ("统计 `samples/demo.log` 里**每个服务的 ERROR 条数**（只算 ERROR，不算 FATAL），跳过脏数据，从多到少打印：\n\n```\npayment-svc 327\ngateway 152\norder-svc 14\n```",
             ["在数级别的代码基础上改：多一个 `if parts[2] != \"ERROR\": continue`", "字典的名字用 `parts[3].rstrip(\":\")`"],
             '''
errors = {}
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split(" ")
        if len(parts) < 4 or not parts[0].startswith("20"):
            continue
        if parts[2] != "ERROR":
            continue
        svc = parts[3].rstrip(":")
        errors[svc] = errors.get(svc, 0) + 1
for svc, n in sorted(errors.items(), key=lambda kv: kv[1], reverse=True):
    print(svc, n)
'''),
        ], files=["samples/demo.log"]),

        block("b4", "找到故障从哪一分钟开始", """
错误最多的服务**不一定是根源**：下游数据库坏了，上游的支付服务会跟着大量超时报错。
要找根源，看**谁最先出事**。

时间在第 2 段 `09:40:01`，取前 5 个字符 `09:40` 就是「分钟」。字符串也能切片：`"09:40:01"[:5]`。
""", '''
t = "09:40:01"
print(t[:5])
print(t[:2], t[3:5])
''', [
            ("`t[:5]`、`t[:2]`、`t[3:5]` 分别是什么意思？", "切片 `[a:b]` 取第 a 到第 b-1 个字符：`[:5]` 是前 5 个 → `09:40`；`[:2]` 是小时；`[3:5]` 是分钟。"),
        ], [
            ('''
first = {}
for svc, t in [("db", "09:40"), ("gateway", "09:41"), ("db", "09:42")]:
    if svc not in first:
        first[svc] = t
print(first)
''', "`if svc not in first` 保证只记下**第一次**出现的时间。"),
        ], [
            ("找出 `samples/demo.log` 里**每个服务第一次出现 ERROR 或 FATAL 的时间**（精确到秒，直接用第 2 段），按时间从早到晚打印：\n\n```\n09:04:21 order-svc\n09:40:00 gateway\n09:40:01 db\n09:40:01 payment-svc\n```\n\n然后去日志里看看这几行的**内容**：order-svc 那条和 09:40 的故障有关系吗？gateway 比 db 早了 1 秒，它就是根源吗？（这会是「讲」的第 3 题）",
             ["字典 `first`：服务名 → 第一次出事的时间，用 `if svc not in first:` 只记第一次",
              "级别判断：`parts[2] in (\"ERROR\", \"FATAL\")`",
              "按时间排：`sorted(first.items(), key=lambda kv: kv[1])`，打印 `时间 服务名`"],
             '''
first = {}
with open("samples/demo.log", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split(" ")
        if len(parts) < 4 or not parts[0].startswith("20"):
            continue
        if parts[2] not in ("ERROR", "FATAL"):
            continue
        svc = parts[3].rstrip(":")
        if svc not in first:
            first[svc] = parts[1]
for svc, t in sorted(first.items(), key=lambda kv: kv[1]):
    print(t, svc)
'''),
        ], files=["samples/demo.log"]),
    ],
}

for L in (L10, L11):
    (ROOT / "lessons" / f"{L['id']}.json").write_text(json.dumps(L, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("wrote lessons/1-0.json, lessons/1-1.json")

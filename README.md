# Ops Drills 运维练习本

👉 **打开网站：** https://skot-chen.github.io/ops-drills/

学 Python 和运维自动化的练习网站。手机、电脑打开就能用，**代码直接在浏览器里运行**，不用装任何东西。

## 怎么用

每一课分成几个小块，每一小块走 4 步：

1. **① 学 + 抄**：读讲解，把例子**自己敲一遍**（不要粘贴），运行，输出对上就过关
2. **② 改**：按提示改一处，**先猜结果再运行**
3. **③ 猜**：看代码猜输出，诚实地选 不认识 / 模糊 / 认识
4. **④ 默写**：只看一句要求，从空白开始写，网站自动判断对错；不会就点 💡 提示

一课学完，在课程页最下面回答 3 个「讲」的问题，点 **📋 复制答案** 粘贴给 AI 检查。

- **📅 复习**：猜题和默写会在 1、2、4、7、15、30 天后自动回来，做错的当天就回来。每天先做复习。
- **⭐ 收藏**：难的、容易忘的，点 ☆ 收藏。
- **⚙ 设置**：进度存在**你自己的浏览器**里，手机和电脑分开。换设备前先导出，再导入。

第一次运行代码要下载约 10MB 的 Python，大约 10–30 秒，之后就快了。

## 加新课

告诉 AI：

```
请按照这个仓库的 AGENTS.md 加下一课：
https://github.com/skot-chen/ops-drills
```

## For developers / AI
See [AGENTS.md](AGENTS.md) (lesson format) and [CLAUDE.md](CLAUDE.md). `npm run check` validates lessons (runs every snippet with Python 3.12),
builds `_site/` and runs tests. `npm run dev` previews on http://localhost:8771. No npm dependencies.

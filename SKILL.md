---
name: icloud-notes-exporter
description: Export iCloud Notes to Markdown files via CDP (Chrome DevTools Protocol). Use when the user wants to export, backup, or extract their iCloud Notes (Apple备忘录/苹果备忘录) to local Markdown files. Connects to an already-logged-in Edge/Chrome browser session.
version: 0.1.0
---

# iCloud Notes Exporter

通过 CDP 连接已登录 iCloud Notes 的 Edge/Chrome 浏览器，将所有备忘录导出为本地 Markdown 文件。支持断点续传、文件夹过滤、锁定/置顶标记、manifest 校验。

## Prerequisites

- Windows
- Node.js >= 18
- Microsoft Edge 或 Google Chrome
- 用户需手动登录 iCloud（不要自动化 Apple ID 登录）
- **iPhone 备忘录必须开启 iCloud 同步**（设置 → Apple ID → iCloud → 备忘录 → 开启），否则笔记不在网页端
- **锁定的备忘录必须先解锁**，否则只能导出标题，正文无法读取
- **仅支持纯文本内容**：手写、图片、附件、表格（未验证）等内容不会导出，只导出文字部分
- 笔记数量不限（5300+ 条已验证可全部导出），但连续导出超过 ~2000 条可能触发 Apple 限速（全 hang，需等 6+ 小时恢复）。Apple 的反爬机制非常强

## Skill Directory

所有源码和依赖位于本 skill 目录下：

```
SKILL_DIR = ~/.qoderworkcn/skills/icloud-notes-exporter/
```

运行命令时 `cd` 到该目录。

## Workflow

### Step 1: Start Edge with debug port

```bash
cd ~/.qoderworkcn/skills/icloud-notes-exporter
node src/start-edge.mjs
```

这会以 `--remote-debugging-port=9229` 启动 Edge 并打开 iCloud Notes 页面。如果 Edge 已在 9229 端口运行，会报告当前状态。

### Step 2: User logs in manually

**必须等用户手动完成登录。** 确认用户在浏览器中能看到 iCloud Notes 三栏界面（左侧文件夹列表、中间笔记列表、右侧正文）。

不要自动化 Apple ID 登录、密码输入、两步验证或受信任设备确认。

### Step 3: Verify environment

```bash
node src/verify-env.mjs
```

检查 Node.js 版本、浏览器、ws 模块、debug 端口、iCloud Notes 标签页、输出目录是否就绪。

### Step 4: Run export

导出所有文件夹：

```bash
node src/main.mjs
```

导出到指定目录：

```bash
node src/main.mjs "D:\MyNotes"
```

只导出特定文件夹（按名称或 recordName 模糊匹配）：

```bash
node src/main.mjs "D:\MyNotes" "工作"
```

默认输出目录为 skill 目录的同级文件夹，完整路径：

```
C:\Users\18229\.qoderworkcn\skills\导出的备忘录\
```

**导出完成后必须明确告知用户输出路径**，不要让用户自己去找。如果用户指定了输出目录（第一个参数），则使用用户指定的路径。

导出结果会复制到 outputs 目录供用户直接查看：

```bash
cp -r "C:\Users\18229\.qoderworkcn\skills\导出的备忘录\{文件夹名}" "{outputs_dir}\{文件夹名}"
```

然后用 `present_files` 展示给用户。

### Step 5: Verify results

导出完成后检查：

1. 每个文件夹下有 `_manifest.json` 和 `_export_progress.json`
2. `_manifest.json` 中 `summary.exported + summary.skipped + summary.empty` 应等于 `summary.expected`
3. `summary.failed` 应为 0（除非有锁定笔记或限速）
4. Markdown 文件数量与 manifest 匹配

## Output Format

- 文件名：`0001_笔记标题.md`（四位序号 + 标签 + 标题）
- 锁定笔记：`0001_[锁定]_标题.md`（正文不可导出，仅标题）
- 置顶笔记：`0001_[置顶]_标题.md`
- 每个文件夹有 `_manifest.json`（含 sha256、状态、错误信息）和 `_export_progress.json`（断点续传用）

## Critical Pitfalls

1. **不要自动化登录** — Apple ID 登录、2FA、扫码等必须用户手动完成
2. **不要新写导出脚本** — `src/main.mjs` 是唯一导出入口，已经过充分测试
3. **不要改源码** — 如需修改须先阅读 `docs/pitfalls.md` 全文
4. **限速处理** — 连续 ~2000 次 `note.load()` 后 iCloud 可能限速（全 hang），此时工具自动停止。需等待 6+ 小时后重新运行（支持断点续传）
5. **锁定笔记** — `isLocked=true` 的笔记正文不可读取，仅导出标题并标记
6. **数据路由** — 使用 `_cwStore.__CW__allNotes` 绕过视图层，不要用剪贴板或虚拟列表滚动
7. **稳定性等待** — 笔记数组可能尚未加载完毕，须等 count 稳定后再导出
8. **Windows 路径** — 文件名自动清理不可见 Unicode 字符和非法字符

## Resumable Export

如果导出中途失败或限速停止，重新运行同样命令即可从断点续传。工具会读取 `_export_progress.json` 跳过已导出的笔记。

## Troubleshooting

- 连接失败：确认 Edge 在 9229 端口运行（`http://127.0.0.1:9229/json/list` 能返回 JSON）
- Notes iframe 找不到：确认用户已登录并能看到 Notes 界面
- store 未就绪：工具优先点击「所有 iCloud 备忘录」文件夹触发数据加载（含全部笔记），fallback「备忘录」。若两者都为空或不存在，需用户手动点击一个有笔记的文件夹后再运行
- 详细踩坑记录见 `docs/pitfalls.md`

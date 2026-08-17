# Agent Note: envsel——按语言的会话环境选择（conda / 独立 R / WSL）

Status: implemented

[English](2026-08-17-envsel-session-environment-selection.md) | 中文

## 问题

Jupyter 笔记本按笔记本选内核；DeepSeek Harness 会话没有对应机制。用户要么靠命令恰好解析到的环境跑 Python/R，要么手动把 `conda activate` 前缀塞进每条 shell 命令。此前的动态 Cordis 插件（`envsel-1`）验证了机制（运行时上下文指引 + `DSH_*` 注入），但它是进程内的：重启后选择状态消失，且每个会话都要重新定义。

产品化带来了两个更硬的需求：（1）*按语言*选择——一个会话可以同时用 conda 环境跑 Python、用独立安装的 R 跑 R、再用另一个环境跑 shell 二进制；（2）*WSL* 环境——WSL 发行版内部的 conda 环境。

## 决策

新增宿主平面包 `@deepseek-ai/dsh-envsel`（`packages/shell/envsel`），作为 web-app bundle 的一行挂载。它在宿主组合里松散放置，无 realm 顾虑；自 Phase 2 起它也提供支撑头部下拉的 `envsel` Typert Remote 服务（见 [envsel 头部下拉——Typert Remote 网关与客户端包](2026-08-17-envsel-header-dropdown-typert-remote.md)）：

- **槽位**。三个语言槽位（`python`、`r`、`cli`），各放一个环境；三者可同时设置。槽位兼容性按“语言解释器是否存在”判定：条目有 python 解释器才能填 `python`，有 Rscript 才能填 `r`，`cli` 任意。
- **发现**。`conda env list --json`（Windows 的 `.bat`/`.cmd` 经 `cmd.exe /c` 调用）；独立 R 来自平台默认根（Windows Program Files、macOS Framework/Homebrew、Linux `/opt/R` 与 `/usr`）以及 PATH 与可配置的 `standaloneRRoots`；WSL 发行版经 `wsl.exe --list --quiet`（仅 Windows；UTF-16LE），用 `wsl.exe -d <发行版> -- sh -lc …` 探测。后续改动为本机漏扫路径增加手动钉住（`$DSH_HOME/envsel-pinned.json`）——见 [envsel POSIX 发现与钉住路径](2026-08-17-envsel-posix-discovery-and-pinned-paths.md)。
- **持久性**。每次选择变更追加一个仅日志的会话事件 `envsel/selection`（last-write-wins，与 `approval/policy` 相同的 fold 模式）。该事件是生成词汇表 `KNOWN_SESSION_EVENT_TYPES` 的必需成员，因此冷加载无需 `ignorable` 即可接受它。消费者读 `agent.session.events` 的 fold，并缓存在内存 Map 中——无需任何投影机制即可重启安全。
- **模型面**。一个 `systemPrompt.context` 贡献（`envsel:selection`，order 116）按槽位渲染带可直接复制解释器调用的指引；运行时上下文投影在变化时按差异触发新快照消息，因此 “模型可见⟺已入日志” 通过快照机制成立。每次 shell 调用经 `shellEnv` 贡献者收到 `DSH_ENV_PYTHON` / `DSH_ENV_RSCRIPT` / `DSH_ENV_CLI_PREFIX`。
- **人类交互面（Phase 1）**。`/env` 命令（复用已装配的 `commandsRemote`，零新增 Remote）：`/env python=scRNAv2 r=R-4.4.1 cli=base`、`/env list`、`/env add <路径>`、`/env unpin custom:<名>`、`/env clear`、`/env wsl`、`/env help`。另有 `session_env` 模型工具（注册在全局工具层）。Phase 2 的头部下拉是同一份选择存储之上的第三个表面。

## 备选方案

- **完整客户端包 + 类型化 Remote**。页头下拉需要 `packages/client/*` 包、typert 生成的 Remote 与 `api/remotes` 装配。Phase 1 交付时将其推迟到 Phase 2，现已落地（见 [envsel 头部下拉——Typert Remote 网关与客户端包](2026-08-17-envsel-header-dropdown-typert-remote.md)）；在此期间 `/env` 命令复用现成命令面，零新增传输成本。
- **仅用户层 home 补丁（`~/.dsh/cordis.patch.yml`）**。它被 watch 且可热挂载，但新包的解析依赖 `$DSH_HOME/profiles/node_modules` 回退，而该回退只在包已声明进某个 bundle 清单并完成一次启动后才存在——无论如何都需要重启。因此行放在 `packages/bundle/web-app/cordis.patch.yml`，依赖声明在该 bundle 的 `package.json`（随部署版本化，且能被从 `apps/cli` 出发的 heal BFS 解析）。

## 后果

- 选择在 DSH 重启后仍在（持久事件），但按会话隔离、内存预热；无跨会话共享。
- `session_env` 对每个 preset 的 agent 可见（全局工具层）；移到 agent preset 之后再说。
- WSL 条目经 `wsl.exe -d <发行版> -- …` 执行；Windows 路径在 WSL 内是 `/mnt/c/…`——提示指引里明确说明。
- bundle 行接管后停用动态插件 `envsel-1`，旧 `DSH_CONDA_*`/`DSH_R_*` 变量与新 `DSH_ENV_*` 变量不会并存。

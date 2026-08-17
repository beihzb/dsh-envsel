# dsh-envsel — Session Environment Selector · 会话环境选择器

> **对外名（仓库/文档名）**：dsh-envsel（环境坞） · **包内名（代码标识符）**：`@deepseek-ai/dsh-envsel` / `@deepseek-ai/dsh-client-ui-envsel`

dsh-envsel 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的会话环境选择器：像 Jupyter 内核选择器一样，为每个会话按语言（Python / R / CLI 工具）指定一个「优先环境」，可选择 conda 环境、独立 R 安装、WSL 发行版，或用户手动钉住的自定义路径。选择结果持久化为会话事件（`envsel/selection`），浏览器的页头下拉、`/env` 命令、`session_env` 模型工具共用同一个选择存储；每次 shell 调用自动注入 `DSH_ENV_*` 事实，让模型和命令执行使用同一套解释器。

English: dsh-envsel is a session environment selector for DeepSeek Harness — a Jupyter-kernel-style picker that assigns each session a per-language first-priority environment (Python / R / CLI) drawn from conda, standalone R installs, WSL distros, or user-pinned custom paths. The selection is a durable per-session event shared by the header dropdown, the `/env` command, and the `session_env` tool, and every shell call receives `DSH_ENV_*` facts.

## 功能特性 · Features

- **每会话独立选择**：`python` / `r` / `cli` 三个槽位各持一个环境，同一会话可同时用 `scRNAv2`（Python）、`R-4.5.1`（独立 R）和 `base`（CLI）。
- **跨平台自动发现**：conda（`conda env list --json`）、独立 R（Windows Program Files / macOS Framework 与 Homebrew / Linux `/opt/R`、`/usr`、`/usr/local`）、WSL（仅 Windows，非 Windows 永不启动 `wsl.exe`）。
- **手动钉住路径**：自动发现漏掉时，可在页头「添加路径」、`/env add <路径>` 或 `session_env action=pin` 钉住解释器或安装目录；写入 `$DSH_HOME/envsel-pinned.json` 本机缓存，之后每个会话都能看到，并可用 `/env unpin custom:<名>` 移除。
- **持久可重放**：选择是 log-only 会话事件，重启后按折叠值恢复；从不进入模型转录，模型通过运行时上下文快照得知当前选择。
- **单一存储多入口**：页头下拉、`/env` 命令、`session_env` 工具是同一份 `envsel/selection` 事件的三个读写者，UI 与命令行永不分歧。

## 仓库结构 · Layout

```
packages/shell/envsel/        # 宿主端插件包：发现、pin 缓存、/env 命令、session_env 工具、envsel Remote
packages/client/ui-envsel/    # 浏览器端插件包：页头下拉 UI（含「添加路径」表单）与本地化文案
patches/host-integration.patch # 将两个新包织入 deepseek-harness 的宿主侧改动（供参考，非独立可运行插件）
docs/agent-notes/             # 设计决策记录（英文 + 中文）
LICENSE                       # MIT（沿用 deepseek-harness）
```

## 集成进 deepseek-harness · Integration

这两个包**不是独立可安装的插件**：它们织入 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) monorepo，依赖 `@deepseek-ai/cordis`、`dsh-typert`（Remote 代码生成）、`dsh-api-remotes`（客户端装配）、`dsh-shell-env`（`DSH_ENV_*` 注入）等内部包。在官方仓库中集成需要：

1. 将 `packages/shell/envsel/` 与 `packages/client/ui-envsel/` 复制到对应位置；
2. 在 `packages/bundle/web-app/cordis.patch.yml` 与 `package.json` 登记两行插件；
3. 在 `tsconfig.base.json` / `tsconfig.client.json` / `tsconfig.host.json` 与 `packages/api/remotes` 中登记路径与远程装配；
4. 在 `packages/core/session/src/known-event-types.ts` 登记 `envsel/selection` 事件；
5. 运行 `pnpm install`、`tsc -b` 与 tsdown 构建（宿主与客户端两遍），重启 DSH 后生效。

`patches/host-integration.patch` 是当前官方仓库 HEAD（`47f9438`）上这组既有文件改动的完整 diff，可作为集成参考；新包本身已在本仓库以完整源码形式提供。

## 使用 · Usage

### 浏览器

会话页头右侧的「环境」下拉：每个槽位列出可用环境，一键分配/清除；面板顶部的「添加路径」可钉住一个本机解释器或安装目录路径。

### 命令

```
/env python=scRNAv2 r=R-4.4.1 cli=base   # 一次设置多个槽位
/env list [关键词]                        # 列出目录
/env add /opt/homebrew/bin/Rscript       # 钉住一个路径（macOS）
/env add /usr/bin/Rscript                # 钉住系统 R（Linux）
/env unpin custom:<名>                    # 移除一条钉住记录
/env clear                               # 清空全部槽位
```

### 模型工具

`session_env`：`action=list` 列出目录、`action=get` 查看当前选择、`action=set` 分配/清除一个槽位、`action=pin|unpin` 管理钉住路径。

### Shell 事实

每次 shell 调用自动携带 `DSH_ENV_PYTHON`、`DSH_ENV_RSCRIPT`、`DSH_ENV_CLI_PREFIX`，描述当前槽位选定的解释器。

## 已知限制 · Known limitations

- 发现逻辑依赖具体安装布局（conda 元数据、R 目录结构、WSL UTF-16 输出），随发行版变化可能静默漏扫；手动钉住是兜底。
- 钉住路径是本机缓存（`$DSH_HOME/envsel-pinned.json`），不随会话跨机器迁移；同名目录的两个钉住记录共享 `custom:<名>` 地址，需按原始路径取消。
- WSL 发现仅限 Windows，且冷启动发行版探测可能耗时数秒（受 `listTtlMs` 缓存）。
- 系统 Python（`/usr/bin/python3`、Xcode stub、pyenv shim）不会自动入目录，除非手动钉住。

## License

MIT — 见 [LICENSE](LICENSE)。代码源自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，版权归 DeepSeek 所有。
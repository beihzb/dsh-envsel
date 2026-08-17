# Agent Note: envsel POSIX discovery and machine-local pinned paths

Status: implemented

[English](2026-08-17-envsel-posix-discovery-and-pinned-paths.md) | 中文

## Problem

envsel 的发现逻辑按 Windows 宿主写成。独立 R 只扫 `C:\Program Files\R`，`prefixFromRscript` 用 `\\` 拼接并丢掉 POSIX 前导 `/`，`wslEnabled` 默认 true，因此 macOS / Linux 刷新目录会去 spawn `wsl.exe` 并弹出「WSL 不可用」。这些机器上 conda 可用，但 CRAN / Homebrew / apt 装的 R 不会出现，扫描漏掉的路径也没有记住的办法。

## Decision

保持一份目录和一份 `envsel/selection` 存储。发现改为按平台分支，漏掉的安装可以钉住一次，之后这台机器上的每个会话都能看到。本改动扩展的存储与 Remote 见 [envsel 会话环境选择](2026-08-17-envsel-session-environment-selection.md) 与 [envsel 头部下拉](2026-08-17-envsel-header-dropdown-typert-remote.md)。

1. **POSIX 独立 R。** `defaultStandaloneRRoots()` 提供 Windows Program Files、macOS Framework + Homebrew 前缀，以及 Linux `/opt/R` 加上 `/usr` / `/usr/local`。`scanRRoot` 按宿主分隔符拼接，接受 `R-4.x` 与 `4.4-arm64` 子目录，并把本身已有 `bin/Rscript` 的根当作单个安装。`prefixFromRscript` 保留 `/` 与前导斜杠。macOS Framework 的 `Current` 符号链接被跳过，避免与版本目录重复。
2. **WSL 仅 Windows。** 非 Windows 宿主上 `discoverAll` / `wslDistros` 立即返回且不发警告。macOS / Linux 上的 `/env wsl` 报告跳过并指向 `/env add`。
3. **CLI 快照。** `selectionContext` 使用 `cliPathGuidance`：Windows 写 PowerShell PATH，POSIX 写 `export PATH="<prefix>/bin:<prefix>:$PATH"`，WSL 条目仍用原来的 `wsl.exe` 行。
4. **手动钉住路径。** `probeCustomPath` 接受解释器文件（`python` / `python3` / `Rscript` 及其 `.exe`）或安装目录。探测成功后记为 `kind: 'custom'`，追加到 `$DSH_HOME/envsel-pinned.json`。之后每次合并目录都会重新探测这些路径；消失的路径留在磁盘上作为警告，直到 unpin。入口：页头「添加路径」+ 每条手动条目的 unpin、`/env add` / `/env unpin`、`session_env action=pin|unpin`，以及 Remote `pin` / `unpin`。

## Alternatives considered

- **`settings.yaml` 的 `envsel` 段。** 与 shell 超时模式一致，但会让本来只需 `fs` 的包装上 `settings` 硬依赖。`$DSH_HOME` 下单独的 JSON 文件不引入可选服务，一份文档一个所有者。
- **自动收录 `/usr/bin/python3` 与 pyenv shim。** 开发机噪音太大（Xcode stub、多个 pyenv 版本）。用户输入自己真正要用的路径。
- **默认 `wslEnabled: false`。** 不用平台判断也能消掉 POSIX 警告，但 Windows 上要等部署改配置才会再出现 WSL。平台门闩保留 Windows 默认。

## Consequences

- macOS 与 Linux 目录在无额外配置下列出 conda 以及 Framework / Homebrew / `/usr` / `/opt/R` 安装；漏掉的布局仍可用底部钉住补上。
- `$DSH_HOME/envsel-pinned.json` 是本机状态，不是会话事件。已经选过某条 custom 的会话在 unpin 后仍保留该快照。
- Remote 线缆新增 `pin` / `unpin`；头部与 `api/remotes` 客户端组装必须重建，运行中的 DSH 需要重启一次并刷新页面。
- `EnvKind` 现含 `custom`。旧选择事件从未携带该 kind；未知 kind 仍只作为展示快照。

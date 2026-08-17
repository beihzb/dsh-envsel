# @deepseek-ai/dsh-envsel

[English](README.md) | 中文

会话环境选择器：为当前会话按语言选择第一优先环境，来源包括 conda、独立安装的 R、WSL 发行版和用户手动钉住的路径——一个放在 harness 里而非 notebook 里的“Jupyter 内核选择器”。

每个会话有三个独立的语言槽位——`python`、`r`、`cli`——每个槽位可同时各放一个环境，因此一个会话可以同时用 `scRNAv2` 跑 Python、用独立安装的 `R-4.5.1` 跑 R、用 `base` 跑 shell 二进制。选择是**持久、可重放**的会话事件（`envsel/selection`，仅日志、不进模型对话流）；模型通过运行时上下文快照获知当前选择，每次 shell 调用都会收到 `DSH_ENV_*` 变量。

## 用户与模型的交互面

| 交互面 | 机制 |
| --- | --- |
| 浏览器里切换 | 页头下拉（`envsel` Remote，由 [`@deepseek-ai/dsh-client-ui-envsel`](../../client/ui-envsel/README.md) 提供）与 `/env` 命令（已装 `/` 命令面板）：`/env python=scRNAv2 r=R-4.4.1 cli=base`、`/env list [关键词]`、`/env add <路径>`、`/env unpin custom:<名>`、`/env clear`、`/env wsl`、`/env help` |
| 对话里切换 | `session_env` 模型工具（`action=list|get|set`，带 `slot`/`kind`/`name`） |
| 模型指引 | 每个已设置槽位在运行时上下文快照里生成一段：精确解释器调用（`C:\…\python.exe`、独立 `Rscript` 或 `wsl.exe -d <发行版> -- …`），WSL 附带 `/mnt/c` 路径说明 |
| shell 变量 | 由 [`@deepseek-ai/dsh-shell-env`](../shell-env/README.md) 收集进每次 shell 调用：`DSH_ENV_PYTHON` / `DSH_ENV_RSCRIPT` / `DSH_ENV_CLI_PREFIX` |

## 浏览器 Remote

本包提供一个 `envsel` Typert Remote（`list` / `get` / `set`），由 [`EnvselRemoteService`](src/remote.ts) 生成。网关实例在插件体内创建，因此与命令、工具、上下文路径共用同一份目录缓存与会话级选择状态——页头下拉里的修改与 `/env` 的修改是同一条持久化的 `envsel/selection` 事件。api/remotes 客户端组装挂载 `./remote` 命名空间，`@deepseek-ai/dsh-client-ui-envsel` 的页头下拉是它的消费者。

## 发现机制

- **conda**：`conda env list --json`（可执行名由 `condaCommand` 配置；Windows 的 `.bat`/`.cmd` 包装经 `cmd.exe /c` 调用）。条目探测 `<prefix>\python.exe` 与 `<prefix>\Library\bin\Rscript.exe`（POSIX：`bin/python`、`bin/Rscript`）。
- **独立 R**：Windows 扫描 `C:\Program Files\R\R-*` 与 `C:\Program Files (x86)\R\R-*`；macOS 扫描 `/Library/Frameworks/R.framework/Versions/*`、Homebrew 的 `/opt/homebrew/opt/r` 与 `/usr/local/opt/r`；Linux 扫描 `/opt/R/<版本>`，以及本身已有 `bin/Rscript` 的 `/usr`、`/usr/local`。不存在的根目录静默跳过。PATH 上不属于 conda `envs` 目录的 Rscript 也会收录。`standaloneRRoots` 可追加扫描根。
- **WSL**：仅 Windows，且仅当 `wslEnabled` 为 true。非 Windows 宿主从不调用 `wsl.exe`，也不发出 WSL 警告。Windows 上 `wsl.exe --list --quiet` 按 UTF-16LE 解码；每个发行版经 `wsl.exe -d <发行版> -- sh -lc …` 探测 conda 环境与系统 `/usr/bin/python3`、`/usr/bin/Rscript`。冷启动一个发行版可能耗时数十秒，因此每个子进程探测都有超时。
- **手动钉住**：用户给出的解释器文件或安装目录（`/env add`、页头「添加路径」、或 `session_env action=pin`）会探测 python/Rscript，以 `kind: 'custom'` 写入 `$DSH_HOME/envsel-pinned.json`，并并入之后每一次目录。unpin 只删缓存行，已选会话快照保留。

## 配置

```yaml
- id: envsel
  name: '@deepseek-ai/dsh-envsel'
  config:
    listTtlMs: 300000        # catalog cache TTL
    condaCommand: conda      # conda executable name or absolute path
    standaloneRRoots: []     # extra standalone-R roots beyond the platform defaults
    wslEnabled: true         # allow WSL discovery on Windows; ignored on macOS/Linux
    registerTool: true       # register the session_env model tool
    probeTimeoutMs: 20000    # per-subprocess probe watchdog
```

## 模型体验

按装配顺序的直接模型可见效果：

1. **运行时上下文快照**——一个 `envsel:selection` 上下文贡献（order 116）。未设置任何槽位时为空；否则每个已设置槽位生成一段，说明所选环境、解释器调用方式和（WSL 时）路径注意事项。选择变更会在下一模型步触发一条新的 “Current runtime context” 快照消息，模型始终看到当前生效的选择。
2. **`session_env` 工具**——`registerTool` 为 true 时注册。`list` 返回完整目录（`entries` + `warnings`），`get` 返回当前选择，`set` 设置/清空一个槽位。`set` 会追加持久化的 `envsel/selection` 事件；上下文快照从下一轮起可见。
3. **`DSH_ENV_*` shell 变量**——每次 shell 调用收集 `DSH_ENV_PYTHON` / `DSH_ENV_RSCRIPT` / `DSH_ENV_CLI_PREFIX`，使命令执行与模型的 shell 推理对所选解释器保持一致。

#### KV 缓存影响

运行时上下文快照由 `RuntimeContextProjection` 按差异触发（只有拼接后的快照文本变化才追加新消息），因此选择不变时不扰动请求历史；选择变更恰好追加一条快照消息。

## 已知限制与后续工作

- **WSL 扫描仅 Windows 且可能较慢。** 首次 Windows 扫描在 WSL 服务未运行时需要冷启动发行版（数十秒）；条目按 `listTtlMs` 缓存。macOS 与 Linux 完全跳过 WSL。
- **槽位兼容性按语言解释器判定。** 独立 R 无法填入 `python` 槽位（没有 python），而带 python 解释器的 conda R 环境两个槽位都能填。
- **钉住的路径是本机状态。** `$DSH_HOME/envsel-pinned.json` 不进会话日志，也不会随会话带到另一台机器。两条钉住路径若叶子目录名相同，会共用 `custom:<名>` 地址；此时请用原始路径 unpin。
- **系统 python 不会自动收录。** `/usr/bin/python3`、Xcode stub 与 pyenv shim 不进目录，除非用户手动钉住。
- **`session_env` 注册在全局工具层**（本宿主行），所有 preset 的 agent 都能看到。移到 agent preset 需要 preset 侧工具行，待宿主特性的 preset 工具归属方案确定后处理。

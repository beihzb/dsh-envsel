# dsh-envsel

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的会话环境选择器。按语言槽位 —— Python、R、CLI 工具 —— 每个槽位各持有一个来自 **conda**、**独立 R** 安装、**WSL** 发行版或**手动固定路径**的首选环境。选择按会话隔离、重启后保留，并从下一轮起对模型生效。

这是一个**独立的、可通过 npm 安装的 DSH 插件**。用 `dsh plugin add` 安装即可 —— 无需打源码补丁，也无需 monorepo 检出。

## 功能

- **`/env` 命令** —— 在对话中查看、设置、清空和列出环境。
- **`session_env` 模型工具** —— 智能体可以自行列出、选择、固定和取消固定环境。
- **`DSH_ENV_*` shell 事实** —— 每次 shell 调用都会看到会话所选环境的 `DSH_ENV_PYTHON`、`DSH_ENV_RSCRIPT`、`DSH_ENV_CLI_PREFIX`。
- **头部下拉框** —— 会话头部提供按语言（Python / R / CLI 工具）选择的面板，并带「添加路径」表单，可固定任意解释器或安装目录。
- **跨平台发现** —— conda 环境、独立 R（Windows `Program Files`、macOS 框架 + Homebrew、Linux `/opt/R`）、Windows 上的 WSL 发行版，以及手动固定的路径。WSL 扫描在非 Windows 主机上自动跳过。
- **中英双语 UI** —— 产品文案（`/env` 命令、头部下拉框、发现警告）跟随 DSH 界面语言：默认英文，当 DSH 语言偏好设为中文时显示中文。

## 环境要求

- DeepSeek Harness **0.1.0-rc.7 或兼容的 0.1.0-rc.x**（web profile）。插件的 peer 依赖是该版本自带的官方 `@deepseek-ai/dsh-*@0.1.0-rc.7` 包。
- PATH 上有 `pnpm`（`dsh plugin` 会用到）。

## 安装

```sh
dsh plugin --profile web add @beihaizb/dsh-envsel
```

重启 `dsh web`，打开一个已有会话，对话头部就会出现 **Env** 下拉框；`/env` 和 `session_env` 立即可用。

从本地检出安装：

```sh
dsh plugin --profile web add "file:/绝对/路径/到/本仓库"
```

## 使用

### `/env` 命令

```
/env                        查看当前选择
/env python=mycondaenv    设置 Python 槽位（conda 名 / 独立R名 / wsl:发行版:名 / custom:名）
/env r=R-latest            设置 R 槽位
/env cli=base               设置 CLI 槽位（PATH 前缀）
/env python=                清空某个槽位
/env list [过滤词]           列出所有可发现的环境
/env add <路径>              把解释器或安装目录记入本机缓存
/env unpin custom:<名>       移除一条固定路径
/env clear                  清空全部选择
/env wsl                    重新扫描 WSL 发行版（仅 Windows）
```

### `session_env` 工具

智能体可以用 `action=list|get|set|pin|unpin` 自行管理选择。

### 头部下拉框

会话头部的 **Env** 按钮会打开按语言分类的下拉面板。目录在首次打开时惰性扫描（探测 conda 和 WSL 需要几秒）。「添加路径」可把任意绝对解释器或安装路径固定进本机缓存。

## 配置

插件无需任何配置即可工作。可选的在 profile 的 `cordis.patch.yml` 中给 `envsel` 行加 `config`：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `listTtlMs` | `300000` | 目录缓存 TTL（毫秒）。 |
| `condaCommand` | `conda` | conda 可执行文件名或绝对路径。 |
| `standaloneRRoots` | `[]` | 在平台默认值之后额外扫描的独立 R 根目录。 |
| `wslEnabled` | `true` | 是否启用 WSL 发现（仅 Windows）。 |
| `registerTool` | `true` | 是否注册 `session_env` 模型工具。 |
| `probeTimeoutMs` | `20000` | 每次探测的看门狗超时（毫秒）。 |

示例：

```yaml
# 在你的 profile 的 cordis.patch.yml 中，位于 bundle 层之后
- id: envsel
  name: 'dsh-envsel'
  config:
    wslEnabled: false
    registerTool: true
```

## 选择如何存储

选择保存在本机 JSON 存储（`$DSH_HOME/envsel-state.json`，按会话 id 键控）中 —— **而不是会话事件日志**。harness 的 session-persistence 读取器会拒绝包含未知事件类型的日志（除非事件标记为可忽略），而 `Session.append` 没有为下游插件提供设置该标记的途径。把选择变更写进日志会让该会话在重启后无法读取，因此本插件自带独立的状态存储。

## 开发

```sh
pnpm install
pnpm run build    # tsc（类型）+ tsdown（lib/index.js 宿主 + lib/client.js 浏览器包）
pnpm run test     # node:test 单元测试
```

构建产生两个产物：`lib/index.js`（宿主插件，从包根加载）和 `lib/client.js`（浏览器包，由 client-modules 扫描器根据包的 `dsh.client` 声明提供）。单个包可以同时是宿主行和 client 行。

## 已知限制

- **没有按会话的 runtime-context 文本。** 官方 `AssembleContext` 没有 agent 绑定，因此选择不会渲染进模型的系统提示。模型仍会通过每次 shell 调用的 `DSH_ENV_*` 看到选择，并可用 `/env` / `session_env` 查询。
- **peer 绑定 0.1.0-rc.x。** 插件声明 `@deepseek-ai/dsh-*@^0.1.0-rc.7` peer。未来改变这些 API 的 DSH 大/小版本需要插件跟版。
- **选择不属于会话日志。** 它们会在重启后保留在 `envsel-state.json` 中，但不会从（或由）会话日志重放。

## License

MIT

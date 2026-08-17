# Agent Note: envsel header dropdown — Typert Remote gateway and client package

Status: implemented

[English](2026-08-17-envsel-header-dropdown-typert-remote.md) | 中文

## Problem

Phase 1（[envsel 会话环境选择](2026-08-17-envsel-session-environment-selection.md)）交付了宿主平面包，包含 `/env` 命令与 `session_env` 工具，但没有持久化的 GUI：早期动态插件的头部按钮随进程而生、重启即失，而正式挂载的行只提供对话层面的变更路径。用户希望在会话头部找回 Jupyter 内核式的选择器——按会话生效、重启后常驻，并保持同样的灵活切换与指定语义。

## Decision

对正式装配的两处扩展，保持所有表面共享同一份选择存储与同一条持久化事件。

1. **在既有宿主包内增加 Remote 表面。** `EnvselRemoteService extends TypertRemoteService`（[`src/remote.ts`](../../../../packages/shell/envsel/src/remote.ts)）携带 `@Remote('list' | 'get' | 'set' | 'pin' | 'unpin')`。实例在 envsel 插件体内创建，并由 `Service` 构造函数（`super(ctx, 'envsel')`）注册为 `envsel` 服务，因此其处理器闭包共享插件的目录缓存与会话级选择 Map——头部下拉、`/env`、`session_env` 是同一条 `envsel/selection` 会话事件的三个读写方。`pin` / `unpin` 写入 [envsel POSIX 发现与钉住路径](2026-08-17-envsel-posix-discovery-and-pinned-paths.md) 所述的本机路径缓存。package.json 声明 `./typert` 与 `./remote` 导出及文件；typert 生成器在宿主构建时产出产物，typert-loader 注册严格清单（envsel 是 loader 行），api 网关在每次调用时从实时 Context 解析该服务。
2. **客户端包 `@deepseek-ai/dsh-client-ui-envsel`。** 向 `conversation.session.header.utilities`——头部右对齐、会话级作用域的栏位——注册一个条目，使每个会话的头部显示并编辑自己的选择。触发器始终渲染，摘要按槽位展示（`Python: scRNAv2 · R: R-4.5.1`）或"未选择"；目录仅在面板首次打开时拉取，因为探测 conda 与 WSL 需要数秒；每个槽位分区列出可服务于该槽位的目录条目，提供一键指定与清除；底部可钉住用户输入的本机路径，手动条目可 unpin；按 Escape 或点击面板外部即关闭。错误以本地化业务码（session/entry/incompatible/invalid-path/not-found/no-interpreter）呈现。
3. **装配。** api/remotes 客户端面挂载 `@deepseek-ai/dsh-envsel/remote` 并再导出 envsel 类型；web-app 补丁在既有 `envsel` 宿主行旁新增 `ui-envsel` 浏览器行；bundle 的 package.json 声明依赖；客户端聚合与 `tsconfig.base.json` 路径新增该包及 `@deepseek-ai/dsh-envsel/types` 子路径。

运行时提供的 `TypertRemoteService`（而非 loader 挂载的默认导出类）之所以可行，是因为 `Service` 构造函数会调用 `ctx.reflect.provide`，从而填充 `ctx.reflect.props`——api 网关的 SRC 发现即遍历该映射——而严格线缆描述符来自包经 typert-loader 生成的 `./typert` 清单。这使环境选择保持单一所有者（envsel 插件），目录与选择状态零重复。

## Alternatives considered

- **Loader 挂载的网关类（plugin-inventory / message-feedback 模式）。** 独立包默认导出服务类，会迫使业务逻辑要么经新的服务接缝跨包，要么重复目录缓存与选择 Map。运行时提供的实例让所有路径共用一个闭包持有的存储；api 网关通过 `ctx.reflect.props` 支持这一点。
- **独立 `envsel-remote` 包消费 `envsel` 服务。** 抽象上更干净的接缝，但为单一消费者新增一个包、一份服务契约与跨包 inject；除非出现第二个选择存储消费者，否则推迟。
- **仅复用 `/` 命令面板。** 无新增传输成本，但没有持久化头部入口——这正是本阶段要解决的痛点。

## Consequences

- 头部下拉、`/env`、`session_env` 是同一份选择存储与同一条持久化事件的三个表面；任何一处的变更，其余表面与模型（运行时上下文快照 diff、`DSH_ENV_*` shell 变量）在下一步即可见。
- envsel 不再是纯贡献者：它提供了一个服务（`envsel`）并新增 `./typert` / `./remote` 发布产物，因此 web-app 补丁注释与 Phase 1 笔记中"不发布服务"的表述已同步更新。
- 客户端产物是浏览器构建物（`lib/client.js`，经 `/plugins/<id>/client.js` 提供）；看到按钮需要重建 web dist 并刷新页面，宿主侧变更需要重启一次 DSH。
- `conversation.session.header.utilities` 迎来第一个占用者；`ui-jobs` 与 `ui-subagent` 继续占用 `conversation.session.header.actions`，两个栏位按设计保持分离。

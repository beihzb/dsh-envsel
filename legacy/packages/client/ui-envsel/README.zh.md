# @deepseek-ai/dsh-client-ui-envsel

[English](README.md) | 中文

Web 端会话环境选择器：向 `conversation.session.header.utilities`（会话头部右对齐的工具带）贡献一个入口，打开基于 `envsel` Remote 的分语言（Python / R / CLI 工具）下拉面板。这是为 harness 打造的 Jupyter 内核式选择器：用户在头部点选环境，当前会话随即开始使用它，无需打开 `/` 命令面板，也不必让模型调用 `session_env`。

选择是会话级且共享的。头部组件通过生成的 `envsel` Remote（`list` / `get` / `set` / `pin` / `unpin`）与宿主通信，与 `/env` 命令、`session_env` 工具共用同一份目录缓存与会话级选择状态——在这里切换与在对话中切换是同一个持久化的 `envsel/selection` 会话事件，运行时上下文快照、`DSH_ENV_*` shell 变量以及模型下一轮观察到的选择，与执行 `/env python=scRNAv2` 后完全一致。

触发器始终渲染（会话完全可以尚未做任何选择）；其摘要显示已设置的槽位（`Python: scRNAv2 · R: R-4.5.1`）或"未选择"。目录仅在面板首次打开时拉取：探测 conda 与 WSL 需要数秒，关闭状态的头部不应为每个会话承担这笔开销。每个槽位分区列出可服务于该槽位的目录条目（Python 槽位：含 python 解释器的条目；R 槽位：含 Rscript 的条目；CLI 槽位：全部条目），标记当前选择，并提供一键清除。面板底部可粘贴解释器或安装目录的绝对路径（`pin`），自动扫描漏掉 Homebrew / Framework / `/usr` 的 R 时仍可补上；手动条目可从同一列表 unpin。选择读取失败时保留上次摘要并在面板中显示可重试的提示条；设置或添加失败时内联显示其业务错误码（session/entry/incompatible/invalid-path/not-found/no-interpreter）。按 Escape 或点击面板外部即关闭面板并将焦点还给触发器。

样式仅使用主题 token；文案走本包自有的 `session.envsel` locale 命名空间（中文产品文案，英文词典）。

## Model Experience

无直接效果：本包仅为人类渲染并修改会话选择，不新增任何自身的 prompt、消息、schema、流或工具结果。头部变更对模型可见的后果，与宿主 [`dsh-envsel`](../../shell/envsel/README.md) 包对其 `envsel/selection` 事件所记录的一致——下一轮模型步骤的运行时上下文快照 diff，以及下一次 shell 调用收集到的 `DSH_ENV_*` 变量。

#### KV Cache 效果

无；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **每个槽位一个环境。** 槽位只保存用户选定的单一优先环境；目录按语言存在性过滤，因此独立 R 安装无法填充 Python 槽位。
- **目录每个会话先拉取一次，之后就地更新。** 头部在页面生命周期内缓存目录；页面保持打开期间 conda/WSL 环境发生变化时，需刷新页面才能看到那些新条目。钉住或取消钉住手动路径会用返回值替换缓存的目录。
- **摘要仅在挂载时读取一次。** 按钮在会话头部挂载时读取折叠后的选择，并依据每次 `set` 的返回值更新；因此其他标签页中的修改只在对应标签页提交后才会体现。

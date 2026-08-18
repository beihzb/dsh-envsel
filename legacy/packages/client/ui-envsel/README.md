# @deepseek-ai/dsh-client-ui-envsel

English | [中文](README.zh.md)

Web session environment selector: contributes one entry to `conversation.session.header.utilities` — the right-aligned band of the conversation header — that opens per-language (Python / R / CLI tools) dropdowns over the `envsel` Remote. This is the Jupyter-kernel-style picker for the harness: a human clicks an environment in the header and the current session starts using it, without touching the `/` command palette or asking the model to call `session_env`.

The selection is session-owned and shared. The header utility talks to the host through the generated `envsel` Remote (`list` / `get` / `set` / `pin` / `unpin`), which is backed by the same catalog cache and per-session selection state as the `/env` command and the `session_env` tool — so switching here and switching in chat are the same durable `envsel/selection` session event, and the runtime-context snapshot, `DSH_ENV_*` shell facts, and the model's next turn all observe the new selection exactly as they would after `/env python=scRNAv2`.

The trigger always renders (a session may legitimately have no selection yet); its summary shows the set slots (`Python: scRNAv2 · R: R-4.5.1`) or `未选择`. The catalog is fetched only when the panel first opens: probing conda and WSL takes seconds, and a closed header must not pay that cost for every session. Each slot section lists the catalog entries that can serve it (Python slot: entries with a python interpreter; R slot: entries with Rscript; CLI slot: every entry), marks the current choice, and offers a one-click clear. The panel footer accepts an absolute interpreter or install path (`pin`) so a machine whose automatic scan missed Homebrew / Framework / `/usr` R can still add it; a custom entry can be unpinned from the same list. A failed selection read keeps the last summary and shows a retryable banner in the panel; a failed set or pin shows its business code (session/entry/incompatible/invalid-path/not-found/no-interpreter) inline. Escape or a pointer press outside closes the panel and returns focus to the trigger.

Styling uses theme tokens only; copy goes through the package's own `session.envsel` locale namespace (Chinese product copy, English dictionary).

## Model Experience

None directly: this package renders and mutates a session selection for a human and adds no prompt, message, schema, stream, or tool result of its own. The model-visible consequences of a header change are exactly the ones the host [`dsh-envsel`](../../shell/envsel/README.md) package already documents for its `envsel/selection` event — the runtime-context snapshot diff on the next model step, and the `DSH_ENV_*` shell facts on the next shell call.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **One environment per slot.** A slot holds the single first-priority environment the user picked; the catalog is filtered by language presence, so a standalone R install cannot fill the Python slot.
- **The catalog is fetched once per session, then updated in place.** The header caches the catalog for the lifetime of the page; a machine whose conda/WSL environments change while the page stays open needs a reload to see those new entries. Pinning or unpinning a custom path replaces the cached catalog from the reply.
- **Selection summary is read once per mount.** The button reads the folded selection when the session header mounts and updates it from every `set` reply, so a selection changed from another tab appears after that tab's own commit only.

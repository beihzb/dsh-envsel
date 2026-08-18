# dsh-envsel

Session environment selector for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Per-language slots — Python, R, CLI tools — each hold one first-priority environment drawn from **conda**, **standalone R** installs, **WSL** distributions, or **user-pinned custom paths**. Selections are per-session, persisted across restarts, and take effect for the model from the very next turn.

This is a **standalone, npm-installable DSH plugin**. It installs with `dsh plugin add` — no source patching, no monorepo checkout.

## Features

- **`/env` command** — read, assign, clear, and list environments from the chat.
- **`session_env` model tool** — the agent can list, select, pin, and unpin environments on its own.
- **`DSH_ENV_*` shell facts** — every shell call sees `DSH_ENV_PYTHON`, `DSH_ENV_RSCRIPT`, `DSH_ENV_CLI_PREFIX` for the session's selection.
- **Header dropdown** — a per-language selector in the conversation header (Python / R / CLI tools), with an "Add path" form to pin any interpreter or install directory.
- **Cross-platform discovery** — conda environments, standalone R (Windows `Program Files`, macOS framework + Homebrew, Linux `/opt/R`), WSL distributions on Windows, and manually pinned paths. WSL scanning is skipped automatically on non-Windows hosts.

## Requirements

- DeepSeek Harness **0.1.0-rc.7 or a compatible 0.1.0-rc.x** (the web profile). The plugin's peers are the official `@deepseek-ai/dsh-*@0.1.0-rc.7` packages that ship with that release.
- `pnpm` on PATH (used by `dsh plugin`).

## Installation

```sh
dsh plugin --profile web add dsh-envsel
```

Restart `dsh web`, open an existing session, and the **Env** dropdown appears in the conversation header; `/env` and `session_env` work immediately.

Installing from a local checkout instead:

```sh
dsh plugin --profile web add "file:/absolute/path/to/this/repo"
```

## Usage

### `/env` command

```
/env                        show the current selection
/env python=scRNAv2         set the Python slot (conda name / R name / wsl:distro:name / custom:name)
/env r=R-4.5.1              set the R slot
/env cli=base               set the CLI slot (PATH prefix)
/env python=                clear one slot
/env list [filter]          list all discoverable environments
/env add <path>             remember an interpreter or install directory on this machine
/env unpin custom:<name>    forget a pinned path
/env clear                  clear every slot
/env wsl                    rescan WSL distributions (Windows only)
```

### `session_env` tool

The model can manage selections itself with `action=list|get|set|pin|unpin`.

### Header dropdown

The **Env** button in the conversation header opens per-language dropdowns. The catalog is scanned lazily on first open (probing conda and WSL takes a few seconds). "Add path" pins any absolute interpreter or install path into the machine-local cache.

## Configuration

The plugin works with no configuration. Optional `config` on the `envsel` row in your profile's `cordis.patch.yml`:

| Key | Default | Meaning |
| --- | --- | --- |
| `listTtlMs` | `300000` | Catalog cache TTL in milliseconds. |
| `condaCommand` | `conda` | Conda executable name or absolute path. |
| `standaloneRRoots` | `[]` | Extra standalone-R roots scanned after the platform defaults. |
| `wslEnabled` | `true` | Whether WSL discovery is enabled (Windows only). |
| `registerTool` | `true` | Whether the `session_env` model tool is registered. |
| `probeTimeoutMs` | `20000` | Per-probe watchdog timeout in milliseconds. |

Example:

```yaml
# in your profile's cordis.patch.yml, after the bundle layer
- id: envsel
  name: 'dsh-envsel'
  config:
    wslEnabled: false
    registerTool: true
```

## How it stores selections

Selections persist in a machine-local JSON store (`$DSH_HOME/envsel-state.json`, keyed by session id) — **not** in the session event log. The harness's session-persistence reader refuses a log containing an event type it does not know unless the event is marked ignorable, and `Session.append` provides no way for a downstream plugin to set that marker. Writing selection changes into the log would make the owning session unreadable after a restart, so this plugin owns its own durable state instead.

## Development

```sh
pnpm install
pnpm run build    # tsc (types) + tsdown (lib/index.js host + lib/client.js browser bundle)
pnpm run test     # node:test unit tests
```

The build produces two artifacts: `lib/index.js` (the host plugin, loaded from the package root) and `lib/client.js` (the browser bundle, served by the client-modules scanner from the package's `dsh.client` declaration). A single package can be both a host row and a client row.

## Known limitations

- **No per-session runtime-context text.** The official `AssembleContext` has no agent binding, so the selection is not rendered into the model's system prompt. The model still sees the selection through `DSH_ENV_*` on every shell call and can query it with `/env` / `session_env`.
- **Peer-bound to 0.1.0-rc.x.** The plugin declares `@deepseek-ai/dsh-*@^0.1.0-rc.7` peers. A future DSH major/minor that changes these APIs needs a plugin update.
- **Selections are not part of the session log.** They survive restarts in `envsel-state.json` but are not replayed from (or carried by) session logs.

## License

MIT

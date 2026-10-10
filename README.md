# dsh-envsel

[![npm version](https://img.shields.io/npm/v/@beihaizb/dsh-envsel.svg)](https://www.npmjs.com/package/@beihaizb/dsh-envsel)
[![npm downloads](https://img.shields.io/npm/dm/@beihaizb/dsh-envsel.svg)](https://www.npmjs.com/package/@beihaizb/dsh-envsel)
[![license](https://img.shields.io/npm/l/@beihaizb/dsh-envsel.svg)](https://github.com/beihzb/dsh-envsel/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/beihzb/dsh-envsel.svg?style=social)](https://github.com/beihzb/dsh-envsel)

[English](README.md) | [中文](README.zh.md)

Session environment selector for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Per-language slots — Python, R, CLI tools — each hold one first-priority environment drawn from **conda**, **standalone R** installs, **WSL** distributions, or **user-pinned custom paths**. Selections are per-session, persisted across restarts, and take effect for the model from the very next turn.

This is a **standalone, npm-installable DSH plugin**. It installs with `dsh plugin add` — no source patching, no monorepo checkout.

## Features

- **`/env` command** — read, assign, clear, and list environments from the chat.
- **`session_env` model tool** — the agent can list, select, pin, and unpin environments on its own.
- **Per-turn runtime-context block** — the selection is restated in the model's runtime context on every turn, so the model reads which environment this session runs in instead of having to think to ask. A session with no selection of its own — a delegated subagent, for example — inherits the nearest selecting session it descends from.
- **`DSH_ENV_*` shell facts** — every shell call sees `DSH_ENV_PYTHON`, `DSH_ENV_RSCRIPT`, `DSH_ENV_CLI_PREFIX` for the session's selection.
- **Header dropdown** — a per-language selector in the conversation header (Python / R / CLI tools), with an "Add path" form to pin any interpreter or install directory.
- **Cross-platform discovery** — conda environments, standalone R (Windows `Program Files`, macOS framework + Homebrew, Linux `/opt/R`), WSL distributions on Windows, and manually pinned paths. WSL scanning is skipped automatically on non-Windows hosts.
- **Bilingual UI** — product copy (the `/env` command, the header dropdown, and discovery warnings) follows the DSH interface language: English by default, Chinese when the DSH language preference is set to 中文.

## Requirements

- DeepSeek Harness **0.1.7-rc.1 or newer** (the web profile), which now includes the **0.2.0-rc** line: every `@deepseek-ai/dsh-*` peer is declared as `^0.1.7-rc.1 || ^0.2.0-rc.1`. Verified on **0.1.7-rc.2**; the range also admits `0.2.0-rc.1`, `0.2.0-rc.2` and `0.2.1-alpha.2`. DSH skips a plugin bundle whose `@deepseek-ai/dsh*` peer range excludes the running runtime, so that range — not a version probe — decides whether this plugin loads.
- `pnpm` on PATH (used by `dsh plugin`).

## DSH version compatibility

| Plugin | DeepSeek Harness | Why |
| --- | --- | --- |
| **0.3.0** | **0.2.0-rc.1 or newer** for the runtime-context block; still loads on 0.1.7-rc.1+ without it | Renders the selection into the per-turn runtime context and lets a session with no selection inherit the nearest selecting session it descends from, so delegated subagents keep their parent's environment. The block is contributed through `systemPrompt.context()`, whose text provider receives the assembling agent as `AssembleContext.agent` — a binding DSH gained in 0.2.0-rc.1. |
| **0.2.0** | **0.1.7-rc.1 or newer (0.1.7-rc and 0.2.0-rc lines)** | Covers DSH 0.2.0-rc: every `@deepseek-ai/dsh-*` peer now also admits `^0.2.0-rc.1`, so the startup compatibility gate no longer skips the bundle. The 18 peers were still pinned to `^0.1.7-rc.1`, whose `<0.2.0` upper bound rejects a 0.2.x runtime. |
| **0.1.6** | **0.1.7-rc.1 or newer** | Fixes the header dropdown on 0.1.7: that release renamed the UI icon set (`IconCheckOutline14` became `IconCheckOutlineRegular`), so 0.1.5's button rendered an undefined element and the slot entry crashed. |
| 0.1.5 | 0.1.7-rc.1 or newer | Emits strict Typert codecs with the `create()` factory that 0.1.7-rc.1 introduced. Host-side surfaces (`/env`, `session_env`, `DSH_ENV_*`) work; the header dropdown does not. |
| 0.1.3 and earlier (published) | 0.1.0-rc.7 through 0.1.5-rc.x | Emits the eager `schema` instance those loaders validate. |

DSH changed the strict-codec contract in **0.1.7-rc.1**: `dsh-typert-loader` and `dsh-typert-registry` (host and browser side) require `typeof codec.create === 'function'` and no longer validate the eager `schema` field. A codec carrying only `schema` therefore fails to load on 0.1.7-rc.1 and newer, and a codec carrying only `create()` fails on 0.1.0-rc.x, so the two generations cannot share one artifact. This release targets the new contract only; on an older DSH, install the last release published for that line instead (the `v0.1.4` tag was never published to npm):

```sh
dsh plugin --profile web add @beihaizb/dsh-envsel@0.1.3
```

Every generated codec here is emitted through `strictCodec()` (`src/strict-codec.ts`), which supplies that factory, so the wire contract has one place to change.

## Installation

```sh
dsh plugin --profile web add @beihaizb/dsh-envsel
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
/env python=mycondaenv    set the Python slot (conda name / R name / wsl:distro:name / custom:name)
/env r=R-latest            set the R slot
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
| `registerContext` | `true` | Whether the selection is contributed to the per-turn runtime context (needs DSH 0.2.0-rc.1 or newer; a host without the binding renders nothing). |
| `probeTimeoutMs` | `20000` | Per-probe watchdog timeout in milliseconds. |

Example:

```yaml
# in your profile's cordis.patch.yml, after the bundle layer
- id: envsel
  name: '@beihaizb/dsh-envsel'
  config:
    wslEnabled: false
    registerTool: true
```

## How it stores selections

Selections persist in a machine-local JSON store (`$DSH_HOME/envsel-state.json`, keyed by session id) — **not** in the session event log. The harness's session-persistence reader refuses a log containing an event type it does not know unless the event is marked ignorable, and `Session.append` provides no way for a downstream plugin to set that marker. Writing selection changes into the log would make the owning session unreadable after a restart, so this plugin owns its own durable state instead.

A lookup uses the session's own entry when it has one, and otherwise walks the delegating-session chain (`SessionHeader.parentSession`) for the nearest session that selected anything. DSH gives every delegated subagent its own session, so this is what keeps a subagent's shell calls and notebook kernels on the environment the delegating session chose rather than the host default. The walk is bounded, skips the whole chain when nothing matches, and terminates on a lineage cycle.

## Development

```sh
pnpm install
pnpm run build    # tsc (types) + tsdown (lib/index.js host + lib/client.js browser bundle)
pnpm run test     # node:test unit tests
```

The build produces two artifacts: `lib/index.js` (the host plugin, loaded from the package root) and `lib/client.js` (the browser bundle, served by the client-modules scanner from the package's `dsh.client` declaration). A single package can be both a host row and a client row.

## Known limitations

- **The runtime-context block needs DSH 0.2.0-rc.1 or newer.** It is contributed through `systemPrompt.context()`, and the text provider is handed the assembling agent as `AssembleContext.agent` — a binding DSH added in 0.2.0-rc.1. On 0.1.7-rc the block renders nothing and the selection reaches the model only as `DSH_ENV_*` shell facts plus `/env` and `session_env`; nothing else changes. Set `registerContext: false` to turn the block off on any host.
- **Peer-bound to the 0.1.7-rc and 0.2.0-rc lines.** The plugin declares every `@deepseek-ai/dsh-*` peer as `^0.1.7-rc.1 || ^0.2.0-rc.1` and is verified up to `0.1.7-rc.2`; the 0.2.0-rc line is covered by that range. On DSH 0.1.0-rc.7 through 0.1.5-rc.x install `@beihaizb/dsh-envsel@0.1.3` (the last release published for that line) instead; a future DSH release that changes these APIs — or the Typert artifact contract again — needs a matching plugin update. On a line the peer range does not admit, grant an exact-version exemption (`dsh plugin allow-version`, or the plugin manager) rather than forcing the install.
- **Selections are not part of the session log.** They survive restarts in `envsel-state.json` but are not replayed from (or carried by) session logs.

## License

MIT

# @deepseek-ai/dsh-envsel

English | [中文](README.zh.md)

Session environment selector: per-language first-priority environments for the current session, drawn from conda, standalone R installations, WSL distributions, and user-pinned custom paths — a Jupyter-kernel-style picker that lives in the harness rather than the notebook.

Each session has three independent language slots — `python`, `r`, `cli` — and every slot can hold one environment at a time, so a session can simultaneously use `scRNAv2` for Python, `R-4.5.1` (standalone) for R, and `base` for shell binaries. Selections are durable, replayable session events (`envsel/selection`, log-only — never in the model transcript); the model learns the current selection from the runtime-context snapshot, and every shell call receives `DSH_ENV_*` facts.

## How it reaches the user and the model

| Surface | Mechanism |
| --- | --- |
| Change from the browser | Header dropdown (`envsel` Remote, served by [`@deepseek-ai/dsh-client-ui-envsel`](../../client/ui-envsel/README.md)) and the `/env` command in the shipped `/` command palette (`/env python=scRNAv2 r=R-4.4.1 cli=base`, `/env list [关键词]`, `/env add <path>`, `/env unpin custom:<name>`, `/env clear`, `/env wsl`, `/env help`) |
| Change from the conversation | `session_env` model tool (`action=list|get|set` with `slot`/`kind`/`name`) |
| Model guidance | runtime-context snapshot block per set slot: the exact interpreter invocation (`C:\…\python.exe`, standalone `Rscript`, or `wsl.exe -d <distro> -- …`) with WSL `/mnt/c` path notes |
| Shell facts | `DSH_ENV_PYTHON` / `DSH_ENV_RSCRIPT` / `DSH_ENV_CLI_PREFIX` collected into every shell-tool call by [`@deepseek-ai/dsh-shell-env`](../shell-env/README.md) |

## Browser Remote

The package provides an `envsel` Typert Remote (`list` / `get` / `set`) generated from [`EnvselRemoteService`](src/remote.ts). The gateway is created inside the plugin body, so it shares the plugin's catalog cache and per-session selection state with the command, tool, and context paths — a change made in the header dropdown and a change made via `/env` are the same durable `envsel/selection` event. The api/remotes client assembly mounts the `./remote` namespace, and the header dropdown in `@deepseek-ai/dsh-client-ui-envsel` is its consumer.

## Discovery

- **conda**: `conda env list --json` (executable configured by `condaCommand`; a Windows `.bat`/`.cmd` wrapper is routed through `cmd.exe /c`). Entries probe `<prefix>\python.exe` and `<prefix>\Library\bin\Rscript.exe` (POSIX: `bin/python`, `bin/Rscript`).
- **standalone R**: Windows `C:\Program Files\R\R-*` and `C:\Program Files (x86)\R\R-*`; macOS `/Library/Frameworks/R.framework/Versions/*`, Homebrew `/opt/homebrew/opt/r` and `/usr/local/opt/r`; Linux `/opt/R/<version>` plus a `/usr` or `/usr/local` prefix that already contains `bin/Rscript`. Missing roots are skipped. PATH Rscript that is not inside a conda `envs` directory is also kept. `standaloneRRoots` adds extra scan roots.
- **WSL**: Windows only, and only when `wslEnabled` is true. A non-Windows host never spawns `wsl.exe` and never emits a WSL warning. On Windows, `wsl.exe --list --quiet` is decoded as UTF-16LE; each distribution is probed via `wsl.exe -d <distro> -- sh -lc …` for conda envs and system `/usr/bin/python3` / `/usr/bin/Rscript`. A cold-started distribution can take tens of seconds, so per-probe timeouts apply.
- **custom pins**: a user-supplied interpreter file or install directory (`/env add`, header "添加路径", or `session_env action=pin`) is probed for python/Rscript, stored as `kind: 'custom'` in `$DSH_HOME/envsel-pinned.json`, and merged into every later catalog. Unpinning removes the cache row; an already-chosen session snapshot is left intact.

## Config

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

## Model Experience

Direct model-visible effects, in assembly order:

1. **Runtime-context snapshot** — one `envsel:selection` context contribution (order 116). Empty when no slot is set; otherwise one block per set slot naming the selected environment, its interpreter invocation, and any WSL path notes. A selection change diff-triggers a new "Current runtime context" user-role snapshot on the next model step, so the model always sees the selection that applies to its current work.
2. **`session_env` tool** — registered when `registerTool` is true. `list` returns the full catalog (`entries` + `warnings`), `get` the current selection, `set` assigns/clears one slot. Calling `set` appends the durable `envsel/selection` event; the resulting context snapshot is visible from the next turn.
3. **`DSH_ENV_*` shell facts** — every shell-tool call collects `DSH_ENV_PYTHON` / `DSH_ENV_RSCRIPT` / `DSH_ENV_CLI_PREFIX` describing the set slots, so command execution and the model's shell reasoning agree on the selected interpreters.

#### KV Cache effect

The runtime-context snapshot is diff-triggered by `RuntimeContextProjection` (a new message is appended only when the joined snapshot text changes), so an unchanged selection does not churn request history. A selection change adds exactly one snapshot message.

## Known Limitations and Deferred Work

- **WSL discovery is Windows-only and can be slow.** The first Windows scan on a machine with stopped WSL service cold-starts distributions (tens of seconds); entries are cached under `listTtlMs`. macOS and Linux skip WSL entirely.
- **Slot compatibility is language-presence based.** A standalone R install cannot fill the `python` slot (it has no python), even though a conda R env with a python interpreter can fill either.
- **Pinned paths are machine-local.** `$DSH_HOME/envsel-pinned.json` is not part of the session log and does not travel with a session to another machine. Two pins that share a leaf directory name share the `custom:<name>` address; unpin one of them by the original path instead.
- **System python is not auto-enrolled.** `/usr/bin/python3`, Xcode stubs, and pyenv shims stay out of the catalog unless the user pins them.
- **`session_env` is registered in the global tools layer** (this host row), so every preset's agent sees it. Moving it behind an agent preset would require a preset-side tool row; deferred until preset tool ownership for host features is settled.

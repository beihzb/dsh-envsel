# dsh-envsel — Session Environment Selector

English | [中文](README.zh.md)

> **External name (repo / docs)**: dsh-envsel · **Package identifiers (code)**: `@deepseek-ai/dsh-envsel` / `@deepseek-ai/dsh-client-ui-envsel`

dsh-envsel is the session environment selector for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): like a Jupyter kernel picker, it assigns each session one first-priority environment per language (Python / R / CLI tools), chosen from conda environments, standalone R installs, WSL distributions, or user-pinned custom paths. The selection is persisted as a session event (`envsel/selection`); the browser header dropdown, the `/env` command, and the `session_env` model tool share the same selection store, and every shell call automatically receives `DSH_ENV_*` facts so the model and command execution use the same interpreters.

## Features

- **Per-session independent selection**: three slots `python` / `r` / `cli` each hold one environment, so one session can simultaneously use `scRNAv2` (Python), `R-4.5.1` (standalone R), and `base` (CLI).
- **Cross-platform automatic discovery**: conda (`conda env list --json`), standalone R (Windows Program Files / macOS Framework and Homebrew / Linux `/opt/R`, `/usr`, `/usr/local`), WSL (Windows only — non-Windows hosts never spawn `wsl.exe`).
- **Manual path pinning**: when discovery misses an install, pin an interpreter or install directory via the header "添加路径", `/env add <path>`, or `session_env action=pin`; the entry is written to the machine-local `$DSH_HOME/envsel-pinned.json` cache, visible to every later session, and removable with `/env unpin custom:<name>`.
- **Durable and replayable**: the selection is a log-only session event restored from its folded value after restart; it never enters the model transcript — the model learns the current selection from the runtime-context snapshot.
- **One store, many surfaces**: the header dropdown, `/env`, and `session_env` are three readers/writers of the same `envsel/selection` event, so the UI and the command line never diverge.

## Repository layout

```
packages/shell/envsel/        # Host-side plugin: discovery, pin cache, /env command, session_env tool, envsel Remote
packages/client/ui-envsel/    # Browser-side plugin: header dropdown UI (incl. the add-path form) and localized copy
patches/host-integration.patch # Host-side changes that weave the two packages into deepseek-harness (reference only — not a standalone plugin)
docs/agent-notes/             # Design decision records (English + Chinese)
LICENSE                       # MIT (inherited from deepseek-harness)
```

## Integrating into deepseek-harness

These two packages are **not standalone-installable plugins**: they weave into the [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) monorepo and depend on internal packages such as `@deepseek-ai/cordis`, `dsh-typert` (Remote code generation), `dsh-api-remotes` (client assembly), and `dsh-shell-env` (`DSH_ENV_*` injection). Integrating into the upstream repository requires:

1. Copy `packages/shell/envsel/` and `packages/client/ui-envsel/` into their corresponding locations;
2. Register the two plugin rows in `packages/bundle/web-app/cordis.patch.yml` and `package.json`;
3. Register the paths and Remote assembly in `tsconfig.base.json` / `tsconfig.client.json` / `tsconfig.host.json` and `packages/api/remotes`;
4. Register the `envsel/selection` event in `packages/core/session/src/known-event-types.ts`;
5. Run `pnpm install`, `tsc -b` and the tsdown build (host and client passes), then restart DSH.

`patches/host-integration.patch` is the complete diff of these existing-file changes against the current upstream HEAD (`47f9438`) and serves as an integration reference; the new packages themselves are provided here as full source.

## Usage

### Browser

The "环境" dropdown at the right of the session header: each slot lists the available environments for one-click assign/clear; the "添加路径" form at the top of the panel pins a local interpreter or install-directory path.

### Commands

```
/env python=scRNAv2 r=R-4.4.1 cli=base # set several slots at once
/env list [keyword]                    # list the catalog
/env add /opt/homebrew/bin/Rscript    # pin a path (macOS)
/env add /usr/bin/Rscript             # pin a system R (Linux)
/env unpin custom:<name>               # remove one pinned record
/env clear                             # clear all slots
```

### Model tool

`session_env`: `action=list` lists the catalog, `action=get` reads the current selection, `action=set` assigns/clears one slot, `action=pin|unpin` manages pinned paths.

### Shell facts

Every shell call automatically carries `DSH_ENV_PYTHON`, `DSH_ENV_RSCRIPT`, and `DSH_ENV_CLI_PREFIX` describing the interpreters selected for the current slots.

## Known limitations

- Discovery depends on concrete install layouts (conda metadata, R directory structure, WSL UTF-16 output) and may silently miss installs as distributions evolve; manual pinning is the fallback.
- Pinned paths are a machine-local cache (`$DSH_HOME/envsel-pinned.json`) that does not travel with a session to another machine; two pins sharing a leaf directory name share the `custom:<name>` address and must be unpinned by the original path.
- WSL discovery is Windows-only, and cold-starting a distribution can take seconds (cached under `listTtlMs`).
- System Python (`/usr/bin/python3`, Xcode stubs, pyenv shims) is not auto-enrolled unless manually pinned.

## License

MIT — see [LICENSE](LICENSE). Code originates from [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), copyright DeepSeek.
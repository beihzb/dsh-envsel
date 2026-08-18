# Agent Note: envsel — per-language session environment selection (conda / standalone R / WSL)

Status: implemented

English | [中文](2026-08-17-envsel-session-environment-selection.zh.md)

## Problem

A Jupyter notebook picks its kernel per notebook; DeepSeek Harness sessions had no equivalent. Users ran Python/R from whatever environment a command happened to resolve, or manually threaded `conda activate` prefixes through every shell command. The earlier dynamic Cordis plugin (`envsel-1`) proved the mechanism (runtime-context guidance + `DSH_*` injection) but was process-local: selection state vanished on restart and the plugin had to be redefined per session.

Two harder requirements arrived with productization: (1) *per-language* selection — one session can simultaneously use a conda env for Python, a standalone R install for R, and another env for shell binaries — and (2) *WSL* environments — conda envs living inside WSL distributions.

## Decision

A host-plane package `@deepseek-ai/dsh-envsel` (`packages/shell/envsel`) mounted as a web-app bundle row. It sits loose in the host composition with no realm concerns; since Phase 2 it also provides the `envsel` Typert Remote service backing the header dropdown (see [envsel header dropdown — Typert Remote gateway and client package](2026-08-17-envsel-header-dropdown-typert-remote.md)):

- **Slots.** Three language slots (`python`, `r`, `cli`), each holding one environment; all three can be set simultaneously. Slot compatibility is language-presence based: an entry fills `python` only when it has a python interpreter, `r` only when it has Rscript, `cli` always.
- **Discovery.** `conda env list --json` (Windows `.bat`/`.cmd` routed through `cmd.exe /c`); standalone R from platform defaults (Windows Program Files, macOS Framework/Homebrew, Linux `/opt/R` and `/usr`) plus PATH and configurable `standaloneRRoots`; WSL distributions via `wsl.exe --list --quiet` (Windows only; UTF-16LE) probed through `wsl.exe -d <distro> -- sh -lc …`. A later change adds machine-local custom pins (`$DSH_HOME/envsel-pinned.json`) for paths the scanner misses — see [envsel POSIX discovery and pinned paths](2026-08-17-envsel-posix-discovery-and-pinned-paths.md).
- **Durability.** Each selection change appends a log-only session event `envsel/selection` (last-write-wins, same fold pattern as `approval/policy`). The event is a required member of the generated `KNOWN_SESSION_EVENT_TYPES` vocabulary, so a cold load accepts it without `ignorable`. Consumers read the fold of `agent.session.events`, warmed into an in-memory map — restart-safe without any projection machinery.
- **Model surface.** One `systemPrompt.context` contribution (`envsel:selection`, order 116) renders per-slot guidance with copy-pasteable interpreter invocations; the runtime-context projection diff-triggers a new snapshot message on change, so "model-visible ⟺ logged" holds through the snapshot mechanism. Every shell call receives `DSH_ENV_PYTHON` / `DSH_ENV_RSCRIPT` / `DSH_ENV_CLI_PREFIX` via the `shellEnv` contributor.
- **Human surface (Phase 1).** `/env` command (already-mounted `commandsRemote` — no new Remote machinery): `/env python=scRNAv2 r=R-4.4.1 cli=base`, `/env list`, `/env add <path>`, `/env unpin custom:<name>`, `/env clear`, `/env wsl`, `/env help`. Plus the `session_env` model tool (registered in the global tools layer). The Phase 2 header dropdown is a third surface over the same selection store.

## Alternatives considered

- **Full product client package + typed Remote.** A header dropdown requires a `packages/client/*` package, a typert-generated Remote, and `api/remotes` assembly. It was deferred to Phase 2 for Phase 1's delivery and is now shipped (see [envsel header dropdown — Typert Remote gateway and client package](2026-08-17-envsel-header-dropdown-typert-remote.md)); the `/env` command reused the shipped command surface at zero new transport cost in the meantime.
- **User-level home patch only (`~/.dsh/cordis.patch.yml`).** It is watched and hot-mounts, but new-package resolution requires the healed `$DSH_HOME/profiles/node_modules` fallback, which only exists after a boot with the package declared in a bundle manifest — so a restart is required regardless. The row therefore lives in `packages/bundle/web-app/cordis.patch.yml` with the dependency declared in that bundle's `package.json` (versioned with the deployment, resolvable by the heal BFS from `apps/cli`).

## Consequences

- Selection survives DSH restarts (durable events) but is per-session and in-memory-warmed; there is no cross-session sharing.
- `session_env` is visible to every preset's agent (global tools layer); moving it behind an agent preset is deferred.
- WSL entries execute through `wsl.exe -d <distro> -- …`; Windows paths inside WSL are `/mnt/c/…` — the prompt guidance states this explicitly.
- The dynamic plugin `envsel-1` was stopped once the bundle row took over, so the old `DSH_CONDA_*`/`DSH_R_*` facts and the new `DSH_ENV_*` facts never coexist.

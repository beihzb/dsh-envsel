# Agent Note: envsel header dropdown — Typert Remote gateway and client package

Status: implemented

English | [中文](2026-08-17-envsel-header-dropdown-typert-remote.zh.md)

## Problem

Phase 1 ([envsel session environment selection](2026-08-17-envsel-session-environment-selection.md)) gave a host-plane package with the `/env` command and the `session_env` tool, but no persistent GUI: the earlier dynamic plugin's header button was process-local and vanished on restart, and the shipped row offered only chat-surface change paths. Users asked for the Jupyter-kernel-style picker back in the conversation header — per session, surviving restarts, with the same flexible switch-and-specify semantics.

## Decision

Two additions to the shipped composition, keeping ONE selection store and ONE durable event across every surface.

1. **Remote surface inside the existing host package.** `EnvselRemoteService extends TypertRemoteService` ([`src/remote.ts`](../../../../packages/shell/envsel/src/remote.ts)) carries `@Remote('list' | 'get' | 'set' | 'pin' | 'unpin')`. The instance is created inside the envsel plugin body and provided as the `envsel` service by the `Service` constructor (`super(ctx, 'envsel')`), so its handlers close over the plugin's catalog cache and per-session selection map — the header dropdown, `/env`, and `session_env` are three readers/writers of the same `envsel/selection` session event. `pin` / `unpin` write the machine-local path cache described in [envsel POSIX discovery and pinned paths](2026-08-17-envsel-posix-discovery-and-pinned-paths.md). The package.json declares `./typert` + `./remote` exports and files; the typert generator emits the artifacts during the host build, typert-loader registers the strict manifest (envsel is a loader entry), and the api gateway resolves the service from the live Context on every invocation.
2. **Client package `@deepseek-ai/dsh-client-ui-envsel`.** Registers one entry in `conversation.session.header.utilities` — the right-aligned, session-scoped band of the header, so each session's header shows and edits its own selection. The trigger always renders with a per-slot summary (`Python: scRNAv2 · R: R-4.5.1`) or "未选择"; the catalog is fetched only when the panel first opens, because probing conda and WSL takes seconds; each slot section lists the catalog entries that can serve it and offers one-click assign and clear; the footer pins a typed host path and custom rows can be unpinned; Escape or an outside pointer press closes the panel. Errors surface as localized business codes (session/entry/incompatible/invalid-path/not-found/no-interpreter).
3. **Assembly.** The api/remotes client face mounts `@deepseek-ai/dsh-envsel/remote` and re-exports the envsel types; the web-app patch adds the `ui-envsel` browser row next to the existing `envsel` host row; the bundle's package.json declares the dependency; the client aggregate and `tsconfig.base.json` paths gain the package and the `@deepseek-ai/dsh-envsel/types` subpath.

A runtime-provided `TypertRemoteService` (rather than a loader-mounted default-export class) works because the `Service` constructor calls `ctx.reflect.provide`, which populates `ctx.reflect.props` — the api gateway's SRC discovery iterates that map — while the strict wire descriptors come from the package's generated `./typert` manifest through typert-loader. This keeps one owner (the envsel plugin) with no duplicated catalog or selection state.

## Alternatives considered

- **Loader-mounted gateway class (the plugin-inventory / message-feedback pattern).** A separate package default-exporting the service class would force the business logic either to cross a package boundary through a new service seam or to duplicate the catalog cache and selection map. The runtime-provided instance keeps every path on one closure-owned store; the api gateway supports it through `ctx.reflect.props`.
- **A dedicated `envsel-remote` package consuming an `envsel` service.** A cleaner seam in the abstract, but it adds a package, a service contract, and cross-package inject for a single consumer; deferred unless a second consumer of the selection store appears.
- **Reuse only the `/` command palette.** No new transport cost, but no persistent header affordance — exactly the complaint that drove this phase.

## Consequences

- The header dropdown, `/env`, and `session_env` are three surfaces over one selection store and one durable event; a change from any of them is visible to the others and to the model (runtime-context snapshot diff, `DSH_ENV_*` shell facts) on the next step.
- envsel is no longer a pure contributor: it provides a service (`envsel`) and gains `./typert` / `./remote` publication artifacts, so the web-app patch comment and the Phase 1 note's "publishes no service" statement are updated to match.
- The client bundle is a browser artifact (`lib/client.js` served at `/plugins/<id>/client.js`); seeing the button requires a rebuilt web dist and a page refresh, and the host-side changes require one DSH restart.
- `conversation.session.header.utilities` gains its first occupant; `ui-jobs` and `ui-subagent` continue to occupy `conversation.session.header.actions`, so the two bands stay separate by design.

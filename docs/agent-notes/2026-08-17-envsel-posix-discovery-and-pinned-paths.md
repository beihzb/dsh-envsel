# Agent Note: envsel POSIX discovery and machine-local pinned paths

Status: implemented

English | [中文](2026-08-17-envsel-posix-discovery-and-pinned-paths.zh.md)

## Problem

envsel discovery was written against a Windows host. Standalone R only scanned `C:\Program Files\R`, `prefixFromRscript` joined with `\\` and dropped a POSIX leading `/`, and `wslEnabled` defaulted to true so a macOS or Linux catalog refresh spawned `wsl.exe` and surfaced a "WSL unavailable" warning. Users on those hosts could use conda, but a CRAN / Homebrew / apt R install did not appear, and there was no way to remember a path the scanner missed.

## Decision

Keep one catalog and one `envsel/selection` store. Discovery becomes platform-aware, and a missed install can be pinned once for every later session on that machine. See [envsel session environment selection](2026-08-17-envsel-session-environment-selection.md) and [envsel header dropdown](2026-08-17-envsel-header-dropdown-typert-remote.md) for the store and Remote this change extends.

1. **POSIX standalone R.** `defaultStandaloneRRoots()` supplies Windows Program Files, macOS Framework + Homebrew prefixes, and Linux `/opt/R` plus `/usr` / `/usr/local`. `scanRRoot` joins with the host separator, accepts `R-4.x` and `4.4-arm64` children, and treats a root that already contains `bin/Rscript` as a single install. `prefixFromRscript` preserves `/` and a leading slash. The macOS Framework `Current` symlink is skipped so it does not duplicate a version directory.
2. **WSL is Windows-only.** `discoverAll` / `wslDistros` return immediately on a non-Windows host and emit no warning. `/env wsl` on macOS or Linux reports the skip and points at `/env add`.
3. **CLI snapshot.** `selectionContext` uses `cliPathGuidance`: PowerShell PATH on Windows, `export PATH="<prefix>/bin:<prefix>:$PATH"` on POSIX, unchanged `wsl.exe` line for WSL entries.
4. **Pinned custom paths.** `probeCustomPath` accepts an interpreter file (`python` / `python3` / `Rscript` and `.exe` forms) or an install directory. A successful probe becomes `kind: 'custom'` and is appended to `$DSH_HOME/envsel-pinned.json`. Every catalog merge re-probes those paths; a vanished path stays on disk as a warning until unpinned. Surfaces: header "添加路径" + per-custom unpin, `/env add` / `/env unpin`, `session_env action=pin|unpin`, and Remote `pin` / `unpin`.

## Alternatives considered

- **A `settings.yaml` `envsel` section.** Matches the shell timeout pattern but would make `settings` a hard inject for a package that otherwise only needs `fs`. A dedicated JSON file under `$DSH_HOME` stays optional-service-free and is one document with one owner.
- **Auto-enrolling `/usr/bin/python3` and pyenv shims.** Too noisy on developer laptops (Xcode stub, multiple pyenv versions). The user types the path they actually want.
- **Default `wslEnabled: false`.** Would silence POSIX warnings without a platform check, but would also hide WSL on Windows until the deployment flipped the flag. The platform gate keeps the Windows default.

## Consequences

- macOS and Linux catalogs list conda plus Framework / Homebrew / `/usr` / `/opt/R` installs without configuration; a leftover layout still has the pin footer.
- `$DSH_HOME/envsel-pinned.json` is machine-local and is not a session event. A session that already selected a custom entry keeps that snapshot after unpin.
- The Remote wire grows `pin` / `unpin`; the header and `api/remotes` client assembly must rebuild, and a running DSH needs one restart plus a page refresh.
- `EnvKind` now includes `custom`. Older selection events never carried that kind; unknown kinds remain display-only snapshots.

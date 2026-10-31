# dsh-envsel v0.3.1

One addition to the per-turn runtime context: when the selected **Python**
environment also ships R, say so.

## Why

conda environments routinely carry R beside Python — a `scRNAv2` env installed
with `r-base` has `<env>/Scripts/Rscript.exe` right next to `<env>/python.exe`.
envsel already detected that (`rscript` is part of every conda catalog entry, and
such an env is eligible for the R slot), but the runtime block only ever
described the R **slot**. So with `python = scRNAv2` and `r = R-4.5.1`, the model
saw one R installation and had no idea the environment it was told to use for
Python also contained a second, differently-provisioned one.

## What changed

The Python block now ends with:

```
- This environment also provides R: C:\Users\<you>\.conda\envs\scRNAv2\Scripts\Rscript.exe
```

Rules:

- emitted only when the selected Python entry actually carries an `rscript`;
- emitted with the same `rscriptCommand`/`rscript` preference the R slot uses
  (so a WSL entry shows its `wsl.exe -d … -- …` invocation);
- **suppressed** when the R slot points at the same install prefix — no
  duplicated line when one environment fills both slots;
- still emitted when the R slot is a different install, which is exactly the
  case worth warning about.

Nothing else changes: same selection resolution, same inheritance across
delegated subagents, same shell facts, same header dropdown. This is a rendering
change only — no new DSH API, so the compatibility matrix is untouched (still
needs DSH 0.2.0-rc.1+ for the block itself, still loads on 0.1.7-rc.1+).

## Verification

- `pnpm run typecheck` clean.
- **40/40** unit tests (4 new): the R line appears for a conda env with an
  `rscript`, is absent when it has none, is suppressed when both slots share one
  install, and reappears when they differ.

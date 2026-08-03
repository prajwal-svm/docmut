# Determinism

Reproducibility contract for cross-machine and cross-paper reuse.

---

## Default salt

```text
DEFAULT_SALT = 20260802
```

Experiments may override salt. Whatever salt is used **must** be recorded on every instance (`replication.salt` / `prngSeed`).

---

## PRNG key

```text
prngKey = "{salt}:{seedHash}:{operatorCode}:{variantIndex}"
```

- `seedHash` = SHA-256 hex of the **golden** source (UTF-8, as parsed after newline normalization).  
- `operatorCode` = e.g. `TEX-BRC-DRP`.  
- `variantIndex` = non-negative integer (0-based).  

The PRNG is mulberry32 seeded from `seedFromString(prngKey)`.

---

## Mutation identity

```text
mutationId = derived from content hashes and operator metadata (see mutationId() in prng.ts)
brokenSha  = sha256(broken)
goldenSha  = sha256(golden)
```

Two runs with identical:

- source bytes (after DocMut newline normalization),
- salt,
- operator selection,
- variants,
- gate flags,

must produce the **same ordered** list of kept `brokenSha` values for ungated runs, and the same kept set for gated runs given identical engines.

---

## Platform notes

| Factor | Effect |
|---|---|
| Engine binary version | May change gate pass/fail |
| Fonts / packages available | May change compile success |
| `pdftotext` version | May change equivalence decisions |
| OS path separators in logs | Must not affect source hashes |

**Recommendation:** pin tool versions in CI and paper manifests; treat engine-gated corpora as **toolchain-relative**.

---

## Verification commands

```bash
pnpm test                 # includes determinism suite
pnpm typecheck
pnpm build
pnpm cli --list-operators

# Two runs must match without gates:
pnpm cli --seed fixtures/sample.tex --operators TEX-BRC-DRP,TEX-CLS-DRP --variants 3 --out /tmp/a.json
pnpm cli --seed fixtures/sample.tex --operators TEX-BRC-DRP,TEX-CLS-DRP --variants 3 --out /tmp/b.json
# Compare mutation brokenSha lists
```

```bash
# Adequacy report (optional engines):
pnpm adequacy --seed fixtures/sample.tex --out evidence/adequacy-sample.json
```

---

## What is intentionally non-deterministic

- Wall-clock compile times  
- Absolute temp directory paths in logs  
- Engine log timestamps  

Scientific fields on `MutationResult` (broken source, hashes, sites, operator codes) are deterministic under the contract above.

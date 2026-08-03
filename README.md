# DocMut

**Deterministic multi-format document mutation for LaTeX, Typst, and Markdown.**

DocMut is a deterministic, multi-format document mutation library for constructing engine-validated synthetic faults in LaTeX, Typst, and Markdown. Unlike code-oriented mutators ([PIT](https://pitest.org/), [Stryker](https://stryker-mutator.io/), [universalmutator](https://github.com/agroce/universalmutator)), it targets scholarly document structure, separates hard compile failures from soft diagnostic faults, retains mutants only under a pinned compilation gate, and optionally drops render-text-equivalent mutants via PDF text comparison. It uses a surface structural parse adequate for site selection, not a full TeX expansion engine, and does not claim natural error prevalence or complete semantic equivalence detection.

| | |
|---|---|
| Operators | **48** (25 LaTeX · 15 Typst · 8 Markdown) |
| Tiers | Structural · Semantic · Realistic author-error patterns |
| Tracks | **hard** (compile-fail) · **soft** (warning / semantic) |
| Determinism | mulberry32 PRNG, default salt `20260802` |
| Gates | Pinned engine gate · optional PDF-text render-diff |
| License | MIT |

**Documentation (normative):**

| Doc | Purpose |
|---|---|
| [docs/SCOPE-AND-NONGOALS.md](docs/SCOPE-AND-NONGOALS.md) | Claims and non-claims |
| [docs/RELATED-WORK.md](docs/RELATED-WORK.md) | Distinction from PIT/Stryker/universalmutator and document benchmarks |
| [docs/ORACLE-AND-GATES.md](docs/ORACLE-AND-GATES.md) | Hard/soft engine gates and render-diff |
| [docs/DETERMINISM.md](docs/DETERMINISM.md) | Salt, PRNG keys, reproducibility |
| [docs/OPERATOR-CATALOG.md](docs/OPERATOR-CATALOG.md) | All 48 codes with tracks and rationales |
| [docs/ADEQUACY.md](docs/ADEQUACY.md) | How to measure fitness on a seed set |
| [docs/UNSUPPORTED.md](docs/UNSUPPORTED.md) | Multi-file, expansion, and language limits |
| [docs/THREATS.md](docs/THREATS.md) | Validity threats for corpus construction |

Design history: [PLANNING.md](./PLANNING.md). Citation: [CITATION.cff](./CITATION.cff).

---

## Install

```bash
pnpm add github:prajwal-svm/docmut
# or
git clone https://github.com/prajwal-svm/docmut.git
cd docmut && pnpm install && pnpm build && pnpm test
```

Requires **Node.js ≥ 18**.

Optional for gated corpus generation:

- [Tectonic](https://tectonic-typesetting.github.io/) (LaTeX)
- [Typst](https://typst.app/)
- `pdftotext` (Poppler)

Pin versions in any paper or benchmark release (recommended: Tectonic 0.17.0, record Typst and Poppler versions).

---

## Quick start

```ts
import { readFileSync } from "node:fs";
import {
  mutateDocument,
  DEFAULT_SALT,
  ALL_OPERATORS,
  buildOperatorManifest,
} from "docmut";

console.log(ALL_OPERATORS.length); // 48
console.log(buildOperatorManifest().contentSha256);

const source = readFileSync("paper.tex", "utf8");
const { mutations, stats, equivalents } = mutateDocument(source, {
  salt: DEFAULT_SALT,
  operators: "tier1", // or "all" | "hard" | "soft" | "latex" | "TEX-BRC-DRP,TEX-MTH-REL"
  variants: 5,
  path: "paper.tex",
  engineGate: true, // track-aware: hard → fail compile; soft → warning/diff
  renderDiff: true, // drop PDF-text-equivalent mutants
});

for (const m of mutations) {
  console.log(m.id, m.operator, m.track, m.mutationSite, m.brokenSha);
}
```

---

## CLI

```bash
pnpm cli --list-operators

pnpm cli --seed fixtures/sample.tex --operators tier1 --variants 3 --out mutations.json

pnpm cli --seed paper.tex --operators all --engine-gate --render-diff \
  --write-broken ./broken/ --out gated.json

# Batch catalog (benchmark dataset layout)
pnpm cli --catalog path/to/catalog.json --operators all --variants 2 \
  --limit 100 --out mutations.json

# Adequacy / provenance
pnpm adequacy --manifest-only --out evidence/operator-manifest.json
pnpm adequacy --seed fixtures/sample.tex --variants 2 --engine-gate \
  --out evidence/adequacy-sample-tex.json
```

| Flag | Description |
|------|-------------|
| `--seed <file>` | Seed document (`.tex` / `.typ` / `.md`) |
| `--catalog <json>` | Batch mode over a catalog |
| `--operators <spec>` | `all` · `tier1\|2\|3` · `latex\|typst\|markdown` · `hard\|soft` · codes |
| `--variants <n>` | Variants per operator (default 5) |
| `--salt <v>` | Global salt (default `20260802`) |
| `--engine-gate` | Keep only track-valid faults under pinned engines |
| `--render-diff` | Exclude PDF-text-equivalent mutants |
| `--write-broken <dir>` | Write broken files + `instances.json` |
| `--out <path>` | Write full JSON results |

---

## Operator catalog (summary)

Full table: [docs/OPERATOR-CATALOG.md](docs/OPERATOR-CATALOG.md).

### LaTeX (25)

**Tier 1 Structural (hard):** `TEX-BRC-DRP` `TEX-BRC-STR` `TEX-ENV-REN` `TEX-ENV-UNC` `TEX-MTH-DLR` `TEX-MTH-DSP` `TEX-CLS-DRP` `TEX-ITM-MSN` `TEX-PKG-DRP`

**Tier 2 Semantic:** hard `TEX-CMD-TRP` `TEX-ARG-DRP` · soft `TEX-MTH-REL` `TEX-MTH-OPS` `TEX-ENV-SWP` `TEX-LBL-DUP` `TEX-REF-UDF` `TEX-LVL-SFT` `TEX-UNT-CHG` `TEX-FNT-SWP`

**Tier 3 Realistic patterns:** hard `TEX-FNT-SPEC` `TEX-SHL-ESC` `TEX-GLS-UDF` `TEX-CSV-FMT` · soft `TEX-PKG-ORD` `TEX-HYP-DRV`

### Typst (15) / Markdown (8)

`pnpm cli --list-operators` or the catalog doc.

---

## Design principles

1. **Surface structural sites** — mutate document structure at known spans (not random characters; not full TeX expansion).
2. **Tiered operators** — structural / semantic / realistic author-error patterns.
3. **Hard + soft tracks** — compile-fail vs warning/semantic (benchmark-compatible; do not pool without a study design).
4. **Deterministic & seeded** — `hash(salt + seedHash + operatorCode + variantIndex)`.
5. **Engine gate** — hard: golden compiles ∧ broken fails; soft: compile + diagnostic/semantic criteria.
6. **Render-text equivalence filter** — optional PDF text compare under a pin (partial equivalent-mutant filter, not visual/semantic identity).
7. **Plugin registry** — cosmic-ray-style operator plugins with citable codes.

---

## Output record

```json
{
  "id": "docmut-…",
  "operator": "TEX-MTH-REL",
  "operatorName": "MathRelationSwap",
  "tier": 2,
  "track": "soft",
  "format": "latex",
  "scope": "math",
  "seedDocument": "article.tex",
  "seedHash": "…",
  "mutationSite": { "line": 27, "column": 14, "nodeType": "math_inline" },
  "original": "\\leq",
  "mutated": "\\geq",
  "variantIndex": 2,
  "prngSeed": "20260802:…:TEX-MTH-REL:2",
  "broken": "…",
  "golden": "…",
  "brokenSha": "…",
  "goldenSha": "…",
  "equivalentDetected": false,
  "engineGatePassed": true
}
```

`--write-broken` also emits benchmark-compatible `instances.json` (golden/broken pairs).

---

## Adding an operator

```ts
import type { MutationOperator } from "docmut";
import { defaultRegistry } from "docmut";

const myOp: MutationOperator = {
  name: "MyOperator",
  code: "TEX-MY-OP",
  tier: 2,
  track: "hard",
  formats: ["latex"],
  scope: "structure",
  rationale: "…",
  findMutationSites(ast) {
    return [];
  },
  apply(ast, site, variantIndex, rng) {
    return null;
  },
};

defaultRegistry.register(myOp);
```

Bump the package version when operator semantics change. Regenerate the catalog and record `buildOperatorManifest().contentSha256` in any paper freeze.

---

## Verify

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm cli --list-operators
pnpm adequacy --manifest-only --out evidence/operator-manifest.json
```

---

## Relationship to repair benchmarks

DocMut **constructs** synthetic faults. It does not score repair systems.

Typical pipeline:

1. Seeds → DocMut (salt, operators, engine gate) → instance ledger  
2. Systems propose repaired full sources  
3. Benchmark harness scores under pinned engines (compile, exactness, edit distance, …)

Hard and soft instances must not be pooled without an explicit study design. Engine success alone is not content restoration.

---

## Citation

See [`CITATION.cff`](./CITATION.cff).

```
Venkateshmurthy, P. S. (2026). DocMut: Deterministic multi-format document
mutation for LaTeX, Typst, and Markdown (Version 0.2.0) [Computer software].
https://github.com/prajwal-svm/docmut
```

---

## License

MIT — see [`LICENSE`](./LICENSE).

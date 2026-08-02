# DocMut

**AST-based document mutation testing for LaTeX, Typst, and Markdown.**

DocMut is to documents what [PIT](https://pitest.org/) is to Java and [Stryker](https://stryker-mutator.io/) is to JavaScript. It applies realistic, context-aware mutations (fault injections) to working documents, producing broken documents for compilation-repair benchmarks such as TeXFix-Bench.

| | |
|---|---|
| Operators | **48** (25 LaTeX · 15 Typst · 8 Markdown) |
| Tiers | Structural · Semantic · Realistic author errors |
| Tracks | **hard** (compile-fail) · **soft** (warning / semantic) |
| Determinism | mulberry32 PRNG, salt `20260802` |
| Killer feature | **Render-diff** equivalent detection via PDF text |
| License | MIT |

## Install

```bash
# From GitHub (recommended until npm publish)
pnpm add github:prajwal-svm/docmut
# or clone
git clone https://github.com/prajwal-svm/docmut.git
cd docmut && pnpm install && pnpm build && pnpm test
```

Requires Node.js ≥ 18. Optional for gated dataset generation: [`tectonic`](https://tectonic-typesetting.github.io/), [`typst`](https://typst.app/), and `pdftotext` (poppler).

## Quick start (library)

```ts
import { readFileSync } from "node:fs";
import { mutateDocument, DEFAULT_SALT, ALL_OPERATORS } from "docmut";

console.log(ALL_OPERATORS.length); // 48

const source = readFileSync("paper.tex", "utf8");
const { mutations, stats, equivalents } = mutateDocument(source, {
  salt: DEFAULT_SALT,       // 20260802
  operators: "tier1",       // or "all" | "TEX-BRC-DRP,TEX-MTH-REL" | "latex" | "hard" via codes
  variants: 5,
  path: "paper.tex",
  engineGate: true,         // track-aware: hard → fail compile; soft → warning/diff
  renderDiff: true,         // drop PDF-text-equivalent mutants
});

for (const m of mutations) {
  console.log(m.id, m.operator, m.track, m.mutationSite);
  // m.broken  — full mutated source
  // m.golden  — original source
}
```

## CLI

```bash
pnpm cli --list-operators

pnpm cli --seed fixtures/sample.tex --operators tier1 --variants 3 --out mutations.json

pnpm cli --seed paper.tex --operators all --engine-gate --render-diff \
  --write-broken ./broken/ --out gated.json

# Batch catalog (TeXFix-Bench dataset layout)
pnpm cli --catalog path/to/catalog.json --operators all --variants 2 \
  --limit 100 --out mutations.json
```

### CLI flags

| Flag | Description |
|------|-------------|
| `--seed <file>` | Seed document (`.tex` / `.typ` / `.md`) |
| `--catalog <json>` | Batch mode over a catalog |
| `--operators <spec>` | `all` · `tier1\|2\|3` · `latex\|typst\|markdown` · codes |
| `--variants <n>` | Variants per operator (default 5) |
| `--salt <v>` | Global salt (default `20260802`) |
| `--engine-gate` | Keep only track-valid faults |
| `--render-diff` | Exclude PDF-text-equivalent mutants |
| `--write-broken <dir>` | Write standalone broken files + `instances.json` |
| `--out <path>` | Write full JSON results |

## Operator catalog

Full definitions: [`PLANNING.md`](./PLANNING.md).

### LaTeX (25)

**Tier 1 Structural (hard):** `TEX-BRC-DRP` `TEX-BRC-STR` `TEX-ENV-REN` `TEX-ENV-UNC` `TEX-MTH-DLR` `TEX-MTH-DSP` `TEX-CLS-DRP` `TEX-ITM-MSN` `TEX-PKG-DRP`

**Tier 2 Semantic:** hard `TEX-CMD-TRP` `TEX-ARG-DRP` · soft `TEX-MTH-REL` `TEX-MTH-OPS` `TEX-ENV-SWP` `TEX-LBL-DUP` `TEX-REF-UDF` `TEX-LVL-SFT` `TEX-UNT-CHG` `TEX-FNT-SWP`

**Tier 3 Realistic:** hard `TEX-FNT-SPEC` `TEX-SHL-ESC` `TEX-GLS-UDF` `TEX-CSV-FMT` · soft `TEX-PKG-ORD` `TEX-HYP-DRV`

### Typst (15) / Markdown (8)

See `pnpm cli --list-operators` or PLANNING.md.

## Design principles

1. **AST-based** — parse structure, mutate nodes (not random characters)
2. **Tiered operators** — structural / semantic / realistic author errors
3. **Hard + soft tracks** — compile-fail vs warning/semantic (TeXFix-Bench compatible)
4. **Deterministic & seeded** — `hash(salt + seedHash + operatorCode + variantIndex)`
5. **Render-diff equivalent detection** — compile both sides, compare `pdftotext`
6. **Plugin registry** — cosmic-ray style operator plugins

## Output format

```json
{
  "id": "docmut-a3f2e1b8c4",
  "operator": "TEX-MTH-REL",
  "operatorName": "MathRelationSwap",
  "tier": 2,
  "track": "soft",
  "format": "latex",
  "scope": "math",
  "seedDocument": "article.tex",
  "seedHash": "sha256:...",
  "mutationSite": { "line": 27, "column": 14, "nodeType": "math_inline" },
  "original": "\\leq",
  "mutated": "\\geq",
  "variantIndex": 2,
  "prngSeed": "20260802:55cf...:TEX-MTH-REL:2",
  "broken": "...",
  "golden": "...",
  "equivalentDetected": false,
  "engineGatePassed": true
}
```

`--write-broken` also emits TeXFix-Bench-compatible `instances.json`.

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
  findMutationSites(ast) { return []; },
  apply(ast, site, variantIndex, rng) { return null; },
};

defaultRegistry.register(myOp);
```

## Citation

See [`CITATION.cff`](./CITATION.cff). Design rationale: [`PLANNING.md`](./PLANNING.md).

## License

MIT — see [`LICENSE`](./LICENSE).

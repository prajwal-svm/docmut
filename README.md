# DocMut

**AST-based document mutation testing library for LaTeX, Typst, and Markdown.**

DocMut applies realistic, context-aware mutations to working documents, producing broken documents for compilation repair benchmarking. It is to documents what [PIT](https://pitest.org/) is to Java and [Stryker](https://stryker-mutator.io/) is to JavaScript.

## Features

- **48 mutation operators** across 3 formats and 3 tiers
- **AST-based** — mutations target semantic document nodes, not random text
- **Deterministic** — seeded PRNG ensures reproducible mutations across machines
- **Render-diff equivalent detection** — compiles original + mutant, compares PDFs, and excludes equivalent mutations automatically (a feature no source-code mutation tool can offer)
- **Plugin architecture** — add custom operators without forking
- **Three formats** — LaTeX (25 operators), Typst (15 operators), Markdown (8 operators)

## Installation

```bash
npm install @oleafly/docmut
# or
pnpm add @oleafly/docmut
```

## Quick start

### CLI

```bash
# Mutate a single document with all operators, 5 variants each
npx docmut --seed paper.tex --operators all --variants 5

# Mutate with specific operators only
npx docmut --seed paper.tex --operators TEX-BRC-DRP,TEX-MTH-REL --variants 3

# Set the global salt for deterministic reproduction
npx docmut --seed paper.tex --salt 20260802 --operators all --variants 5
```

### Programmatic API

```typescript
import { mutate, loadAllOperators } from '@oleafly/docmut';

const operators = loadAllOperators(); // 48 operators

const results = mutate({
  source: 'path/to/document.tex',
  format: 'latex',
  operators,
  variants: 5,
  salt: 20260802,
});

for (const result of results) {
  console.log(result.operatorCode);    // "TEX-BRC-DRP"
  console.log(result.tier);            // 1
  console.log(result.brokenSource);    // The mutated document text
  console.log(result.equivalentDetected); // false (PDF changed)
}
```

## Operator catalog

### LaTeX (25 operators)

#### Tier 1: Structural (9)

| Code | Name | Description |
| --- | --- | --- |
| `TEX-BRC-DRP` | BraceDrop | Remove a closing `}` at a nested scope boundary |
| `TEX-BRC-STR` | BraceStray | Insert an extra `{` at a scope boundary |
| `TEX-ENV-REN` | EnvRename | Misspell `\end{...}` environment name |
| `TEX-ENV-UNC` | EnvUnclosed | Remove `\end{...}` line entirely |
| `TEX-MTH-DLR` | MathDollar | Remove a closing `$` after inline math |
| `TEX-MTH-DSP` | MathDisplay | Remove a closing `\]` after display math |
| `TEX-CLS-DRP` | DocumentClassDrop | Remove `\documentclass{...}` |
| `TEX-ITM-MSN` | ItemMisplaced | Move `\item` outside its list environment |
| `TEX-PKG-DRP` | PackageDrop | Remove a `\usepackage{...}` that is actually used |

#### Tier 2: Semantic (10)

| Code | Name | Description |
| --- | --- | --- |
| `TEX-MTH-REL` | MathRelationSwap | Swap `\leq` ↔ `\geq`, `<` ↔ `>` |
| `TEX-MTH-OPS` | MathOperatorSwap | Swap `\cup` ↔ `\cap`, `\sin` ↔ `\cos` |
| `TEX-CMD-TRP` | CommandTypo | Common misspellings of control sequences |
| `TEX-ENV-SWP` | EnvironmentSwap | Swap `itemize` ↔ `enumerate` |
| `TEX-LBL-DUP` | LabelDuplicate | Duplicate a `\label{...}` key |
| `TEX-REF-UDF` | ReferenceUndefined | Replace `\ref{...}` with non-existent key |
| `TEX-LVL-SFT` | LevelShift | `\section` → `\subsection` |
| `TEX-UNT-CHG` | UnitChange | `12pt` → `11pt` or `13pt` |
| `TEX-FNT-SWP` | FontSwap | `\textbf` ↔ `\textit` |
| `TEX-ARG-DRP` | ArgumentDrop | Remove a required argument from a command |

#### Tier 3: Realistic Author Errors (6)

| Code | Name | Description |
| --- | --- | --- |
| `TEX-PKG-ORD` | PackageOrder | Move `hyperref` before other packages |
| `TEX-FNT-SPEC` | FontSpecRemove | Remove `fontspec` import (breaks on pdfLaTeX) |
| `TEX-SHL-ESC` | ShellEscapeReq | Introduce `minted` without `-shell-escape` |
| `TEX-HYP-DRV` | HyperrefDriverConflict | Trigger hyperref driver auto-detection failure |
| `TEX-GLS-UDF` | GlossaryUndefined | Reference undefined glossary key |
| `TEX-CSV-FMT` | CsvFormatException | Break CSV/table data format |

### Typst (15 operators)

| Tier | Count | Examples |
| --- | --- | --- |
| Structural | 6 | `TYP-FNC-UNC`, `TYP-IMP-DRP`, `TYP-MTH-UNC`, `TYP-CTB-UNC`, `TYP-STR-UNC`, `TYP-LST-MLF` |
| Semantic | 6 | `TYP-VAR-UDF`, `TYP-TPE-WRG`, `TYP-SET-INV`, `TYP-DCT-DRP`, `TYP-HDG-ORP`, `TYP-REF-UDF` |
| Realistic | 3 | `TYP-PKG-DRP`, `TYP-FNT-CHG`, `TYP-PGE-SZE` |

### Markdown (8 operators)

| Tier | Count | Examples |
| --- | --- | --- |
| Structural | 4 | `MD-LNK-BRK`, `MD-CDE-UNC`, `MD-MTH-UNC`, `MD-YML-BRK` |
| Semantic | 2 | `MD-HDR-MLF`, `MD-TBL-MLF` |
| Realistic | 2 | `MD-IMG-BRK`, `MD-HTML-UNC` |

## Design principles

DocMut follows established mutation testing principles adapted for documents:

1. **AST-based, not text-based** — mutations land on semantically meaningful nodes
2. **Deterministic** — `mulberry32` PRNG seeded by `hash(salt + documentHash + operatorCode + variantIndex)`
3. **Render-diff equivalent detection** — compiles original and mutant to PDF; if output is identical, the mutation is equivalent and excluded
4. **Tiered operators** — structural (basic syntax), semantic (domain-aware swaps), realistic (common author errors)
5. **Plugin architecture** — implement the `MutationOperator` interface to add custom operators

## Render-diff: the killer feature

No source-code mutation tool can detect equivalent mutants automatically. DocMut can:

1. Compile the original document to PDF
2. Apply the mutation
3. Compile the mutant to PDF
4. Extract text from both PDFs via `pdftotext`
5. If text is identical → mutation is equivalent → exclude from dataset

This produces a cleaner mutation dataset than any source-code mutation benchmark.

## Adding custom operators

```typescript
import { MutationOperator, MutationSite, DocumentAST } from '@oleafly/docmut';

const myOperator: MutationOperator = {
  code: 'TEX-MY-OP',
  name: 'MyCustomOperator',
  tier: 2,
  format: 'latex',
  scope: 'structure',

  findSites(ast: DocumentAST): MutationSite[] {
    // Find valid mutation locations in the AST
    return ast.findNodes(node => node.type === 'environment');
  },

  apply(site: MutationSite, variant: number): string {
    // Return the mutated text for this site and variant
    return site.originalText.replace('\\begin', '\\egin');
  },
};
```

## Testing

```bash
# Run all 55 tests
pnpm test

# Run specific test suite
pnpm vitest run tests/determinism.test.ts
```

## Requirements

- Node.js 18+
- Tectonic 0.17.0 (for render-diff equivalent detection)
- Poppler `pdftotext` (for PDF text extraction)
- Typst CLI (for Typst render-diff)

## Used in

- **TeXFix-Bench v0.4** — multi-format document compilation repair benchmark (10,437 instances)
- **Engine-Transfer-Bench** — multi-engine document compilation comparison

## Citation

If you use DocMut in your research, please cite:

```bibtex
@software{docmut,
  author = {Prajwal S. Venkateshmurthy},
  title = {DocMut: AST-Based Document Mutation Testing Library},
  year = {2026},
  url = {https://github.com/Oleafly/docmut},
  license = {MIT}
}
```

## License

MIT © [Prajwal S. Venkateshmurthy](https://github.com/prajwal-svm) / [Oleafly](https://github.com/Oleafly)

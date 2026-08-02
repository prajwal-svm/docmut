# DocMut: A Realistic Document Mutation Testing Library

**Working name:** DocMut (Document Mutation)
**Status:** Design phase
**Location:** `texfix-bench/mutation-library/`
**License:** MIT (code) + CC0-1.0 (operator documentation)
**Artifact type:** Contributed artifact alongside TeXFix-Bench v0.4

---

## What This Is

DocMut is a deterministic, AST-based mutation testing library for structured documents (LaTeX, Typst, Markdown). It applies realistic, context-aware mutations that model real authoring errors. It is to documents what PIT is to Java and Stryker is to JavaScript.

**This is a standalone contribution.** Other researchers can use DocMut independently of TeXFix-Bench to generate broken documents for their own experiments. The mutation library is citable on its own.

---

## Design Principles (informed by mutation testing literature)

These principles are synthesized from PIT (Java), Stryker (JS/TS), Mull (C/C++), MutPy (Python), cosmic-ray (Python), and the Jia & Harman (2011) survey.

### Principle 1: AST-Based, Not Text-Based

Mutate parsed document structure, not raw text. This ensures:
- Mutations land on semantically meaningful locations (inside a math expression, at an environment boundary, on a command name)
- No broken mutations (e.g., removing a brace inside a comment)
- Deterministic and reproducible

**Implementation:** Parse LaTeX via a lightweight parser (existing TeXFix-Bench uses regex-based parsing; v0.4 should upgrade to a tree-sitter or unified-language-server parser). Parse Typst via its native syntax tree. Parse Markdown via a unified/remark AST.

### Principle 2: Tiered Operators (not flat list)

Every mature mutation tool converges on tiers. DocMut follows:

| Tier | Purpose | Count target | Analogy in code mutation |
| --- | --- | --- | --- |
| **Tier 1: Structural** | Basic syntax mutations (braces, environments, delimiters) | 8-10 operators | PIT DEFAULTS (CONDITIONALS_BOUNDARY, MATH, NEGATE_CONDITIONALS) |
| **Tier 2: Semantic** | Domain-aware swaps (command swaps, math operator swaps, unit changes) | 10-15 operators | Stryker MethodExpression (`endsWith`↔`startsWith`) |
| **Tier 3: Realistic Author Errors** | Errors mined from common mistakes (forgotten packages, wrong syntax patterns) | 8-12 operators | PIT type-aware returns (`String`→`""`) |

### Principle 3: Equivalent Mutant Detection via Render-Diff

Code mutation tools struggle with equivalent mutants (mutations that don't change behavior). **DocMut has a unique advantage:** it can render both the original and mutated document to PDF and compare. If the PDFs are byte-identical (after normalization), the mutation is equivalent and should be discarded.

**This is the killer feature.** No code mutation tool can do this. It makes DocMut's output cleaner than any source-code mutation tool.

### Principle 4: Deterministic and Seeded

Every mutation is fully reproducible:
- Global salt (e.g., `20260802`)
- PRNG seeded by `(salt, seed_document_hash, operator_name, variant_index)`
- Same inputs → same mutation, every time, on every machine
- Recorded in the instance metadata for replay

### Principle 5: Plugin Architecture (cosmic-ray pattern)

Operators are pluggable classes implementing two methods:
```typescript
interface MutationOperator {
  name: string;           // e.g., "MathRelationSwap"
  code: string;           // e.g., "MTH-REL-SWP"
  tier: 1 | 2 | 3;
  
  findMutationSites(ast: DocumentAST): MutationSite[];
  apply(site: MutationSite, variant: number): MutatedNode;
}
```

Users can add custom operators without forking. The provider registry pattern (from cosmic-ray) enables `docmut --operators latex-math,typst-structure` to select operator subsets.

### Principle 6: Named Operator Taxonomy (Stryker pattern)

Every mutation is tagged with:
- Operator name (human-readable)
- Operator code (machine-readable, citeable)
- Tier (1/2/3)
- Format (LaTeX/Typst/Markdown)
- Scope (math/structure/text/citation/preamble/package)
- Location (line, column, AST node ID)
- Variant index

This enables Stryker-style mutation reports and lets other researchers cite specific operators.

---

## Operator Catalog

### LaTeX Operators (25 total)

#### Tier 1: Structural (9 operators)

| Code | Name | What it does | Realistic model |
| --- | --- | --- | --- |
| `TEX-BRC-DRP` | BraceDrop | Remove a closing `}` at a nested scope boundary | Authors lose braces after `\frac{}{}` or nested environments |
| `TEX-BRC-STR` | BraceStray | Insert an extra `{` at a scope boundary | Stray opening brace from copy-paste |
| `TEX-ENV-REN` | EnvRename | Misspell `\end{...}` name (e.g., `itemize` → `itemise`) | Typos in environment names |
| `TEX-ENV-UNC` | EnvUnclosed | Remove `\end{...}` line entirely | Author forgets to close environment |
| `TEX-MTH-DLR` | MathDollar | Remove a closing `$` after inline math | Authors forget to close inline math |
| `TEX-MTH-DSP` | MathDisplay | Remove a closing `\]` after display math | Authors forget to close display math |
| `TEX-CLS-DRP` | DocumentClassDrop | Remove `\documentclass{...}` | Author accidentally deletes the preamble class |
| `TEX-ITM-MSN` | ItemMisplaced | Move `\item` outside its list environment | Copy-paste error with list items |
| `TEX-PKG-DRP` | PackageDrop | Remove a `\usepackage{...}` that is actually used | Author removes "unused" package that IS used |

#### Tier 2: Semantic (10 operators)

| Code | Name | What it does | Realistic model |
| --- | --- | --- | --- |
| `TEX-MTH-REL` | MathRelationSwap | Swap `\leq`↔`\geq`, `<`↔`>`, `\subset`↔`\supset` | Authors confuse inequality direction |
| `TEX-MTH-OPS` | MathOperatorSwap | Swap `\cup`↔`\cap`, `\sin`↔`\cos`, `\sum`↔`\prod` | Authors pick wrong operator |
| `TEX-CMD-TRP` | CommandTypo | Common misspellings: `\begn` → `\begin`, `\frac` → `\frak`, `\textbf` → `\textbf ` (trailing space) | Real typos authors make |
| `TEX-ENV-SWP` | EnvironmentSwap | Swap `itemize`↔`enumerate`, `table`↔`tabular`, `figure`↔`figure*` | Authors pick wrong environment |
| `TEX-LBL-DUP` | LabelDuplicate | Duplicate a `\label{...}` key | Copy-paste error with labels |
| `TEX-REF-UDF` | ReferenceUndefined | Replace a `\ref{...}` key with a non-existent key | Author renames a label but forgets to update refs |
| `TEX-LVL-SFT` | LevelShift | `\section` → `\subsection` or `\subsubsection` | Authors get heading levels wrong |
| `TEX-UNT-CHG` | UnitChange | `12pt` → `11pt` or `13pt`; `2cm` → `3cm` | Off-by-one in spacing values |
| `TEX-FNT-SWP` | FontSwap | `\textbf` ↔ `\textit` ↔ `\texttt` | Authors apply wrong font command |
| `TEX-ARG-DRP` | ArgumentDrop | Remove a required argument from a command (e.g., `\frac{a}` missing second arg) | Authors forget required arguments |

#### Tier 3: Realistic Author Errors (6 operators)

| Code | Name | What it does | Realistic model |
| --- | --- | --- | --- |
| `TEX-PKG-ORD` | PackageOrder | Move `hyperref` before other packages (breaks driver detection) | hyperref must be loaded last — common mistake |
| `TEX-FNT-SPEC` | FontSpecRemove | Remove `fontspec` import (fails on pdfLaTeX, OK on XeLaTeX) | Engine-specific package dependency error |
| `TEX-SHL-ESC` | ShellEscapeReq | Introduce `minted` dependency without `-shell-escape` | Authors use minted without knowing the flag |
| `TEX-HYP-DRV` | HyperrefDriverConflict | Force wrong hyperref driver via `\hypersetup{pdfborder={0 0 0}}` before hyperref loads | Driver auto-detection failure |
| `TEX-GLS-UDF` | GlossaryUndefined | Reference `\gls{undefined-key}` | Author forgets to define glossary entry |
| `TEX-CSV-FMT` | CsvFormatException | Break `csvsimple` or `pgfplotstable` table data format | Author has wrong column count in CSV data |

### Typst Operators (15 total)

#### Tier 1: Structural (6)

| Code | Name | What it does |
| --- | --- | --- |
| `TYP-FNC-UNC` | FuncUnclosed | Remove closing `)` or `]` in function call |
| `TYP-IMP-DRP` | ImportDrop | Remove `#import` statement |
| `TYP-MTH-UNC` | MathUnclosed | Remove closing `$` in math mode |
| `TYP-CTB-UNC` | ContentBlockUnclosed | Remove closing `]` of content block |
| `TYP-STR-UNC` | StringUnclosed | Remove closing `"` in string literal |
| `TYP-LST-MLF` | ListMalformed | Break list formatting (remove `-` or `+` prefix) |

#### Tier 2: Semantic (6)

| Code | Name | What it does |
| --- | --- | --- |
| `TYP-VAR-UDF` | VarUndefined | Reference undefined variable |
| `TYP-TPE-WRG` | TypeWrong | Pass wrong type to function argument |
| `TYP-SET-INV` | SetRuleInvalid | Break a `#set` rule (wrong value type) |
| `TYP-DCT-DRP` | DictKeyDrop | Remove key from dictionary |
| `TYP-HDG-ORP` | HeadingOrphan | Remove content under a heading |
| `TYP-REF-UDF` | RefUndefined | Reference undefined label |

#### Tier 3: Realistic (3)

| Code | Name | What it does |
| --- | --- | --- |
| `TYP-PKG-DRP` | PackageDrop | Remove `#import` for a used package |
| `TYP-FNT-CHG` | FontChange | Change `#set text(font: "...")` to non-existent font |
| `TYP-PGE-SZE` | PageSizeChange | Set invalid page size (`#set page(paper: "invalid")`) |

### Markdown Operators (8 total)

#### Tier 1: Structural (4)

| Code | Name | What it does |
| --- | --- | --- |
| `MD-LNK-BRK` | LinkBroken | Break markdown link: `[text](url` missing closing `)` |
| `MD-CDE-UNC` | CodeFenceUnclosed | Remove closing `` ``` `` of code block |
| `MD-MTH-UNC` | MathBlockUnclosed | Remove closing `$$` of math block |
| `MD-YML-BRK` | YAMLFrontmatterBroken | Break YAML frontmatter delimiter or syntax |

#### Tier 2: Semantic (2)

| Code | Name | What it does |
| --- | --- | --- |
| `MD-HDR-MLF` | HeaderMalformed | Wrong header level sequence (e.g., `#` → `###` skipping `##`) |
| `MD-TBL-MLF` | TableMalformed | Break table pipe alignment or separator row |

#### Tier 3: Realistic (2)

| Code | Name | What it does |
| --- | --- | --- |
| `MD-IMG-BRK` | ImageBroken | `![alt](missing.png)` — reference non-existent image |
| `MD-HTML-UNC` | HTMLTagUnclosed | Unclosed inline HTML tag (pandoc-flavored) |

### Total: 48 operators across 3 formats

| Format | Tier 1 | Tier 2 | Tier 3 | Total |
| --- | --- | --- | --- | --- |
| LaTeX | 9 | 10 | 6 | **25** |
| Typst | 6 | 6 | 3 | **15** |
| Markdown | 4 | 2 | 2 | **8** |
| **Total** | **19** | **18** | **11** | **48** |

---

## Architecture

```
mutation-library/
  src/
    core/
      ast-parser.ts          # Parse LaTeX/Typst/Markdown into DocumentAST
      prng.ts                # Deterministic seeded PRNG (mulberry32 or similar)
      mutation-site.ts       # MutationSite type + site finder
      mutation-registry.ts   # Operator registry (plugin pattern)
      render-diff.ts         # Equivalent mutant detection via PDF comparison
      types.ts               # Shared types: DocumentAST, MutationSite, MutationResult
    operators/
      latex/
        structural.ts         # TEX-BRC-DRP, TEX-BRC-STR, TEX-ENV-REN, ...
        semantic.ts           # TEX-MTH-REL, TEX-MTH-OPS, TEX-CMD-TRP, ...
        realistic.ts          # TEX-PKG-ORD, TEX-FNT-SPEC, ...
      typst/
        structural.ts
        semantic.ts
        realistic.ts
      markdown/
        structural.ts
        semantic.ts
        realistic.ts
    cli.ts                    # `docmut --seed doc.tex --operators all --variants 5`
  tests/
    operators.test.ts         # Each operator: input → expected mutation
    determinism.test.ts       # Same seed → same mutation, every time
    render-diff.test.ts       # Equivalent mutant detection
    regression.test.ts        # Known documents → known mutations
  docs/
    OPERATOR-REFERENCE.md     # Full catalog with examples
    ADDING-OPERATORS.md       # How to write a custom operator
  package.json
  README.md
```

### Key Design Decisions

**Parser:** Use `unified` ecosystem for Markdown AST (remark). For LaTeX, use `tree-sitter-latex` if available, or extend the existing TeXFix-Bench regex-based parser with AST construction. For Typst, parse the native Typst syntax tree.

**PRNG:** `mulberry32` seeded by `hash(salt + seedHash + operatorCode + variantIndex)`. Deterministic, fast, no dependencies.

**Equivalent mutant detection:** After mutation, compile both original and mutant. If PDF output is byte-identical (after pdftotext normalization), discard the mutation as equivalent. Log it for transparency.

**Output format:** Each mutation produces a JSON record:
```json
{
  "id": "docmut-a3f2e1b8c4",
  "operator": "TEX-MTH-REL",
  "operatorName": "MathRelationSwap",
  "tier": 2,
  "format": "latex",
  "scope": "math",
  "seedDocument": "article.tex",
  "seedHash": "sha256:...",
  "mutationSite": { "line": 27, "column": 14, "nodeType": "math_relation" },
  "original": "\\leq",
  "mutated": "\\geq",
  "variantIndex": 2,
  "prngSeed": "20260802:55cf8438...:TEX-MTH-REL:2",
  "equivalentDetected": false
}
```

---

## How This Differs from TeXFix-Bench v0.3 Mutations

| Aspect | v0.3 mutations | DocMut (v0.4) |
| --- | --- | --- |
| Parsing | Regex-based, line-level | AST-based, node-level |
| Mutation location | Random valid line | Semantic AST node (math relation, environment boundary, etc.) |
| Operator count | 12 | 48 (across 3 formats) |
| Realism | Generic (remove any brace) | Context-aware (remove brace after `\frac`, swap `\leq`↔`\geq`) |
| Equivalent detection | Engine gate (compiles or not) | Engine gate + render-diff (PDF identical?) |
| Determinism | Seeded PRNG | Seeded PRNG (same, but with AST-level granularity) |
| Extensibility | Hardcoded operators | Plugin architecture |
| Output | JSON instance | Rich JSON with operator metadata, AST location, equivalence status |

---

## What an LLM Needs to Implement This

If an LLM is picking up this document to implement DocMut:

1. **Read this file completely** — it specifies every operator
2. **Read the mutation testing literature** summarized above — understand WHY these design choices were made
3. **Start with Tier 1 operators** for all 3 formats — these are the simplest and most impactful
4. **Use the existing TeXFix-Bench harness** at `../../harness/` as a starting point for the engine integration
5. **Ensure determinism** — every mutation must be reproducible from the PRNG seed
6. **Test each operator** — write a test that applies the operator to a known document and checks the output
7. **The parser is the hardest part** — invest time in getting the LaTeX AST parser right. Typst and Markdown parsers are easier.
8. **MIT license** — this is a reusable artifact, keep it permissively licensed

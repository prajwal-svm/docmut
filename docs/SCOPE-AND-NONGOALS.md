# Scope and Non-Goals

**DocMut version:** 0.2.x  
**Status:** Normative for public claims and benchmark construction

This document bounds what DocMut is, what it measures, and what it deliberately does not claim. Every paper table, README claim, and external citation should be consistent with this file.

---

## What DocMut is

DocMut is a **deterministic, multi-format document mutation library** for constructing **engine-validated synthetic faults** in:

- LaTeX (`.tex`)
- Typst (`.typ`)
- Markdown (`.md`)

Given a compiling (or renderable) seed document, DocMut:

1. Discovers **mutation sites** on a surface structural parse of the source.
2. Applies **named operators** (codes, tiers, hard/soft tracks).
3. Emits **golden / broken** pairs with stable IDs, hashes, and PRNG keys.
4. Optionally retains only mutants that pass a **pinned compilation gate**.
5. Optionally drops **render-text-equivalent** mutants via PDF text comparison.

Primary use cases:

- Construction of synthetic repair benchmarks (e.g. TeXFix-Bench v0.3 / v0.4).
- Controlled fault injection for multi-engine survival studies.
- Reproducible corpus generation for other document-repair experiments.

---

## Scientific contract

| Property | Contract |
|---|---|
| Input | Complete source string (single-file by default) |
| Output | Full mutated source + provenance metadata |
| Determinism | Same salt + seed hash + operator + variant → same mutant |
| Hard track | Golden compiles; broken fails under the pinned engine |
| Soft track | Golden compiles; broken still compiles but is keyed-faulty (warning and/or structural/semantic change) |
| Equivalence filter | Optional PDF-text identity under pinned engine + `pdftotext` |
| Parse model | Surface structural sites, **not** full TeX expansion |

---

## Non-goals (do not claim)

### Parsing

- **Not** a full TeX / LaTeX expansion engine.
- **Not** a replacement for TeX Live, Tectonic, or Typst’s own parser.
- **Not** guaranteed to interpret catcodes, full macro expansion, or every package syntax.
- **Not** multi-file project resolution by default (`\input` / `\include` chains are out of scope unless the caller flattens sources first).

### Realism and ecology

- **Not** a sample from the natural distribution of author errors on Overleaf or GitHub.
- **Not** a claim that operator frequencies match real-world error rates.
- **Not** a substitute for a licensed, provenance-complete real-world fail-to-pass corpus.

Synthetic construction answers the **repair contract** (known fault, known golden, stable hashes). Ecological claims require a separate accepted real-world track.

### Equivalence and correctness

- Render-diff is **not** visual identity (layout, figures, fonts may differ with identical extracted text).
- Render-diff is **not** semantic equivalence of mathematics or bibliography.
- Exact match to one golden inverse is **not** the only valid repair of a broken document.
- Engine success alone is **not** content restoration (see TeXFix-Bench layered metrics).

### Product positioning

- **Not** a general “mutation testing score” product for application unit tests (PIT/Stryker role).
- **Not** a LaTeX linter or static analyzer.
- **Not** an automatic repair system.

---

## Claim language (allowed vs forbidden)

| Allowed | Forbidden |
|---|---|
| Surface structural parse adequate for site selection | Full AST / complete TeX parser |
| Engine-gated synthetic fault construction | Real-world error census |
| Render-text equivalent mutant filter under pinned engine | Complete equivalent-mutant solution |
| Deterministic multi-format document mutator | Universal document understanding |
| Hard vs soft fault tracks | Compile success = correct repair |

Canonical short claim (use verbatim when summarizing DocMut):

> DocMut is a deterministic, multi-format document mutation library for constructing engine-validated synthetic faults in LaTeX, Typst, and Markdown. Unlike code-oriented mutators (PIT, Stryker, universalmutator), it targets scholarly document structure, separates hard compile failures from soft diagnostic faults, retains mutants only under a pinned compilation gate, and optionally drops render-text-equivalent mutants via PDF text comparison. It uses a surface structural parse adequate for site selection, not a full TeX expansion engine, and does not claim natural error prevalence or complete semantic equivalence detection.

---

## Versioning of claims

- Operator codes and tracks are part of the public scientific surface.
- Changing an operator’s semantics requires a **version bump** and a changelog note.
- The default salt `20260802` is pinned for cross-paper reproducibility; experiments may use other salts if recorded in instance metadata.

See also: [ORACLE-AND-GATES.md](./ORACLE-AND-GATES.md), [THREATS.md](./THREATS.md), [UNSUPPORTED.md](./UNSUPPORTED.md).

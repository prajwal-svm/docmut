# Related Work

How DocMut relates to existing mutation tools and document benchmarks. This is a **distinction table**, not a score leaderboard.

---

## Code-oriented mutation testing

| System | Domain | Method | Overlap with DocMut | Distinction |
|---|---|---|---|---|
| [PIT](https://pitest.org/) | Java bytecode | Strong mutators, test-suite kill scores | Tiered operators, mature MT practice | Code tests, not documents or engines |
| [Stryker](https://stryker-mutator.io/) | JS/TS and other languages | Named operators, reports, plugins | Operator taxonomy, plugin registry | Application source, not TeX/Typst |
| [Mull](https://github.com/mull-project/mull) | C/C++/Rust (LLVM IR) | IR-level mutation | “Mutate where semantics live” | Compiler IR, not markup |
| [mutmut](https://github.com/boxed/mutmut) | Python | Source mutators | Simple mutation pipelines | Python AST/source only |
| [cosmic-ray](https://github.com/sixty-north/cosmic-ray) | Python | Plugin operators | Registry/plugin pattern | Python tests |
| [universalmutator](https://github.com/agroce/universalmutator) | Multi-language regex rules | Language-agnostic text rules | Closest *generic* mutator cousin | No document engines, no hard/soft tracks, no PDF render-diff, not format-aware for TeX/Typst |

**Takeaway:** DocMut inherits *methodology* from this literature (determinism, tiers, plugins, equivalent-mutant awareness). It is not a reimplementation of PIT for Java.

---

## Document and scholarly tooling

| Work | What it studies | Score-compatible with DocMut? |
|---|---|---|
| EqFix (SETTA 2022) | Example-driven repair of **individual equations** | No — different granularity |
| TexOCR / TexOCR-Bench (ACL 2026) | Page **image** → compilable LaTeX | No — different input contract |
| Tan & Rigger (ISSTA 2024) | Cross-engine / version TeX **inconsistency** | Motivates engine pinning; not a mutator |
| Editor assistants (e.g. Overleaf-oriented tools) | Writing workflows | Product systems, not mutation oracles |
| Hand-scraped TeX Stack Exchange errors | Natural failures | Oracle often weak; multi-fault; provenance constraints |

**Takeaway:** Adjacent work strengthens the case for engine pinning and document repair. None provides a multi-format, engine-gated, deterministic mutation library for full-source scholarly documents.

---

## Classical mutation testing theory

| Idea | Source tradition | DocMut mapping |
|---|---|---|
| Controlled fault injection | DeMillo et al.; Jia & Harman survey | Single-operator mutants with known sites |
| Equivalent mutants | Long-standing MT problem | Partial filter via PDF-text render-diff (document-specific) |
| Coupling / operator design | Strong vs weak mutation | Tier 1 structural vs Tier 2–3 semantic/realistic |
| Deterministic experiments | Executable repair benchmarks | Salted PRNG + content hashes |

---

## Positioning statement

DocMut occupies the intersection of:

1. **Mutation testing methodology** (from software engineering), and  
2. **Document build artifacts** (LaTeX / Typst / Markdown under pinned engines),

for the purpose of **synthetic corpus construction** for repair evaluation—not for computing application mutation scores against unit tests.

See [SCOPE-AND-NONGOALS.md](./SCOPE-AND-NONGOALS.md) for claim boundaries.

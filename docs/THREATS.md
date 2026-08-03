# Threats to Validity (Mutation Construction)

Threats for **DocMut as a corpus generator**. Repair-model scoring threats belong in the benchmark paper (e.g. TeXFix-Bench).

---

## Construct validity

| Threat | Mitigation |
|---|---|
| Operators may not match natural author errors | Tier rationales; optional mapping notes; do not claim prevalence |
| Surface parse misses deep macro sites | Documented non-goals; adequacy reports on seeds |
| PDF-text equivalence ≠ semantic equivalence | Claimed only as render-text filter |
| Soft-track warnings engine-dependent | Pin engine; report soft separately from hard |

---

## Internal validity

| Threat | Mitigation |
|---|---|
| Non-determinism across machines | Salted PRNG; content hashes; determinism tests |
| Gate outcomes depend on package availability | Pin toolchain; record versions |
| Operator interaction (multi-fault) | Default: one operator application per mutant |
| Silent no-op mutants | Static gate + engine gate + tests |

---

## External validity

| Threat | Mitigation |
|---|---|
| Seed documents are not “all papers” | Report seed provenance; expand seeds in v0.4+ |
| Single-file ≠ multi-file projects | Unsupported list; flatten policy |
| Tectonic-only gate ≠ pdfLaTeX/Xe/Lua | Multi-engine studies as follow-on |
| Format imbalance (25/15/8 operators) | Explicit; not a claim of equal difficulty |

---

## Conclusion validity (for papers using DocMut)

| Threat | Mitigation |
|---|---|
| Ranking models on one operator family | Stratify by category/operator |
| Pooling hard and soft | Forbidden without study design |
| Treating compile success as repair success | Use layered metrics outside DocMut |

---

## Reviewer FAQ (short)

**Q: Why synthetic?**  
Known fault, golden, hashes, engine invariants.

**Q: Why not only real errors?**  
Natural faults entangle multi-fault edits, missing assets, and non-reproducible environments. Real tracks need acceptance criteria.

**Q: Is the parser “just regex”?**  
It is a **surface structural** scanner with active-mask awareness for site selection. Adequacy is judged by site discovery + engine-gate retention on seeds—not by TeX completeness.

**Q: Did you solve equivalent mutants?**  
No. Render-diff is a document-specific **partial** filter on extracted PDF text.

# Adequacy

How to judge whether DocMut is **adequate for a seed set**—without confusing that with full TeX completeness.

---

## Adequacy is relative to seeds and gates

DocMut is adequate for a study when, on the **actual seeds** used:

1. Structural operators discover sites where expected.  
2. Apply produces a changed source.  
3. Hard operators retain under the engine gate at non-trivial rates (or are documented as rare/site-limited).  
4. Soft operators retain under soft criteria where applicable.  
5. Determinism holds for the salt and operator set.

Adequacy is **not**:

- Parsing every package in TeX Live  
- Matching natural error frequencies  
- Zero skipped operators on every seed  

---

## Metrics

| Metric | Definition |
|---|---|
| `sites_found` | Count of mutation sites for operator \(o\) on seed \(s\) |
| `apply_ok` | Apply returned non-null changed source |
| `engine_kept` | Passed hard/soft engine gate (when enabled) |
| `equivalent_rate` | Fraction marked render-text equivalent (when enabled) |
| `retention` | `engine_kept / attempted` per operator (or sites) |

---

## Commands

```bash
# Fixture smoke (uses engines if installed)
pnpm adequacy --seed fixtures/sample.tex --variants 2 --engine-gate --out evidence/adequacy-sample-tex.json

pnpm adequacy --seed fixtures/sample.typ --variants 2 --engine-gate --out evidence/adequacy-sample-typ.json

# Operator manifest only (no compile)
pnpm adequacy --manifest-only --out evidence/operator-manifest.json

# Full unit/integration suite
pnpm test
```

Commit or archive JSON reports used in papers under `evidence/` with the paper’s release ledger.

---

## Comparison stance vs other mutators

| Criterion | universalmutator-style regex | DocMut |
|---|---|---|
| Format-aware sites | Weak | Yes (LaTeX/Typst/Markdown) |
| Active comment/math masks | Rare | Yes |
| Golden/broken pairs + hashes | No | Yes |
| Hard/soft tracks | No | Yes |
| Engine gate | No | Yes |
| Render-text equivalence | No | Optional |
| Full language parse | No | No (surface structural; stated) |

DocMut’s advantage is the **construction contract**, not a claim of deeper parsing than production compilers.

---

## Minimum bar for paper use

Before freezing a TeXFix-style corpus:

- [ ] `pnpm test` green  
- [ ] Operator manifest hash recorded  
- [ ] Salt recorded  
- [ ] Engine versions recorded  
- [ ] Hard invariant rechecked by oracle (`compile(golden)`, `!compile(broken)`)  
- [ ] Hard/soft not pooled  
- [ ] Unsupported constructs listed if seeds push the boundary  

See [ORACLE-AND-GATES.md](./ORACLE-AND-GATES.md) and [UNSUPPORTED.md](./UNSUPPORTED.md).

# Oracle and Gates

Normative definitions for construction validity. These gates are what make DocMut suitable for benchmark construction rather than ad-hoc string editing.

---

## Toolchain pins (recommended)

| Tool | Role | Recommended pin |
|---|---|---|
| Tectonic | LaTeX compile | 0.17.0 |
| Typst | Typst compile | 0.15.x (record exact) |
| Poppler `pdftotext` | PDF text extraction | 25.11.0 (record exact) |

Record `engine` binary path/version and tool versions in experiment manifests. Cross-engine disagreement is documented in the TeX ecosystem (Tan & Rigger, ISSTA 2024); **pinning is mandatory** for comparable numbers.

---

## Static gate

Before any compile:

```text
static_pass ⇔ broken ≠ golden   (after optional newline normalization policy of the caller)
```

DocMut’s pipeline rejects apply failures that produce no source change.

---

## Engine gate — hard track

For operator track `hard` (default):

```text
hard_pass ⇔ compile(golden) = success
         ∧ compile(broken)  = failure
```

Interpretation: the mutant is a true single-document **compilation failure** under the pin.

---

## Engine gate — soft track

For operator track `soft`:

```text
soft_pass ⇔ compile(golden) = success
         ∧ compile(broken)  = success
         ∧ ( keyed_warning(broken) ∨ structure_or_source_diff_beyond_noise )
```

Soft operators model faults that still build (undefined refs, relation swaps, package order issues, etc.). Exact warning keying is operator- and engine-log dependent; see implementation in `src/core/render-diff.ts`.

Hard and soft cohorts **must not be pooled** in repair scores without an explicit study design.

---

## Render-diff equivalence filter

Optional. After mutation (typically after engine considerations):

1. Compile golden and mutant to PDF under the pinned engine (when the format supports it).  
2. Extract text with `pdftotext`.  
3. Normalize: lowercase, strip punctuation/whitespace per `normalizePdfText`.  
4. If normalized texts are identical → mark `equivalentDetected = true`.

Default pipeline option: exclude equivalents from the kept set (`excludeEquivalent: true`).

### What this proves

- Source differs but **extracted page text** matches under the pin → mutant is a poor repair-benchmark instance for content-changing faults.

### What this does not prove

- Visual / layout identity  
- Math semantic identity when text layers collapse symbols  
- Bibliography or figure identity  
- Full classical “equivalent mutant” elimination for all operators  

---

## Evaluation pipeline vs construction pipeline

| Stage | Owner | Role |
|---|---|---|
| Mutation + gates | DocMut | Build broken instances |
| Hosted repair attempts | Benchmark harness | Generate candidates |
| Local rescoring | Benchmark harness | H1 / NEM / EEO / etc. |

DocMut does **not** score model repairs. It constructs inputs.

---

## Formal invariants for hard-track instances

For every retained hard instance \(i\):

\[
\mathrm{compile}(g_i)=\mathsf{ok},\quad
\mathrm{compile}(b_i)=\mathsf{fail},\quad
\mathrm{sha256}(b_i)\ \text{unique in cohort (after dedup policy)}
\]

where \(g_i\) is golden and \(b_i\) is broken.

TeXFix-Bench-style oracles should re-check these invariants before inference.

---

## Failure dispositions

When gates run, mutants may be skipped for:

| Disposition | Meaning |
|---|---|
| `skippedNoSite` | Operator found no site on this seed |
| `skippedApplyFailed` | Apply returned null or no change |
| `skippedEngineGate` | Failed hard/soft compile criteria |
| `skippedEquivalent` | Render-text equivalent under filter |

Always report disposition counts in corpus construction logs.

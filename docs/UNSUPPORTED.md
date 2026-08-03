# Unsupported and Partial Support

Explicit limits of the surface structural parse and default single-file contract. Reviewers should treat this list as **scope**, not as accidental omission.

---

## Multi-file projects

| Construct | Support |
|---|---|
| `\input{...}`, `\include{...}` | Not resolved. Mutate flattened sources or each file separately. |
| `\subfile`, `\import` | Not resolved. |
| Typst multipage project roots with relative includes | Partial: mutate the provided source string only. |
| Markdown that includes other files via tool-specific directives | Not resolved. |

---

## TeX / LaTeX language features

| Feature | Support |
|---|---|
| Full macro expansion | **No** |
| Catcode changes | **No** |
| `\csname` / dynamic command names | Partial / may miss sites |
| Expl3 / LaTeX3 internals | Not a target surface |
| Verb/verbatim special catcodes | Active-mask tries to skip; not complete |
| Nested `\verb` edge cases | Best-effort |
| LuaTeX callbacks / shell escape side effects | Out of scope for parse; engine gate may fail closed |
| Encrypted / non-UTF8 sources | Unsupported |

---

## Packages and engines

| Topic | Support |
|---|---|
| Package-specific DSLs (TikZ paths, complex pgfplots) | Sites may exist only if surface tokens match operators |
| `minted` / shell-escape requirements | Modeled by specific Tier-3 operators; environment must provide flags if testing those |
| Engine-specific packages (`fontspec` on pdfLaTeX) | Operator-level; multi-engine studies pin each engine separately |

---

## Typst / Markdown

| Feature | Support |
|---|---|
| Full Typst evaluation / show rules | Surface parse only |
| Raw blocks / complex markup nesting | Best-effort |
| CommonMark vs GFM divergences | Surface tokens; not a full CommonMark conformance suite |
| MDX / JSX | Unsupported |

---

## Adequacy stance

Unsupported does **not** mean “DocMut is invalid.” It means:

1. Seeds for scientific corpora should be chosen within the supported surface, **or**  
2. Callers flatten / pre-process sources, **or**  
3. Limitations are stated in the paper’s threats section.

Measure coverage with `pnpm adequacy` on the actual seed set used in a study.

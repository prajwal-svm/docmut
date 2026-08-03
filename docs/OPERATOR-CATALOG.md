# Operator Catalog

Machine-readable freeze: generated from the registered operator plugins (DocMut 0.2.x).
Total operators: **48** (hard: 27, soft: 21).

| Format | Count |
|---|---:|
| LaTeX | 25 |
| Typst | 15 |
| Markdown | 8 |

Tier legend: **1** structural · **2** semantic · **3** realistic author-error patterns.

Track legend: **hard** expects compile failure · **soft** expects compile success with diagnostic/semantic fault.

---

### LaTeX (25)

| Code | Name | Tier | Track | Scope | Rationale |
|---|---|---:|---|---|---|
| `TEX-ARG-DRP` | ArgumentDrop | 2 | hard | structure | Authors forget a required argument (e.g. \frac{a} missing second arg). |
| `TEX-BRC-DRP` | BraceDrop | 1 | hard | structure | Unclosed groups are among the most common TeX errors ('Runaway argument', 'Extra }, or forgotten $'). |
| `TEX-BRC-STR` | BraceStray | 1 | hard | structure | An unbalanced '{' silently swallows following tokens, a frequent copy-paste error. |
| `TEX-CLS-DRP` | DocumentClassDrop | 1 | hard | preamble | Author accidentally deletes the preamble class declaration. |
| `TEX-CMD-TRP` | CommandTypo | 2 | hard | structure | Undefined control sequence from a realistic author typo. |
| `TEX-CSV-FMT` | CsvFormatException | 3 | hard | table | Author has wrong column count in CSV data used by csvsimple/pgfplotstable. |
| `TEX-ENV-REN` | EnvRename | 1 | hard | structure | Mismatched \begin/\end names raise 'Environment ... undefined' and 'Missing \endgroup'. |
| `TEX-ENV-SWP` | EnvironmentSwap | 2 | soft | structure | Authors pick the wrong environment (itemize vs enumerate, table vs tabular). |
| `TEX-ENV-UNC` | EnvUnclosed | 1 | hard | structure | Forgetting to close an environment produces '\begin{...} ended by \end{document}'. |
| `TEX-FNT-SPEC` | FontSpecRemove | 3 | hard | package | Engine-specific package dependency: fontspec fails on pdfLaTeX. |
| `TEX-FNT-SWP` | FontSwap | 2 | soft | font | Authors apply the wrong font command (textbf ↔ textit ↔ texttt). |
| `TEX-GLS-UDF` | GlossaryUndefined | 3 | hard | reference | Author forgets to define a glossary entry before using \gls. |
| `TEX-HYP-DRV` | HyperrefDriverConflict | 3 | soft | package | Driver auto-detection failure from premature hyperref setup. |
| `TEX-ITM-MSN` | ItemMisplaced | 1 | hard | list | Copy-paste error placing \item outside itemize/enumerate. |
| `TEX-LBL-DUP` | LabelDuplicate | 2 | soft | reference | Copy-paste error duplicating a \label key causes multiply-defined labels. |
| `TEX-LVL-SFT` | LevelShift | 2 | soft | heading | Authors get heading levels wrong (section → subsection). |
| `TEX-MTH-DLR` | MathDollar | 1 | hard | math | Missing '$' triggers 'Missing $ inserted' and cascades across the rest of the file. |
| `TEX-MTH-DSP` | MathDisplay | 1 | hard | math | An unclosed \[ leaves math mode running to end-of-file. |
| `TEX-MTH-OPS` | MathOperatorSwap | 2 | soft | math | Authors pick the wrong mathematical operator (cup/cap, sin/cos, sum/prod). |
| `TEX-MTH-REL` | MathRelationSwap | 2 | soft | math | Authors confuse inequality direction in mathematical expressions. |
| `TEX-PKG-DRP` | PackageDrop | 1 | hard | package | Author removes a package that is still required by macros in the body. |
| `TEX-PKG-ORD` | PackageOrder | 3 | soft | package | hyperref must be loaded last — loading it early is a classic author mistake. |
| `TEX-REF-UDF` | ReferenceUndefined | 2 | soft | reference | Author renames a label but forgets to update refs. |
| `TEX-SHL-ESC` | ShellEscapeReq | 3 | hard | package | Authors use minted without knowing the --shell-escape flag is required. |
| `TEX-UNT-CHG` | UnitChange | 2 | soft | preamble | Off-by-one in spacing/font size values (12pt → 11pt, 2cm → 3cm). |

### Typst (15)

| Code | Name | Tier | Track | Scope | Rationale |
|---|---|---:|---|---|---|
| `TYP-CTB-UNC` | ContentBlockUnclosed | 1 | hard | structure | Unclosed content block ] is a common Typst syntax error. |
| `TYP-DCT-DRP` | DictKeyDrop | 2 | hard | structure | Dropping a required dictionary key breaks function calls. |
| `TYP-FNC-UNC` | FuncUnclosed | 1 | hard | structure | Unclosed function call parentheses break Typst parsing. |
| `TYP-FNT-CHG` | FontChange | 3 | soft | font | Setting a non-existent font is a common cross-platform Typst error. |
| `TYP-HDG-ORP` | HeadingOrphan | 2 | soft | heading | Accidentally deleting section body leaves an orphan heading. |
| `TYP-IMP-DRP` | ImportDrop | 1 | hard | package | Removing an import breaks subsequent uses of imported symbols. |
| `TYP-LST-MLF` | ListMalformed | 1 | hard | list | Removing list markers produces invalid or unintended document structure. |
| `TYP-MTH-UNC` | MathUnclosed | 1 | hard | math | Unclosed math mode $ cascades through the rest of the document. |
| `TYP-PGE-SZE` | PageSizeChange | 3 | hard | structure | Invalid page paper size causes Typst set-rule errors. |
| `TYP-PKG-DRP` | PackageDrop | 3 | hard | package | Removing a used package import breaks the document at compile time. |
| `TYP-REF-UDF` | RefUndefined | 2 | soft | reference | Referencing an undefined label produces Typst reference errors. |
| `TYP-SET-INV` | SetRuleInvalid | 2 | hard | structure | Invalid #set rule values are a frequent Typst configuration mistake. |
| `TYP-STR-UNC` | StringUnclosed | 1 | hard | structure | Unclosed string literals break Typst compilation. |
| `TYP-TPE-WRG` | TypeWrong | 2 | hard | structure | Passing the wrong type to a function argument fails Typst type checking. |
| `TYP-VAR-UDF` | VarUndefined | 2 | hard | structure | Referencing an undefined variable is a common Typst authoring error. |

### Markdown (8)

| Code | Name | Tier | Track | Scope | Rationale |
|---|---|---:|---|---|---|
| `MD-CDE-UNC` | CodeFenceUnclosed | 1 | soft | code | Forgetting to close a fenced code block swallows subsequent content. |
| `MD-HDR-MLF` | HeaderMalformed | 2 | soft | heading | Skipping heading levels breaks document outline structure. |
| `MD-HTML-UNC` | HTMLTagUnclosed | 3 | soft | html | Unclosed HTML tags break pandoc and many Markdown renderers. |
| `MD-IMG-BRK` | ImageBroken | 3 | soft | link | Referencing a missing image is a common documentation mistake. |
| `MD-LNK-BRK` | LinkBroken | 1 | soft | link | Unclosed markdown links are a common authoring typo. |
| `MD-MTH-UNC` | MathBlockUnclosed | 1 | soft | math | Unclosed display-math $$ breaks pandoc and many MD processors. |
| `MD-TBL-MLF` | TableMalformed | 2 | soft | table | Broken table separator rows cause markdown table render failures. |
| `MD-YML-BRK` | YAMLFrontmatterBroken | 1 | soft | yaml | Broken YAML frontmatter delimiters confuse static site generators. |


## Citation of operators

Papers should cite operator **codes** (e.g. `TEX-BRC-DRP`), DocMut version, and salt.
Do not invent ad-hoc fault names when a code exists.

## Extending

See README “Adding an operator”. New codes require a minor version bump and a row here (regenerate via `pnpm adequacy --manifest-only` or the export script).

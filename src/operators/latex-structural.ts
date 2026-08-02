/**
 * LaTeX Tier 1 — Structural operators (9).
 * TEX-BRC-DRP, TEX-BRC-STR, TEX-ENV-REN, TEX-ENV-UNC, TEX-MTH-DLR,
 * TEX-MTH-DSP, TEX-CLS-DRP, TEX-ITM-MSN, TEX-PKG-DRP
 */

import type { DocumentAST, MutationOperator, MutationSite } from "../core/types.js";
import { collectNodes, applySpanMutation } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";
import { pick, randInt } from "../core/prng.js";

function op(
  partial: Omit<MutationOperator, "findMutationSites" | "apply"> &
    Pick<MutationOperator, "findMutationSites" | "apply">,
): MutationOperator {
  return partial;
}

/** TEX-BRC-DRP: Remove a closing `}` at a nested group boundary. */
export const braceDrop: MutationOperator = op({
  name: "BraceDrop",
  code: "TEX-BRC-DRP",
  tier: 1,
  formats: ["latex"],
  scope: "structure",
  rationale:
    "Unclosed groups are among the most common TeX errors ('Runaway argument', 'Extra }, or forgotten $').",
  findMutationSites(ast) {
    const nodes = collectNodes(ast, "brace_close");
    // Prefer nested braces (depth info) and skip documentclass braces
    return nodes
      .filter((n) => {
        const line = ast.source.slice(
          Math.max(0, n.start - 40),
          n.start,
        );
        // Avoid end{...} / begin{...} name braces already excluded by parser
        if (/\\(?:begin|end)\s*\{[^}]*$/.test(line)) return false;
        return true;
      })
      .map((n) =>
        site("TEX-BRC-DRP", n, `closing brace at ${n.line}:${n.column}`, {
          open: n.attrs?.open,
        }),
      );
  },
  apply(ast, s) {
    const start = s.start ?? s.node.start;
    const end = s.end ?? s.node.end;
    if (ast.source.slice(start, end) !== "}") return null;
    return applySpanMutation(ast, s, start, end, "");
  },
});

/** TEX-BRC-STR: Insert an extra `{` at a scope boundary (paragraph text). */
export const braceStray: MutationOperator = op({
  name: "BraceStray",
  code: "TEX-BRC-STR",
  tier: 1,
  formats: ["latex"],
  scope: "structure",
  rationale: "An unbalanced '{' silently swallows following tokens, a frequent copy-paste error.",
  findMutationSites(ast) {
    const body = collectNodes(ast, "body")[0];
    const regionStart = body?.start ?? 0;
    const regionEnd = body?.end ?? ast.source.length;
    const lines = ast.source.split("\n");
    const sites: MutationSite[] = [];
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineStart = offset;
      offset += line.length + 1;
      if (lineStart < regionStart || lineStart >= regionEnd) continue;
      if (/^\s*(\\|%|\[|\]|\}|\\begin|\\end)/.test(line)) continue;
      if (line.trim().length < 12) continue;
      // Use a synthetic node for the line
      const node = {
        type: "text" as const,
        start: lineStart,
        end: lineStart + line.length,
        line: i + 1,
        column: 1,
        children: [] as never[],
        text: line,
      };
      sites.push(
        site("TEX-BRC-STR", node, `stray brace insert line ${i + 1}`, {
          insertFraction: 0.6,
        }),
      );
    }
    return sites;
  },
  apply(ast, s, _v, rng) {
    const line = ast.source.slice(s.node.start, s.node.end);
    const trimmed = line.trimStart();
    const lead = line.length - trimmed.length;
    const frac = typeof s.data?.insertFraction === "number" ? s.data.insertFraction : 0.6;
    const insertAt = s.node.start + lead + Math.max(1, Math.floor(trimmed.length * frac));
    // Slight rng jitter within line
    const jitter = randInt(3, rng);
    const pos = Math.min(s.node.end - 1, insertAt + jitter);
    return applySpanMutation(ast, s, pos, pos, "{", "");
  },
});

/** TEX-ENV-REN: Misspell `\end{...}` name. */
export const envRename: MutationOperator = op({
  name: "EnvRename",
  code: "TEX-ENV-REN",
  tier: 1,
  formats: ["latex"],
  scope: "structure",
  rationale: "Mismatched \\begin/\\end names raise 'Environment ... undefined' and 'Missing \\endgroup'.",
  findMutationSites(ast) {
    return collectNodes(ast, "end_env")
      .filter((n) => n.name && n.name !== "document" && n.name.length > 3)
      .map((n) =>
        site("TEX-ENV-REN", n, `\\end{${n.name}}`, {
          name: n.name,
        }),
      );
  },
  apply(ast, s) {
    const name = String(s.data?.name ?? s.node.name ?? "");
    if (name.length <= 3) return null;
    // Realistic typo: British spelling or drop last letter
    const typos: Record<string, string> = {
      itemize: "itemise",
      center: "centre",
      figure: "figurer",
      table: "tabel",
      equation: "equaton",
      abstract: "abstrac",
    };
    const typo = typos[name] ?? name.slice(0, -1);
    const original = `\\end{${name}}`;
    const mutated = `\\end{${typo}}`;
    const start = s.node.start;
    const idx = ast.source.indexOf(original, start);
    if (idx < 0 || idx > s.node.end) {
      // fallback: replace name inside braces
      const brace = ast.source.indexOf(`{${name}}`, start);
      if (brace < 0) return null;
      return applySpanMutation(ast, s, brace + 1, brace + 1 + name.length, typo, name);
    }
    return applySpanMutation(ast, s, idx, idx + original.length, mutated, original);
  },
});

/** TEX-ENV-UNC: Remove `\end{...}` line entirely. */
export const envUnclosed: MutationOperator = op({
  name: "EnvUnclosed",
  code: "TEX-ENV-UNC",
  tier: 1,
  formats: ["latex"],
  scope: "structure",
  rationale: "Forgetting to close an environment produces '\\begin{...} ended by \\end{document}'.",
  findMutationSites(ast) {
    return collectNodes(ast, "end_env")
      .filter((n) => n.name && n.name !== "document")
      .map((n) => site("TEX-ENV-UNC", n, `remove \\end{${n.name}}`));
  },
  apply(ast, s) {
    // Remove the whole line containing the \end
    let start = s.node.start;
    let end = s.node.end;
    // Expand to full line if the line is only the end env
    while (start > 0 && ast.source[start - 1] !== "\n") start--;
    while (end < ast.source.length && ast.source[end] !== "\n") end++;
    if (end < ast.source.length && ast.source[end] === "\n") end++; // eat newline
    const original = ast.source.slice(start, end);
    return applySpanMutation(ast, s, start, end, "", original);
  },
});

/** TEX-MTH-DLR: Remove a closing `$` after inline math. */
export const mathDollar: MutationOperator = op({
  name: "MathDollar",
  code: "TEX-MTH-DLR",
  tier: 1,
  formats: ["latex"],
  scope: "math",
  rationale: "Missing '$' triggers 'Missing $ inserted' and cascades across the rest of the file.",
  findMutationSites(ast) {
    return collectNodes(ast, "math_inline")
      .filter((n) => n.attrs?.delimiter === "$" && (n.text?.length ?? 0) >= 3)
      .map((n) =>
        site("TEX-MTH-DLR", n, `inline math at ${n.line}`, {
          closeStart: n.end - 1,
        }),
      );
  },
  apply(ast, s) {
    const closeStart = Number(s.data?.closeStart ?? s.node.end - 1);
    if (ast.source[closeStart] !== "$") return null;
    return applySpanMutation(ast, s, closeStart, closeStart + 1, "");
  },
});

/** TEX-MTH-DSP: Remove a closing `\]` after display math. */
export const mathDisplay: MutationOperator = op({
  name: "MathDisplay",
  code: "TEX-MTH-DSP",
  tier: 1,
  formats: ["latex"],
  scope: "math",
  rationale: "An unclosed \\[ leaves math mode running to end-of-file.",
  findMutationSites(ast) {
    return collectNodes(ast, "math_display")
      .filter((n) => n.attrs?.delimiter === "\\[\\]" || n.text?.endsWith("\\]"))
      .map((n) =>
        site("TEX-MTH-DSP", n, `display math at ${n.line}`, {
          closeStart: n.end - 2,
        }),
      );
  },
  apply(ast, s) {
    const closeStart = Number(s.data?.closeStart ?? s.node.end - 2);
    if (ast.source.slice(closeStart, closeStart + 2) !== "\\]") return null;
    return applySpanMutation(ast, s, closeStart, closeStart + 2, "");
  },
});

/** TEX-CLS-DRP: Remove `\documentclass{...}`. */
export const documentclassDrop: MutationOperator = op({
  name: "DocumentClassDrop",
  code: "TEX-CLS-DRP",
  tier: 1,
  formats: ["latex"],
  scope: "preamble",
  rationale: "Author accidentally deletes the preamble class declaration.",
  findMutationSites(ast) {
    return collectNodes(ast, "documentclass").map((n) =>
      site("TEX-CLS-DRP", n, `\\documentclass{${n.name}}`),
    );
  },
  apply(ast, s) {
    let start = s.node.start;
    let end = s.node.end;
    while (end < ast.source.length && ast.source[end] !== "\n") end++;
    if (end < ast.source.length && ast.source[end] === "\n") end++;
    const original = ast.source.slice(start, end);
    return applySpanMutation(ast, s, start, end, "", original);
  },
});

/** TEX-ITM-MSN: Move `\item` outside its list environment. */
export const itemMisplaced: MutationOperator = op({
  name: "ItemMisplaced",
  code: "TEX-ITM-MSN",
  tier: 1,
  formats: ["latex"],
  scope: "list",
  rationale: "Copy-paste error placing \\item outside itemize/enumerate.",
  findMutationSites(ast) {
    const items = collectNodes(ast, "item");
    const listEnvs = collectNodes(ast, "environment").filter(
      (e) => e.name === "itemize" || e.name === "enumerate" || e.name === "description",
    );
    const sites: MutationSite[] = [];
    for (const item of items) {
      // Must be inside a list env
      const parent = listEnvs.find((e) => item.start >= e.start && item.end <= e.end);
      if (!parent) continue;
      sites.push(
        site("TEX-ITM-MSN", item, `\\item at ${item.line}`, {
          envEnd: parent.attrs?.endStart,
          itemText: item.text,
        }),
      );
    }
    return sites;
  },
  apply(ast, s) {
    const itemStart = s.node.start;
    let itemEnd = s.node.end;
    // Grab full line
    let lineStart = itemStart;
    while (lineStart > 0 && ast.source[lineStart - 1] !== "\n") lineStart--;
    let lineEnd = itemEnd;
    while (lineEnd < ast.source.length && ast.source[lineEnd] !== "\n") lineEnd++;
    if (lineEnd < ast.source.length) lineEnd++;
    const lineText = ast.source.slice(lineStart, lineEnd);
    // Remove from current location and insert after \end{document} or after list
    const without = replaceSpanLocal(ast.source, lineStart, lineEnd, "");
    // Insert just before \end{document}
    const endDoc = without.search(/\\end\s*\{document\}/);
    if (endDoc < 0) return null;
    const mutated = without.slice(0, endDoc) + lineText + without.slice(endDoc);
    return {
      source: mutated,
      original: lineText.trim(),
      mutated: `misplaced ${lineText.trim()}`,
      site: s,
      faultLine: s.node.line,
      faultColumn: s.node.column,
      nodeType: s.node.type,
    };
  },
});

function replaceSpanLocal(source: string, start: number, end: number, rep: string): string {
  return source.slice(0, start) + rep + source.slice(end);
}

/** TEX-PKG-DRP: Remove a `\usepackage{...}` that is actually used. */
export const packageDrop: MutationOperator = op({
  name: "PackageDrop",
  code: "TEX-PKG-DRP",
  tier: 1,
  formats: ["latex"],
  scope: "package",
  rationale: "Author removes a package that is still required by macros in the body.",
  findMutationSites(ast) {
    // Map packages to commands they provide (heuristic usage check)
    const PKG_CMDS: Record<string, string[]> = {
      amsmath: ["\\begin{equation}", "\\begin{align}", "\\tfrac", "\\dfrac", "\\eqref", "\\text{"],
      amssymb: ["\\mathbb", "\\mathfrak", "\\leqslant", "\\geqslant"],
      graphicx: ["\\includegraphics"],
      hyperref: ["\\url{", "\\href{", "\\autoref", "\\hypersetup"],
      booktabs: ["\\toprule", "\\midrule", "\\bottomrule"],
      xcolor: ["\\textcolor", "\\color{"],
      tikz: ["\\begin{tikzpicture}", "\\tikz"],
      minted: ["\\begin{minted}", "\\mintinline"],
      listings: ["\\begin{lstlisting}", "\\lstinputlisting"],
      geometry: ["\\geometry{"],
      fontspec: ["\\setmainfont", "\\setsansfont"],
      glossaries: ["\\gls{", "\\newglossaryentry"],
      csvsimple: ["\\csvreader", "\\csvautotabular"],
      pgfplotstable: ["\\pgfplotstable"],
      inputenc: [], // skip — often not "used" visibly
      fontenc: [],
    };

    const sites: MutationSite[] = [];
    for (const n of collectNodes(ast, "usepackage")) {
      const pkgs = (n.attrs?.packages as string[] | undefined) ?? (n.name ? [n.name] : []);
      for (const pkg of pkgs) {
        const markers = PKG_CMDS[pkg];
        if (markers === undefined) {
          // unknown package: keep if name appears elsewhere as a command-ish usage
          continue;
        }
        if (markers.length === 0) continue; // skip inert packages
        const used = markers.some((m) => ast.source.includes(m));
        if (!used) continue;
        sites.push(
          site("TEX-PKG-DRP", n, `\\usepackage{${pkg}}`, { package: pkg }),
        );
      }
    }
    return sites;
  },
  apply(ast, s) {
    let start = s.node.start;
    let end = s.node.end;
    while (end < ast.source.length && ast.source[end] !== "\n") end++;
    if (end < ast.source.length && ast.source[end] === "\n") end++;
    const original = ast.source.slice(start, end);
    return applySpanMutation(ast, s, start, end, "", original);
  },
});

export const latexStructuralOperators: MutationOperator[] = [
  braceDrop,
  braceStray,
  envRename,
  envUnclosed,
  mathDollar,
  mathDisplay,
  documentclassDrop,
  itemMisplaced,
  packageDrop,
];

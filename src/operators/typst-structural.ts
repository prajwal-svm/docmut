/**
 * Typst Tier 1 — Structural operators (6).
 * TYP-FNC-UNC, TYP-IMP-DRP, TYP-MTH-UNC, TYP-CTB-UNC, TYP-STR-UNC, TYP-LST-MLF
 */

import type { MutationOperator } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";

/** TYP-FNC-UNC: Remove closing `)` or `]` in function call. */
export const funcUnclosed: MutationOperator = {
  name: "FuncUnclosed",
  code: "TYP-FNC-UNC",
  tier: 1,
  formats: ["typst"],
  scope: "structure",
  rationale: "Unclosed function call parentheses break Typst parsing.",
  findMutationSites(ast) {
    return collectNodes(ast, "function_call")
      .filter((n) => n.attrs?.closeParen !== undefined || (n.text?.endsWith(")")))
      .map((n) =>
        site("TYP-FNC-UNC", n, `unclose function ${n.name}`, {
          closeParen: n.attrs?.closeParen ?? n.end - 1,
        }),
      );
  },
  apply(ast, s) {
    const close = Number(s.data?.closeParen ?? s.node.end - 1);
    if (ast.source[close] !== ")") return null;
    return applySpanMutation(ast, s, close, close + 1, "");
  },
};

/** TYP-IMP-DRP: Remove `#import` statement. */
export const importDrop: MutationOperator = {
  name: "ImportDrop",
  code: "TYP-IMP-DRP",
  tier: 1,
  formats: ["typst"],
  scope: "package",
  rationale: "Removing an import breaks subsequent uses of imported symbols.",
  findMutationSites(ast) {
    return collectNodes(ast, "import").map((n) =>
      site("TYP-IMP-DRP", n, `remove ${n.text?.slice(0, 40)}`),
    );
  },
  apply(ast, s) {
    let start = s.node.start;
    let end = s.node.end;
    while (end < ast.source.length && ast.source[end] !== "\n") end++;
    if (end < ast.source.length) end++;
    return applySpanMutation(ast, s, start, end, "", ast.source.slice(start, end));
  },
};

/** TYP-MTH-UNC: Remove closing `$` in math mode. */
export const mathUnclosed: MutationOperator = {
  name: "MathUnclosed",
  code: "TYP-MTH-UNC",
  tier: 1,
  formats: ["typst"],
  scope: "math",
  rationale: "Unclosed math mode $ cascades through the rest of the document.",
  findMutationSites(ast) {
    return collectNodes(ast, "math_inline")
      .filter((n) => (n.text?.length ?? 0) >= 3 && n.text?.endsWith("$"))
      .map((n) =>
        site("TYP-MTH-UNC", n, `math at ${n.line}`, { close: n.end - 1 }),
      );
  },
  apply(ast, s) {
    const close = Number(s.data?.close ?? s.node.end - 1);
    if (ast.source[close] !== "$") return null;
    return applySpanMutation(ast, s, close, close + 1, "");
  },
};

/** TYP-CTB-UNC: Remove closing `]` of content block. */
export const contentBlockUnclosed: MutationOperator = {
  name: "ContentBlockUnclosed",
  code: "TYP-CTB-UNC",
  tier: 1,
  formats: ["typst"],
  scope: "structure",
  rationale: "Unclosed content block ] is a common Typst syntax error.",
  findMutationSites(ast) {
    return collectNodes(ast, "content_block")
      .filter((n) => n.attrs?.close !== undefined || n.text?.endsWith("]"))
      .map((n) =>
        site("TYP-CTB-UNC", n, `content block at ${n.line}`, {
          close: n.attrs?.close ?? n.end - 1,
        }),
      );
  },
  apply(ast, s) {
    const close = Number(s.data?.close ?? s.node.end - 1);
    if (ast.source[close] !== "]") return null;
    return applySpanMutation(ast, s, close, close + 1, "");
  },
};

/** TYP-STR-UNC: Remove closing `"` in string literal. */
export const stringUnclosed: MutationOperator = {
  name: "StringUnclosed",
  code: "TYP-STR-UNC",
  tier: 1,
  formats: ["typst"],
  scope: "structure",
  rationale: "Unclosed string literals break Typst compilation.",
  findMutationSites(ast) {
    return collectNodes(ast, "string")
      .filter((n) => (n.text?.length ?? 0) >= 2 && n.text?.endsWith('"'))
      .map((n) =>
        site("TYP-STR-UNC", n, `string at ${n.line}`, { close: n.end - 1 }),
      );
  },
  apply(ast, s) {
    const close = Number(s.data?.close ?? s.node.end - 1);
    if (ast.source[close] !== '"') return null;
    return applySpanMutation(ast, s, close, close + 1, "");
  },
};

/** TYP-LST-MLF: Break list formatting (remove `-` or `+` prefix). */
export const listMalformed: MutationOperator = {
  name: "ListMalformed",
  code: "TYP-LST-MLF",
  tier: 1,
  formats: ["typst"],
  scope: "list",
  rationale: "Removing list markers produces invalid or unintended document structure.",
  findMutationSites(ast) {
    return collectNodes(ast, "list_item").map((n) =>
      site("TYP-LST-MLF", n, `list item at ${n.line}`, {
        marker: n.attrs?.marker,
      }),
    );
  },
  apply(ast, s) {
    const text = ast.source.slice(s.node.start, s.node.end);
    const m = text.match(/^([ \t]*)([-+]|\d+\.)(\s+)/);
    if (!m) return null;
    const start = s.node.start + m[1]!.length;
    const end = start + m[2]!.length;
    return applySpanMutation(ast, s, start, end, "", m[2]!);
  },
};

export const typstStructuralOperators: MutationOperator[] = [
  funcUnclosed,
  importDrop,
  mathUnclosed,
  contentBlockUnclosed,
  stringUnclosed,
  listMalformed,
];

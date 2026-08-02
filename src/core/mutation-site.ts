/**
 * Mutation site discovery helpers shared by operators.
 */

import type {
  DocumentAST,
  DocumentFormat,
  MutationOperator,
  MutationSite,
} from "./types.js";
import { parseLatex } from "./parser-latex.js";
import { parseTypst } from "./parser-typst.js";
import { parseMarkdown } from "./parser-markdown.js";
import { normalizeNewlines } from "./source-utils.js";

/** Detect format from path extension or source heuristics. */
export function detectFormat(source: string, path?: string): DocumentFormat {
  const p = (path ?? "").toLowerCase();
  if (p.endsWith(".tex") || p.endsWith(".latex") || p.endsWith(".ltx")) return "latex";
  if (p.endsWith(".typ") || p.endsWith(".typst")) return "typst";
  if (p.endsWith(".md") || p.endsWith(".markdown") || p.endsWith(".mdx")) return "markdown";

  if (/\\documentclass\b/.test(source) || /\\begin\{document\}/.test(source)) return "latex";
  if (/^#import\s+/m.test(source) || /^#set\s+/m.test(source) || /^#let\s+/m.test(source)) {
    return "typst";
  }
  return "markdown";
}

/** Parse source into a DocumentAST using the appropriate format parser. */
export function parseDocument(
  sourceRaw: string,
  format?: DocumentFormat,
  path?: string,
): DocumentAST {
  const source = normalizeNewlines(sourceRaw);
  const fmt = format ?? detectFormat(source, path);
  if (fmt === "latex") return parseLatex(source, path);
  if (fmt === "typst") return parseTypst(source, path);
  return parseMarkdown(source, path);
}

/** Find sites for a single operator on an AST (no-op if format mismatch). */
export function findSitesForOperator(
  ast: DocumentAST,
  operator: MutationOperator,
): MutationSite[] {
  if (!operator.formats.includes(ast.format)) return [];
  try {
    return operator.findMutationSites(ast);
  } catch {
    return [];
  }
}

/** Find sites for many operators, keyed by operator code. */
export function findAllSites(
  ast: DocumentAST,
  operators: MutationOperator[],
): Map<string, MutationSite[]> {
  const map = new Map<string, MutationSite[]>();
  for (const op of operators) {
    const sites = findSitesForOperator(ast, op);
    if (sites.length) map.set(op.code, sites);
  }
  return map;
}

/** Helper to build a MutationSite. */
export function site(
  operatorCode: string,
  node: MutationSite["node"],
  label: string,
  data?: Record<string, unknown>,
  span?: { start: number; end: number },
): MutationSite {
  return {
    operatorCode,
    node,
    label,
    data,
    start: span?.start,
    end: span?.end,
  };
}

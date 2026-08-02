/**
 * Shared source-span utilities for AST-based mutations.
 */

import type { AstNode, DocumentAST, MutatedDocument, MutationSite } from "./types.js";

/** Convert 0-based absolute offset → 1-based {line, column}. */
export function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(Math.max(0, offset), source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/** Replace a span [start, end) in source with `replacement`. */
export function replaceSpan(
  source: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

/** Build a MutatedDocument from a simple span replacement. */
export function applySpanMutation(
  ast: DocumentAST,
  site: MutationSite,
  start: number,
  end: number,
  replacement: string,
  originalOverride?: string,
): MutatedDocument {
  const original = originalOverride ?? ast.source.slice(start, end);
  const source = replaceSpan(ast.source, start, end, replacement);
  const { line, column } = offsetToLineCol(ast.source, start);
  return {
    source,
    original,
    mutated: replacement,
    site,
    faultLine: line,
    faultColumn: column,
    nodeType: site.node.type,
  };
}

/** Walk the AST depth-first, invoking visitor on every node. */
export function walkAst(node: AstNode, visitor: (n: AstNode) => void): void {
  visitor(node);
  for (const child of node.children) walkAst(child, visitor);
}

/** Collect all nodes of a given type. */
export function collectNodes(ast: DocumentAST, type: AstNode["type"] | AstNode["type"][]): AstNode[] {
  const types = Array.isArray(type) ? new Set(type) : new Set([type]);
  const out: AstNode[] = [];
  walkAst(ast.root, (n) => {
    if (types.has(n.type)) out.push(n);
  });
  return out;
}

/** Collect nodes matching a predicate. */
export function filterNodes(ast: DocumentAST, pred: (n: AstNode) => boolean): AstNode[] {
  const out: AstNode[] = [];
  walkAst(ast.root, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
}

/**
 * Build a boolean mask of "active" source positions (not inside line comments).
 * For LaTeX: `%` starts a comment until EOL (unless escaped as `\%`).
 * For Typst: `//` line comments and slash-star block comments.
 * For Markdown: HTML comments only (code/math handled by parser).
 */
export function activeMask(source: string, format: "latex" | "typst" | "markdown"): boolean[] {
  const mask = new Array<boolean>(source.length).fill(true);
  if (format === "latex") {
    let i = 0;
    while (i < source.length) {
      if (source[i] === "\\" && i + 1 < source.length) {
        // Escaped char is active; skip next.
        i += 2;
        continue;
      }
      if (source[i] === "%") {
        while (i < source.length && source[i] !== "\n") {
          mask[i] = false;
          i++;
        }
        continue;
      }
      i++;
    }
    return mask;
  }
  if (format === "typst") {
    let i = 0;
    while (i < source.length) {
      if (source[i] === "/" && source[i + 1] === "/") {
        while (i < source.length && source[i] !== "\n") {
          mask[i] = false;
          i++;
        }
        continue;
      }
      if (source[i] === "/" && source[i + 1] === "*") {
        mask[i] = false;
        mask[i + 1] = false;
        i += 2;
        while (i < source.length) {
          mask[i] = false;
          if (source[i] === "*" && source[i + 1] === "/") {
            mask[i + 1] = false;
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
      // Strings: skip content for comment detection only (still active for mutations elsewhere)
      if (source[i] === '"') {
        i++;
        while (i < source.length) {
          if (source[i] === "\\" && i + 1 < source.length) {
            i += 2;
            continue;
          }
          if (source[i] === '"') {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      i++;
    }
    return mask;
  }
  // Markdown: HTML comments
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      const stop = end < 0 ? source.length : end + 3;
      for (let j = i; j < stop; j++) mask[j] = false;
      i = stop;
      continue;
    }
    i++;
  }
  return mask;
}

/** True if the entire [start, end) span is active (not commented). */
export function isActiveSpan(mask: boolean[], start: number, end: number): boolean {
  for (let i = start; i < end && i < mask.length; i++) {
    if (!mask[i]) return false;
  }
  return true;
}

/** Create a leaf text node. */
export function textNode(
  source: string,
  start: number,
  end: number,
  type: AstNode["type"] = "text",
  extra?: Partial<AstNode>,
): AstNode {
  const { line, column } = offsetToLineCol(source, start);
  return {
    type,
    start,
    end,
    line,
    column,
    text: source.slice(start, end),
    children: [],
    ...extra,
  };
}

/** Normalize newlines to \n. */
export function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

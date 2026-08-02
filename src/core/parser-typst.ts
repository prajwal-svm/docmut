/**
 * Lightweight Typst AST parser for DocMut.
 *
 * Identifies:
 * - #import statements
 * - function calls #name(...) / name(...)
 * - #set / #show rules
 * - math mode $…$
 * - content blocks […]
 * - string literals "…"
 * - headings (=, ==, …)
 * - list items (- / +)
 * - labels <label> and refs @label
 */

import type { AstNode, DocumentAST } from "./types.js";
import {
  activeMask,
  isActiveSpan,
  normalizeNewlines,
  offsetToLineCol,
} from "./source-utils.js";
import { sha256 } from "./prng.js";

function makeNode(
  source: string,
  type: AstNode["type"],
  start: number,
  end: number,
  extra: Partial<AstNode> = {},
): AstNode {
  const { line, column } = offsetToLineCol(source, start);
  return { type, start, end, line, column, children: [], ...extra };
}

function matchAllActive(
  source: string,
  mask: boolean[],
  re: RegExp,
): Array<RegExpExecArray & { index: number }> {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const r = new RegExp(re.source, flags);
  const out: Array<RegExpExecArray & { index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = r.exec(source)) !== null) {
    if (isActiveSpan(mask, m.index, m.index + Math.max(m[0].length, 1))) {
      out.push(m as RegExpExecArray & { index: number });
    }
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
}

/** Find matching closer with nest depth, skipping strings. */
function findBalanced(
  source: string,
  openIdx: number,
  openCh: string,
  closeCh: string,
  mask: boolean[],
): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (!mask[i]) continue;
    const ch = source[i]!;
    if (ch === '"') {
      i++;
      while (i < source.length) {
        if (source[i] === "\\" && i + 1 < source.length) {
          i += 2;
          continue;
        }
        if (source[i] === '"') break;
        i++;
      }
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseTypst(sourceRaw: string, path?: string): DocumentAST {
  const source = normalizeNewlines(sourceRaw);
  const mask = activeMask(source, "typst");
  const children: AstNode[] = [];

  // #import
  for (const m of matchAllActive(
    source,
    mask,
    /#import\s+[^\n;]+/g,
  )) {
    children.push(
      makeNode(source, "import", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[0].replace(/^#import\s+/, "").trim(),
      }),
    );
  }

  // #set rules
  for (const m of matchAllActive(source, mask, /#set\s+[a-zA-Z._-]+(?:\s*\([^)]*\))?/g)) {
    children.push(
      makeNode(source, "set_rule", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[0].match(/#set\s+([a-zA-Z._-]+)/)?.[1] ?? "",
      }),
    );
  }

  // #show rules (simplified)
  for (const m of matchAllActive(source, mask, /#show\b[^\n]*/g)) {
    children.push(
      makeNode(source, "show_rule", m.index, m.index + m[0].length, {
        text: m[0],
      }),
    );
  }

  // Headings: lines starting with = (one or more)
  for (const m of matchAllActive(source, mask, /^(=+)\s+.+$/gm)) {
    const level = (m[1] ?? "=").length;
    children.push(
      makeNode(source, "heading", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[0].replace(/^=+\s*/, "").trim(),
        attrs: { level },
      }),
    );
  }

  // List items: lines starting with - or + (or numbered)
  for (const m of matchAllActive(source, mask, /^[ \t]*([-+]|\d+\.)\s+\S.*$/gm)) {
    children.push(
      makeNode(source, "list_item", m.index, m.index + m[0].length, {
        text: m[0],
        attrs: { marker: m[1] ?? "-" },
      }),
    );
  }

  // Labels <name> and refs @name
  for (const m of matchAllActive(source, mask, /<([a-zA-Z_][\w-]*)>/g)) {
    children.push(
      makeNode(source, "label_typst", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[1],
      }),
    );
  }
  for (const m of matchAllActive(source, mask, /@([a-zA-Z_][\w-]*)/g)) {
    children.push(
      makeNode(source, "ref_typst", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[1],
      }),
    );
  }

  // String literals
  for (const m of matchAllActive(source, mask, /"(?:\\.|[^"\\])*"/g)) {
    children.push(
      makeNode(source, "string", m.index, m.index + m[0].length, {
        text: m[0],
      }),
    );
  }

  // Math $…$ (non-greedy, single-line-ish; allow multi-line)
  for (const m of matchAllActive(source, mask, /\$(?!\$)(?:\\\$|[^$])+?\$/g)) {
    children.push(
      makeNode(source, "math_inline", m.index, m.index + m[0].length, {
        text: m[0],
        attrs: { delimiter: "$" },
      }),
    );
  }

  // Content blocks […] — balanced brackets not already part of other nodes
  // Scan for [ that starts a content block (after =, :, or whitespace / start of expr)
  for (let i = 0; i < source.length; i++) {
    if (!mask[i] || source[i] !== "[") continue;
    // Skip if this looks like a label <x> already handled or array index after identifier? Keep simple.
    const close = findBalanced(source, i, "[", "]", mask);
    if (close < 0) continue;
    // Avoid capturing huge almost-file blocks unless short-ish or clearly content
    const len = close - i + 1;
    if (len < 2) continue;
    if (len > 4000) continue; // skip enormous blocks as primary mutation targets
    // Prefer blocks that look like content (contain text/markup)
    children.push(
      makeNode(source, "content_block", i, close + 1, {
        text: source.slice(i, close + 1),
        attrs: { open: i, close },
      }),
    );
    // Don't re-scan inside; jump ahead would miss nested — allow nested via stack
  }

  // Function calls: #ident( or ident(
  for (const m of matchAllActive(source, mask, /#?([a-zA-Z_][\w.-]*)\s*\(/g)) {
    const openParen = m.index + m[0].length - 1;
    const close = findBalanced(source, openParen, "(", ")", mask);
    if (close < 0) {
      // unclosed — still a site for FuncUnclosed
      children.push(
        makeNode(source, "function_call", m.index, m.index + m[0].length, {
          name: m[1],
          text: m[0],
          attrs: { unclosed: true, openParen },
        }),
      );
      continue;
    }
    children.push(
      makeNode(source, "function_call", m.index, close + 1, {
        name: m[1],
        text: source.slice(m.index, close + 1),
        attrs: { openParen, closeParen: close },
      }),
    );
  }

  // Dictionary key: key: value patterns inside () of function calls — simple line-level
  for (const m of matchAllActive(source, mask, /\b([a-zA-Z_][\w-]*)\s*:\s*/g)) {
    children.push(
      makeNode(source, "dict_entry", m.index, m.index + m[0].length, {
        name: m[1],
        text: m[0],
      }),
    );
  }

  // Variables: #let name = …
  for (const m of matchAllActive(source, mask, /#let\s+([a-zA-Z_][\w-]*)\s*=/g)) {
    children.push(
      makeNode(source, "variable", m.index, m.index + m[0].length, {
        name: m[1],
        text: m[0],
      }),
    );
  }

  children.sort((a, b) => a.start - b.start || b.end - a.end);
  const root = makeNode(source, "root", 0, source.length, { children });
  return {
    format: "typst",
    source,
    root,
    sha256: sha256(source),
    path,
  };
}

/**
 * Lightweight LaTeX AST parser for DocMut.
 *
 * Identifies:
 * - preamble vs body (\documentclass … \begin{document} … \end{document})
 * - environments (\begin{…} … \end{…})
 * - commands (\command{args}, optional [opts])
 * - math modes ($…$, $$…$$, \[…\], \(…\))
 * - brace groups {…}
 * - labels, refs, items, sectioning, usepackage, documentclass
 *
 * This is intentionally not a full TeX expansion engine. It is a surface
 * structural parse sufficient for context-aware mutation sites, matching
 * the operational philosophy of latex-structure.mjs in the TeXFix-Bench harness.
 */

import type { AstNode, DocumentAST } from "./types.js";
import {
  activeMask,
  isActiveSpan,
  normalizeNewlines,
  offsetToLineCol,
  textNode,
} from "./source-utils.js";
import { sha256 } from "./prng.js";

const SECTIONING = new Set([
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
]);

const REF_CMDS = new Set(["ref", "eqref", "pageref", "autoref", "cref", "Cref", "vref", "Vref"]);
const LABEL_CMDS = new Set(["label"]);

function makeNode(
  source: string,
  type: AstNode["type"],
  start: number,
  end: number,
  extra: Partial<AstNode> = {},
): AstNode {
  const { line, column } = offsetToLineCol(source, start);
  return {
    type,
    start,
    end,
    line,
    column,
    children: [],
    ...extra,
  };
}

/**
 * Scan source for top-level structural nodes.
 * Uses a single pass with active-mask awareness.
 */
export function parseLatex(sourceRaw: string, path?: string): DocumentAST {
  const source = normalizeNewlines(sourceRaw);
  const mask = activeMask(source, "latex");
  const children: AstNode[] = [];

  // documentclass
  for (const m of matchAllActive(source, mask, /\\documentclass\b(?:\s*\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
    children.push(
      makeNode(source, "documentclass", m.index, m.index + m[0].length, {
        name: m[1]?.trim() ?? "",
        text: m[0],
        attrs: { raw: m[0] },
      }),
    );
  }

  // usepackage / RequirePackage
  for (const m of matchAllActive(
    source,
    mask,
    /\\(?:usepackage|RequirePackage)\b(?:\s*\[[^\]]*\])?\s*\{([^}]*)\}/g,
  )) {
    const pkgs = (m[1] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    children.push(
      makeNode(source, "usepackage", m.index, m.index + m[0].length, {
        name: pkgs[0] ?? "",
        text: m[0],
        attrs: { packages: pkgs, raw: m[0] },
      }),
    );
  }

  // environments: begin / end pairs (stack-based)
  const beginRe = /\\begin\s*\{([a-zA-Z*@]+)\}/g;
  const endRe = /\\end\s*\{([a-zA-Z*@]+)\}/g;
  type EnvTok = { kind: "begin" | "end"; name: string; index: number; length: number };
  const envToks: EnvTok[] = [];
  for (const m of matchAllActive(source, mask, beginRe)) {
    envToks.push({ kind: "begin", name: m[1]!, index: m.index, length: m[0].length });
  }
  for (const m of matchAllActive(source, mask, endRe)) {
    envToks.push({ kind: "end", name: m[1]!, index: m.index, length: m[0].length });
  }
  envToks.sort((a, b) => a.index - b.index);

  const stack: EnvTok[] = [];
  for (const tok of envToks) {
    if (tok.kind === "begin") {
      stack.push(tok);
      children.push(
        makeNode(source, "begin_env", tok.index, tok.index + tok.length, {
          name: tok.name,
          text: source.slice(tok.index, tok.index + tok.length),
        }),
      );
    } else {
      // match with nearest same-name begin if possible
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.name === tok.name) {
          matchIdx = i;
          break;
        }
      }
      const beginTok = matchIdx >= 0 ? stack.splice(matchIdx, 1)[0] : undefined;
      children.push(
        makeNode(source, "end_env", tok.index, tok.index + tok.length, {
          name: tok.name,
          text: source.slice(tok.index, tok.index + tok.length),
          attrs: beginTok
            ? { beginStart: beginTok.index, beginEnd: beginTok.index + beginTok.length }
            : undefined,
        }),
      );
      if (beginTok) {
        children.push(
          makeNode(source, "environment", beginTok.index, tok.index + tok.length, {
            name: tok.name,
            attrs: {
              beginStart: beginTok.index,
              beginEnd: beginTok.index + beginTok.length,
              endStart: tok.index,
              endEnd: tok.index + tok.length,
            },
          }),
        );
      }
    }
  }

  // math: $$…$$, $…$, \[…\], \(…\)
  // Process display first to avoid $ collisions.
  for (const m of matchAllActive(source, mask, /(?<!\\)\$\$(?:\\.|[^\\$])*?(?<!\\)\$\$/g)) {
    children.push(
      makeNode(source, "math_display", m.index, m.index + m[0].length, {
        text: m[0],
        attrs: { delimiter: "$$" },
      }),
    );
  }
  for (const m of matchAllActive(source, mask, /\\\[(?:\\.|[^\\])*?\\\]/g)) {
    children.push(
      makeNode(source, "math_display", m.index, m.index + m[0].length, {
        text: m[0],
        attrs: { delimiter: "\\[\\]" },
      }),
    );
  }
  for (const m of matchAllActive(source, mask, /\\\((?:\\.|[^\\])*?\\\)/g)) {
    children.push(
      makeNode(source, "math_inline", m.index, m.index + m[0].length, {
        text: m[0],
        attrs: { delimiter: "\\(\\)" },
      }),
    );
  }
  // Inline $…$ — skip positions already covered by display $$
  const covered = children
    .filter((c) => c.type === "math_display" || c.type === "math_inline")
    .map((c) => [c.start, c.end] as const);
  for (const m of matchAllActive(source, mask, /(?<!\\)\$(?!\$)(?:\\.|[^\\$])*?(?<!\\)\$/g)) {
    if (covered.some(([s, e]) => m.index >= s && m.index < e)) continue;
    children.push(
      makeNode(source, "math_inline", m.index, m.index + m[0].length, {
        text: m[0],
        attrs: { delimiter: "$" },
      }),
    );
  }

  // brace groups: matched {…} not part of \begin/\end names already handled
  // Collect individual } and { at nested scopes for structural operators
  const braceDepth: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (!mask[i]) continue;
    if (source[i] === "\\" && i + 1 < source.length) {
      i++; // skip escaped
      continue;
    }
    if (source[i] === "{") {
      braceDepth.push(i);
    } else if (source[i] === "}") {
      const open = braceDepth.pop();
      if (open !== undefined) {
        // Skip trivial single-token env name braces like \begin{foo}
        const before = source.slice(Math.max(0, open - 12), open);
        if (/\\(?:begin|end)\s*$/.test(before)) continue;
        children.push(
          makeNode(source, "group", open, i + 1, {
            text: source.slice(open, i + 1),
            attrs: { open, close: i },
          }),
        );
        children.push(
          makeNode(source, "brace_close", i, i + 1, {
            text: "}",
            attrs: { open, depth: braceDepth.length },
          }),
        );
        children.push(
          makeNode(source, "brace_open", open, open + 1, {
            text: "{",
            attrs: { close: i, depth: braceDepth.length },
          }),
        );
      }
    }
  }

  // Commands of interest: sectioning, label, ref, item, font, math ops, frac, etc.
  const cmdRe = /\\([a-zA-Z@]+\*?)\b/g;
  for (const m of matchAllActive(source, mask, cmdRe)) {
    const name = m[1]!;
    const start = m.index;
    const cmdEnd = start + m[0].length;
    // Skip begin/end/documentclass/usepackage — already covered
    if (
      name === "begin" ||
      name === "end" ||
      name === "documentclass" ||
      name === "usepackage" ||
      name === "RequirePackage"
    ) {
      continue;
    }

    // Collect following optional + required args
    let i = cmdEnd;
    while (i < source.length && /\s/.test(source[i]!)) i++;
    const args: string[] = [];
    const argSpans: Array<{ start: number; end: number; optional: boolean }> = [];
    while (i < source.length) {
      if (source[i] === "[") {
        const close = findMatching(source, i, "[", "]", mask);
        if (close < 0) break;
        args.push(source.slice(i + 1, close));
        argSpans.push({ start: i, end: close + 1, optional: true });
        i = close + 1;
        while (i < source.length && /\s/.test(source[i]!)) i++;
        continue;
      }
      if (source[i] === "{") {
        const close = findMatching(source, i, "{", "}", mask);
        if (close < 0) break;
        args.push(source.slice(i + 1, close));
        argSpans.push({ start: i, end: close + 1, optional: false });
        i = close + 1;
        while (i < source.length && /\s/.test(source[i]!)) i++;
        // Keep consuming consecutive required args (e.g. \frac{a}{b})
        continue;
      }
      break;
    }
    const end = argSpans.length ? argSpans[argSpans.length - 1]!.end : cmdEnd;

    let type: AstNode["type"] = "command";
    if (SECTIONING.has(name.replace(/\*$/, ""))) type = "sectioning";
    else if (LABEL_CMDS.has(name)) type = "label";
    else if (REF_CMDS.has(name)) type = "ref";
    else if (name === "item") type = "item";
    else if (name === "cite" || name === "citep" || name === "citet") type = "ref";

    children.push(
      makeNode(source, type, start, end, {
        name,
        text: source.slice(start, end),
        attrs: {
          args,
          argSpans: argSpans.map((s) => `${s.start}:${s.end}:${s.optional ? "o" : "r"}`),
          cmdEnd,
        },
      }),
    );
  }

  // preamble / body markers
  const docBegin = children.find((c) => c.type === "begin_env" && c.name === "document");
  const docEnd = children.find((c) => c.type === "end_env" && c.name === "document");
  if (docBegin) {
    children.push(
      makeNode(source, "preamble", 0, docBegin.start, {
        text: source.slice(0, docBegin.start),
      }),
    );
  }
  if (docBegin && docEnd) {
    children.push(
      makeNode(source, "body", docBegin.end, docEnd.start, {
        text: source.slice(docBegin.end, docEnd.start),
      }),
    );
  }

  // Sort by start, then longer first for stable walk
  children.sort((a, b) => a.start - b.start || b.end - a.end);

  const root = makeNode(source, "root", 0, source.length, { children });
  return {
    format: "latex",
    source,
    root,
    sha256: sha256(source),
    path,
  };
}

/** Regex matchAll that only keeps matches fully on active (non-comment) spans. */
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
    if (isActiveSpan(mask, m.index, m.index + m[0].length)) {
      out.push(m as RegExpExecArray & { index: number });
    }
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
}

/** Find matching closer for open bracket, respecting escapes and active mask. */
function findMatching(
  source: string,
  openIdx: number,
  openCh: string,
  closeCh: string,
  mask: boolean[],
): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (!mask[i]) continue;
    if (source[i] === "\\" && i + 1 < source.length) {
      i++;
      continue;
    }
    if (source[i] === openCh) depth++;
    else if (source[i] === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export { matchAllActive, findMatching };

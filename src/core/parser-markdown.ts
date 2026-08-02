/**
 * Lightweight Markdown AST parser for DocMut.
 *
 * Uses a custom surface parser (no heavy unified dependency) so DocMut stays
 * zero-runtime-deps. Identifies:
 * - ATX headings
 * - links [text](url) and images ![alt](url)
 * - fenced code blocks ```
 * - display math $$…$$
 * - tables (| … |)
 * - YAML frontmatter ---
 * - inline HTML tags
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

export function parseMarkdown(sourceRaw: string, path?: string): DocumentAST {
  const source = normalizeNewlines(sourceRaw);
  const mask = activeMask(source, "markdown");
  const children: AstNode[] = [];

  // YAML frontmatter at start
  if (source.startsWith("---")) {
    const end = source.indexOf("\n---", 3);
    if (end >= 0) {
      const closeEnd = end + 4; // \n---
      children.push(
        makeNode(source, "md_yaml_frontmatter", 0, closeEnd, {
          text: source.slice(0, closeEnd),
        }),
      );
    } else {
      children.push(
        makeNode(source, "md_yaml_frontmatter", 0, Math.min(source.length, 3), {
          text: source.slice(0, 3),
          attrs: { unclosed: true },
        }),
      );
    }
  }

  // Fenced code blocks
  for (const m of matchAllActive(source, mask, /^ {0,3}(```|~~~)([^\n]*)\n[\s\S]*?^ {0,3}\1\s*$/gm)) {
    children.push(
      makeNode(source, "md_code_fence", m.index, m.index + m[0].length, {
        text: m[0],
        name: (m[2] ?? "").trim(),
        attrs: { fence: m[1] },
      }),
    );
  }
  // Unclosed fence openers (for mutation sites that remove closer)
  for (const m of matchAllActive(source, mask, /^ {0,3}(```|~~~)([^\n]*)$/gm)) {
    const already = children.some(
      (c) => c.type === "md_code_fence" && m.index >= c.start && m.index < c.end,
    );
    if (already) continue;
    children.push(
      makeNode(source, "md_code_fence", m.index, m.index + m[0].length, {
        text: m[0],
        name: (m[2] ?? "").trim(),
        attrs: { fence: m[1], openerOnly: true },
      }),
    );
  }

  // Display math $$…$$
  for (const m of matchAllActive(source, mask, /\$\$[\s\S]+?\$\$/g)) {
    children.push(
      makeNode(source, "md_math_block", m.index, m.index + m[0].length, {
        text: m[0],
      }),
    );
  }

  // Headings
  for (const m of matchAllActive(source, mask, /^(#{1,6})\s+.+$/gm)) {
    children.push(
      makeNode(source, "md_heading", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[0].replace(/^#+\s*/, "").trim(),
        attrs: { level: (m[1] ?? "#").length },
      }),
    );
  }

  // Images ![alt](url)
  for (const m of matchAllActive(source, mask, /!\[([^\]]*)\]\(([^)]+)\)/g)) {
    children.push(
      makeNode(source, "md_image", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[1] ?? "",
        attrs: { url: m[2] ?? "", alt: m[1] ?? "" },
      }),
    );
  }

  // Links [text](url) — not images
  for (const m of matchAllActive(source, mask, /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
    children.push(
      makeNode(source, "md_link", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[1] ?? "",
        attrs: { url: m[2] ?? "" },
      }),
    );
  }

  // Tables: consecutive lines with |
  {
    const lines = source.split("\n");
    let offset = 0;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      if (line.includes("|") && line.trim().startsWith("|")) {
        const start = offset;
        let j = i;
        let end = offset;
        while (j < lines.length && lines[j]!.includes("|")) {
          end += lines[j]!.length;
          if (j < lines.length - 1) end += 1; // newline
          j++;
        }
        // last line of table shouldn't include trailing newline beyond content
        // Recompute end from start line lengths
        end = start;
        for (let k = i; k < j; k++) {
          end += lines[k]!.length;
          if (k < j - 1) end += 1;
        }
        children.push(
          makeNode(source, "md_table", start, end, {
            text: source.slice(start, end),
            attrs: { rows: j - i },
          }),
        );
        // advance offset for skipped lines
        for (let k = i; k < j; k++) {
          offset += lines[k]!.length + (k < lines.length - 1 ? 1 : 0);
        }
        i = j;
        continue;
      }
      offset += line.length + (i < lines.length - 1 ? 1 : 0);
      i++;
    }
  }

  // Inline HTML tags
  for (const m of matchAllActive(source, mask, /<\/?[a-zA-Z][^>]*>/g)) {
    children.push(
      makeNode(source, "md_html", m.index, m.index + m[0].length, {
        text: m[0],
        name: m[0].match(/<\/?([a-zA-Z][\w-]*)/)?.[1] ?? "",
      }),
    );
  }

  children.sort((a, b) => a.start - b.start || b.end - a.end);
  const root = makeNode(source, "root", 0, source.length, { children });
  return {
    format: "markdown",
    source,
    root,
    sha256: sha256(source),
    path,
  };
}

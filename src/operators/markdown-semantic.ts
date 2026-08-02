/**
 * Markdown Tier 2 — Semantic operators (2).
 * MD-HDR-MLF, MD-TBL-MLF
 */

import type { MutationOperator } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";

/** MD-HDR-MLF: Wrong header level sequence (e.g. # → ### skipping ##). */
export const headerMalformed: MutationOperator = {
  name: "HeaderMalformed",
  code: "MD-HDR-MLF",
  track: "soft",
  tier: 2,
  formats: ["markdown"],
  scope: "heading",
  rationale: "Skipping heading levels breaks document outline structure.",
  findMutationSites(ast) {
    return collectNodes(ast, "md_heading")
      .filter((n) => {
        const level = Number(n.attrs?.level ?? 1);
        return level >= 1 && level <= 4;
      })
      .map((n) =>
        site("MD-HDR-MLF", n, `malform heading level ${n.attrs?.level}`, {
          level: n.attrs?.level,
        }),
      );
  },
  apply(ast, s) {
    const level = Number(s.data?.level ?? s.node.attrs?.level ?? 1);
    const newLevel = Math.min(6, level + 2); // skip one level
    const text = ast.source.slice(s.node.start, s.node.end);
    const m = text.match(/^(#{1,6})(\s+)/);
    if (!m) return null;
    const mutated = "#".repeat(newLevel) + m[2] + text.slice(m[0].length);
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
  },
};

/** MD-TBL-MLF: Break table pipe alignment or separator row. */
export const tableMalformed: MutationOperator = {
  name: "TableMalformed",
  code: "MD-TBL-MLF",
  track: "soft",
  tier: 2,
  formats: ["markdown"],
  scope: "table",
  rationale: "Broken table separator rows cause markdown table render failures.",
  findMutationSites(ast) {
    return collectNodes(ast, "md_table").map((n) =>
      site("MD-TBL-MLF", n, `malform table at ${n.line}`),
    );
  },
  apply(ast, s) {
    const text = ast.source.slice(s.node.start, s.node.end);
    const lines = text.split("\n");
    // Find separator row (|---|---|)
    const sepIdx = lines.findIndex((l) => /^\s*\|?[\s:-]+\|/.test(l) && /-/.test(l));
    if (sepIdx >= 0) {
      // Break separator: remove dashes
      lines[sepIdx] = lines[sepIdx]!.replace(/-+/g, "");
      const mutated = lines.join("\n");
      return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
    }
    // Otherwise drop a pipe from the first row
    if (lines[0] && lines[0].includes("|")) {
      lines[0] = lines[0].replace("|", "");
      const mutated = lines.join("\n");
      return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
    }
    return null;
  },
};

export const markdownSemanticOperators: MutationOperator[] = [
  headerMalformed,
  tableMalformed,
];

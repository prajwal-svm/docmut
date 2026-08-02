/**
 * Markdown Tier 1 — Structural operators (4).
 * MD-LNK-BRK, MD-CDE-UNC, MD-MTH-UNC, MD-YML-BRK
 */

import type { MutationOperator } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";

/** MD-LNK-BRK: Break markdown link — missing closing `)`. */
export const linkBroken: MutationOperator = {
  name: "LinkBroken",
  code: "MD-LNK-BRK",
  track: "soft",
  tier: 1,
  formats: ["markdown"],
  scope: "link",
  rationale: "Unclosed markdown links are a common authoring typo.",
  findMutationSites(ast) {
    return collectNodes(ast, "md_link")
      .filter((n) => n.text?.endsWith(")"))
      .map((n) => site("MD-LNK-BRK", n, `break link ${n.name}`));
  },
  apply(ast, s) {
    const end = s.node.end;
    if (ast.source[end - 1] !== ")") return null;
    return applySpanMutation(ast, s, end - 1, end, "");
  },
};

/** MD-CDE-UNC: Remove closing fence of code block. */
export const codeFenceUnclosed: MutationOperator = {
  name: "CodeFenceUnclosed",
  code: "MD-CDE-UNC",
  track: "soft",
  tier: 1,
  formats: ["markdown"],
  scope: "code",
  rationale: "Forgetting to close a fenced code block swallows subsequent content.",
  findMutationSites(ast) {
    return collectNodes(ast, "md_code_fence")
      .filter((n) => !n.attrs?.openerOnly)
      .map((n) => {
        const fence = String(n.attrs?.fence ?? "```");
        return site("MD-CDE-UNC", n, `unclose code fence`, { fence });
      });
  },
  apply(ast, s) {
    const fence = String(s.data?.fence ?? "```");
    const text = ast.source.slice(s.node.start, s.node.end);
    // Find last fence line
    const lastIdx = text.lastIndexOf(fence);
    if (lastIdx <= 0) return null;
    // Remove from last fence to end of node (the closing fence line)
    let removeStart = s.node.start + lastIdx;
    // include leading newline if present
    if (removeStart > s.node.start && ast.source[removeStart - 1] === "\n") {
      removeStart--;
    }
    const original = ast.source.slice(removeStart, s.node.end);
    return applySpanMutation(ast, s, removeStart, s.node.end, "", original);
  },
};

/** MD-MTH-UNC: Remove closing `$$` of math block. */
export const mathBlockUnclosed: MutationOperator = {
  name: "MathBlockUnclosed",
  code: "MD-MTH-UNC",
  track: "soft",
  tier: 1,
  formats: ["markdown"],
  scope: "math",
  rationale: "Unclosed display-math $$ breaks pandoc and many MD processors.",
  findMutationSites(ast) {
    return collectNodes(ast, "md_math_block")
      .filter((n) => n.text?.endsWith("$$"))
      .map((n) => site("MD-MTH-UNC", n, `unclose math block at ${n.line}`));
  },
  apply(ast, s) {
    const end = s.node.end;
    if (ast.source.slice(end - 2, end) !== "$$") return null;
    return applySpanMutation(ast, s, end - 2, end, "");
  },
};

/** MD-YML-BRK: Break YAML frontmatter delimiter or syntax. */
export const yamlFrontmatterBroken: MutationOperator = {
  name: "YAMLFrontmatterBroken",
  code: "MD-YML-BRK",
  track: "soft",
  tier: 1,
  formats: ["markdown"],
  scope: "yaml",
  rationale: "Broken YAML frontmatter delimiters confuse static site generators.",
  findMutationSites(ast) {
    return collectNodes(ast, "md_yaml_frontmatter").map((n) =>
      site("MD-YML-BRK", n, "break YAML frontmatter"),
    );
  },
  apply(ast, s) {
    const text = ast.source.slice(s.node.start, s.node.end);
    // Break closing --- into --
    if (text.endsWith("---")) {
      const closeStart = s.node.end - 3;
      return applySpanMutation(ast, s, closeStart, s.node.end, "--", "---");
    }
    // Or break opening
    if (text.startsWith("---")) {
      return applySpanMutation(ast, s, s.node.start, s.node.start + 3, "--", "---");
    }
    return applySpanMutation(ast, s, s.node.start, s.node.start + 1, "", text[0] ?? "");
  },
};

export const markdownStructuralOperators: MutationOperator[] = [
  linkBroken,
  codeFenceUnclosed,
  mathBlockUnclosed,
  yamlFrontmatterBroken,
];

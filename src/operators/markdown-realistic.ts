/**
 * Markdown Tier 3 — Realistic operators (2).
 * MD-IMG-BRK, MD-HTML-UNC
 */

import type { MutationOperator } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";

/** MD-IMG-BRK: Reference non-existent image. */
export const imageBroken: MutationOperator = {
  name: "ImageBroken",
  code: "MD-IMG-BRK",
  track: "soft",
  tier: 3,
  formats: ["markdown"],
  scope: "link",
  rationale: "Referencing a missing image is a common documentation mistake.",
  findMutationSites(ast) {
    const images = collectNodes(ast, "md_image");
    if (images.length) {
      return images.map((n) =>
        site("MD-IMG-BRK", n, `break image ${n.attrs?.url}`, {
          url: n.attrs?.url,
        }),
      );
    }
    // Inject a broken image if none present
    return [
      site(
        "MD-IMG-BRK",
        {
          type: "text",
          start: 0,
          end: 0,
          line: 1,
          column: 1,
          children: [],
        },
        "inject broken image",
        { inject: true },
      ),
    ];
  },
  apply(ast, s) {
    if (s.data?.inject) {
      const injection = "\n![missing](docmut-missing-image-xyz.png)\n";
      return applySpanMutation(ast, s, 0, 0, injection, "");
    }
    const text = s.node.text ?? ast.source.slice(s.node.start, s.node.end);
    const mutated = text.replace(/\([^)]+\)/, "(docmut-missing-image-xyz.png)");
    if (mutated === text) return null;
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
  },
};

/** MD-HTML-UNC: Unclosed inline HTML tag (pandoc-flavored). */
export const htmlTagUnclosed: MutationOperator = {
  name: "HTMLTagUnclosed",
  code: "MD-HTML-UNC",
  track: "soft",
  tier: 3,
  formats: ["markdown"],
  scope: "html",
  rationale: "Unclosed HTML tags break pandoc and many Markdown renderers.",
  findMutationSites(ast) {
    const tags = collectNodes(ast, "md_html").filter(
      (n) => n.text && !n.text.startsWith("</") && !n.text.endsWith("/>"),
    );
    if (tags.length) {
      return tags.map((n) => site("MD-HTML-UNC", n, `unclose ${n.name}`));
    }
    return [
      site(
        "MD-HTML-UNC",
        {
          type: "text",
          start: 0,
          end: 0,
          line: 1,
          column: 1,
          children: [],
        },
        "inject unclosed HTML",
        { inject: true },
      ),
    ];
  },
  apply(ast, s) {
    if (s.data?.inject) {
      const injection = "\n<div class=\"docmut\">\nUnclosed div content\n";
      return applySpanMutation(ast, s, 0, 0, injection, "");
    }
    // Remove the matching closing tag later in the document, or strip `>` to break tag
    const name = s.node.name ?? "";
    if (name) {
      const closeTag = `</${name}>`;
      const closeIdx = ast.source.indexOf(closeTag, s.node.end);
      if (closeIdx >= 0) {
        return applySpanMutation(ast, s, closeIdx, closeIdx + closeTag.length, "", closeTag);
      }
    }
    // Fallback: remove closing `>` of the open tag
    const end = s.node.end;
    if (ast.source[end - 1] === ">") {
      return applySpanMutation(ast, s, end - 1, end, "");
    }
    return null;
  },
};

export const markdownRealisticOperators: MutationOperator[] = [
  imageBroken,
  htmlTagUnclosed,
];

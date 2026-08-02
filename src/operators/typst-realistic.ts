/**
 * Typst Tier 3 — Realistic operators (3).
 * TYP-PKG-DRP, TYP-FNT-CHG, TYP-PGE-SZE
 */

import type { MutationOperator } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";

/** TYP-PKG-DRP: Remove `#import` for a used package. */
export const packageDrop: MutationOperator = {
  name: "PackageDrop",
  code: "TYP-PKG-DRP",
  track: "hard",
  tier: 3,
  formats: ["typst"],
  scope: "package",
  rationale: "Removing a used package import breaks the document at compile time.",
  findMutationSites(ast) {
    return collectNodes(ast, "import")
      .filter((n) => /@preview\//.test(n.text ?? "") || /@local\//.test(n.text ?? ""))
      .map((n) => site("TYP-PKG-DRP", n, `drop package import`));
  },
  apply(ast, s) {
    let start = s.node.start;
    let end = s.node.end;
    while (end < ast.source.length && ast.source[end] !== "\n") end++;
    if (end < ast.source.length) end++;
    return applySpanMutation(ast, s, start, end, "", ast.source.slice(start, end));
  },
};

/** TYP-FNT-CHG: Change font to non-existent font. */
export const fontChange: MutationOperator = {
  name: "FontChange",
  code: "TYP-FNT-CHG",
  track: "soft",
  tier: 3,
  formats: ["typst"],
  scope: "font",
  rationale: "Setting a non-existent font is a common cross-platform Typst error.",
  findMutationSites(ast) {
    const sites = [];
    // Existing font settings
    for (const n of collectNodes(ast, "set_rule")) {
      if (/font\s*:/.test(n.text ?? "") || n.name === "text") {
        sites.push(site("TYP-FNT-CHG", n, "change to missing font", { kind: "set" }));
      }
    }
    // String that looks like a font name in set text
    const re = /#set\s+text\s*\([^)]*font:\s*("[^"]+")/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ast.source)) !== null) {
      const fontStart = m.index + m[0].indexOf(m[1]!);
      sites.push(
        site(
          "TYP-FNT-CHG",
          {
            type: "string",
            start: fontStart,
            end: fontStart + m[1]!.length,
            line: 1,
            column: 1,
            children: [],
            text: m[1],
          },
          `font ${m[1]}`,
          { kind: "literal", from: m[1] },
          { start: fontStart, end: fontStart + m[1]!.length },
        ),
      );
    }
    if (!sites.length) {
      // Inject a bad font set rule
      const anchor = collectNodes(ast, "import")[0] ?? {
        type: "text" as const,
        start: 0,
        end: 0,
        line: 1,
        column: 1,
        children: [] as never[],
      };
      sites.push(site("TYP-FNT-CHG", anchor, "inject missing font set", { kind: "inject" }));
    }
    return sites;
  },
  apply(ast, s) {
    if (s.data?.kind === "literal") {
      const from = String(s.data.from ?? "");
      const start = s.start ?? s.node.start;
      const end = s.end ?? s.node.end;
      return applySpanMutation(ast, s, start, end, '"DocMutMissingFont-XYZ"', from);
    }
    if (s.data?.kind === "inject") {
      const insertAt = s.node.end;
      const injection = '\n#set text(font: "DocMutMissingFont-XYZ")\n';
      return applySpanMutation(ast, s, insertAt, insertAt, injection, "");
    }
    // set rule: replace font value or append
    const text = s.node.text ?? ast.source.slice(s.node.start, s.node.end);
    let mutated: string;
    if (/font\s*:\s*"[^"]*"/.test(text)) {
      mutated = text.replace(/font\s*:\s*"[^"]*"/, 'font: "DocMutMissingFont-XYZ"');
    } else if (/\(/.test(text)) {
      mutated = text.replace(/\(/, '(font: "DocMutMissingFont-XYZ", ');
    } else {
      mutated = text + '(font: "DocMutMissingFont-XYZ")';
    }
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
  },
};

/** TYP-PGE-SZE: Set invalid page size. */
export const pageSizeChange: MutationOperator = {
  name: "PageSizeChange",
  code: "TYP-PGE-SZE",
  track: "hard",
  tier: 3,
  formats: ["typst"],
  scope: "structure",
  rationale: "Invalid page paper size causes Typst set-rule errors.",
  findMutationSites(ast) {
    const sites = collectNodes(ast, "set_rule")
      .filter((n) => n.name === "page" || /page/.test(n.text ?? ""))
      .map((n) => site("TYP-PGE-SZE", n, "invalid page size", { kind: "set" }));
    if (!sites.length) {
      sites.push(
        site(
          "TYP-PGE-SZE",
          {
            type: "text",
            start: 0,
            end: 0,
            line: 1,
            column: 1,
            children: [],
          },
          "inject invalid page size",
          { kind: "inject" },
        ),
      );
    }
    return sites;
  },
  apply(ast, s) {
    if (s.data?.kind === "inject") {
      return applySpanMutation(
        ast,
        s,
        0,
        0,
        '#set page(paper: "invalid-docmut-size")\n',
        "",
      );
    }
    const text = s.node.text ?? ast.source.slice(s.node.start, s.node.end);
    let mutated: string;
    if (/paper\s*:\s*"[^"]*"/.test(text)) {
      mutated = text.replace(/paper\s*:\s*"[^"]*"/, 'paper: "invalid-docmut-size"');
    } else if (/\(/.test(text)) {
      mutated = text.replace(/\(/, '(paper: "invalid-docmut-size", ');
    } else {
      mutated = '#set page(paper: "invalid-docmut-size")';
    }
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
  },
};

export const typstRealisticOperators: MutationOperator[] = [
  packageDrop,
  fontChange,
  pageSizeChange,
];

/**
 * Typst Tier 2 — Semantic operators (6).
 * TYP-VAR-UDF, TYP-TPE-WRG, TYP-SET-INV, TYP-DCT-DRP, TYP-HDG-ORP, TYP-REF-UDF
 */

import type { MutationOperator } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";
import { pick } from "../core/prng.js";

/** TYP-VAR-UDF: Reference undefined variable. */
export const varUndefined: MutationOperator = {
  name: "VarUndefined",
  code: "TYP-VAR-UDF",
  track: "hard",
  tier: 2,
  formats: ["typst"],
  scope: "structure",
  rationale: "Referencing an undefined variable is a common Typst authoring error.",
  findMutationSites(ast) {
    const vars = collectNodes(ast, "variable");
    // Can inject an undefined use after first variable or at document start
    const anchor = vars[0] ?? collectNodes(ast, "import")[0] ?? {
      type: "text" as const,
      start: 0,
      end: Math.min(10, ast.source.length),
      line: 1,
      column: 1,
      children: [] as never[],
    };
    return [site("TYP-VAR-UDF", anchor, "inject undefined variable use")];
  },
  apply(ast, s) {
    // Insert a use of a nonexistent variable near the top after imports
    let insertAt = 0;
    const imports = collectNodes(ast, "import");
    if (imports.length) {
      insertAt = imports[imports.length - 1]!.end;
      while (insertAt < ast.source.length && ast.source[insertAt] !== "\n") insertAt++;
      if (insertAt < ast.source.length) insertAt++;
    }
    const injection = "#docmut_undefined_var\n";
    return applySpanMutation(ast, s, insertAt, insertAt, injection, "");
  },
};

/** TYP-TPE-WRG: Pass wrong type to function argument. */
export const typeWrong: MutationOperator = {
  name: "TypeWrong",
  code: "TYP-TPE-WRG",
  track: "hard",
  tier: 2,
  formats: ["typst"],
  scope: "structure",
  rationale: "Passing the wrong type to a function argument fails Typst type checking.",
  findMutationSites(ast) {
    return collectNodes(ast, "function_call")
      .filter((n) => n.text && n.text.includes("(") && n.text.includes(")"))
      .map((n) => site("TYP-TPE-WRG", n, `wrong type in ${n.name}`));
  },
  apply(ast, s) {
    const text = s.node.text ?? ast.source.slice(s.node.start, s.node.end);
    // Replace a string arg with an integer or vice versa
    if (text.includes('"')) {
      const mutated = text.replace(/"[^"]*"/, "true");
      if (mutated === text) return null;
      return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
    }
    // Replace a number with a string
    const mutated = text.replace(/\b(\d+(?:\.\d+)?)\b/, '"$1"');
    if (mutated === text) {
      // Force a bad arg
      const open = text.indexOf("(");
      if (open < 0) return null;
      const forced = text.slice(0, open + 1) + "none + 1" + text.slice(open + 1);
      return applySpanMutation(ast, s, s.node.start, s.node.end, forced, text);
    }
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
  },
};

/** TYP-SET-INV: Break a `#set` rule (wrong value type). */
export const setRuleInvalid: MutationOperator = {
  name: "SetRuleInvalid",
  code: "TYP-SET-INV",
  track: "hard",
  tier: 2,
  formats: ["typst"],
  scope: "structure",
  rationale: "Invalid #set rule values are a frequent Typst configuration mistake.",
  findMutationSites(ast) {
    return collectNodes(ast, "set_rule").map((n) =>
      site("TYP-SET-INV", n, `invalidate ${n.text?.slice(0, 40)}`),
    );
  },
  apply(ast, s) {
    const text = s.node.text ?? ast.source.slice(s.node.start, s.node.end);
    // Break set rule: #set text(size: 11pt) → #set text(size: "big")
    let mutated = text;
    if (/\d+(?:pt|em|mm|cm)/.test(text)) {
      mutated = text.replace(/\d+(?:pt|em|mm|cm)/, '"invalid"');
    } else if (/true|false/.test(text)) {
      mutated = text.replace(/true|false/, "42");
    } else if (/\(/.test(text)) {
      mutated = text.replace(/\((.*)\)/, '(__docmut_invalid: true)');
    } else {
      mutated = text + '(paper: "not-a-size")';
    }
    if (mutated === text) return null;
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutated, text);
  },
};

/** TYP-DCT-DRP: Remove key from dictionary. */
export const dictKeyDrop: MutationOperator = {
  name: "DictKeyDrop",
  code: "TYP-DCT-DRP",
  track: "hard",
  tier: 2,
  formats: ["typst"],
  scope: "structure",
  rationale: "Dropping a required dictionary key breaks function calls.",
  findMutationSites(ast) {
    return collectNodes(ast, "dict_entry")
      .filter((n) => n.name && n.name.length > 1)
      .map((n) => site("TYP-DCT-DRP", n, `drop key ${n.name}`, { key: n.name }));
  },
  apply(ast, s) {
    // Remove "key: " and try to remove the value up to comma or close paren
    const start = s.node.start;
    let end = s.node.end;
    // consume value
    let depth = 0;
    while (end < ast.source.length) {
      const ch = ast.source[end]!;
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) break;
        depth--;
      } else if (ch === "," && depth === 0) {
        end++; // include comma
        break;
      } else if (ch === "\n" && depth === 0) {
        break;
      }
      end++;
      if (end - start > 200) break;
    }
    const original = ast.source.slice(start, end);
    return applySpanMutation(ast, s, start, end, "", original);
  },
};

/** TYP-HDG-ORP: Remove content under a heading. */
export const headingOrphan: MutationOperator = {
  name: "HeadingOrphan",
  code: "TYP-HDG-ORP",
  track: "soft",
  tier: 2,
  formats: ["typst"],
  scope: "heading",
  rationale: "Accidentally deleting section body leaves an orphan heading.",
  findMutationSites(ast) {
    const headings = collectNodes(ast, "heading");
    return headings.map((n, i) => {
      const next = headings[i + 1];
      return site("TYP-HDG-ORP", n, `orphan heading ${n.name}`, {
        contentStart: n.end,
        contentEnd: next?.start ?? Math.min(ast.source.length, n.end + 500),
      });
    });
  },
  apply(ast, s) {
    let start = Number(s.data?.contentStart ?? s.node.end);
    // skip trailing newline after heading
    if (ast.source[start] === "\n") start++;
    const end = Number(s.data?.contentEnd ?? start);
    if (end <= start) return null;
    const original = ast.source.slice(start, end);
    if (!original.trim()) return null;
    return applySpanMutation(ast, s, start, end, "\n", original);
  },
};

/** TYP-REF-UDF: Reference undefined label. */
export const refUndefined: MutationOperator = {
  name: "RefUndefined",
  code: "TYP-REF-UDF",
  track: "soft",
  tier: 2,
  formats: ["typst"],
  scope: "reference",
  rationale: "Referencing an undefined label produces Typst reference errors.",
  findMutationSites(ast) {
    const refs = collectNodes(ast, "ref_typst");
    if (refs.length) {
      return refs.map((n) =>
        site("TYP-REF-UDF", n, `@${n.name} → undefined`, { name: n.name }),
      );
    }
    // Inject a bad ref if labels exist
    const labels = collectNodes(ast, "label_typst");
    if (labels.length) {
      return [
        site("TYP-REF-UDF", labels[0]!, "inject @docmut-missing", { inject: true }),
      ];
    }
    return [
      site(
        "TYP-REF-UDF",
        {
          type: "text",
          start: 0,
          end: Math.min(1, ast.source.length),
          line: 1,
          column: 1,
          children: [],
        },
        "inject @docmut-missing",
        { inject: true },
      ),
    ];
  },
  apply(ast, s) {
    if (s.data?.inject) {
      const insertAt = Math.min(ast.source.length, s.node.end);
      return applySpanMutation(ast, s, insertAt, insertAt, " @docmut-missing-label ", "");
    }
    const name = String(s.data?.name ?? s.node.name ?? "");
    const start = s.node.start;
    const end = s.node.end;
    const original = ast.source.slice(start, end);
    return applySpanMutation(ast, s, start, end, "@docmut-missing-label", original);
  },
};

export const typstSemanticOperators: MutationOperator[] = [
  varUndefined,
  typeWrong,
  setRuleInvalid,
  dictKeyDrop,
  headingOrphan,
  refUndefined,
];

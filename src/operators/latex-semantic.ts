/**
 * LaTeX Tier 2 — Semantic operators (10).
 * TEX-MTH-REL, TEX-MTH-OPS, TEX-CMD-TRP, TEX-ENV-SWP, TEX-LBL-DUP,
 * TEX-REF-UDF, TEX-LVL-SFT, TEX-UNT-CHG, TEX-FNT-SWP, TEX-ARG-DRP
 */

import type { MutationOperator, MutationSite } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";
import { pick } from "../core/prng.js";


const RELATION_PAIRS: Array<[string, string]> = [
  ["\\leq", "\\geq"],
  ["\\geq", "\\leq"],
  ["\\le", "\\ge"],
  ["\\ge", "\\le"],
  ["\\leqslant", "\\geqslant"],
  ["\\geqslant", "\\leqslant"],
  ["\\subset", "\\supset"],
  ["\\supset", "\\subset"],
  ["\\subseteq", "\\supseteq"],
  ["\\supseteq", "\\subseteq"],
  ["\\in", "\\ni"],
  ["\\ll", "\\gg"],
  ["\\gg", "\\ll"],
  ["<", ">"],
  [">", "<"],
];

const OPERATOR_PAIRS: Array<[string, string]> = [
  ["\\cup", "\\cap"],
  ["\\cap", "\\cup"],
  ["\\sin", "\\cos"],
  ["\\cos", "\\sin"],
  ["\\sum", "\\prod"],
  ["\\prod", "\\sum"],
  ["\\max", "\\min"],
  ["\\min", "\\max"],
  ["\\sup", "\\inf"],
  ["\\inf", "\\sup"],
  ["\\arcsin", "\\arccos"],
  ["\\arctan", "\\arccot"],
  ["\\cdot", "\\times"],
  ["\\times", "\\cdot"],
  ["\\land", "\\lor"],
  ["\\lor", "\\land"],
];

const COMMAND_TYPOS: Array<[string, string]> = [
  ["\\begin", "\\begn"],
  ["\\frac", "\\frak"],
  ["\\textbf", "\\texbf"],
  ["\\section", "\\sectin"],
  ["\\emph", "\\empf"],
  ["\\cite", "\\cit"],
  ["\\caption", "\\captin"],
  ["\\label", "\\lable"],
  ["\\includegraphics", "\\includegrapics"],
  ["\\subsection", "\\subsecton"],
];

const ENV_SWAPS: Array<[string, string]> = [
  ["itemize", "enumerate"],
  ["enumerate", "itemize"],
  ["table", "tabular"],
  ["tabular", "table"],
  ["figure", "figure*"],
  ["figure*", "figure"],
  ["equation", "align"],
  ["align", "equation"],
  ["center", "flushleft"],
  ["flushleft", "center"],
];

const FONT_CMDS = ["textbf", "textit", "texttt", "emph", "textsc", "textsf"];

const LEVEL_MAP: Record<string, string> = {
  section: "subsection",
  subsection: "subsubsection",
  subsubsection: "paragraph",
  chapter: "section",
  part: "chapter",
  paragraph: "subparagraph",
};

function findAllOccurrences(
  source: string,
  needle: string,
  inRanges?: Array<{ start: number; end: number }>,
): number[] {
  const out: number[] = [];
  let from = 0;
  while (from < source.length) {
    const idx = source.indexOf(needle, from);
    if (idx < 0) break;
    if (!inRanges || inRanges.some((r) => idx >= r.start && idx < r.end)) {
      // Word-boundary-ish for backslash commands
      if (needle.startsWith("\\")) {
        const after = source[idx + needle.length];
        if (after && /[a-zA-Z]/.test(after)) {
          from = idx + 1;
          continue;
        }
      }
      out.push(idx);
    }
    from = idx + Math.max(needle.length, 1);
  }
  return out;
}

/** TEX-MTH-REL */
export const mathRelationSwap: MutationOperator = {
  name: "MathRelationSwap",
  code: "TEX-MTH-REL",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "math",
  rationale: "Authors confuse inequality direction in mathematical expressions.",
  findMutationSites(ast) {
    const mathRanges = collectNodes(ast, ["math_inline", "math_display", "environment"]).filter(
      (n) =>
        n.type !== "environment" ||
        ["equation", "align", "gather", "multline", "eqnarray", "flalign"].includes(n.name ?? ""),
    );
    const ranges = mathRanges.map((n) => ({ start: n.start, end: n.end }));
    // Also allow relations in whole body if inside $
    const sites: MutationSite[] = [];
    for (const [from, to] of RELATION_PAIRS) {
      for (const idx of findAllOccurrences(ast.source, from, ranges.length ? ranges : undefined)) {
        // Prefer math regions; if no ranges matched for multi-char, check $ context
        const node =
          mathRanges.find((n) => idx >= n.start && idx < n.end) ??
          ({
            type: "math_inline" as const,
            start: idx,
            end: idx + from.length,
            line: 1,
            column: 1,
            children: [],
            text: from,
          });
        sites.push(
          site(
            "TEX-MTH-REL",
            { ...node, start: idx, end: idx + from.length, text: from },
            `${from} → ${to}`,
            { from, to },
            { start: idx, end: idx + from.length },
          ),
        );
      }
    }
    // If no math nodes found, scan whole source for latex relation commands
    if (!sites.length) {
      for (const [from, to] of RELATION_PAIRS) {
        if (!from.startsWith("\\")) continue;
        for (const idx of findAllOccurrences(ast.source, from)) {
          sites.push(
            site(
              "TEX-MTH-REL",
              {
                type: "command",
                start: idx,
                end: idx + from.length,
                line: 1,
                column: 1,
                children: [],
                text: from,
              },
              `${from} → ${to}`,
              { from, to },
              { start: idx, end: idx + from.length },
            ),
          );
        }
      }
    }
    return sites;
  },
  apply(ast, s) {
    const from = String(s.data?.from ?? "");
    const to = String(s.data?.to ?? "");
    const start = s.start ?? s.node.start;
    const end = s.end ?? s.node.end;
    if (ast.source.slice(start, end) !== from) return null;
    return applySpanMutation(ast, s, start, end, to, from);
  },
};

/** TEX-MTH-OPS */
export const mathOperatorSwap: MutationOperator = {
  name: "MathOperatorSwap",
  code: "TEX-MTH-OPS",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "math",
  rationale: "Authors pick the wrong mathematical operator (cup/cap, sin/cos, sum/prod).",
  findMutationSites(ast) {
    const sites: MutationSite[] = [];
    for (const [from, to] of OPERATOR_PAIRS) {
      for (const idx of findAllOccurrences(ast.source, from)) {
        sites.push(
          site(
            "TEX-MTH-OPS",
            {
              type: "command",
              start: idx,
              end: idx + from.length,
              line: 1,
              column: 1,
              children: [],
              text: from,
            },
            `${from} → ${to}`,
            { from, to },
            { start: idx, end: idx + from.length },
          ),
        );
      }
    }
    return sites;
  },
  apply(ast, s) {
    const from = String(s.data?.from ?? "");
    const to = String(s.data?.to ?? "");
    const start = s.start ?? s.node.start;
    const end = s.end ?? s.node.end;
    if (ast.source.slice(start, end) !== from) return null;
    return applySpanMutation(ast, s, start, end, to, from);
  },
};

/** TEX-CMD-TRP */
export const commandTypo: MutationOperator = {
  name: "CommandTypo",
  code: "TEX-CMD-TRP",
  track: "hard",
  tier: 2,
  formats: ["latex"],
  scope: "structure",
  rationale: "Undefined control sequence from a realistic author typo.",
  findMutationSites(ast) {
    const sites: MutationSite[] = [];
    for (const [from, to] of COMMAND_TYPOS) {
      for (const idx of findAllOccurrences(ast.source, from)) {
        sites.push(
          site(
            "TEX-CMD-TRP",
            {
              type: "command",
              start: idx,
              end: idx + from.length,
              line: 1,
              column: 1,
              children: [],
              name: from.slice(1),
              text: from,
            },
            `${from} → ${to}`,
            { from, to },
            { start: idx, end: idx + from.length },
          ),
        );
      }
    }
    return sites;
  },
  apply(ast, s) {
    const from = String(s.data?.from ?? "");
    const to = String(s.data?.to ?? "");
    const start = s.start ?? s.node.start;
    const end = s.end ?? s.node.end;
    if (ast.source.slice(start, end) !== from) return null;
    return applySpanMutation(ast, s, start, end, to, from);
  },
};

/** TEX-ENV-SWP */
export const environmentSwap: MutationOperator = {
  name: "EnvironmentSwap",
  code: "TEX-ENV-SWP",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "structure",
  rationale: "Authors pick the wrong environment (itemize vs enumerate, table vs tabular).",
  findMutationSites(ast) {
    const sites: MutationSite[] = [];
    for (const env of collectNodes(ast, "environment")) {
      const name = env.name ?? "";
      const pair = ENV_SWAPS.find(([a]) => a === name);
      if (!pair) continue;
      sites.push(
        site("TEX-ENV-SWP", env, `${name} → ${pair[1]}`, {
          from: pair[0],
          to: pair[1],
          beginStart: env.attrs?.beginStart,
          beginEnd: env.attrs?.beginEnd,
          endStart: env.attrs?.endStart,
          endEnd: env.attrs?.endEnd,
        }),
      );
    }
    return sites;
  },
  apply(ast, s) {
    const from = String(s.data?.from ?? "");
    const to = String(s.data?.to ?? "");
    const beginStart = Number(s.data?.beginStart);
    const endStart = Number(s.data?.endStart);
    if (!from || !Number.isFinite(beginStart) || !Number.isFinite(endStart)) return null;
    // Replace name in \begin{from} and \end{from}
    let source = ast.source;
    const beginFrag = source.slice(beginStart, beginStart + 50);
    const beginRe = new RegExp(`\\\\begin\\s*\\{${escapeRe(from)}\\}`);
    const bm = beginFrag.match(beginRe);
    if (!bm) return null;
    const beginAbs = beginStart + (bm.index ?? 0);
    const beginOrig = bm[0];
    const beginNew = beginOrig.replace(from, to);

    // After first replacement, end offsets stay valid if we replace end first (later offset)
    const endFrag = source.slice(endStart, endStart + 50);
    const endRe = new RegExp(`\\\\end\\s*\\{${escapeRe(from)}\\}`);
    const em = endFrag.match(endRe);
    if (!em) return null;
    const endAbs = endStart + (em.index ?? 0);
    const endOrig = em[0];
    const endNew = endOrig.replace(from, to);

    // Replace end first to keep begin indices stable
    source = source.slice(0, endAbs) + endNew + source.slice(endAbs + endOrig.length);
    source = source.slice(0, beginAbs) + beginNew + source.slice(beginAbs + beginOrig.length);

    return {
      source,
      original: from,
      mutated: to,
      site: s,
      faultLine: s.node.line,
      faultColumn: s.node.column,
      nodeType: s.node.type,
    };
  },
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** TEX-LBL-DUP */
export const labelDuplicate: MutationOperator = {
  name: "LabelDuplicate",
  code: "TEX-LBL-DUP",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "reference",
  rationale: "Copy-paste error duplicating a \\label key causes multiply-defined labels.",
  findMutationSites(ast) {
    const labels = collectNodes(ast, "label").filter((n) => n.attrs?.args);
    return labels.map((n) => {
      const key = Array.isArray(n.attrs?.args) ? String((n.attrs!.args as string[])[0] ?? "") : "";
      return site("TEX-LBL-DUP", n, `duplicate \\label{${key}}`, { key });
    });
  },
  apply(ast, s) {
    const key = String(s.data?.key ?? "");
    if (!key) return null;
    // Insert a second identical label just after the first
    const insertAt = s.node.end;
    const dup = `\\label{${key}}`;
    return applySpanMutation(ast, s, insertAt, insertAt, dup, "");
  },
};

/** TEX-REF-UDF */
export const referenceUndefined: MutationOperator = {
  name: "ReferenceUndefined",
  code: "TEX-REF-UDF",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "reference",
  rationale: "Author renames a label but forgets to update refs.",
  findMutationSites(ast) {
    return collectNodes(ast, "ref")
      .filter((n) => Array.isArray(n.attrs?.args) && (n.attrs!.args as string[])[0])
      .map((n) => {
        const key = String((n.attrs!.args as string[])[0]);
        return site("TEX-REF-UDF", n, `\\${n.name}{${key}}`, { key, cmd: n.name });
      });
  },
  apply(ast, s) {
    const key = String(s.data?.key ?? "");
    if (!key) return null;
    const ghost = `${key}__ghost`;
    // Replace key inside the ref command's brace arg
    const text = s.node.text ?? ast.source.slice(s.node.start, s.node.end);
    const mutatedText = text.replace(`{${key}}`, `{${ghost}}`);
    if (mutatedText === text) return null;
    return applySpanMutation(ast, s, s.node.start, s.node.end, mutatedText, text);
  },
};

/** TEX-LVL-SFT */
export const levelShift: MutationOperator = {
  name: "LevelShift",
  code: "TEX-LVL-SFT",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "heading",
  rationale: "Authors get heading levels wrong (section → subsection).",
  findMutationSites(ast) {
    return collectNodes(ast, "sectioning")
      .filter((n) => n.name && LEVEL_MAP[n.name.replace(/\*$/, "")])
      .map((n) => {
        const base = (n.name ?? "").replace(/\*$/, "");
        const star = (n.name ?? "").endsWith("*") ? "*" : "";
        const to = LEVEL_MAP[base]! + star;
        return site("TEX-LVL-SFT", n, `\\${n.name} → \\${to}`, {
          from: `\\${n.name}`,
          to: `\\${to}`,
          cmdEnd: n.attrs?.cmdEnd ?? n.start + 1 + (n.name?.length ?? 0),
        });
      });
  },
  apply(ast, s) {
    const from = String(s.data?.from ?? "");
    const to = String(s.data?.to ?? "");
    const start = s.node.start;
    if (ast.source.slice(start, start + from.length) !== from) return null;
    return applySpanMutation(ast, s, start, start + from.length, to, from);
  },
};

/** TEX-UNT-CHG */
export const unitChange: MutationOperator = {
  name: "UnitChange",
  code: "TEX-UNT-CHG",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "preamble",
  rationale: "Off-by-one in spacing/font size values (12pt → 11pt, 2cm → 3cm).",
  findMutationSites(ast) {
    const re = /(\d+(?:\.\d+)?)(pt|cm|mm|em|ex|in)/g;
    const sites: MutationSite[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(ast.source)) !== null) {
      // Prefer documentclass options and geometry
      const num = m[1]!;
      const unit = m[2]!;
      const altNum = unit === "pt" ? (num === "12" ? "11" : num === "11" ? "12" : String(Number(num) + 1)) : String(Number(num) + 1);
      sites.push(
        site(
          "TEX-UNT-CHG",
          {
            type: "text",
            start: m.index,
            end: m.index + m[0].length,
            line: 1,
            column: 1,
            children: [],
            text: m[0],
          },
          `${m[0]} → ${altNum}${unit}`,
          { from: m[0], to: `${altNum}${unit}` },
          { start: m.index, end: m.index + m[0].length },
        ),
      );
    }
    return sites;
  },
  apply(ast, s) {
    const from = String(s.data?.from ?? "");
    const to = String(s.data?.to ?? "");
    const start = s.start ?? s.node.start;
    const end = s.end ?? s.node.end;
    if (ast.source.slice(start, end) !== from) return null;
    return applySpanMutation(ast, s, start, end, to, from);
  },
};

/** TEX-FNT-SWP */
export const fontSwap: MutationOperator = {
  name: "FontSwap",
  code: "TEX-FNT-SWP",
  track: "soft",
  tier: 2,
  formats: ["latex"],
  scope: "font",
  rationale: "Authors apply the wrong font command (textbf ↔ textit ↔ texttt).",
  findMutationSites(ast) {
    const sites: MutationSite[] = [];
    for (const cmd of collectNodes(ast, "command")) {
      const name = cmd.name ?? "";
      if (!FONT_CMDS.includes(name)) continue;
      const others = FONT_CMDS.filter((c) => c !== name);
      sites.push(
        site("TEX-FNT-SWP", cmd, `\\${name}`, {
          from: name,
          alternatives: others,
        }),
      );
    }
    return sites;
  },
  apply(ast, s, _v, rng) {
    const from = String(s.data?.from ?? s.node.name ?? "");
    const alts = (s.data?.alternatives as string[]) ?? FONT_CMDS.filter((c) => c !== from);
    if (!alts.length) return null;
    const to = pick(alts, rng);
    const start = s.node.start;
    const fromCmd = `\\${from}`;
    if (ast.source.slice(start, start + fromCmd.length) !== fromCmd) return null;
    return applySpanMutation(ast, s, start, start + fromCmd.length, `\\${to}`, fromCmd);
  },
};

/** TEX-ARG-DRP */
export const argumentDrop: MutationOperator = {
  name: "ArgumentDrop",
  code: "TEX-ARG-DRP",
  track: "hard",
  tier: 2,
  formats: ["latex"],
  scope: "structure",
  rationale: "Authors forget a required argument (e.g. \\frac{a} missing second arg).",
  findMutationSites(ast) {
    const multiArg = new Set(["frac", "dfrac", "tfrac", "binom", "sqrt", "href", "hyperref"]);
    return collectNodes(ast, "command")
      .filter((n) => {
        const name = n.name ?? "";
        const args = (n.attrs?.args as string[] | undefined) ?? [];
        if (multiArg.has(name) && args.length >= 2) return true;
        // Also commands with ≥2 required brace args
        const spans = (n.attrs?.argSpans as string[] | undefined) ?? [];
        const required = spans.filter((s) => s.endsWith(":r"));
        return required.length >= 2;
      })
      .map((n) =>
        site("TEX-ARG-DRP", n, `drop last arg of \\${n.name}`, {
          argSpans: n.attrs?.argSpans,
        }),
      );
  },
  apply(ast, s) {
    const spans = (s.data?.argSpans as string[] | undefined) ?? [];
    const required = spans
      .map((raw) => {
        const [a, b, k] = raw.split(":");
        return { start: Number(a), end: Number(b), optional: k === "o" };
      })
      .filter((x) => !x.optional && Number.isFinite(x.start));
    if (required.length < 1) return null;
    const last = required[required.length - 1]!;
    const original = ast.source.slice(last.start, last.end);
    return applySpanMutation(ast, s, last.start, last.end, "", original);
  },
};

export const latexSemanticOperators: MutationOperator[] = [
  mathRelationSwap,
  mathOperatorSwap,
  commandTypo,
  environmentSwap,
  labelDuplicate,
  referenceUndefined,
  levelShift,
  unitChange,
  fontSwap,
  argumentDrop,
];

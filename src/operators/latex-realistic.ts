/**
 * LaTeX Tier 3 — Realistic author-error operators (6).
 * TEX-PKG-ORD, TEX-FNT-SPEC, TEX-SHL-ESC, TEX-HYP-DRV, TEX-GLS-UDF, TEX-CSV-FMT
 */

import type { MutationOperator, MutationSite } from "../core/types.js";
import { applySpanMutation, collectNodes } from "../core/source-utils.js";
import { site } from "../core/mutation-site.js";

/** TEX-PKG-ORD: Move hyperref before other packages (breaks driver detection). */
export const packageOrder: MutationOperator = {
  name: "PackageOrder",
  code: "TEX-PKG-ORD",
  track: "soft",
  tier: 3,
  formats: ["latex"],
  scope: "package",
  rationale: "hyperref must be loaded last — loading it early is a classic author mistake.",
  findMutationSites(ast) {
    const pkgs = collectNodes(ast, "usepackage");
    const hyper = pkgs.find((p) => {
      const list = (p.attrs?.packages as string[]) ?? [p.name ?? ""];
      return list.includes("hyperref");
    });
    if (!hyper) return [];
    // Need at least one package after hyperref currently, OR packages before to swap with
    const others = pkgs.filter((p) => p.start !== hyper.start);
    if (others.length < 1) return [];
    return [
      site("TEX-PKG-ORD", hyper, "move hyperref before other packages", {
        hyperStart: hyper.start,
        hyperEnd: hyper.end,
      }),
    ];
  },
  apply(ast, s) {
    const pkgs = collectNodes(ast, "usepackage");
    const hyper = pkgs.find((p) => {
      const list = (p.attrs?.packages as string[]) ?? [p.name ?? ""];
      return list.includes("hyperref");
    });
    if (!hyper) return null;
    // Expand hyper line
    let hStart = hyper.start;
    let hEnd = hyper.end;
    while (hEnd < ast.source.length && ast.source[hEnd] !== "\n") hEnd++;
    if (hEnd < ast.source.length) hEnd++;
    const hyperLine = ast.source.slice(hStart, hEnd);
    // Remove hyper from current place
    let source = ast.source.slice(0, hStart) + ast.source.slice(hEnd);
    // Insert right after documentclass
    const dc = collectNodes({ ...ast, source: ast.source, root: ast.root }, "documentclass")[0];
    // Re-find documentclass in original for offset; adjust if hyper was before it (unlikely)
    let insertAt = 0;
    const dcm = ast.source.match(/\\documentclass\b[^\n]*\n/);
    if (dcm && dcm.index !== undefined) {
      insertAt = dcm.index + dcm[0].length;
      if (hStart < insertAt) {
        // hyper was before insert point — after removal, insertAt shrinks
        insertAt -= hEnd - hStart;
      } else {
        // hyper was after insert point — insertAt unchanged after removal only if hyper after
        // wait: we removed hyper which is after insertAt, insertAt ok
      }
    } else {
      insertAt = 0;
    }
    // Recompute: rebuild from original more carefully
    source = ast.source.slice(0, hStart) + ast.source.slice(hEnd);
    const dcMatch = source.match(/\\documentclass\b[^\n]*\n/);
    insertAt = dcMatch && dcMatch.index !== undefined ? dcMatch.index + dcMatch[0].length : 0;
    source = source.slice(0, insertAt) + hyperLine + source.slice(insertAt);
    return {
      source,
      original: "hyperref last",
      mutated: "hyperref first",
      site: s,
      faultLine: s.node.line,
      faultColumn: s.node.column,
      nodeType: s.node.type,
    };
  },
};

/** TEX-FNT-SPEC: Remove fontspec import. */
export const fontspecRemove: MutationOperator = {
  name: "FontSpecRemove",
  code: "TEX-FNT-SPEC",
  track: "hard",
  tier: 3,
  formats: ["latex"],
  scope: "package",
  rationale: "Engine-specific package dependency: fontspec fails on pdfLaTeX.",
  findMutationSites(ast) {
    return collectNodes(ast, "usepackage")
      .filter((p) => {
        const list = (p.attrs?.packages as string[]) ?? [p.name ?? ""];
        return list.includes("fontspec");
      })
      .map((p) => site("TEX-FNT-SPEC", p, "remove fontspec"));
  },
  apply(ast, s) {
    let start = s.node.start;
    let end = s.node.end;
    while (end < ast.source.length && ast.source[end] !== "\n") end++;
    if (end < ast.source.length) end++;
    return applySpanMutation(ast, s, start, end, "", ast.source.slice(start, end));
  },
};

/** TEX-SHL-ESC: Introduce minted dependency without -shell-escape. */
export const shellEscapeRequired: MutationOperator = {
  name: "ShellEscapeReq",
  code: "TEX-SHL-ESC",
  track: "hard",
  tier: 3,
  formats: ["latex"],
  scope: "package",
  rationale: "Authors use minted without knowing the --shell-escape flag is required.",
  findMutationSites(ast) {
    // Apply if document has a documentclass (can inject minted)
    const dc = collectNodes(ast, "documentclass");
    if (!dc.length) return [];
    // Skip if already has minted
    if (/\\usepackage\{[^}]*minted/.test(ast.source) || /\\begin\{minted\}/.test(ast.source)) {
      return [];
    }
    return [site("TEX-SHL-ESC", dc[0]!, "inject minted without shell-escape")];
  },
  apply(ast, s) {
    // Insert usepackage{minted} and a minted environment in the body
    const dcEnd = s.node.end;
    let insertPkg = dcEnd;
    // after documentclass line
    while (insertPkg < ast.source.length && ast.source[insertPkg] !== "\n") insertPkg++;
    if (insertPkg < ast.source.length) insertPkg++;
    const pkgLine = "\\usepackage{minted}\n";
    let source = ast.source.slice(0, insertPkg) + pkgLine + ast.source.slice(insertPkg);

    // Insert a small minted block after \begin{document}
    const beginDoc = source.match(/\\begin\s*\{document\}/);
    if (beginDoc && beginDoc.index !== undefined) {
      const at = beginDoc.index + beginDoc[0].length;
      const block =
        "\n\\begin{minted}{python}\nprint('hello')\n\\end{minted}\n";
      source = source.slice(0, at) + block + source.slice(at);
    }
    return {
      source,
      original: "",
      mutated: "\\usepackage{minted}+minted env",
      site: s,
      faultLine: s.node.line,
      faultColumn: s.node.column,
      nodeType: s.node.type,
    };
  },
};

/** TEX-HYP-DRV: Force wrong hyperref driver setup before hyperref loads. */
export const hyperrefDriverConflict: MutationOperator = {
  name: "HyperrefDriverConflict",
  code: "TEX-HYP-DRV",
  track: "soft",
  tier: 3,
  formats: ["latex"],
  scope: "package",
  rationale: "Driver auto-detection failure from premature hyperref setup.",
  findMutationSites(ast) {
    const hyper = collectNodes(ast, "usepackage").find((p) => {
      const list = (p.attrs?.packages as string[]) ?? [p.name ?? ""];
      return list.includes("hyperref");
    });
    if (!hyper) return [];
    return [
      site("TEX-HYP-DRV", hyper, "inject hypersetup before hyperref", {
        hyperStart: hyper.start,
      }),
    ];
  },
  apply(ast, s) {
    const at = Number(s.data?.hyperStart ?? s.node.start);
    const injection =
      "% docmut: premature hyperref driver config\n\\hypersetup{pdfborder={0 0 0}}\n\\usepackage[driver=dvips]{hyperref}\n";
    // Remove original hyperref line and inject broken setup
    let hStart = s.node.start;
    let hEnd = s.node.end;
    while (hEnd < ast.source.length && ast.source[hEnd] !== "\n") hEnd++;
    if (hEnd < ast.source.length) hEnd++;
    const original = ast.source.slice(hStart, hEnd);
    // Insert hypersetup BEFORE the package line, and change package to force bad driver
    const mutatedLine = "\\usepackage[driverfallback=dvips]{hyperref}\n";
    const source =
      ast.source.slice(0, hStart) +
      "\\hypersetup{pdfborder={0 0 0}}\n" +
      mutatedLine +
      ast.source.slice(hEnd);
    return {
      source,
      original: original.trim(),
      mutated: "\\hypersetup before hyperref + driverfallback",
      site: s,
      faultLine: s.node.line,
      faultColumn: s.node.column,
      nodeType: s.node.type,
    };
  },
};

/** TEX-GLS-UDF: Reference `\gls{undefined-key}`. */
export const glossaryUndefined: MutationOperator = {
  name: "GlossaryUndefined",
  code: "TEX-GLS-UDF",
  track: "hard",
  tier: 3,
  formats: ["latex"],
  scope: "reference",
  rationale: "Author forgets to define a glossary entry before using \\gls.",
  findMutationSites(ast) {
    const body = collectNodes(ast, "body")[0];
    const dc = collectNodes(ast, "documentclass")[0];
    if (!dc) return [];
    return [
      site("TEX-GLS-UDF", body ?? dc, "inject \\gls{undefined-key}", {
        bodyStart: body?.start,
      }),
    ];
  },
  apply(ast, s) {
    // Ensure glossaries package and inject undefined gls use
    let source = ast.source;
    if (!/\\usepackage\{[^}]*glossaries/.test(source)) {
      const dc = source.match(/\\documentclass\b[^\n]*\n/);
      if (dc && dc.index !== undefined) {
        const at = dc.index + dc[0].length;
        source =
          source.slice(0, at) +
          "\\usepackage{glossaries}\n\\makeglossaries\n" +
          source.slice(at);
      }
    }
    const beginDoc = source.match(/\\begin\s*\{document\}/);
    if (!beginDoc || beginDoc.index === undefined) return null;
    const at = beginDoc.index + beginDoc[0].length;
    const injection = "\n\\gls{undefined-docmut-key}\n";
    source = source.slice(0, at) + injection + source.slice(at);
    return {
      source,
      original: "",
      mutated: "\\gls{undefined-docmut-key}",
      site: s,
      faultLine: s.node.line,
      faultColumn: s.node.column,
      nodeType: s.node.type,
    };
  },
};

/** TEX-CSV-FMT: Break csvsimple / pgfplotstable data format. */
export const csvFormatException: MutationOperator = {
  name: "CsvFormatException",
  code: "TEX-CSV-FMT",
  track: "hard",
  tier: 3,
  formats: ["latex"],
  scope: "table",
  rationale: "Author has wrong column count in CSV data used by csvsimple/pgfplotstable.",
  findMutationSites(ast) {
    const sites: MutationSite[] = [];
    // Look for csvreader / csvautotabular / pgfplotstabletypeset
    const re = /\\(?:csvreader|csvautotabular|pgfplotstabletypeset|pgfplotstableread)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ast.source)) !== null) {
      sites.push(
        site(
          "TEX-CSV-FMT",
          {
            type: "command",
            start: m.index,
            end: m.index + m[0].length,
            line: 1,
            column: 1,
            children: [],
            text: m[0],
          },
          `break CSV near ${m[0]}`,
          { cmd: m[0] },
        ),
      );
    }
    // Also inject a broken csv if booktabs/tabular present (synthetic realistic fault)
    if (!sites.length && /\\begin\s*\{tabular\}/.test(ast.source)) {
      const tab = collectNodes(ast, "begin_env").find((n) => n.name === "tabular");
      if (tab) {
        sites.push(
          site("TEX-CSV-FMT", tab, "inject broken csvsimple table", {
            inject: true,
          }),
        );
      }
    }
    return sites;
  },
  apply(ast, s) {
    if (s.data?.inject) {
      let source = ast.source;
      if (!/csvsimple/.test(source)) {
        const dc = source.match(/\\documentclass\b[^\n]*\n/);
        if (dc && dc.index !== undefined) {
          source =
            source.slice(0, dc.index + dc[0].length) +
            "\\usepackage{csvsimple}\n" +
            source.slice(dc.index + dc[0].length);
        }
      }
      const beginDoc = source.match(/\\begin\s*\{document\}/);
      if (!beginDoc || beginDoc.index === undefined) return null;
      const at = beginDoc.index + beginDoc[0].length;
      // Broken CSV: declared 3 columns, data has 2
      const block = `
\\begin{filecontents*}{\\jobname-docmut.csv}
a,b,c
1,2
3,4,5,6
\\end{filecontents*}
\\csvautotabular{\\jobname-docmut.csv}
`;
      source = source.slice(0, at) + block + source.slice(at);
      return {
        source,
        original: "",
        mutated: "broken csvsimple data",
        site: s,
        faultLine: s.node.line,
        faultColumn: s.node.column,
        nodeType: s.node.type,
      };
    }
    // Corrupt the command name slightly / drop a required arg brace
    const start = s.node.start;
    const end = s.node.end;
    // Find following {...} and truncate CSV path
    let i = end;
    while (i < ast.source.length && /\s/.test(ast.source[i]!)) i++;
    if (ast.source[i] === "{") {
      const close = ast.source.indexOf("}", i + 1);
      if (close > i) {
        const original = ast.source.slice(i, close + 1);
        return applySpanMutation(ast, s, i, close + 1, "{/nonexistent/docmut.csv}", original);
      }
    }
    return applySpanMutation(ast, s, start, end, "\\csvreaderBROKEN", ast.source.slice(start, end));
  },
};

export const latexRealisticOperators: MutationOperator[] = [
  packageOrder,
  fontspecRemove,
  shellEscapeRequired,
  hyperrefDriverConflict,
  glossaryUndefined,
  csvFormatException,
];

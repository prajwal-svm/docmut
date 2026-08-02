/**
 * Operator unit tests: known input → expected mutation shape.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  parseDocument,
  defaultRegistry,
  ALL_OPERATORS,
  createMutationRng,
  DEFAULT_SALT,
  mutateDocument,
  applyOne,
} from "../src/index.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const sampleTex = readFileSync(join(FIX, "sample.tex"), "utf8");
const sampleTyp = readFileSync(join(FIX, "sample.typ"), "utf8");
const sampleMd = readFileSync(join(FIX, "sample.md"), "utf8");

describe("operator catalog", () => {
  it("registers exactly 48 operators", () => {
    expect(ALL_OPERATORS.length).toBe(48);
    expect(defaultRegistry.size).toBe(48);
  });

  it("has unique codes", () => {
    const codes = ALL_OPERATORS.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has 25 latex + 15 typst + 8 markdown", () => {
    const latex = ALL_OPERATORS.filter((o) => o.formats.includes("latex"));
    const typst = ALL_OPERATORS.filter((o) => o.formats.includes("typst"));
    const md = ALL_OPERATORS.filter((o) => o.formats.includes("markdown"));
    expect(latex.length).toBe(25);
    expect(typst.length).toBe(15);
    expect(md.length).toBe(8);
  });


  it("has hard and soft tracks", () => {
    const hard = ALL_OPERATORS.filter((o) => (o.track ?? "hard") === "hard");
    const soft = ALL_OPERATORS.filter((o) => o.track === "soft");
    expect(hard.length + soft.length).toBe(48);
    expect(soft.length).toBeGreaterThan(0);
    expect(hard.length).toBeGreaterThan(0);
    // Soft refs / relations
    expect(defaultRegistry.get("TEX-REF-UDF")?.track).toBe("soft");
    expect(defaultRegistry.get("TEX-MTH-REL")?.track).toBe("soft");
    // Hard braces
    expect(defaultRegistry.get("TEX-BRC-DRP")?.track ?? "hard").toBe("hard");
  });

  it("tiers sum correctly", () => {
    expect(ALL_OPERATORS.filter((o) => o.tier === 1).length).toBe(19);
    expect(ALL_OPERATORS.filter((o) => o.tier === 2).length).toBe(18);
    expect(ALL_OPERATORS.filter((o) => o.tier === 3).length).toBe(11);
  });
});

describe("LaTeX parsers produce usable sites", () => {
  const ast = parseDocument(sampleTex, "latex", "sample.tex");

  it("parses documentclass, packages, envs, math", () => {
    const types = new Set(ast.root.children.map((c) => c.type));
    expect(types.has("documentclass")).toBe(true);
    expect(types.has("usepackage")).toBe(true);
    expect(types.has("environment") || types.has("begin_env")).toBe(true);
    expect(types.has("math_inline") || types.has("math_display")).toBe(true);
  });

  it("TEX-BRC-DRP finds brace sites and removes a closing brace", () => {
    const op = defaultRegistry.get("TEX-BRC-DRP")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng);
    expect(result).not.toBeNull();
    expect(result!.source).not.toBe(ast.source);
    expect(result!.original).toBe("}");
    expect(result!.mutated).toBe("");
  });

  it("TEX-ENV-REN renames an end environment", () => {
    const op = defaultRegistry.get("TEX-ENV-REN")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng);
    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/\\end\{[^}]+\}/);
    expect(result!.source).not.toBe(ast.source);
  });

  it("TEX-CLS-DRP removes documentclass", () => {
    const op = defaultRegistry.get("TEX-CLS-DRP")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBe(1);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toMatch(/\\documentclass/);
  });

  it("TEX-MTH-REL swaps a relation", () => {
    const op = defaultRegistry.get("TEX-MTH-REL")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const leq = sites.find((s) => s.data?.from === "\\leq");
    expect(leq).toBeTruthy();
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, leq!, 0, rng)!;
    expect(result.mutated).toBe("\\geq");
    expect(result.source).toContain("\\geq");
  });

  it("TEX-MTH-OPS swaps sin/cos or sum/prod", () => {
    const op = defaultRegistry.get("TEX-MTH-OPS")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toBe(ast.source);
  });

  it("TEX-PKG-DRP removes a used package", () => {
    const op = defaultRegistry.get("TEX-PKG-DRP")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source.split("\n").length).toBeLessThan(ast.source.split("\n").length);
  });

  it("TEX-LBL-DUP duplicates a label", () => {
    const op = defaultRegistry.get("TEX-LBL-DUP")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    const key = String(sites[0]!.data?.key);
    const count = (result.source.match(new RegExp(`\\\\label\\{${key}\\}`, "g")) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("TEX-REF-UDF ghosts a ref key", () => {
    const op = defaultRegistry.get("TEX-REF-UDF")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).toContain("__ghost");
  });

  it("TEX-LVL-SFT shifts section level", () => {
    const op = defaultRegistry.get("TEX-LVL-SFT")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toBe(ast.source);
  });

  it("TEX-ARG-DRP drops frac second argument", () => {
    const op = defaultRegistry.get("TEX-ARG-DRP")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const frac = sites.find((s) => s.node.name === "frac");
    expect(frac).toBeTruthy();
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, frac!, 0, rng)!;
    // \frac{a}{b} → \frac{a}  (missing {b})
    expect(result.source).toMatch(/\\frac\{a\}/);
    expect(result.source).not.toMatch(/\\frac\{a\}\{b\}/);
  });
});

describe("Typst operators", () => {
  const ast = parseDocument(sampleTyp, "typst", "sample.typ");

  it("parses imports, set rules, headings, math", () => {
    const types = new Set(ast.root.children.map((c) => c.type));
    expect(types.has("import")).toBe(true);
    expect(types.has("set_rule")).toBe(true);
    expect(types.has("heading")).toBe(true);
  });

  it("TYP-IMP-DRP removes an import", () => {
    const op = defaultRegistry.get("TYP-IMP-DRP")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toContain("#import");
  });

  it("TYP-MTH-UNC removes closing dollar", () => {
    const op = defaultRegistry.get("TYP-MTH-UNC")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    // One fewer $ than original for that span
    expect(result.source).not.toBe(ast.source);
  });

  it("TYP-STR-UNC removes closing quote", () => {
    const op = defaultRegistry.get("TYP-STR-UNC")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.mutated).toBe("");
    expect(result.original).toBe('"');
  });

  it("TYP-LST-MLF removes list marker", () => {
    const op = defaultRegistry.get("TYP-LST-MLF")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toBe(ast.source);
  });

  it("TYP-PGE-SZE sets invalid paper", () => {
    const op = defaultRegistry.get("TYP-PGE-SZE")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).toContain("invalid-docmut-size");
  });
});

describe("Markdown operators", () => {
  const ast = parseDocument(sampleMd, "markdown", "sample.md");

  it("parses headings, links, code, math, yaml, table", () => {
    const types = new Set(ast.root.children.map((c) => c.type));
    expect(types.has("md_heading")).toBe(true);
    expect(types.has("md_link")).toBe(true);
    expect(types.has("md_code_fence")).toBe(true);
    expect(types.has("md_yaml_frontmatter")).toBe(true);
  });

  it("MD-LNK-BRK removes closing paren", () => {
    const op = defaultRegistry.get("MD-LNK-BRK")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).toContain("[link](https://example.com");
    expect(result.source).not.toContain("[link](https://example.com)");
  });

  it("MD-CDE-UNC removes closing fence", () => {
    const op = defaultRegistry.get("MD-CDE-UNC")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    // Count fences: original has open+close, mutant should have only open for that block
    expect(result.source).not.toBe(ast.source);
  });

  it("MD-YML-BRK breaks frontmatter", () => {
    const op = defaultRegistry.get("MD-YML-BRK")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBe(1);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toBe(ast.source);
  });

  it("MD-HDR-MLF skips a heading level", () => {
    const op = defaultRegistry.get("MD-HDR-MLF")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const h1 = sites.find((s) => s.data?.level === 1) ?? sites[0]!;
    const result = op.apply(ast, h1, 0, rng)!;
    expect(result.source).toMatch(/^### /m);
  });

  it("MD-TBL-MLF breaks table separator", () => {
    const op = defaultRegistry.get("MD-TBL-MLF")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).not.toBe(ast.source);
  });

  it("MD-IMG-BRK points to missing image", () => {
    const op = defaultRegistry.get("MD-IMG-BRK")!;
    const sites = op.findMutationSites(ast);
    expect(sites.length).toBeGreaterThan(0);
    const { rng } = createMutationRng(DEFAULT_SALT, ast.sha256, op.code, 0);
    const result = op.apply(ast, sites[0]!, 0, rng)!;
    expect(result.source).toContain("docmut-missing-image");
  });
});

describe("pipeline smoke", () => {
  it("mutateDocument produces results for latex sample", () => {
    const result = mutateDocument(sampleTex, {
      operators: ["tier1"],
      variants: 2,
      path: "sample.tex",
    });
    expect(result.mutations.length).toBeGreaterThan(0);
    for (const m of result.mutations) {
      expect(m.broken).not.toBe(m.golden);
      expect(m.operator).toMatch(/^TEX-/);
      expect(m.prngSeed).toContain(String(DEFAULT_SALT));
      expect(m.id).toMatch(/^docmut-/);
    }
  });

  it("applyOne works for a known operator", () => {
    const m = applyOne(sampleTex, "TEX-CLS-DRP", 0, DEFAULT_SALT, "sample.tex");
    expect(m).not.toBeNull();
    expect(m!.broken).not.toMatch(/\\documentclass/);
  });
});

/**
 * Adequacy, manifest integrity, and track selection tests.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  ALL_OPERATORS,
  DEFAULT_SALT,
  buildOperatorManifest,
  defaultRegistry,
  mutateDocument,
  operatorTrack,
  parseDocument,
  findTectonic,
} from "../src/index.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const sampleTex = readFileSync(join(FIX, "sample.tex"), "utf8");
const sampleTyp = readFileSync(join(FIX, "sample.typ"), "utf8");
const sampleMd = readFileSync(join(FIX, "sample.md"), "utf8");

describe("operator manifest", () => {
  it("is stable for codes/tracks/tiers", () => {
    const a = buildOperatorManifest();
    const b = buildOperatorManifest();
    expect(a.contentSha256).toBe(b.contentSha256);
    expect(a.operatorCount).toBe(48);
    expect(a.hardCount + a.softCount).toBe(48);
    expect(a.byFormat.latex).toBe(25);
    expect(a.byFormat.typst).toBe(15);
    expect(a.byFormat.markdown).toBe(8);
  });

  it("lists every registered code exactly once", () => {
    const m = buildOperatorManifest();
    const codes = m.operators.map((o) => o.code);
    expect(new Set(codes).size).toBe(48);
    for (const op of ALL_OPERATORS) {
      expect(codes).toContain(op.code);
    }
  });
});

describe("track selection", () => {
  it("selects hard and soft subsets", () => {
    const hard = defaultRegistry.select("hard");
    const soft = defaultRegistry.select("soft");
    expect(hard.length).toBeGreaterThan(0);
    expect(soft.length).toBeGreaterThan(0);
    expect(hard.length + soft.length).toBe(48);
    expect(hard.every((o) => operatorTrack(o) === "hard")).toBe(true);
    expect(soft.every((o) => operatorTrack(o) === "soft")).toBe(true);
  });
});

describe("surface parse adequacy on fixtures", () => {
  it("latex fixture exposes core site families", () => {
    const ast = parseDocument(sampleTex, "latex", "sample.tex");
    const types = new Set(ast.root.children.map((c) => c.type));
    expect(types.has("documentclass")).toBe(true);
    expect(types.has("usepackage")).toBe(true);
    expect(types.has("math_inline") || types.has("math_display")).toBe(true);
    expect(types.has("label")).toBe(true);
    expect(types.has("ref")).toBe(true);
    expect(types.has("item")).toBe(true);
    expect(types.has("sectioning")).toBe(true);
  });

  it("typst and markdown fixtures parse without throwing", () => {
    const typ = parseDocument(sampleTyp, "typst", "sample.typ");
    const md = parseDocument(sampleMd, "markdown", "sample.md");
    expect(typ.format).toBe("typst");
    expect(md.format).toBe("markdown");
    expect(typ.root.children.length).toBeGreaterThan(0);
    expect(md.root.children.length).toBeGreaterThan(0);
  });
});

describe("mutation construction adequacy", () => {
  it("produces hard structural latex mutants without engines", () => {
    const r = mutateDocument(sampleTex, {
      salt: DEFAULT_SALT,
      operators: ["TEX-BRC-DRP", "TEX-CLS-DRP", "TEX-ENV-REN"],
      variants: 2,
      path: "sample.tex",
    });
    expect(r.mutations.length).toBeGreaterThan(0);
    for (const m of r.mutations) {
      expect(m.broken).not.toBe(m.golden);
      expect(m.brokenSha).toMatch(/^[a-f0-9]{64}$/);
      expect(m.track).toBe("hard");
    }
  });

  it("hard latex operators change source on sample for every code with sites", () => {
    const hardLatex = defaultRegistry
      .select("hard")
      .filter((o) => o.formats.includes("latex"));
    const ast = parseDocument(sampleTex, "latex", "sample.tex");
    let withSites = 0;
    let withMutants = 0;
    for (const op of hardLatex) {
      const sites = op.findMutationSites(ast);
      if (!sites.length) continue;
      withSites++;
      const r = mutateDocument(sampleTex, {
        salt: DEFAULT_SALT,
        operators: [op.code],
        variants: 1,
        path: "sample.tex",
      });
      if (r.mutations.length > 0) withMutants++;
    }
    expect(withSites).toBeGreaterThan(5);
    expect(withMutants).toBeGreaterThan(5);
    // Most operators that find sites should produce a mutant without gates
    expect(withMutants / withSites).toBeGreaterThanOrEqual(0.7);
  });

  it.skipIf(!findTectonic())(
    "engine gate retains only failing hard latex mutants for TEX-CLS-DRP",
    () => {
      const r = mutateDocument(sampleTex, {
        salt: DEFAULT_SALT,
        operators: ["TEX-CLS-DRP"],
        variants: 1,
        path: "sample.tex",
        engineGate: true,
      });
      expect(r.mutations.length).toBeGreaterThan(0);
      for (const m of r.mutations) {
        expect(m.engineGatePassed).toBe(true);
        expect(m.engine?.goldenPass).toBe(true);
        expect(m.engine?.brokenPass).toBe(false);
      }
    },
  );
});

describe("cross-format construction", () => {
  it("mutates typst tier1", () => {
    const r = mutateDocument(sampleTyp, {
      salt: DEFAULT_SALT,
      operators: "tier1",
      variants: 1,
      path: "sample.typ",
    });
    expect(r.format).toBe("typst");
    expect(r.stats.attempted).toBeGreaterThan(0);
  });

  it("mutates markdown tier1", () => {
    const r = mutateDocument(sampleMd, {
      salt: DEFAULT_SALT,
      operators: "tier1",
      variants: 1,
      path: "sample.md",
    });
    expect(r.format).toBe("markdown");
    expect(r.stats.attempted).toBeGreaterThan(0);
  });
});

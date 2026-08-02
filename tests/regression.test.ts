/**
 * Regression: known documents → known mutation properties.
 * Also smokes real dataset seeds when available.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  mutateDocument,
  parseDocument,
  defaultRegistry,
  DEFAULT_SALT,
  applyOne,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const sampleTex = readFileSync(join(FIX, "sample.tex"), "utf8");

const ARTICLE =
  join(HERE, "..", "..", "data", "seeds", "article.tex");
const CATALOG = join(HERE, "..", "..", "dataset", "catalog.json");

describe("fixture regressions", () => {
  it("TEX-CLS-DRP on sample.tex always removes documentclass", () => {
    const m = applyOne(sampleTex, "TEX-CLS-DRP", 0, DEFAULT_SALT, "sample.tex");
    expect(m).not.toBeNull();
    expect(m!.broken).not.toMatch(/\\documentclass/);
    expect(m!.operator).toBe("TEX-CLS-DRP");
    expect(m!.tier).toBe(1);
    expect(m!.format).toBe("latex");
  });

  it("TEX-ENV-UNC removes an end line", () => {
    const m = applyOne(sampleTex, "TEX-ENV-UNC", 0, DEFAULT_SALT, "sample.tex");
    expect(m).not.toBeNull();
    // Count of \\end{ should decrease
    const orig = (sampleTex.match(/\\end\{/g) || []).length;
    const mut = (m!.broken.match(/\\end\{/g) || []).length;
    expect(mut).toBe(orig - 1);
  });

  it("TEX-MTH-DLR reduces dollar count by 1", () => {
    const m = applyOne(sampleTex, "TEX-MTH-DLR", 0, DEFAULT_SALT, "sample.tex");
    expect(m).not.toBeNull();
    const countDollars = (s: string) => (s.match(/(?<!\\)\$/g) || []).length;
    expect(countDollars(m!.broken)).toBe(countDollars(sampleTex) - 1);
  });

  it("mutation result has TeXFix-Bench compatible fields", () => {
    const result = mutateDocument(sampleTex, {
      operators: ["TEX-BRC-DRP"],
      variants: 1,
      path: "sample.tex",
    });
    expect(result.mutations.length).toBeGreaterThan(0);
    const m = result.mutations[0]!;
    expect(m).toHaveProperty("id");
    expect(m).toHaveProperty("broken");
    expect(m).toHaveProperty("golden");
    expect(m).toHaveProperty("brokenSha");
    expect(m).toHaveProperty("goldenSha");
    expect(m).toHaveProperty("groundTruthPatch");
    expect(m).toHaveProperty("replication");
    expect(m.replication?.salt).toBe(DEFAULT_SALT);
  });
});

describe("real seed article.tex", () => {
  const hasArticle = existsSync(ARTICLE);

  it.skipIf(!hasArticle)("parses and mutates harness article.tex", () => {
    const source = readFileSync(ARTICLE, "utf8");
    const ast = parseDocument(source, "latex", "article.tex");
    expect(ast.root.children.length).toBeGreaterThan(5);

    const result = mutateDocument(source, {
      operators: ["tier1"],
      variants: 2,
      path: "article.tex",
    });
    expect(result.mutations.length).toBeGreaterThan(0);
    // Every mutation must change the source
    for (const m of result.mutations) {
      expect(m.broken).not.toBe(m.golden);
      expect(m.format).toBe("latex");
    }
  });

  it.skipIf(!hasArticle)("at least half of latex tier1 operators find sites", () => {
    const source = readFileSync(ARTICLE, "utf8");
    const ast = parseDocument(source, "latex", "article.tex");
    const tier1 = defaultRegistry.select("tier1").filter((o) => o.formats.includes("latex"));
    let withSites = 0;
    for (const op of tier1) {
      if (op.findMutationSites(ast).length > 0) withSites++;
    }
    expect(withSites).toBeGreaterThanOrEqual(Math.ceil(tier1.length / 2));
  });
});

describe("dataset catalog smoke", () => {
  const hasCatalog = existsSync(CATALOG);

  it.skipIf(!hasCatalog)("mutates a few catalog documents", () => {
    const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
      documents: Array<{ id: string; format: string; file_path: string }>;
    };
    const catalogDir = dirname(CATALOG);
    const latexDocs = catalog.documents.filter((d) => d.format === "latex").slice(0, 3);
    const typstDocs = catalog.documents.filter((d) => d.format === "typst").slice(0, 3);

    let total = 0;
    for (const doc of [...latexDocs, ...typstDocs]) {
      const path = join(catalogDir, doc.file_path);
      if (!existsSync(path)) continue;
      const source = readFileSync(path, "utf8");
      // Skip huge files in smoke
      if (source.length > 100_000) continue;
      const result = mutateDocument(source, {
        operators: ["tier1"],
        variants: 1,
        path: doc.file_path,
      });
      total += result.mutations.length;
    }
    expect(total).toBeGreaterThan(0);
  });
});

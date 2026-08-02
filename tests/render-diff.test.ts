/**
 * Render-diff equivalent mutant detection tests.
 */
import { describe, it, expect } from "vitest";
import {
  normalizePdfText,
  renderDiff,
  engineGate,
  staticGate,
  findTectonic,
  findPdftotext,
  compileLatex,
} from "../src/index.js";

const MINIMAL_TEX = `\\documentclass{article}
\\begin{document}
Hello world.
\\end{document}
`;

const EQUIVALENT_MUTANT = `\\documentclass{article}
\\begin{document}
Hello world.
% a comment that does not change PDF text
\\end{document}
`;

const BROKEN_TEX = `\\documentclass{article}
\\begin{document}
Hello world.
\\end{document
`;

describe("normalizePdfText", () => {
  it("lowercases and strips whitespace/punctuation", () => {
    expect(normalizePdfText("Hello, World!")).toBe(normalizePdfText("hello world"));
    expect(normalizePdfText("A  B\nC")).toBe("abc");
  });
});

describe("staticGate", () => {
  it("passes when sources differ", () => {
    const g = staticGate(MINIMAL_TEX, BROKEN_TEX);
    expect(g.passed).toBe(true);
  });
  it("fails when sources are identical", () => {
    const g = staticGate(MINIMAL_TEX, MINIMAL_TEX);
    expect(g.passed).toBe(false);
  });
});

describe("render-diff equivalence", () => {
  const hasEngine = !!findTectonic();
  const hasPdftotext = !!findPdftotext();

  it("detects identical source as equivalent (markdown path)", () => {
    const rd = renderDiff("# Hello", "# Hello", "markdown");
    expect(rd.equivalent).toBe(true);
  });

  it("detects different markdown as non-equivalent", () => {
    const rd = renderDiff("# Hello", "# Goodbye", "markdown");
    expect(rd.equivalent).toBe(false);
  });

  it.skipIf(!hasEngine)("compiles minimal latex", () => {
    const r = compileLatex(MINIMAL_TEX);
    expect(r.pass).toBe(true);
  });

  it.skipIf(!hasEngine)("engine gate: broken fails, golden passes", () => {
    const g = engineGate(MINIMAL_TEX, BROKEN_TEX, "latex");
    expect(g.goldenPass).toBe(true);
    expect(g.brokenPass).toBe(false);
    expect(g.passed).toBe(true);
  });

  it.skipIf(!hasEngine)("engine gate rejects still-compiling mutant", () => {
    const g = engineGate(MINIMAL_TEX, EQUIVALENT_MUTANT, "latex");
    expect(g.goldenPass).toBe(true);
    expect(g.brokenPass).toBe(true);
    expect(g.passed).toBe(false);
  });

  it.skipIf(!hasEngine || !hasPdftotext)(
    "render-diff detects comment-only change as equivalent",
    () => {
      const rd = renderDiff(MINIMAL_TEX, EQUIVALENT_MUTANT, "latex");
      expect(rd.goldenCompile.pass).toBe(true);
      expect(rd.mutantCompile.pass).toBe(true);
      expect(rd.equivalent).toBe(true);
      expect(rd.reason).toBe("pdf_text_identical");
    },
  );

  it.skipIf(!hasEngine || !hasPdftotext)(
    "render-diff detects broken compile as not equivalent",
    () => {
      const rd = renderDiff(MINIMAL_TEX, BROKEN_TEX, "latex");
      expect(rd.equivalent).toBe(false);
      expect(rd.reason).toBe("mutant_compile_failed_not_equivalent");
    },
  );
});

describe("evaluateMutation single-compile path", () => {
  const hasEngine = !!findTectonic();

  it.skipIf(!hasEngine)("hard track rejects still-compiling mutant", async () => {
    const { evaluateMutation } = await import("../src/index.js");
    const r = evaluateMutation(
      MINIMAL_TEX,
      EQUIVALENT_MUTANT,
      "latex",
      { track: "hard", engineGate: true, renderDiff: true },
    );
    expect(r.engineGatePassed).toBe(false);
    expect(r.equivalentDetected).toBe(true);
  });

  it.skipIf(!hasEngine)("hard track accepts broken mutant", async () => {
    const { evaluateMutation } = await import("../src/index.js");
    const r = evaluateMutation(MINIMAL_TEX, BROKEN_TEX, "latex", {
      track: "hard",
      engineGate: true,
      renderDiff: true,
    });
    expect(r.engineGatePassed).toBe(true);
    expect(r.equivalentDetected).toBe(false);
  });
});

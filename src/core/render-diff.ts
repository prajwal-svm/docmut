/**
 * Render-diff equivalent mutant detection — DocMut's killer feature.
 *
 * After mutation:
 * 1. Compile original (golden) and mutant to PDF
 * 2. Extract text via pdftotext
 * 3. Normalize (lowercase, strip whitespace)
 * 4. If identical → equivalent mutant (exclude from dataset)
 *
 * Also provides the engine gate:
 * - golden must compile successfully
 * - broken must FAIL to compile (for hard instances)
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import type { DocumentFormat } from "./types.js";

export interface CompileResult {
  pass: boolean;
  pdfPath: string | null;
  log: string;
  errors: string[];
  warnings: string[];
  engine: string | null;
  elapsedMs: number;
}

export interface RenderDiffResult {
  equivalent: boolean;
  goldenText: string | null;
  mutantText: string | null;
  goldenCompile: CompileResult;
  mutantCompile: CompileResult;
  reason: string;
}

export interface EngineGateResult {
  passed: boolean;
  goldenPass: boolean | null;
  brokenPass: boolean | null;
  brokenErrors: string[];
  reason: string;
}

const TECTONIC_CANDIDATES = [
  process.env.TECTONIC_BIN,
  join(homedir(), ".oleafly/tools/tectonic"),
  join(homedir(), ".local/bin/tectonic"),
  "/opt/homebrew/bin/tectonic",
  "/usr/local/bin/tectonic",
  "/usr/bin/tectonic",
].filter(Boolean) as string[];

export function findTectonic(): string | null {
  for (const p of TECTONIC_CANDIDATES) {
    if (p && existsSync(p)) return p;
  }
  try {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", ["tectonic"], {
      encoding: "utf8",
    });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0]!;
  } catch {
    /* ignore */
  }
  return null;
}

export function findTypst(): string | null {
  if (process.env.TYPST_BIN && existsSync(process.env.TYPST_BIN)) return process.env.TYPST_BIN;
  try {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", ["typst"], {
      encoding: "utf8",
    });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0]!;
  } catch {
    /* ignore */
  }
  for (const p of ["/opt/homebrew/bin/typst", "/usr/local/bin/typst", join(homedir(), ".local/bin/typst")]) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function findPdftotext(): string | null {
  try {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", ["pdftotext"], {
      encoding: "utf8",
    });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0]!;
  } catch {
    /* ignore */
  }
  for (const p of ["/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext", "/usr/bin/pdftotext"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map((l) => l.trim()).filter(Boolean))];
}

export function parseTeXDiagnostics(log: string): { errors: string[]; warnings: string[] } {
  const lines = String(log || "").split(/\r?\n/);
  const errors = uniqueLines(
    lines.filter((line) =>
      /^!\s|Emergency stop|Fatal error|Runaway argument|Segmentation|panic|error:/i.test(line),
    ),
  );
  const warnings = uniqueLines(
    lines.filter((line) =>
      /^(?:(?:LaTeX|Package\s+\S+|Class\s+\S+)\s+Warning:|(?:Over|Under)full\s+\\[hv]box)/i.test(
        line.trim(),
      ),
    ),
  );
  return { errors, warnings };
}

/** Compile a single-file LaTeX source with tectonic. */
export function compileLatex(source: string, timeoutMs = 60_000): CompileResult {
  const bin = findTectonic();
  if (!bin) {
    return {
      pass: false,
      pdfPath: null,
      log: "tectonic not found",
      errors: ["tectonic_not_found"],
      warnings: [],
      engine: null,
      elapsedMs: 0,
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "docmut-tex-"));
  const texPath = join(dir, "main.tex");
  const pdfPath = join(dir, "main.pdf");
  writeFileSync(texPath, source, "utf8");
  const t0 = Date.now();
  const r = spawnSync(bin, ["-X", "compile", "--outfmt", "pdf", texPath], {
    encoding: "utf8",
    timeout: timeoutMs,
    cwd: dir,
  });
  const elapsedMs = Date.now() - t0;
  const log = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  let finalLog = log;
  const logPath = join(dir, "main.log");
  if (existsSync(logPath)) {
    try {
      finalLog = readFileSync(logPath, "utf8");
    } catch {
      /* ignore */
    }
  }
  const { errors, warnings } = parseTeXDiagnostics(finalLog);
  const pass = r.status === 0 && existsSync(pdfPath);
  return {
    pass,
    pdfPath: pass ? pdfPath : null,
    log: finalLog,
    errors: errors.length ? errors : pass ? [] : [r.stderr?.trim() || "compile_failed"],
    warnings,
    engine: bin,
    elapsedMs,
  };
}

/** Compile a Typst source. */
export function compileTypst(source: string, timeoutMs = 60_000): CompileResult {
  const bin = findTypst();
  if (!bin) {
    return {
      pass: false,
      pdfPath: null,
      log: "typst not found",
      errors: ["typst_not_found"],
      warnings: [],
      engine: null,
      elapsedMs: 0,
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "docmut-typ-"));
  const typPath = join(dir, "main.typ");
  const pdfPath = join(dir, "main.pdf");
  writeFileSync(typPath, source, "utf8");
  const t0 = Date.now();
  const r = spawnSync(bin, ["compile", typPath, pdfPath], {
    encoding: "utf8",
    timeout: timeoutMs,
    cwd: dir,
  });
  const elapsedMs = Date.now() - t0;
  const log = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const pass = r.status === 0 && existsSync(pdfPath);
  const errors = pass
    ? []
    : uniqueLines(log.split(/\r?\n/).filter((l) => /error/i.test(l)));
  return {
    pass,
    pdfPath: pass ? pdfPath : null,
    log,
    errors: errors.length ? errors : pass ? [] : ["compile_failed"],
    warnings: [],
    engine: bin,
    elapsedMs,
  };
}

/** Compile by format. Markdown has no native compile here — treated as soft. */
export function compileDocument(
  source: string,
  format: DocumentFormat,
  timeoutMs = 60_000,
): CompileResult {
  if (format === "latex") return compileLatex(source, timeoutMs);
  if (format === "typst") return compileTypst(source, timeoutMs);
  // Markdown: no engine gate by default
  return {
    pass: true,
    pdfPath: null,
    log: "markdown_no_engine",
    errors: [],
    warnings: [],
    engine: null,
    elapsedMs: 0,
  };
}

/** Extract text from a PDF using pdftotext. */
export function extractPdfText(pdfPath: string): string | null {
  const bin = findPdftotext();
  if (!bin || !existsSync(pdfPath)) return null;
  const r = spawnSync(bin, ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout ?? "";
}

/** Normalize PDF text for equivalence comparison. */
export function normalizePdfText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Compare golden vs mutant via PDF text extraction.
 * If either fails to compile, they are NOT equivalent (broken is a real fault).
 */
export function renderDiff(
  golden: string,
  mutant: string,
  format: DocumentFormat,
  opts: { timeoutMs?: number; cleanup?: boolean } = {},
): RenderDiffResult {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const cleanup = opts.cleanup !== false;

  const goldenCompile = compileDocument(golden, format, timeoutMs);
  const mutantCompile = compileDocument(mutant, format, timeoutMs);

  let goldenText: string | null = null;
  let mutantText: string | null = null;
  let equivalent = false;
  let reason: string;

  if (!goldenCompile.pass) {
    reason = "golden_compile_failed";
  } else if (!mutantCompile.pass) {
    reason = "mutant_compile_failed_not_equivalent";
  } else if (format === "markdown") {
    // Source-level comparison for markdown when no PDF pipeline
    equivalent = normalizePdfText(golden) === normalizePdfText(mutant);
    goldenText = golden;
    mutantText = mutant;
    reason = equivalent ? "source_normalized_identical" : "source_differs";
  } else {
    goldenText = goldenCompile.pdfPath ? extractPdfText(goldenCompile.pdfPath) : null;
    mutantText = mutantCompile.pdfPath ? extractPdfText(mutantCompile.pdfPath) : null;
    if (goldenText === null || mutantText === null) {
      reason = "pdftotext_unavailable_or_failed";
    } else {
      const g = normalizePdfText(goldenText);
      const m = normalizePdfText(mutantText);
      equivalent = g === m && g.length > 0;
      reason = equivalent ? "pdf_text_identical" : "pdf_text_differs";
    }
  }

  if (cleanup) {
    cleanupCompileDir(goldenCompile);
    cleanupCompileDir(mutantCompile);
  }

  return {
    equivalent,
    goldenText,
    mutantText,
    goldenCompile,
    mutantCompile,
    reason,
  };
}

function cleanupCompileDir(result: CompileResult): void {
  if (!result.pdfPath) {
    // still try to clean temp from log path heuristics — skip if no path
    return;
  }
  try {
    const dir = join(result.pdfPath, "..");
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Engine gate for hard instances:
 * (a) golden compiles successfully
 * (b) broken FAILS to compile
 */
export function engineGate(
  golden: string,
  broken: string,
  format: DocumentFormat,
  opts: { timeoutMs?: number } = {},
): EngineGateResult {
  if (format === "markdown") {
    // No compile gate for markdown; pass if sources differ
    const passed = golden !== broken;
    return {
      passed,
      goldenPass: true,
      brokenPass: false,
      brokenErrors: [],
      reason: passed ? "markdown_source_differs" : "markdown_identical",
    };
  }

  const goldenCompile = compileDocument(golden, format, opts.timeoutMs);
  const brokenCompile = compileDocument(broken, format, opts.timeoutMs);

  cleanupCompileDir(goldenCompile);
  cleanupCompileDir(brokenCompile);

  const goldenPass = goldenCompile.pass;
  const brokenPass = brokenCompile.pass;
  const passed = goldenPass === true && brokenPass === false;

  let reason: string;
  if (!goldenPass) reason = "golden_failed";
  else if (brokenPass) reason = "broken_still_compiles";
  else reason = "engine_gate_passed";

  return {
    passed,
    goldenPass,
    brokenPass,
    brokenErrors: brokenCompile.errors,
    reason,
  };
}

/**
 * Static lightweight gate when engines are unavailable:
 * broken must differ from golden.
 */
export function staticGate(golden: string, broken: string): EngineGateResult {
  const passed = golden !== broken;
  return {
    passed,
    goldenPass: null,
    brokenPass: null,
    brokenErrors: [],
    reason: passed ? "static_differs" : "static_identical",
  };
}

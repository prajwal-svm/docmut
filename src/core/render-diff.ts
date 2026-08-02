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
 * - hard: golden compiles AND broken fails
 * - soft: golden compiles AND broken compiles AND (warning present OR PDF text differs)
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
import type { DocumentFormat, FaultTrack } from "./types.js";

export interface CompileResult {
  pass: boolean;
  pdfPath: string | null;
  /** Always set when a temp directory was created — use for cleanup. */
  workDir: string | null;
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
  brokenWarnings: string[];
  reason: string;
  /** Shared compile results when available (avoids recompile for render-diff). */
  goldenCompile?: CompileResult;
  brokenCompile?: CompileResult;
}

const SOFT_WARNING_RE =
  /undefined|multiply.defined|Label .* (multiply|defined)|Citation .* undefined|Reference .* undefined/i;

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
  for (const p of [
    "/opt/homebrew/bin/typst",
    "/usr/local/bin/typst",
    join(homedir(), ".local/bin/typst"),
  ]) {
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
  for (const p of [
    "/opt/homebrew/bin/pdftotext",
    "/usr/local/bin/pdftotext",
    "/usr/bin/pdftotext",
  ]) {
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
      ) || /warning:/i.test(line),
    ),
  );
  return { errors, warnings };
}

function emptyCompile(errors: string[], log = ""): CompileResult {
  return {
    pass: false,
    pdfPath: null,
    workDir: null,
    log,
    errors,
    warnings: [],
    engine: null,
    elapsedMs: 0,
  };
}

/** Compile a single-file LaTeX source with tectonic. */
export function compileLatex(source: string, timeoutMs = 60_000): CompileResult {
  const bin = findTectonic();
  if (!bin) return emptyCompile(["tectonic_not_found"], "tectonic not found");

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
    workDir: dir,
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
  if (!bin) return emptyCompile(["typst_not_found"], "typst not found");

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
  const warnings = uniqueLines(log.split(/\r?\n/).filter((l) => /warning/i.test(l)));
  return {
    pass,
    pdfPath: pass ? pdfPath : null,
    workDir: dir,
    log,
    errors: errors.length ? errors : pass ? [] : ["compile_failed"],
    warnings,
    engine: bin,
    elapsedMs,
  };
}

/** Compile by format. Markdown has no native compile here. */
export function compileDocument(
  source: string,
  format: DocumentFormat,
  timeoutMs = 60_000,
): CompileResult {
  if (format === "latex") return compileLatex(source, timeoutMs);
  if (format === "typst") return compileTypst(source, timeoutMs);
  return {
    pass: true,
    pdfPath: null,
    workDir: null,
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

/** Always clean temp workdirs (pass or fail). */
export function cleanupCompileDir(result: CompileResult): void {
  const dir = result.workDir;
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Compare golden vs mutant via PDF text extraction.
 * If either fails to compile, they are NOT equivalent (broken is a real fault).
 */
export function renderDiff(
  golden: string,
  mutant: string,
  format: DocumentFormat,
  opts: {
    timeoutMs?: number;
    cleanup?: boolean;
    /** Reuse prior compile results to avoid double compilation. */
    goldenCompile?: CompileResult;
    mutantCompile?: CompileResult;
  } = {},
): RenderDiffResult {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const cleanup = opts.cleanup !== false;

  const goldenCompile = opts.goldenCompile ?? compileDocument(golden, format, timeoutMs);
  const mutantCompile = opts.mutantCompile ?? compileDocument(mutant, format, timeoutMs);

  let goldenText: string | null = null;
  let mutantText: string | null = null;
  let equivalent = false;
  let reason: string;

  if (!goldenCompile.pass) {
    reason = "golden_compile_failed";
  } else if (!mutantCompile.pass) {
    reason = "mutant_compile_failed_not_equivalent";
  } else if (format === "markdown") {
    equivalent = normalizePdfText(golden) === normalizePdfText(mutant);
    goldenText = golden;
    mutantText = mutant;
    reason = equivalent ? "source_normalized_identical" : "source_differs";
  } else {
    goldenText = goldenCompile.pdfPath ? extractPdfText(goldenCompile.pdfPath) : null;
    mutantText = mutantCompile.pdfPath ? extractPdfText(mutantCompile.pdfPath) : null;
    if (goldenText === null || mutantText === null) {
      reason = "pdftotext_unavailable_or_failed";
      // Fall back: if both compiled and sources differ, treat as non-equivalent
      // only when we cannot extract — do NOT mark equivalent on failure.
      equivalent = false;
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

/**
 * Engine gate.
 *
 * hard: (a) golden compiles (b) broken FAILS
 * soft: (a) golden compiles (b) broken COMPILES (c) soft warning present
 *       OR broken PDF/source text differs from golden (when renderDiff data available)
 */
export function engineGate(
  golden: string,
  broken: string,
  format: DocumentFormat,
  opts: {
    timeoutMs?: number;
    track?: FaultTrack;
    cleanup?: boolean;
    /** Optional precomputed compiles. */
    goldenCompile?: CompileResult;
    brokenCompile?: CompileResult;
  } = {},
): EngineGateResult {
  const track = opts.track ?? "hard";
  const cleanup = opts.cleanup !== false;

  if (format === "markdown") {
    const passed = golden !== broken;
    // Soft markdown: source differs; hard markdown: same (no real engine)
    return {
      passed: track === "soft" ? passed : passed,
      goldenPass: true,
      brokenPass: track === "hard" ? false : true,
      brokenErrors: [],
      brokenWarnings: [],
      reason: passed ? "markdown_source_differs" : "markdown_identical",
    };
  }

  const goldenCompile =
    opts.goldenCompile ?? compileDocument(golden, format, opts.timeoutMs);
  const brokenCompile =
    opts.brokenCompile ?? compileDocument(broken, format, opts.timeoutMs);

  const goldenPass = goldenCompile.pass;
  const brokenPass = brokenCompile.pass;
  let passed = false;
  let reason: string;

  if (!goldenPass) {
    reason = "golden_failed";
  } else if (track === "hard") {
    passed = brokenPass === false;
    reason = passed ? "engine_gate_passed_hard" : "broken_still_compiles";
  } else {
    // soft: must still compile, and show a diagnostic warning OR differ in source
    if (!brokenPass) {
      // Soft operator produced a hard failure — accept as valid fault (stricter)
      passed = true;
      reason = "soft_operator_escalated_to_hard_failure";
    } else {
      const hasSoftWarning = brokenCompile.warnings.some((w) => SOFT_WARNING_RE.test(w));
      const sourceDiffers = golden !== broken;
      passed = hasSoftWarning || sourceDiffers;
      if (hasSoftWarning) reason = "engine_gate_passed_soft_warning";
      else if (sourceDiffers) reason = "engine_gate_passed_soft_source_diff";
      else reason = "soft_no_fault_signal";
    }
  }

  if (cleanup) {
    cleanupCompileDir(goldenCompile);
    cleanupCompileDir(brokenCompile);
  }

  return {
    passed,
    goldenPass,
    brokenPass,
    brokenErrors: brokenCompile.errors,
    brokenWarnings: brokenCompile.warnings,
    reason,
    goldenCompile: cleanup ? undefined : goldenCompile,
    brokenCompile: cleanup ? undefined : brokenCompile,
  };
}

/**
 * Combined evaluate: one golden + one broken compile, then optional render-diff,
 * then track-aware engine gate. Avoids double compilation.
 */
export function evaluateMutation(
  golden: string,
  broken: string,
  format: DocumentFormat,
  opts: {
    timeoutMs?: number;
    track?: FaultTrack;
    renderDiff?: boolean;
    engineGate?: boolean;
  } = {},
): {
  equivalentDetected: boolean;
  engineGatePassed: boolean;
  reason: string;
  goldenCompile: CompileResult;
  brokenCompile: CompileResult;
  renderDiffReason?: string;
} {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const track = opts.track ?? "hard";

  // Markdown: no real compile
  if (format === "markdown") {
    const equivalent = normalizePdfText(golden) === normalizePdfText(broken);
    const differs = golden !== broken;
    return {
      equivalentDetected: equivalent,
      engineGatePassed: opts.engineGate ? differs && !equivalent : differs,
      reason: equivalent ? "markdown_equivalent" : "markdown_differs",
      goldenCompile: emptyCompile([], "markdown_no_engine"),
      brokenCompile: emptyCompile([], "markdown_no_engine"),
    };
  }

  const goldenCompile = compileDocument(golden, format, timeoutMs);
  const brokenCompile = compileDocument(broken, format, timeoutMs);

  let equivalentDetected = false;
  let renderDiffReason: string | undefined;

  if (opts.renderDiff && goldenCompile.pass && brokenCompile.pass) {
    const rd = renderDiff(golden, broken, format, {
      timeoutMs,
      cleanup: false,
      goldenCompile,
      mutantCompile: brokenCompile,
    });
    equivalentDetected = rd.equivalent;
    renderDiffReason = rd.reason;
  } else if (opts.renderDiff && !brokenCompile.pass) {
    equivalentDetected = false;
    renderDiffReason = "mutant_compile_failed_not_equivalent";
  }

  let engineGatePassed = true;
  let reason = "no_engine_gate";

  if (opts.engineGate) {
    // Soft track: if compile-success, require non-equivalent when renderDiff on
    if (track === "hard") {
      engineGatePassed = goldenCompile.pass === true && brokenCompile.pass === false;
      reason = engineGatePassed
        ? "engine_gate_passed_hard"
        : !goldenCompile.pass
          ? "golden_failed"
          : "broken_still_compiles";
    } else {
      if (!goldenCompile.pass) {
        engineGatePassed = false;
        reason = "golden_failed";
      } else if (!brokenCompile.pass) {
        engineGatePassed = true;
        reason = "soft_operator_escalated_to_hard_failure";
      } else {
        const hasSoftWarning = brokenCompile.warnings.some((w) => SOFT_WARNING_RE.test(w));
        const notEquiv = opts.renderDiff ? !equivalentDetected : golden !== broken;
        engineGatePassed = (hasSoftWarning || notEquiv) && !equivalentDetected;
        if (equivalentDetected) reason = "soft_equivalent_mutant";
        else if (hasSoftWarning) reason = "engine_gate_passed_soft_warning";
        else if (notEquiv) reason = "engine_gate_passed_soft_diff";
        else reason = "soft_no_fault_signal";
      }
    }
  }

  cleanupCompileDir(goldenCompile);
  cleanupCompileDir(brokenCompile);

  return {
    equivalentDetected,
    engineGatePassed,
    reason,
    goldenCompile,
    brokenCompile,
    renderDiffReason,
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
    brokenWarnings: [],
    reason: passed ? "static_differs" : "static_identical",
  };
}

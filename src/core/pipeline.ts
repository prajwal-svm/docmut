/**
 * DocMut mutation pipeline — apply operators, optional engine/render gates.
 */

import type {
  DocumentAST,
  DocumentFormat,
  FaultTrack,
  MutateOptions,
  MutationOperator,
  MutationResult,
  MutationSite,
} from "./types.js";
import { DEFAULT_SALT, operatorTrack } from "./types.js";
import { createMutationRng, mutationId, pick, sha256, shuffle } from "./prng.js";
import { parseDocument } from "./mutation-site.js";
import { defaultRegistry, OperatorRegistry } from "./registry.js";
import { evaluateMutation, staticGate } from "./render-diff.js";

export interface PipelineStats {
  attempted: number;
  kept: number;
  skippedNoSite: number;
  skippedApplyFailed: number;
  skippedEngineGate: number;
  skippedEquivalent: number;
  byOperator: Record<string, number>;
  byTrack: Record<FaultTrack, number>;
}

export interface PipelineResult {
  mutations: MutationResult[];
  /** Equivalents excluded from `mutations` (for transparency logs). */
  equivalents: MutationResult[];
  stats: PipelineStats;
  format: DocumentFormat;
  seedHash: string;
}

function wantsEngineGate(opts: MutateOptions): boolean {
  return opts.engineGate === true || opts.engineGate === "auto" ||
    opts.engineGate === "hard" || opts.engineGate === "soft";
}

function trackFilter(opts: MutateOptions, track: FaultTrack): boolean {
  if (opts.engineGate === "hard") return track === "hard";
  if (opts.engineGate === "soft") return track === "soft";
  return true; // auto / true / false
}

/**
 * Mutate a single document source with selected operators.
 */
export function mutateDocument(
  source: string,
  options: MutateOptions = {},
  registry: OperatorRegistry = defaultRegistry,
): PipelineResult {
  const salt = options.salt ?? DEFAULT_SALT;
  const variants = options.variants ?? 5;
  const path = options.path ?? "document";
  const excludeEquivalent = options.excludeEquivalent !== false;
  const timeoutMs = options.compileTimeoutMs ?? 60_000;

  const ast = parseDocument(source, undefined, path);
  const operators = registry
    .select(options.operators ?? "all")
    .filter((op) => op.formats.includes(ast.format))
    .filter((op) => trackFilter(options, operatorTrack(op)));

  const stats: PipelineStats = {
    attempted: 0,
    kept: 0,
    skippedNoSite: 0,
    skippedApplyFailed: 0,
    skippedEngineGate: 0,
    skippedEquivalent: 0,
    byOperator: {},
    byTrack: { hard: 0, soft: 0 },
  };

  const mutations: MutationResult[] = [];
  const equivalents: MutationResult[] = [];
  const seen = new Set<string>();

  for (const op of operators) {
    const track = operatorTrack(op);
    const sites = op.findMutationSites(ast);
    if (!sites.length) {
      stats.skippedNoSite++;
      continue;
    }

    for (let k = 0; k < variants; k++) {
      stats.attempted++;
      const { rng, key } = createMutationRng(salt, ast.sha256, op.code, k);
      const ordered = shuffle(sites, rng);
      const maxSites = options.maxSitesPerOperator ?? ordered.length;
      const candidates = ordered.slice(0, Math.max(1, maxSites));

      let applied = null as ReturnType<MutationOperator["apply"]>;
      let chosenSite: MutationSite | null = null;
      for (const s of candidates) {
        applied = op.apply(ast, s, k, rng);
        if (applied) {
          chosenSite = s;
          break;
        }
      }
      if (!applied || !chosenSite) {
        stats.skippedApplyFailed++;
        continue;
      }

      const brokenSha = sha256(applied.source);
      if (seen.has(`${op.code}:${brokenSha}`)) {
        stats.skippedApplyFailed++;
        continue;
      }
      seen.add(`${op.code}:${brokenSha}`);

      let equivalentDetected = false;
      let engineGatePassed = true;
      let engineMeta: MutationResult["engine"] = {
        goldenPass: null,
        brokenPass: null,
      };

      if (wantsEngineGate(options) || options.renderDiff) {
        const evalResult = evaluateMutation(ast.source, applied.source, ast.format, {
          timeoutMs,
          track,
          renderDiff: !!options.renderDiff,
          engineGate: wantsEngineGate(options),
        });
        equivalentDetected = evalResult.equivalentDetected;
        engineGatePassed = wantsEngineGate(options)
          ? evalResult.engineGatePassed
          : true;
        engineMeta = {
          goldenPass: evalResult.goldenCompile.pass,
          brokenPass: evalResult.brokenCompile.pass,
          brokenErrors: evalResult.brokenCompile.errors,
          brokenWarnings: evalResult.brokenCompile.warnings,
          reason: evalResult.reason,
        };
        if (equivalentDetected) stats.skippedEquivalent++;
        if (wantsEngineGate(options) && !engineGatePassed && !equivalentDetected) {
          stats.skippedEngineGate++;
          continue;
        }
      } else {
        const g = staticGate(ast.source, applied.source);
        engineGatePassed = g.passed;
        if (!engineGatePassed) {
          stats.skippedEngineGate++;
          continue;
        }
      }

      const id = mutationId(path, op.code, k, applied.original, applied.mutated);
      const result: MutationResult = {
        id,
        operator: op.code,
        operatorName: op.name,
        tier: op.tier,
        track,
        format: ast.format,
        scope: op.scope,
        seedDocument: path,
        seedHash: `sha256:${ast.sha256}`,
        mutationSite: {
          line: applied.faultLine,
          column: applied.faultColumn,
          nodeType: applied.nodeType,
        },
        original: applied.original,
        mutated: applied.mutated,
        variantIndex: k,
        prngSeed: key,
        broken: applied.source,
        golden: ast.source,
        brokenSha,
        goldenSha: ast.sha256,
        equivalentDetected,
        engineGatePassed,
        engine: engineMeta,
        groundTruthPatch: {
          remove: applied.mutated,
          add: applied.original,
        },
        rationale: op.rationale,
        replication: {
          salt,
          k,
          oracle: wantsEngineGate(options)
            ? "engine"
            : options.renderDiff
              ? "render-diff"
              : "static",
        },
      };

      if (equivalentDetected) {
        equivalents.push(result);
        if (excludeEquivalent) continue;
      }

      if (wantsEngineGate(options) && !engineGatePassed) {
        continue;
      }

      mutations.push(result);
      stats.kept++;
      stats.byOperator[op.code] = (stats.byOperator[op.code] ?? 0) + 1;
      stats.byTrack[track]++;
    }
  }

  mutations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  equivalents.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    mutations,
    equivalents,
    stats,
    format: ast.format,
    seedHash: ast.sha256,
  };
}

/**
 * Mutate using a pre-parsed AST (re-parses source; path preserved).
 */
export function mutateWithAst(
  ast: DocumentAST,
  options: MutateOptions = {},
  registry: OperatorRegistry = defaultRegistry,
): PipelineResult {
  return mutateDocument(ast.source, { ...options, path: options.path ?? ast.path }, registry);
}

/** Convenience: apply one operator once with fixed variant. */
export function applyOne(
  source: string,
  operatorCode: string,
  variantIndex = 0,
  salt: string | number = DEFAULT_SALT,
  path = "document",
  registry: OperatorRegistry = defaultRegistry,
): MutationResult | null {
  const op = registry.get(operatorCode);
  if (!op) return null;
  const result = mutateDocument(
    source,
    { salt, operators: [operatorCode], variants: variantIndex + 1, path },
    registry,
  );
  return result.mutations.find((m) => m.variantIndex === variantIndex) ?? result.mutations[0] ?? null;
}

export { pick, shuffle };

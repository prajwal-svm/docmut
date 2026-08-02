/**
 * DocMut mutation pipeline — apply operators, optional engine/render gates.
 */

import type {
  DocumentAST,
  DocumentFormat,
  MutateOptions,
  MutationOperator,
  MutationResult,
  MutationSite,
} from "./types.js";
import { DEFAULT_SALT } from "./types.js";
import { createMutationRng, mutationId, pick, sha256, shuffle } from "./prng.js";
import { parseDocument } from "./mutation-site.js";
import { defaultRegistry, OperatorRegistry } from "./registry.js";
import { engineGate, renderDiff, staticGate } from "./render-diff.js";

export interface PipelineStats {
  attempted: number;
  kept: number;
  skippedNoSite: number;
  skippedApplyFailed: number;
  skippedEngineGate: number;
  skippedEquivalent: number;
  byOperator: Record<string, number>;
}

export interface PipelineResult {
  mutations: MutationResult[];
  stats: PipelineStats;
  format: DocumentFormat;
  seedHash: string;
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
  const formatHint = options.path
    ? undefined
    : undefined;

  const ast = parseDocument(source, formatHint as DocumentFormat | undefined, path);
  const operators = registry.select(options.operators ?? "all").filter((op) =>
    op.formats.includes(ast.format),
  );

  const stats: PipelineStats = {
    attempted: 0,
    kept: 0,
    skippedNoSite: 0,
    skippedApplyFailed: 0,
    skippedEngineGate: 0,
    skippedEquivalent: 0,
    byOperator: {},
  };

  const mutations: MutationResult[] = [];
  const seen = new Set<string>();

  for (const op of operators) {
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

      // Dedup identical broken sources
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

      if (options.engineGate || options.renderDiff) {
        if (options.renderDiff) {
          const rd = renderDiff(ast.source, applied.source, ast.format);
          equivalentDetected = rd.equivalent;
          engineMeta = {
            goldenPass: rd.goldenCompile.pass,
            brokenPass: rd.mutantCompile.pass,
            brokenErrors: rd.mutantCompile.errors,
          };
          if (equivalentDetected) {
            stats.skippedEquivalent++;
            // Still record with flag if caller wants transparency; default exclude from kept
            // We include in results with equivalentDetected=true for logging, but count separately.
          }
        }

        if (options.engineGate) {
          const gate = engineGate(ast.source, applied.source, ast.format);
          engineGatePassed = gate.passed;
          engineMeta = {
            goldenPass: gate.goldenPass,
            brokenPass: gate.brokenPass,
            brokenErrors: gate.brokenErrors,
          };
          if (!engineGatePassed && !equivalentDetected) {
            stats.skippedEngineGate++;
            continue;
          }
        }
      } else {
        // Static: must differ
        const g = staticGate(ast.source, applied.source);
        engineGatePassed = g.passed;
        if (!engineGatePassed) {
          stats.skippedEngineGate++;
          continue;
        }
      }

      // Exclude equivalent mutants from the final dataset (still transparent via stats)
      if (equivalentDetected) {
        continue;
      }

      // For engine gate mode, only keep if gate passed
      if (options.engineGate && !engineGatePassed) {
        continue;
      }

      const id = mutationId(path, op.code, k, applied.original, applied.mutated);
      const result: MutationResult = {
        id,
        operator: op.code,
        operatorName: op.name,
        tier: op.tier,
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
        equivalentDetected: false,
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
          oracle: options.engineGate ? "engine" : "static",
        },
      };

      mutations.push(result);
      stats.kept++;
      stats.byOperator[op.code] = (stats.byOperator[op.code] ?? 0) + 1;
    }
  }

  mutations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    mutations,
    stats,
    format: ast.format,
    seedHash: ast.sha256,
  };
}

/**
 * Mutate using a pre-parsed AST (avoids re-parse when sites are precomputed).
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

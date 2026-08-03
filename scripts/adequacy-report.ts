#!/usr/bin/env node
/**
 * Adequacy / operator-manifest report for DocMut seed documents.
 *
 * Usage:
 *   pnpm adequacy --manifest-only --out evidence/operator-manifest.json
 *   pnpm adequacy --seed fixtures/sample.tex --variants 2 --engine-gate --out evidence/adequacy-sample-tex.json
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ALL_OPERATORS,
  DEFAULT_SALT,
  buildOperatorManifest,
  mutateDocument,
  operatorTrack,
  parseDocument,
  defaultRegistry,
  type DocumentFormat,
} from "../src/index.js";

interface Args {
  seed?: string;
  out?: string;
  variants: number;
  engineGate: boolean;
  renderDiff: boolean;
  manifestOnly: boolean;
  operators: string;
  salt: string | number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    variants: 2,
    engineGate: false,
    renderDiff: false,
    manifestOnly: false,
    operators: "all",
    salt: DEFAULT_SALT,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? "";
    switch (a) {
      case "--seed":
        args.seed = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--variants":
        args.variants = Number(next()) || 2;
        break;
      case "--engine-gate":
        args.engineGate = true;
        break;
      case "--render-diff":
        args.renderDiff = true;
        break;
      case "--manifest-only":
        args.manifestOnly = true;
        break;
      case "--operators":
        args.operators = next();
        break;
      case "--salt":
        args.salt = next();
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function usage(): string {
  return `DocMut adequacy report

  --manifest-only          Emit operator manifest only
  --seed <file>            Seed document
  --operators <spec>       Operator selection (default all)
  --variants <n>           Variants per operator (default 2)
  --engine-gate            Enable engine gate
  --render-diff            Enable render-text equivalence filter
  --salt <v>               Global salt (default ${DEFAULT_SALT})
  --out <path>             Write JSON report
`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const manifest = buildOperatorManifest(ALL_OPERATORS, "0.2.0");

  if (args.manifestOnly) {
    writeJson(args.out, manifest);
    console.log(
      JSON.stringify(
        {
          operatorCount: manifest.operatorCount,
          contentSha256: manifest.contentSha256,
          hardCount: manifest.hardCount,
          softCount: manifest.softCount,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!args.seed) {
    console.error("error: --seed required unless --manifest-only");
    process.exit(1);
  }

  const seedPath = resolve(args.seed);
  if (!existsSync(seedPath)) {
    console.error(`error: seed not found: ${seedPath}`);
    process.exit(1);
  }

  const source = readFileSync(seedPath, "utf8");
  const ast = parseDocument(source, undefined, seedPath);
  const ops = defaultRegistry.select(args.operators);

  const perOperator: Array<Record<string, unknown>> = [];
  for (const op of ops) {
    if (!op.formats.includes(ast.format)) continue;
    const sites = op.findMutationSites(ast);
    const result = mutateDocument(source, {
      salt: args.salt,
      operators: [op.code],
      variants: args.variants,
      path: seedPath,
      engineGate: args.engineGate,
      renderDiff: args.renderDiff,
    });
    perOperator.push({
      code: op.code,
      name: op.name,
      tier: op.tier,
      track: operatorTrack(op),
      format: ast.format,
      sitesFound: sites.length,
      attempted: result.stats.attempted,
      kept: result.stats.kept,
      skippedNoSite: result.stats.skippedNoSite,
      skippedApplyFailed: result.stats.skippedApplyFailed,
      skippedEngineGate: result.stats.skippedEngineGate,
      skippedEquivalent: result.stats.skippedEquivalent,
      retention:
        result.stats.attempted > 0
          ? result.stats.kept / result.stats.attempted
          : null,
      keptBrokenShas: result.mutations.map((m) => m.brokenSha),
    });
  }

  const report = {
    version: "0.2.0",
    seed: seedPath,
    seedHash: ast.sha256,
    format: ast.format as DocumentFormat,
    salt: args.salt,
    engineGate: args.engineGate,
    renderDiff: args.renderDiff,
    variants: args.variants,
    operatorManifestSha256: manifest.contentSha256,
    summary: {
      operatorsConsidered: perOperator.length,
      operatorsWithSites: perOperator.filter((r) => (r.sitesFound as number) > 0)
        .length,
      operatorsWithKept: perOperator.filter((r) => (r.kept as number) > 0).length,
      totalKept: perOperator.reduce((a, r) => a + (r.kept as number), 0),
    },
    perOperator,
    manifest,
  };

  writeJson(args.out, report);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`operatorManifestSha256: ${manifest.contentSha256}`);
  if (args.out) console.log(`wrote ${args.out}`);
}

function writeJson(out: string | undefined, data: unknown): void {
  if (!out) {
    if (!process.argv.includes("--manifest-only")) return;
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

main();

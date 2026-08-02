#!/usr/bin/env node
/**
 * DocMut CLI
 *
 * Usage:
 *   docmut --seed doc.tex --operators all --variants 5 --salt 20260802
 *   docmut --catalog ../dataset/catalog.json --operators tier1 --variants 3 --out mutations.json
 *   docmut --seed doc.tex --operators TEX-BRC-DRP,TEX-MTH-REL --engine-gate --render-diff
 *   docmut --list-operators
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_OPERATORS,
  DEFAULT_SALT,
  mutateDocument,
  defaultRegistry,
  type MutationResult,
  type DocumentFormat,
} from "./index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  seed?: string;
  catalog?: string;
  operators: string;
  variants: number;
  salt: string | number;
  out?: string;
  engineGate: boolean;
  renderDiff: boolean;
  listOperators: boolean;
  limit?: number;
  writeBroken?: string;
  help: boolean;
  format?: DocumentFormat;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    operators: "all",
    variants: 5,
    salt: DEFAULT_SALT,
    engineGate: false,
    renderDiff: false,
    listOperators: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? "";
    switch (a) {
      case "--seed":
      case "-s":
        args.seed = next();
        break;
      case "--catalog":
      case "-c":
        args.catalog = next();
        break;
      case "--operators":
      case "-o":
        args.operators = next();
        break;
      case "--variants":
      case "-k":
        args.variants = Number(next()) || 5;
        break;
      case "--salt":
        args.salt = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--engine-gate":
        args.engineGate = true;
        break;
      case "--render-diff":
        args.renderDiff = true;
        break;
      case "--list-operators":
        args.listOperators = true;
        break;
      case "--limit":
        args.limit = Number(next()) || undefined;
        break;
      case "--write-broken":
        args.writeBroken = next();
        break;
      case "--format":
        args.format = next() as DocumentFormat;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (!a.startsWith("-") && !args.seed) args.seed = a;
        break;
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`DocMut — document mutation testing for LaTeX, Typst, and Markdown

Usage:
  docmut --seed <file> [options]
  docmut --catalog <catalog.json> [options]
  docmut --list-operators

Options:
  --seed, -s <path>         Seed document (.tex / .typ / .md)
  --catalog, -c <path>      Dataset catalog.json (batch mode)
  --operators, -o <spec>    all | tier1|tier2|tier3 | latex|typst|markdown | CODE,CODE
  --variants, -k <n>        Variants per operator (default: 5)
  --salt <value>            Global salt (default: ${DEFAULT_SALT})
  --out <path>              Write mutations JSON to path
  --write-broken <dir>      Write each broken document as a standalone file
  --engine-gate             Keep only mutations where golden compiles and broken fails
  --render-diff             Exclude equivalent mutants via PDF text comparison
  --limit <n>               Limit number of catalog documents
  --format <fmt>            Force format: latex | typst | markdown
  --list-operators          Print the operator catalog
  --help, -h                Show this help

Examples:
  docmut --seed article.tex --operators tier1 --variants 3
  docmut --seed paper.typ --operators TYP-IMP-DRP --out muts.json
  docmut --catalog ../dataset/catalog.json --operators all --variants 2 --limit 10
`);
}

function listOperators(): void {
  console.log(`DocMut operator catalog (${ALL_OPERATORS.length} operators)\n`);
  console.log(
    "CODE".padEnd(16) +
      "NAME".padEnd(24) +
      "TIER".padEnd(6) +
      "FORMAT".padEnd(12) +
      "SCOPE",
  );
  console.log("-".repeat(80));
  for (const op of ALL_OPERATORS) {
    console.log(
      op.code.padEnd(16) +
        op.name.padEnd(24) +
        String(op.tier).padEnd(6) +
        op.formats.join(",").padEnd(12) +
        op.scope,
    );
  }
}

function writeBrokenFiles(mutations: MutationResult[], dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const m of mutations) {
    const ext =
      m.format === "latex" ? ".tex" : m.format === "typst" ? ".typ" : ".md";
    const file = join(dir, `${m.id}${ext}`);
    writeFileSync(file, m.broken, "utf8");
  }
  // Also write a harness-compatible instances.json
  const instances = mutations.map((m) => ({
    id: m.id,
    version: 1,
    seed: m.seedDocument,
    category: m.operator,
    track: m.tier === 1 ? "hard" : m.tier === 2 ? "hard" : "hard",
    categoryLabel: m.operatorName,
    group: m.scope,
    faultLine: m.mutationSite.line,
    faultLabel: `${m.original} -> ${m.mutated}`,
    rationale: m.rationale,
    groundTruthPatch: m.groundTruthPatch,
    broken: m.broken,
    golden: m.golden,
    brokenSha: m.brokenSha,
    goldenSha: m.goldenSha,
    operator: m.operator,
    operatorName: m.operatorName,
    tier: m.tier,
    format: m.format,
    scope: m.scope,
    mutationSite: m.mutationSite,
    original: m.original,
    mutated: m.mutated,
    variantIndex: m.variantIndex,
    prngSeed: m.prngSeed,
    equivalentDetected: m.equivalentDetected,
    engineGatePassed: m.engineGatePassed,
    replication: m.replication,
  }));
  writeFileSync(
    join(dir, "instances.json"),
    JSON.stringify(
      {
        version: 1,
        count: instances.length,
        generatedBy: "docmut",
        instances,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function mutateOneFile(
  path: string,
  args: CliArgs,
): { mutations: MutationResult[]; stats: ReturnType<typeof mutateDocument>["stats"] } {
  const source = readFileSync(path, "utf8");
  const result = mutateDocument(source, {
    salt: args.salt,
    operators: args.operators.split(",").map((s) => s.trim()),
    variants: args.variants,
    engineGate: args.engineGate,
    renderDiff: args.renderDiff,
    path: path,
  });
  return result;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.listOperators) {
    listOperators();
    process.exit(0);
  }

  if (!args.seed && !args.catalog) {
    console.error("Error: provide --seed <file> or --catalog <catalog.json>");
    printHelp();
    process.exit(1);
  }

  console.error(
    `[docmut] operators registered: ${defaultRegistry.size}; salt=${args.salt}; variants=${args.variants}`,
  );

  const allMutations: MutationResult[] = [];
  const aggregate = {
    attempted: 0,
    kept: 0,
    skippedNoSite: 0,
    skippedApplyFailed: 0,
    skippedEngineGate: 0,
    skippedEquivalent: 0,
  };

  if (args.seed) {
    const path = resolve(args.seed);
    if (!existsSync(path)) {
      console.error(`[docmut] seed not found: ${path}`);
      process.exit(1);
    }
    console.error(`[docmut] mutating ${path}`);
    const { mutations, stats } = mutateOneFile(path, args);
    allMutations.push(...mutations);
    for (const k of Object.keys(aggregate) as (keyof typeof aggregate)[]) {
      aggregate[k] += stats[k];
    }
    console.error(
      `[docmut] kept ${stats.kept}/${stats.attempted} (noSite=${stats.skippedNoSite}, applyFail=${stats.skippedApplyFailed}, engine=${stats.skippedEngineGate}, equiv=${stats.skippedEquivalent})`,
    );
  }

  if (args.catalog) {
    const catalogPath = resolve(args.catalog);
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      documents?: Array<{
        id: string;
        format: string;
        file_path: string;
      }>;
    };
    const docs = catalog.documents ?? [];
    const catalogDir = dirname(catalogPath);
    const limit = args.limit ?? docs.length;
    let processed = 0;
    for (const doc of docs) {
      if (processed >= limit) break;
      const filePath = join(catalogDir, doc.file_path);
      if (!existsSync(filePath)) {
        console.error(`[docmut] skip missing: ${filePath}`);
        continue;
      }
      // Filter operators by document format if operators=all
      const { mutations, stats } = mutateOneFile(filePath, args);
      allMutations.push(...mutations);
      for (const k of Object.keys(aggregate) as (keyof typeof aggregate)[]) {
        aggregate[k] += stats[k];
      }
      processed++;
      if (processed % 50 === 0 || processed === limit) {
        console.error(
          `[docmut] progress ${processed}/${Math.min(limit, docs.length)} docs; mutations so far: ${allMutations.length}`,
        );
      }
    }
    console.error(`[docmut] catalog done: ${processed} docs, ${allMutations.length} mutations`);
  }

  // Deterministic sort
  allMutations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const output = {
    version: 1,
    generatedBy: "docmut",
    salt: args.salt,
    operators: args.operators,
    variants: args.variants,
    count: allMutations.length,
    stats: aggregate,
    operatorCounts: ALL_OPERATORS.reduce(
      (acc, op) => {
        acc[op.code] = allMutations.filter((m) => m.operator === op.code).length;
        return acc;
      },
      {} as Record<string, number>,
    ),
    mutations: allMutations,
  };

  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(args.out, JSON.stringify(output, null, 2), "utf8");
    console.error(`[docmut] wrote ${allMutations.length} mutations → ${args.out}`);
  } else {
    // Print summary + first few to stdout
    console.log(JSON.stringify({ ...output, mutations: allMutations.slice(0, 5) }, null, 2));
    if (allMutations.length > 5) {
      console.error(`[docmut] (showing 5/${allMutations.length}; use --out to write all)`);
    }
  }

  if (args.writeBroken) {
    writeBrokenFiles(allMutations, resolve(args.writeBroken));
    console.error(`[docmut] wrote broken sources → ${args.writeBroken}`);
  }

  console.error(
    `[docmut] done: kept=${aggregate.kept} attempted=${aggregate.attempted}`,
  );
}

main();

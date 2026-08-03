/**
 * Frozen operator manifest for paper provenance and integrity checks.
 */

import { createHash } from "node:crypto";
import type { MutationOperator } from "./types.js";
import { operatorTrack } from "./types.js";
import { defaultRegistry } from "./registry.js";

export interface OperatorManifestEntry {
  code: string;
  name: string;
  tier: 1 | 2 | 3;
  track: "hard" | "soft";
  formats: string[];
  scope: string;
  rationale: string;
}

export interface OperatorManifest {
  version: string;
  generatedAt: string;
  operatorCount: number;
  hardCount: number;
  softCount: number;
  byFormat: Record<string, number>;
  operators: OperatorManifestEntry[];
  /** SHA-256 of canonical operator list (codes + tracks + tiers). */
  contentSha256: string;
}

function canonicalPayload(entries: OperatorManifestEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      code: e.code,
      tier: e.tier,
      track: e.track,
      formats: e.formats,
      scope: e.scope,
    })),
  );
}

/** Build a deterministic operator manifest from a registry snapshot. */
export function buildOperatorManifest(
  operators: MutationOperator[] = defaultRegistry.all(),
  version = "0.2.0",
): OperatorManifest {
  const entries: OperatorManifestEntry[] = operators
    .map((o) => ({
      code: o.code,
      name: o.name,
      tier: o.tier,
      track: operatorTrack(o),
      formats: [...o.formats].sort(),
      scope: o.scope,
      rationale: o.rationale,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const byFormat: Record<string, number> = { latex: 0, typst: 0, markdown: 0 };
  for (const e of entries) {
    for (const f of e.formats) byFormat[f] = (byFormat[f] ?? 0) + 1;
  }

  const contentSha256 = createHash("sha256")
    .update(canonicalPayload(entries))
    .digest("hex");

  return {
    version,
    generatedAt: new Date().toISOString(),
    operatorCount: entries.length,
    hardCount: entries.filter((e) => e.track === "hard").length,
    softCount: entries.filter((e) => e.track === "soft").length,
    byFormat,
    operators: entries,
    contentSha256,
  };
}

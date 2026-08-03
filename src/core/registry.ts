/**
 * Operator registry — plugin pattern (cosmic-ray style).
 *
 * Users can register custom operators without forking.
 * Selection: by code, name, format, tier, or "all".
 */

import type {
  DocumentFormat,
  MutationOperator,
  OperatorTier,
} from "./types.js";

export class OperatorRegistry {
  private ops = new Map<string, MutationOperator>();

  /** Register (or replace) an operator by code. */
  register(op: MutationOperator): this {
    this.ops.set(op.code, op);
    return this;
  }

  /** Register many operators. */
  registerAll(ops: MutationOperator[]): this {
    for (const op of ops) this.register(op);
    return this;
  }

  get(code: string): MutationOperator | undefined {
    return this.ops.get(code);
  }

  has(code: string): boolean {
    return this.ops.has(code);
  }

  /** All registered operators (stable sort by code). */
  all(): MutationOperator[] {
    return [...this.ops.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  codes(): string[] {
    return this.all().map((o) => o.code);
  }

  byFormat(format: DocumentFormat): MutationOperator[] {
    return this.all().filter((o) => o.formats.includes(format));
  }

  byTier(tier: OperatorTier): MutationOperator[] {
    return this.all().filter((o) => o.tier === tier);
  }

  /**
   * Resolve a selection expression to operators.
   *
   * Accepts:
   * - "all"
   * - "tier1" | "tier2" | "tier3"
   * - "latex" | "typst" | "markdown"
   * - comma-separated codes: "TEX-BRC-DRP,TEX-MTH-REL"
   * - array of the above tokens
   */
  select(spec: string[] | "all" | string = "all"): MutationOperator[] {
    if (spec === "all" || (Array.isArray(spec) && spec.length === 1 && spec[0] === "all")) {
      return this.all();
    }
    const tokens = (Array.isArray(spec) ? spec : String(spec).split(","))
      .map((t) => t.trim())
      .filter(Boolean);

    if (!tokens.length) return this.all();

    const selected = new Map<string, MutationOperator>();
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (lower === "all") {
        for (const op of this.all()) selected.set(op.code, op);
        continue;
      }
      if (lower === "tier1" || lower === "tier-1" || lower === "structural") {
        for (const op of this.byTier(1)) selected.set(op.code, op);
        continue;
      }
      if (lower === "tier2" || lower === "tier-2" || lower === "semantic") {
        for (const op of this.byTier(2)) selected.set(op.code, op);
        continue;
      }
      if (lower === "tier3" || lower === "tier-3" || lower === "realistic") {
        for (const op of this.byTier(3)) selected.set(op.code, op);
        continue;
      }
      if (lower === "latex" || lower === "tex") {
        for (const op of this.byFormat("latex")) selected.set(op.code, op);
        continue;
      }
      if (lower === "typst" || lower === "typ") {
        for (const op of this.byFormat("typst")) selected.set(op.code, op);
        continue;
      }
      if (lower === "markdown" || lower === "md") {
        for (const op of this.byFormat("markdown")) selected.set(op.code, op);
        continue;
      }
      if (lower === "hard") {
        for (const op of this.all()) {
          if ((op.track ?? "hard") === "hard") selected.set(op.code, op);
        }
        continue;
      }
      if (lower === "soft") {
        for (const op of this.all()) {
          if (op.track === "soft") selected.set(op.code, op);
        }
        continue;
      }
      // Direct code or name match
      const byCode = this.ops.get(token) ?? this.ops.get(token.toUpperCase());
      if (byCode) {
        selected.set(byCode.code, byCode);
        continue;
      }
      const byName = this.all().find(
        (o) => o.name.toLowerCase() === lower || o.code.toLowerCase() === lower,
      );
      if (byName) selected.set(byName.code, byName);
    }
    return [...selected.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  get size(): number {
    return this.ops.size;
  }
}

/** Default global registry (populated by index.ts after operators load). */
export const defaultRegistry = new OperatorRegistry();

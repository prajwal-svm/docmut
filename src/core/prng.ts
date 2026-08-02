/**
 * Deterministic seeded PRNG for DocMut.
 *
 * Seed formula (from PLANNING.md):
 *   hash(salt + seedHash + operatorCode + variantIndex)
 *
 * Uses FNV-1a 32-bit for the string→seed hash and mulberry32 for the stream.
 * Same inputs → same mutation on every machine.
 */

import { createHash } from "node:crypto";

/** mulberry32 — small, fast, well-distributed PRNG. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string → unsigned 32-bit seed. */
export function seedFromString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Canonical PRNG seed key for a mutation.
 * Format: `${salt}:${seedHash}:${operatorCode}:${variantIndex}`
 */
export function makePrngKey(
  salt: string | number,
  seedHash: string,
  operatorCode: string,
  variantIndex: number,
): string {
  return `${salt}:${seedHash}:${operatorCode}:${variantIndex}`;
}

/** Create a mulberry32 stream from the canonical DocMut seed inputs. */
export function createMutationRng(
  salt: string | number,
  seedHash: string,
  operatorCode: string,
  variantIndex: number,
): { rng: () => number; key: string; seed: number } {
  const key = makePrngKey(salt, seedHash, operatorCode, variantIndex);
  const seed = seedFromString(key);
  return { rng: mulberry32(seed), key, seed };
}

/** SHA-256 hex of a UTF-8 string. */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Stable short id for a mutation record. */
export function mutationId(
  seedPath: string,
  operatorCode: string,
  variantIndex: number,
  original: string,
  mutated: string,
): string {
  const h = sha256(`${seedPath}:${operatorCode}:${variantIndex}:${original}:${mutated}`);
  return `docmut-${h.slice(0, 12)}`;
}

/** Pick a uniform element from a non-empty array using rng ∈ [0,1). */
export function pick<T>(arr: readonly T[], rng: () => number): T {
  if (arr.length === 0) throw new Error("pick() on empty array");
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

/** Shuffle a copy of an array with Fisher–Yates using rng. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Integer in [0, n) from rng. */
export function randInt(n: number, rng: () => number): number {
  if (n <= 0) return 0;
  return Math.floor(rng() * n) % n;
}

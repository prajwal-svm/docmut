/**
 * Determinism: same seed + params → same output, every time.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  mutateDocument,
  createMutationRng,
  seedFromString,
  mulberry32,
  makePrngKey,
  DEFAULT_SALT,
  sha256,
} from "../src/index.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const sampleTex = readFileSync(join(FIX, "sample.tex"), "utf8");
const sampleTyp = readFileSync(join(FIX, "sample.typ"), "utf8");
const sampleMd = readFileSync(join(FIX, "sample.md"), "utf8");

describe("PRNG determinism", () => {
  it("mulberry32 is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("seedFromString is stable", () => {
    expect(seedFromString("hello")).toBe(seedFromString("hello"));
    expect(seedFromString("hello")).not.toBe(seedFromString("world"));
  });

  it("createMutationRng key format matches PLANNING.md", () => {
    const key = makePrngKey(20260802, "abc", "TEX-BRC-DRP", 2);
    expect(key).toBe("20260802:abc:TEX-BRC-DRP:2");
    const { key: k2, seed } = createMutationRng(20260802, "abc", "TEX-BRC-DRP", 2);
    expect(k2).toBe(key);
    expect(seed).toBe(seedFromString(key));
  });
});

describe("mutation determinism", () => {
  it("same latex inputs → identical broken sources", () => {
    const opts = {
      salt: DEFAULT_SALT,
      operators: ["TEX-BRC-DRP", "TEX-ENV-REN", "TEX-MTH-REL", "TEX-CLS-DRP"],
      variants: 3,
      path: "sample.tex",
    };
    const a = mutateDocument(sampleTex, opts);
    const b = mutateDocument(sampleTex, opts);
    expect(a.mutations.length).toBe(b.mutations.length);
    expect(a.mutations.length).toBeGreaterThan(0);
    for (let i = 0; i < a.mutations.length; i++) {
      expect(a.mutations[i]!.id).toBe(b.mutations[i]!.id);
      expect(a.mutations[i]!.broken).toBe(b.mutations[i]!.broken);
      expect(a.mutations[i]!.prngSeed).toBe(b.mutations[i]!.prngSeed);
      expect(a.mutations[i]!.brokenSha).toBe(sha256(a.mutations[i]!.broken));
    }
  });

  it("same typst inputs → identical broken sources", () => {
    const opts = {
      salt: DEFAULT_SALT,
      operators: ["tier1"],
      variants: 2,
      path: "sample.typ",
    };
    const a = mutateDocument(sampleTyp, opts);
    const b = mutateDocument(sampleTyp, opts);
    expect(a.mutations.map((m) => m.brokenSha)).toEqual(b.mutations.map((m) => m.brokenSha));
  });

  it("same markdown inputs → identical broken sources", () => {
    const opts = {
      salt: DEFAULT_SALT,
      operators: ["all"],
      variants: 2,
      path: "sample.md",
    };
    const a = mutateDocument(sampleMd, opts);
    const b = mutateDocument(sampleMd, opts);
    expect(a.mutations.map((m) => m.id)).toEqual(b.mutations.map((m) => m.id));
    expect(a.mutations.map((m) => m.broken)).toEqual(b.mutations.map((m) => m.broken));
  });

  it("different salt → different PRNG seeds", () => {
    const a = mutateDocument(sampleTex, {
      salt: 20260802,
      operators: ["TEX-BRC-DRP"],
      variants: 1,
      path: "sample.tex",
    });
    const b = mutateDocument(sampleTex, {
      salt: 99999999,
      operators: ["TEX-BRC-DRP"],
      variants: 1,
      path: "sample.tex",
    });
    if (a.mutations.length && b.mutations.length) {
      expect(a.mutations[0]!.prngSeed).not.toBe(b.mutations[0]!.prngSeed);
    }
  });

  it("variant index is embedded in prngSeed", () => {
    const result = mutateDocument(sampleTex, {
      salt: DEFAULT_SALT,
      operators: ["TEX-ENV-REN"],
      variants: 3,
      path: "sample.tex",
    });
    for (const m of result.mutations) {
      expect(m.prngSeed.endsWith(`:${m.variantIndex}`)).toBe(true);
    }
  });
});

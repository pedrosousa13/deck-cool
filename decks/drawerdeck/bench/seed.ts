// Deterministic shuffling for the interleaved run (#266: "every rep goes
// through the four drawers in a freshly shuffled order (seeded, with the
// seed recorded)"). mulberry32, seeded from a short string via FNV-1a: a
// small, dependency-free, non-cryptographic PRNG, good enough to pick a
// reproducible deck order, not to defend against anything.

export function resolveSeed(): string {
  return process.env.BENCH_SEED ?? `local-${Date.now()}`;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): () => number {
  return mulberry32(fnv1a(seed));
}

/** Fisher-Yates, consuming `rng()` from one ongoing deterministic stream:
 * the same seed and the same call order always produce the same sequence of
 * shuffles, so a run is reproducible from its recorded seed alone. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

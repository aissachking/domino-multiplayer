/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * The exact same algorithm is implemented in `mobile/lib/engine/rng.dart` so
 * that a seed produces the identical deal on the server, in tests and in the
 * offline Flutter engine. Online matches use a cryptographic random source
 * instead (see backend), mulberry32 is used for offline play and test vectors.
 */
export type RandomSource = () => number;

export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unbiased Fisher–Yates shuffle that returns a new array. */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

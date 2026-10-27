/// Deterministic pseudo-random generator (mulberry32).
///
/// Bit-for-bit identical to `game-engine/src/rng.ts`, so the same seed deals
/// the same tiles in Dart and TypeScript (verified by the engine vectors test).
library;

typedef RandomSource = double Function();

const int _mask32 = 0xffffffff;

/// 32-bit multiply keeping the low 32 bits (Math.imul semantics, unsigned).
int imul32(int a, int b) {
  final aHi = (a >> 16) & 0xffff;
  final aLo = a & 0xffff;
  final bHi = (b >> 16) & 0xffff;
  final bLo = b & 0xffff;
  final cross = ((aHi * bLo + aLo * bHi) & 0xffff) << 16;
  return (aLo * bLo + cross) & _mask32;
}

RandomSource mulberry32(int seed) {
  var a = seed & _mask32;
  return () {
    a = (a + 0x6d2b79f5) & _mask32;
    var t = a;
    t = imul32(t ^ (t >> 15), t | 1);
    t = (t ^ ((t + imul32(t ^ (t >> 7), t | 61)) & _mask32)) & _mask32;
    return ((t ^ (t >> 14)) & _mask32) / 4294967296.0;
  };
}

/// Unbiased Fisher–Yates shuffle returning a new list.
List<T> shuffle<T>(List<T> items, RandomSource random) {
  final out = List<T>.of(items);
  for (var i = out.length - 1; i > 0; i--) {
    final j = (random() * (i + 1)).floor();
    final tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

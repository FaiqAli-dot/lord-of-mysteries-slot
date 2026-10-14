/**
 * Deterministic mulberry32 PRNG — math outcomes use this exclusively.
 * Visual-only effects may use a separate stream derived from the same seed.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inclusive integer range. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Cannot pick from empty array');
    return arr[this.int(0, arr.length - 1)]!;
  }

  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) throw new Error('Weights must sum > 0');
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  getSeed(): number {
    return this.state >>> 0;
  }

  fork(label: number): SeededRng {
    return new SeededRng((this.state ^ (label * 0x9e3779b9)) >>> 0);
  }
}

export function deriveSeed(base: number, spinCount: number): number {
  return (Math.imul(base ^ 0xdeadbeef, spinCount + 1) ^ (spinCount * 2654435761)) >>> 0;
}

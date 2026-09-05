export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  private nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  next(): number { return this.nextUint32() / 0x100000000; }

  int(min: number, max: number): number {
    const range = max - min + 1;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || range <= 0 || range > 0x100000000) {
      throw new Error(`Invalid random integer range: ${min} to ${max}.`);
    }
    const limit = 0x100000000 - (0x100000000 % range);
    let value: number;
    do value = this.nextUint32(); while (value >= limit);
    return min + (value % range);
  }

  shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  getState(): number { return this.state; }
}

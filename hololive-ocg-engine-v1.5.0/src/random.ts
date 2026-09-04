export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
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

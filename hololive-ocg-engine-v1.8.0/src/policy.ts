import type { ChoiceContext, DecisionPolicy } from "./types.ts";

export class DeterministicPolicy implements DecisionPolicy {
  chooseOne<T>(_context: ChoiceContext, options: readonly T[]): T {
    if (options.length === 0) throw new Error("Cannot choose from an empty list.");
    return options[0];
  }

  chooseMany<T>(_context: ChoiceContext, options: readonly T[], min: number, max: number): T[] {
    if (options.length < min) throw new Error(`Need at least ${min} options, found ${options.length}.`);
    return [...options].slice(0, Math.min(max, options.length));
  }

  chooseNumber(_context: ChoiceContext, _min: number, max: number): number { return max; }
  chooseYesNo(_context: ChoiceContext, defaultValue: boolean): boolean { return defaultValue; }
}

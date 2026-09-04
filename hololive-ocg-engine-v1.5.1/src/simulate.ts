import type { GameState, PlayerId } from "./types.ts";
import { loadGameData } from "./database.ts";
import { GameEngine } from "./engine.ts";
import { GreedyAI, GreedyDecisionPolicy } from "./ai.ts";

export interface SimulationOptions {
  seed: number;
  p1OshiId?: string;
  p2OshiId?: string;
  startingPlayer?: PlayerId;
  maxActions?: number;
}

export interface SimulationResult {
  state: GameState;
  actionCount: number;
}

export function simulateGame(options: SimulationOptions): SimulationResult {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({
    data: loadGameData(),
    seed: options.seed,
    p1OshiId: options.p1OshiId ?? "hSD01-002",
    p2OshiId: options.p2OshiId ?? "hSD01-001",
    startingPlayer: options.startingPlayer ?? "P1",
    policies: { P1: policy, P2: policy },
  });
  const ai = new GreedyAI();
  engine.setup();
  let actionCount = 0;
  const maxActions = options.maxActions ?? 10_000;
  while (engine.state.status === "ONGOING" && actionCount < maxActions) {
    const action = ai.chooseAction(engine, engine.state.activePlayer);
    engine.applyAction(action);
    actionCount++;
  }
  if (engine.state.status === "ONGOING") throw new Error(`Simulation exceeded ${maxActions} actions.`);
  return { state: engine.snapshot(), actionCount };
}

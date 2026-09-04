import { loadGameData } from "../src/database.ts";
import { GameEngine } from "../src/engine.ts";
import { GreedyDecisionPolicy } from "../src/ai.ts";
import type { CardInstance, HolomemState, PlayerId } from "../src/types.ts";

let fakeCounter = 0;

export function makeEngine(p1OshiId = "hSD01-002", p2OshiId = "hSD01-001", seed = 77, startingPlayer: PlayerId = "P1"): GameEngine {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), p1OshiId, p2OshiId, seed, startingPlayer, policies: { P1: policy, P2: policy } });
  engine.setup();
  return engine;
}

export function advanceCheer(engine: GameEngine): void {
  if (engine.state.phase === "CHEER") engine.applyAction(engine.listLegalActions()[0]);
}

export function fakeCard(cardId: string): CardInstance { return { uid: `TEST-${++fakeCounter}`, cardId }; }

export function fakeHolomem(cardId: string, enteredStageTurn = 0): HolomemState {
  return { stageId: `TEST-H-${++fakeCounter}`, stack: [fakeCard(cardId)], cheers: [], supports: [], damage: 0, resting: false, enteredStageTurn };
}

export function forceMain(engine: GameEngine, id: PlayerId): void {
  engine.state.activePlayer = id;
  engine.state.phase = "MAIN";
  engine.player(id).turnsTaken = Math.max(1, engine.player(id).turnsTaken);
  engine.player(id).turnFlags = { collabUsed: false, batonPassUsed: false, limitedUsed: false, oshiSkillUsed: false };
}

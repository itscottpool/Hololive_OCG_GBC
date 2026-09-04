import test from "node:test";
import assert from "node:assert/strict";
import { makeEngine, advanceCheer, fakeCard, fakeHolomem, forceMain } from "./helpers.ts";
import { simulateGame } from "../src/simulate.ts";
import { GreedyAI } from "../src/ai.ts";
import type { CardInstance, GameState, PlayerId } from "../src/types.ts";

test("setup creates legal stages, hands, Life, and the first Cheer decision", () => {
  const engine = makeEngine();
  for (const id of ["P1", "P2"] as PlayerId[]) {
    const p = engine.player(id);
    assert.ok(p.stage.center);
    assert.equal(engine.topCard(p.stage.center!).bloomLevel, "Debut");
    assert.ok(engine.allHolomem(id).length >= 1 && engine.allHolomem(id).length <= 6);
    assert.equal(p.life.length, engine.data.cards.get(p.oshiCardId)!.life);
    assert.ok(p.redrawCount <= 6);
  }
  assert.equal(engine.state.phase, "CHEER");
  assert.equal(engine.state.activePlayer, "P1");
});

test("starting player's first turn cannot Bloom, use LIMITED, or perform Arts", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 14, "P1");
  advanceCheer(engine);
  const p1 = engine.player("P1");
  p1.hand.push(fakeCard("hSD01-016"), fakeCard("hSD01-013"));
  assert.equal(engine.state.phase, "MAIN");
  assert.ok(!engine.listLegalActions().some(x => x.type === "PLAY_SUPPORT" && x.cardUid === p1.hand.find(c => c.cardId === "hSD01-016")!.uid));
  assert.ok(!engine.listLegalActions().some(x => x.type === "BLOOM"));
  engine.applyAction({ type: "END_MAIN", playerId: "P1" });
  assert.equal(engine.state.activePlayer, "P2");
  assert.notEqual(engine.state.phase, "PERFORMANCE");
  assert.ok(engine.state.log.some(x => x.event === "PERFORMANCE_SKIPPED"));
});

test("second player may use LIMITED on their first turn but still cannot Bloom", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 15, "P1");
  advanceCheer(engine);
  engine.applyAction({ type: "END_MAIN", playerId: "P1" });
  advanceCheer(engine);
  const p2 = engine.player("P2");
  const limited = fakeCard("hSD01-016");
  p2.hand.push(limited, fakeCard("hSD01-013"));
  assert.ok(engine.listLegalActions().some(x => x.type === "PLAY_SUPPORT" && x.cardUid === limited.uid));
  assert.ok(!engine.listLegalActions().some(x => x.type === "BLOOM"));
});

test("same seed produces a byte-equivalent final state", () => {
  const a = simulateGame({ seed: 12345 });
  const b = simulateGame({ seed: 12345 });
  assert.deepEqual(a, b);
});

test("200 varied games finish without loops or illegal transitions", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const result = simulateGame({ seed, startingPlayer: seed % 2 ? "P1" : "P2" });
    assert.notEqual(result.state.status, "ONGOING");
    assert.ok(result.actionCount < 10_000);
    assert.ok(result.state.winner === "P1" || result.state.winner === "P2" || result.state.status === "DRAW");
  }
});

test("every card instance remains in exactly one zone throughout completed games", () => {
  for (let seed = 310; seed < 330; seed++) {
    const state = simulateGame({ seed }).state;
    for (const id of ["P1", "P2"] as PlayerId[]) {
      const all = collectInstances(state, id);
      assert.equal(all.length, 70, `${id} should still own 70 non-Oshi instances`);
      assert.equal(new Set(all.map(x => x.uid)).size, 70, `${id} has a duplicated instance`);
    }
  }
});

test("knockout AI takes a lethal Art instead of spreading damage", () => {
  const engine = makeEngine();
  const ai = new GreedyAI();
  const attacker = fakeHolomem("hSD01-011");
  attacker.cheers.push(fakeCard("hY02-001"));
  const healthyCenter = fakeHolomem("hSD01-006");
  const woundedCollab = fakeHolomem("hSD01-010");
  woundedCollab.damage = 110;
  engine.player("P1").stage = { center: attacker, collab: null, back: [] };
  engine.player("P2").stage = { center: healthyCenter, collab: woundedCollab, back: [] };
  engine.state.activePlayer = "P1";
  engine.state.phase = "PERFORMANCE";

  const action = ai.chooseAction(engine, "P1");
  assert.equal(action.type, "USE_ART");
  if (action.type === "USE_ART") assert.equal(action.targetStageId, woundedCollab.stageId);
});

test("knockout AI sends Cheer where it immediately enables an attack", () => {
  const engine = makeEngine();
  const ai = new GreedyAI();
  const readyCenter = fakeHolomem("hBP01-044");
  readyCenter.cheers.push(fakeCard("hY01-001"));
  const unpoweredBack = fakeHolomem("hSD01-011");
  engine.player("P1").stage = { center: readyCenter, collab: null, back: [unpoweredBack] };
  engine.player("P1").pendingCheer = fakeCard("hY02-001");
  engine.state.activePlayer = "P1";
  engine.state.phase = "CHEER";

  const action = ai.chooseAction(engine, "P1");
  assert.deepEqual(action, { type: "ATTACH_CHEER", playerId: "P1", targetStageId: unpoweredBack.stageId });
});

test("Sora SP swaps in the opponent's easiest knockout target", () => {
  const engine = makeEngine("hSD01-001", "hSD01-002");
  forceMain(engine, "P1");
  const center = fakeHolomem("hBP01-021");
  center.cheers.push(fakeCard("hY01-001"));
  engine.player("P1").stage = { center, collab: null, back: [] };
  engine.player("P1").holoPower.push(fakeCard("hSD01-017"), fakeCard("hSD01-018"));
  const opponentCenter = fakeHolomem("hSD01-006");
  const sturdyBack = fakeHolomem("hSD01-010");
  const weakBack = fakeHolomem("hSD01-004");
  engine.player("P2").stage = { center: opponentCenter, collab: null, back: [sturdyBack, weakBack] };

  const skill = engine.listLegalActions("P1").find(x => x.type === "USE_OSHI_SKILL" && x.abilityIndex === 1);
  assert.ok(skill);
  engine.applyAction(skill!);
  assert.equal(engine.player("P2").stage.center?.stageId, weakBack.stageId);
});

function collectInstances(state: GameState, id: PlayerId): CardInstance[] {
  const p = state.players[id];
  const stage = [p.stage.center, p.stage.collab, ...p.stage.back].filter(Boolean);
  return [
    ...p.deck, ...p.cheerDeck, ...p.hand, ...p.archive, ...p.holoPower, ...p.life, ...p.resolution,
    ...(p.pendingCheer ? [p.pendingCheer] : []),
    ...stage.flatMap(h => [...h!.stack, ...h!.cheers, ...h!.supports]),
  ];
}

import test from "node:test";
import assert from "node:assert/strict";
import { makeEngine, advanceCheer, fakeCard, fakeHolomem, forceMain } from "./helpers.ts";
import type { AbilityDefinition, HolomemState } from "../src/types.ts";

const internals = (engine: ReturnType<typeof makeEngine>) => engine as unknown as {
  resolveEffect(id: "P1"|"P2", effect: AbilityDefinition, source?: HolomemState): void;
  resolveDowned(): void;
};

test("Sora SP resolves its +50 even when the opponent cannot swap", () => {
  const engine = makeEngine("hSD01-001", "hSD01-002", 21);
  advanceCheer(engine);
  forceMain(engine, "P1");
  const p1 = engine.player("P1");
  p1.stage.center = fakeHolomem("hBP01-021");
  engine.player("P2").stage.back = [];
  p1.holoPower.push(fakeCard("hBP01-044"), fakeCard("hBP01-044"));
  engine.applyAction({ type: "USE_OSHI_SKILL", playerId: "P1", abilityIndex: 1 });
  assert.equal(engine.state.modifiers.at(-1)?.amount, 50);
  assert.equal(engine.state.modifiers.at(-1)?.stageId, p1.stage.center.stageId);
});

test("Sora Replacement is legal with no Cheer attached", () => {
  const engine = makeEngine("hSD01-001", "hSD01-002", 22);
  advanceCheer(engine);
  forceMain(engine, "P1");
  for (const h of engine.allHolomem("P1")) h.cheers = [];
  engine.player("P1").holoPower.push(fakeCard("hBP01-044"));
  assert.doesNotThrow(() => engine.applyAction({ type: "USE_OSHI_SKILL", playerId: "P1", abilityIndex: 0 }));
  assert.equal(engine.player("P1").turnFlags.oshiSkillUsed, true);
});

test("CPU A Mic in My Right Hand logs its archived Cheer transfer for playback", () => {
  const engine = makeEngine("hSD01-001", "hSD01-002", 220);
  forceMain(engine, "P2");
  const player = engine.player("P2");
  player.stage.back = [fakeHolomem("hBP01-044")];
  player.holoPower = [fakeCard("hBP01-021"), fakeCard("hBP01-044"), fakeCard("hSD01-009")];
  player.archive.push(fakeCard("hY01-001"), fakeCard("hY02-001"));

  engine.applyAction({ type: "USE_OSHI_SKILL", playerId: "P2", abilityIndex: 1 });
  const transfer = engine.state.log.findLast(entry => entry.event === "ARCHIVE_CHEERS_ATTACHED");
  assert.equal(transfer?.player, "P2");
  assert.equal(transfer?.data?.count, 2);
  assert.equal(transfer?.data?.sourceCardId, "hSD01-002");
  assert.equal(Array.isArray(transfer?.data?.cheerCardIds), true);
});

test("Expanding Map can use AZKi's die replacement, move itself Back active, and cannot Collab twice", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 23);
  advanceCheer(engine);
  forceMain(engine, "P1");
  const p1 = engine.player("P1");
  const source = fakeHolomem("hSD01-009");
  p1.stage.back.push(source);
  p1.holoPower.push(fakeCard("hBP01-021"), fakeCard("hBP01-021"));
  engine.applyAction({ type: "COLLAB", playerId: "P1", targetStageId: source.stageId });
  assert.equal(p1.stage.collab, null);
  assert.equal(p1.stage.back.find(x => x.stageId === source.stageId)?.resting, false);
  assert.equal(p1.turnFlags.collabUsed, true);
  assert.ok(!engine.listLegalActions().some(x => x.type === "COLLAB"));
  assert.ok(engine.state.log.some(x => x.event === "DIE_REPLACED" && x.data?.result === 1));
});

test("SorAZ counts as both names and triggers both SoAzKo branches", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 24);
  forceMain(engine, "P1");
  const p1 = engine.player("P1");
  p1.stage.center = fakeHolomem("hSD01-013");
  assert.ok(engine.hasName(p1.stage.center, "Tokino Sora"));
  assert.ok(engine.hasName(p1.stage.center, "AZKi"));
  const beforeHand = p1.hand.length;
  const beforeCheer = p1.stage.center.cheers.length;
  const effect = engine.data.cards.get("hSD01-015")!.abilities![0];
  internals(engine).resolveEffect("P1", effect, fakeHolomem("hSD01-015"));
  assert.equal(p1.hand.length, beforeHand + 1);
  assert.equal(p1.stage.center.cheers.length, beforeCheer + 1);
});

test("SorAZ is a valid same-name Bloom on either Tokino Sora or AZKi", () => {
  for (const base of ["hBP01-021", "hBP01-044"]) {
    const engine = makeEngine("hSD01-002", "hSD01-001", 25);
    forceMain(engine, "P1");
    const p1 = engine.player("P1");
    p1.stage.center = fakeHolomem(base);
    const soraz = fakeCard("hSD01-013");
    p1.hand.push(soraz);
    assert.ok(engine.listLegalActions().some(x => x.type === "BLOOM" && x.cardUid === soraz.uid && x.targetStageId === p1.stage.center!.stageId));
  }
});

test("damage equal to HP downs a holomem and Buzz causes two Life damage", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 26);
  const p2 = engine.player("P2");
  p2.stage.center = fakeHolomem("hSD01-006");
  p2.stage.center.damage = 240;
  p2.stage.back = [fakeHolomem("hBP01-021")];
  const before = p2.life.length;
  internals(engine).resolveDowned();
  assert.equal(p2.life.length, before - 2);
  assert.equal(p2.stage.center, null);
});

test("Let's Dance remains attached to the same holomem after it Blooms", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 27);
  forceMain(engine, "P1");
  const p1 = engine.player("P1");
  p1.stage.center = fakeHolomem("hBP01-021");
  const centerId = p1.stage.center.stageId;
  internals(engine).resolveEffect("P1", engine.data.cards.get("hSD01-004")!.abilities![0], fakeHolomem("hSD01-004"));
  const soraz = fakeCard("hSD01-013");
  p1.hand.push(soraz);
  engine.applyAction({ type: "BLOOM", playerId: "P1", cardUid: soraz.uid, targetStageId: centerId });
  assert.equal(engine.state.modifiers.at(-1)?.stageId, centerId);
  assert.equal(engine.state.modifiers.at(-1)?.amount, 20);
});

test("Manager-chan can recycle the last other hand card into an empty deck and draw it", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 28);
  forceMain(engine, "P1");
  const p1 = engine.player("P1");
  p1.deck = [];
  const manager = fakeCard("hSD01-017");
  const other = fakeCard("hBP01-021");
  p1.hand = [manager, other];
  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: manager.uid });
  assert.deepEqual(p1.hand.map(x => x.uid), [other.uid]);
  assert.equal(p1.deck.length, 0);
});

test("First Gravity recognizes SorAZ through its additional names", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 29);
  forceMain(engine, "P1");
  const p1 = engine.player("P1");
  const support = fakeCard("hSD01-021");
  const soraz = fakeCard("hSD01-013");
  p1.hand = [support];
  p1.deck = [fakeCard("hBP01-104"), fakeCard("hBP01-104"), fakeCard("hBP01-104"), soraz];
  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: support.uid });
  assert.ok(p1.hand.some(x => x.uid === soraz.uid));
});

test("an empty Cheer deck skips the phase without causing a loss", () => {
  const engine = makeEngine("hSD01-002", "hSD01-001", 30);
  const p1 = engine.player("P1");
  // Resolve current pending Cheer, then force the next P1 turn with an empty Cheer deck.
  advanceCheer(engine);
  p1.cheerDeck = [];
  engine.applyAction({ type: "END_MAIN", playerId: "P1" });
  advanceCheer(engine);
  engine.applyAction({ type: "END_MAIN", playerId: "P2" });
  if (engine.state.phase === "PERFORMANCE") engine.applyAction({ type: "END_PERFORMANCE", playerId: "P2" });
  assert.equal(engine.state.activePlayer, "P1");
  assert.equal(engine.state.status, "ONGOING");
  assert.equal(engine.state.phase, "MAIN");
});

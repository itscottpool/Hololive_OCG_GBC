import test from "node:test";
import assert from "node:assert/strict";
import { loadGameData } from "../src/database.ts";
import { GameEngine } from "../src/engine.ts";
import { GreedyDecisionPolicy } from "../src/ai.ts";
import { fakeCard, fakeHolomem, forceMain } from "./helpers.ts";

test("interactive setup exposes the opening hand and accepts explicit field choices", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 9, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.beginInteractiveSetup();
  assert.equal(engine.state.phase, "SETUP");
  assert.equal(engine.player("P1").hand.length, 7);
  while (!engine.player("P1").hand.some(x => engine.card(x).bloomLevel === "Debut")) engine.redrawSetupHand("P1", "mandatory");
  while (!engine.player("P2").hand.some(x => engine.card(x).bloomLevel === "Debut")) engine.redrawSetupHand("P2", "mandatory");
  for (const id of ["P1", "P2"] as const) {
    const player = engine.player(id);
    const center = player.hand.find(x => engine.card(x).bloomLevel === "Debut")!;
    const bottom = player.hand.filter(x => x.uid !== center.uid).slice(0, player.redrawCount);
    engine.completeSetupPlayer(id, center.uid, [], bottom.map(x => x.uid));
  }
  engine.finishInteractiveSetup();
  assert.notEqual(engine.state.phase, "SETUP");
  assert.ok(engine.player("P1").stage.center);
});

test("the sixth failed mandatory Debut redraw causes an immediate setup loss", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 109, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.beginInteractiveSetup();
  const player = engine.player("P1");
  const forceNoDebut = () => {
    for (const instance of [...player.hand, ...player.deck]) instance.cardId = "hSD01-017";
  };
  forceNoDebut();
  for (let count = 1; count <= 6; count++) {
    engine.redrawSetupHand("P1", "mandatory");
    assert.equal(player.redrawCount, count);
    if (count < 6) {
      assert.equal(engine.state.status, "ONGOING");
      forceNoDebut();
    }
  }
  assert.equal(engine.state.status, "WIN");
  assert.equal(engine.state.winner, "P2");
  assert.match(engine.state.lossReasons.P1?.[0] ?? "", /redraw count reached 6/);
});

test("interactive Sub PC reveals five cards, optionally takes LIMITED, then honors bottom order", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 19, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const subPc = fakeCard("hSD01-018");
  player.hand.push(subPc);
  const revealed = [fakeCard("hBP01-021"), fakeCard("hSD01-016"), fakeCard("hSD01-009"), fakeCard("hSD01-020"), fakeCard("hSD01-013")];
  player.deck.splice(-5, 5, ...revealed);

  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: subPc.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_LIMITED");
  assert.equal(player.resolution.length, 5);
  const limited = player.resolution.find(x => engine.card(x).limited)!;
  engine.resolvePendingDecision("P1", { selectedUid: limited.uid });
  assert.equal(engine.state.pendingDecision?.step, "ORDER_BOTTOM");
  assert.ok(player.hand.some(x => x.uid === limited.uid));
  const order = [...player.resolution].reverse().map(x => x.uid);
  engine.resolvePendingDecision("P1", { orderedUids: order });
  assert.equal(engine.state.pendingDecision, null);
  assert.deepEqual(player.deck.slice(0, order.length).map(x => x.uid), order);
});

test("interactive Normal PC lets the player choose which Debut enters Back", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 23, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  player.stage.back.splice(0);
  const normalPc = fakeCard("hBP01-104");
  const sora = fakeCard("hBP01-021");
  const azki = fakeCard("hBP01-044");
  player.hand.push(normalPc);
  player.deck = [sora, azki];

  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: normalPc.uid });
  assert.equal(engine.state.pendingDecision?.kind, "NORMAL_PC");
  assert.equal(engine.state.pendingDecision?.step, "SELECT_DEBUT");
  assert.deepEqual(new Set(player.resolution.map(x => x.uid)), new Set([sora.uid, azki.uid]));

  engine.resolvePendingDecision("P1", { selectedUid: azki.uid });
  assert.equal(engine.state.pendingDecision, null);
  assert.equal(player.stage.back.at(-1)?.stack.at(-1)?.cardId, "hBP01-044");
  assert.deepEqual(player.deck.map(x => x.uid), [sora.uid]);
  assert.ok(engine.state.log.some(entry => entry.event === "NORMAL_PC_PLACE" && entry.data?.cardId === "hBP01-044"));
  assert.equal(engine.state.log.at(-1)?.event, "SHUFFLE");
});

test("interactive Amazing PC lets the player choose its Cheer cost and searched Holomem", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 29, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const center = fakeHolomem("hBP01-021");
  const back = fakeHolomem("hBP01-044");
  const white = fakeCard("hY01-001");
  const green = fakeCard("hY02-001");
  center.cheers.push(white);
  back.cheers.push(green);
  player.stage = { center, collab: null, back: [back] };
  const amazingPc = fakeCard("hSD01-019");
  const soraFirst = fakeCard("hSD01-005");
  const soraBuzz = fakeCard("hSD01-006");
  const azkiFirst = fakeCard("hSD01-010");
  const azkiSecond = fakeCard("hSD01-011");
  player.hand.push(amazingPc);
  player.deck = [soraFirst, soraBuzz, azkiFirst, azkiSecond];

  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: amazingPc.uid });
  assert.equal(engine.state.pendingDecision?.kind, "AMAZING_PC");
  assert.equal(engine.state.pendingDecision?.step, "SELECT_STAGE_CHEER");
  assert.deepEqual(new Set(engine.state.pendingDecision?.eligibleUids), new Set([white.uid, green.uid]));

  engine.resolvePendingDecision("P1", { selectedUid: green.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_AMAZING_PC_HOLOMEM");
  assert.ok(player.archive.some(instance => instance.uid === green.uid));
  assert.ok(!back.cheers.some(instance => instance.uid === green.uid));
  assert.deepEqual(new Set(engine.state.pendingDecision?.eligibleUids), new Set([soraFirst.uid, azkiFirst.uid, azkiSecond.uid]));
  assert.ok(!engine.state.pendingDecision?.eligibleUids.includes(soraBuzz.uid));

  engine.resolvePendingDecision("P1", { selectedUid: azkiSecond.uid });
  assert.equal(engine.state.pendingDecision, null);
  assert.ok(player.hand.some(instance => instance.uid === azkiSecond.uid));
  assert.ok(player.deck.some(instance => instance.uid === soraBuzz.uid));
  assert.ok(player.deck.some(instance => instance.uid === soraFirst.uid));
  assert.ok(player.deck.some(instance => instance.uid === azkiFirst.uid));
  assert.ok(engine.state.log.some(entry => entry.event === "AMAZING_PC_CHEER_ARCHIVED" && entry.data?.cardId === "hY02-001"));
  assert.ok(engine.state.log.some(entry => entry.event === "AMAZING_PC_TAKE" && entry.data?.cardId === "hSD01-011"));
  assert.equal(engine.state.log.at(-1)?.event, "SHUFFLE");
});

test("interactive knockouts pause for the Life Cheer target and next Center", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 31, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  const player = engine.player("P1");
  player.stage.center = fakeHolomem("hBP01-021");
  player.stage.center.damage = 999;
  player.stage.back = [fakeHolomem("hBP01-044"), fakeHolomem("hBP01-021")];
  const chosenCheerTarget = player.stage.back[1];
  const chosenCenter = player.stage.back[0];
  const lifeBefore = player.life.length;
  const internal = engine as unknown as { resolveDowned(): void; beginTurn(): void };

  internal.resolveDowned();
  assert.equal(engine.state.pendingDecision?.step, "SELECT_LIFE_CHEER_TARGET");
  assert.equal(player.life.length, lifeBefore - 1);
  assert.equal(player.resolution.length, 1);
  assert.equal(chosenCheerTarget.cheers.length, 0);

  engine.resolvePendingDecision("P1", { selectedStageId: chosenCheerTarget.stageId });
  assert.equal(engine.state.pendingDecision, null);
  assert.equal(player.resolution.length, 0);
  assert.equal(chosenCheerTarget.cheers.length, 1);

  engine.state.activePlayer = "P1";
  player.turnsTaken = Math.max(1, player.turnsTaken);
  internal.beginTurn();
  assert.equal(engine.state.pendingDecision?.step, "SELECT_NEW_CENTER");
  assert.equal(player.stage.center, null);

  engine.resolvePendingDecision("P1", { selectedStageId: chosenCenter.stageId });
  assert.equal(engine.state.pendingDecision, null);
  assert.equal(player.stage.center?.stageId, chosenCenter.stageId);
  assert.ok(["CHEER", "MAIN"].includes(engine.state.phase));
});

test("Expanding Map pauses so the player chooses the Back Stage Cheer target", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 41, p1OshiId: "hSD01-002", policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const source = fakeHolomem("hSD01-009");
  const firstBack = fakeHolomem("hBP01-021");
  const chosenBack = fakeHolomem("hBP01-044");
  player.stage.back = [source, firstBack, chosenBack];
  player.holoPower = [fakeCard("hBP01-021"), fakeCard("hBP01-044"), fakeCard("hSD01-009")];
  const revealed = fakeCard("hY02-001");
  player.cheerDeck.push(revealed);

  engine.applyAction({ type: "COLLAB", playerId: "P1", targetStageId: source.stageId });
  assert.equal(engine.state.pendingDecision?.step, "CHOOSE_OPTIONAL_ROLL");
  engine.resolvePendingDecision("P1", { choice: true });
  assert.equal(engine.state.pendingDecision?.step, "CHOOSE_DIE_METHOD");
  engine.resolvePendingDecision("P1", { choice: true });
  assert.equal(engine.state.pendingDecision?.step, "DECLARE_DIE_FACE");
  engine.resolvePendingDecision("P1", { number: 1 });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_EFFECT_CHEER_TARGET");
  assert.deepEqual(new Set(engine.state.pendingDecision?.eligibleStageIds), new Set([firstBack.stageId, chosenBack.stageId]));
  assert.equal(player.resolution.at(-1)?.uid, revealed.uid);

  engine.resolvePendingDecision("P1", { selectedStageId: chosenBack.stageId });
  assert.equal(engine.state.pendingDecision?.step, "CHOOSE_EXPANDING_MAP_RETURN");
  assert.equal(chosenBack.cheers.at(-1)?.uid, revealed.uid);
  engine.resolvePendingDecision("P1", { choice: true });
  assert.equal(engine.state.pendingDecision, null);
  assert.equal(player.stage.collab, null);
  assert.ok(player.stage.back.some(x => x.stageId === source.stageId));
});

test("interactive Sora Oshi skills expose Replacement and opponent-swap choices", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 44, p1OshiId: "hSD01-001", policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const center = fakeHolomem("hBP01-021");
  const back = fakeHolomem("hSD01-004");
  const cheer = fakeCard("hY01-001");
  center.cheers.push(cheer);
  player.stage = { center, collab: null, back: [back] };
  player.holoPower = [fakeCard("hBP01-044"), fakeCard("hBP01-044"), fakeCard("hBP01-044")];

  engine.applyAction({ type: "USE_OSHI_SKILL", playerId: "P1", abilityIndex: 0 });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_REATTACH_CHEER");
  engine.resolvePendingDecision("P1", { selectedUid: cheer.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_REATTACH_TARGET");
  engine.resolvePendingDecision("P1", { selectedStageId: back.stageId });
  assert.equal(back.cheers.at(-1)?.uid, cheer.uid);
  assert.equal(center.cheers.length, 0);

  player.turnFlags.oshiSkillUsed = false;
  const opponentCenter = fakeHolomem("hBP01-044");
  const firstOpponentBack = fakeHolomem("hBP01-021");
  const chosenOpponentBack = fakeHolomem("hSD01-009");
  engine.player("P2").stage = { center: opponentCenter, collab: null, back: [firstOpponentBack, chosenOpponentBack] };
  engine.applyAction({ type: "USE_OSHI_SKILL", playerId: "P1", abilityIndex: 1 });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_OPPONENT_BACK");
  engine.resolvePendingDecision("P1", { selectedStageId: chosenOpponentBack.stageId });
  assert.equal(engine.player("P2").stage.center?.stageId, chosenOpponentBack.stageId);
  assert.ok(engine.player("P2").stage.back.some(holomem => holomem.stageId === opponentCenter.stageId));
  assert.equal(engine.state.modifiers.at(-1)?.amount, 50);
});

test("interactive Collab effects expose HOPE and Drawing Together card choices", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 45, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const center = fakeHolomem("hBP01-021");
  const irys = fakeHolomem("hSD01-007");
  player.stage = { center, collab: null, back: [irys] };
  const existingPower = fakeCard("hSD01-016");
  player.holoPower = [existingPower];
  player.deck.push(fakeCard("hBP01-104"));
  const handCard = fakeCard("hSD01-020");
  player.hand.push(handCard);

  engine.applyAction({ type: "COLLAB", playerId: "P1", targetStageId: irys.stageId });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_HOLO_POWER_CARD");
  engine.resolvePendingDecision("P1", { selectedUid: existingPower.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_HAND_FOR_HOLO_POWER");
  engine.resolvePendingDecision("P1", { selectedUid: handCard.uid });
  assert.ok(player.hand.some(card => card.uid === existingPower.uid));
  assert.ok(player.holoPower.some(card => card.uid === handCard.uid));

  player.turnFlags.collabUsed = false;
  player.stage.back.push(player.stage.collab!);
  player.stage.collab = null;
  const iofi = fakeHolomem("hSD01-012");
  player.stage.back.push(iofi);
  const green = fakeCard("hY02-001");
  player.archive.push(green);
  player.deck.push(fakeCard("hBP01-104"));
  engine.applyAction({ type: "COLLAB", playerId: "P1", targetStageId: iofi.stageId });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_OPTIONAL_ARCHIVE_CHEER");
  engine.resolvePendingDecision("P1", { selectedUid: green.uid });
  assert.equal(center.cheers.at(-1)?.uid, green.uid);
});

test("interactive Circle and First Gravity expose every printed selection", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 46, policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const center = fakeHolomem("hBP01-021");
  const back = fakeHolomem("hBP01-044");
  player.stage = { center, collab: null, back: [back] };
  const white = fakeCard("hY01-001");
  const green = fakeCard("hY02-001");
  player.archive.push(white, green);
  const circle = fakeCard("hSD01-020");
  player.hand.push(circle);
  (engine as unknown as { rollDie(id: "P1", kind: "support_ability"): number }).rollDie = () => 6;

  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: circle.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_ARCHIVE_CHEER");
  engine.resolvePendingDecision("P1", { selectedUid: green.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_ARCHIVE_CHEER_DESTINATION");
  engine.resolvePendingDecision("P1", { selectedStageId: back.stageId });
  assert.equal(back.cheers.at(-1)?.uid, green.uid);

  const firstGravity = fakeCard("hSD01-021");
  const sora = fakeCard("hBP01-021");
  const azki = fakeCard("hBP01-044");
  const otherA = fakeCard("hBP01-104");
  const otherB = fakeCard("hSD01-016");
  player.hand = [firstGravity];
  player.deck = [otherA, otherB, sora, azki];
  engine.applyAction({ type: "PLAY_SUPPORT", playerId: "P1", cardUid: firstGravity.uid });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_FIRST_GRAVITY_CARDS");
  engine.resolvePendingDecision("P1", { selectedUids: [azki.uid] });
  assert.equal(engine.state.pendingDecision?.step, "ORDER_FIRST_GRAVITY_BOTTOM");
  const order = player.resolution.map(card => card.uid).reverse();
  engine.resolvePendingDecision("P1", { orderedUids: order });
  assert.ok(player.hand.some(card => card.uid === azki.uid));
  assert.ok(!player.hand.some(card => card.uid === sora.uid));
  assert.deepEqual(player.deck.slice(0, order.length).map(card => card.uid), order);
});

test("SorAZ Gravity pauses before damage so the player chooses its Cheer target", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 42, p1OshiId: "hSD01-002", policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  const player = engine.player("P1");
  const attacker = fakeHolomem("hSD01-011");
  attacker.cheers.push(fakeCard("hY02-001"));
  const chosenTarget = fakeHolomem("hBP01-044");
  player.stage.center = attacker;
  player.stage.back = [fakeHolomem("hBP01-021"), chosenTarget];
  const opponent = fakeHolomem("hBP01-021");
  engine.player("P2").stage = { center: opponent, collab: null, back: [] };
  const revealed = fakeCard("hY01-001");
  player.cheerDeck.push(revealed);
  engine.state.activePlayer = "P1";
  engine.state.phase = "PERFORMANCE";
  player.turnsTaken = 1;

  engine.applyAction({ type: "USE_ART", playerId: "P1", attackerStageId: attacker.stageId, artIndex: 0, targetStageId: opponent.stageId });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_EFFECT_CHEER_TARGET");
  assert.equal(opponent.damage, 0, "Art damage waits until the Cheer target is chosen");

  engine.resolvePendingDecision("P1", { selectedStageId: chosenTarget.stageId });
  assert.equal(engine.state.pendingDecision, null);
  assert.equal(chosenTarget.cheers.at(-1)?.uid, revealed.uid);
  assert.equal(opponent.damage, 60);
  assert.ok(engine.state.log.some(entry => entry.event === "ART" && entry.data?.artName === "SorAZ Gravity"));
});

test("A Mic in My Right Hand lets the player choose its target and archived Cheers", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 43, p1OshiId: "hSD01-002", policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  forceMain(engine, "P1");
  const player = engine.player("P1");
  const target = fakeHolomem("hBP01-044");
  player.stage.back = [target];
  player.holoPower = [fakeCard("hBP01-021"), fakeCard("hBP01-044"), fakeCard("hSD01-009")];
  const white = fakeCard("hY01-001");
  const green = fakeCard("hY02-001");
  player.archive.push(white, green);

  engine.applyAction({ type: "USE_OSHI_SKILL", playerId: "P1", abilityIndex: 1 });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_ARCHIVE_CHEER_TARGET");
  engine.resolvePendingDecision("P1", { selectedStageId: target.stageId });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_ARCHIVE_CHEERS");
  engine.resolvePendingDecision("P1", { selectedUids: [green.uid] });

  assert.equal(engine.state.pendingDecision, null);
  assert.equal(target.cheers.at(-1)?.uid, green.uid);
  assert.ok(player.archive.some(x => x.uid === white.uid));
  assert.ok(!player.archive.some(x => x.uid === green.uid));
  assert.ok(engine.state.log.some(entry => entry.event === "ARCHIVE_CHEERS_ATTACHED" && entry.data?.count === 1));
});

test("interactive optional Arts expose the roll and AZKi die-result choices", () => {
  const policy = new GreedyDecisionPolicy();
  const engine = new GameEngine({ data: loadGameData(), seed: 47, p1OshiId: "hSD01-002", policies: { P1: policy, P2: policy }, interactivePlayers: ["P1"] });
  engine.setup();
  const player = engine.player("P1");
  const attacker = fakeHolomem("hSD01-011");
  attacker.cheers.push(fakeCard("hY02-001"), fakeCard("hY02-001"), fakeCard("hY01-001"));
  const opponent = fakeHolomem("hBP01-021");
  player.stage = { center: attacker, collab: null, back: [] };
  player.holoPower = [fakeCard("hBP01-021"), fakeCard("hBP01-044"), fakeCard("hSD01-009")];
  engine.player("P2").stage = { center: opponent, collab: null, back: [] };
  engine.state.activePlayer = "P1";
  engine.state.phase = "PERFORMANCE";
  player.turnsTaken = 1;

  engine.applyAction({ type: "USE_ART", playerId: "P1", attackerStageId: attacker.stageId, artIndex: 1, targetStageId: opponent.stageId });
  assert.equal(engine.state.pendingDecision?.step, "CHOOSE_OPTIONAL_ROLL");
  assert.equal(opponent.damage, 0);
  engine.resolvePendingDecision("P1", { choice: true });
  assert.equal(engine.state.pendingDecision?.step, "CHOOSE_DIE_METHOD");
  engine.resolvePendingDecision("P1", { choice: true });
  assert.equal(engine.state.pendingDecision?.step, "DECLARE_DIE_FACE");
  engine.resolvePendingDecision("P1", { number: 1 });

  assert.equal(engine.state.pendingDecision, null);
  assert.equal(opponent.damage, 200, "Destiny Song deals 100 base +50 for odd +50 for rolling 1");
  assert.equal(player.holoPower.length, 0);
  assert.ok(engine.state.log.some(entry => entry.event === "DIE_REPLACED" && entry.data?.result === 1));
});

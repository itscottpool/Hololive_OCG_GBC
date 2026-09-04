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
  player.holoPower = [fakeCard("hBP01-021"), fakeCard("hBP01-044")];
  const revealed = fakeCard("hY02-001");
  player.cheerDeck.push(revealed);

  engine.applyAction({ type: "COLLAB", playerId: "P1", targetStageId: source.stageId });
  assert.equal(engine.state.pendingDecision?.step, "SELECT_EFFECT_CHEER_TARGET");
  assert.deepEqual(new Set(engine.state.pendingDecision?.eligibleStageIds), new Set([firstBack.stageId, chosenBack.stageId]));
  assert.equal(player.resolution.at(-1)?.uid, revealed.uid);

  engine.resolvePendingDecision("P1", { selectedStageId: chosenBack.stageId });
  assert.equal(engine.state.pendingDecision, null);
  assert.equal(chosenBack.cheers.at(-1)?.uid, revealed.uid);
  assert.equal(player.stage.collab, null);
  assert.ok(player.stage.back.some(x => x.stageId === source.stageId));
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

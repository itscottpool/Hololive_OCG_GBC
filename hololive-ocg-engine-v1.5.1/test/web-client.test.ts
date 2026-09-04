import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${url}/api/state`);
      if (response.ok) return;
    } catch { /* Child process may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error("Local battle server did not start in time.");
}

async function post(base: string, route: string, body: Record<string, unknown>) {
  const response = await fetch(`${base}${route}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

test("browser client guides setup, hides CPU secrets, and completes a match", async t => {
  const port = 43_000 + process.pid % 1_000;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/web-server.ts", "--port", String(port)], { cwd: root, stdio: "ignore" });
  t.after(() => child.kill());
  await waitForServer(base);

  const htmlResponse = await fetch(`${base}/`);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.doesNotMatch(html, /480 × 270 LOGICAL DISPLAY/);
  assert.doesNotMatch(html, /hSD01 VERTICAL SLICE/);
  assert.match(html, /BUILD v1\.5\.1/);
  assert.match(html, /styles\.css\?v=1\.5\.1/);
  assert.match(html, /app\.js\?v=1\.5\.1/);
  assert.match(html, /hololive-ocg-logo\.webp/);
  assert.match(html, /Hololive Original Card Game - Endless Nights/);
  assert.match(html, /id="story-button"[^>]*disabled/);
  assert.match(html, /id="vs-ai-button"/);
  assert.match(html, /id="options-screen"/);
  assert.match(html, /id="deck-select"/);
  assert.match(html, /BGM VOLUME/);
  assert.match(html, /SFX VOLUME/);
  assert.match(html, /id="step-dialog"/);
  assert.match(html, /id="opponent-backstage-peek"/);
  assert.match(html, /id="player-backstage-peek"/);
  assert.match(html, /id="dialog-back"/);
  assert.match(html, /id="exit-button"/);
  assert.match(html, /id="forfeit-dialog"/);
  assert.match(html, /id="action-playback"/);
  assert.match(html, /id="inspect-dialog"/);
  assert.match(html, /Stellar_Stellar_Chiptune\.mp3/);
  assert.match(html, /Non_Fiction_8bit\.mp3/);
  const scriptResponse = await fetch(`${base}/app.js`);
  assert.equal(scriptResponse.status, 200);
  assert.equal(scriptResponse.headers.get("cache-control"), "no-store");
  const script = await scriptResponse.text();
  const styleResponse = await fetch(`${base}/styles.css`);
  assert.equal(styleResponse.status, 200);
  const styles = await styleResponse.text();
  assert.match(script, /CPU ACTION/);
  assert.match(script, /detail-label\">ABILITIES/);
  assert.match(script, /detail-label\">ARTS/);
  assert.match(script, /DECISION_SELECT_DEBUT/);
  assert.match(script, /waitForPlaybackAdvance/);
  assert.match(script, /assets\/ui\/BackB\.png/);
  assert.match(script, /detail-status/);
  assert.match(script, /kind: "INSPECT"/);
  assert.match(script, /fieldOwner = "P1"/);
  assert.match(script, /requirement-icon/);
  assert.match(script, /DECISION_SELECT_LIFE_CHEER_TARGET/);
  assert.match(script, /DECISION_SELECT_NEW_CENTER/);
  assert.match(script, /EFFECT:/);
  assert.match(script, /\/api\/abandon-game/);
  assert.match(script, /\/api\/shutdown/);
  assert.match(script, /DECISION_SELECT_EFFECT_CHEER_TARGET/);
  assert.match(script, /DECISION_SELECT_ARCHIVE_CHEER_TARGET/);
  assert.match(script, /DECISION_SELECT_ARCHIVE_CHEERS/);
  assert.match(script, /switchOshiView/);
  assert.match(script, /HOLO POWER COST/);
  assert.match(script, /ARCHIVE_CHEERS_ATTACHED/);
  assert.match(script, /AudioContext/);
  assert.match(script, /activateOnClick/);
  assert.match(script, /oshi-power-count/);
  assert.match(script, /field-board/);
  assert.match(script, /\["HAND", "BACKSTAGE", "ARCHIVE", "LOG", "STEP"\]/);
  assert.match(script, /PERFORMANCE STEP/);
  assert.match(script, /END STEP/);
  assert.match(script, /visibleBattleCards/);
  assert.match(script, /openVisibleStage/);
  assert.match(script, /Press Up to browse the Backstage and Stage/);
  assert.match(script, /promptNextStep/);
  assert.match(script, /renderBackstagePeeks/);
  assert.match(script, /list-cheer-icons/);
  assert.match(script, /openZone\("BACKSTAGE", holomem\.stageId, owner\)/);
  assert.match(script, /BATTLE_ROWS = \["P2_BACK", "P2", "P1", "P1_BACK", "COMMAND"\]/);
  assert.match(script, /backstage-cheer-pip/);
  assert.match(script, /dataset\.battleRow/);
  assert.match(script, /selectFlowCard/);
  assert.match(script, /selectDialogItem/);
  assert.match(script, /ui\.dialogBack\.addEventListener\("click", backDialog\)/);
  assert.doesNotMatch(script, /mouseenter[\s\S]{0,80}renderDialog\(\)/);
  assert.doesNotMatch(script, /mouseenter[\s\S]{0,80}renderFlow\(\)/);
  assert.match(script, /STAGE/);
  assert.match(script, /hololive-ocg-theme/);
  assert.match(script, /hololive-ocg-bgm-level/);
  assert.match(script, /hololive-ocg-sfx-level/);
  assert.match(script, /deckId:/);
  assert.match(script, /deck-box-sprite/);
  assert.match(script, /waitingCheerToken/);
  assert.match(script, /pending-cheer-group/);
  assert.match(script, /stackUnderlayHtml/);
  assert.match(script, /attachedCardItems/);
  assert.match(script, /holomem\.supports/);
  assert.match(script, /kind: "ATTACHMENT"/);
  assert.match(script, /frame\.eventStates/);
  assert.match(script, /sortHandItems/);
  assert.match(script, /sortCurrentHand/);
  assert.match(script, /art-action-summary/);
  assert.match(script, /activeMusicTrack/);
  assert.match(script, /readSavedLevel\("hololive-ocg-bgm-level", 10\)/);
  assert.match(script, /if \(stored === null\) return fallback/);
  assert.match(script, /document\.addEventListener\("click", startMusic\)/);
  assert.match(script, /function currentFlowItem\(\)/);
  assert.match(script, /PLACE ON BACK[\s\S]{0,180}currentFlowItem\(\)/);
  assert.match(script, /action\.type === "COLLAB" \|\| action\.type === "ATTACH_CHEER"/);
  assert.match(script, /action\.type === "COLLAB"[\s\S]{0,150}return false/);
  assert.doesNotMatch(script, /class="stack-count"/);
  assert.match(script, /failing the sixth loses the game/);
  assert.match(script, /OPENING HAND — FREE REDRAW USED/);
  assert.match(script, /additional redraws only occur when a hand has no Debut/);
  assert.match(styles, /console-title-screen/);
  assert.match(styles, /console-menu-button/);
  assert.match(styles, /deck-choice/);
  assert.match(styles, /pending-cheer-card/);
  assert.match(styles, /pending-cheer-glow/);
  assert.match(styles, /stacked-card-underlay/);
  assert.match(styles, /backstage-stack-underlay/);
  assert.match(styles, /attachment-section-label/);
  assert.match(styles, /attachment-entry/);
  assert.match(styles, /official-title-logo/);
  assert.match(styles, /official-title-logo[\s\S]{0,100}width: 205px/);
  assert.match(styles, /filter: drop-shadow\(2px 2px 0 rgb\(0 0 0 \/ 72%\)\)/);
  assert.doesNotMatch(styles, /official-title-logo[\s\S]{0,160}drop-shadow\(0 0/);
  assert.match(styles, /art-action-entry/);
  assert.match(styles, /dialog-sort-button/);
  assert.match(styles, /attack-white/);
  assert.match(styles, /attack-green/);
  assert.match(styles, /grid-template-rows: 17px 25px minmax\(0, 1fr\) 25px 12px/);
  assert.match(styles, /command-cursor/);
  assert.match(styles, /stage-focus/);
  assert.match(styles, /oshi-life/);
  assert.match(styles, /repeat\(5, 1fr\)/);
  assert.match(styles, /player-board \.center-group/);
  assert.match(styles, /opponent-board \.center-group/);
  assert.match(styles, /backstage-peek-card/);
  assert.match(styles, /transform: translateX\(-50%\)/);
  assert.match(styles, /player-side \.backstage-peek-row \{ bottom: -47px/);
  assert.match(styles, /opponent-side \.backstage-peek-row \{ top: -47px/);
  assert.match(styles, /opponent-side \.backstage-card-pile \{ transform: rotate\(180deg\)/);
  assert.match(styles, /backstage-cheer-pips/);
  assert.match(styles, /cheer-pip-green/);
  assert.match(styles, /card-token\.resting \{ transform: rotate\(6deg\); filter: saturate\(\.35\) brightness\(\.78\)/);
  assert.match(styles, /backstage-peek-card\.resting/);
  assert.match(styles, /backstage-peek-card\.resting \.backstage-card-pile \{ filter: saturate\(\.35\) brightness\(\.78\)/);
  assert.match(styles, /backstage-peek-card\.focused[\s\S]*animation: stage-focus \.7s steps\(2\) infinite/);
  assert.match(styles, /dialog-back-button/);
  assert.match(styles, /oshi-field-token \{ width: 112px; height: 157px/);
  assert.match(styles, /oshi-field-token img[\s\S]*object-fit: contain[\s\S]*transform: none/);
  assert.match(styles, /zone-group\.oshi-group \{ width: 116px/);
  assert.match(styles, /data-theme="mint"/);
  assert.match(styles, /data-theme="moonlight"/);
  const imageResponse = await fetch(`${base}/assets/cards/primary/EN_hSD01-001_OSR.png`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  const cardBackResponse = await fetch(`${base}/assets/ui/BackB.png`);
  assert.equal(cardBackResponse.status, 200);
  assert.equal(cardBackResponse.headers.get("content-type"), "image/png");
  const titleResponse = await fetch(`${base}/assets/ui/title-splash.png`);
  assert.equal(titleResponse.status, 200);
  assert.equal(titleResponse.headers.get("content-type"), "image/png");
  const logoResponse = await fetch(`${base}/assets/ui/hololive-ocg-logo.webp`);
  assert.equal(logoResponse.status, 200);
  assert.equal(logoResponse.headers.get("content-type"), "image/webp");
  const cheerIconResponse = await fetch(`${base}/assets/ui/cheer/Green.png`);
  assert.equal(cheerIconResponse.status, 200);
  assert.equal(cheerIconResponse.headers.get("content-type"), "image/png");
  const musicResponse = await fetch(`${base}/assets/audio/Stellar_Stellar_Chiptune.mp3`);
  assert.equal(musicResponse.status, 200);
  assert.equal(musicResponse.headers.get("content-type"), "audio/mpeg");
  const titleMusicResponse = await fetch(`${base}/assets/audio/Non_Fiction_8bit.mp3`);
  assert.equal(titleMusicResponse.status, 200);
  assert.equal(titleMusicResponse.headers.get("content-type"), "audio/mpeg");

  const titleSnapshot = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(titleSnapshot.deckOptions.map((deck: {id:string}) => deck.id), ["hSD01"]);
  assert.equal(titleSnapshot.deckOptions[0].name, "Starter Deck - Tokino Sora & AZKi");

  let redrawSnapshot = await post(base, "/api/new-game", { deckId: "hSD01", playerOshiId: "hSD01-001", seed: 1 });
  redrawSnapshot = await post(base, "/api/coin-flip", { call: "HEADS" });
  redrawSnapshot = await post(base, "/api/turn-order", { playerWantsFirst: true });
  redrawSnapshot = await post(base, "/api/setup/redraw", { kind: "optional" });
  assert.equal(redrawSnapshot.flow.optionalRedrawAvailable, false);
  assert.equal(redrawSnapshot.state.players.P1.hand.some((instance: {cardId:string}) => redrawSnapshot.cards[instance.cardId].bloomLevel === "Debut"), true);
  const illegalMandatory = await fetch(`${base}/api/setup/redraw`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "mandatory" }),
  });
  assert.equal(illegalMandatory.status, 400);
  assert.match((await illegalMandatory.json()).error, /not required because this hand has a Debut/);

  redrawSnapshot = await post(base, "/api/new-game", { deckId: "hSD01", playerOshiId: "hSD01-001", seed: 18 });
  redrawSnapshot = await post(base, "/api/coin-flip", { call: "TAILS" });
  redrawSnapshot = await post(base, "/api/turn-order", { playerWantsFirst: true });
  redrawSnapshot = await post(base, "/api/setup/redraw", { kind: "optional" });
  assert.equal(redrawSnapshot.flow.optionalRedrawAvailable, false);
  assert.equal(redrawSnapshot.state.players.P1.hand.some((instance: {cardId:string}) => redrawSnapshot.cards[instance.cardId].bloomLevel === "Debut"), false);
  redrawSnapshot = await post(base, "/api/setup/redraw", { kind: "mandatory" });
  assert.equal(redrawSnapshot.state.players.P1.redrawCount, 1);

  let snapshot = await post(base, "/api/new-game", { deckId: "hSD01", playerOshiId: "hSD01-001", seed: 42 });
  assert.equal(snapshot.flow.step, "COIN_CALL");
  snapshot = await post(base, "/api/coin-flip", { call: "HEADS" });
  assert.ok(["ORDER_CHOICE", "AI_ORDER"].includes(snapshot.flow.step));
  snapshot = await post(base, "/api/turn-order", snapshot.flow.step === "ORDER_CHOICE" ? { playerWantsFirst: true } : {});

  while (snapshot.flow.step === "REDRAW") {
    const hasDebut = snapshot.state.players.P1.hand.some((instance: {cardId:string}) => snapshot.cards[instance.cardId].bloomLevel === "Debut");
    const kind = hasDebut ? "keep" : snapshot.flow.optionalRedrawAvailable ? "optional" : "mandatory";
    snapshot = await post(base, "/api/setup/redraw", { kind });
  }
  assert.equal(snapshot.flow.step, "CENTER");
  const center = snapshot.state.players.P1.hand.find((instance: {cardId:string}) => snapshot.cards[instance.cardId].bloomLevel === "Debut");
  snapshot = await post(base, "/api/setup/center", { cardUid: center.uid });
  assert.equal(snapshot.flow.step, "BACK");
  snapshot = await post(base, "/api/setup/back", { cardUids: [] });
  if (snapshot.flow.step === "BOTTOM") {
    const count = snapshot.state.players.P1.redrawCount;
    const eligible = snapshot.state.players.P1.hand.filter((instance: {uid:string}) => instance.uid !== snapshot.flow.centerUid).slice(0, count);
    snapshot = await post(base, "/api/setup/bottom", { cardUids: eligible.map((x: {uid:string}) => x.uid) });
  }

  assert.equal(snapshot.flow.step, "PLAYING");
  assert.equal(snapshot.state.players.P2.hand.length, 0);
  assert.ok(snapshot.state.players.P2.handCount > 0);

  let requests = 0;
  let sawPlayerPlayback = false;
  let sawCpuPlayback = false;
  let sawVisualCardMetadata = false;
  let sawRichArtMetadata = false;
  let sawSynchronizedTurnEnd = false;
  let sawSynchronizedCheer = false;
  let sawSynchronizedCheerAttachment = false;
  while (snapshot.state.status === "ONGOING" && requests < 500) {
    if (snapshot.state.pendingDecision?.step === "SELECT_DEBUT") {
      snapshot = await post(base, "/api/decision", { selectedUid: snapshot.state.pendingDecision.eligibleUids[0] });
    } else if (snapshot.state.pendingDecision?.step === "SELECT_LIMITED") {
      snapshot = await post(base, "/api/decision", { selectedUid: null });
    } else if (snapshot.state.pendingDecision?.step === "ORDER_BOTTOM") {
      snapshot = await post(base, "/api/decision", { orderedUids: snapshot.state.players.P1.resolution.map((x: {uid:string}) => x.uid) });
    } else if (["SELECT_LIFE_CHEER_TARGET", "SELECT_NEW_CENTER", "SELECT_EFFECT_CHEER_TARGET", "SELECT_ARCHIVE_CHEER_TARGET"].includes(snapshot.state.pendingDecision?.step)) {
      snapshot = await post(base, "/api/decision", { selectedStageId: snapshot.state.pendingDecision.eligibleStageIds[0] });
    } else if (snapshot.state.pendingDecision?.step === "SELECT_ARCHIVE_CHEERS") {
      snapshot = await post(base, "/api/decision", { selectedUids: snapshot.state.pendingDecision.eligibleUids });
    } else {
      assert.ok(snapshot.legalActions.length > 0);
      snapshot = await post(base, "/api/action", { action: snapshot.legalActions[0] });
    }
    for (const frame of snapshot.playback ?? []) {
      assert.equal(frame.state.players.P2.hand.length, 0);
      assert.equal(frame.eventStates.length, frame.events.length);
      if (frame.playerId === "P1") sawPlayerPlayback = true;
      if (frame.playerId === "P2") sawCpuPlayback = true;
      for (let eventIndex = 0; eventIndex < frame.events.length; eventIndex++) {
        const event = frame.events[eventIndex];
        const eventState = frame.eventStates[eventIndex];
        assert.equal(eventState.players.P2.hand.length, 0);
        if (event.event === "TURN_END") {
          assert.equal(eventState.phase, "END");
          assert.equal(eventState.activePlayer, event.player);
          sawSynchronizedTurnEnd = true;
        }
        if (event.event === "CHEER_REVEALED") {
          assert.equal(eventState.phase, "CHEER");
          if (event.player === "P1") assert.equal(eventState.players.P1.pendingCheer?.cardId, event.data?.cardId);
          sawSynchronizedCheer = true;
        }
        if (event.event === "CHEER_ATTACHED") {
          assert.equal(eventState.phase, "CHEER");
          if (event.player === "P1") assert.equal(eventState.players.P1.pendingCheer, null);
          sawSynchronizedCheerAttachment = true;
        }
        if (event.player === "P2" && event.event === "SUB_PC_BOTTOM") assert.equal(event.data?.cardIds, undefined);
        if (typeof event.data?.cardId === "string") sawVisualCardMetadata = true;
        if (event.event === "ART") {
          assert.equal(typeof event.data?.attackerCardId, "string");
          assert.equal(typeof event.data?.targetCardId, "string");
          sawRichArtMetadata = true;
          assert.equal(typeof event.data?.description, "string");
        }
      }
    }
    requests++;
  }
  assert.notEqual(snapshot.state.status, "ONGOING");
  assert.ok(requests < 500);
  assert.equal(snapshot.state.players.P2.hand.length, 0);
  assert.equal(sawPlayerPlayback, true);
  assert.equal(sawCpuPlayback, true);
  assert.equal(sawVisualCardMetadata, true);
  assert.equal(sawRichArtMetadata, true);
  assert.equal(sawSynchronizedTurnEnd, true);
  assert.equal(sawSynchronizedCheer, true);
  assert.equal(sawSynchronizedCheerAttachment, true);
  for (const event of snapshot.state.log.filter((entry: {player?:string;event:string}) => entry.player === "P2" && entry.event === "SUB_PC_BOTTOM")) {
    assert.equal(event.data?.cardIds, undefined);
  }

  snapshot = await post(base, "/api/abandon-game", {});
  assert.equal(snapshot.gameStarted, false);
  const stopped = await post(base, "/api/shutdown", {});
  assert.equal(stopped.shuttingDown, true);
});

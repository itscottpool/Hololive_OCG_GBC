import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GreedyAI, GreedyDecisionPolicy } from "./ai.ts";
import { loadGameData } from "./database.ts";
import { GameEngine } from "./engine.ts";
import type { GameAction, HolomemState, LogEntry, PlayerId, PlayerState } from "./types.ts";

type FlowStep = "COIN_CALL" | "ORDER_CHOICE" | "AI_ORDER" | "REDRAW" | "CENTER" | "BACK" | "BOTTOM" | "PLAYING";

interface WebSession {
  deckId: string;
  playerOshiId: string;
  aiOshiId: string;
  seed: number;
  step: FlowStep;
  playerCall?: "HEADS" | "TAILS";
  coinResult?: "HEADS" | "TAILS";
  coinWinner?: PlayerId;
  startingPlayer?: PlayerId;
  aiOrderChoice?: "FIRST" | "SECOND";
  optionalRedrawAvailable: boolean;
  centerUid?: string;
  backUids: string[];
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(projectRoot, "web");
const assetsRoot = path.join(projectRoot, "assets");
const data = loadGameData();
const ai = new GreedyAI();
let engine: GameEngine | null = null;
let session: WebSession | null = null;

interface PlaybackFrame {
  actionType: string;
  playerId?: PlayerId;
  events: LogEntry[];
  eventStates: ReturnType<typeof projectState>[];
  state: ReturnType<typeof projectState>;
}

function projectHolomem(holomem: HolomemState | null): HolomemState | null {
  return holomem ? structuredClone(holomem) : null;
}

function projectPlayer(player: PlayerState, revealSecrets: boolean) {
  return {
    id: player.id,
    oshiCardId: player.oshiCardId,
    deckCount: player.deck.length,
    cheerDeckCount: player.cheerDeck.length,
    hand: revealSecrets ? structuredClone(player.hand) : [],
    handCount: player.hand.length,
    archive: structuredClone(player.archive),
    archiveCount: player.archive.length,
    holoPowerCount: player.holoPower.length,
    holoPower: revealSecrets ? structuredClone(player.holoPower) : [],
    lifeCount: player.life.length,
    pendingCheer: revealSecrets && player.pendingCheer ? structuredClone(player.pendingCheer) : null,
    resolution: revealSecrets ? structuredClone(player.resolution) : [],
    redrawCount: player.redrawCount,
    turnsTaken: player.turnsTaken,
    spOshiUsed: player.spOshiUsed,
    turnFlags: structuredClone(player.turnFlags),
    stage: {
      center: projectHolomem(player.stage.center),
      collab: projectHolomem(player.stage.collab),
      back: player.stage.back.map(x => projectHolomem(x)!),
    },
  };
}

function publicSession() {
  if (!session) return null;
  return {
    playerOshiId: session.playerOshiId,
    deckId: session.deckId,
    aiOshiId: session.aiOshiId,
    seed: session.seed,
    step: session.step,
    playerCall: session.playerCall,
    coinResult: session.coinResult,
    coinWinner: session.coinWinner,
    startingPlayer: session.startingPlayer,
    aiOrderChoice: session.aiOrderChoice,
    optionalRedrawAvailable: session.optionalRedrawAvailable,
    centerUid: session.centerUid,
    backUids: [...session.backUids],
  };
}

function projectLogEntry(entry: LogEntry): LogEntry {
  const projected = structuredClone(entry);
  if (projected.player === "P2" && projected.event === "SUB_PC_BOTTOM" && projected.data) {
    delete projected.data.cardIds;
  }
  return projected;
}

function projectState() {
  if (!engine) return null;
  const state = engine.state;
  return {
    seed: state.seed,
    status: state.status,
    winner: state.winner,
    lossReasons: structuredClone(state.lossReasons),
    startingPlayer: state.startingPlayer,
    activePlayer: state.activePlayer,
    turnNumber: state.turnNumber,
    phase: state.phase,
    pendingDecision: state.pendingDecision ? structuredClone(state.pendingDecision) : null,
    players: {
      P1: projectPlayer(state.players.P1, true),
      P2: projectPlayer(state.players.P2, false),
    },
    log: state.log.slice(-100).map(projectLogEntry),
  };
}

function clientSnapshot(playback: PlaybackFrame[] = []) {
  const deckOptions = [...data.deckFamilies.values()].map(deck => ({ id: deck.id, name: deck.name, oshiOptions: [...deck.oshiOptions] }));
  const selectedDeck = session ? data.deckFamilies.get(session.deckId) : deckOptions.length ? data.deckFamilies.get(deckOptions[0].id) : undefined;
  const common = {
    gameStarted: Boolean(session),
    humanPlayer: "P1",
    deckOptions,
    oshiOptions: selectedDeck?.oshiOptions ?? [],
    cards: Object.fromEntries([...data.cards].map(([id, card]) => [id, card])),
    flow: publicSession(),
    playback,
  };
  if (!engine) return common;
  const state = engine.state;
  return {
    ...common,
    state: projectState(),
    legalActions: session?.step === "PLAYING" && state.activePlayer === "P1" && !state.pendingDecision
      ? engine.listLegalActions("P1") : [],
  };
}

function hasDebut(id: PlayerId): boolean {
  if (!engine) return false;
  return engine.player(id).hand.some(x => engine!.card(x).type === "Holomem" && engine!.card(x).bloomLevel === "Debut");
}

function recordStep(playback: PlaybackFrame[], actionType: string, playerId: PlayerId | undefined, operation: () => void): void {
  if (!engine) return;
  const logStart = engine.state.log.length;
  const eventStates: ReturnType<typeof projectState>[] = [];
  engine.setLogObserver(() => eventStates.push(projectState()));
  try {
    operation();
  } finally {
    engine.setLogObserver(null);
  }
  const events = engine.state.log.slice(logStart).map(projectLogEntry);
  const finalState = projectState();
  if (events.length) playback.push({ actionType, playerId, events, eventStates, state: finalState });
}

function runAiTurn(playback: PlaybackFrame[]): void {
  if (!engine || session?.step !== "PLAYING") return;
  let actions = 0;
  while (engine.state.status === "ONGOING" && engine.state.activePlayer === "P2" && !engine.state.pendingDecision) {
    const action = ai.chooseAction(engine, "P2");
    recordStep(playback, action.type, "P2", () => engine!.applyAction(action));
    actions++;
    if (actions > 1_000) throw new Error("AI action guard exceeded.");
  }
}

function startPregame(deckId: string, playerOshiId: string, requestedSeed?: number): void {
  const deck = data.deckFamilies.get(deckId);
  if (!deck) throw new Error("Unknown deck selection.");
  const oshiOptions = deck.oshiOptions;
  if (!oshiOptions.includes(playerOshiId)) throw new Error("Unknown Oshi selection.");
  const seed = Number.isSafeInteger(requestedSeed) ? requestedSeed! : randomInt(1, 0x100000000);
  engine = null;
  session = {
    deckId,
    playerOshiId,
    aiOshiId: oshiOptions.find(id => id !== playerOshiId) ?? playerOshiId,
    seed,
    step: "COIN_CALL",
    optionalRedrawAvailable: true,
    backUids: [],
  };
}

function flipCoin(call: "HEADS" | "TAILS"): void {
  if (!session || session.step !== "COIN_CALL") throw new Error("The coin call is not available now.");
  if (call !== "HEADS" && call !== "TAILS") throw new Error("Call Heads or Tails.");
  const mixed = (Math.imul(session.seed, 1_664_525) + 1_013_904_223) >>> 0;
  const result: "HEADS" | "TAILS" = mixed % 2 === 0 ? "HEADS" : "TAILS";
  session.playerCall = call;
  session.coinResult = result;
  session.coinWinner = call === result ? "P1" : "P2";
  if (session.coinWinner === "P1") {
    session.step = "ORDER_CHOICE";
  } else {
    session.aiOrderChoice = "FIRST";
    session.startingPlayer = "P2";
    session.step = "AI_ORDER";
  }
}

function beginCardSetup(playerWantsFirst?: boolean): void {
  if (!session) throw new Error("Start a match first.");
  if (session.step === "ORDER_CHOICE") {
    if (typeof playerWantsFirst !== "boolean") throw new Error("Choose whether to play first or second.");
    session.startingPlayer = playerWantsFirst ? "P1" : "P2";
  } else if (session.step !== "AI_ORDER") {
    throw new Error("Turn order is not ready to be confirmed.");
  }

  const policy = new GreedyDecisionPolicy();
  engine = new GameEngine({
    data,
    deckId: session.deckId,
    seed: session.seed,
    p1OshiId: session.playerOshiId,
    p2OshiId: session.aiOshiId,
    startingPlayer: session.startingPlayer!,
    policies: { P1: policy, P2: policy },
    interactivePlayers: ["P1"],
  });
  engine.beginInteractiveSetup();
  completeAiSetup();
  session.optionalRedrawAvailable = true;
  session.step = "REDRAW";
}

function completeAiSetup(): void {
  if (!engine) throw new Error("The engine has not started setup.");
  while (!hasDebut("P2") && engine.state.status === "ONGOING") engine.redrawSetupHand("P2", "mandatory");
  if (engine.state.status !== "ONGOING") return;
  const player = engine.player("P2");
  const debuts = player.hand.filter(x => engine!.card(x).type === "Holomem" && engine!.card(x).bloomLevel === "Debut")
    .sort((a, b) => (engine!.card(b).hp ?? 0) - (engine!.card(a).hp ?? 0));
  const center = debuts[0];
  const bottom = player.hand.filter(x => x.uid !== center.uid).slice(0, player.redrawCount);
  const excluded = new Set([center.uid, ...bottom.map(x => x.uid)]);
  const backs = player.hand.filter(x => {
    if (excluded.has(x.uid)) return false;
    const c = engine!.card(x);
    return c.type === "Holomem" && (c.bloomLevel === "Debut" || c.bloomLevel === "Spot");
  }).sort((a, b) => (engine!.card(b).hp ?? 0) - (engine!.card(a).hp ?? 0)).slice(0, 5);
  engine.completeSetupPlayer("P2", center.uid, backs.map(x => x.uid), bottom.map(x => x.uid));
}

function setupRedraw(kind: "keep" | "optional" | "mandatory"): void {
  if (!engine || !session || session.step !== "REDRAW") throw new Error("Opening-hand decision is not available.");
  if (kind === "keep") {
    if (!hasDebut("P1")) throw new Error("You must redraw because your hand has no Debut holomem.");
    session.optionalRedrawAvailable = false;
    session.step = "CENTER";
    return;
  }
  if (kind === "optional") {
    if (!session.optionalRedrawAvailable) throw new Error("The optional redraw has already been used or passed.");
    engine.redrawSetupHand("P1", "optional");
    session.optionalRedrawAvailable = false;
    return;
  }
  if (kind === "mandatory") {
    if (hasDebut("P1")) throw new Error("A mandatory redraw is not required because this hand has a Debut holomem.");
    session.optionalRedrawAvailable = false;
    engine.redrawSetupHand("P1", "mandatory");
    return;
  }
  throw new Error("Unknown redraw decision.");
}

function chooseSetupCenter(cardUid: string): void {
  if (!engine || !session || session.step !== "CENTER") throw new Error("Center selection is not available.");
  const instance = engine.player("P1").hand.find(x => x.uid === cardUid);
  if (!instance || engine.card(instance).type !== "Holomem" || engine.card(instance).bloomLevel !== "Debut") throw new Error("Choose a Debut holomem for Center.");
  session.centerUid = cardUid;
  session.backUids = [];
  session.step = "BACK";
}

function chooseSetupBack(cardUids: string[]): PlaybackFrame[] {
  if (!engine || !session || session.step !== "BACK" || !session.centerUid) throw new Error("Back Stage selection is not available.");
  if (cardUids.length > 5 || new Set(cardUids).size !== cardUids.length || cardUids.includes(session.centerUid)) throw new Error("Choose up to five different Back Stage cards.");
  for (const uid of cardUids) {
    const instance = engine.player("P1").hand.find(x => x.uid === uid);
    const card = instance ? engine.card(instance) : null;
    if (!card || card.type !== "Holomem" || (card.bloomLevel !== "Debut" && card.bloomLevel !== "Spot")) throw new Error("Back Stage cards must be Debut or Spot holomem.");
  }
  session.backUids = [...cardUids];
  session.step = engine.player("P1").redrawCount > 0 ? "BOTTOM" : "PLAYING";
  return session.step === "PLAYING" ? finishHumanSetup([]) : [];
}

function chooseSetupBottom(cardUids: string[]): PlaybackFrame[] {
  if (!engine || !session || session.step !== "BOTTOM") throw new Error("Redraw-penalty selection is not available.");
  return finishHumanSetup(cardUids);
}

function finishHumanSetup(bottomUids: string[]): PlaybackFrame[] {
  if (!engine || !session || !session.centerUid) throw new Error("Human setup is incomplete.");
  engine.completeSetupPlayer("P1", session.centerUid, session.backUids, bottomUids);
  session.step = "PLAYING";
  const playback: PlaybackFrame[] = [];
  recordStep(playback, "BEGIN_MATCH", undefined, () => engine!.finishInteractiveSetup());
  runAiTurn(playback);
  return playback;
}

function readBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) as Record<string, unknown> : {});
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".json": "application/json; charset=utf-8",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function serveFile(response: http.ServerResponse, root: string, relativePath: string): void {
  const requested = path.resolve(root, relativePath);
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden path." });
    return;
  }
  if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
    sendJson(response, 404, { error: "File not found." });
    return;
  }
  const cacheControl = root === webRoot ? "no-store" : "public, max-age=3600";
  response.writeHead(200, { "Content-Type": contentType(requested), "Cache-Control": cacheControl });
  fs.createReadStream(requested).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/api/state") return sendJson(response, 200, clientSnapshot());
    if (request.method === "POST" && url.pathname === "/api/abandon-game") {
      engine = null;
      session = null;
      return sendJson(response, 200, clientSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/api/shutdown") {
      sendJson(response, 200, { shuttingDown: true });
      setTimeout(() => {
        server.close();
        server.closeAllConnections();
      }, 100);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/new-game") {
      const body = await readBody(request);
      startPregame(String(body.deckId ?? "hSD01"), String(body.playerOshiId ?? "hSD01-001"), typeof body.seed === "number" ? body.seed : undefined);
      return sendJson(response, 200, clientSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/api/coin-flip") {
      const body = await readBody(request);
      flipCoin(String(body.call ?? "") as "HEADS" | "TAILS");
      return sendJson(response, 200, clientSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/api/turn-order") {
      const body = await readBody(request);
      beginCardSetup(typeof body.playerWantsFirst === "boolean" ? body.playerWantsFirst : undefined);
      return sendJson(response, 200, clientSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/api/setup/redraw") {
      const body = await readBody(request);
      setupRedraw(String(body.kind ?? "") as "keep" | "optional" | "mandatory");
      return sendJson(response, 200, clientSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/api/setup/center") {
      const body = await readBody(request);
      chooseSetupCenter(String(body.cardUid ?? ""));
      return sendJson(response, 200, clientSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/api/setup/back") {
      const body = await readBody(request);
      const playback = chooseSetupBack(Array.isArray(body.cardUids) ? body.cardUids.map(String) : []);
      return sendJson(response, 200, clientSnapshot(playback));
    }
    if (request.method === "POST" && url.pathname === "/api/setup/bottom") {
      const body = await readBody(request);
      const playback = chooseSetupBottom(Array.isArray(body.cardUids) ? body.cardUids.map(String) : []);
      return sendJson(response, 200, clientSnapshot(playback));
    }
    if (request.method === "POST" && url.pathname === "/api/decision") {
      if (!engine) throw new Error("Start a game first.");
      const body = await readBody(request);
      const playback: PlaybackFrame[] = [];
      recordStep(playback, "RESOLVE_DECISION", "P1", () => engine!.resolvePendingDecision("P1", {
        selectedUid: body.selectedUid === null || typeof body.selectedUid === "string" ? body.selectedUid : undefined,
        selectedUids: Array.isArray(body.selectedUids) ? body.selectedUids.map(String) : undefined,
        selectedStageId: typeof body.selectedStageId === "string" ? body.selectedStageId : undefined,
        orderedUids: Array.isArray(body.orderedUids) ? body.orderedUids.map(String) : undefined,
        choice: typeof body.choice === "boolean" ? body.choice : undefined,
        number: typeof body.number === "number" ? body.number : undefined,
      }));
      runAiTurn(playback);
      return sendJson(response, 200, clientSnapshot(playback));
    }
    if (request.method === "POST" && url.pathname === "/api/action") {
      if (!engine || session?.step !== "PLAYING") throw new Error("Complete game setup first.");
      if (engine.state.activePlayer !== "P1") throw new Error("It is not the player's turn.");
      const body = await readBody(request);
      const action = body.action as GameAction;
      const playback: PlaybackFrame[] = [];
      recordStep(playback, action.type, "P1", () => engine!.applyAction(action));
      runAiTurn(playback);
      return sendJson(response, 200, clientSnapshot(playback));
    }
    if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
      serveFile(response, assetsRoot, decodeURIComponent(url.pathname.slice("/assets/".length)));
      return;
    }
    if (request.method === "GET") {
      serveFile(response, webRoot, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1)));
      return;
    }
    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Unexpected error." });
  }
});

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Hololive OCG battle client: ${url}`);
  console.log("Keep this window open while playing. Press Ctrl+C to stop.");
  if (args.includes("--open")) {
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const commandArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(command, commandArgs, { detached: true, stdio: "ignore" }).unref();
  }
});

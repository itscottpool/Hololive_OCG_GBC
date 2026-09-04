import type {
  AbilityDefinition, ArtDefinition, CardDefinition, CardInstance, ChoiceContext, Color, DecisionPolicy,
  GameAction, GameState, HolomemState, LogEntry, PlayerId, PlayerState, StageState, TurnModifier,
} from "./types.ts";
import type { GameData } from "./database.ts";
import { requireCard, requireDeck, validateGameData } from "./database.ts";
import { DeterministicPolicy } from "./policy.ts";
import { SeededRandom } from "./random.ts";

export interface EngineOptions {
  data: GameData;
  deckId?: string;
  p1OshiId?: string;
  p2OshiId?: string;
  seed?: number;
  startingPlayer?: PlayerId;
  policies?: Partial<Record<PlayerId, DecisionPolicy>>;
  interactivePlayers?: PlayerId[];
}

const otherPlayer = (id: PlayerId): PlayerId => id === "P1" ? "P2" : "P1";
const emptyStage = (): StageState => ({ center: null, collab: null, back: [] });
const freshTurnFlags = () => ({ collabUsed: false, batonPassUsed: false, limitedUsed: false, oshiSkillUsed: false });

export class GameEngine {
  readonly data: GameData;
  readonly state: GameState;
  private readonly rng: SeededRandom;
  private readonly policies: Record<PlayerId, DecisionPolicy>;
  private readonly interactivePlayers: Set<PlayerId>;
  private uidCounter = 0;
  private stageCounter = 0;
  private setupStarted = false;
  private readonly setupCompletedPlayers = new Set<PlayerId>();
  private logObserver: ((entry: LogEntry) => void) | null = null;

  constructor(options: EngineOptions) {
    const errors = validateGameData(options.data);
    if (errors.length) throw new Error(`Invalid game data:\n${errors.join("\n")}`);
    this.data = options.data;
    const deck = requireDeck(this.data, options.deckId ?? "hSD01");
    const seed = options.seed ?? 1;
    this.rng = new SeededRandom(seed);
    this.policies = {
      P1: options.policies?.P1 ?? new DeterministicPolicy(),
      P2: options.policies?.P2 ?? new DeterministicPolicy(),
    };
    this.interactivePlayers = new Set(options.interactivePlayers ?? []);
    const p1Oshi = options.p1OshiId ?? deck.oshiOptions[0];
    const p2Oshi = options.p2OshiId ?? deck.oshiOptions[1] ?? deck.oshiOptions[0];
    if (!deck.oshiOptions.includes(p1Oshi) || !deck.oshiOptions.includes(p2Oshi)) throw new Error("Oshi must be a deck-family option.");
    const startingPlayer = options.startingPlayer ?? "P1";
    this.state = {
      schemaVersion: 1,
      seed,
      rngState: this.rng.getState(),
      status: "ONGOING",
      winner: null,
      lossReasons: {},
      startingPlayer,
      activePlayer: startingPlayer,
      turnNumber: 1,
      phase: "SETUP",
      players: {
        P1: this.makePlayer("P1", p1Oshi, deck.mainDeck, deck.cheerDeck),
        P2: this.makePlayer("P2", p2Oshi, deck.mainDeck, deck.cheerDeck),
      },
      modifiers: [],
      pendingDecision: null,
      log: [],
    };
  }

  setup(): void {
    this.beginInteractiveSetup();
    for (const id of [this.state.startingPlayer, otherPlayer(this.state.startingPlayer)]) {
      const player = this.player(id);
      if (this.policy(id).chooseYesNo(this.ctx(id, "optional_mulligan"), false)) {
        this.redrawSetupHand(id, "optional");
      }
    }

    // Mandatory Debut redraws are independent; the redraw count only tracks these,
    // not the one optional redraw allowed by rule 6.2.1.7.
    for (const id of [this.state.startingPlayer, otherPlayer(this.state.startingPlayer)]) {
      const player = this.player(id);
      while (!player.hand.some(x => this.card(x).type === "Holomem" && this.card(x).bloomLevel === "Debut")) {
        this.redrawSetupHand(id, "mandatory");
        if (this.state.status !== "ONGOING") break;
      }
    }
    this.resolveOutcome();
    if (this.state.status !== "ONGOING") return;

    for (const id of [this.state.startingPlayer, otherPlayer(this.state.startingPlayer)]) {
      const player = this.player(id);
      const debuts = player.hand.filter(x => this.card(x).type === "Holomem" && this.card(x).bloomLevel === "Debut")
        .sort((a, b) => (this.card(b).hp ?? 0) - (this.card(a).hp ?? 0));
      const centerCard = this.policy(id).chooseOne(this.ctx(id, "choose_initial_center"), debuts);
      const bottomCandidates = player.hand.filter(x => x.uid !== centerCard.uid);
      const bottom = this.policy(id).chooseMany(this.ctx(id, "mulligan_bottom_cards"), bottomCandidates, player.redrawCount, player.redrawCount);
      const bottomIds = new Set(bottom.map(x => x.uid));
      const backCandidates = player.hand.filter(x => {
        if (x.uid === centerCard.uid || bottomIds.has(x.uid)) return false;
        const c = this.card(x);
        return c.type === "Holomem" && (c.bloomLevel === "Debut" || c.bloomLevel === "Spot");
      }).sort((a, b) => (this.card(b).hp ?? 0) - (this.card(a).hp ?? 0));
      const chosenBack = this.policy(id).chooseMany(this.ctx(id, "choose_initial_back"), backCandidates, 0, 5);
      this.completeSetupPlayer(id, centerCard.uid, chosenBack.map(x => x.uid), bottom.map(x => x.uid));
    }
    this.finishInteractiveSetup();
  }

  beginInteractiveSetup(): void {
    if (this.state.phase !== "SETUP" || this.setupStarted) throw new Error("Game setup has already started.");
    this.setupStarted = true;
    this.log("SETUP_START", `Setup begins; ${this.state.startingPlayer} goes first.`);
    for (const id of [this.state.startingPlayer, otherPlayer(this.state.startingPlayer)]) {
      const player = this.player(id);
      this.rng.shuffle(player.deck);
      this.rng.shuffle(player.cheerDeck);
      this.drawCards(id, 7, "opening hand");
    }
    this.state.rngState = this.rng.getState();
  }

  redrawSetupHand(id: PlayerId, kind: "optional" | "mandatory"): void {
    if (this.state.phase !== "SETUP" || !this.setupStarted || this.setupCompletedPlayers.has(id)) throw new Error("Setup redraw is not available.");
    const player = this.player(id);
    const hasDebut = player.hand.some(x => this.card(x).type === "Holomem" && this.card(x).bloomLevel === "Debut");
    if (kind === "mandatory") {
      if (hasDebut) throw new Error("A mandatory redraw is only allowed without a Debut holomem.");
      if (player.redrawCount === 6) {
        this.markLoss(id, "mandatory redraw count reached 6 without a Debut holomem");
        this.resolveOutcome();
        return;
      }
    }
    player.deck.push(...player.hand.splice(0));
    this.rng.shuffle(player.deck);
    this.log("SHUFFLE", `${id} shuffles their deck.`, id, { reason: kind === "optional" ? "optional mulligan" : "mandatory redraw" });
    this.drawCards(id, 7, kind === "optional" ? "optional mulligan" : "mandatory Debut redraw");
    if (kind === "mandatory") {
      player.redrawCount += 1;
      const foundDebut = player.hand.some(x => this.card(x).type === "Holomem" && this.card(x).bloomLevel === "Debut");
      if (player.redrawCount === 6 && !foundDebut) {
        this.log("MANDATORY_REDRAW", `${id} redraws for a Debut holomem (${player.redrawCount}).`, id);
        this.markLoss(id, "mandatory redraw count reached 6 without a Debut holomem");
        this.resolveOutcome();
        this.state.rngState = this.rng.getState();
        return;
      }
    }
    this.log(kind === "optional" ? "OPTIONAL_MULLIGAN" : "MANDATORY_REDRAW",
      kind === "optional" ? `${id} takes the optional redraw.` : `${id} redraws for a Debut holomem (${player.redrawCount}).`, id);
    this.state.rngState = this.rng.getState();
  }

  completeSetupPlayer(id: PlayerId, centerUid: string, backUids: string[], bottomUids: string[]): void {
    if (this.state.phase !== "SETUP" || !this.setupStarted || this.setupCompletedPlayers.has(id)) throw new Error("Player setup is not available.");
    const player = this.player(id);
    const unique = new Set([centerUid, ...backUids, ...bottomUids]);
    if (unique.size !== 1 + backUids.length + bottomUids.length) throw new Error("A setup card was selected more than once.");
    const byUid = (uid: string) => {
      const found = player.hand.find(x => x.uid === uid);
      if (!found) throw new Error(`${uid} is not in ${id}'s setup hand.`);
      return found;
    };
    const center = byUid(centerUid);
    const centerCard = this.card(center);
    if (centerCard.type !== "Holomem" || centerCard.bloomLevel !== "Debut") throw new Error("The initial Center must be a Debut holomem.");
    if (backUids.length > 5) throw new Error("The Back Stage may contain at most five holomem.");
    const backs = backUids.map(byUid);
    if (backs.some(x => {
      const c = this.card(x);
      return c.type !== "Holomem" || (c.bloomLevel !== "Debut" && c.bloomLevel !== "Spot");
    })) throw new Error("Initial Back Stage cards must be Debut or Spot holomem.");
    if (bottomUids.length !== player.redrawCount) throw new Error(`Choose exactly ${player.redrawCount} card(s) for the redraw penalty.`);
    const bottoms = bottomUids.map(byUid);

    this.removeFromHand(id, centerUid);
    player.stage.center = this.newHolomem(center, 0);
    for (const instance of backs) {
      this.removeFromHand(id, instance.uid);
      player.stage.back.push(this.newHolomem(instance, 0));
    }
    for (const instance of bottoms) this.removeFromHand(id, instance.uid);
    player.deck.unshift(...bottoms);

    const lifeCount = requireCard(this.data, player.oshiCardId).life!;
    for (let i = 0; i < lifeCount; i++) {
      const lifeCard = player.cheerDeck.pop();
      if (!lifeCard) throw new Error(`${id} does not have enough Cheer cards for Life.`);
      player.life.push(lifeCard);
    }
    this.setupCompletedPlayers.add(id);
    this.log("PLAYER_SETUP", `${id} sets ${1 + backs.length} holomem and ${lifeCount} Life.`, id, { redrawCount: player.redrawCount });
    this.state.rngState = this.rng.getState();
  }

  finishInteractiveSetup(): void {
    if (this.state.status !== "ONGOING") return;
    if (!this.setupCompletedPlayers.has("P1") || !this.setupCompletedPlayers.has("P2")) throw new Error("Both players must complete setup first.");
    this.state.rngState = this.rng.getState();
    this.beginTurn();
  }

  listLegalActions(playerId = this.state.activePlayer): GameAction[] {
    if (this.state.status !== "ONGOING" || playerId !== this.state.activePlayer) return [];
    if (this.state.pendingDecision) return [];
    const player = this.player(playerId);
    if (this.state.phase === "CHEER") {
      if (!player.pendingCheer) return [];
      return this.allHolomem(playerId).map(h => ({ type: "ATTACH_CHEER", playerId, targetStageId: h.stageId }));
    }
    if (this.state.phase === "MAIN") {
      const actions: GameAction[] = [];
      if (this.stageCount(playerId) < 6) {
        for (const instance of player.hand) {
          const card = this.card(instance);
          if (card.type === "Holomem" && (card.bloomLevel === "Debut" || card.bloomLevel === "Spot")) {
            actions.push({ type: "PLACE_HOLOMEM", playerId, cardUid: instance.uid });
          }
        }
      }
      for (const instance of player.hand) {
        const card = this.card(instance);
        if (card.type !== "Holomem" || !["1st", "2nd"].includes(card.bloomLevel ?? "")) continue;
        for (const target of this.allHolomem(playerId)) {
          if (this.canBloom(playerId, instance, target)) actions.push({ type: "BLOOM", playerId, cardUid: instance.uid, targetStageId: target.stageId });
        }
      }
      if (!player.turnFlags.collabUsed && !player.stage.collab && player.deck.length > 0) {
        for (const target of player.stage.back.filter(x => !x.resting)) actions.push({ type: "COLLAB", playerId, targetStageId: target.stageId });
      }
      const oshi = requireCard(this.data, player.oshiCardId);
      for (let i = 0; i < (oshi.abilities?.length ?? 0); i++) {
        const ability = oshi.abilities![i];
        if (ability.timing === "main" && this.canUseOshiAbility(playerId, ability)) actions.push({ type: "USE_OSHI_SKILL", playerId, abilityIndex: i });
      }
      for (const instance of player.hand) {
        if (this.canPlaySupport(playerId, instance)) actions.push({ type: "PLAY_SUPPORT", playerId, cardUid: instance.uid });
      }
      if (!player.turnFlags.batonPassUsed && player.stage.center && !player.stage.center.resting && this.canAffordCheers(player.stage.center, this.topCard(player.stage.center).batonPassCost ?? [])) {
        for (const target of player.stage.back.filter(x => !x.resting)) actions.push({ type: "BATON_PASS", playerId, targetStageId: target.stageId });
      }
      actions.push({ type: "END_MAIN", playerId });
      return actions;
    }
    if (this.state.phase === "PERFORMANCE") {
      const actions: GameAction[] = [];
      const attackers = [player.stage.center, player.stage.collab].filter((x): x is HolomemState => Boolean(x));
      const targets = [this.player(otherPlayer(playerId)).stage.center, this.player(otherPlayer(playerId)).stage.collab]
        .filter((x): x is HolomemState => Boolean(x));
      for (const attacker of attackers) {
        if (attacker.resting || attacker.lastArtTurn === this.state.turnNumber) continue;
        const card = this.topCard(attacker);
        for (let artIndex = 0; artIndex < (card.arts?.length ?? 0); artIndex++) {
          if (!this.canAffordCheers(attacker, card.arts![artIndex].cost)) continue;
          for (const target of targets) actions.push({ type: "USE_ART", playerId, attackerStageId: attacker.stageId, artIndex, targetStageId: target.stageId });
        }
      }
      actions.push({ type: "END_PERFORMANCE", playerId });
      return actions;
    }
    return [];
  }

  applyAction(action: GameAction): void {
    if (this.state.status !== "ONGOING") throw new Error("Game is over.");
    if (action.playerId !== this.state.activePlayer) throw new Error("Only the turn player may act.");
    const legal = this.listLegalActions(action.playerId).some(x => JSON.stringify(x) === JSON.stringify(action));
    if (!legal) throw new Error(`Illegal action: ${JSON.stringify(action)}`);

    switch (action.type) {
      case "ATTACH_CHEER": this.attachPendingCheer(action.playerId, action.targetStageId); break;
      case "PLACE_HOLOMEM": this.placeHolomem(action.playerId, action.cardUid); break;
      case "BLOOM": this.bloom(action.playerId, action.cardUid, action.targetStageId); break;
      case "COLLAB": this.collab(action.playerId, action.targetStageId); break;
      case "BATON_PASS": this.batonPass(action.playerId, action.targetStageId); break;
      case "PLAY_SUPPORT": this.playSupport(action.playerId, action.cardUid); break;
      case "USE_OSHI_SKILL": this.useOshiSkill(action.playerId, action.abilityIndex); break;
      case "USE_ART": this.useArt(action.playerId, action.attackerStageId, action.artIndex, action.targetStageId); break;
      case "END_MAIN": this.endMain(action.playerId); break;
      case "END_PERFORMANCE": this.endPerformance(action.playerId); break;
    }
    this.resolveRuleChecks();
    this.state.rngState = this.rng.getState();
  }

  snapshot(): GameState { return structuredClone(this.state); }
  card(instance: CardInstance): CardDefinition { return requireCard(this.data, instance.cardId); }
  topCard(holomem: HolomemState): CardDefinition { return this.card(holomem.stack[holomem.stack.length - 1]); }
  player(id: PlayerId): PlayerState { return this.state.players[id]; }
  policy(id: PlayerId): DecisionPolicy { return this.policies[id]; }
  opponent(id: PlayerId): PlayerId { return otherPlayer(id); }
  allHolomem(id: PlayerId): HolomemState[] {
    const s = this.player(id).stage;
    return [s.center, s.collab, ...s.back].filter((x): x is HolomemState => Boolean(x));
  }
  effectiveNames(holomem: HolomemState): string[] {
    const card = this.topCard(holomem);
    return [card.name, ...(card.additionalNames ?? [])];
  }
  hasName(holomem: HolomemState, name: string): boolean { return this.effectiveNames(holomem).includes(name); }
  hasColor(holomem: HolomemState, color: Color): boolean { return this.topCard(holomem).colors.includes(color); }
  findHolomem(id: PlayerId, stageId: string): HolomemState | undefined { return this.allHolomem(id).find(x => x.stageId === stageId); }

  setLogObserver(observer: ((entry: LogEntry) => void) | null): void {
    this.logObserver = observer;
  }

  private makePlayer(id: PlayerId, oshiCardId: string, main: {cardId:string;quantity:number}[], cheer: {cardId:string;quantity:number}[]): PlayerState {
    return {
      id, oshiCardId,
      deck: this.expand(main, id, "D"),
      cheerDeck: this.expand(cheer, id, "C"),
      hand: [], archive: [], holoPower: [], life: [], stage: emptyStage(), pendingCheer: null, resolution: [],
      redrawCount: 0, turnsTaken: 0, spOshiUsed: false, turnFlags: freshTurnFlags(),
    };
  }

  private expand(entries: {cardId:string;quantity:number}[], playerId: PlayerId, zone: string): CardInstance[] {
    return entries.flatMap(entry => Array.from({ length: entry.quantity }, () => ({ uid: `${playerId}-${zone}-${++this.uidCounter}`, cardId: entry.cardId })));
  }

  private newHolomem(instance: CardInstance, enteredStageTurn: number): HolomemState {
    return { stageId: `H-${++this.stageCounter}`, stack: [instance], cheers: [], supports: [], damage: 0, resting: false, enteredStageTurn };
  }

  private ctx(playerId: PlayerId, reason: string, metadata?: Record<string, unknown>): ChoiceContext { return { playerId, reason, metadata }; }

  private log(event: string, message: string, player?: PlayerId, data?: Record<string, unknown>): void {
    const entry: LogEntry = { seq: this.state.log.length + 1, turn: this.state.turnNumber, phase: this.state.phase, event, message };
    if (player) entry.player = player;
    if (data) entry.data = data;
    this.state.log.push(entry);
    this.logObserver?.(entry);
  }

  private drawCards(id: PlayerId, count: number, reason: string): number {
    const player = this.player(id);
    let drawn = 0;
    while (drawn < count && player.deck.length) {
      player.hand.push(player.deck.pop()!);
      drawn++;
    }
    this.log("DRAW", `${id} draws ${drawn} card(s) for ${reason}.`, id, { requested: count, drawn });
    return drawn;
  }

  private beginTurn(): void {
    if (this.state.status !== "ONGOING") return;
    const id = this.state.activePlayer;
    const player = this.player(id);
    player.turnFlags = freshTurnFlags();
    this.state.phase = "RESET";
    this.log("TURN_START", `${id} starts turn ${this.state.turnNumber}.`, id, { playerTurn: player.turnsTaken + 1 });
    if (player.turnsTaken > 0) {
      for (const h of this.allHolomem(id)) h.resting = false;
      if (player.stage.collab) {
        const returning = player.stage.collab;
        player.stage.collab = null;
        returning.resting = true;
        player.stage.back.push(returning);
        this.log("RESET_COLLAB", `${id}'s Collab holomem returns to Back resting.`, id, { stageId: returning.stageId, cardId: this.topCard(returning).id });
      }
      if (this.promoteCenterIfNeeded(id, "reset")) return;
    } else {
      this.log("RESET_SKIPPED", `${id} skips their first Reset phase.`, id);
    }
    this.continueBeginTurnAfterReset();
  }

  private continueBeginTurnAfterReset(): void {
    const id = this.state.activePlayer;
    const player = this.player(id);
    this.resolveRuleChecks();
    if (this.state.status !== "ONGOING" || this.state.pendingDecision) return;

    this.state.phase = "DRAW";
    if (player.deck.length === 0) {
      this.markLoss(id, "could not draw during the Draw phase");
      this.resolveOutcome();
      return;
    }
    this.drawCards(id, 1, "Draw phase");
    this.state.phase = "CHEER";
    if (player.cheerDeck.length > 0) {
      player.pendingCheer = player.cheerDeck.pop()!;
      this.log("CHEER_REVEALED", `${id} reveals the top Cheer.`, id, { cardId: player.pendingCheer.cardId });
    } else {
      this.log("CHEER_EMPTY", `${id}'s Cheer deck is empty; no loss occurs.`, id);
      this.state.phase = "MAIN";
    }
  }

  private attachPendingCheer(id: PlayerId, targetStageId: string): void {
    const player = this.player(id);
    const target = this.findHolomem(id, targetStageId)!;
    const cheer = player.pendingCheer!;
    player.pendingCheer = null;
    target.cheers.push(cheer);
    this.log("CHEER_ATTACHED", `${id} attaches ${this.card(cheer).name} to their ${this.topCard(target).name}.`, id, { targetStageId, cardId: cheer.cardId, targetCardId: this.topCard(target).id });
    this.state.phase = "MAIN";
  }

  private placeHolomem(id: PlayerId, cardUid: string): void {
    const instance = this.removeFromHand(id, cardUid);
    const holomem = this.newHolomem(instance, this.state.turnNumber);
    this.player(id).stage.back.push(holomem);
    this.log("PLACE_HOLOMEM", `${id} places ${this.card(instance).name} in Back.`, id, { cardId: instance.cardId, stageId: holomem.stageId });
  }

  private canBloom(id: PlayerId, instance: CardInstance, target: HolomemState): boolean {
    const player = this.player(id);
    if (player.turnsTaken === 0 || target.enteredStageTurn === this.state.turnNumber || target.lastBloomTurn === this.state.turnNumber) return false;
    const source = this.card(instance);
    const current = this.topCard(target);
    if (source.type !== "Holomem" || !source.bloomLevel || source.bloomLevel === "Debut" || source.bloomLevel === "Spot") return false;
    if (current.bloomLevel === "Spot" || current.cannotBloom) return false;
    if ((source.hp ?? 0) <= target.damage) return false;
    const sameName = [source.name, ...(source.additionalNames ?? [])].some(name => this.effectiveNames(target).includes(name));
    if (!sameName) return false;
    if (source.bloomLevel === "1st" && !["Debut", "1st"].includes(current.bloomLevel ?? "")) return false;
    if (source.bloomLevel === "2nd" && !["1st", "2nd"].includes(current.bloomLevel ?? "")) return false;
    return true;
  }

  private bloom(id: PlayerId, cardUid: string, targetStageId: string): void {
    const target = this.findHolomem(id, targetStageId)!;
    const previousCardId = this.topCard(target).id;
    const instance = this.removeFromHand(id, cardUid);
    target.stack.push(instance);
    target.lastBloomTurn = this.state.turnNumber;
    this.log("BLOOM", `${id} Blooms ${this.card(instance).name} to ${this.card(instance).bloomLevel}.`, id, { cardId: instance.cardId, previousCardId, targetStageId });
  }

  private collab(id: PlayerId, stageId: string): void {
    const player = this.player(id);
    const index = player.stage.back.findIndex(x => x.stageId === stageId);
    const target = player.stage.back.splice(index, 1)[0];
    player.holoPower.push(player.deck.pop()!);
    player.stage.collab = target;
    player.turnFlags.collabUsed = true;
    const abilities = (this.topCard(target).abilities ?? []).filter(x => x.kind === "collab");
    this.log("COLLAB", `${id} moves ${this.topCard(target).name} into Collab and gains 1 holo Power.`, id, {
      stageId, cardId: this.topCard(target).id,
      abilityName: abilities.map(x => x.name).join(" / "),
      description: abilities.map(x => x.printedText).filter(Boolean).join(" "),
    });
    for (const ability of abilities) this.resolveEffect(id, ability, target);
  }

  private batonPass(id: PlayerId, backStageId: string): void {
    const player = this.player(id);
    const center = player.stage.center!;
    const backIndex = player.stage.back.findIndex(x => x.stageId === backStageId);
    const back = player.stage.back[backIndex];
    this.payCheerCost(id, center, this.topCard(center).batonPassCost ?? []);
    player.stage.back[backIndex] = center;
    player.stage.center = back;
    player.turnFlags.batonPassUsed = true;
    this.log("BATON_PASS", `${id} Baton Passes from ${this.topCard(center).name} to ${this.topCard(back).name}.`, id, { oldCenter: center.stageId, newCenter: back.stageId, oldCenterCardId: this.topCard(center).id, newCenterCardId: this.topCard(back).id });
  }

  private canUseOshiAbility(id: PlayerId, ability: AbilityDefinition): boolean {
    const player = this.player(id);
    if (player.turnFlags.oshiSkillUsed || player.holoPower.length < (ability.holoPowerCost ?? 0)) return false;
    if (ability.usage === "1/Game" && player.spOshiUsed) return false;
    if (ability.id === "send_archive_cheers_to_green" && !this.allHolomem(id).some(h => this.hasColor(h, "Green"))) return false;
    return true;
  }

  private useOshiSkill(id: PlayerId, abilityIndex: number): void {
    const player = this.player(id);
    const ability = requireCard(this.data, player.oshiCardId).abilities![abilityIndex];
    this.payHoloPower(id, ability.holoPowerCost ?? 0);
    player.turnFlags.oshiSkillUsed = true;
    if (ability.usage === "1/Game") player.spOshiUsed = true;
    this.log("OSHI_SKILL", `${id} uses Oshi Skill ${ability.name}.`, id, {
      effectId: ability.id, abilityName: ability.name, cardId: player.oshiCardId,
      description: ability.printedText,
    });
    this.resolveEffect(id, ability);
  }

  private canPlaySupport(id: PlayerId, instance: CardInstance): boolean {
    const player = this.player(id);
    const card = this.card(instance);
    if (card.type !== "Support") return false;
    if (card.limited && (player.turnFlags.limitedUsed || (id === this.state.startingPlayer && player.turnsTaken === 0))) return false;
    const effect = card.abilities![0];
    if (effect.id === "mulligan_hand_draw" && player.hand.length < 2) return false;
    if (effect.id === "archive_cheer_search_nonbuzz_bloom" && this.allHolomem(id).every(h => h.cheers.length === 0)) return false;
    if (effect.id === "look_top_reveal_names" && player.hand.length - 1 > 6) return false;
    return true;
  }

  private playSupport(id: PlayerId, cardUid: string): void {
    const player = this.player(id);
    const instance = this.removeFromHand(id, cardUid);
    const card = this.card(instance);
    const ability = card.abilities![0];
    if (card.limited) player.turnFlags.limitedUsed = true;
    player.archive.push(instance);
    this.log("PLAY_SUPPORT", `${id} plays ${card.name}.`, id, {
      cardId: card.id, effectId: ability.id, abilityName: ability.name, description: ability.printedText,
    });
    this.resolveEffect(id, ability);
  }

  private useArt(id: PlayerId, attackerStageId: string, artIndex: number, targetStageId: string): void {
    const attacker = this.findHolomem(id, attackerStageId)!;
    const art = this.topCard(attacker).arts![artIndex];
    attacker.lastArtTurn = this.state.turnNumber;
    const effectDamage = this.resolveArtEffect(id, attacker, art);
    if (this.state.pendingDecision) {
      this.state.pendingDecision.metadata = {
        ...(this.state.pendingDecision.metadata ?? {}),
        continuation: "COMPLETE_ART",
        attackerStageId,
        targetStageId,
        artIndex,
        effectDamage,
      };
      return;
    }
    this.completeArt(id, attackerStageId, artIndex, targetStageId, effectDamage);
  }

  private completeArt(id: PlayerId, attackerStageId: string, artIndex: number, targetStageId: string, effectDamage: number): void {
    const attacker = this.findHolomem(id, attackerStageId)!;
    const target = this.findHolomem(otherPlayer(id), targetStageId)!;
    const art = this.topCard(attacker).arts![artIndex];
    let damage = art.damage + effectDamage;
    if (art.critical && this.hasColor(target, art.critical.color)) damage += art.critical.bonus;
    damage += this.state.modifiers.filter(x => x.kind === "ART_DAMAGE" && x.controller === id && x.stageId === attacker.stageId).reduce((sum, x) => sum + x.amount, 0);
    target.damage += damage;
    this.log("ART", `${id} attacks ${this.topCard(target).name} with ${this.topCard(attacker).name}'s ${art.name} for ${damage} damage!`, id, {
      attackerStageId, targetStageId, artIndex, damage, artName: art.name,
      attackerCardId: this.topCard(attacker).id, targetCardId: this.topCard(target).id,
      attackerColor: this.topCard(attacker).colors[0] ?? "Neutral",
      description: this.describeArt(art),
    });
    this.resolveDowned();
  }

  private describeArt(art: ArtDefinition): string {
    const cost = art.cost.length ? `${art.cost.join(" + ")} Cheer` : "no Cheer";
    const critical = art.critical ? ` Against a ${art.critical.color} Holomem, it deals +${art.critical.bonus} damage.` : "";
    const printed = art.printedText ? ` ${art.printedText}` : "";
    return `Cost: ${cost}. Base damage: ${art.damage}.${critical}${printed}`;
  }

  private resolveArtEffect(id: PlayerId, attacker: HolomemState, art: ArtDefinition): number {
    const player = this.player(id);
    if (art.id !== "basic_damage") this.log("EFFECT_RESOLVE", `${id} resolves ${art.id}.`, id, { effectId: art.id, source: "Art" });
    switch (art.id) {
      case "bonus_if_name_on_stage":
        return this.allHolomem(id).some(h => this.hasName(h, String(art.params?.name))) ? Number(art.params?.bonus ?? 0) : 0;
      case "send_cheer_if_name_on_stage": {
        if (this.allHolomem(id).some(h => this.hasName(h, String(art.params?.name)))) {
          this.beginTopCheerTarget(id, this.allHolomem(id), "art_send_cheer", art.name, { effectId: art.id });
        }
        return 0;
      }
      case "roll_odd_bonus_one_extra": {
        if (!this.policy(id).chooseYesNo(this.ctx(id, "optional_art_die", { effectId: art.id }), true)) return 0;
        const roll = this.rollDie(id, "holomem_ability", 1);
        return (roll % 2 === 1 ? Number(art.params?.oddBonus ?? 50) : 0) + (roll === 1 ? Number(art.params?.oneExtraBonus ?? 50) : 0);
      }
      case "roll_parity_send_or_draw": {
        if (!this.policy(id).chooseYesNo(this.ctx(id, "optional_art_die", { effectId: art.id }), true)) return 0;
        const preferred = player.cheerDeck.length ? 1 : 2;
        const roll = this.rollDie(id, "holomem_ability", preferred);
        if (roll % 2 === 1) this.sendTopCheer(id, attacker.stageId);
        else this.drawCards(id, 1, "SorAZ Art");
        return 0;
      }
      default: return 0;
    }
  }

  private resolveEffect(id: PlayerId, effect: AbilityDefinition, source?: HolomemState): void {
    const player = this.player(id);
    this.log("EFFECT_RESOLVE", `${id} resolves ${effect.id}.`, id, { effectId: effect.id, sourceStageId: source?.stageId });
    switch (effect.id) {
      case "reattach_cheer": {
        const targets = this.allHolomem(id).sort((a, b) => this.cheerNeedScore(id, b) - this.cheerNeedScore(id, a));
        const target = this.policy(id).chooseOne(this.ctx(id, "reattach_target"), targets);
        const sources = targets.flatMap(h => h.cheers.map(cheer => ({ h, cheer })))
          .sort((a, b) => Number(a.h.stageId === target.stageId) - Number(b.h.stageId === target.stageId));
        if (sources.length) {
          const chosen = this.policy(id).chooseOne(this.ctx(id, "reattach_source"), sources);
          chosen.h.cheers.splice(chosen.h.cheers.findIndex(x => x.uid === chosen.cheer.uid), 1);
          target.cheers.push(chosen.cheer);
        }
        break;
      }
      case "swap_opponent_center_with_back_then_buff": {
        const opponent = this.player(otherPlayer(id));
        if (opponent.stage.center && opponent.stage.back.length) {
          const knockoutTargets = [...opponent.stage.back].sort((a, b) => {
            const aRemaining = (this.topCard(a).hp ?? 0) - a.damage;
            const bRemaining = (this.topCard(b).hp ?? 0) - b.damage;
            return aRemaining - bRemaining || b.damage - a.damage;
          });
          const selected = this.policy(id).chooseOne(this.ctx(id, "opponent_back_to_swap"), knockoutTargets);
          const index = opponent.stage.back.findIndex(x => x.stageId === selected.stageId);
          opponent.stage.back[index] = opponent.stage.center;
          opponent.stage.center = selected;
        }
        const center = player.stage.center;
        if (center && this.hasColor(center, String(effect.params?.buffColor) as Color)) this.addArtModifier(id, center.stageId, Number(effect.params?.artsBonus ?? 50));
        break;
      }
      case "send_archive_cheers_to_green": {
        const targets = this.allHolomem(id).filter(h => this.hasColor(h, "Green"));
        if (!targets.length) break;
        const cheers = player.archive.filter(x => this.card(x).type === "Cheer");
        if (this.interactivePlayers.has(id)) {
          this.state.pendingDecision = {
            id: `D-${this.state.log.length + 1}`,
            playerId: id,
            kind: "ARCHIVE_CHEERS",
            step: "SELECT_ARCHIVE_CHEER_TARGET",
            eligibleUids: cheers.map(x => x.uid),
            eligibleStageIds: targets.map(x => x.stageId),
            metadata: { sourceCardId: player.oshiCardId, effectId: effect.id, abilityName: effect.name },
          };
          this.log("DECISION_PENDING", `${id} must choose a Green Holomem for ${effect.name}.`, id, { decisionKind: "ARCHIVE_CHEERS" });
          break;
        }
        const target = this.policy(id).chooseOne(this.ctx(id, "green_cheer_target"), targets);
        const selected = this.policy(id).chooseMany(this.ctx(id, "archive_cheers_any_number"), cheers, 0, cheers.length);
        this.attachArchiveCheers(id, target, selected, player.oshiCardId, effect.name);
        break;
      }
      case "buff_center_arts": {
        if (player.stage.center) this.addArtModifier(id, player.stage.center.stageId, Number(effect.params?.amount ?? 20));
        break;
      }
      case "exchange_holo_power": {
        if (!player.holoPower.length) break;
        const taken = this.policy(id).chooseOne(this.ctx(id, "take_holo_power"), player.holoPower);
        player.holoPower.splice(player.holoPower.findIndex(x => x.uid === taken.uid), 1);
        player.hand.push(taken);
        const returned = this.policy(id).chooseOne(this.ctx(id, "return_holo_power"), player.hand);
        player.hand.splice(player.hand.findIndex(x => x.uid === returned.uid), 1);
        player.holoPower.push(returned);
        break;
      }
      case "roll_send_cheer_optional_move_back": {
        if (!this.policy(id).chooseYesNo(this.ctx(id, "optional_collab_die", { effectId: effect.id }), true)) break;
        const roll = this.rollDie(id, "holomem_ability", 1);
        if (roll <= 4 && player.stage.back.length) {
          const pending = this.beginTopCheerTarget(id, player.stage.back, "expanding_map_back_target", effect.name, {
            effectId: effect.id,
            continuation: "EXPANDING_MAP",
            roll,
            sourceStageId: source?.stageId,
          });
          if (pending) break;
        }
        this.finishExpandingMap(id, source?.stageId, roll);
        break;
      }
      case "send_archive_cheer_to_center": {
        if (!player.stage.center) break;
        const allowed = new Set((effect.params?.colors as Color[] | undefined) ?? ["White", "Green"]);
        const cheers = player.archive.filter(x => this.card(x).type === "Cheer" && allowed.has(this.card(x).provides!));
        if (cheers.length && this.policy(id).chooseYesNo(this.ctx(id, "optional_archive_cheer"), true)) {
          const selected = this.policy(id).chooseOne(this.ctx(id, "archive_cheer_to_center"), cheers);
          player.archive.splice(player.archive.findIndex(x => x.uid === selected.uid), 1);
          player.stage.center.cheers.push(selected);
        }
        break;
      }
      case "conditional_center_name_effects": {
        const center = player.stage.center;
        if (center && this.hasName(center, "Tokino Sora")) this.drawCards(id, 1, "SoAzKo");
        if (center && this.hasName(center, "AZKi")) this.sendTopCheer(id, center.stageId);
        break;
      }
      case "search_debut_to_stage": {
        if (this.stageCount(id) >= 6) break;
        const matches = player.deck.filter(x => this.card(x).type === "Holomem" && this.card(x).bloomLevel === "Debut")
          .sort((a, b) => (this.card(b).hp ?? 0) - (this.card(a).hp ?? 0));
        if (matches.length) {
          if (this.interactivePlayers.has(id)) {
            const matchUids = new Set(matches.map(x => x.uid));
            player.deck = player.deck.filter(x => !matchUids.has(x.uid));
            player.resolution.push(...matches);
            this.state.pendingDecision = {
              id: `D-${this.state.log.length + 1}`,
              playerId: id,
              kind: "NORMAL_PC",
              step: "SELECT_DEBUT",
              eligibleUids: matches.map(x => x.uid),
            };
            this.log("DECISION_PENDING", `${id} must choose a Debut holomem for Normal PC.`, id, { decisionKind: "NORMAL_PC", matchCount: matches.length });
            break;
          }
          const selected = this.policy(id).chooseOne(this.ctx(id, "normal_pc_target"), matches);
          player.deck.splice(player.deck.findIndex(x => x.uid === selected.uid), 1);
          player.stage.back.push(this.newHolomem(selected, this.state.turnNumber));
          this.log("NORMAL_PC_PLACE", `${id} reveals ${this.card(selected).name} and places it in Back.`, id, { cardId: selected.cardId });
        }
        this.rng.shuffle(player.deck);
        this.log("SHUFFLE", `${id} shuffles their deck.`, id, { reason: "Normal PC" });
        break;
      }
      case "draw_cards": this.drawCards(id, Number(effect.params?.count ?? 3), "support effect"); break;
      case "mulligan_hand_draw": {
        player.deck.push(...player.hand.splice(0));
        this.rng.shuffle(player.deck);
        this.log("SHUFFLE", `${id} shuffles their hand into the deck.`, id, { reason: "Manager-chan" });
        this.drawCards(id, Number(effect.params?.draw ?? 5), "Manager-chan");
        break;
      }
      case "look_top_find_limited": {
        const looked = player.deck.splice(-Number(effect.params?.look ?? 5));
        const matches = looked.filter(x => this.card(x).type === "Support" && this.card(x).limited);
        if (this.interactivePlayers.has(id)) {
          player.resolution.push(...looked);
          this.state.pendingDecision = {
            id: `D-${this.state.log.length + 1}`,
            playerId: id,
            kind: "SUB_PC",
            step: matches.length ? "SELECT_LIMITED" : "ORDER_BOTTOM",
            eligibleUids: matches.map(x => x.uid),
          };
          this.log("DECISION_PENDING", `${id} must resolve Sub PC's revealed cards.`, id, { decisionKind: "SUB_PC", matchCount: matches.length });
          break;
        }
        if (matches.length) {
          const selected = this.policy(id).chooseOne(this.ctx(id, "sub_pc_target"), matches);
          looked.splice(looked.findIndex(x => x.uid === selected.uid), 1);
          player.hand.push(selected);
        }
        player.deck.unshift(...looked);
        break;
      }
      case "archive_cheer_search_nonbuzz_bloom": {
        const sources = this.allHolomem(id).flatMap(h => h.cheers.map(cheer => ({ h, cheer })));
        const payment = this.policy(id).chooseOne(this.ctx(id, "amazing_pc_cheer_cost"), sources);
        payment.h.cheers.splice(payment.h.cheers.findIndex(x => x.uid === payment.cheer.uid), 1);
        player.archive.push(payment.cheer);
        const matches = player.deck.filter(x => {
          const c = this.card(x);
          return c.type === "Holomem" && !c.buzz && (c.bloomLevel === "1st" || c.bloomLevel === "2nd");
        });
        if (matches.length) {
          const selected = this.policy(id).chooseOne(this.ctx(id, "amazing_pc_target"), matches);
          player.deck.splice(player.deck.findIndex(x => x.uid === selected.uid), 1);
          player.hand.push(selected);
        }
        this.rng.shuffle(player.deck);
        this.log("SHUFFLE", `${id} shuffles their deck.`, id, { reason: "Amazing PC" });
        break;
      }
      case "roll_send_archive_cheer": {
        const roll = this.rollDie(id, "support_ability");
        if (roll >= Number(effect.params?.minimum ?? 3)) {
          const cheers = player.archive.filter(x => this.card(x).type === "Cheer");
          const target = this.chooseFriendlyHolomem(id, "listener_cheer_target");
          if (cheers.length && target) {
            const selected = this.policy(id).chooseOne(this.ctx(id, "listener_archive_cheer"), cheers);
            player.archive.splice(player.archive.findIndex(x => x.uid === selected.uid), 1);
            target.cheers.push(selected);
          }
        }
        break;
      }
      case "look_top_reveal_names": {
        const looked = player.deck.splice(-Number(effect.params?.look ?? 4));
        const names = (effect.params?.names as string[] | undefined) ?? [];
        const matches = looked.filter(x => {
          const c = this.card(x);
          if (c.type !== "Holomem") return false;
          const cardNames = [c.name, ...(c.additionalNames ?? [])];
          return names.some(n => cardNames.includes(n));
        });
        const selected = this.policy(id).chooseMany(this.ctx(id, "first_gravity_targets"), matches, 0, matches.length);
        for (const instance of selected) {
          looked.splice(looked.findIndex(x => x.uid === instance.uid), 1);
          player.hand.push(instance);
        }
        player.deck.unshift(...looked);
        break;
      }
    }
  }

  resolvePendingDecision(id: PlayerId, input: { selectedUid?: string | null; selectedUids?: string[]; selectedStageId?: string; orderedUids?: string[] }): void {
    const decision = this.state.pendingDecision;
    if (!decision || decision.playerId !== id) throw new Error("There is no pending decision for this player.");
    const player = this.player(id);

    if (decision.kind === "TOP_CHEER") {
      const selectedStageId = input.selectedStageId;
      if (!selectedStageId || !decision.eligibleStageIds?.includes(selectedStageId)) throw new Error("Choose an eligible Holomem to receive the top Cheer.");
      const target = this.findHolomem(id, selectedStageId);
      if (!target) throw new Error("The selected Cheer target is no longer on Stage.");
      const sourceIndex = player.resolution.findIndex(x => x.uid === decision.sourceCardUid);
      if (sourceIndex < 0) throw new Error("The revealed top Cheer is no longer available.");
      const [cheer] = player.resolution.splice(sourceIndex, 1);
      target.cheers.push(cheer);
      const metadata = structuredClone(decision.metadata ?? {});
      this.state.pendingDecision = null;
      this.log("EFFECT_SEND_CHEER", `${id} sends ${this.card(cheer).name} from the Cheer deck to ${this.topCard(target).name}.`, id, {
        targetStageId: target.stageId, cardId: cheer.cardId, targetCardId: this.topCard(target).id,
      });
      if (metadata.continuation === "COMPLETE_ART") {
        this.completeArt(id, String(metadata.attackerStageId), Number(metadata.artIndex), String(metadata.targetStageId), Number(metadata.effectDamage ?? 0));
      } else if (metadata.continuation === "EXPANDING_MAP") {
        this.finishExpandingMap(id, typeof metadata.sourceStageId === "string" ? metadata.sourceStageId : undefined, Number(metadata.roll ?? 0));
      }
      return;
    }

    if (decision.kind === "ARCHIVE_CHEERS") {
      if (decision.step === "SELECT_ARCHIVE_CHEER_TARGET") {
        const selectedStageId = input.selectedStageId;
        if (!selectedStageId || !decision.eligibleStageIds?.includes(selectedStageId)) throw new Error("Choose an eligible Green Holomem.");
        if (!this.findHolomem(id, selectedStageId)) throw new Error("The selected Green Holomem is no longer on Stage.");
        decision.step = "SELECT_ARCHIVE_CHEERS";
        decision.metadata = { ...(decision.metadata ?? {}), targetStageId: selectedStageId };
        this.log("DECISION_PENDING", `${id} must choose how many archived Cheers to send.`, id, { decisionKind: "ARCHIVE_CHEERS" });
        return;
      }
      if (decision.step !== "SELECT_ARCHIVE_CHEERS") throw new Error(`Unsupported archive Cheer decision step: ${decision.step}`);
      const selectedUids = input.selectedUids ?? [];
      if (new Set(selectedUids).size !== selectedUids.length || selectedUids.some(uid => !decision.eligibleUids.includes(uid))) {
        throw new Error("Choose each eligible archived Cheer at most once.");
      }
      const selected = selectedUids.map(uid => {
        const cheer = player.archive.find(x => x.uid === uid);
        if (!cheer || this.card(cheer).type !== "Cheer") throw new Error("An archived Cheer selection is no longer available.");
        return cheer;
      });
      const target = this.findHolomem(id, String(decision.metadata?.targetStageId));
      if (!target || !this.hasColor(target, "Green")) throw new Error("The selected Green Holomem is no longer available.");
      const sourceCardId = String(decision.metadata?.sourceCardId ?? player.oshiCardId);
      const abilityName = String(decision.metadata?.abilityName ?? "Oshi Skill");
      this.state.pendingDecision = null;
      this.attachArchiveCheers(id, target, selected, sourceCardId, abilityName);
      return;
    }

    if (decision.kind === "LIFE_CHEER") {
      const selectedStageId = input.selectedStageId;
      if (!selectedStageId || !decision.eligibleStageIds?.includes(selectedStageId)) throw new Error("Choose a Holomem to receive the Cheer revealed from Life.");
      const target = this.findHolomem(id, selectedStageId);
      if (!target) throw new Error("The selected Life Cheer target is no longer on Stage.");
      const sourceIndex = player.resolution.findIndex(x => x.uid === decision.sourceCardUid);
      if (sourceIndex < 0) throw new Error("The revealed Life Cheer is no longer available.");
      const [life] = player.resolution.splice(sourceIndex, 1);
      target.cheers.push(life);
      const remaining = structuredClone((decision.metadata?.remainingLifeDamage ?? {}) as Partial<Record<PlayerId, number>>);
      this.state.pendingDecision = null;
      this.log("LIFE_DAMAGE", `${id} loses 1 Life and sends the revealed ${this.card(life).name} to ${this.topCard(target).name}.`, id, {
        remainingLife: player.life.length, cardId: life.cardId, targetCardId: this.topCard(target).id, targetStageId: target.stageId,
      });
      if (player.life.length === 0) {
        this.markLoss(id, "Life reached 0");
        remaining[id] = 0;
      }
      this.continueLifeDamage(remaining);
      return;
    }

    if (decision.kind === "CENTER_PROMOTION") {
      const selectedStageId = input.selectedStageId;
      if (!selectedStageId || !decision.eligibleStageIds?.includes(selectedStageId)) throw new Error("Choose a Back Stage Holomem to move to Center.");
      const index = player.stage.back.findIndex(x => x.stageId === selectedStageId);
      if (index < 0) throw new Error("The selected Holomem is no longer on the Back Stage.");
      const [chosen] = player.stage.back.splice(index, 1);
      player.stage.center = chosen;
      const timing = String(decision.metadata?.timing ?? "reset");
      const continuation = String(decision.metadata?.continuation ?? "BEGIN_TURN_AFTER_RESET");
      this.state.pendingDecision = null;
      this.log("CENTER_PROMOTED", `${id} moves ${this.topCard(chosen).name} to Center.`, id, { stageId: chosen.stageId, timing, cardId: this.topCard(chosen).id });
      if (continuation === "FINISH_TURN_AFTER_PROMOTION") this.continueFinishTurnAfterPromotion(id);
      else this.continueBeginTurnAfterReset();
      return;
    }

    if (decision.kind === "NORMAL_PC") {
      if (decision.step !== "SELECT_DEBUT") throw new Error(`Unsupported Normal PC decision step: ${decision.step}`);
      const selectedUid = input.selectedUid;
      if (!selectedUid || !decision.eligibleUids.includes(selectedUid)) throw new Error("Choose one of the Debut holomem found by Normal PC.");
      const index = player.resolution.findIndex(x => x.uid === selectedUid);
      if (index < 0) throw new Error("The selected Normal PC card is no longer available.");
      const [selected] = player.resolution.splice(index, 1);
      player.deck.push(...player.resolution.splice(0));
      player.stage.back.push(this.newHolomem(selected, this.state.turnNumber));
      this.state.pendingDecision = null;
      this.log("NORMAL_PC_PLACE", `${id} reveals ${this.card(selected).name} and places it in Back.`, id, { cardId: selected.cardId });
      this.rng.shuffle(player.deck);
      this.log("SHUFFLE", `${id} shuffles their deck.`, id, { reason: "Normal PC" });
      this.state.rngState = this.rng.getState();
      return;
    }

    if (decision.step === "SELECT_LIMITED") {
      const selectedUid = input.selectedUid ?? null;
      if (selectedUid !== null && !decision.eligibleUids.includes(selectedUid)) throw new Error("That card cannot be selected by Sub PC.");
      if (selectedUid !== null) {
        const index = player.resolution.findIndex(x => x.uid === selectedUid);
        if (index < 0) throw new Error("The selected Sub PC card is no longer revealed.");
        const [selected] = player.resolution.splice(index, 1);
        player.hand.push(selected);
        this.log("SUB_PC_TAKE", `${id} adds ${this.card(selected).name} to their hand.`, id, { cardId: selected.cardId });
      } else {
        this.log("SUB_PC_SKIP", `${id} does not add a LIMITED card to hand.`, id);
      }
      decision.step = "ORDER_BOTTOM";
      decision.eligibleUids = [];
      return;
    }

    const orderedUids = input.orderedUids;
    if (!orderedUids) throw new Error("Sub PC requires an order for the remaining cards.");
    if (orderedUids.length !== player.resolution.length || new Set(orderedUids).size !== orderedUids.length) throw new Error("Order every remaining Sub PC card exactly once.");
    const current = new Map(player.resolution.map(x => [x.uid, x]));
    if (orderedUids.some(uid => !current.has(uid))) throw new Error("Sub PC order contains an unknown card.");
    const ordered = orderedUids.map(uid => current.get(uid)!);
    player.resolution.splice(0);
    player.deck.unshift(...ordered);
    this.state.pendingDecision = null;
    this.log("SUB_PC_BOTTOM", `${id} puts ${ordered.length} card(s) on the bottom of the deck in the chosen order.`, id, { cardIds: ordered.map(x => x.cardId) });
    this.state.rngState = this.rng.getState();
  }

  private addArtModifier(id: PlayerId, stageId: string, amount: number): void {
    const modifier: TurnModifier = { id: `M-${this.state.log.length + 1}`, kind: "ART_DAMAGE", controller: id, stageId, amount, expiresAtTurnEnd: this.state.turnNumber };
    this.state.modifiers.push(modifier);
  }

  private rollDie(id: PlayerId, sourceKind: "holomem_ability" | "support_ability", preferred?: number): number {
    const player = this.player(id);
    const oshi = requireCard(this.data, player.oshiCardId);
    const override = oshi.abilities?.find(x => x.id === "replace_next_die_result");
    if (sourceKind === "holomem_ability" && override && this.canUseOshiAbility(id, override) && this.policy(id).chooseYesNo(this.ctx(id, "use_azki_die_override", { preferred }), true)) {
      this.payHoloPower(id, override.holoPowerCost ?? 3);
      player.turnFlags.oshiSkillUsed = true;
      const result = preferred ?? this.policy(id).chooseNumber(this.ctx(id, "declare_die_face"), 1, 6);
      this.log("DIE_REPLACED", `${id} uses A Map in My Left Hand and declares ${result}.`, id, {
        result, cardId: player.oshiCardId, abilityName: override.name, description: override.printedText,
      });
      return result;
    }
    const result = this.rng.int(1, 6);
    this.log("DIE_ROLL", `${id} rolls ${result}.`, id, { result, sourceKind });
    return result;
  }

  private sendTopCheer(id: PlayerId, targetStageId?: string): void {
    if (!targetStageId) return;
    const player = this.player(id);
    const target = this.findHolomem(id, targetStageId);
    const cheer = player.cheerDeck.pop();
    if (target && cheer) {
      target.cheers.push(cheer);
      this.log("EFFECT_SEND_CHEER", `${id} sends ${this.card(cheer).name} from the Cheer deck to ${this.topCard(target).name}.`, id, { targetStageId, cardId: cheer.cardId, targetCardId: this.topCard(target).id });
    }
  }

  private beginTopCheerTarget(
    id: PlayerId,
    targets: HolomemState[],
    reason: string,
    effectName: string,
    metadata: Record<string, unknown> = {},
  ): boolean {
    const player = this.player(id);
    if (!targets.length || !player.cheerDeck.length) return false;
    if (!this.interactivePlayers.has(id)) {
      const options = [...targets].sort((a, b) => this.cheerNeedScore(id, b) - this.cheerNeedScore(id, a));
      const target = this.policy(id).chooseOne(this.ctx(id, reason), options);
      this.sendTopCheer(id, target.stageId);
      return false;
    }
    const cheer = player.cheerDeck.pop()!;
    player.resolution.push(cheer);
    this.state.pendingDecision = {
      id: `D-${this.state.log.length + 1}`,
      playerId: id,
      kind: "TOP_CHEER",
      step: "SELECT_EFFECT_CHEER_TARGET",
      eligibleUids: [],
      eligibleStageIds: targets.map(x => x.stageId),
      sourceCardUid: cheer.uid,
      cardId: cheer.cardId,
      metadata: { ...metadata, effectName },
    };
    this.log("EFFECT_CHEER_REVEALED", `${id} reveals ${this.card(cheer).name} for ${effectName}. Choose a Holomem to receive it.`, id, {
      cardId: cheer.cardId, effectName,
    });
    return true;
  }

  private finishExpandingMap(id: PlayerId, sourceStageId: string | undefined, roll: number): void {
    const player = this.player(id);
    if (roll !== 1 || !sourceStageId || player.stage.collab?.stageId !== sourceStageId) return;
    if (!this.policy(id).chooseYesNo(this.ctx(id, "move_collab_to_back"), true)) return;
    const source = player.stage.collab;
    player.stage.collab = null;
    player.stage.back.push(source);
    this.log("COLLAB_RETURNED", `${id} moves ${this.topCard(source).name} from Collab back to the Back Stage.`, id, {
      stageId: source.stageId, cardId: this.topCard(source).id,
    });
  }

  private attachArchiveCheers(id: PlayerId, target: HolomemState, selected: CardInstance[], sourceCardId: string, abilityName: string): void {
    const player = this.player(id);
    for (const cheer of selected) {
      const index = player.archive.findIndex(x => x.uid === cheer.uid);
      if (index < 0) continue;
      player.archive.splice(index, 1);
      target.cheers.push(cheer);
    }
    const count = selected.length;
    this.log("ARCHIVE_CHEERS_ATTACHED", count
      ? `${id} sends ${count} Cheer${count === 1 ? "" : "s"} from the Archive to ${this.topCard(target).name}.`
      : `${id} sends no Cheers from the Archive with ${abilityName}.`, id, {
      sourceCardId,
      targetStageId: target.stageId,
      targetCardId: this.topCard(target).id,
      cheerCardIds: selected.map(x => x.cardId),
      abilityName,
      count,
    });
  }

  private chooseFriendlyHolomem(id: PlayerId, reason: string): HolomemState | undefined {
    const options = this.allHolomem(id).sort((a, b) => this.cheerNeedScore(id, b) - this.cheerNeedScore(id, a));
    return options.length ? this.policy(id).chooseOne(this.ctx(id, reason), options) : undefined;
  }

  private cheerNeedScore(id: PlayerId, h: HolomemState): number {
    const arts = this.topCard(h).arts ?? [];
    const maxCost = Math.max(0, ...arts.map(a => a.cost.length));
    return (maxCost - h.cheers.length) * 100 + (h === this.player(id).stage.center ? 20 : 0) + (this.topCard(h).hp ?? 0) / 100;
  }

  private resolveDowned(): void {
    const lifeDamage: Partial<Record<PlayerId, number>> = {};
    while (true) {
      const candidates = ([this.state.activePlayer, otherPlayer(this.state.activePlayer)] as PlayerId[])
        .flatMap(id => this.allHolomem(id).filter(h => h.damage >= (this.topCard(h).hp ?? Infinity)).map(h => ({ id, h })));
      if (!candidates.length) break;
      const { id, h } = candidates[0];
      const card = this.topCard(h);
      const loss = card.buzz || card.abilities?.some(x => x.id === "life_damage_override_2") ? 2 : 1;
      this.removeStageHolomem(id, h.stageId);
      this.player(id).archive.push(...h.stack, ...h.cheers, ...h.supports);
      lifeDamage[id] = (lifeDamage[id] ?? 0) + loss;
      this.log("DOWNED", `${id}'s ${card.name} is downed and will take ${loss} Life damage.`, id, { stageId: h.stageId, lifeDamage: loss, cardId: card.id });
    }
    this.resolveRuleChecks(false);
    if (this.state.status !== "ONGOING") return;
    this.continueLifeDamage(lifeDamage);
  }

  private continueLifeDamage(lifeDamage: Partial<Record<PlayerId, number>>): void {
    for (const id of [this.state.activePlayer, otherPlayer(this.state.activePlayer)] as PlayerId[]) {
      while ((lifeDamage[id] ?? 0) > 0) {
        const player = this.player(id);
        const life = player.life.pop();
        lifeDamage[id] = (lifeDamage[id] ?? 0) - 1;
        if (!life) {
          this.markLoss(id, "had no Life remaining");
          lifeDamage[id] = 0;
          break;
        }
        const targets = this.allHolomem(id);
        if (this.interactivePlayers.has(id) && targets.length) {
          player.resolution.push(life);
          this.state.pendingDecision = {
            id: `D-${this.state.log.length + 1}`,
            playerId: id,
            kind: "LIFE_CHEER",
            step: "SELECT_LIFE_CHEER_TARGET",
            eligibleUids: [],
            eligibleStageIds: targets.map(x => x.stageId),
            sourceCardUid: life.uid,
            cardId: life.cardId,
            metadata: { remainingLifeDamage: structuredClone(lifeDamage) },
          };
          this.log("LIFE_REVEALED", `${id} reveals ${this.card(life).name} from Life. Choose a Holomem to receive it.`, id, {
            remainingLife: player.life.length, cardId: life.cardId,
          });
          return;
        }
        const target = this.chooseFriendlyHolomem(id, "life_cheer_target");
        if (target) target.cheers.push(life);
        this.log("LIFE_DAMAGE", `${id} loses 1 Life and sends the revealed ${this.card(life).name}${target ? ` to ${this.topCard(target).name}` : " nowhere"}.`, id, {
          remainingLife: player.life.length, cardId: life.cardId, targetCardId: target ? this.topCard(target).id : undefined,
          targetStageId: target?.stageId,
        });
        if (player.life.length === 0) {
          this.markLoss(id, "Life reached 0");
          lifeDamage[id] = 0;
          break;
        }
      }
    }
    this.resolveOutcome();
  }

  private resolveRuleChecks(includeDowned = true): void {
    if (this.state.phase === "SETUP" || this.state.status !== "ONGOING") return;
    if (this.state.pendingDecision) return;
    if (includeDowned && (["P1", "P2"] as PlayerId[]).some(id => this.allHolomem(id).some(h => h.damage >= (this.topCard(h).hp ?? Infinity)))) {
      this.resolveDowned();
      return;
    }
    for (const id of ["P1", "P2"] as PlayerId[]) {
      if (this.allHolomem(id).length === 0) this.markLoss(id, "had no holomem on Stage");
      if (this.player(id).life.length === 0) this.markLoss(id, "had no Life remaining");
    }
    this.resolveOutcome();
  }

  private markLoss(id: PlayerId, reason: string): void {
    const reasons = this.state.lossReasons[id] ?? [];
    if (!reasons.includes(reason)) reasons.push(reason);
    this.state.lossReasons[id] = reasons;
  }

  private resolveOutcome(): void {
    const p1Lost = (this.state.lossReasons.P1?.length ?? 0) > 0;
    const p2Lost = (this.state.lossReasons.P2?.length ?? 0) > 0;
    if (!p1Lost && !p2Lost) return;
    this.state.phase = "GAME_OVER";
    if (p1Lost && p2Lost) {
      this.state.status = "DRAW";
      this.state.winner = null;
      this.log("GAME_OVER", "Both players lose simultaneously; the game is a draw.");
    } else {
      this.state.status = "WIN";
      this.state.winner = p1Lost ? "P2" : "P1";
      this.log("GAME_OVER", `${this.state.winner} wins.`, this.state.winner, { lossReasons: this.state.lossReasons });
    }
  }

  private endMain(id: PlayerId): void {
    const player = this.player(id);
    if (id === this.state.startingPlayer && player.turnsTaken === 0) {
      this.log("PERFORMANCE_SKIPPED", `${id} skips Performance on the first player's first turn.`, id);
      this.finishTurn();
    } else {
      this.state.phase = "PERFORMANCE";
      this.log("PERFORMANCE_START", `${id} enters Performance.`, id);
    }
  }

  private endPerformance(id: PlayerId): void {
    this.log("PERFORMANCE_END", `${id} finishes the Performance Step.`, id);
    this.finishTurn();
  }

  private finishTurn(): void {
    const id = this.state.activePlayer;
    this.state.phase = "END";
    if (this.promoteCenterIfNeeded(id, "end")) return;
    this.continueFinishTurnAfterPromotion(id);
  }

  private continueFinishTurnAfterPromotion(id: PlayerId): void {
    this.state.modifiers = this.state.modifiers.filter(x => x.expiresAtTurnEnd !== this.state.turnNumber);
    this.player(id).turnsTaken += 1;
    this.log("TURN_END", `${id} passes the turn.`, id);
    this.resolveRuleChecks();
    if (this.state.status !== "ONGOING" || this.state.pendingDecision) return;
    this.state.activePlayer = otherPlayer(id);
    this.state.turnNumber += 1;
    this.beginTurn();
  }

  private promoteCenterIfNeeded(id: PlayerId, timing: string): boolean {
    const player = this.player(id);
    if (player.stage.center || !player.stage.back.length) return false;
    const active = player.stage.back.filter(x => !x.resting);
    const options = active.length ? active : player.stage.back;
    if (this.interactivePlayers.has(id)) {
      this.state.pendingDecision = {
        id: `D-${this.state.log.length + 1}`,
        playerId: id,
        kind: "CENTER_PROMOTION",
        step: "SELECT_NEW_CENTER",
        eligibleUids: [],
        eligibleStageIds: options.map(x => x.stageId),
        metadata: {
          timing,
          continuation: timing === "end" ? "FINISH_TURN_AFTER_PROMOTION" : "BEGIN_TURN_AFTER_RESET",
        },
      };
      this.log("DECISION_PENDING", `${id} must choose a Back Stage Holomem to move to Center.`, id, { timing });
      return true;
    }
    const chosen = this.policy(id).chooseOne(this.ctx(id, `promote_center_${timing}`), options);
    player.stage.back.splice(player.stage.back.findIndex(x => x.stageId === chosen.stageId), 1);
    player.stage.center = chosen;
    this.log("CENTER_PROMOTED", `${id} moves ${this.topCard(chosen).name} to Center.`, id, { stageId: chosen.stageId, timing, cardId: this.topCard(chosen).id });
    return false;
  }

  private removeFromHand(id: PlayerId, uid: string): CardInstance {
    const hand = this.player(id).hand;
    const index = hand.findIndex(x => x.uid === uid);
    if (index < 0) throw new Error(`${uid} is not in ${id}'s hand.`);
    return hand.splice(index, 1)[0];
  }

  private removeStageHolomem(id: PlayerId, stageId: string): HolomemState {
    const stage = this.player(id).stage;
    if (stage.center?.stageId === stageId) { const h = stage.center; stage.center = null; return h; }
    if (stage.collab?.stageId === stageId) { const h = stage.collab; stage.collab = null; return h; }
    const index = stage.back.findIndex(x => x.stageId === stageId);
    if (index >= 0) return stage.back.splice(index, 1)[0];
    throw new Error(`Unknown stage holomem ${stageId}.`);
  }

  private stageCount(id: PlayerId): number { return this.allHolomem(id).length; }

  private canAffordCheers(holomem: HolomemState, cost: Color[]): boolean {
    if (holomem.cheers.length < cost.length) return false;
    const available = holomem.cheers.map(x => this.card(x).provides!);
    const requiredSpecific = cost.filter(x => x !== "Neutral");
    for (const color of requiredSpecific) {
      const index = available.indexOf(color);
      if (index < 0) return false;
      available.splice(index, 1);
    }
    return available.length >= cost.filter(x => x === "Neutral").length;
  }

  private payCheerCost(id: PlayerId, holomem: HolomemState, cost: Color[]): void {
    const selected: CardInstance[] = [];
    const remaining = [...holomem.cheers];
    for (const color of cost.filter(x => x !== "Neutral")) {
      const index = remaining.findIndex(x => this.card(x).provides === color);
      selected.push(remaining.splice(index, 1)[0]);
    }
    selected.push(...remaining.slice(0, cost.filter(x => x === "Neutral").length));
    for (const cheer of selected) holomem.cheers.splice(holomem.cheers.findIndex(x => x.uid === cheer.uid), 1);
    this.player(id).archive.push(...selected);
  }

  private payHoloPower(id: PlayerId, amount: number): void {
    const player = this.player(id);
    for (let i = 0; i < amount; i++) player.archive.push(player.holoPower.pop()!);
  }
}

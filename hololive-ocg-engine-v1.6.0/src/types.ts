export type PlayerId = "P1" | "P2";
export type Color = "White" | "Green" | "Red" | "Blue" | "Purple" | "Yellow" | "Neutral";
export type BloomLevel = "Debut" | "1st" | "2nd" | "Spot";
export type CardType = "Oshi" | "Holomem" | "Support" | "Cheer";
export type Phase = "SETUP" | "RESET" | "DRAW" | "CHEER" | "MAIN" | "PERFORMANCE" | "END" | "GAME_OVER";
export type GameStatus = "ONGOING" | "WIN" | "DRAW";

export interface EffectSpec {
  id: string;
  params?: Record<string, unknown>;
}

export interface AbilityDefinition extends EffectSpec {
  name: string;
  kind: "oshi" | "sp_oshi" | "collab" | "extra" | "support" | "rules";
  timing: "main" | "collab" | "downed" | "before_holomem_die" | "continuous" | "rules";
  holoPowerCost?: number;
  usage?: "1/Turn" | "1/Game";
  printedText: string;
}

export interface ArtDefinition extends EffectSpec {
  name: string;
  cost: Color[];
  damage: number;
  critical?: { color: Color; bonus: number };
  printedText?: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  rarity: string;
  colors: Color[];
  image: string;
  tags?: string[];
  life?: number;
  hp?: number;
  bloomLevel?: BloomLevel;
  buzz?: boolean;
  batonPassCost?: Color[];
  supportType?: "Staff" | "Item" | "Event" | "Tool" | "Mascot" | "Fan";
  limited?: boolean;
  provides?: Color;
  deckLimit?: number | null;
  additionalNames?: string[];
  cannotBloom?: boolean;
  abilities?: AbilityDefinition[];
  arts?: ArtDefinition[];
}

export interface DeckEntry { cardId: string; quantity: number }
export interface DeckFamily {
  id: string;
  name: string;
  oshiOptions: string[];
  mainDeck: DeckEntry[];
  cheerDeck: DeckEntry[];
}
export interface CardDatabase { schemaVersion: number; cards: CardDefinition[] }
export interface DeckDatabase { schemaVersion: number; deckFamilies: DeckFamily[] }

export interface CardInstance { uid: string; cardId: string }
export interface HolomemState {
  stageId: string;
  stack: CardInstance[];
  cheers: CardInstance[];
  supports: CardInstance[];
  damage: number;
  resting: boolean;
  enteredStageTurn: number;
  lastBloomTurn?: number;
  lastArtTurn?: number;
}
export interface StageState {
  center: HolomemState | null;
  collab: HolomemState | null;
  back: HolomemState[];
}

export interface TurnFlags {
  collabUsed: boolean;
  batonPassUsed: boolean;
  limitedUsed: boolean;
  oshiSkillUsed: boolean;
}

export interface PlayerState {
  id: PlayerId;
  oshiCardId: string;
  deck: CardInstance[];
  cheerDeck: CardInstance[];
  hand: CardInstance[];
  archive: CardInstance[];
  holoPower: CardInstance[];
  life: CardInstance[];
  stage: StageState;
  pendingCheer: CardInstance | null;
  resolution: CardInstance[];
  redrawCount: number;
  turnsTaken: number;
  spOshiUsed: boolean;
  turnFlags: TurnFlags;
}

export interface PendingDecision {
  id: string;
  playerId: PlayerId;
  kind: "SUB_PC" | "NORMAL_PC" | "AMAZING_PC" | "LIFE_CHEER" | "CENTER_PROMOTION" | "TOP_CHEER" | "ARCHIVE_CHEERS";
  step:
    | "SELECT_LIMITED"
    | "ORDER_BOTTOM"
    | "SELECT_DEBUT"
    | "SELECT_STAGE_CHEER"
    | "SELECT_AMAZING_PC_HOLOMEM"
    | "SELECT_LIFE_CHEER_TARGET"
    | "SELECT_NEW_CENTER"
    | "SELECT_EFFECT_CHEER_TARGET"
    | "SELECT_ARCHIVE_CHEER_TARGET"
    | "SELECT_ARCHIVE_CHEERS";
  eligibleUids: string[];
  eligibleStageIds?: string[];
  sourceCardUid?: string;
  cardId?: string;
  metadata?: Record<string, unknown>;
}

export interface TurnModifier {
  id: string;
  kind: "ART_DAMAGE";
  controller: PlayerId;
  stageId: string;
  amount: number;
  expiresAtTurnEnd: number;
}

export interface LogEntry {
  seq: number;
  turn: number;
  phase: Phase;
  player?: PlayerId;
  event: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  rngState: number;
  status: GameStatus;
  winner: PlayerId | null;
  lossReasons: Partial<Record<PlayerId, string[]>>;
  startingPlayer: PlayerId;
  activePlayer: PlayerId;
  turnNumber: number;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  modifiers: TurnModifier[];
  pendingDecision: PendingDecision | null;
  log: LogEntry[];
}

export type GameAction =
  | { type: "ATTACH_CHEER"; playerId: PlayerId; targetStageId: string }
  | { type: "PLACE_HOLOMEM"; playerId: PlayerId; cardUid: string }
  | { type: "BLOOM"; playerId: PlayerId; cardUid: string; targetStageId: string }
  | { type: "COLLAB"; playerId: PlayerId; targetStageId: string }
  | { type: "BATON_PASS"; playerId: PlayerId; targetStageId: string }
  | { type: "PLAY_SUPPORT"; playerId: PlayerId; cardUid: string }
  | { type: "USE_OSHI_SKILL"; playerId: PlayerId; abilityIndex: number }
  | { type: "END_MAIN"; playerId: PlayerId }
  | { type: "USE_ART"; playerId: PlayerId; attackerStageId: string; artIndex: number; targetStageId: string }
  | { type: "END_PERFORMANCE"; playerId: PlayerId };

export interface ChoiceContext {
  reason: string;
  playerId: PlayerId;
  metadata?: Record<string, unknown>;
}

export interface DecisionPolicy {
  chooseOne<T>(context: ChoiceContext, options: readonly T[]): T;
  chooseMany<T>(context: ChoiceContext, options: readonly T[], min: number, max: number): T[];
  chooseNumber(context: ChoiceContext, min: number, max: number): number;
  chooseYesNo(context: ChoiceContext, defaultValue: boolean): boolean;
}

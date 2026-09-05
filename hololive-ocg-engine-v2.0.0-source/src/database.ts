import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CardDatabase, CardDefinition, DeckDatabase, DeckFamily } from "./types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface GameData {
  cards: Map<string, CardDefinition>;
  deckFamilies: Map<string, DeckFamily>;
}

export function loadGameData(baseDir = root): GameData {
  const cardDb = JSON.parse(fs.readFileSync(path.join(baseDir, "data/cards.json"), "utf8")) as CardDatabase;
  const deckDb = JSON.parse(fs.readFileSync(path.join(baseDir, "data/decks.json"), "utf8")) as DeckDatabase;
  return {
    cards: new Map(cardDb.cards.map(card => [card.id, card])),
    deckFamilies: new Map(deckDb.deckFamilies.map(deck => [deck.id, deck])),
  };
}

const implementedEffects = new Set([
  "additional_names", "archive_cheer_search_nonbuzz_bloom", "basic_damage", "bonus_if_name_on_stage",
  "buff_center_arts", "cannot_bloom", "cheer_attachment_cleanup", "conditional_center_name_effects",
  "deck_copy_limit_unlimited", "draw_cards", "exchange_holo_power", "life_damage_override_2",
  "look_top_find_limited", "look_top_reveal_names", "mulligan_hand_draw", "reattach_cheer",
  "replace_next_die_result", "roll_odd_bonus_one_extra", "roll_parity_send_or_draw",
  "roll_send_archive_cheer", "roll_send_cheer_optional_move_back", "search_debut_to_stage",
  "send_archive_cheer_to_center", "send_archive_cheers_to_green", "send_cheer_if_name_on_stage",
  "swap_opponent_center_with_back_then_buff",
]);

export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  if (data.cards.size !== 24) errors.push(`Expected 24 unique cards, found ${data.cards.size}.`);

  for (const [id, card] of data.cards) {
    if (id !== card.id) errors.push(`Card map key ${id} does not match card id ${card.id}.`);
    if (!card.name || !card.type || card.colors.length === 0) errors.push(`${id} is missing core fields.`);
    if (card.type === "Oshi" && (!card.life || card.life < 1)) errors.push(`${id} Oshi has invalid life.`);
    if (card.type === "Holomem" && (!card.hp || !card.bloomLevel || !card.batonPassCost)) errors.push(`${id} holomem is incomplete.`);
    if (card.type === "Support" && (!card.supportType || card.abilities?.length !== 1)) errors.push(`${id} support is incomplete.`);
    if (card.type === "Cheer" && !card.provides) errors.push(`${id} Cheer has no provided color.`);
    for (const effect of [...(card.abilities ?? []), ...(card.arts ?? [])]) {
      if (!implementedEffects.has(effect.id)) errors.push(`${id} uses unimplemented effect id ${effect.id}.`);
    }
  }

  for (const deck of data.deckFamilies.values()) {
    const mainTotal = deck.mainDeck.reduce((sum, x) => sum + x.quantity, 0);
    const cheerTotal = deck.cheerDeck.reduce((sum, x) => sum + x.quantity, 0);
    if (mainTotal !== 50) errors.push(`${deck.id} main deck has ${mainTotal} cards, not 50.`);
    if (cheerTotal !== 20) errors.push(`${deck.id} Cheer deck has ${cheerTotal} cards, not 20.`);
    if (deck.oshiOptions.length < 1) errors.push(`${deck.id} has no Oshi option.`);
    for (const oshiId of deck.oshiOptions) {
      if (data.cards.get(oshiId)?.type !== "Oshi") errors.push(`${deck.id} Oshi option ${oshiId} is invalid.`);
    }
    for (const entry of deck.mainDeck) {
      const card = data.cards.get(entry.cardId);
      if (!card) errors.push(`${deck.id} references missing card ${entry.cardId}.`);
      else if (card.type === "Oshi" || card.type === "Cheer") errors.push(`${entry.cardId} is illegal in the main deck.`);
      else if (card.deckLimit !== null && entry.quantity > (card.deckLimit ?? 4)) errors.push(`${entry.cardId} exceeds its copy limit.`);
    }
    for (const entry of deck.cheerDeck) {
      if (data.cards.get(entry.cardId)?.type !== "Cheer") errors.push(`${entry.cardId} is illegal in the Cheer deck.`);
    }
  }
  return errors;
}

export function requireCard(data: GameData, cardId: string): CardDefinition {
  const card = data.cards.get(cardId);
  if (!card) throw new Error(`Unknown card id: ${cardId}`);
  return card;
}

export function requireDeck(data: GameData, deckId: string): DeckFamily {
  const deck = data.deckFamilies.get(deckId);
  if (!deck) throw new Error(`Unknown deck family: ${deckId}`);
  return deck;
}

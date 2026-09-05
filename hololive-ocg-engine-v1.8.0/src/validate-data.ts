import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGameData, validateGameData } from "./database.ts";

const data = loadGameData();
const errors = validateGameData(data);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const card of data.cards.values()) {
  const asset = path.join(root, "assets/cards/primary", card.image);
  if (!fs.existsSync(asset)) errors.push(`${card.id} is missing primary image ${card.image}.`);
}
const variants = JSON.parse(fs.readFileSync(path.join(root, "data/art-variants.json"), "utf8")) as { variants: { cardId:string; path:string }[] };
if (variants.variants.length !== 11) errors.push(`Expected 11 art variants, found ${variants.variants.length}.`);
for (const variant of variants.variants) {
  if (!data.cards.has(variant.cardId)) errors.push(`Art variant references unknown card ${variant.cardId}.`);
  if (!fs.existsSync(path.join(root, variant.path))) errors.push(`Missing art variant ${variant.path}.`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const deck = data.deckFamilies.get("hSD01")!;
  console.log(JSON.stringify({
    valid: true,
    cards: data.cards.size,
    deckFamilies: data.deckFamilies.size,
    mainDeckCards: deck.mainDeck.reduce((sum, x) => sum + x.quantity, 0),
    cheerDeckCards: deck.cheerDeck.reduce((sum, x) => sum + x.quantity, 0),
    oshiOptions: deck.oshiOptions,
    primaryImages: data.cards.size,
    artVariants: variants.variants.length,
  }, null, 2));
}

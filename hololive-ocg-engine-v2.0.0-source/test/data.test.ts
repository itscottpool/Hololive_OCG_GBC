import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGameData, validateGameData } from "../src/database.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("hSD01 data is internally valid and complete", () => {
  const data = loadGameData();
  assert.deepEqual(validateGameData(data), []);
  assert.equal(data.cards.size, 24);
  const deck = data.deckFamilies.get("hSD01")!;
  assert.equal(deck.mainDeck.reduce((sum, x) => sum + x.quantity, 0), 50);
  assert.equal(deck.cheerDeck.reduce((sum, x) => sum + x.quantity, 0), 20);
  assert.deepEqual(deck.oshiOptions, ["hSD01-001", "hSD01-002"]);
});

test("corrected Green Cheer is mapped as a real game card", () => {
  const card = loadGameData().cards.get("hY02-001")!;
  assert.equal(card.name, "Green Cheer");
  assert.equal(card.provides, "Green");
  assert.equal(card.image, "EN_hY02-001_C.png");
  assert.ok(fs.existsSync(path.join(root, "assets/cards/primary", card.image)));
});

test("all primary and variant artwork files are present", () => {
  const data = loadGameData();
  for (const card of data.cards.values()) assert.ok(fs.existsSync(path.join(root, "assets/cards/primary", card.image)), card.image);
  const variants = JSON.parse(fs.readFileSync(path.join(root, "data/art-variants.json"), "utf8")) as { variants: { path:string }[] };
  assert.equal(variants.variants.length, 11);
  for (const variant of variants.variants) assert.ok(fs.existsSync(path.join(root, variant.path)), variant.path);
});

test("every declared effect id has an implementation", () => {
  assert.deepEqual(validateGameData(loadGameData()), []);
});

test("desktop release assets and Electron entrypoint are present", () => {
  for (const relativePath of [
    "assets/ui/hSD01-deck-box.png",
    "assets/audio/Attack_Damage.wav",
    "assets/ui/EndlessNights.ico",
    "desktop/main.cjs",
  ]) assert.ok(fs.existsSync(path.join(root, relativePath)), relativePath);
  const desktopMain = fs.readFileSync(path.join(root, "desktop/main.cjs"), "utf8");
  assert.match(desktopMain, /BrowserWindow/);
  assert.match(desktopMain, /ELECTRON_RUN_AS_NODE/);
  assert.match(desktopMain, /--experimental-strip-types/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { SeededRandom } from "../src/random.ts";

test("Fisher-Yates shuffle preserves every card and varies the top card", () => {
  const original = Array.from({ length: 50 }, (_, index) => index);
  const topCards = new Set<number>();
  for (let seed = 1; seed <= 500; seed++) {
    const shuffled = new SeededRandom(seed).shuffle([...original]);
    assert.deepEqual([...shuffled].sort((a, b) => a - b), original);
    topCards.add(shuffled.at(-1)!);
  }
  assert.equal(topCards.size, 50, "every deck position should be able to supply the top card across varied seeds");
});

test("opening hands are not forced to contain a Debut", () => {
  const trials = 10_000;
  let noDebutHands = 0;
  for (let seed = 1; seed <= trials; seed++) {
    const deck = [...Array(18).fill("DEBUT"), ...Array(32).fill("OTHER")];
    new SeededRandom(seed).shuffle(deck);
    if (!deck.slice(-7).includes("DEBUT")) noDebutHands++;
  }
  const observed = noDebutHands / trials;
  assert.ok(observed > 0.025 && observed < 0.045, `observed no-Debut rate ${observed} should remain near the exact 3.37% deck probability`);
});

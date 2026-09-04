import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateGame } from "./simulate.ts";
import type { PlayerId } from "./types.ts";

const args = process.argv.slice(2);
const value = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const games = Number(value("--games", "1"));
const baseSeed = Number(value("--seed", "20260903"));
const p1OshiId = value("--p1-oshi", "hSD01-002");
const p2OshiId = value("--p2-oshi", "hSD01-001");
const quiet = args.includes("--quiet");
const results = [];

for (let i = 0; i < games; i++) {
  const startingPlayer: PlayerId = i % 2 === 0 ? "P1" : "P2";
  results.push(simulateGame({ seed: baseSeed + i, p1OshiId, p2OshiId, startingPlayer }));
}

const summary = {
  games,
  baseSeed,
  p1OshiId,
  p2OshiId,
  p1Wins: results.filter(x => x.state.winner === "P1").length,
  p2Wins: results.filter(x => x.state.winner === "P2").length,
  draws: results.filter(x => x.state.status === "DRAW").length,
  averageActions: Math.round(results.reduce((sum, x) => sum + x.actionCount, 0) / Math.max(1, games)),
  averageTurns: Math.round(results.reduce((sum, x) => sum + x.state.turnNumber, 0) / Math.max(1, games)),
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.mkdirSync(path.join(root, "logs"), { recursive: true });
fs.writeFileSync(path.join(root, "logs", "last-match.json"), JSON.stringify(results.at(-1), null, 2));

console.log(JSON.stringify(summary, null, 2));
if (!quiet && games === 1) {
  console.log("\nLast 25 events:");
  for (const item of results[0].state.log.slice(-25)) console.log(`[T${item.turn} ${item.phase}] ${item.message}`);
  console.log("\nReplay saved to logs/last-match.json");
}

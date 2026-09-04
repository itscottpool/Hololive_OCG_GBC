import type { Color, DecisionPolicy, GameAction, HolomemState, PlayerId } from "./types.ts";
import { DeterministicPolicy } from "./policy.ts";
import type { GameEngine } from "./engine.ts";

export class GreedyDecisionPolicy extends DeterministicPolicy implements DecisionPolicy {
  override chooseYesNo(context: { reason: string }, defaultValue: boolean): boolean {
    if (context.reason === "optional_mulligan") return false;
    return defaultValue;
  }
}

export class GreedyAI {
  chooseAction(engine: GameEngine, playerId: PlayerId): GameAction {
    const actions = engine.listLegalActions(playerId);
    if (!actions.length) throw new Error(`${playerId} has no legal action in ${engine.state.phase}.`);
    return actions
      .map((action, index) => ({ action, index, score: this.score(engine, action) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0].action;
  }

  private score(engine: GameEngine, action: GameAction): number {
    const player = engine.player(action.playerId);
    switch (action.type) {
      case "ATTACH_CHEER": return 1_000 + this.cheerTargetScore(engine, action.playerId, engine.findHolomem(action.playerId, action.targetStageId)!);
      case "BLOOM": {
        const card = engine.card(player.hand.find(x => x.uid === action.cardUid)!);
        return 900 + (card.bloomLevel === "2nd" ? 300 : 100) + (card.hp ?? 0);
      }
      case "COLLAB": {
        const target = engine.findHolomem(action.playerId, action.targetStageId)!;
        const effectBonus = engine.topCard(target).abilities?.some(x => x.kind === "collab") ? 200 : 0;
        return 850 + effectBonus;
      }
      case "PLACE_HOLOMEM": {
        const card = engine.card(player.hand.find(x => x.uid === action.cardUid)!);
        return 500 + (card.hp ?? 0) + (card.bloomLevel === "Spot" ? 20 : 0);
      }
      case "PLAY_SUPPORT": {
        const card = engine.card(player.hand.find(x => x.uid === action.cardUid)!);
        const effect = card.abilities?.[0]?.id;
        const weights: Record<string, number> = {
          draw_cards: 780,
          look_top_reveal_names: 750,
          search_debut_to_stage: engine.allHolomem(action.playerId).length < 4 ? 740 : 400,
          look_top_find_limited: 650,
          archive_cheer_search_nonbuzz_bloom: 700,
          roll_send_archive_cheer: player.archive.some(x => engine.card(x).type === "Cheer") ? 620 : 200,
          mulligan_hand_draw: player.hand.length <= 3 ? 680 : 150,
        };
        return weights[effect ?? ""] ?? 300;
      }
      case "USE_OSHI_SKILL": {
        const ability = engine.data.cards.get(player.oshiCardId)?.abilities?.[action.abilityIndex];
        if (ability?.id === "reattach_cheer") {
          const holomem = engine.allHolomem(action.playerId);
          const useful = holomem.some(source => source.cheers.length > 0 && holomem.some(target => target.stageId !== source.stageId && this.cheerTargetScore(engine, action.playerId, target) > this.cheerTargetScore(engine, action.playerId, source)));
          return useful ? 610 : -10;
        }
        if (ability?.id === "swap_opponent_center_with_back_then_buff") return 820;
        if (ability?.id === "send_archive_cheers_to_green") return player.archive.some(x => engine.card(x).type === "Cheer") ? 800 : 40;
        return 400;
      }
      case "BATON_PASS": {
        const current = player.stage.center!;
        const target = engine.findHolomem(action.playerId, action.targetStageId)!;
        return 250 + this.bestReadyArt(engine, target) - this.bestReadyArt(engine, current);
      }
      case "USE_ART": {
        const attacker = engine.findHolomem(action.playerId, action.attackerStageId)!;
        const target = engine.findHolomem(engine.opponent(action.playerId), action.targetStageId)!;
        const art = engine.topCard(attacker).arts![action.artIndex];
        let damage = art.damage;
        if (art.id === "bonus_if_name_on_stage" && engine.allHolomem(action.playerId).some(h => engine.hasName(h, String(art.params?.name)))) damage += Number(art.params?.bonus ?? 0);
        if (art.id === "roll_odd_bonus_one_extra") damage += 100;
        if (art.critical && engine.hasColor(target, art.critical.color)) damage += art.critical.bonus;
        const remainingHp = (engine.topCard(target).hp ?? 0) - target.damage;
        return 1_000 + damage + (damage >= remainingHp ? 2_000 : 0) - remainingHp / 100;
      }
      case "END_MAIN": return 0;
      case "END_PERFORMANCE": return 0;
    }
  }

  private bestReadyArt(engine: GameEngine, holomem: HolomemState): number {
    return Math.max(0, ...(engine.topCard(holomem).arts ?? []).filter(a => this.canAfford(engine, holomem, a.cost)).map(a => a.damage));
  }

  private canAfford(engine: GameEngine, holomem: HolomemState, cost: Color[]): boolean {
    if (holomem.cheers.length < cost.length) return false;
    const colors = holomem.cheers.map(x => engine.card(x).provides!);
    for (const color of cost.filter(x => x !== "Neutral")) {
      const i = colors.indexOf(color);
      if (i < 0) return false;
      colors.splice(i, 1);
    }
    return colors.length >= cost.filter(x => x === "Neutral").length;
  }

  private cheerTargetScore(engine: GameEngine, id: PlayerId, holomem: HolomemState): number {
    const maxCost = Math.max(0, ...(engine.topCard(holomem).arts ?? []).map(a => a.cost.length));
    const missing = Math.max(0, maxCost - holomem.cheers.length);
    return missing * 100 + (engine.player(id).stage.center?.stageId === holomem.stageId ? 30 : 0) + (engine.topCard(holomem).hp ?? 0) / 100;
  }
}

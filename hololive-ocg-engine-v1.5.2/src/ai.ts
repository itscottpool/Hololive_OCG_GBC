import type {
  ArtDefinition, CardDefinition, Color, DecisionPolicy, GameAction, HolomemState, PlayerId,
} from "./types.ts";
import { DeterministicPolicy } from "./policy.ts";
import type { GameEngine } from "./engine.ts";

/** Resolves optional effects consistently after the tactical AI chooses an action. */
export class GreedyDecisionPolicy extends DeterministicPolicy implements DecisionPolicy {
  override chooseYesNo(context: { reason: string }, defaultValue: boolean): boolean {
    if (context.reason === "optional_mulligan") return false;
    return defaultValue;
  }
}

interface ArtPlan {
  art: ArtDefinition;
  damage: number;
  missingCheer: number;
}

/**
 * Deterministic, knockout-focused heuristic AI for the hSD01 vertical slice.
 * Priority: take lethal Arts, enable the nearest lethal Art, develop a second
 * attacker, then gain only resources that accelerate those goals.
 */
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
      case "ATTACH_CHEER": {
        const target = engine.findHolomem(action.playerId, action.targetStageId)!;
        return this.cheerTargetScore(engine, action.playerId, target, player.pendingCheer?.cardId);
      }
      case "BLOOM": {
        const target = engine.findHolomem(action.playerId, action.targetStageId)!;
        const card = engine.card(player.hand.find(x => x.uid === action.cardUid)!);
        const before = this.offensivePotential(engine, action.playerId, target, engine.topCard(target));
        const after = this.offensivePotential(engine, action.playerId, target, card);
        const survival = (card.hp ?? 0) - (engine.topCard(target).hp ?? 0);
        return 2_000 + (after - before) * 8 + survival + (card.bloomLevel === "2nd" ? 300 : 100);
      }
      case "COLLAB": {
        const target = engine.findHolomem(action.playerId, action.targetStageId)!;
        const plan = this.bestAffordableArt(engine, target);
        const effectId = engine.topCard(target).abilities?.find(x => x.kind === "collab")?.id;
        const effectTempo: Record<string, number> = {
          buff_center_arts: 600,
          roll_send_cheer_optional_move_back: 500,
          send_archive_cheer_to_center: 450,
          conditional_center_name_effects: 350,
          exchange_holo_power: 100,
        };
        if (!plan) return (effectTempo[effectId ?? ""] ?? 0) - 200;
        return 3_500 + plan.damage * 12 + (effectTempo[effectId ?? ""] ?? 0);
      }
      case "PLACE_HOLOMEM": {
        const card = engine.card(player.hand.find(x => x.uid === action.cardUid)!);
        const stageCount = engine.allHolomem(action.playerId).length;
        const matchingBloom = player.hand.some(x => {
          const candidate = engine.card(x);
          return candidate.type === "Holomem" && ["1st", "2nd"].includes(candidate.bloomLevel ?? "") && this.namesOverlap(card, candidate);
        });
        if (stageCount >= 3 && !matchingBloom) return -300;
        return 500 + (stageCount < 2 ? 900 : 0) + (matchingBloom ? 500 : 0) + (card.hp ?? 0);
      }
      case "PLAY_SUPPORT": return this.supportScore(engine, action.playerId, action.cardUid);
      case "USE_OSHI_SKILL": {
        const ability = engine.data.cards.get(player.oshiCardId)?.abilities?.[action.abilityIndex];
        if (ability?.id === "reattach_cheer") {
          const holomem = engine.allHolomem(action.playerId);
          const useful = holomem.some(source => source.cheers.length > 0 && holomem.some(target =>
            target.stageId !== source.stageId
            && this.offensivePotential(engine, action.playerId, target) > this.offensivePotential(engine, action.playerId, source),
          ));
          return useful ? 1_850 : -500;
        }
        if (ability?.id === "swap_opponent_center_with_back_then_buff") {
          const center = player.stage.center;
          const readyDamage = center ? (this.bestAffordableArt(engine, center)?.damage ?? 0) : 0;
          return readyDamage > 0 ? 3_000 + readyDamage * 10 : -200;
        }
        if (ability?.id === "send_archive_cheers_to_green") {
          const cheerCount = player.archive.filter(x => engine.card(x).type === "Cheer").length;
          return cheerCount > 0 ? 2_500 + cheerCount * 400 : -500;
        }
        return -100;
      }
      case "BATON_PASS": {
        const current = player.stage.center!;
        const target = engine.findHolomem(action.playerId, action.targetStageId)!;
        const currentDamage = this.bestAffordableArt(engine, current)?.damage ?? 0;
        const targetDamage = this.bestAffordableArt(engine, target)?.damage ?? 0;
        const danger = current.damage / Math.max(1, engine.topCard(current).hp ?? 1);
        if (targetDamage <= currentDamage && danger < 0.65) return -400;
        return 2_200 + (targetDamage - currentDamage) * 15 + danger * 500;
      }
      case "USE_ART": return this.artScore(engine, action);
      case "END_MAIN": return 0;
      case "END_PERFORMANCE": return 0;
    }
  }

  private artScore(engine: GameEngine, action: Extract<GameAction, { type: "USE_ART" }>): number {
    const attacker = engine.findHolomem(action.playerId, action.attackerStageId)!;
    const opponentId = engine.opponent(action.playerId);
    const target = engine.findHolomem(opponentId, action.targetStageId)!;
    const art = engine.topCard(attacker).arts![action.artIndex];
    const damage = this.expectedArtDamage(engine, action.playerId, attacker, art, target);
    const remainingHp = (engine.topCard(target).hp ?? 0) - target.damage;
    const lifeLoss = this.lifeLossFor(engine.topCard(target));
    const opponentLife = engine.player(opponentId).life.length;

    if (damage >= remainingHp) {
      const winsGame = lifeLoss >= opponentLife;
      return 100_000 + (winsGame ? 1_000_000 : 0) + lifeLoss * 20_000 - Math.max(0, damage - remainingHp);
    }

    const progress = damage / Math.max(1, remainingHp);
    const priorDamageBonus = target.damage * 20;
    const collabBonus = engine.player(opponentId).stage.collab?.stageId === target.stageId ? 150 : 0;
    return 10_000 + damage * 25 + progress * 5_000 + priorDamageBonus + collabBonus;
  }

  private supportScore(engine: GameEngine, id: PlayerId, cardUid: string): number {
    const player = engine.player(id);
    const card = engine.card(player.hand.find(x => x.uid === cardUid)!);
    const effect = card.abilities?.[0]?.id;
    const deckSafe = player.deck.length > 12;
    switch (effect) {
      case "draw_cards": return deckSafe && player.hand.length <= 3 ? 1_700 : -300;
      case "mulligan_hand_draw": return deckSafe && player.hand.length <= 2 ? 1_600 : -500;
      case "look_top_reveal_names": return player.hand.length <= 4 ? 1_150 : -200;
      case "search_debut_to_stage": return engine.allHolomem(id).length < 2 ? 1_400 : -250;
      case "look_top_find_limited": {
        const hasLimited = player.hand.some(x => engine.card(x).type === "Support" && engine.card(x).limited && x.uid !== cardUid);
        return deckSafe && !hasLimited && player.hand.length <= 4 ? 900 : -250;
      }
      case "archive_cheer_search_nonbuzz_bloom": {
        const hasSpareCheer = engine.allHolomem(id).some(h => h.cheers.length > this.minimumReadyCost(engine, h));
        return hasSpareCheer ? 1_450 : -600;
      }
      case "roll_send_archive_cheer": {
        const archivedCheer = player.archive.some(x => engine.card(x).type === "Cheer");
        return archivedCheer ? 1_250 : -400;
      }
      default: return -300;
    }
  }

  private cheerTargetScore(engine: GameEngine, id: PlayerId, holomem: HolomemState, pendingCardId?: string): number {
    const card = engine.topCard(holomem);
    const before = this.bestPlan(engine, id, holomem, card);
    const pending = pendingCardId ? engine.data.cards.get(pendingCardId)?.provides : undefined;
    const afterColors = [...holomem.cheers.map(x => engine.card(x).provides!), ...(pending ? [pending] : [])];
    const after = this.bestPlan(engine, id, holomem, card, afterColors);
    const attackPosition = engine.player(id).stage.center?.stageId === holomem.stageId ? 2 : 1;
    const enablesAttack = before.missingCheer > 0 && after.missingCheer === 0;
    const progresses = Math.max(0, before.missingCheer - after.missingCheer);
    const remainingOppHp = this.lowestTargetHp(engine, id);
    const enablesLethal = enablesAttack && after.damage >= remainingOppHp;

    return 1_000
      + attackPosition * 250
      + progresses * 1_500
      + (enablesAttack ? 4_000 : 0)
      + (enablesLethal ? 8_000 : 0)
      + after.damage * 10
      - after.missingCheer * 300;
  }

  private offensivePotential(engine: GameEngine, id: PlayerId, holomem: HolomemState, card = engine.topCard(holomem)): number {
    const plan = this.bestPlan(engine, id, holomem, card);
    return plan.damage * 10 - plan.missingCheer * 500 + (plan.missingCheer === 0 ? 1_000 : 0);
  }

  private bestPlan(
    engine: GameEngine,
    id: PlayerId,
    holomem: HolomemState,
    card = engine.topCard(holomem),
    colors = holomem.cheers.map(x => engine.card(x).provides!),
  ): ArtPlan {
    const opponentTargets = [engine.player(engine.opponent(id)).stage.center, engine.player(engine.opponent(id)).stage.collab]
      .filter((x): x is HolomemState => Boolean(x));
    const plans = (card.arts ?? []).map(art => ({
      art,
      damage: Math.max(...opponentTargets.map(target => this.expectedArtDamage(engine, id, holomem, art, target)), art.damage),
      missingCheer: this.missingCheer(colors, art.cost),
    }));
    if (!plans.length) return { art: { id: "none", name: "", cost: [], damage: 0 }, damage: 0, missingCheer: 99 };
    return plans.sort((a, b) => a.missingCheer - b.missingCheer || b.damage - a.damage)[0];
  }

  private bestAffordableArt(engine: GameEngine, holomem: HolomemState): ArtPlan | undefined {
    const colors = holomem.cheers.map(x => engine.card(x).provides!);
    return (engine.topCard(holomem).arts ?? [])
      .map(art => ({ art, damage: art.damage, missingCheer: this.missingCheer(colors, art.cost) }))
      .filter(x => x.missingCheer === 0)
      .sort((a, b) => b.damage - a.damage)[0];
  }

  private minimumReadyCost(engine: GameEngine, holomem: HolomemState): number {
    const colors = holomem.cheers.map(x => engine.card(x).provides!);
    return Math.min(Infinity, ...(engine.topCard(holomem).arts ?? []).filter(a => this.missingCheer(colors, a.cost) === 0).map(a => a.cost.length));
  }

  private expectedArtDamage(engine: GameEngine, id: PlayerId, attacker: HolomemState, art: ArtDefinition, target: HolomemState): number {
    let damage = art.damage;
    if (art.id === "bonus_if_name_on_stage" && engine.allHolomem(id).some(h => engine.hasName(h, String(art.params?.name)))) {
      damage += Number(art.params?.bonus ?? 0);
    }
    if (art.id === "roll_odd_bonus_one_extra") {
      const canForceOne = engine.player(id).oshiCardId === "hSD01-002" && engine.player(id).holoPower.length >= 3 && !engine.player(id).turnFlags.oshiSkillUsed;
      damage += canForceOne ? Number(art.params?.oddBonus ?? 50) + Number(art.params?.oneExtraBonus ?? 50) : 33;
    }
    if (art.critical && engine.hasColor(target, art.critical.color)) damage += art.critical.bonus;
    damage += engine.state.modifiers
      .filter(x => x.kind === "ART_DAMAGE" && x.controller === id && x.stageId === attacker.stageId)
      .reduce((sum, x) => sum + x.amount, 0);
    return damage;
  }

  private missingCheer(available: Color[], cost: Color[]): number {
    const remaining = [...available];
    let missing = 0;
    for (const color of cost.filter(x => x !== "Neutral")) {
      const i = remaining.indexOf(color);
      if (i >= 0) remaining.splice(i, 1);
      else missing++;
    }
    const neutralNeeded = cost.filter(x => x === "Neutral").length;
    missing += Math.max(0, neutralNeeded - remaining.length);
    return missing;
  }

  private lowestTargetHp(engine: GameEngine, id: PlayerId): number {
    const opponent = engine.player(engine.opponent(id));
    const targets = [opponent.stage.center, opponent.stage.collab].filter((x): x is HolomemState => Boolean(x));
    return Math.min(Infinity, ...targets.map(h => (engine.topCard(h).hp ?? 0) - h.damage));
  }

  private lifeLossFor(card: CardDefinition): number {
    return card.buzz || card.abilities?.some(x => x.id === "life_damage_override_2") ? 2 : 1;
  }

  private namesOverlap(a: CardDefinition, b: CardDefinition): boolean {
    const aNames = new Set([a.name, ...(a.additionalNames ?? [])]);
    return [b.name, ...(b.additionalNames ?? [])].some(name => aNames.has(name));
  }
}

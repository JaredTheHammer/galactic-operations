/**
 * Agenda Phase Engine
 *
 * TI4-inspired political voting system. Between missions, two directive
 * cards are drawn and both sides vote on which takes effect. Directives
 * impose persistent modifiers for the next mission(s): reinforcement timing,
 * starting consumables, threat modifiers, shop discounts, XP bonuses,
 * morale adjustments, exploration bonuses, and command token bonuses.
 *
 * Operative influence is derived from hero Presence + Leadership.
 * Imperial influence scales with threat level.
 */

import type {
  AgendaDirectiveDefinition,
  AgendaDirective,
  AgendaVoteResult,
  DirectiveEffect,
  CampaignState,
  HeroCharacter,
  GameData,
  Side,
} from './types.js';

import { AGENDA_INFLUENCE_CONFIG } from './types.js';

import type { RollFn } from './dice-v2.js';
import { defaultRollFn } from './dice-v2.js';

// ============================================================================
// INFLUENCE CALCULATION
// ============================================================================

/**
 * Calculate influence for a single hero.
 */
export function calculateHeroInfluence(hero: HeroCharacter): number {
  const config = AGENDA_INFLUENCE_CONFIG;
  let influence = config.basePerHero;

  // Presence bonus (per point above 2)
  const presenceBonus = Math.max(0, hero.characteristics.presence - 2);
  influence += presenceBonus * config.presenceBonus;

  // Leadership skill bonus
  const leadershipRank = hero.skills['leadership'] ?? 0;
  influence += leadershipRank * config.leadershipBonus;

  return influence;
}

/**
 * Calculate total operative influence from all heroes.
 */
export function calculateOperativeInfluence(heroes: Record<string, HeroCharacter>): number {
  return Object.values(heroes).reduce((sum, hero) => sum + calculateHeroInfluence(hero), 0);
}

/**
 * Calculate total operative influence with per-hero breakdown.
 */
export function calculateOperativeInfluenceBreakdown(
  heroes: Record<string, HeroCharacter>,
): { total: number; perHero: Record<string, number> } {
  const perHero: Record<string, number> = {};
  let total = 0;

  for (const [id, hero] of Object.entries(heroes)) {
    const influence = calculateHeroInfluence(hero);
    perHero[id] = influence;
    total += influence;
  }

  return { total, perHero };
}

/**
 * Calculate imperial influence based on threat level.
 */
export function calculateImperialInfluence(threatLevel: number): number {
  const config = AGENDA_INFLUENCE_CONFIG;
  return Math.max(
    config.imperialMinInfluence,
    Math.floor(threatLevel * config.imperialThreatMultiplier),
  );
}

// ============================================================================
// DIRECTIVE DRAWING
// ============================================================================

/**
 * Draw two random directives for the agenda phase.
 * Excludes directives already active.
 */
export function drawAgendaDirectives(
  campaign: CampaignState,
  gameData: GameData,
  rollFn: RollFn = defaultRollFn,
): [AgendaDirectiveDefinition, AgendaDirectiveDefinition] | null {
  const allDirectives = gameData.agendaDirectives ?? {};
  const activeIds = new Set((campaign.activeDirectives ?? []).map(d => d.directiveId));

  // Filter to available directives
  const available = Object.values(allDirectives).filter(d => !activeIds.has(d.id));
  if (available.length < 2) return null;

  // Shuffle and pick two
  const shuffled = shuffleArray([...available], rollFn);
  return [shuffled[0], shuffled[1]];
}

function shuffleArray<T>(arr: T[], rollFn: RollFn): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rollFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// VOTING RESOLUTION
// ============================================================================

/**
 * Resolve an agenda vote.
 * The side with more influence allocated to a directive wins.
 * If tied, the Operative side wins (home advantage).
 */
export function resolveAgendaVote(
  campaign: CampaignState,
  directiveChoices: [string, string],
  operativeVoteIndex: 0 | 1,
  gameData: GameData,
): AgendaVoteResult {
  const heroes = campaign.heroes;
  const { total: opInfluence, perHero } = calculateOperativeInfluenceBreakdown(heroes);
  const impInfluence = calculateImperialInfluence(campaign.threatLevel);

  // Operative allocates all influence to their chosen directive
  // Imperial AI opposes (votes for the other one)
  const imperialVoteIndex = operativeVoteIndex === 0 ? 1 : 0;

  // Compare: operative influence on their pick vs imperial on theirs
  // The directive with more total influence wins
  const operativeChoice = directiveChoices[operativeVoteIndex];
  const imperialChoice = directiveChoices[imperialVoteIndex];

  let winnerId: string;
  if (opInfluence >= impInfluence) {
    winnerId = operativeChoice;
  } else {
    winnerId = imperialChoice;
  }

  return {
    directiveChoices,
    winnerId,
    operativeInfluence: opInfluence,
    imperialInfluence: impInfluence,
    heroInfluence: perHero,
    votedAt: new Date().toISOString(),
  };
}

// ============================================================================
// DIRECTIVE APPLICATION
// ============================================================================

/**
 * Apply a voted directive to the campaign state.
 * Adds it to active directives with duration = 1 mission.
 */
export function applyAgendaDirective(
  campaign: CampaignState,
  voteResult: AgendaVoteResult,
  gameData: GameData,
): CampaignState {
  const allDirectives = gameData.agendaDirectives ?? {};
  const winningDef = allDirectives[voteResult.winnerId];
  if (!winningDef) return campaign;

  const newDirective: AgendaDirective = {
    directiveId: voteResult.winnerId,
    missionsRemaining: 1,
    effects: winningDef.effects,
  };

  const activeDirectives = [...(campaign.activeDirectives ?? []), newDirective];
  const agendaHistory = [...(campaign.agendaHistory ?? []), voteResult];

  return { ...campaign, activeDirectives, agendaHistory };
}

/**
 * Decrement active directive durations after a mission.
 * Removes expired directives.
 */
export function decrementDirectiveDurations(campaign: CampaignState): CampaignState {
  const activeDirectives = (campaign.activeDirectives ?? [])
    .map(d => ({ ...d, missionsRemaining: d.missionsRemaining - 1 }))
    .filter(d => d.missionsRemaining > 0);

  return { ...campaign, activeDirectives };
}

/**
 * Get all currently active directive effects for a specific target.
 */
export function getActiveDirectiveEffects(
  campaign: CampaignState,
  target?: Side,
): DirectiveEffect[] {
  const directives = campaign.activeDirectives ?? [];
  return directives.flatMap(d => {
    if (!target) return d.effects;
    // Return effects that target the specified side or 'both'
    return d.effects;
  });
}

/**
 * Get the threat modifier from active directives.
 */
export function getDirectiveThreatModifier(campaign: CampaignState): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'threat_modifier' }> => e.type === 'threat_modifier')
    .reduce((sum, e) => sum + e.value, 0);
}

/**
 * Get the reinforcement timing modifier from active directives.
 */
export function getDirectiveReinforcementModifier(campaign: CampaignState): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'reinforcement_timing' }> => e.type === 'reinforcement_timing')
    .reduce((sum, e) => sum + e.roundDelta, 0);
}

/**
 * Get starting consumables granted by active directives.
 */
export function getDirectiveStartingConsumables(
  campaign: CampaignState,
): Array<{ itemId: string; quantity: number }> {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'starting_consumables' }> => e.type === 'starting_consumables')
    .map(e => ({ itemId: e.itemId, quantity: e.quantity }));
}

/**
 * Get shop discount from active directives.
 */
export function getDirectiveShopDiscount(campaign: CampaignState): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'shop_discount' }> => e.type === 'shop_discount')
    .reduce((sum, e) => sum + e.percent, 0);
}

/**
 * Get morale modifier from active directives for a given side.
 */
export function getDirectiveMoraleModifier(campaign: CampaignState, side: Side): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'morale_modifier' }> =>
      e.type === 'morale_modifier' && e.side === side)
    .reduce((sum, e) => sum + e.value, 0);
}

/**
 * Get extra exploration tokens from active directives.
 */
export function getDirectiveExplorationBonus(campaign: CampaignState): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'exploration_bonus' }> => e.type === 'exploration_bonus')
    .reduce((sum, e) => sum + e.extraTokens, 0);
}

/**
 * Get command token bonus from active directives.
 */
export function getDirectiveCommandTokenBonus(campaign: CampaignState): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'command_token_bonus' }> => e.type === 'command_token_bonus')
    .reduce((sum, e) => sum + e.value, 0);
}

/**
 * Get XP bonus from active directives.
 */
export function getDirectiveXPBonus(campaign: CampaignState): number {
  const effects = getActiveDirectiveEffects(campaign);
  return effects
    .filter((e): e is Extract<DirectiveEffect, { type: 'xp_bonus' }> => e.type === 'xp_bonus')
    .reduce((sum, e) => sum + e.value, 0);
}

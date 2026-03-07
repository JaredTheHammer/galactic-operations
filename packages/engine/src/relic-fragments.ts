/**
 * Relic Fragment and Forging Engine
 *
 * TI4 Prophecy of Kings-inspired relic system. Players collect typed
 * fragments (Combat, Tech, Force, Intel) across missions via exploration
 * tokens, mission rewards, and social encounters. Collect 3 matching
 * fragments to forge a powerful Relic between missions.
 *
 * Relics provide permanent or mission-duration bonuses and represent
 * campaign-defining artifacts.
 */

import type {
  RelicFragmentType,
  RelicDefinition,
  RelicEffect,
  ForgedRelic,
  CampaignState,
  GameData,
} from './types.js';

import { RELIC_FRAGMENT_TYPES, FRAGMENTS_TO_FORGE } from './types.js';

// ============================================================================
// FRAGMENT MANAGEMENT
// ============================================================================

/**
 * Add a relic fragment to the campaign inventory.
 */
export function addFragment(
  campaign: CampaignState,
  fragmentType: RelicFragmentType,
  count: number = 1,
): CampaignState {
  const fragments = { ...(campaign.relicFragments ?? { combat: 0, tech: 0, force: 0, intel: 0 }) };
  fragments[fragmentType] = (fragments[fragmentType] ?? 0) + count;

  return { ...campaign, relicFragments: fragments };
}

/**
 * Get the current fragment counts.
 */
export function getFragmentCounts(campaign: CampaignState): Record<RelicFragmentType, number> {
  return campaign.relicFragments ?? { combat: 0, tech: 0, force: 0, intel: 0 };
}

/**
 * Check which fragment types have enough to forge a relic.
 */
export function getForgeableTypes(campaign: CampaignState): RelicFragmentType[] {
  const fragments = getFragmentCounts(campaign);
  return RELIC_FRAGMENT_TYPES.filter(type => fragments[type] >= FRAGMENTS_TO_FORGE);
}

/**
 * Check if a specific fragment type can be forged.
 */
export function canForge(campaign: CampaignState, fragmentType: RelicFragmentType): boolean {
  const fragments = getFragmentCounts(campaign);
  return fragments[fragmentType] >= FRAGMENTS_TO_FORGE;
}

// ============================================================================
// RELIC FORGING
// ============================================================================

/**
 * Get available relics to forge for a given fragment type.
 * Excludes relics already forged.
 */
export function getAvailableRelics(
  campaign: CampaignState,
  fragmentType: RelicFragmentType,
  gameData: GameData,
): RelicDefinition[] {
  const relicDefs = gameData.relicDefinitions ?? {};
  const forgedIds = new Set((campaign.forgedRelics ?? []).map(r => r.relicId));

  return Object.values(relicDefs).filter(
    r => r.fragmentType === fragmentType && !forgedIds.has(r.id)
  );
}

/**
 * Forge a relic, consuming 3 fragments and creating the relic.
 * Returns null if forging is not possible.
 */
export function forgeRelic(
  campaign: CampaignState,
  relicId: string,
  gameData: GameData,
): CampaignState | null {
  const relicDefs = gameData.relicDefinitions ?? {};
  const relicDef = relicDefs[relicId];
  if (!relicDef) return null;

  // Check fragment availability
  if (!canForge(campaign, relicDef.fragmentType)) return null;

  // Check not already forged
  const existingForged = campaign.forgedRelics ?? [];
  if (existingForged.some(r => r.relicId === relicId)) return null;

  // Consume fragments
  const fragments = { ...getFragmentCounts(campaign) };
  fragments[relicDef.fragmentType] -= FRAGMENTS_TO_FORGE;

  // Create the forged relic
  const newRelic: ForgedRelic = {
    relicId,
    forgedAt: new Date().toISOString(),
    assignedHeroId: null,
    usesRemaining: getRelicUses(relicDef.effect),
  };

  return {
    ...campaign,
    relicFragments: fragments,
    forgedRelics: [...existingForged, newRelic],
  };
}

/**
 * Determine initial uses for a relic based on its effect type.
 * Returns undefined for permanent/passive relics.
 */
function getRelicUses(effect: RelicEffect): number | undefined {
  switch (effect.type) {
    case 'free_reroll':
      return effect.uses;
    case 'heal_all':
      return 1;
    default:
      return undefined;
  }
}

// ============================================================================
// RELIC ASSIGNMENT
// ============================================================================

/**
 * Assign a forged relic to a hero.
 */
export function assignRelic(
  campaign: CampaignState,
  relicId: string,
  heroId: string,
): CampaignState {
  const forgedRelics = (campaign.forgedRelics ?? []).map(r =>
    r.relicId === relicId ? { ...r, assignedHeroId: heroId } : r
  );

  return { ...campaign, forgedRelics };
}

/**
 * Unassign a relic from its current hero.
 */
export function unassignRelic(
  campaign: CampaignState,
  relicId: string,
): CampaignState {
  const forgedRelics = (campaign.forgedRelics ?? []).map(r =>
    r.relicId === relicId ? { ...r, assignedHeroId: null } : r
  );

  return { ...campaign, forgedRelics };
}

/**
 * Get relics assigned to a specific hero.
 */
export function getHeroRelics(
  campaign: CampaignState,
  heroId: string,
  gameData: GameData,
): Array<{ relic: ForgedRelic; definition: RelicDefinition }> {
  const relicDefs = gameData.relicDefinitions ?? {};
  return (campaign.forgedRelics ?? [])
    .filter(r => r.assignedHeroId === heroId)
    .map(r => ({ relic: r, definition: relicDefs[r.relicId] }))
    .filter(r => r.definition !== undefined) as Array<{ relic: ForgedRelic; definition: RelicDefinition }>;
}

// ============================================================================
// RELIC EFFECT APPLICATION
// ============================================================================

/**
 * Use a limited-use relic, decrementing its remaining uses.
 * Returns null if relic has no uses remaining or is not found.
 */
export function useRelic(
  campaign: CampaignState,
  relicId: string,
): CampaignState | null {
  const forgedRelics = campaign.forgedRelics ?? [];
  const relic = forgedRelics.find(r => r.relicId === relicId);
  if (!relic) return null;
  if (relic.usesRemaining !== undefined && relic.usesRemaining <= 0) return null;

  const updated = forgedRelics.map(r => {
    if (r.relicId !== relicId) return r;
    if (r.usesRemaining === undefined) return r;
    return { ...r, usesRemaining: r.usesRemaining - 1 };
  });

  return { ...campaign, forgedRelics: updated };
}

/**
 * Get all active relic effects for a hero.
 * Filters to relics assigned to the hero with remaining uses (or permanent).
 */
export function getActiveRelicEffects(
  campaign: CampaignState,
  heroId: string,
  gameData: GameData,
): RelicEffect[] {
  const heroRelics = getHeroRelics(campaign, heroId, gameData);
  return heroRelics
    .filter(({ relic }) => relic.usesRemaining === undefined || relic.usesRemaining > 0)
    .map(({ definition }) => definition.effect);
}

/**
 * Calculate total attack bonus from relics for a hero.
 */
export function getRelicAttackBonus(
  campaign: CampaignState,
  heroId: string,
  gameData: GameData,
): number {
  const effects = getActiveRelicEffects(campaign, heroId, gameData);
  return effects
    .filter((e): e is Extract<RelicEffect, { type: 'attack_bonus' }> => e.type === 'attack_bonus')
    .reduce((sum, e) => sum + e.dice, 0);
}

/**
 * Calculate total defense bonus from relics for a hero.
 */
export function getRelicDefenseBonus(
  campaign: CampaignState,
  heroId: string,
  gameData: GameData,
): number {
  const effects = getActiveRelicEffects(campaign, heroId, gameData);
  return effects
    .filter((e): e is Extract<RelicEffect, { type: 'defense_bonus' }> => e.type === 'defense_bonus')
    .reduce((sum, e) => sum + e.dice, 0);
}

/**
 * Calculate total soak bonus from relics for a hero.
 */
export function getRelicSoakBonus(
  campaign: CampaignState,
  heroId: string,
  gameData: GameData,
): number {
  const effects = getActiveRelicEffects(campaign, heroId, gameData);
  return effects
    .filter((e): e is Extract<RelicEffect, { type: 'soak_bonus' }> => e.type === 'soak_bonus')
    .reduce((sum, e) => sum + e.value, 0);
}

/**
 * Get total fragment count across all types.
 */
export function getTotalFragments(campaign: CampaignState): number {
  const fragments = getFragmentCounts(campaign);
  return Object.values(fragments).reduce((sum, v) => sum + v, 0);
}

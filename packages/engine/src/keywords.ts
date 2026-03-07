/**
 * keywords.ts -- Unit Keyword Resolution for Galactic Operations
 *
 * Provides utilities for querying and applying mechanical keywords
 * (Legion-inspired) that modify engine behavior at specific hook points.
 *
 * Keywords are defined on NPCProfile.mechanicalKeywords and resolved at runtime
 * via the Figure's backing entity. Heroes can also gain keywords via talents
 * (future extension point), but the initial set is NPC-only.
 *
 * Hook points:
 * - combat-v2.ts: Armor X (cancel hits), Guardian X (wound transfer)
 * - turn-machine-v2.ts: Cumbersome (block attack after move), Relentless (free move after attack),
 *   Disciplined (+N rally removal), Dauntless (strain to remove suppression), Agile (+1 defense after move)
 * - ai/evaluate-v2.ts: keyword-aware target scoring
 */

import type {
  Figure,
  GameState,
  NPCProfile,
  HeroCharacter,
  UnitKeyword,
  UnitKeywordName,
} from './types.js';

// ============================================================================
// ENTITY RESOLUTION
// ============================================================================

function getEntity(
  figure: Figure,
  gameState: GameState,
): HeroCharacter | NPCProfile | null {
  if (figure.entityType === 'hero') {
    return gameState.heroes[figure.entityId] ?? null;
  }
  return gameState.npcProfiles[figure.entityId] ?? null;
}

function isNPC(entity: HeroCharacter | NPCProfile): entity is NPCProfile {
  return 'tier' in entity && 'attackPool' in entity;
}

// ============================================================================
// KEYWORD QUERIES
// ============================================================================

/**
 * Get all mechanical keywords for a figure.
 * Returns empty array if figure has no keywords or is a hero (heroes don't have keywords yet).
 */
export function getMechanicalKeywords(
  figure: Figure,
  gameState: GameState,
): UnitKeyword[] {
  const entity = getEntity(figure, gameState);
  if (!entity) return [];
  if (!isNPC(entity)) return []; // heroes don't have mechanical keywords yet
  return entity.mechanicalKeywords ?? [];
}

/**
 * Check if a figure has a specific mechanical keyword.
 */
export function hasKeyword(
  figure: Figure,
  keywordName: UnitKeywordName,
  gameState: GameState,
): boolean {
  const keywords = getMechanicalKeywords(figure, gameState);
  return keywords.some(k => k.name === keywordName);
}

/**
 * Get the numeric value of a keyword (e.g., Armor 1 returns 1, Guardian 2 returns 2).
 * Returns 0 if the keyword is not found. Returns 1 for boolean keywords (no value).
 */
export function getKeywordValue(
  figure: Figure,
  keywordName: UnitKeywordName,
  gameState: GameState,
): number {
  const keywords = getMechanicalKeywords(figure, gameState);
  const kw = keywords.find(k => k.name === keywordName);
  if (!kw) return 0;
  return kw.value ?? 1; // boolean keywords default to value 1
}

/**
 * Direct query on an NPCProfile (useful when Figure isn't available yet).
 */
export function npcHasKeyword(
  npc: NPCProfile,
  keywordName: UnitKeywordName,
): boolean {
  return (npc.mechanicalKeywords ?? []).some(k => k.name === keywordName);
}

/**
 * Direct value query on an NPCProfile.
 */
export function getNPCKeywordValue(
  npc: NPCProfile,
  keywordName: UnitKeywordName,
): number {
  const kw = (npc.mechanicalKeywords ?? []).find(k => k.name === keywordName);
  if (!kw) return 0;
  return kw.value ?? 1;
}

// ============================================================================
// KEYWORD EFFECT: ARMOR X
// ============================================================================

/**
 * Armor X: After defense roll, cancel up to X hit results (reduce netSuccesses).
 * Applied in combat-v2.ts after roll resolution but before damage calculation.
 *
 * @param netSuccesses The net successes from the opposed roll
 * @param armorValue The Armor X value
 * @returns Adjusted net successes (minimum 0)
 */
export function applyArmorKeyword(
  netSuccesses: number,
  armorValue: number,
): number {
  if (armorValue <= 0) return netSuccesses;
  return Math.max(0, netSuccesses - armorValue);
}

// ============================================================================
// KEYWORD EFFECT: DISCIPLINED X
// ============================================================================

/**
 * Disciplined X: Remove X additional suppression tokens during rally step.
 * Applied in turn-machine-v2.ts resetForActivation.
 *
 * @param baseRemoved Tokens removed by standard rally dice
 * @param disciplinedValue The Disciplined X value
 * @returns Total tokens to remove
 */
export function applyDisciplinedBonus(
  baseRemoved: number,
  disciplinedValue: number,
): number {
  return baseRemoved + disciplinedValue;
}

// ============================================================================
// KEYWORD EFFECT: RETALIATE X
// ============================================================================

/**
 * Retaliate X: When a figure with Retaliate X is hit by an attack from
 * within Engaged range (0-1 tiles), the attacker automatically suffers X wounds.
 * No roll needed -- this is flat, deterministic damage.
 *
 * Applied in combat-v2.ts applyCombatResult after hit confirmation.
 *
 * @param retaliateValue The Retaliate X value (automatic wounds to deal)
 * @param attackerSoak The attacker's soak value (reduces retaliate damage)
 * @returns Net wounds the attacker suffers (minimum 0)
 */
export function applyRetaliateKeyword(
  retaliateValue: number,
  attackerSoak: number,
): number {
  if (retaliateValue <= 0) return 0;
  return Math.max(0, retaliateValue - attackerSoak);
}

// ============================================================================
// KEYWORD EFFECT: GUARDIAN X
// ============================================================================

/**
 * Find Guardian-capable allies near a defender who can absorb wounds.
 * Returns list of { figureId, maxAbsorb } sorted by proximity.
 *
 * Guardian X: When a friendly figure within Short range (1-4 tiles) is hit
 * by a ranged attack, the Guardian may absorb up to X wounds.
 *
 * Conditions:
 * - Guardian must be alive (not defeated)
 * - Guardian must be within Short range of defender (1-4 tiles)
 * - Guardian must be on the same side as defender
 * - Guardian cannot protect itself
 * - Attack must be ranged (not melee)
 */
export function findGuardians(
  defenderFigure: Figure,
  gameState: GameState,
  maxRange: number = 4,
): Array<{ figureId: string; maxAbsorb: number; figure: Figure }> {
  const guardians: Array<{ figureId: string; maxAbsorb: number; figure: Figure }> = [];

  for (const fig of gameState.figures) {
    if (fig.id === defenderFigure.id) continue; // can't guard yourself
    if (fig.isDefeated) continue;
    if (fig.playerId !== defenderFigure.playerId) continue; // must be friendly

    const guardianValue = getKeywordValue(fig, 'Guardian', gameState);
    if (guardianValue <= 0) continue;

    // Check range
    const dx = Math.abs(fig.position.x - defenderFigure.position.x);
    const dy = Math.abs(fig.position.y - defenderFigure.position.y);
    const dist = Math.max(dx, dy); // Chebyshev distance
    if (dist > maxRange) continue;

    guardians.push({
      figureId: fig.id,
      maxAbsorb: guardianValue,
      figure: fig,
    });
  }

  // Sort by distance (closest first)
  guardians.sort((a, b) => {
    const distA = Math.max(
      Math.abs(a.figure.position.x - defenderFigure.position.x),
      Math.abs(a.figure.position.y - defenderFigure.position.y),
    );
    const distB = Math.max(
      Math.abs(b.figure.position.x - defenderFigure.position.x),
      Math.abs(b.figure.position.y - defenderFigure.position.y),
    );
    return distA - distB;
  });

  return guardians;
}

/**
 * Apply Guardian wound transfer.
 * Returns how wounds should be distributed between defender and guardian(s).
 *
 * @param woundsDealt Total wounds to deal to defender
 * @param guardians Available guardian figures with their max absorb values
 * @returns Object with remaining wounds for defender and wounds absorbed by each guardian
 */
export function applyGuardianTransfer(
  woundsDealt: number,
  guardians: Array<{ figureId: string; maxAbsorb: number }>,
): {
  defenderWounds: number;
  guardianWounds: Array<{ figureId: string; woundsAbsorbed: number }>;
} {
  let remaining = woundsDealt;
  const guardianWounds: Array<{ figureId: string; woundsAbsorbed: number }> = [];

  for (const g of guardians) {
    if (remaining <= 0) break;
    const absorbed = Math.min(remaining, g.maxAbsorb);
    remaining -= absorbed;
    guardianWounds.push({ figureId: g.figureId, woundsAbsorbed: absorbed });
  }

  return {
    defenderWounds: remaining,
    guardianWounds,
  };
}

// ============================================================================
// KEYWORD EFFECT: PIERCE X
// ============================================================================

/**
 * Pierce X: Ignore X points of the target's Soak when dealing damage.
 * Stacks with weapon Pierce quality and combo pierce.
 * Applied in combat-v2.ts calculateDamage via the attackerKeywordPierceValue parameter.
 *
 * @param soak The target's total soak value
 * @param pierceValue The Pierce X keyword value
 * @returns Adjusted soak (minimum 0)
 */
export function applyPierceKeyword(
  soak: number,
  pierceValue: number,
): number {
  if (pierceValue <= 0) return soak;
  return Math.max(0, soak - pierceValue);
}

// ============================================================================
// KEYWORD EFFECT: SHIELD X
// ============================================================================

/**
 * Shield X: Gain X automatic block results in defense.
 * Reduces net successes after opposed roll resolution.
 * Applied in combat-v2.ts resolveCombatV2 after Armor but before Dodge.
 *
 * @param netSuccesses Net successes from the opposed roll
 * @param shieldValue The Shield X value
 * @returns Adjusted net successes (minimum 0)
 */
export function applyShieldKeyword(
  netSuccesses: number,
  shieldValue: number,
): number {
  if (shieldValue <= 0) return netSuccesses;
  return Math.max(0, netSuccesses - shieldValue);
}

// ============================================================================
// KEYWORD EFFECT: STEADFAST
// ============================================================================

/**
 * Steadfast: Immune to Stunned and Immobilized conditions.
 * Boolean keyword (no value). Checked in combat-v2.ts applyCombatResult
 * before applying conditions from combo effects.
 *
 * @param figure The figure to check
 * @param gameState Current game state
 * @returns true if figure has Steadfast keyword
 */
export function isSteadfast(
  figure: Figure,
  gameState: GameState,
): boolean {
  return hasKeyword(figure, 'Steadfast', gameState);
}

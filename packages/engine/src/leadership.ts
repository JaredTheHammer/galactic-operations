/**
 * Leadership Re-roll System
 *
 * Inspired by War of the Ring's Leader re-roll mechanic where Leaders
 * allow re-rolling missed combat dice equal to their Leadership value.
 *
 * In Galactic Operations, leaders provide an aura within Short range (4 tiles).
 * Allied figures attacking within this aura can re-roll a number of blank/miss
 * dice from their positive pool equal to the leader's Presence characteristic
 * or leadership skill rank (whichever is higher).
 *
 * Design constraints:
 * - Re-rolls apply to the ATTACK pool only (not defense)
 * - Re-rolls target blanks/misses (faces with 0 successes and 0 advantages)
 * - Only positive dice (ability/proficiency) are re-rolled
 * - A figure can only benefit from one leader's aura per attack
 * - The leader must not be incapacitated or defeated
 */

import type {
  Figure,
  GameState,
  HeroCharacter,
  NPCProfile,
  LeadershipAura,
  D6RollResult,
  AttackPool,
} from './types.js';
import type { RollFn } from './dice-v2.js';

import { getDistance } from './movement.js';
import { RANGE_BAND_TILES } from './types.js';
import { defaultRollFn, rollSingleDie } from './dice-v2.js';

// Short range = 4 tiles (from range band table)
const LEADERSHIP_RANGE = RANGE_BAND_TILES.Short.max;

/**
 * Determine the leadership value for a figure.
 * Heroes: max(Presence, leadership skill rank)
 * NPCs: Nemesis tier = 2, Rival tier = 1, Minion = 0
 *       (overridden by explicit leadership keyword value if present)
 */
export function getLeadershipValue(
  figure: Figure,
  gameState: GameState,
): number {
  if (figure.isDefeated) return 0;

  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    if (!hero) return 0;
    const presence = hero.characteristics.presence;
    const leadershipSkill = hero.skills['leadership'] ?? 0;
    return Math.max(presence, leadershipSkill);
  }

  // NPC leadership based on tier
  const npc = gameState.npcProfiles[figure.entityId];
  if (!npc) return 0;

  // Check for explicit Leadership keyword
  if (npc.keywords) {
    const leaderKeyword = npc.keywords.find(
      k => typeof k === 'string' && k.toLowerCase().startsWith('leader'),
    );
    if (leaderKeyword) {
      const match = leaderKeyword.match(/\d+/);
      if (match) return parseInt(match[0], 10);
    }
  }

  switch (npc.tier) {
    case 'Nemesis': return 2;
    case 'Rival': return 1;
    default: return 0;
  }
}

/**
 * Find the best leadership aura available for a given attacker figure.
 * Scans all non-defeated allied figures within Short range for leadership value.
 * Returns the highest-value aura, or null if no leader is nearby.
 *
 * A figure cannot provide leadership to itself (WotR leaders boost other units).
 */
export function findLeadershipAura(
  attackerId: string,
  gameState: GameState,
): LeadershipAura | null {
  const attacker = gameState.figures.find(f => f.id === attackerId);
  if (!attacker) return null;

  let bestAura: LeadershipAura | null = null;

  for (const figure of gameState.figures) {
    // Skip self, defeated, enemies, and figures on different sides
    if (figure.id === attackerId) continue;
    if (figure.isDefeated) continue;
    if (figure.playerId !== attacker.playerId) continue;

    const leadershipValue = getLeadershipValue(figure, gameState);
    if (leadershipValue <= 0) continue;

    const distance = getDistance(attacker.position, figure.position);
    if (distance > LEADERSHIP_RANGE) continue;

    if (!bestAura || leadershipValue > bestAura.rerollCount) {
      bestAura = {
        leaderId: figure.id,
        rerollCount: leadershipValue,
        range: LEADERSHIP_RANGE,
      };
    }
  }

  return bestAura;
}

/**
 * Apply leadership re-rolls to an attack roll.
 * Re-rolls blank/miss faces on positive dice (faces where successes=0 and advantages=0).
 * Returns the modified roll results.
 *
 * This mirrors WotR where Leadership lets you re-roll missed dice.
 */
export function applyLeadershipRerolls(
  attackRolls: D6RollResult[],
  rerollCount: number,
  rollFn: RollFn = defaultRollFn,
): { rerolledResults: D6RollResult[]; rerollsUsed: number } {
  if (rerollCount <= 0) {
    return { rerolledResults: [...attackRolls], rerollsUsed: 0 };
  }

  // Find indices of blank/miss faces (0 successes, 0 advantages)
  const blankIndices: number[] = [];
  for (let i = 0; i < attackRolls.length; i++) {
    const roll = attackRolls[i];
    if (roll.successes === 0 && roll.advantages === 0 && roll.triumphs === 0) {
      blankIndices.push(i);
    }
  }

  // Re-roll up to rerollCount blanks
  const rerollsUsed = Math.min(rerollCount, blankIndices.length);
  const rerolledResults = [...attackRolls];

  for (let i = 0; i < rerollsUsed; i++) {
    const idx = blankIndices[i];
    const originalDie = attackRolls[idx];
    // Re-roll with the same die type
    rerolledResults[idx] = rollSingleDie(originalDie.dieType, rollFn);
  }

  return { rerolledResults, rerollsUsed };
}

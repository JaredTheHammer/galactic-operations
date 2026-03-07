/**
 * Boss Hit Location System (Oathsworn-inspired)
 *
 * Bosses have targetable hit locations with individual wound pools.
 * When a location's wounds reach capacity, it becomes "disabled" and
 * applies permanent penalties (reduced attack/defense, disabled weapons, etc.).
 *
 * When enough locations are disabled, the boss transitions to a new AI phase
 * with different behavior patterns (more aggressive, desperate, etc.).
 *
 * Players can choose to target a specific location (adds +1 difficulty die
 * for the precision required) or let wounds distribute randomly.
 */

import type {
  Figure,
  GameState,
  NPCProfile,
  BossHitLocationState,
  BossHitLocationDef,
  BossPhaseTransition,
  Condition,
  AttackPool,
  DefensePool,
} from './types.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize hit location runtime state on a boss Figure from its NPCProfile.
 * Called during figure deployment when the NPC has isBoss=true.
 */
export function initBossHitLocations(
  figure: Figure,
  npcProfile: NPCProfile,
): Figure {
  if (!npcProfile.isBoss || !npcProfile.bossHitLocations?.length) {
    return figure;
  }

  const hitLocations: BossHitLocationState[] = npcProfile.bossHitLocations.map(def => ({
    id: def.id,
    name: def.name,
    woundCapacity: def.woundCapacity,
    woundsCurrent: 0,
    isDisabled: false,
    disabledEffects: def.disabledEffects,
  }));

  return {
    ...figure,
    hitLocations,
    bossPhase: 0,
  };
}

// ============================================================================
// DAMAGE ROUTING
// ============================================================================

/**
 * Route incoming wounds to hit locations on a boss figure.
 *
 * If a targetLocationId is specified, all wounds go to that location.
 * If not specified, wounds are distributed to a random non-disabled location.
 * Overflow wounds (beyond a location's remaining capacity) spill to the main wound pool.
 *
 * Returns the updated hit locations and the number of overflow wounds
 * that should be applied to the boss's main woundsCurrent.
 */
export function routeWoundsToHitLocations(
  hitLocations: BossHitLocationState[],
  wounds: number,
  targetLocationId?: string,
  rollFn?: () => number,
): { updatedLocations: BossHitLocationState[]; overflowWounds: number; newlyDisabled: string[] } {
  if (wounds <= 0 || hitLocations.length === 0) {
    return { updatedLocations: hitLocations, overflowWounds: wounds, newlyDisabled: [] };
  }

  const activeLocations = hitLocations.filter(loc => !loc.isDisabled);
  if (activeLocations.length === 0) {
    // All locations disabled: all wounds go to main pool
    return { updatedLocations: hitLocations, overflowWounds: wounds, newlyDisabled: [] };
  }

  const roll = rollFn ?? (() => Math.ceil(Math.random() * 6));
  const newlyDisabled: string[] = [];
  let remainingWounds = wounds;

  const updated = hitLocations.map(loc => ({ ...loc }));

  if (targetLocationId) {
    // Targeted shot: all wounds to specified location
    const targetIdx = updated.findIndex(loc => loc.id === targetLocationId);
    if (targetIdx >= 0 && !updated[targetIdx].isDisabled) {
      const loc = updated[targetIdx];
      const remaining = loc.woundCapacity - loc.woundsCurrent;
      const absorbed = Math.min(remainingWounds, remaining);
      loc.woundsCurrent += absorbed;
      remainingWounds -= absorbed;

      if (loc.woundsCurrent >= loc.woundCapacity) {
        loc.isDisabled = true;
        newlyDisabled.push(loc.id);
      }
    }
    // If target not found or already disabled, all wounds overflow
  } else {
    // Random distribution: pick a random active location
    const activeIndices = updated
      .map((loc, i) => (!loc.isDisabled ? i : -1))
      .filter(i => i >= 0);

    if (activeIndices.length > 0) {
      const randomIdx = activeIndices[(roll() - 1) % activeIndices.length];
      const loc = updated[randomIdx];
      const remaining = loc.woundCapacity - loc.woundsCurrent;
      const absorbed = Math.min(remainingWounds, remaining);
      loc.woundsCurrent += absorbed;
      remainingWounds -= absorbed;

      if (loc.woundsCurrent >= loc.woundCapacity) {
        loc.isDisabled = true;
        newlyDisabled.push(loc.id);
      }
    }
  }

  return {
    updatedLocations: updated,
    overflowWounds: remainingWounds,
    newlyDisabled,
  };
}

// ============================================================================
// BOSS PENALTY APPLICATION
// ============================================================================

/**
 * Get the cumulative attack pool modifier from all disabled hit locations.
 * Returns a negative number (dice to remove from the boss's attack pool).
 */
export function getBossAttackPoolPenalty(figure: Figure): number {
  if (!figure.hitLocations) return 0;
  return figure.hitLocations
    .filter(loc => loc.isDisabled && loc.disabledEffects.attackPoolModifier)
    .reduce((sum, loc) => sum + (loc.disabledEffects.attackPoolModifier ?? 0), 0);
}

/**
 * Get the cumulative defense pool modifier from all disabled hit locations.
 */
export function getBossDefensePoolPenalty(figure: Figure): number {
  if (!figure.hitLocations) return 0;
  return figure.hitLocations
    .filter(loc => loc.isDisabled && loc.disabledEffects.defensePoolModifier)
    .reduce((sum, loc) => sum + (loc.disabledEffects.defensePoolModifier ?? 0), 0);
}

/**
 * Get the cumulative soak modifier from all disabled hit locations.
 */
export function getBossSoakPenalty(figure: Figure): number {
  if (!figure.hitLocations) return 0;
  return figure.hitLocations
    .filter(loc => loc.isDisabled && loc.disabledEffects.soakModifier)
    .reduce((sum, loc) => sum + (loc.disabledEffects.soakModifier ?? 0), 0);
}

/**
 * Get the cumulative speed modifier from all disabled hit locations.
 */
export function getBossSpeedPenalty(figure: Figure): number {
  if (!figure.hitLocations) return 0;
  return figure.hitLocations
    .filter(loc => loc.isDisabled && loc.disabledEffects.speedModifier)
    .reduce((sum, loc) => sum + (loc.disabledEffects.speedModifier ?? 0), 0);
}

/**
 * Get all weapon IDs disabled by destroyed hit locations.
 */
export function getDisabledBossWeapons(figure: Figure): string[] {
  if (!figure.hitLocations) return [];
  return figure.hitLocations
    .filter(loc => loc.isDisabled && loc.disabledEffects.disabledWeapons)
    .flatMap(loc => loc.disabledEffects.disabledWeapons ?? []);
}

/**
 * Get all conditions inflicted by disabled hit locations.
 */
export function getDisabledLocationConditions(figure: Figure): Condition[] {
  if (!figure.hitLocations) return [];
  return figure.hitLocations
    .filter(loc => loc.isDisabled && loc.disabledEffects.conditionInflicted)
    .map(loc => loc.disabledEffects.conditionInflicted!)
    .filter((c, i, arr) => arr.indexOf(c) === i); // dedupe
}

/**
 * Apply the targeted-shot difficulty penalty to a defense pool.
 * Targeting a specific hit location adds +1 Difficulty die (precision cost).
 */
export function applyTargetedShotPenalty(
  defensePool: DefensePool,
): DefensePool {
  return {
    ...defensePool,
    difficulty: defensePool.difficulty + 1,
  };
}

/**
 * Apply boss attack pool penalties from disabled hit locations.
 * Removes ability dice first, then proficiency if needed.
 */
export function applyBossAttackPenalties(
  attackPool: AttackPool,
  figure: Figure,
): AttackPool {
  const penalty = Math.abs(getBossAttackPoolPenalty(figure));
  if (penalty === 0) return attackPool;

  let { ability, proficiency } = attackPool;
  let remaining = penalty;

  // Remove ability dice first
  const abilityRemoved = Math.min(remaining, ability);
  ability -= abilityRemoved;
  remaining -= abilityRemoved;

  // Then proficiency dice
  const profRemoved = Math.min(remaining, proficiency);
  proficiency -= profRemoved;

  return { ability: Math.max(0, ability), proficiency: Math.max(0, proficiency) };
}

/**
 * Apply boss defense pool penalties from disabled hit locations.
 * Removes difficulty dice first, then challenge if needed.
 */
export function applyBossDefensePenalties(
  defensePool: DefensePool,
  figure: Figure,
): DefensePool {
  const penalty = Math.abs(getBossDefensePoolPenalty(figure));
  if (penalty === 0) return defensePool;

  let { difficulty, challenge } = defensePool;
  let remaining = penalty;

  const diffRemoved = Math.min(remaining, difficulty);
  difficulty -= diffRemoved;
  remaining -= diffRemoved;

  const chalRemoved = Math.min(remaining, challenge);
  challenge -= chalRemoved;

  return { difficulty: Math.max(0, difficulty), challenge: Math.max(0, challenge) };
}

// ============================================================================
// PHASE TRANSITIONS
// ============================================================================

/**
 * Check if the boss should transition to a new AI phase based on disabled locations.
 * Returns the new phase index and transition data, or null if no transition.
 */
export function checkBossPhaseTransition(
  figure: Figure,
  npcProfile: NPCProfile,
): BossPhaseTransition | null {
  if (!figure.hitLocations || !npcProfile.bossPhaseTransitions?.length) {
    return null;
  }

  const disabledCount = figure.hitLocations.filter(loc => loc.isDisabled).length;
  const currentPhase = figure.bossPhase ?? 0;

  // Find the next transition that should trigger
  const transitions = npcProfile.bossPhaseTransitions
    .sort((a, b) => a.disabledLocationsRequired - b.disabledLocationsRequired);

  for (let i = transitions.length - 1; i >= 0; i--) {
    if (disabledCount >= transitions[i].disabledLocationsRequired && i >= currentPhase) {
      return transitions[i];
    }
  }

  return null;
}

/**
 * Apply a boss phase transition: advance phase counter and accumulate stat bonuses.
 * The AI archetype swap is handled by the AI decision system reading bossPhase.
 */
export function applyBossPhaseTransition(
  figure: Figure,
  transition: BossPhaseTransition,
): Figure {
  const currentPhase = figure.bossPhase ?? 0;
  const existing = figure.bossPhaseStatBonuses ?? {};
  const bonuses = transition.statBonuses;

  // Accumulate stat bonuses from this transition
  const newBonuses = bonuses ? {
    attackPoolBonus: (existing.attackPoolBonus ?? 0) + (bonuses.attackPoolBonus ?? 0),
    defensePoolBonus: (existing.defensePoolBonus ?? 0) + (bonuses.defensePoolBonus ?? 0),
    soakBonus: (existing.soakBonus ?? 0) + (bonuses.soakBonus ?? 0),
    speedBonus: (existing.speedBonus ?? 0) + (bonuses.speedBonus ?? 0),
    damageBonus: (existing.damageBonus ?? 0) + (bonuses.damageBonus ?? 0),
  } : existing;

  return {
    ...figure,
    bossPhase: currentPhase + 1,
    bossPhaseStatBonuses: Object.values(newBonuses).some(v => v !== 0) ? newBonuses : undefined,
  };
}

/**
 * Check if a specific weapon is still usable by a boss (not disabled by hit locations).
 */
export function isBossWeaponAvailable(figure: Figure, weaponId: string): boolean {
  const disabled = getDisabledBossWeapons(figure);
  return !disabled.includes(weaponId);
}

/**
 * Get a summary of boss hit location status for UI display.
 */
export function getBossLocationSummary(figure: Figure): Array<{
  id: string;
  name: string;
  woundsCurrent: number;
  woundCapacity: number;
  isDisabled: boolean;
  percentRemaining: number;
}> {
  if (!figure.hitLocations) return [];

  return figure.hitLocations.map(loc => ({
    id: loc.id,
    name: loc.name,
    woundsCurrent: loc.woundsCurrent,
    woundCapacity: loc.woundCapacity,
    isDisabled: loc.isDisabled,
    percentRemaining: loc.isDisabled
      ? 0
      : Math.round(((loc.woundCapacity - loc.woundsCurrent) / loc.woundCapacity) * 100),
  }));
}

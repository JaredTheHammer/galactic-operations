/**
 * Galactic Operations - Critical Injury System
 * Pandemic Legacy-inspired persistent consequences for heroes.
 *
 * Critical injuries are sustained when heroes are wounded or defeated in combat.
 * They impose stacking penalties that persist between missions until treated.
 * No permadeath -- instead, accumulating injuries makes heroes increasingly
 * hindered, creating meaningful risk without permanent loss.
 *
 * Recovery options:
 * 1. Medical treatment: skill check (Medicine/Mechanics) during social phase
 * 2. Professional treatment: pay credits at a medical facility
 * 3. Natural recovery: rest for N missions without deploying
 */

import type {
  CriticalInjuryDefinition,
  CriticalInjuryEffect,
  CriticalInjurySeverity,
  ActiveCriticalInjury,
  HeroCharacter,
  CampaignState,
  Characteristics,
  CharacteristicName,
} from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum critical injuries a hero can have before being forced to rest */
export const MAX_CRITICAL_INJURIES = 5;

/** Number of stacked injuries before hero is forced to sit out */
export const FORCED_REST_THRESHOLD = 4;

/** Severity roll ranges (d66: roll 2d6, first is tens, second is ones) */
export const SEVERITY_ROLL_RANGES: Record<CriticalInjurySeverity, [number, number]> = {
  minor: [11, 35],
  moderate: [36, 55],
  severe: [56, 66],
};

// ============================================================================
// CRITICAL INJURY RESOLUTION
// ============================================================================

/**
 * Roll for a critical injury using d66 (2d6: first die is tens digit, second is ones).
 * Applies a modifier from stacking injuries: +10 per existing critical injury.
 */
export function rollCriticalInjuryD66(
  hero: HeroCharacter,
  rollFn: () => number,
  modifier: number = 0,
): number {
  const die1 = Math.ceil(rollFn() * 6);
  const die2 = Math.ceil(rollFn() * 6);
  const baseRoll = die1 * 10 + die2;

  // Stack modifier: +10 per existing critical injury
  const existingInjuries = (hero.criticalInjuries ?? []).length;
  const stackModifier = existingInjuries * 10;

  return Math.min(66, baseRoll + stackModifier + modifier);
}

/**
 * Look up the critical injury definition matching a d66 roll result.
 */
export function getCriticalInjuryForRoll(
  roll: number,
  injuries: Record<string, CriticalInjuryDefinition>,
): CriticalInjuryDefinition | null {
  for (const injury of Object.values(injuries)) {
    if (roll >= injury.rollRange[0] && roll <= injury.rollRange[1]) {
      return injury;
    }
  }
  return null;
}

/**
 * Apply a critical injury to a hero. Returns updated hero with the new injury added.
 */
export function applyCriticalInjury(
  hero: HeroCharacter,
  injuryId: string,
  missionId: string,
): HeroCharacter {
  const existing = hero.criticalInjuries ?? [];
  const newInjury: ActiveCriticalInjury = {
    injuryId,
    sustainedInMission: missionId,
    missionsRested: 0,
    treatmentAttempted: false,
  };

  return {
    ...hero,
    criticalInjuries: [...existing, newInjury],
  };
}

/**
 * Remove a specific critical injury from a hero (after successful treatment).
 */
export function removeCriticalInjury(
  hero: HeroCharacter,
  injuryIndex: number,
): HeroCharacter {
  const injuries = [...(hero.criticalInjuries ?? [])];
  if (injuryIndex < 0 || injuryIndex >= injuries.length) return hero;
  injuries.splice(injuryIndex, 1);
  return {
    ...hero,
    criticalInjuries: injuries,
  };
}

/**
 * Remove a critical injury by its definition ID (removes first match).
 */
export function removeCriticalInjuryById(
  hero: HeroCharacter,
  injuryId: string,
): HeroCharacter {
  const injuries = hero.criticalInjuries ?? [];
  const index = injuries.findIndex(i => i.injuryId === injuryId);
  if (index === -1) return hero;
  return removeCriticalInjury(hero, index);
}

// ============================================================================
// CRITICAL INJURY EFFECTS ON HERO STATS
// ============================================================================

/**
 * Compute total characteristic penalties from all active critical injuries.
 */
export function getCriticalInjuryCharacteristicPenalties(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): Partial<Characteristics> {
  const penalties: Partial<Characteristics> = {};
  for (const active of hero.criticalInjuries ?? []) {
    const def = injuries[active.injuryId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.type === 'reduce_characteristic' && effect.target) {
        const char = effect.target as CharacteristicName;
        penalties[char] = (penalties[char] ?? 0) + effect.value;
      }
    }
  }
  return penalties;
}

/**
 * Compute total wound threshold penalty from critical injuries.
 */
export function getCriticalInjuryWoundPenalty(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): number {
  return sumEffectValues(hero, injuries, 'reduce_wound_threshold');
}

/**
 * Compute total strain threshold penalty from critical injuries.
 */
export function getCriticalInjuryStrainPenalty(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): number {
  return sumEffectValues(hero, injuries, 'reduce_strain_threshold');
}

/**
 * Compute total speed penalty from critical injuries.
 */
export function getCriticalInjurySpeedPenalty(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): number {
  return sumEffectValues(hero, injuries, 'reduce_speed');
}

/**
 * Compute total soak penalty from critical injuries.
 */
export function getCriticalInjurySoakPenalty(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): number {
  return sumEffectValues(hero, injuries, 'reduce_soak');
}

/**
 * Get all skill penalties from critical injuries.
 * Returns a map of skill ID -> total penalty.
 */
export function getCriticalInjurySkillPenalties(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): Record<string, number> {
  const penalties: Record<string, number> = {};
  for (const active of hero.criticalInjuries ?? []) {
    const def = injuries[active.injuryId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.type === 'skill_penalty' && effect.target) {
        penalties[effect.target] = (penalties[effect.target] ?? 0) + effect.value;
      }
    }
  }
  return penalties;
}

/**
 * Check if a hero has too many critical injuries and must be forced to rest.
 */
export function isHeroForcedToRest(hero: HeroCharacter): boolean {
  return (hero.criticalInjuries ?? []).length >= FORCED_REST_THRESHOLD;
}

/**
 * Get a summary of a hero's critical injury status.
 */
export function getHeroCriticalInjuryStatus(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
): {
  totalInjuries: number;
  minorCount: number;
  moderateCount: number;
  severeCount: number;
  forcedToRest: boolean;
  injuryDetails: Array<{ injury: CriticalInjuryDefinition; active: ActiveCriticalInjury }>;
} {
  const active = hero.criticalInjuries ?? [];
  let minorCount = 0;
  let moderateCount = 0;
  let severeCount = 0;
  const injuryDetails: Array<{ injury: CriticalInjuryDefinition; active: ActiveCriticalInjury }> = [];

  for (const a of active) {
    const def = injuries[a.injuryId];
    if (!def) continue;
    injuryDetails.push({ injury: def, active: a });
    switch (def.severity) {
      case 'minor': minorCount++; break;
      case 'moderate': moderateCount++; break;
      case 'severe': severeCount++; break;
    }
  }

  return {
    totalInjuries: active.length,
    minorCount,
    moderateCount,
    severeCount,
    forcedToRest: isHeroForcedToRest(hero),
    injuryDetails,
  };
}

// ============================================================================
// TREATMENT AND RECOVERY
// ============================================================================

/**
 * Attempt to treat a critical injury with a skill check.
 * Returns whether the treatment was successful and the updated hero.
 */
export function attemptTreatment(
  hero: HeroCharacter,
  injuryIndex: number,
  injuries: Record<string, CriticalInjuryDefinition>,
  checkSuccess: boolean,
): { hero: HeroCharacter; success: boolean } {
  const active = hero.criticalInjuries ?? [];
  if (injuryIndex < 0 || injuryIndex >= active.length) {
    return { hero, success: false };
  }

  const injury = active[injuryIndex];
  const def = injuries[injury.injuryId];
  if (!def || !def.recoverable) {
    return { hero, success: false };
  }

  if (checkSuccess) {
    // Treatment successful -- remove the injury
    return { hero: removeCriticalInjury(hero, injuryIndex), success: true };
  }

  // Treatment failed -- mark as attempted
  const updatedInjuries = [...active];
  updatedInjuries[injuryIndex] = { ...injury, treatmentAttempted: true };
  return {
    hero: { ...hero, criticalInjuries: updatedInjuries },
    success: false,
  };
}

/**
 * Pay credits for professional medical treatment (always succeeds).
 * Returns the updated campaign state, or throws if insufficient credits.
 */
export function professionalTreatment(
  campaign: CampaignState,
  heroId: string,
  injuryIndex: number,
  injuries: Record<string, CriticalInjuryDefinition>,
): CampaignState {
  const hero = campaign.heroes[heroId];
  if (!hero) throw new Error(`Hero ${heroId} not found`);

  const active = hero.criticalInjuries ?? [];
  if (injuryIndex < 0 || injuryIndex >= active.length) {
    throw new Error(`Invalid injury index ${injuryIndex}`);
  }

  const def = injuries[active[injuryIndex].injuryId];
  if (!def) throw new Error(`Injury definition not found: ${active[injuryIndex].injuryId}`);
  if (!def.recoverable) throw new Error(`Injury ${def.name} cannot be treated`);

  if (campaign.credits < def.treatmentCost) {
    throw new Error(`Insufficient credits: need ${def.treatmentCost}, have ${campaign.credits}`);
  }

  const updatedHero = removeCriticalInjury(hero, injuryIndex);

  return {
    ...campaign,
    credits: campaign.credits - def.treatmentCost,
    heroes: {
      ...campaign.heroes,
      [heroId]: updatedHero,
    },
  };
}

/**
 * Process natural recovery for all heroes' critical injuries.
 * Called during completeMission for heroes that were not deployed.
 * Injuries with naturalRecoveryMissions > 0 heal after resting that many missions.
 */
export function processNaturalRecovery(
  hero: HeroCharacter,
  wasDeployed: boolean,
  injuries: Record<string, CriticalInjuryDefinition>,
): HeroCharacter {
  const active = hero.criticalInjuries ?? [];
  if (active.length === 0) return hero;

  const updatedInjuries: ActiveCriticalInjury[] = [];
  for (const injury of active) {
    const def = injuries[injury.injuryId];
    if (!def) {
      updatedInjuries.push(injury);
      continue;
    }

    const newMissionsRested = wasDeployed ? 0 : injury.missionsRested + 1;

    // Check for natural recovery
    if (
      !wasDeployed &&
      def.naturalRecoveryMissions > 0 &&
      newMissionsRested >= def.naturalRecoveryMissions
    ) {
      // Injury naturally heals -- don't add it to updated list
      continue;
    }

    updatedInjuries.push({
      ...injury,
      missionsRested: newMissionsRested,
    });
  }

  return {
    ...hero,
    criticalInjuries: updatedInjuries,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function sumEffectValues(
  hero: HeroCharacter,
  injuries: Record<string, CriticalInjuryDefinition>,
  effectType: CriticalInjuryEffect['type'],
): number {
  let total = 0;
  for (const active of hero.criticalInjuries ?? []) {
    const def = injuries[active.injuryId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.type === effectType) {
        total += effect.value;
      }
    }
  }
  return total;
}

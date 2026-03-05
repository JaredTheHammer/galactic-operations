/**
 * species-abilities.ts -- Species Ability Resolution for Galactic Operations
 *
 * Provides utility functions to query and apply species-specific mechanical
 * abilities during combat, activation, and skill checks.
 *
 * Hook points:
 * - combat-v2.ts / buildCombatPools: first_attack_bonus (Rodian), wounded_melee_bonus (Wookiee), soak_bonus (Droid)
 * - turn-machine-v2.ts / resetForActivation: regeneration (Trandoshan)
 * - turn-machine-v2.ts / executeActionV2 (Rest): bonus_strain_recovery (Human)
 * - social-phase.ts: social_skill_upgrade (Twi'lek), skill_bonus (Bothan)
 * - condition application: condition_immunity (Wookiee Fear, Droid Poison)
 */

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  SpeciesDefinition,
  SpeciesAbility,
  SpeciesAbilityEffect,
} from './types.js';

// ============================================================================
// SPECIES LOOKUP
// ============================================================================

/**
 * Get the species definition for a hero figure.
 * Returns null if figure is not a hero or species not found.
 */
export function getHeroSpecies(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): SpeciesDefinition | null {
  if (figure.entityType !== 'hero') return null;
  const hero = gameState.heroes[figure.entityId];
  if (!hero) return null;
  return gameData?.species?.[hero.species] ?? null;
}

/**
 * Get all abilities for a hero's species.
 */
export function getSpeciesAbilities(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): SpeciesAbility[] {
  const species = getHeroSpecies(figure, gameState, gameData);
  return species?.abilities ?? [];
}

/**
 * Check if a hero has a specific species ability effect type.
 */
export function hasSpeciesAbility(
  hero: HeroCharacter,
  gameData: GameData,
  effectType: SpeciesAbilityEffect['type'],
): boolean {
  const species = gameData?.species?.[hero.species];
  if (!species?.abilities) return false;
  return species.abilities.some(a => a.effect.type === effectType);
}

/**
 * Get the value of a specific species ability effect.
 * Returns 0 if the hero doesn't have the ability.
 */
function getEffectValue(
  hero: HeroCharacter,
  gameData: GameData,
  effectType: SpeciesAbilityEffect['type'],
): number {
  const species = gameData?.species?.[hero.species];
  if (!species?.abilities) return 0;
  const ability = species.abilities.find(a => a.effect.type === effectType);
  if (!ability) return 0;
  return (ability.effect as any).value ?? 0;
}

// ============================================================================
// COMBAT MODIFIERS
// ============================================================================

/**
 * Get bonus attack dice from species abilities.
 * - Rodian Expert Tracker: +1 Ability die on first attack per activation
 */
export function getSpeciesAttackBonus(
  figure: Figure,
  hero: HeroCharacter,
  gameData: GameData,
): number {
  // Rodian: +1 ability die on first attack
  if (!figure.hasAttackedThisActivation) {
    return getEffectValue(hero, gameData, 'first_attack_bonus');
  }
  return 0;
}

/**
 * Get bonus melee damage from species abilities when wounded.
 * - Wookiee Rage: +1 damage on melee/Brawl when wounded
 */
export function getSpeciesWoundedMeleeBonus(
  figure: Figure,
  hero: HeroCharacter,
  gameData: GameData,
  weaponSkill: string,
): number {
  if (!figure.isWounded) return 0;
  const isMelee = weaponSkill === 'melee' || weaponSkill === 'Melee'
    || weaponSkill === 'brawl' || weaponSkill === 'Brawl';
  if (!isMelee) return 0;
  return getEffectValue(hero, gameData, 'wounded_melee_bonus');
}

/**
 * Get bonus soak from species abilities.
 * - Droid Enduring Chassis: +1 soak
 */
export function getSpeciesSoakBonus(
  hero: HeroCharacter,
  gameData: GameData,
): number {
  return getEffectValue(hero, gameData, 'soak_bonus');
}

// ============================================================================
// ACTIVATION / STATUS PHASE
// ============================================================================

/**
 * Get wound regeneration amount from species abilities.
 * - Trandoshan Regeneration: recover 1 wound at start of activation
 * Only applies if the figure has wounds > 0.
 */
export function getSpeciesRegeneration(
  figure: Figure,
  hero: HeroCharacter,
  gameData: GameData,
): number {
  if (figure.woundsCurrent <= 0) return 0;
  return getEffectValue(hero, gameData, 'regeneration');
}

/**
 * Get bonus strain recovery from species abilities.
 * - Human Adaptable: +1 strain recovery on Rest actions
 */
export function getSpeciesBonusStrainRecovery(
  hero: HeroCharacter,
  gameData: GameData,
): number {
  return getEffectValue(hero, gameData, 'bonus_strain_recovery');
}

// ============================================================================
// CONDITION IMMUNITY
// ============================================================================

/**
 * Check if a hero is immune to a specific condition.
 * - Wookiee: immune to Fear
 * - Droid: immune to Poison and Fear
 */
export function isImmuneToCondition(
  hero: HeroCharacter,
  gameData: GameData,
  condition: string,
): boolean {
  const species = gameData?.species?.[hero.species];
  if (!species?.abilities) return false;
  return species.abilities.some(
    a => a.effect.type === 'condition_immunity'
      && (a.effect as any).condition === condition,
  );
}

/**
 * Filter conditions to remove any the hero is immune to.
 */
export function filterImmuneConditions(
  hero: HeroCharacter,
  gameData: GameData,
  conditions: string[],
): string[] {
  return conditions.filter(c => !isImmuneToCondition(hero, gameData, c));
}

// ============================================================================
// SOCIAL / SKILL CHECK MODIFIERS
// ============================================================================

/**
 * Get bonus dice for social skill checks.
 * - Twi'lek Beguiling: upgrade pool once for social skills
 * - Bothan Convincing Demeanor: +1 ability die on specific skills
 */
export function getSpeciesSkillBonus(
  hero: HeroCharacter,
  gameData: GameData,
  skillId: string,
): { bonusAbility: number; bonusUpgrade: number } {
  const species = gameData?.species?.[hero.species];
  if (!species?.abilities) return { bonusAbility: 0, bonusUpgrade: 0 };

  let bonusAbility = 0;
  let bonusUpgrade = 0;

  for (const ability of species.abilities) {
    if (ability.effect.type === 'skill_bonus') {
      const effect = ability.effect;
      if (effect.skills.includes(skillId)) {
        bonusAbility += effect.value;
      }
    }
    if (ability.effect.type === 'social_skill_upgrade') {
      const socialSkills = ['charm', 'coercion', 'deception', 'leadership', 'negotiation'];
      if (socialSkills.includes(skillId)) {
        bonusUpgrade += (ability.effect as any).value ?? 0;
      }
    }
  }

  return { bonusAbility, bonusUpgrade };
}

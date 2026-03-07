/**
 * character-v2.ts -- v2 Character Model for Galactic Operations
 *
 * Implements hero creation pipeline, derived stat computation, skill check
 * resolution, XP advancement, talent pyramid validation, and character
 * validation.
 *
 * Depends on: dice-v2.ts for skill check rolling/resolution.
 * Pure functions, zero side effects.
 */

import type {
  ArmorDefinition,
  AttackPool,
  CareerDefinition,
  Characteristics,
  CharacteristicName,
  Condition,
  DefensePool,
  EquipmentLoadout,
  GameData,
  HeroCharacter,
  OpposedRollResult,
  SpecializationDefinition,
  SpeciesDefinition,
  TalentCard,
  TalentSlot,
  WeaponDefinition,
} from './types';

import {
  buildAttackPool,
  buildDefensePool,
  resolveOpposedCheck,
  rollAttackPool,
  resolveFromRolls,
  type RollFn,
  defaultRollFn,
} from './dice-v2';

// ============================================================================
// SKILL DEFINITIONS: CANONICAL SKILL LIST WITH CHARACTERISTIC MAPPINGS
// ============================================================================

export interface SkillDefinition {
  id: string;
  name: string;
  characteristic: CharacteristicName;
  type: 'combat' | 'general';
}

/**
 * Complete skill list from DESIGN_SPEC_V2.md Section 3.2.
 * Each skill maps to exactly one characteristic.
 */
export const SKILL_LIST: SkillDefinition[] = [
  // Combat skills
  { id: 'ranged-heavy',  name: 'Ranged (Heavy)',  characteristic: 'agility',    type: 'combat' },
  { id: 'ranged-light',  name: 'Ranged (Light)',  characteristic: 'agility',    type: 'combat' },
  { id: 'melee',         name: 'Melee',           characteristic: 'brawn',      type: 'combat' },
  { id: 'gunnery',       name: 'Gunnery',         characteristic: 'agility',    type: 'combat' },
  { id: 'brawl',         name: 'Brawl',           characteristic: 'brawn',      type: 'combat' },

  // General skills
  { id: 'athletics',     name: 'Athletics',       characteristic: 'brawn',      type: 'general' },
  { id: 'coordination',  name: 'Coordination',    characteristic: 'agility',    type: 'general' },
  { id: 'resilience',    name: 'Resilience',      characteristic: 'brawn',      type: 'general' },
  { id: 'perception',    name: 'Perception',      characteristic: 'cunning',    type: 'general' },
  { id: 'stealth',       name: 'Stealth',         characteristic: 'agility',    type: 'general' },
  { id: 'vigilance',     name: 'Vigilance',       characteristic: 'willpower',  type: 'general' },
  { id: 'cool',          name: 'Cool',            characteristic: 'presence',   type: 'general' },
  { id: 'discipline',    name: 'Discipline',      characteristic: 'willpower',  type: 'general' },
  { id: 'medicine',      name: 'Medicine',        characteristic: 'intellect',  type: 'general' },
  { id: 'mechanics',     name: 'Mechanics',       characteristic: 'intellect',  type: 'general' },
  { id: 'computers',     name: 'Computers',       characteristic: 'intellect',  type: 'general' },
  { id: 'leadership',    name: 'Leadership',      characteristic: 'presence',   type: 'general' },
  { id: 'deception',     name: 'Deception',       characteristic: 'cunning',    type: 'general' },
  { id: 'skulduggery',   name: 'Skulduggery',     characteristic: 'cunning',    type: 'general' },
  { id: 'streetwise',    name: 'Streetwise',      characteristic: 'cunning',    type: 'general' },
  { id: 'survival',      name: 'Survival',        characteristic: 'cunning',    type: 'general' },
  { id: 'charm',         name: 'Charm',           characteristic: 'presence',   type: 'general' },
  { id: 'negotiation',   name: 'Negotiation',     characteristic: 'presence',   type: 'general' },
  { id: 'coercion',      name: 'Coercion',        characteristic: 'willpower',  type: 'general' },
];

/** Skill ID -> SkillDefinition lookup map */
export const SKILL_MAP: Record<string, SkillDefinition> = Object.fromEntries(
  SKILL_LIST.map((s) => [s.id, s]),
);

/**
 * Get the governing characteristic for a skill.
 */
export function getSkillCharacteristic(skillId: string): CharacteristicName {
  const skill = SKILL_MAP[skillId];
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);
  return skill.characteristic;
}

// ============================================================================
// DERIVED STAT COMPUTATION
// ============================================================================

/**
 * Compute wound threshold: species woundBase + Brawn.
 */
export function computeWoundThreshold(
  species: SpeciesDefinition,
  characteristics: Characteristics,
): number {
  return species.woundBase + characteristics.brawn;
}

/**
 * Compute strain threshold: species strainBase + Willpower.
 */
export function computeStrainThreshold(
  species: SpeciesDefinition,
  characteristics: Characteristics,
): number {
  return species.strainBase + characteristics.willpower;
}

/**
 * Compute soak: Brawn + Resilience rank + armor soak bonus.
 */
export function computeSoak(
  characteristics: Characteristics,
  skills: Record<string, number>,
  armorSoakBonus: number = 0,
): number {
  const resilienceRank = skills['resilience'] ?? 0;
  return characteristics.brawn + resilienceRank + armorSoakBonus;
}

/**
 * Compute all derived stats for a hero, returning updated thresholds and soak.
 */
export function computeDerivedStats(
  hero: HeroCharacter,
  gameData: GameData,
): { woundThreshold: number; strainThreshold: number; soak: number } {
  const species = gameData.species[hero.species];
  if (!species) throw new Error(`Species not found: ${hero.species}`);

  let armorSoak = 0;
  if (hero.equipment.armor && gameData.armor[hero.equipment.armor]) {
    armorSoak = gameData.armor[hero.equipment.armor].soak;
  }

  // Apply talent modifiers (Toughened, Grit, etc.)
  const talentWoundBonus = computeTalentStatBonus(hero, gameData, 'woundThreshold');
  const talentStrainBonus = computeTalentStatBonus(hero, gameData, 'strainThreshold');

  return {
    woundThreshold:
      computeWoundThreshold(species, hero.characteristics) + talentWoundBonus,
    strainThreshold:
      computeStrainThreshold(species, hero.characteristics) + talentStrainBonus,
    soak: computeSoak(hero.characteristics, hero.skills, armorSoak),
  };
}

/**
 * Sum talent bonuses for a given stat (e.g., woundThreshold, strainThreshold).
 * Handles ranked talents (multiple purchases stack).
 */
function computeTalentStatBonus(
  hero: HeroCharacter,
  gameData: GameData,
  stat: string,
): number {
  let bonus = 0;

  for (const slot of hero.talents) {
    if (!slot.talentId) continue;

    const talent = findTalentCard(slot.talentId, hero, gameData);
    if (!talent) continue;

    if (
      talent.mechanicalEffect.type === 'modify_stat' &&
      talent.mechanicalEffect.stat === stat
    ) {
      bonus += (talent.mechanicalEffect.value as number) ?? 0;
    }
  }

  return bonus;
}

/**
 * Look up a talent card by ID from the hero's specializations.
 */
function findTalentCard(
  talentId: string,
  hero: HeroCharacter,
  gameData: GameData,
): TalentCard | null {
  for (const specId of hero.specializations) {
    const spec = gameData.specializations[specId];
    if (!spec) continue;
    const card = spec.talents.find((t) => t.id === talentId);
    if (card) return card;
  }
  return null;
}

// ============================================================================
// HERO CREATION PIPELINE
// ============================================================================

export interface HeroCreationInput {
  name: string;
  speciesId: string;
  careerId: string;
  specializationId: string;
  /** Optional initial skill ranks to assign (from starting XP) */
  initialSkills?: Record<string, number>;
  /** Optional characteristic increases (from starting XP) */
  characteristicIncreases?: Partial<Characteristics>;
}

/**
 * Create a new HeroCharacter from species + career + specialization selection.
 *
 * Returns a fully initialized hero with:
 * - Species base characteristics (+ any increases from starting XP)
 * - Empty talent pyramid (15 slots: 5/4/3/2/1)
 * - Derived stats computed
 * - Starting XP pool
 */
export function createHero(
  input: HeroCreationInput,
  gameData: GameData,
): HeroCharacter {
  const species = gameData.species[input.speciesId];
  if (!species) throw new Error(`Species not found: ${input.speciesId}`);

  const career = gameData.careers[input.careerId];
  if (!career) throw new Error(`Career not found: ${input.careerId}`);

  // Validate specialization belongs to career
  if (!career.specializations.includes(input.specializationId)) {
    throw new Error(
      `Specialization '${input.specializationId}' is not in career '${input.careerId}'. ` +
      `Valid: ${career.specializations.join(', ')}`,
    );
  }

  // Start from species base characteristics
  const characteristics: Characteristics = { ...species.characteristics };

  // Apply characteristic increases (from starting XP spend)
  if (input.characteristicIncreases) {
    for (const [key, increase] of Object.entries(input.characteristicIncreases)) {
      const charKey = key as CharacteristicName;
      characteristics[charKey] += increase;
    }
  }

  // Validate characteristic limits (max 5, no characteristic below 1)
  validateCharacteristics(characteristics);

  // Initialize skills
  const skills: Record<string, number> = {};
  if (input.initialSkills) {
    for (const [skillId, rank] of Object.entries(input.initialSkills)) {
      if (rank < 0 || rank > 5) {
        throw new Error(`Skill rank out of range [0-5]: ${skillId} = ${rank}`);
      }
      // At creation, skill ranks cannot exceed 2
      if (rank > 2) {
        throw new Error(
          `Skill rank at creation cannot exceed 2: ${skillId} = ${rank}`,
        );
      }
      skills[skillId] = rank;
    }
  }

  // Build empty talent pyramid: 5 + 4 + 3 + 2 + 1 = 15 slots
  const talents: TalentSlot[] = buildEmptyPyramid();

  // Compute derived stats
  const armorSoak = 0; // no armor at creation
  const woundThreshold = computeWoundThreshold(species, characteristics);
  const strainThreshold = computeStrainThreshold(species, characteristics);
  const soak = computeSoak(characteristics, skills, armorSoak);

  return {
    id: `hero-${input.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name: input.name,
    species: input.speciesId,
    career: input.careerId,
    specializations: [input.specializationId],
    characteristics,
    skills,
    talents,
    wounds: { current: 0, threshold: woundThreshold },
    strain: { current: 0, threshold: strainThreshold },
    soak,
    equipment: {
      primaryWeapon: null,
      secondaryWeapon: null,
      armor: null,
      gear: [],
    },
    xp: { total: species.startingXP, available: species.startingXP },
    abilityPoints: { total: 0, available: 0 },
  };
}

/**
 * Build an empty 15-slot talent pyramid (5/4/3/2/1).
 */
function buildEmptyPyramid(): TalentSlot[] {
  const slots: TalentSlot[] = [];
  const slotsPerTier = [5, 4, 3, 2, 1];
  for (let tier = 1; tier <= 5; tier++) {
    for (let pos = 0; pos < slotsPerTier[tier - 1]; pos++) {
      slots.push({ tier: tier as 1 | 2 | 3 | 4 | 5, position: pos, talentId: null });
    }
  }
  return slots;
}

// ============================================================================
// CHARACTERISTIC VALIDATION
// ============================================================================

/**
 * Validate that characteristics are within legal bounds.
 * Range: 1-5 per characteristic.
 */
export function validateCharacteristics(chars: Characteristics): void {
  for (const [key, value] of Object.entries(chars)) {
    if (value < 1) {
      throw new Error(`Characteristic '${key}' below minimum (1): ${value}`);
    }
    if (value > 5) {
      throw new Error(`Characteristic '${key}' above maximum (5): ${value}`);
    }
  }
}

// ============================================================================
// XP COSTS
// ============================================================================

/** Talent XP cost by tier: 5/10/15/20/25 */
export const TALENT_XP_COST: Record<number, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
};

/**
 * Compute XP cost to purchase a skill rank.
 * Career skill:     5 * newRank
 * Non-career skill: 5 * newRank + 5
 */
export function skillRankXPCost(newRank: number, isCareerSkill: boolean): number {
  const base = 5 * newRank;
  return isCareerSkill ? base : base + 5;
}

/**
 * Determine if a skill is a career skill for a given hero.
 * Career skills include the career's 8 skills plus any bonus career skills
 * from specializations.
 */
export function isCareerSkill(
  skillId: string,
  hero: HeroCharacter,
  gameData: GameData,
): boolean {
  const career = gameData.careers[hero.career];
  if (career && career.careerSkills.includes(skillId)) return true;

  // Check bonus career skills from specializations
  for (const specId of hero.specializations) {
    const spec = gameData.specializations[specId];
    if (spec && spec.bonusCareerSkills.includes(skillId)) return true;
  }

  return false;
}

/**
 * Total XP cost to fill an entire talent pyramid (15 cards): 175 XP.
 */
export const FULL_PYRAMID_XP_COST = 5 * 5 + 4 * 10 + 3 * 15 + 2 * 20 + 1 * 25; // 175

// ============================================================================
// TALENT PYRAMID VALIDATION
// ============================================================================

export interface TalentValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a hero's talent pyramid against the rules:
 * 1. Wide Base Rule: cannot fill 4th Tier 2 slot until all 5 Tier 1 slots are filled
 * 2. Max slots per tier: 5/4/3/2/1
 * 3. No duplicate talents (unless ranked)
 * 4. Talent must belong to one of the hero's specializations
 */
export function validateTalentPyramid(
  hero: HeroCharacter,
  gameData: GameData,
): TalentValidationResult {
  const errors: string[] = [];
  const filledByTier: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const maxByTier: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
  const talentCounts: Record<string, number> = {};

  for (const slot of hero.talents) {
    if (!slot.talentId) continue;

    filledByTier[slot.tier] = (filledByTier[slot.tier] ?? 0) + 1;
    talentCounts[slot.talentId] = (talentCounts[slot.talentId] ?? 0) + 1;

    // Check talent exists in one of the hero's specializations
    const card = findTalentCard(slot.talentId, hero, gameData);
    if (!card) {
      errors.push(
        `Talent '${slot.talentId}' not found in any of hero's specializations`,
      );
      continue;
    }

    // Check talent tier matches slot tier
    if (card.tier !== slot.tier) {
      errors.push(
        `Talent '${card.name}' is Tier ${card.tier} but placed in Tier ${slot.tier} slot`,
      );
    }

    // Check for non-ranked duplicates
    if (!card.ranked && talentCounts[slot.talentId] > 1) {
      errors.push(
        `Non-ranked talent '${card.name}' cannot be taken more than once`,
      );
    }
  }

  // Check max slots per tier
  for (let tier = 1; tier <= 5; tier++) {
    if (filledByTier[tier] > maxByTier[tier]) {
      errors.push(
        `Tier ${tier} has ${filledByTier[tier]} talents but max is ${maxByTier[tier]}`,
      );
    }
  }

  // Wide Base Rule: Tier 2 count >= 4 requires all 5 Tier 1 slots filled
  if (filledByTier[2] >= 4 && filledByTier[1] < 5) {
    errors.push(
      'Wide Base Rule: cannot fill 4th Tier 2 slot until all 5 Tier 1 slots are filled',
    );
  }

  // Tier N+1 requires at least 1 talent at Tier N
  for (let tier = 2; tier <= 5; tier++) {
    if (filledByTier[tier] > 0 && filledByTier[tier - 1] === 0) {
      errors.push(
        `Cannot have Tier ${tier} talents without any Tier ${tier - 1} talents`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// CHARACTER VALIDATION
// ============================================================================

export interface CharacterValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Full validation of a HeroCharacter.
 */
export function validateHero(
  hero: HeroCharacter,
  gameData: GameData,
): CharacterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Species exists
  if (!gameData.species[hero.species]) {
    errors.push(`Unknown species: ${hero.species}`);
  }

  // Career exists
  if (!gameData.careers[hero.career]) {
    errors.push(`Unknown career: ${hero.career}`);
  }

  // Specializations exist and first belongs to career
  if (hero.specializations.length === 0) {
    errors.push('Hero must have at least one specialization');
  } else {
    const career = gameData.careers[hero.career];
    if (career && !career.specializations.includes(hero.specializations[0])) {
      errors.push(
        `Primary specialization '${hero.specializations[0]}' does not belong to career '${hero.career}'`,
      );
    }
  }

  // Characteristics in range
  try {
    validateCharacteristics(hero.characteristics);
  } catch (e) {
    errors.push((e as Error).message);
  }

  // Skills in range [0, 5]
  for (const [skillId, rank] of Object.entries(hero.skills)) {
    if (rank < 0 || rank > 5) {
      errors.push(`Skill '${skillId}' rank out of range [0-5]: ${rank}`);
    }
  }

  // Wound/strain thresholds should be positive
  if (hero.wounds.threshold <= 0) {
    errors.push(`Wound threshold must be positive: ${hero.wounds.threshold}`);
  }
  if (hero.strain.threshold <= 0) {
    errors.push(`Strain threshold must be positive: ${hero.strain.threshold}`);
  }

  // Current wounds/strain should not exceed threshold
  if (hero.wounds.current > hero.wounds.threshold) {
    warnings.push(
      `Current wounds (${hero.wounds.current}) exceed threshold (${hero.wounds.threshold})`,
    );
  }
  if (hero.strain.current > hero.strain.threshold) {
    warnings.push(
      `Current strain (${hero.strain.current}) exceed threshold (${hero.strain.threshold})`,
    );
  }

  // XP sanity: available should not exceed total
  if (hero.xp.available > hero.xp.total) {
    errors.push(
      `Available XP (${hero.xp.available}) exceeds total XP (${hero.xp.total})`,
    );
  }

  // AP sanity: available should not exceed total
  if (hero.abilityPoints && hero.abilityPoints.available > hero.abilityPoints.total) {
    errors.push(
      `Available AP (${hero.abilityPoints.available}) exceeds total AP (${hero.abilityPoints.total})`,
    );
  }

  // Talent pyramid validation
  const talentResult = validateTalentPyramid(hero, gameData);
  errors.push(...talentResult.errors);

  // Talent pyramid slot count
  if (hero.talents.length !== 15) {
    warnings.push(`Expected 15 talent slots, found ${hero.talents.length}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// SKILL CHECK RESOLUTION
// ============================================================================

/**
 * Result of a skill check.
 */
export interface SkillCheckResult {
  pool: AttackPool;
  rolls: OpposedRollResult | null;
  netSuccesses: number;
  isSuccess: boolean;
  netAdvantages: number;
  triumphs: number;
  despairs: number;
}

/**
 * Resolve an unopposed skill check.
 *
 * Pool: max(characteristic, skillRank) dice, min(characteristic, skillRank) upgrades.
 * Difficulty: fixed number of purple dice (default 2 for Average difficulty).
 * Success: net successes >= 1.
 */
export function resolveSkillCheck(
  hero: HeroCharacter,
  skillId: string,
  difficulty: number = 2,
  rollFn: RollFn = defaultRollFn,
  /** If true, apply -1 to characteristic (min 1) per wounded hero mechanic */
  isWounded: boolean = false,
): SkillCheckResult {
  const skillDef = SKILL_MAP[skillId];
  if (!skillDef) throw new Error(`Unknown skill: ${skillId}`);

  let charValue = hero.characteristics[skillDef.characteristic];
  if (isWounded) charValue = Math.max(1, charValue - 1);
  const skillRank = hero.skills[skillId] ?? 0;

  const pool = buildAttackPool(charValue, skillRank);
  const defensePool: DefensePool = { difficulty, challenge: 0 };

  const result = resolveOpposedCheck(pool, defensePool, rollFn);

  return {
    pool,
    rolls: result,
    netSuccesses: result.netSuccesses,
    isSuccess: result.isHit,
    netAdvantages: result.netAdvantages,
    triumphs: result.totalTriumphs,
    despairs: result.totalDespairs,
  };
}

/**
 * Resolve an opposed skill check (e.g., Deception vs Discipline).
 *
 * Active: hero's skill pool (characteristic + rank).
 * Opposing: opponent's characteristic + skill -> defense pool (purple/red dice).
 */
export function resolveOpposedSkillCheck(
  activeHero: HeroCharacter,
  activeSkillId: string,
  opponentCharacteristic: number,
  opponentSkillRank: number,
  rollFn: RollFn = defaultRollFn,
  /** If true, apply -1 to characteristic (min 1) per wounded hero mechanic */
  isWounded: boolean = false,
): SkillCheckResult {
  const skillDef = SKILL_MAP[activeSkillId];
  if (!skillDef) throw new Error(`Unknown skill: ${activeSkillId}`);

  let charValue = activeHero.characteristics[skillDef.characteristic];
  if (isWounded) charValue = Math.max(1, charValue - 1);
  const skillRank = activeHero.skills[activeSkillId] ?? 0;

  const pool = buildAttackPool(charValue, skillRank);
  const defensePool = buildDefensePool(opponentCharacteristic, opponentSkillRank);

  const result = resolveOpposedCheck(pool, defensePool, rollFn);

  return {
    pool,
    rolls: result,
    netSuccesses: result.netSuccesses,
    isSuccess: result.isHit,
    netAdvantages: result.netAdvantages,
    triumphs: result.totalTriumphs,
    despairs: result.totalDespairs,
  };
}

// ============================================================================
// XP ADVANCEMENT
// ============================================================================

/**
 * Purchase a skill rank for a hero, deducting XP.
 * Returns a new HeroCharacter with the updated skill and XP.
 */
export function purchaseSkillRank(
  hero: HeroCharacter,
  skillId: string,
  gameData: GameData,
): HeroCharacter {
  const currentRank = hero.skills[skillId] ?? 0;
  const newRank = currentRank + 1;

  if (newRank > 5) {
    throw new Error(`Skill '${skillId}' already at maximum rank (5)`);
  }

  const isCareer = isCareerSkill(skillId, hero, gameData);
  const cost = skillRankXPCost(newRank, isCareer);

  if (hero.xp.available < cost) {
    throw new Error(
      `Not enough XP: need ${cost}, have ${hero.xp.available}`,
    );
  }

  const newSkills = { ...hero.skills, [skillId]: newRank };

  // Recompute soak if resilience changed
  const newSoak = skillId === 'resilience'
    ? hero.soak + 1 // resilience rank directly adds to soak
    : hero.soak;

  return {
    ...hero,
    skills: newSkills,
    soak: newSoak,
    xp: { total: hero.xp.total, available: hero.xp.available - cost },
  };
}

/**
 * Purchase a talent for a hero, placing it in the specified pyramid slot.
 * Returns a new HeroCharacter with the updated talent and XP.
 */
export function purchaseTalent(
  hero: HeroCharacter,
  talentId: string,
  tier: 1 | 2 | 3 | 4 | 5,
  position: number,
  gameData: GameData,
): HeroCharacter {
  // Find the talent card
  const card = findTalentCard(talentId, hero, gameData);
  if (!card) {
    throw new Error(
      `Talent '${talentId}' not found in hero's specializations`,
    );
  }

  if (card.tier !== tier) {
    throw new Error(
      `Talent '${card.name}' is Tier ${card.tier}, cannot place in Tier ${tier} slot`,
    );
  }

  const cost = TALENT_XP_COST[tier];
  if (hero.xp.available < cost) {
    throw new Error(
      `Not enough XP: need ${cost}, have ${hero.xp.available}`,
    );
  }

  // Find the slot
  const slotIndex = hero.talents.findIndex(
    (s) => s.tier === tier && s.position === position,
  );
  if (slotIndex === -1) {
    throw new Error(`No slot at Tier ${tier}, position ${position}`);
  }
  if (hero.talents[slotIndex].talentId !== null) {
    throw new Error(
      `Slot at Tier ${tier}, position ${position} is already filled`,
    );
  }

  // Apply
  const newTalents = hero.talents.map((s, i) =>
    i === slotIndex ? { ...s, talentId } : s,
  );

  let newHero: HeroCharacter = {
    ...hero,
    talents: newTalents,
    xp: { total: hero.xp.total, available: hero.xp.available - cost },
  };

  // Apply passive talent effects immediately
  if (card.mechanicalEffect.type === 'modify_stat') {
    newHero = applyTalentStatModifier(newHero, card);
  } else if (card.mechanicalEffect.type === 'modify_characteristic') {
    newHero = applyTalentCharacteristicModifier(newHero, card);
  }

  return newHero;
}

/**
 * Apply a modify_stat talent effect to hero's derived stats.
 */
function applyTalentStatModifier(
  hero: HeroCharacter,
  talent: TalentCard,
): HeroCharacter {
  const effect = talent.mechanicalEffect;
  if (effect.type !== 'modify_stat') return hero;

  const value = (effect.value as number) ?? 0;

  switch (effect.stat) {
    case 'woundThreshold':
      return {
        ...hero,
        wounds: {
          ...hero.wounds,
          threshold: hero.wounds.threshold + value,
        },
      };
    case 'strainThreshold':
      return {
        ...hero,
        strain: {
          ...hero.strain,
          threshold: hero.strain.threshold + value,
        },
      };
    case 'soak':
      // Soak bonuses from talents (Enduring, Armor Master) are applied at combat time
      // via getTalentSoakBonus in talent-v2.ts, not baked into hero.soak here,
      // because conditional soak (e.g., Armor Master) depends on runtime equipment state.
      return hero;
    default:
      return hero;
  }
}

/**
 * Apply a modify_characteristic talent effect (Dedication).
 * Permanently increases one characteristic by the given value.
 */
function applyTalentCharacteristicModifier(
  hero: HeroCharacter,
  talent: TalentCard,
): HeroCharacter {
  const effect = talent.mechanicalEffect;
  if (effect.type !== 'modify_characteristic') return hero;

  const charName = effect.characteristic as keyof typeof hero.characteristics;
  const value = (effect.value as number) ?? 0;

  if (!(charName in hero.characteristics)) return hero;

  return {
    ...hero,
    characteristics: {
      ...hero.characteristics,
      [charName]: hero.characteristics[charName] + value,
    },
  };
}

/**
 * Unlock an additional specialization for a hero.
 * In-career: 10 XP. Out-of-career: 20 XP.
 */
export function unlockSpecialization(
  hero: HeroCharacter,
  specializationId: string,
  gameData: GameData,
): HeroCharacter {
  if (hero.specializations.includes(specializationId)) {
    throw new Error(`Already has specialization: ${specializationId}`);
  }

  // Determine if in-career or out-of-career
  const career = gameData.careers[hero.career];
  const isInCareer = career?.specializations.includes(specializationId) ?? false;
  const cost = isInCareer ? 10 : 20;

  if (hero.xp.available < cost) {
    throw new Error(
      `Not enough XP: need ${cost}, have ${hero.xp.available}`,
    );
  }

  return {
    ...hero,
    specializations: [...hero.specializations, specializationId],
    xp: { total: hero.xp.total, available: hero.xp.available - cost },
  };
}

// ============================================================================
// ABILITY POINTS
// ============================================================================

/**
 * Award Ability Points to a hero (e.g. after mission completion).
 * Returns a new HeroCharacter with updated AP totals.
 */
export function awardAbilityPoints(
  hero: HeroCharacter,
  amount: number,
): HeroCharacter {
  if (amount < 0) throw new Error('Cannot award negative AP');
  const ap = hero.abilityPoints ?? { total: 0, available: 0 };
  return {
    ...hero,
    abilityPoints: {
      total: ap.total + amount,
      available: ap.available + amount,
    },
  };
}

/**
 * Spend Ability Points on a purchase (signature ability, faction perk, etc.).
 * Returns a new HeroCharacter with reduced available AP.
 */
export function spendAbilityPoints(
  hero: HeroCharacter,
  cost: number,
): HeroCharacter {
  if (cost <= 0) throw new Error('AP cost must be positive');
  const ap = hero.abilityPoints ?? { total: 0, available: 0 };
  if (ap.available < cost) {
    throw new Error(
      `Not enough AP: need ${cost}, have ${ap.available}`,
    );
  }
  return {
    ...hero,
    abilityPoints: {
      total: ap.total,
      available: ap.available - cost,
    },
  };
}

// EQUIPMENT MANAGEMENT
// ============================================================================

export type EquipmentSlot = 'primaryWeapon' | 'secondaryWeapon' | 'armor';

/**
 * Equip an item to a hero's equipment slot. Returns the updated hero with
 * recomputed soak (if armor changed) and the ID of any item that was
 * previously in that slot (null if the slot was empty).
 *
 * Validates that the item exists in gameData and that the slot/item type match:
 * - primaryWeapon / secondaryWeapon slots accept weapon IDs
 * - armor slot accepts armor IDs
 */
export function equipItem(
  hero: HeroCharacter,
  slot: EquipmentSlot,
  itemId: string,
  gameData: GameData,
): { hero: HeroCharacter; previousItemId: string | null } {
  if (slot === 'armor') {
    const armorDef = gameData.armor[itemId];
    if (!armorDef) throw new Error(`Armor not found: ${itemId}`);
    return equipArmor(hero, itemId, armorDef, gameData);
  }

  // Weapon slot
  const weaponDef = gameData.weapons[itemId];
  if (!weaponDef) throw new Error(`Weapon not found: ${itemId}`);
  return equipWeapon(hero, slot, itemId, gameData);
}

function equipWeapon(
  hero: HeroCharacter,
  slot: 'primaryWeapon' | 'secondaryWeapon',
  weaponId: string,
  gameData: GameData,
): { hero: HeroCharacter; previousItemId: string | null } {
  const previousItemId = hero.equipment[slot];
  return {
    hero: {
      ...hero,
      equipment: {
        ...hero.equipment,
        [slot]: weaponId,
      },
    },
    previousItemId,
  };
}

function equipArmor(
  hero: HeroCharacter,
  armorId: string,
  armorDef: ArmorDefinition,
  gameData: GameData,
): { hero: HeroCharacter; previousItemId: string | null } {
  const previousItemId = hero.equipment.armor;
  const newHero: HeroCharacter = {
    ...hero,
    equipment: {
      ...hero.equipment,
      armor: armorId,
    },
  };
  // Recompute soak with new armor
  const derived = computeDerivedStats(newHero, gameData);
  return {
    hero: { ...newHero, soak: derived.soak },
    previousItemId,
  };
}

/**
 * Remove the item from a hero's equipment slot, returning it to inventory.
 * Returns the updated hero and the unequipped item ID (null if slot was empty).
 */
export function unequipItem(
  hero: HeroCharacter,
  slot: EquipmentSlot,
  gameData: GameData,
): { hero: HeroCharacter; removedItemId: string | null } {
  const removedItemId = hero.equipment[slot];
  if (!removedItemId) {
    return { hero, removedItemId: null };
  }

  const newHero: HeroCharacter = {
    ...hero,
    equipment: {
      ...hero.equipment,
      [slot]: null,
    },
  };

  // Recompute soak if armor was removed
  if (slot === 'armor') {
    const derived = computeDerivedStats(newHero, gameData);
    return { hero: { ...newHero, soak: derived.soak }, removedItemId };
  }

  return { hero: newHero, removedItemId };
}

// ============================================================================
// INITIATIVE
// ============================================================================

/**
 * Roll initiative for a hero using Cool (voluntary) or Vigilance (forced).
 * Returns the number of net successes (used for ordering).
 */
export function rollInitiative(
  hero: HeroCharacter,
  type: 'cool' | 'vigilance',
  rollFn: RollFn = defaultRollFn,
): { successes: number; advantages: number } {
  const skillId = type;
  const skillDef = SKILL_MAP[skillId];
  if (!skillDef) throw new Error(`Unknown initiative skill: ${skillId}`);

  const charValue = hero.characteristics[skillDef.characteristic];
  const skillRank = hero.skills[skillId] ?? 0;

  const pool = buildAttackPool(charValue, skillRank);
  const rolls = rollAttackPool(pool, rollFn);

  let successes = 0;
  let advantages = 0;
  for (const r of rolls) {
    successes += r.successes;
    advantages += r.advantages + r.triumphs;
  }

  return { successes, advantages };
}

/**
 * Comprehensive tests for the v2 character model.
 *
 * Tests cover: skill definitions, derived stats, hero creation, validation,
 * XP costs, talent pyramid, skill checks, advancement, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  SKILL_LIST,
  SKILL_MAP,
  getSkillCharacteristic,
  computeWoundThreshold,
  computeStrainThreshold,
  computeSoak,
  computeDerivedStats,
  createHero,
  validateCharacteristics,
  validateTalentPyramid,
  validateHero,
  skillRankXPCost,
  isCareerSkill,
  TALENT_XP_COST,
  FULL_PYRAMID_XP_COST,
  resolveSkillCheck,
  resolveOpposedSkillCheck,
  purchaseSkillRank,
  purchaseTalent,
  unlockSpecialization,
  rollInitiative,
  awardAbilityPoints,
  spendAbilityPoints,
  type HeroCreationInput,
} from '../src/character-v2.js';

import type { RollFn } from '../src/dice-v2.js';

import type {
  Characteristics,
  GameData,
  HeroCharacter,
  SpeciesDefinition,
  CareerDefinition,
  SpecializationDefinition,
  TalentCard,
  TalentSlot,
  ArmorDefinition,
  WeaponDefinition,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function seqRoll(values: number[]): RollFn {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('seqRoll exhausted');
    return values[i++];
  };
}

function constRoll(value: number): RollFn {
  return () => value;
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeSpecies(overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    id: 'human',
    name: 'Human',
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    woundBase: 10,
    strainBase: 10,
    speed: 4,
    startingXP: 110,
    specialAbility: null,
    description: 'Versatile.',
    ...overrides,
  };
}

function makeCareer(overrides: Partial<CareerDefinition> = {}): CareerDefinition {
  return {
    id: 'hired-gun',
    name: 'Hired Gun',
    description: 'Combat specialist.',
    careerSkills: [
      'athletics', 'brawl', 'discipline', 'melee',
      'ranged-heavy', 'ranged-light', 'resilience', 'vigilance',
    ],
    specializations: ['mercenary', 'bodyguard', 'demolitionist'],
    ...overrides,
  };
}

function makeTalentCard(overrides: Partial<TalentCard> = {}): TalentCard {
  return {
    id: 'merc-t1-01',
    name: 'Toughened',
    tier: 1,
    type: 'passive',
    activation: 'passive',
    ranked: true,
    description: 'Increase Wound Threshold by 2.',
    mechanicalEffect: { type: 'modify_stat', stat: 'woundThreshold', value: 2, perRank: true },
    ...overrides,
  };
}

function makeSpec(overrides: Partial<SpecializationDefinition & { talents: TalentCard[] }> = {}): SpecializationDefinition & { talents: TalentCard[] } {
  return {
    id: 'mercenary',
    name: 'Mercenary',
    career: 'hired-gun',
    description: 'Professional soldier.',
    bonusCareerSkills: ['ranged-heavy', 'athletics', 'resilience', 'vigilance'],
    capstoneCharacteristics: ['brawn', 'agility'],
    talents: [
      makeTalentCard(),
      makeTalentCard({ id: 'merc-t1-02', name: 'Grit', mechanicalEffect: { type: 'modify_stat', stat: 'strainThreshold', value: 1, perRank: true } }),
      makeTalentCard({ id: 'merc-t1-03', name: 'Second Wind', ranked: true, tier: 1, mechanicalEffect: { type: 'recover_strain', value: 2 } }),
      makeTalentCard({ id: 'merc-t1-04', name: 'Quick Draw', ranked: false, tier: 1, mechanicalEffect: { type: 'free_maneuver', action: 'draw_weapon' } }),
      makeTalentCard({ id: 'merc-t1-05', name: 'Brace', tier: 1, mechanicalEffect: { type: 'remove_setback' } }),
      makeTalentCard({ id: 'merc-t2-01', name: 'Lethal Blows', tier: 2, mechanicalEffect: { type: 'bonus_crit', value: 10 } }),
      makeTalentCard({ id: 'merc-t2-02', name: 'Barrage', tier: 2, mechanicalEffect: { type: 'bonus_damage' } }),
      makeTalentCard({ id: 'merc-t3-01', name: 'Heroic Fortitude', tier: 3, mechanicalEffect: { type: 'modify_stat', stat: 'woundThreshold', value: 1 } }),
      makeTalentCard({ id: 'merc-t4-01', name: 'Deadly Accuracy', tier: 4, mechanicalEffect: { type: 'bonus_damage' } }),
      makeTalentCard({ id: 'merc-t5-01', name: 'Dedication', tier: 5, mechanicalEffect: { type: 'modify_characteristic' } }),
    ],
    ...overrides,
  };
}

function makeGameData(): GameData {
  return {
    dice: {} as any,
    species: { human: makeSpecies(), wookiee: makeSpecies({ id: 'wookiee', name: 'Wookiee', characteristics: { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 1, presence: 2 }, woundBase: 14, strainBase: 8, startingXP: 90 }) },
    careers: { 'hired-gun': makeCareer(), 'scoundrel': makeCareer({ id: 'scoundrel', name: 'Scoundrel', careerSkills: ['coordination', 'cool', 'deception', 'perception', 'ranged-light', 'skulduggery', 'stealth', 'streetwise'], specializations: ['smuggler', 'gunslinger', 'charmer'] }) },
    specializations: { mercenary: makeSpec() },
    weapons: {} as any,
    armor: {
      'padded-armor': { id: 'padded-armor', name: 'Padded Armor', soak: 2, defense: 0, encumbrance: 2, cost: 500, keywords: [] } as ArmorDefinition,
    },
    npcProfiles: {},
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-test',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, 'melee': 1, 'resilience': 1, 'athletics': 1 },
    talents: buildEmptyTestPyramid(),
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 110, available: 50 },
    ...overrides,
  };
}

function buildEmptyTestPyramid(): TalentSlot[] {
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
// SKILL DEFINITIONS
// ============================================================================

describe('Skill Definitions', () => {
  it('has correct number of skills', () => {
    // 5 combat + 19 general = 24
    expect(SKILL_LIST.length).toBe(24);
  });

  it('has 5 combat skills', () => {
    const combat = SKILL_LIST.filter((s) => s.type === 'combat');
    expect(combat.length).toBe(5);
  });

  it('maps every skill to a characteristic', () => {
    for (const skill of SKILL_LIST) {
      expect(['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence']).toContain(
        skill.characteristic,
      );
    }
  });

  it('SKILL_MAP provides O(1) lookup', () => {
    expect(SKILL_MAP['ranged-heavy'].characteristic).toBe('agility');
    expect(SKILL_MAP['melee'].characteristic).toBe('brawn');
    expect(SKILL_MAP['computers'].characteristic).toBe('intellect');
    expect(SKILL_MAP['perception'].characteristic).toBe('cunning');
    expect(SKILL_MAP['discipline'].characteristic).toBe('willpower');
    expect(SKILL_MAP['leadership'].characteristic).toBe('presence');
  });

  it('getSkillCharacteristic returns correct mapping', () => {
    expect(getSkillCharacteristic('athletics')).toBe('brawn');
    expect(getSkillCharacteristic('stealth')).toBe('agility');
  });

  it('getSkillCharacteristic throws on unknown skill', () => {
    expect(() => getSkillCharacteristic('fake-skill')).toThrow('Unknown skill');
  });
});

// ============================================================================
// DERIVED STATS
// ============================================================================

describe('Derived Stats', () => {
  it('computes wound threshold = species base + Brawn', () => {
    const species = makeSpecies({ woundBase: 10 });
    const chars: Characteristics = { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 };
    expect(computeWoundThreshold(species, chars)).toBe(13);
  });

  it('computes Wookiee wound threshold (high base + high Brawn)', () => {
    const wookiee = makeSpecies({ woundBase: 14 });
    const chars: Characteristics = { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 1, presence: 2 };
    expect(computeWoundThreshold(wookiee, chars)).toBe(17);
  });

  it('computes strain threshold = species base + Willpower', () => {
    const species = makeSpecies({ strainBase: 10 });
    const chars: Characteristics = { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 3, presence: 2 };
    expect(computeStrainThreshold(species, chars)).toBe(13);
  });

  it('computes soak = Brawn + Resilience rank + armor bonus', () => {
    const chars: Characteristics = { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 };
    const skills = { resilience: 2 };
    expect(computeSoak(chars, skills, 2)).toBe(7); // 3 + 2 + 2
  });

  it('computes soak with 0 Resilience and no armor', () => {
    const chars: Characteristics = { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 };
    expect(computeSoak(chars, {}, 0)).toBe(2); // just Brawn
  });

  it('computeDerivedStats integrates species, characteristics, and armor', () => {
    const gd = makeGameData();
    const hero = makeHero();
    const stats = computeDerivedStats(hero, gd);

    // Human wound: 10 + 3 (Brawn) = 13
    expect(stats.woundThreshold).toBe(13);
    // Human strain: 10 + 2 (Willpower) = 12
    expect(stats.strainThreshold).toBe(12);
    // Soak: 3 (Brawn) + 1 (Resilience) + 2 (padded armor) = 6
    expect(stats.soak).toBe(6);
  });

  it('computeDerivedStats includes talent bonuses', () => {
    const gd = makeGameData();
    // Hero with Toughened talent (+2 wound threshold)
    const hero = makeHero({
      talents: buildEmptyTestPyramid().map((s, i) =>
        i === 0 ? { ...s, talentId: 'merc-t1-01' } : s,
      ),
    });
    const stats = computeDerivedStats(hero, gd);
    expect(stats.woundThreshold).toBe(15); // 13 + 2 from Toughened
  });
});

// ============================================================================
// HERO CREATION
// ============================================================================

describe('createHero', () => {
  const gd = makeGameData();

  it('creates a basic human hired gun mercenary', () => {
    const hero = createHero({
      name: 'Rex Viper',
      speciesId: 'human',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
    }, gd);

    expect(hero.name).toBe('Rex Viper');
    expect(hero.species).toBe('human');
    expect(hero.career).toBe('hired-gun');
    expect(hero.specializations).toEqual(['mercenary']);
    expect(hero.characteristics).toEqual({ brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 });
    expect(hero.wounds.threshold).toBe(12); // 10 + 2
    expect(hero.strain.threshold).toBe(12); // 10 + 2
    expect(hero.soak).toBe(2); // Brawn 2, no resilience, no armor
    expect(hero.xp.total).toBe(110);
    expect(hero.xp.available).toBe(110);
  });

  it('applies characteristic increases from starting XP', () => {
    const hero = createHero({
      name: 'Buff Rex',
      speciesId: 'human',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
      characteristicIncreases: { brawn: 1, agility: 1 },
    }, gd);

    expect(hero.characteristics.brawn).toBe(3);
    expect(hero.characteristics.agility).toBe(3);
    expect(hero.wounds.threshold).toBe(13); // 10 + 3
  });

  it('applies initial skill ranks', () => {
    const hero = createHero({
      name: 'Skilled Rex',
      speciesId: 'human',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
      initialSkills: { 'ranged-heavy': 2, 'athletics': 1 },
    }, gd);

    expect(hero.skills['ranged-heavy']).toBe(2);
    expect(hero.skills['athletics']).toBe(1);
  });

  it('creates a Wookiee with correct derived stats', () => {
    const hero = createHero({
      name: 'Lowbacca',
      speciesId: 'wookiee',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
    }, gd);

    expect(hero.characteristics.brawn).toBe(3);
    expect(hero.wounds.threshold).toBe(17); // 14 + 3
    expect(hero.strain.threshold).toBe(9);  // 8 + 1
    expect(hero.xp.total).toBe(90);
  });

  it('builds 15-slot empty talent pyramid', () => {
    const hero = createHero({
      name: 'New Hero',
      speciesId: 'human',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
    }, gd);

    expect(hero.talents.length).toBe(15);
    const tierCounts = [0, 0, 0, 0, 0];
    for (const slot of hero.talents) {
      tierCounts[slot.tier - 1]++;
      expect(slot.talentId).toBeNull();
    }
    expect(tierCounts).toEqual([5, 4, 3, 2, 1]);
  });

  it('throws on unknown species', () => {
    expect(() => createHero({
      name: 'X', speciesId: 'gungan', careerId: 'hired-gun', specializationId: 'mercenary',
    }, gd)).toThrow('Species not found');
  });

  it('throws on unknown career', () => {
    expect(() => createHero({
      name: 'X', speciesId: 'human', careerId: 'jedi', specializationId: 'mercenary',
    }, gd)).toThrow('Career not found');
  });

  it('throws when specialization does not belong to career', () => {
    expect(() => createHero({
      name: 'X', speciesId: 'human', careerId: 'scoundrel', specializationId: 'mercenary',
    }, gd)).toThrow("not in career 'scoundrel'");
  });

  it('throws when characteristic exceeds 5', () => {
    expect(() => createHero({
      name: 'X', speciesId: 'human', careerId: 'hired-gun', specializationId: 'mercenary',
      characteristicIncreases: { brawn: 4 }, // 2 + 4 = 6 > 5
    }, gd)).toThrow("above maximum (5)");
  });

  it('throws when initial skill rank exceeds 2', () => {
    expect(() => createHero({
      name: 'X', speciesId: 'human', careerId: 'hired-gun', specializationId: 'mercenary',
      initialSkills: { 'ranged-heavy': 3 },
    }, gd)).toThrow('cannot exceed 2');
  });
});

// ============================================================================
// CHARACTERISTIC VALIDATION
// ============================================================================

describe('validateCharacteristics', () => {
  it('accepts valid characteristics', () => {
    expect(() => validateCharacteristics({ brawn: 1, agility: 5, intellect: 3, cunning: 2, willpower: 4, presence: 1 })).not.toThrow();
  });

  it('rejects characteristic below 1', () => {
    expect(() => validateCharacteristics({ brawn: 0, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 })).toThrow('below minimum');
  });

  it('rejects characteristic above 5', () => {
    expect(() => validateCharacteristics({ brawn: 6, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 })).toThrow('above maximum');
  });
});

// ============================================================================
// XP COSTS
// ============================================================================

describe('XP Costs', () => {
  it('career skill rank costs: 5N', () => {
    expect(skillRankXPCost(1, true)).toBe(5);
    expect(skillRankXPCost(2, true)).toBe(10);
    expect(skillRankXPCost(3, true)).toBe(15);
    expect(skillRankXPCost(4, true)).toBe(20);
    expect(skillRankXPCost(5, true)).toBe(25);
  });

  it('non-career skill rank costs: 5N + 5', () => {
    expect(skillRankXPCost(1, false)).toBe(10);
    expect(skillRankXPCost(2, false)).toBe(15);
    expect(skillRankXPCost(3, false)).toBe(20);
  });

  it('talent XP costs by tier', () => {
    expect(TALENT_XP_COST[1]).toBe(5);
    expect(TALENT_XP_COST[2]).toBe(10);
    expect(TALENT_XP_COST[3]).toBe(15);
    expect(TALENT_XP_COST[4]).toBe(20);
    expect(TALENT_XP_COST[5]).toBe(25);
  });

  it('full pyramid costs 175 XP', () => {
    expect(FULL_PYRAMID_XP_COST).toBe(175);
  });
});

// ============================================================================
// CAREER SKILL DETECTION
// ============================================================================

describe('isCareerSkill', () => {
  const gd = makeGameData();

  it('detects career skills from career definition', () => {
    const hero = makeHero();
    expect(isCareerSkill('ranged-heavy', hero, gd)).toBe(true);
    expect(isCareerSkill('athletics', hero, gd)).toBe(true);
    expect(isCareerSkill('brawl', hero, gd)).toBe(true);
  });

  it('detects bonus career skills from specialization', () => {
    const hero = makeHero();
    // Mercenary bonus skills: ranged-heavy, athletics, resilience, vigilance
    // ranged-heavy and athletics are already career skills
    // resilience and vigilance are also in hired-gun career
    expect(isCareerSkill('resilience', hero, gd)).toBe(true);
  });

  it('returns false for non-career skills', () => {
    const hero = makeHero();
    expect(isCareerSkill('computers', hero, gd)).toBe(false);
    expect(isCareerSkill('deception', hero, gd)).toBe(false);
  });
});

// ============================================================================
// TALENT PYRAMID VALIDATION
// ============================================================================

describe('validateTalentPyramid', () => {
  const gd = makeGameData();

  it('validates empty pyramid as valid', () => {
    const hero = makeHero();
    const result = validateTalentPyramid(hero, gd);
    expect(result.valid).toBe(true);
  });

  it('validates a correctly filled Tier 1 slot', () => {
    const hero = makeHero({
      talents: buildEmptyTestPyramid().map((s, i) =>
        i === 0 ? { ...s, talentId: 'merc-t1-01' } : s,
      ),
    });
    const result = validateTalentPyramid(hero, gd);
    expect(result.valid).toBe(true);
  });

  it('rejects talent not in any specialization', () => {
    const hero = makeHero({
      talents: buildEmptyTestPyramid().map((s, i) =>
        i === 0 ? { ...s, talentId: 'unknown-talent' } : s,
      ),
    });
    const result = validateTalentPyramid(hero, gd);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('rejects talent tier mismatch', () => {
    // Place a Tier 2 talent in a Tier 1 slot
    const hero = makeHero({
      talents: buildEmptyTestPyramid().map((s, i) =>
        i === 0 ? { ...s, talentId: 'merc-t2-01' } : s, // t2 in tier 1 slot
      ),
    });
    const result = validateTalentPyramid(hero, gd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Tier'))).toBe(true);
  });

  it('enforces Wide Base Rule', () => {
    // 4 Tier 2 talents but only 3 Tier 1 filled
    const talents = buildEmptyTestPyramid();
    // Fill 3 of 5 Tier 1 slots
    talents[0].talentId = 'merc-t1-01';
    talents[1].talentId = 'merc-t1-02';
    talents[2].talentId = 'merc-t1-03';
    // Fill all 4 Tier 2 slots
    talents[5].talentId = 'merc-t2-01';
    talents[6].talentId = 'merc-t2-02';
    talents[7].talentId = 'merc-t2-01'; // ranked duplicate ok for this test, but it's tier mismatch... let me fix
    talents[8].talentId = 'merc-t2-02';

    const hero = makeHero({ talents });
    const result = validateTalentPyramid(hero, gd);
    expect(result.errors.some((e) => e.includes('Wide Base'))).toBe(true);
  });

  it('rejects Tier 2 talents without any Tier 1', () => {
    const talents = buildEmptyTestPyramid();
    talents[5].talentId = 'merc-t2-01';
    const hero = makeHero({ talents });
    const result = validateTalentPyramid(hero, gd);
    expect(result.errors.some((e) => e.includes('without any Tier 1'))).toBe(true);
  });
});

// ============================================================================
// FULL CHARACTER VALIDATION
// ============================================================================

describe('validateHero', () => {
  const gd = makeGameData();

  it('validates a well-formed hero', () => {
    const hero = makeHero();
    const result = validateHero(hero, gd);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('catches unknown species', () => {
    const hero = makeHero({ species: 'gungan' });
    const result = validateHero(hero, gd);
    expect(result.errors.some((e) => e.includes('Unknown species'))).toBe(true);
  });

  it('catches unknown career', () => {
    const hero = makeHero({ career: 'jedi' });
    const result = validateHero(hero, gd);
    expect(result.errors.some((e) => e.includes('Unknown career'))).toBe(true);
  });

  it('catches specialization not in career', () => {
    const hero = makeHero({ career: 'scoundrel', specializations: ['mercenary'] });
    const result = validateHero(hero, gd);
    expect(result.errors.some((e) => e.includes('does not belong'))).toBe(true);
  });

  it('catches skill rank out of range', () => {
    const hero = makeHero({ skills: { 'ranged-heavy': 6 } });
    const result = validateHero(hero, gd);
    expect(result.errors.some((e) => e.includes('out of range'))).toBe(true);
  });

  it('warns when current wounds exceed threshold', () => {
    const hero = makeHero({ wounds: { current: 20, threshold: 13 } });
    const result = validateHero(hero, gd);
    expect(result.warnings.some((w) => w.includes('exceed threshold'))).toBe(true);
  });

  it('catches available XP > total XP', () => {
    const hero = makeHero({ xp: { total: 50, available: 100 } });
    const result = validateHero(hero, gd);
    expect(result.errors.some((e) => e.includes('exceeds total'))).toBe(true);
  });

  it('catches empty specializations', () => {
    const hero = makeHero({ specializations: [] });
    const result = validateHero(hero, gd);
    expect(result.errors.some((e) => e.includes('at least one'))).toBe(true);
  });
});

// ============================================================================
// SKILL CHECKS
// ============================================================================

describe('resolveSkillCheck', () => {
  it('resolves an unopposed check with deterministic dice', () => {
    const hero = makeHero();
    // Hero: Agility 3, ranged-heavy 2 => pool 2Y+1G
    // All roll 4: green=1 success, yellow=1 success each
    // 2 purple difficulty, all roll 4: 1 failure each
    // Net: 3 successes - 2 failures = 1
    const result = resolveSkillCheck(hero, 'ranged-heavy', 2, constRoll(4));
    expect(result.isSuccess).toBe(true);
    expect(result.netSuccesses).toBe(1);
  });

  it('resolves a failed check', () => {
    const hero = makeHero();
    // All roll 1: no successes, no failures
    // Net successes = 0, not >= 1
    const result = resolveSkillCheck(hero, 'ranged-heavy', 2, constRoll(1));
    expect(result.isSuccess).toBe(false);
    expect(result.netSuccesses).toBe(0);
  });

  it('uses correct characteristic for the skill', () => {
    const hero = makeHero({
      characteristics: { brawn: 4, agility: 1, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
      skills: { 'athletics': 2 },
    });
    // Athletics uses Brawn (4), rank 2 => max(4,2)=4 dice, min(4,2)=2 upgrades = 2Y+2G
    const result = resolveSkillCheck(hero, 'athletics', 1, constRoll(4));
    expect(result.pool).toEqual({ ability: 2, proficiency: 2 });
  });

  it('handles untrained skill (rank 0)', () => {
    const hero = makeHero({ skills: {} });
    // Agility 3, stealth 0 => max(3,0)=3, min(3,0)=0 => 3 green, 0 yellow
    const result = resolveSkillCheck(hero, 'stealth', 2, constRoll(4));
    expect(result.pool).toEqual({ ability: 3, proficiency: 0 });
  });

  it('throws on unknown skill', () => {
    const hero = makeHero();
    expect(() => resolveSkillCheck(hero, 'telekinesis', 2)).toThrow('Unknown skill');
  });

  it('applies wounded penalty (-1 to characteristic, min 1)', () => {
    const hero = makeHero({
      // Agility 3, ranged-heavy rank 2 => normally max(3,2)=3, min(3,2)=2 => 1G+2Y
      characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
      skills: { 'ranged-heavy': 2 },
    });
    // Not wounded: Agility 3, rank 2 => 1G+2Y (ability=1, proficiency=2)
    const normalResult = resolveSkillCheck(hero, 'ranged-heavy', 2, constRoll(4), false);
    expect(normalResult.pool).toEqual({ ability: 1, proficiency: 2 });

    // Wounded: Agility 3-1=2, rank 2 => max(2,2)=2, min(2,2)=2 => 0G+2Y
    const woundedResult = resolveSkillCheck(hero, 'ranged-heavy', 2, constRoll(4), true);
    expect(woundedResult.pool).toEqual({ ability: 0, proficiency: 2 });
  });

  it('wounded penalty does not reduce characteristic below 1', () => {
    const hero = makeHero({
      // Intellect 1, mechanics 0 => normally 1G
      characteristics: { brawn: 3, agility: 3, intellect: 1, cunning: 2, willpower: 2, presence: 2 },
      skills: {},
    });
    // Wounded: Intellect max(1, 1-1)=1 => still 1G (min 1 rule)
    const result = resolveSkillCheck(hero, 'mechanics', 2, constRoll(4), true);
    expect(result.pool).toEqual({ ability: 1, proficiency: 0 });
  });
});

describe('resolveOpposedSkillCheck', () => {
  it('resolves an opposed check', () => {
    const hero = makeHero({
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 3, willpower: 2, presence: 2 },
      skills: { deception: 2 },
    });
    // Deception (Cunning 3, rank 2): 2Y+1G vs opponent Willpower 2, Discipline 1: 1R+1P
    const result = resolveOpposedSkillCheck(hero, 'deception', 2, 1, constRoll(4));
    expect(result.rolls).not.toBeNull();
    // With all 4s: 3 successes vs 2 failures = net 1 => success
    expect(result.isSuccess).toBe(true);
  });
});

// ============================================================================
// XP ADVANCEMENT
// ============================================================================

describe('purchaseSkillRank', () => {
  const gd = makeGameData();

  it('increases skill rank and deducts career skill XP', () => {
    const hero = makeHero({ skills: { 'ranged-heavy': 1 }, xp: { total: 100, available: 50 } });
    const updated = purchaseSkillRank(hero, 'ranged-heavy', gd);
    expect(updated.skills['ranged-heavy']).toBe(2);
    expect(updated.xp.available).toBe(40); // 50 - 10 (5 * 2)
  });

  it('deducts non-career skill XP correctly', () => {
    const hero = makeHero({ skills: {}, xp: { total: 100, available: 50 } });
    const updated = purchaseSkillRank(hero, 'computers', gd); // non-career
    expect(updated.skills['computers']).toBe(1);
    expect(updated.xp.available).toBe(40); // 50 - 10 (5*1 + 5)
  });

  it('throws when skill already at rank 5', () => {
    const hero = makeHero({ skills: { 'ranged-heavy': 5 } });
    expect(() => purchaseSkillRank(hero, 'ranged-heavy', gd)).toThrow('maximum rank');
  });

  it('throws when not enough XP', () => {
    const hero = makeHero({ skills: { 'ranged-heavy': 4 }, xp: { total: 100, available: 5 } });
    // Rank 5 costs 25 XP
    expect(() => purchaseSkillRank(hero, 'ranged-heavy', gd)).toThrow('Not enough XP');
  });

  it('updates soak when resilience is purchased', () => {
    const hero = makeHero({ skills: { resilience: 1 }, soak: 5 });
    const updated = purchaseSkillRank(hero, 'resilience', gd);
    expect(updated.soak).toBe(6);
  });

  it('does not mutate original hero', () => {
    const hero = makeHero();
    const originalXP = hero.xp.available;
    purchaseSkillRank(hero, 'ranged-heavy', gd);
    expect(hero.xp.available).toBe(originalXP);
  });
});

describe('purchaseTalent', () => {
  const gd = makeGameData();

  it('places talent in pyramid slot and deducts XP', () => {
    const hero = makeHero();
    const updated = purchaseTalent(hero, 'merc-t1-01', 1, 0, gd);
    expect(updated.talents[0].talentId).toBe('merc-t1-01');
    expect(updated.xp.available).toBe(45); // 50 - 5
  });

  it('applies Toughened stat modifier immediately', () => {
    const hero = makeHero();
    const updated = purchaseTalent(hero, 'merc-t1-01', 1, 0, gd);
    // Toughened: +2 wound threshold
    expect(updated.wounds.threshold).toBe(hero.wounds.threshold + 2);
  });

  it('applies Grit stat modifier immediately', () => {
    const hero = makeHero();
    const updated = purchaseTalent(hero, 'merc-t1-02', 1, 1, gd);
    expect(updated.strain.threshold).toBe(hero.strain.threshold + 1);
  });

  it('throws when talent not in specialization', () => {
    const hero = makeHero();
    expect(() => purchaseTalent(hero, 'unknown-talent', 1, 0, gd)).toThrow('not found');
  });

  it('throws when slot already filled', () => {
    const hero = makeHero({
      talents: buildEmptyTestPyramid().map((s, i) =>
        i === 0 ? { ...s, talentId: 'merc-t1-01' } : s,
      ),
    });
    expect(() => purchaseTalent(hero, 'merc-t1-02', 1, 0, gd)).toThrow('already filled');
  });

  it('throws when not enough XP', () => {
    const hero = makeHero({ xp: { total: 100, available: 3 } });
    expect(() => purchaseTalent(hero, 'merc-t1-01', 1, 0, gd)).toThrow('Not enough XP');
  });

  it('throws on tier mismatch', () => {
    const hero = makeHero();
    expect(() => purchaseTalent(hero, 'merc-t2-01', 1, 0, gd)).toThrow('Tier');
  });
});

describe('unlockSpecialization', () => {
  const gd = makeGameData();

  it('adds in-career specialization for 10 XP', () => {
    const hero = makeHero();
    const updated = unlockSpecialization(hero, 'bodyguard', gd);
    expect(updated.specializations).toEqual(['mercenary', 'bodyguard']);
    expect(updated.xp.available).toBe(40); // 50 - 10
  });

  it('adds out-of-career specialization for 20 XP', () => {
    const hero = makeHero();
    const updated = unlockSpecialization(hero, 'smuggler', gd);
    expect(updated.specializations).toEqual(['mercenary', 'smuggler']);
    expect(updated.xp.available).toBe(30); // 50 - 20
  });

  it('throws if already has specialization', () => {
    const hero = makeHero();
    expect(() => unlockSpecialization(hero, 'mercenary', gd)).toThrow('Already has');
  });

  it('throws if not enough XP', () => {
    const hero = makeHero({ xp: { total: 100, available: 5 } });
    expect(() => unlockSpecialization(hero, 'bodyguard', gd)).toThrow('Not enough XP');
  });
});

// ============================================================================
// INITIATIVE
// ============================================================================

describe('rollInitiative', () => {
  it('rolls Cool initiative (Presence-based)', () => {
    const hero = makeHero({
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 3 },
      skills: { cool: 1 },
    });
    // Presence 3, Cool 1 => max(3,1)=3, min(3,1)=1 => 1Y+2G
    // All roll 4: green=1 success, yellow=1 success => 3 successes
    const result = rollInitiative(hero, 'cool', constRoll(4));
    expect(result.successes).toBe(3);
  });

  it('rolls Vigilance initiative (Willpower-based)', () => {
    const hero = makeHero({
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 3, presence: 2 },
      skills: { vigilance: 2 },
    });
    // Willpower 3, Vigilance 2 => 2Y+1G
    const result = rollInitiative(hero, 'vigilance', constRoll(4));
    expect(result.successes).toBe(3);
  });

  it('returns advantages from initiative roll', () => {
    const hero = makeHero({
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
      skills: { cool: 1 },
    });
    // All roll 6: green=success+advantage, yellow=2 successes (triumph counted as advantage)
    const result = rollInitiative(hero, 'cool', constRoll(6));
    expect(result.advantages).toBeGreaterThan(0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  const gd = makeGameData();

  it('hero with all skills at 0 can still attempt checks', () => {
    const hero = makeHero({ skills: {}, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 } });
    const result = resolveSkillCheck(hero, 'athletics', 1, constRoll(4));
    // Brawn 2, rank 0 => 2G, difficulty 1P
    expect(result.pool).toEqual({ ability: 2, proficiency: 0 });
  });

  it('purchasing multiple skill ranks sequentially deducts correctly', () => {
    let hero = makeHero({ skills: {}, xp: { total: 200, available: 200 } });
    hero = purchaseSkillRank(hero, 'ranged-heavy', gd); // rank 1: 5 XP
    hero = purchaseSkillRank(hero, 'ranged-heavy', gd); // rank 2: 10 XP
    hero = purchaseSkillRank(hero, 'ranged-heavy', gd); // rank 3: 15 XP
    expect(hero.skills['ranged-heavy']).toBe(3);
    expect(hero.xp.available).toBe(170); // 200 - 5 - 10 - 15
  });

  it('full talent pyramid slot count is exactly 15', () => {
    const hero = createHero({
      name: 'Pyramid Test',
      speciesId: 'human',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
    }, gd);
    expect(hero.talents.length).toBe(15);
  });
});

// ============================================================================
// ABILITY POINTS
// ============================================================================

describe('Ability Points', () => {
  const gd = makeGameData();

  it('createHero initializes AP at 0/0', () => {
    const hero = createHero({
      name: 'AP Test',
      speciesId: 'human',
      careerId: 'hired-gun',
      specializationId: 'mercenary',
    }, gd);
    expect(hero.abilityPoints).toEqual({ total: 0, available: 0 });
  });

  it('awardAbilityPoints increases both total and available', () => {
    const hero = makeHero();
    const updated = awardAbilityPoints({ ...hero, abilityPoints: { total: 0, available: 0 } }, 3);
    expect(updated.abilityPoints).toEqual({ total: 3, available: 3 });
  });

  it('awardAbilityPoints stacks correctly', () => {
    let hero = { ...makeHero(), abilityPoints: { total: 0, available: 0 } };
    hero = awardAbilityPoints(hero, 2);
    hero = awardAbilityPoints(hero, 3);
    expect(hero.abilityPoints).toEqual({ total: 5, available: 5 });
  });

  it('awardAbilityPoints throws on negative amount', () => {
    const hero = { ...makeHero(), abilityPoints: { total: 5, available: 5 } };
    expect(() => awardAbilityPoints(hero, -1)).toThrow('Cannot award negative AP');
  });

  it('spendAbilityPoints deducts from available', () => {
    const hero = { ...makeHero(), abilityPoints: { total: 5, available: 5 } };
    const updated = spendAbilityPoints(hero, 3);
    expect(updated.abilityPoints).toEqual({ total: 5, available: 2 });
  });

  it('spendAbilityPoints throws when insufficient AP', () => {
    const hero = { ...makeHero(), abilityPoints: { total: 5, available: 2 } };
    expect(() => spendAbilityPoints(hero, 3)).toThrow('Not enough AP: need 3, have 2');
  });

  it('spendAbilityPoints throws on non-positive cost', () => {
    const hero = { ...makeHero(), abilityPoints: { total: 5, available: 5 } };
    expect(() => spendAbilityPoints(hero, 0)).toThrow('AP cost must be positive');
  });

  it('validateHero detects AP available exceeding total', () => {
    const hero = {
      ...makeHero(),
      abilityPoints: { total: 3, available: 5 },
    };
    const result = validateHero(hero, gd);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Available AP (5) exceeds total AP (3)');
  });

  it('validateHero passes with valid AP', () => {
    const hero = {
      ...makeHero(),
      abilityPoints: { total: 10, available: 4 },
    };
    const result = validateHero(hero, gd);
    expect(result.valid).toBe(true);
  });

  it('returns new object (immutability)', () => {
    const original = { ...makeHero(), abilityPoints: { total: 5, available: 5 } };
    const awarded = awardAbilityPoints(original, 2);
    const spent = spendAbilityPoints(original, 1);
    expect(awarded).not.toBe(original);
    expect(spent).not.toBe(original);
    expect(original.abilityPoints).toEqual({ total: 5, available: 5 }); // unchanged
  });
});

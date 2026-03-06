/**
 * character-v2-dedication.test.ts
 *
 * Tests for uncovered branches in character-v2.ts:
 * - purchaseTalent with modify_characteristic effect (Dedication talent)
 * - applyTalentCharacteristicModifier: valid characteristic, invalid characteristic
 * - Slot already filled collision (purchaseTalent throw)
 */

import { describe, it, expect } from 'vitest';

import {
  purchaseTalent,
} from '../src/character-v2.js';

import type {
  HeroCharacter,
  TalentCard,
  GameData,
  SpecializationDefinition,
  ArmorDefinition,
  Characteristics,
} from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function buildEmptyPyramid() {
  const slots = [];
  const tierSlots = [5, 4, 3, 2, 1];
  for (let tier = 1; tier <= 5; tier++) {
    for (let pos = 0; pos < tierSlots[tier - 1]; pos++) {
      slots.push({ tier: tier as 1 | 2 | 3 | 4 | 5, position: pos, talentId: null });
    }
  }
  return slots;
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

function makeSpec(): SpecializationDefinition & { talents: TalentCard[] } {
  return {
    id: 'mercenary',
    name: 'Mercenary',
    career: 'hired-gun',
    description: 'Professional soldier.',
    bonusCareerSkills: ['ranged-heavy', 'athletics', 'resilience', 'vigilance'],
    capstoneCharacteristics: ['brawn', 'agility'],
    talents: [
      makeTalentCard({ id: 'merc-t1-01' }),
      makeTalentCard({ id: 'merc-t1-02', tier: 1 }),
      makeTalentCard({ id: 'merc-t1-03', tier: 1 }),
      makeTalentCard({ id: 'merc-t1-04', tier: 1 }),
      makeTalentCard({ id: 'merc-t1-05', tier: 1 }),
      makeTalentCard({ id: 'merc-t2-01', tier: 2 }),
      makeTalentCard({ id: 'merc-t2-02', tier: 2 }),
      makeTalentCard({ id: 'merc-t2-03', tier: 2 }),
      makeTalentCard({ id: 'merc-t2-04', tier: 2 }),
      makeTalentCard({ id: 'merc-t3-01', tier: 3 }),
      makeTalentCard({ id: 'merc-t3-02', tier: 3 }),
      makeTalentCard({ id: 'merc-t3-03', tier: 3 }),
      makeTalentCard({ id: 'merc-t4-01', tier: 4 }),
      makeTalentCard({ id: 'merc-t4-02', tier: 4 }),
      makeTalentCard({
        id: 'merc-t5-01',
        name: 'Dedication',
        tier: 5,
        mechanicalEffect: {
          type: 'modify_characteristic',
          characteristic: 'brawn',
          value: 1,
        },
      }),
    ],
  };
}

function makeGameData(): GameData {
  return {
    dice: {} as any,
    species: {
      human: {
        id: 'human',
        name: 'Human',
        woundBase: 10,
        strainBase: 10,
        startingXP: 110,
        characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        specialAbilities: [],
      },
    } as any,
    careers: {
      'hired-gun': {
        id: 'hired-gun',
        name: 'Hired Gun',
        description: 'Professional soldier.',
        careerSkills: ['athletics', 'brawl', 'discipline', 'melee', 'ranged-heavy', 'ranged-light', 'resilience', 'vigilance'],
        specializations: ['mercenary', 'bodyguard', 'demolitionist'],
      },
    } as any,
    specializations: { mercenary: makeSpec() },
    weapons: {} as any,
    armor: {} as any,
    npcProfiles: {},
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  // Fill all tier 1-4 slots to be able to purchase tier 5
  const talents = buildEmptyPyramid();
  // Fill tier 1 (indices 0-4)
  for (let i = 0; i < 5; i++) {
    talents[i].talentId = `merc-t1-0${i + 1}`;
  }
  // Fill tier 2 (indices 5-8)
  for (let i = 0; i < 4; i++) {
    talents[5 + i].talentId = `merc-t2-0${i + 1}`;
  }
  // Fill tier 3 (indices 9-11)
  for (let i = 0; i < 3; i++) {
    talents[9 + i].talentId = `merc-t3-0${i + 1}`;
  }
  // Fill tier 4 (indices 12-13)
  for (let i = 0; i < 2; i++) {
    talents[12 + i].talentId = `merc-t4-0${i + 1}`;
  }
  // Tier 5 (index 14) is empty -- this is what we'll purchase

  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2 },
    talents,
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 200, available: 50 },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('purchaseTalent - modify_characteristic (Dedication)', () => {
  it('increases brawn by 1 when purchasing Dedication talent', () => {
    const gd = makeGameData();
    const hero = makeHero();
    const originalBrawn = hero.characteristics.brawn;

    const updated = purchaseTalent(hero, 'merc-t5-01', 5, 0, gd);

    expect(updated.talents[14].talentId).toBe('merc-t5-01');
    expect(updated.characteristics.brawn).toBe(originalBrawn + 1);
    expect(updated.xp.available).toBe(50 - 25); // Tier 5 costs 25 XP
  });

  it('does not modify other characteristics when increasing brawn', () => {
    const gd = makeGameData();
    const hero = makeHero();
    const updated = purchaseTalent(hero, 'merc-t5-01', 5, 0, gd);

    expect(updated.characteristics.agility).toBe(hero.characteristics.agility);
    expect(updated.characteristics.intellect).toBe(hero.characteristics.intellect);
    expect(updated.characteristics.cunning).toBe(hero.characteristics.cunning);
    expect(updated.characteristics.willpower).toBe(hero.characteristics.willpower);
    expect(updated.characteristics.presence).toBe(hero.characteristics.presence);
  });

  it('handles modify_characteristic with agility', () => {
    const gd = makeGameData();
    // Override the Dedication talent to modify agility instead
    const spec = gd.specializations['mercenary'] as any;
    spec.talents[spec.talents.length - 1] = makeTalentCard({
      id: 'merc-t5-01',
      name: 'Dedication',
      tier: 5,
      mechanicalEffect: {
        type: 'modify_characteristic',
        characteristic: 'agility',
        value: 1,
      },
    });

    const hero = makeHero();
    const originalAgility = hero.characteristics.agility;
    const updated = purchaseTalent(hero, 'merc-t5-01', 5, 0, gd);

    expect(updated.characteristics.agility).toBe(originalAgility + 1);
  });

  it('handles modify_characteristic with invalid characteristic name gracefully', () => {
    const gd = makeGameData();
    const spec = gd.specializations['mercenary'] as any;
    spec.talents[spec.talents.length - 1] = makeTalentCard({
      id: 'merc-t5-01',
      name: 'Dedication',
      tier: 5,
      mechanicalEffect: {
        type: 'modify_characteristic',
        characteristic: 'nonexistent_stat',
        value: 1,
      },
    });

    const hero = makeHero();
    const updated = purchaseTalent(hero, 'merc-t5-01', 5, 0, gd);

    // Hero characteristics should remain unchanged
    expect(updated.characteristics).toEqual(hero.characteristics);
    // Talent should still be purchased
    expect(updated.talents[14].talentId).toBe('merc-t5-01');
  });

  it('handles modify_characteristic with missing value (defaults to 0)', () => {
    const gd = makeGameData();
    const spec = gd.specializations['mercenary'] as any;
    spec.talents[spec.talents.length - 1] = makeTalentCard({
      id: 'merc-t5-01',
      name: 'Dedication',
      tier: 5,
      mechanicalEffect: {
        type: 'modify_characteristic',
        characteristic: 'brawn',
        // no value field
      },
    });

    const hero = makeHero();
    const originalBrawn = hero.characteristics.brawn;
    const updated = purchaseTalent(hero, 'merc-t5-01', 5, 0, gd);

    // value defaults to 0, so brawn stays the same
    expect(updated.characteristics.brawn).toBe(originalBrawn);
  });
});

describe('purchaseTalent - modify_stat soak branch', () => {
  it('does not modify hero.soak for soak-type stat modifier (applied at combat time)', () => {
    const gd = makeGameData();
    const spec = gd.specializations['mercenary'] as any;
    spec.talents[0] = makeTalentCard({
      id: 'merc-t1-01',
      name: 'Enduring',
      tier: 1,
      mechanicalEffect: { type: 'modify_stat', stat: 'soak', value: 1 },
    });

    const hero = makeHero({
      talents: buildEmptyPyramid(),
      xp: { total: 200, available: 50 },
    });
    const originalSoak = hero.soak;
    const updated = purchaseTalent(hero, 'merc-t1-01', 1, 0, gd);

    // Soak is not baked in; it's applied at combat time
    expect(updated.soak).toBe(originalSoak);
  });
});

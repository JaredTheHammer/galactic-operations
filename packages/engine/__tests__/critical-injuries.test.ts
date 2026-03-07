/**
 * Tests for the Critical Injury System
 */
import { describe, it, expect } from 'vitest';
import {
  rollCriticalInjuryD66,
  getCriticalInjuryForRoll,
  applyCriticalInjury,
  removeCriticalInjury,
  removeCriticalInjuryById,
  getCriticalInjuryCharacteristicPenalties,
  getCriticalInjuryWoundPenalty,
  getCriticalInjuryStrainPenalty,
  getCriticalInjurySpeedPenalty,
  getCriticalInjurySoakPenalty,
  getCriticalInjurySkillPenalties,
  isHeroForcedToRest,
  getHeroCriticalInjuryStatus,
  attemptTreatment,
  professionalTreatment,
  processNaturalRecovery,
  MAX_CRITICAL_INJURIES,
  FORCED_REST_THRESHOLD,
} from '../src/critical-injuries';
import type {
  HeroCharacter,
  CriticalInjuryDefinition,
  CampaignState,
} from '../src/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, athletics: 1, medicine: 1 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 4,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    criticalInjuries: [],
    ...overrides,
  };
}

const TEST_INJURIES: Record<string, CriticalInjuryDefinition> = {
  'rattled': {
    id: 'rattled',
    name: 'Rattled',
    description: 'Minor shaking',
    severity: 'minor',
    rollRange: [11, 25],
    effects: [{ type: 'reduce_strain_threshold', value: 1 }],
    recoverable: true,
    treatmentDifficulty: 1,
    treatmentSkill: 'medicine',
    treatmentCost: 25,
    naturalRecoveryMissions: 1,
  },
  'torn-muscle': {
    id: 'torn-muscle',
    name: 'Torn Muscle',
    description: 'Muscle damage',
    severity: 'moderate',
    rollRange: [26, 45],
    effects: [
      { type: 'reduce_characteristic', value: 1, target: 'agility' },
      { type: 'reduce_speed', value: 1 },
    ],
    recoverable: true,
    treatmentDifficulty: 2,
    treatmentSkill: 'medicine',
    treatmentCost: 75,
    naturalRecoveryMissions: 3,
  },
  'nerve-damage': {
    id: 'nerve-damage',
    name: 'Nerve Damage',
    description: 'Severe nerve injury',
    severity: 'severe',
    rollRange: [46, 66],
    effects: [
      { type: 'reduce_characteristic', value: 1, target: 'agility' },
      { type: 'reduce_characteristic', value: 1, target: 'cunning' },
      { type: 'skill_penalty', value: 1, target: 'ranged-heavy' },
    ],
    recoverable: true,
    treatmentDifficulty: 3,
    treatmentChallengeDice: 1,
    treatmentSkill: 'medicine',
    treatmentCost: 200,
    naturalRecoveryMissions: 0,
  },
};

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2024-01-01',
    lastPlayedAt: '2024-01-01',
    heroes: { 'hero-1': makeHero() },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['m1'],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Critical Injury System', () => {
  describe('rollCriticalInjuryD66', () => {
    it('rolls a d66 value between 11 and 66', () => {
      const hero = makeHero();
      let callCount = 0;
      const rollFn = () => {
        callCount++;
        return callCount % 2 === 1 ? 0.5 : 0.5; // dice = 3,3 -> 33
      };
      const result = rollCriticalInjuryD66(hero, rollFn);
      expect(result).toBeGreaterThanOrEqual(11);
      expect(result).toBeLessThanOrEqual(66);
    });

    it('adds +10 per existing critical injury', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
          { injuryId: 'rattled', sustainedInMission: 'm2', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      // With 2 existing injuries, modifier is +20
      const rollFn = () => 0.01; // both dice roll 1 -> 11
      const result = rollCriticalInjuryD66(hero, rollFn);
      expect(result).toBe(31); // 11 + 20
    });

    it('caps at 66', () => {
      const hero = makeHero({
        criticalInjuries: Array(5).fill({
          injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false,
        }),
      });
      const rollFn = () => 0.99; // both dice roll 6 -> 66
      const result = rollCriticalInjuryD66(hero, rollFn);
      expect(result).toBe(66);
    });
  });

  describe('getCriticalInjuryForRoll', () => {
    it('returns the matching injury for a roll', () => {
      const result = getCriticalInjuryForRoll(15, TEST_INJURIES);
      expect(result?.id).toBe('rattled');
    });

    it('returns moderate injury for mid-range roll', () => {
      const result = getCriticalInjuryForRoll(30, TEST_INJURIES);
      expect(result?.id).toBe('torn-muscle');
    });

    it('returns severe injury for high roll', () => {
      const result = getCriticalInjuryForRoll(55, TEST_INJURIES);
      expect(result?.id).toBe('nerve-damage');
    });

    it('returns null for out-of-range roll', () => {
      const result = getCriticalInjuryForRoll(5, TEST_INJURIES);
      expect(result).toBeNull();
    });
  });

  describe('applyCriticalInjury', () => {
    it('adds an injury to the hero', () => {
      const hero = makeHero();
      const result = applyCriticalInjury(hero, 'rattled', 'mission-1');
      expect(result.criticalInjuries).toHaveLength(1);
      expect(result.criticalInjuries![0].injuryId).toBe('rattled');
      expect(result.criticalInjuries![0].sustainedInMission).toBe('mission-1');
    });

    it('stacks multiple injuries', () => {
      let hero = makeHero();
      hero = applyCriticalInjury(hero, 'rattled', 'm1');
      hero = applyCriticalInjury(hero, 'torn-muscle', 'm2');
      expect(hero.criticalInjuries).toHaveLength(2);
    });
  });

  describe('removeCriticalInjury', () => {
    it('removes an injury by index', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
          { injuryId: 'torn-muscle', sustainedInMission: 'm2', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const result = removeCriticalInjury(hero, 0);
      expect(result.criticalInjuries).toHaveLength(1);
      expect(result.criticalInjuries![0].injuryId).toBe('torn-muscle');
    });
  });

  describe('removeCriticalInjuryById', () => {
    it('removes first matching injury by ID', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
          { injuryId: 'rattled', sustainedInMission: 'm2', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const result = removeCriticalInjuryById(hero, 'rattled');
      expect(result.criticalInjuries).toHaveLength(1);
      expect(result.criticalInjuries![0].sustainedInMission).toBe('m2');
    });
  });

  describe('effect calculations', () => {
    const heroWithInjuries = makeHero({
      criticalInjuries: [
        { injuryId: 'torn-muscle', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        { injuryId: 'nerve-damage', sustainedInMission: 'm2', missionsRested: 0, treatmentAttempted: false },
      ],
    });

    it('calculates characteristic penalties', () => {
      const penalties = getCriticalInjuryCharacteristicPenalties(heroWithInjuries, TEST_INJURIES);
      expect(penalties.agility).toBe(2); // -1 from torn-muscle + -1 from nerve-damage
      expect(penalties.cunning).toBe(1); // -1 from nerve-damage
    });

    it('calculates speed penalty', () => {
      const penalty = getCriticalInjurySpeedPenalty(heroWithInjuries, TEST_INJURIES);
      expect(penalty).toBe(1); // -1 from torn-muscle
    });

    it('calculates skill penalties', () => {
      const penalties = getCriticalInjurySkillPenalties(heroWithInjuries, TEST_INJURIES);
      expect(penalties['ranged-heavy']).toBe(1); // -1 from nerve-damage
    });

    it('calculates strain threshold penalty', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const penalty = getCriticalInjuryStrainPenalty(hero, TEST_INJURIES);
      expect(penalty).toBe(1);
    });
  });

  describe('isHeroForcedToRest', () => {
    it('returns false when below threshold', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      expect(isHeroForcedToRest(hero)).toBe(false);
    });

    it('returns true at threshold', () => {
      const hero = makeHero({
        criticalInjuries: Array(FORCED_REST_THRESHOLD).fill({
          injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false,
        }),
      });
      expect(isHeroForcedToRest(hero)).toBe(true);
    });
  });

  describe('getHeroCriticalInjuryStatus', () => {
    it('categorizes injuries by severity', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
          { injuryId: 'torn-muscle', sustainedInMission: 'm2', missionsRested: 0, treatmentAttempted: false },
          { injuryId: 'nerve-damage', sustainedInMission: 'm3', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const status = getHeroCriticalInjuryStatus(hero, TEST_INJURIES);
      expect(status.totalInjuries).toBe(3);
      expect(status.minorCount).toBe(1);
      expect(status.moderateCount).toBe(1);
      expect(status.severeCount).toBe(1);
      expect(status.forcedToRest).toBe(false);
    });
  });

  describe('treatment', () => {
    it('successful treatment removes the injury', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const { hero: updated, success } = attemptTreatment(hero, 0, TEST_INJURIES, true);
      expect(success).toBe(true);
      expect(updated.criticalInjuries).toHaveLength(0);
    });

    it('failed treatment marks injury as attempted', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const { hero: updated, success } = attemptTreatment(hero, 0, TEST_INJURIES, false);
      expect(success).toBe(false);
      expect(updated.criticalInjuries![0].treatmentAttempted).toBe(true);
    });

    it('professional treatment costs credits and always succeeds', () => {
      const campaign = makeCampaign({
        heroes: {
          'hero-1': makeHero({
            criticalInjuries: [
              { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
            ],
          }),
        },
      });
      const result = professionalTreatment(campaign, 'hero-1', 0, TEST_INJURIES);
      expect(result.credits).toBe(475); // 500 - 25
      expect(result.heroes['hero-1'].criticalInjuries).toHaveLength(0);
    });

    it('professional treatment throws on insufficient credits', () => {
      const campaign = makeCampaign({
        credits: 10,
        heroes: {
          'hero-1': makeHero({
            criticalInjuries: [
              { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
            ],
          }),
        },
      });
      expect(() => professionalTreatment(campaign, 'hero-1', 0, TEST_INJURIES))
        .toThrow('Insufficient credits');
    });
  });

  describe('natural recovery', () => {
    it('heals injuries after enough rest missions', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      // Rattled: naturalRecoveryMissions = 1
      const result = processNaturalRecovery(hero, false, TEST_INJURIES);
      expect(result.criticalInjuries).toHaveLength(0);
    });

    it('does not heal if deployed', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'rattled', sustainedInMission: 'm1', missionsRested: 0, treatmentAttempted: false },
        ],
      });
      const result = processNaturalRecovery(hero, true, TEST_INJURIES);
      expect(result.criticalInjuries).toHaveLength(1);
      expect(result.criticalInjuries![0].missionsRested).toBe(0);
    });

    it('does not naturally heal injuries with 0 recovery missions', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'nerve-damage', sustainedInMission: 'm1', missionsRested: 10, treatmentAttempted: false },
        ],
      });
      const result = processNaturalRecovery(hero, false, TEST_INJURIES);
      expect(result.criticalInjuries).toHaveLength(1);
    });

    it('increments missionsRested when not deployed', () => {
      const hero = makeHero({
        criticalInjuries: [
          { injuryId: 'torn-muscle', sustainedInMission: 'm1', missionsRested: 1, treatmentAttempted: false },
        ],
      });
      // Torn muscle needs 3 rest missions
      const result = processNaturalRecovery(hero, false, TEST_INJURIES);
      expect(result.criticalInjuries).toHaveLength(1);
      expect(result.criticalInjuries![0].missionsRested).toBe(2);
    });
  });
});

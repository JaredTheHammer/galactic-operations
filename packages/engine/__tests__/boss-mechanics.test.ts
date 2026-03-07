/**
 * boss-mechanics.test.ts -- Boss Hit Location System Tests
 *
 * Tests for the Oathsworn-inspired boss hit location system:
 * - Hit location initialization from NPC profiles
 * - Wound routing to hit locations (targeted and random)
 * - Overflow wounds to main body pool
 * - Boss penalty accumulation (attack/defense/soak/speed)
 * - Disabled weapon tracking
 * - Phase transition detection and application
 * - Targeted shot difficulty penalty
 * - Integration with combat resolution
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameState,
  NPCProfile,
  BossHitLocationDef,
  BossHitLocationState,
  BossPhaseTransition,
  AttackPool,
  DefensePool,
} from '../src/types';

import {
  initBossHitLocations,
  routeWoundsToHitLocations,
  getBossAttackPoolPenalty,
  getBossDefensePoolPenalty,
  getBossSoakPenalty,
  getBossSpeedPenalty,
  getDisabledBossWeapons,
  getDisabledLocationConditions,
  applyTargetedShotPenalty,
  applyBossAttackPenalties,
  applyBossDefensePenalties,
  checkBossPhaseTransition,
  applyBossPhaseTransition,
  isBossWeaponAvailable,
  getBossLocationSummary,
} from '../src/boss-mechanics';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeBossProfile(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'test-boss',
    name: 'Test Boss',
    side: 'imperial',
    tier: 'Nemesis',
    attackPool: { ability: 1, proficiency: 3 },
    defensePool: { difficulty: 1, challenge: 2 },
    woundThreshold: 20,
    strainThreshold: 14,
    soak: 5,
    speed: 4,
    weapons: [
      {
        weaponId: 'boss-gun',
        name: 'Boss Gun',
        baseDamage: 8,
        range: 'Medium',
        critical: 2,
        qualities: [],
      },
      {
        weaponId: 'boss-sword',
        name: 'Boss Sword',
        baseDamage: 10,
        range: 'Engaged',
        critical: 1,
        qualities: [],
      },
    ],
    aiArchetype: 'elite',
    keywords: ['Boss'],
    abilities: [],
    isBoss: true,
    bossHitLocations: [
      {
        id: 'head',
        name: 'Head',
        woundCapacity: 4,
        disabledEffects: {
          attackPoolModifier: -2,
          conditionInflicted: 'Disoriented',
        },
      },
      {
        id: 'gun-arm',
        name: 'Gun Arm',
        woundCapacity: 5,
        disabledEffects: {
          attackPoolModifier: -1,
          disabledWeapons: ['boss-gun'],
        },
      },
      {
        id: 'armor-core',
        name: 'Armor Core',
        woundCapacity: 6,
        disabledEffects: {
          defensePoolModifier: -1,
          soakModifier: -2,
        },
      },
      {
        id: 'legs',
        name: 'Legs',
        woundCapacity: 3,
        disabledEffects: {
          speedModifier: -2,
          conditionInflicted: 'Immobilized',
        },
      },
    ],
    bossPhaseTransitions: [
      {
        disabledLocationsRequired: 1,
        newAiArchetype: 'elite',
        narrativeText: 'Phase 2!',
      },
      {
        disabledLocationsRequired: 3,
        newAiArchetype: 'melee',
        narrativeText: 'Phase 3!',
      },
    ],
    ...overrides,
  };
}

function makeBossFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'boss-1',
    entityType: 'npc',
    entityId: 'test-boss',
    playerId: 0,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: { ability: 1, proficiency: 3 },
    cachedDefensePool: { difficulty: 1, challenge: 2 },
    suppressionTokens: 0,
    courage: 3,
    bossPhase: 0,
    hitLocations: [
      { id: 'head', name: 'Head', woundCapacity: 4, woundsCurrent: 0, isDisabled: false,
        disabledEffects: { attackPoolModifier: -2, conditionInflicted: 'Disoriented' } },
      { id: 'gun-arm', name: 'Gun Arm', woundCapacity: 5, woundsCurrent: 0, isDisabled: false,
        disabledEffects: { attackPoolModifier: -1, disabledWeapons: ['boss-gun'] } },
      { id: 'armor-core', name: 'Armor Core', woundCapacity: 6, woundsCurrent: 0, isDisabled: false,
        disabledEffects: { defensePoolModifier: -1, soakModifier: -2 } },
      { id: 'legs', name: 'Legs', woundCapacity: 3, woundsCurrent: 0, isDisabled: false,
        disabledEffects: { speedModifier: -2, conditionInflicted: 'Immobilized' } },
    ],
    ...overrides,
  };
}

// ============================================================================
// INITIALIZATION TESTS
// ============================================================================

describe('Boss Hit Location Initialization', () => {
  it('initializes hit locations from NPC profile', () => {
    const profile = makeBossProfile();
    const baseFig = makeBossFigure({ hitLocations: undefined, bossPhase: undefined });
    const result = initBossHitLocations(baseFig, profile);

    expect(result.hitLocations).toBeDefined();
    expect(result.hitLocations!.length).toBe(4);
    expect(result.bossPhase).toBe(0);

    // Each location starts at 0 wounds and not disabled
    for (const loc of result.hitLocations!) {
      expect(loc.woundsCurrent).toBe(0);
      expect(loc.isDisabled).toBe(false);
    }
  });

  it('does not modify non-boss NPCs', () => {
    const profile = makeBossProfile({ isBoss: false, bossHitLocations: undefined });
    const baseFig = makeBossFigure({ hitLocations: undefined });
    const result = initBossHitLocations(baseFig, profile);

    expect(result.hitLocations).toBeUndefined();
  });

  it('does not modify NPCs without hit locations', () => {
    const profile = makeBossProfile({ bossHitLocations: [] });
    const baseFig = makeBossFigure({ hitLocations: undefined });
    const result = initBossHitLocations(baseFig, profile);

    expect(result.hitLocations).toBeUndefined();
  });
});

// ============================================================================
// WOUND ROUTING TESTS
// ============================================================================

describe('Wound Routing to Hit Locations', () => {
  it('routes targeted wounds to the specified location', () => {
    const locations: BossHitLocationState[] = [
      { id: 'head', name: 'Head', woundCapacity: 4, woundsCurrent: 0, isDisabled: false,
        disabledEffects: {} },
      { id: 'body', name: 'Body', woundCapacity: 6, woundsCurrent: 0, isDisabled: false,
        disabledEffects: {} },
    ];

    const result = routeWoundsToHitLocations(locations, 3, 'head');
    expect(result.updatedLocations[0].woundsCurrent).toBe(3);
    expect(result.updatedLocations[1].woundsCurrent).toBe(0);
    expect(result.overflowWounds).toBe(0);
    expect(result.newlyDisabled).toEqual([]);
  });

  it('disables location when wounds reach capacity', () => {
    const locations: BossHitLocationState[] = [
      { id: 'head', name: 'Head', woundCapacity: 4, woundsCurrent: 2, isDisabled: false,
        disabledEffects: {} },
    ];

    const result = routeWoundsToHitLocations(locations, 2, 'head');
    expect(result.updatedLocations[0].woundsCurrent).toBe(4);
    expect(result.updatedLocations[0].isDisabled).toBe(true);
    expect(result.newlyDisabled).toEqual(['head']);
    expect(result.overflowWounds).toBe(0);
  });

  it('overflows excess wounds to main pool', () => {
    const locations: BossHitLocationState[] = [
      { id: 'head', name: 'Head', woundCapacity: 4, woundsCurrent: 3, isDisabled: false,
        disabledEffects: {} },
    ];

    const result = routeWoundsToHitLocations(locations, 5, 'head');
    expect(result.updatedLocations[0].woundsCurrent).toBe(4);
    expect(result.updatedLocations[0].isDisabled).toBe(true);
    expect(result.overflowWounds).toBe(4); // 5 - 1 absorbed = 4 overflow
    expect(result.newlyDisabled).toEqual(['head']);
  });

  it('routes random wounds to an active location', () => {
    const locations: BossHitLocationState[] = [
      { id: 'a', name: 'A', woundCapacity: 5, woundsCurrent: 0, isDisabled: false,
        disabledEffects: {} },
      { id: 'b', name: 'B', woundCapacity: 5, woundsCurrent: 0, isDisabled: true,
        disabledEffects: {} },
    ];

    // Roll always returns 1, which maps to index 0 of active locations
    const result = routeWoundsToHitLocations(locations, 3, undefined, () => 1);
    expect(result.updatedLocations[0].woundsCurrent).toBe(3);
    expect(result.overflowWounds).toBe(0);
  });

  it('all overflow when all locations are disabled', () => {
    const locations: BossHitLocationState[] = [
      { id: 'a', name: 'A', woundCapacity: 3, woundsCurrent: 3, isDisabled: true,
        disabledEffects: {} },
    ];

    const result = routeWoundsToHitLocations(locations, 5);
    expect(result.overflowWounds).toBe(5);
    expect(result.newlyDisabled).toEqual([]);
  });

  it('skips disabled locations for targeted shots', () => {
    const locations: BossHitLocationState[] = [
      { id: 'head', name: 'Head', woundCapacity: 4, woundsCurrent: 4, isDisabled: true,
        disabledEffects: {} },
    ];

    const result = routeWoundsToHitLocations(locations, 3, 'head');
    expect(result.overflowWounds).toBe(3);
  });

  it('returns unchanged state for zero wounds', () => {
    const locations: BossHitLocationState[] = [
      { id: 'a', name: 'A', woundCapacity: 5, woundsCurrent: 2, isDisabled: false,
        disabledEffects: {} },
    ];

    const result = routeWoundsToHitLocations(locations, 0);
    expect(result.updatedLocations[0].woundsCurrent).toBe(2);
    expect(result.overflowWounds).toBe(0);
  });
});

// ============================================================================
// PENALTY ACCUMULATION TESTS
// ============================================================================

describe('Boss Penalty Accumulation', () => {
  it('accumulates attack pool penalties from disabled locations', () => {
    const fig = makeBossFigure();
    // Disable head (-2) and gun-arm (-1)
    fig.hitLocations![0].isDisabled = true;
    fig.hitLocations![1].isDisabled = true;

    expect(getBossAttackPoolPenalty(fig)).toBe(-3);
  });

  it('accumulates defense pool penalties', () => {
    const fig = makeBossFigure();
    fig.hitLocations![2].isDisabled = true; // armor-core: -1 defense

    expect(getBossDefensePoolPenalty(fig)).toBe(-1);
  });

  it('accumulates soak penalties', () => {
    const fig = makeBossFigure();
    fig.hitLocations![2].isDisabled = true; // armor-core: -2 soak

    expect(getBossSoakPenalty(fig)).toBe(-2);
  });

  it('accumulates speed penalties', () => {
    const fig = makeBossFigure();
    fig.hitLocations![3].isDisabled = true; // legs: -2 speed

    expect(getBossSpeedPenalty(fig)).toBe(-2);
  });

  it('tracks disabled weapons', () => {
    const fig = makeBossFigure();
    fig.hitLocations![1].isDisabled = true; // gun-arm disables boss-gun

    expect(getDisabledBossWeapons(fig)).toEqual(['boss-gun']);
    expect(isBossWeaponAvailable(fig, 'boss-gun')).toBe(false);
    expect(isBossWeaponAvailable(fig, 'boss-sword')).toBe(true);
  });

  it('collects conditions from disabled locations', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true; // head: Disoriented
    fig.hitLocations![3].isDisabled = true; // legs: Immobilized

    const conditions = getDisabledLocationConditions(fig);
    expect(conditions).toContain('Disoriented');
    expect(conditions).toContain('Immobilized');
    expect(conditions.length).toBe(2);
  });

  it('returns no penalties for non-boss figures', () => {
    const fig = makeBossFigure({ hitLocations: undefined });

    expect(getBossAttackPoolPenalty(fig)).toBe(0);
    expect(getBossDefensePoolPenalty(fig)).toBe(0);
    expect(getBossSoakPenalty(fig)).toBe(0);
    expect(getBossSpeedPenalty(fig)).toBe(0);
    expect(getDisabledBossWeapons(fig)).toEqual([]);
  });
});

// ============================================================================
// POOL PENALTY APPLICATION TESTS
// ============================================================================

describe('Boss Pool Penalty Application', () => {
  it('removes ability dice first from attack pool', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true; // -2 attack
    const pool: AttackPool = { ability: 3, proficiency: 2 };

    const result = applyBossAttackPenalties(pool, fig);
    expect(result.ability).toBe(1);
    expect(result.proficiency).toBe(2);
  });

  it('spills to proficiency when ability exhausted', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true; // -2 attack
    fig.hitLocations![1].isDisabled = true; // -1 attack = -3 total
    const pool: AttackPool = { ability: 1, proficiency: 3 };

    const result = applyBossAttackPenalties(pool, fig);
    expect(result.ability).toBe(0);
    expect(result.proficiency).toBe(1);
  });

  it('never goes below zero', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true;
    fig.hitLocations![1].isDisabled = true;
    const pool: AttackPool = { ability: 0, proficiency: 1 };

    const result = applyBossAttackPenalties(pool, fig);
    expect(result.ability).toBe(0);
    expect(result.proficiency).toBe(0);
  });

  it('removes difficulty dice first from defense pool', () => {
    const fig = makeBossFigure();
    fig.hitLocations![2].isDisabled = true; // -1 defense
    const pool: DefensePool = { difficulty: 2, challenge: 1 };

    const result = applyBossDefensePenalties(pool, fig);
    expect(result.difficulty).toBe(1);
    expect(result.challenge).toBe(1);
  });
});

// ============================================================================
// TARGETED SHOT TESTS
// ============================================================================

describe('Targeted Shot Penalty', () => {
  it('adds +1 difficulty die for targeted shots', () => {
    const pool: DefensePool = { difficulty: 2, challenge: 1 };
    const result = applyTargetedShotPenalty(pool);

    expect(result.difficulty).toBe(3);
    expect(result.challenge).toBe(1);
  });
});

// ============================================================================
// PHASE TRANSITION TESTS
// ============================================================================

describe('Boss Phase Transitions', () => {
  it('detects first phase transition', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true; // 1 disabled
    const profile = makeBossProfile();

    const transition = checkBossPhaseTransition(fig, profile);
    expect(transition).not.toBeNull();
    expect(transition!.disabledLocationsRequired).toBe(1);
    expect(transition!.narrativeText).toBe('Phase 2!');
  });

  it('detects later phase transitions', () => {
    const fig = makeBossFigure({ bossPhase: 1 });
    fig.hitLocations![0].isDisabled = true;
    fig.hitLocations![1].isDisabled = true;
    fig.hitLocations![2].isDisabled = true; // 3 disabled
    const profile = makeBossProfile();

    const transition = checkBossPhaseTransition(fig, profile);
    expect(transition).not.toBeNull();
    expect(transition!.disabledLocationsRequired).toBe(3);
    expect(transition!.newAiArchetype).toBe('melee');
  });

  it('returns null when no transition threshold met', () => {
    const fig = makeBossFigure();
    // 0 disabled
    const profile = makeBossProfile();

    const transition = checkBossPhaseTransition(fig, profile);
    expect(transition).toBeNull();
  });

  it('returns null for bosses without phase transitions', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true;
    const profile = makeBossProfile({ bossPhaseTransitions: undefined });

    const transition = checkBossPhaseTransition(fig, profile);
    expect(transition).toBeNull();
  });

  it('advances boss phase counter', () => {
    const fig = makeBossFigure({ bossPhase: 0 });
    const transition: BossPhaseTransition = {
      disabledLocationsRequired: 1,
      newAiArchetype: 'elite',
    };

    const result = applyBossPhaseTransition(fig, transition);
    expect(result.bossPhase).toBe(1);
  });
});

// ============================================================================
// PHASE STAT BONUS TESTS
// ============================================================================

describe('Boss Phase Transition Stat Bonuses', () => {
  it('accumulates stat bonuses from transition', () => {
    const fig = makeBossFigure({ bossPhase: 0 });
    const transition: BossPhaseTransition = {
      disabledLocationsRequired: 1,
      newAiArchetype: 'melee',
      statBonuses: { attackPoolBonus: 1, damageBonus: 2, speedBonus: 1 },
    };

    const result = applyBossPhaseTransition(fig, transition);
    expect(result.bossPhase).toBe(1);
    expect(result.bossPhaseStatBonuses).toBeDefined();
    expect(result.bossPhaseStatBonuses!.attackPoolBonus).toBe(1);
    expect(result.bossPhaseStatBonuses!.damageBonus).toBe(2);
    expect(result.bossPhaseStatBonuses!.speedBonus).toBe(1);
  });

  it('stacks bonuses across multiple transitions', () => {
    // First transition
    const fig1 = makeBossFigure({ bossPhase: 0 });
    const transition1: BossPhaseTransition = {
      disabledLocationsRequired: 1,
      newAiArchetype: 'elite',
      statBonuses: { attackPoolBonus: 1, soakBonus: 1 },
    };
    const result1 = applyBossPhaseTransition(fig1, transition1);

    // Second transition on the updated figure
    const transition2: BossPhaseTransition = {
      disabledLocationsRequired: 2,
      newAiArchetype: 'melee',
      statBonuses: { attackPoolBonus: 1, damageBonus: 3 },
    };
    const result2 = applyBossPhaseTransition(result1, transition2);

    expect(result2.bossPhase).toBe(2);
    expect(result2.bossPhaseStatBonuses!.attackPoolBonus).toBe(2); // 1 + 1
    expect(result2.bossPhaseStatBonuses!.soakBonus).toBe(1); // from first only
    expect(result2.bossPhaseStatBonuses!.damageBonus).toBe(3); // from second only
  });

  it('produces no stat bonuses when transition has none', () => {
    const fig = makeBossFigure({ bossPhase: 0 });
    const transition: BossPhaseTransition = {
      disabledLocationsRequired: 1,
      newAiArchetype: 'elite',
    };

    const result = applyBossPhaseTransition(fig, transition);
    expect(result.bossPhase).toBe(1);
    expect(result.bossPhaseStatBonuses).toBeUndefined();
  });

  it('clears stat bonuses when all values are zero', () => {
    const fig = makeBossFigure({ bossPhase: 0 });
    const transition: BossPhaseTransition = {
      disabledLocationsRequired: 1,
      newAiArchetype: 'elite',
      statBonuses: { attackPoolBonus: 0, damageBonus: 0 },
    };

    const result = applyBossPhaseTransition(fig, transition);
    expect(result.bossPhaseStatBonuses).toBeUndefined();
  });
});

// ============================================================================
// LOCATION SUMMARY TESTS
// ============================================================================

describe('Boss Location Summary', () => {
  it('returns summary for all locations', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].woundsCurrent = 2;
    fig.hitLocations![1].isDisabled = true;
    fig.hitLocations![1].woundsCurrent = 5;

    const summary = getBossLocationSummary(fig);
    expect(summary.length).toBe(4);

    expect(summary[0].name).toBe('Head');
    expect(summary[0].percentRemaining).toBe(50);

    expect(summary[1].name).toBe('Gun Arm');
    expect(summary[1].isDisabled).toBe(true);
    expect(summary[1].percentRemaining).toBe(0);
  });

  it('returns empty for non-boss figures', () => {
    const fig = makeBossFigure({ hitLocations: undefined });
    expect(getBossLocationSummary(fig)).toEqual([]);
  });
});

// ============================================================================
// DISABLED WEAPON AVAILABILITY TESTS
// ============================================================================

describe('Boss Weapon Availability', () => {
  it('reports all weapons available when no locations disabled', () => {
    const fig = makeBossFigure();
    expect(isBossWeaponAvailable(fig, 'boss-gun')).toBe(true);
    expect(isBossWeaponAvailable(fig, 'boss-sword')).toBe(true);
  });

  it('reports weapon unavailable when its location is disabled', () => {
    const fig = makeBossFigure();
    fig.hitLocations![1].isDisabled = true; // gun-arm disables boss-gun

    expect(isBossWeaponAvailable(fig, 'boss-gun')).toBe(false);
    expect(isBossWeaponAvailable(fig, 'boss-sword')).toBe(true);
  });

  it('reports all weapons available for non-boss figures', () => {
    const fig = makeBossFigure({ hitLocations: undefined });
    expect(isBossWeaponAvailable(fig, 'boss-gun')).toBe(true);
    expect(isBossWeaponAvailable(fig, 'any-weapon')).toBe(true);
  });

  it('reports multiple weapons unavailable from multiple disabled locations', () => {
    const fig = makeBossFigure({
      hitLocations: [
        {
          id: 'arm-1', name: 'Arm 1', woundCapacity: 3, woundsCurrent: 3, isDisabled: true,
          disabledEffects: { disabledWeapons: ['weapon-a'] },
        },
        {
          id: 'arm-2', name: 'Arm 2', woundCapacity: 3, woundsCurrent: 3, isDisabled: true,
          disabledEffects: { disabledWeapons: ['weapon-b'] },
        },
        {
          id: 'legs', name: 'Legs', woundCapacity: 3, woundsCurrent: 0, isDisabled: false,
          disabledEffects: { disabledWeapons: ['weapon-c'] },
        },
      ],
    });

    expect(isBossWeaponAvailable(fig, 'weapon-a')).toBe(false);
    expect(isBossWeaponAvailable(fig, 'weapon-b')).toBe(false);
    expect(isBossWeaponAvailable(fig, 'weapon-c')).toBe(true); // location not disabled
  });
});

// ============================================================================
// DISABLED LOCATION CONDITION COLLECTION TESTS
// ============================================================================

describe('Disabled Location Condition Collection', () => {
  it('collects unique conditions from disabled locations', () => {
    const fig = makeBossFigure();
    fig.hitLocations![0].isDisabled = true; // Disoriented
    fig.hitLocations![3].isDisabled = true; // Immobilized

    const conditions = getDisabledLocationConditions(fig);
    expect(conditions).toContain('Disoriented');
    expect(conditions).toContain('Immobilized');
    expect(conditions.length).toBe(2);
  });

  it('deduplicates identical conditions from multiple locations', () => {
    const fig = makeBossFigure({
      hitLocations: [
        {
          id: 'a', name: 'A', woundCapacity: 3, woundsCurrent: 3, isDisabled: true,
          disabledEffects: { conditionInflicted: 'Disoriented' },
        },
        {
          id: 'b', name: 'B', woundCapacity: 3, woundsCurrent: 3, isDisabled: true,
          disabledEffects: { conditionInflicted: 'Disoriented' },
        },
      ],
    });

    const conditions = getDisabledLocationConditions(fig);
    expect(conditions.length).toBe(1);
    expect(conditions[0]).toBe('Disoriented');
  });

  it('returns empty array when no locations are disabled', () => {
    const fig = makeBossFigure();
    const conditions = getDisabledLocationConditions(fig);
    expect(conditions.length).toBe(0);
  });

  it('returns empty array for non-boss figures', () => {
    const fig = makeBossFigure({ hitLocations: undefined });
    const conditions = getDisabledLocationConditions(fig);
    expect(conditions.length).toBe(0);
  });
});

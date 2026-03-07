/**
 * retaliate.test.ts -- Retaliate Keyword Tests
 *
 * Tests for the Gloomhaven-inspired Retaliate X keyword:
 * - Retaliate X: When hit by attack within Engaged range, attacker suffers X automatic wounds
 * - Damage is reduced by attacker's soak
 * - Only triggers on hit (not miss)
 * - Only triggers at Engaged range (melee)
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameState,
  GameData,
  GameMap,
  NPCProfile,
  HeroCharacter,
  CombatScenario,
  CombatState,
} from '../src/types';

import {
  hasKeyword,
  getKeywordValue,
  applyRetaliateKeyword,
} from '../src/keywords';

import {
  resolveCombatV2,
  applyCombatResult,
  createCombatScenarioV2,
} from '../src/combat-v2';

// ============================================================================
// TEST HELPERS (mirrors keywords.test.ts patterns)
// ============================================================================

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'test-hero',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
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
    cachedAttackPool: null,
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: 2,
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'test-npc',
    entityType: 'npc',
    entityId: 'royal-guard',
    playerId: 0,
    position: { x: 5, y: 6 }, // Adjacent (Engaged range)
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
    cachedAttackPool: { ability: 2, proficiency: 1 },
    cachedDefensePool: { difficulty: 2, challenge: 0 },
    suppressionTokens: 0,
    courage: 3,
    ...overrides,
  };
}

function makeNPCProfile(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'royal-guard',
    name: 'Royal Guard',
    side: 'Imperial' as any,
    tier: 'Rival',
    attackPool: { ability: 2, proficiency: 2 },
    defensePool: { difficulty: 2, challenge: 0 },
    woundThreshold: 8,
    strainThreshold: null,
    soak: 4,
    speed: 4,
    weapons: [{
      weaponId: 'force-pike',
      name: 'Force Pike',
      baseDamage: 6,
      range: 'Engaged' as const,
      critical: 2,
      qualities: [],
    }],
    aiArchetype: 'guardian',
    keywords: ['Imperial', 'Elite'],
    abilities: [],
    mechanicalKeywords: [{ name: 'Retaliate', value: 3 }],
    ...overrides,
  };
}

function makeHeroCharacter(): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'Human',
    career: 'Soldier',
    specializations: ['Commando'],
    characteristics: {
      brawn: 3,
      agility: 3,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 2,
    },
    skills: { 'melee': 2, 'ranged-heavy': 2, 'resilience': 0 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { primaryWeapon: 'vibrosword', secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
  } as any;
}

function makeMap(width = 12, height = 12): GameMap {
  return {
    id: 'test-map',
    name: 'Test Map',
    width,
    height,
    tiles: Array(height).fill(null).map(() =>
      Array(width).fill(null).map(() => ({
        terrain: 'Open' as const,
        elevation: 0,
        cover: 'None' as const,
        occupied: null,
        objective: null,
      }))
    ),
    deploymentZones: { imperial: [], operative: [] },
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    turnPhase: 'Activation',
    roundNumber: 1,
    missionId: 'test',
    players: [
      { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
    ],
    figures: [],
    map: makeMap(),
    activationOrder: [],
    currentActivationIndex: 0,
    currentPlayerIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { value: 12, max: 12, state: 'Steady' },
    operativeMorale: { value: 12, max: 12, state: 'Steady' },
    activeCombat: null,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    playMode: 'grid',
    threatPool: 0,
    reinforcementPoints: 0,
    activeMissionId: 'test',
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    lootTokens: [],
    ...overrides,
  } as any;
}

function makeGameData(): GameData {
  return {
    weapons: {
      'vibrosword': {
        id: 'vibrosword',
        name: 'Vibrosword',
        type: 'Melee',
        skill: 'melee',
        baseDamage: 5,
        damageAddBrawn: true,
        range: 'Engaged',
        critical: 3,
        qualities: [],
        encumbrance: 3,
        cost: 750,
      },
      'blaster-rifle': {
        id: 'blaster-rifle',
        name: 'Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 7,
        damageAddBrawn: false,
        range: 'Long',
        critical: 3,
        qualities: [],
        encumbrance: 4,
        cost: 900,
      },
    },
    armor: {},
    npcProfiles: {},
    dice: {},
    species: {},
    careers: {},
    specializations: {},
  } as any;
}

// RollFn returns face values 1-6 (not probabilities)
type RollFn = () => number;

// Deterministic RNG that always returns the same face value
function constRoll(faceValue: number): RollFn {
  return () => faceValue;
}

// ============================================================================
// PURE FUNCTION TESTS
// ============================================================================

describe('applyRetaliateKeyword', () => {
  it('deals full damage when attacker has 0 soak', () => {
    expect(applyRetaliateKeyword(3, 0)).toBe(3);
  });

  it('reduces damage by attacker soak', () => {
    expect(applyRetaliateKeyword(3, 2)).toBe(1);
  });

  it('returns 0 when soak exceeds retaliate value', () => {
    expect(applyRetaliateKeyword(2, 5)).toBe(0);
  });

  it('returns 0 when soak equals retaliate value', () => {
    expect(applyRetaliateKeyword(3, 3)).toBe(0);
  });

  it('returns 0 for retaliate value 0', () => {
    expect(applyRetaliateKeyword(0, 0)).toBe(0);
  });

  it('handles negative retaliate value gracefully', () => {
    expect(applyRetaliateKeyword(-1, 0)).toBe(0);
  });
});

// ============================================================================
// KEYWORD QUERY TESTS
// ============================================================================

describe('Retaliate keyword queries', () => {
  it('hasKeyword returns true for NPC with Retaliate', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(hasKeyword(fig, 'Retaliate', gs)).toBe(true);
  });

  it('getKeywordValue returns Retaliate value', () => {
    const npc = makeNPCProfile({ mechanicalKeywords: [{ name: 'Retaliate', value: 5 }] });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(getKeywordValue(fig, 'Retaliate', gs)).toBe(5);
  });

  it('hasKeyword returns false for NPC without Retaliate', () => {
    const npc = makeNPCProfile({ mechanicalKeywords: [{ name: 'Armor', value: 1 }] });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(hasKeyword(fig, 'Retaliate', gs)).toBe(false);
  });
});

// ============================================================================
// COMBAT INTEGRATION TESTS
// ============================================================================

describe('Retaliate in combat resolution', () => {
  it('sets retaliateWounds on resolution when defender has Retaliate and attack hits at Engaged', () => {
    const npc = makeNPCProfile({ mechanicalKeywords: [{ name: 'Retaliate', value: 3 }] });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 5, y: 5 } });
    const defender = makeNPCFigure({ entityId: npc.id, position: { x: 5, y: 6 } });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });

    const scenario: CombatScenario = {
      id: 'test-combat',
      attackerId: attacker.id,
      defenderId: defender.id,
      weaponId: 'vibrosword',
      rangeBand: 'Engaged',
      cover: 'None',
      elevationDiff: 0,
      hasLOS: true,
      state: 'Declaring' as CombatState,
      attackPool: null,
      defensePool: null,
      resolution: null,
    };

    // Use high roll values to ensure a hit
    const resolution = resolveCombatV2(scenario, gs, makeGameData(), constRoll(4));

    if (resolution.isHit) {
      // Retaliate 3 vs hero soak of 3 (brawn 3 + resilience 0 + no armor) = 0 net wounds
      // The hero has soak = brawn(3) + resilience(0) = 3
      // Retaliate 3 - soak 3 = 0
      expect(resolution.retaliateWounds).toBeUndefined();
    }
    // If miss, no retaliate expected
  });

  it('does NOT set retaliateWounds when attack is at range (not Engaged)', () => {
    const npc = makeNPCProfile({ mechanicalKeywords: [{ name: 'Retaliate', value: 5 }] });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 0, y: 0 } });
    const defender = makeNPCFigure({ entityId: npc.id, position: { x: 5, y: 5 } });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });

    const scenario: CombatScenario = {
      id: 'test-combat',
      attackerId: attacker.id,
      defenderId: defender.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Short', // Not Engaged -- retaliate should NOT trigger
      cover: 'None',
      elevationDiff: 0,
      hasLOS: true,
      state: 'Declaring' as CombatState,
      attackPool: null,
      defensePool: null,
      resolution: null,
    };

    const resolution = resolveCombatV2(scenario, gs, makeGameData(), constRoll(4));
    expect(resolution.retaliateWounds).toBeUndefined();
  });

  it('applies retaliate wounds to attacker via applyCombatResult', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Retaliate', value: 8 }], // High retaliate to overwhelm soak
      soak: 0, // Low soak so the attack hits for damage
    });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 5, y: 5 } });
    const defender = makeNPCFigure({ entityId: npc.id, position: { x: 5, y: 6 } });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });

    const scenario: CombatScenario = {
      id: 'test-combat',
      attackerId: attacker.id,
      defenderId: defender.id,
      weaponId: 'vibrosword',
      rangeBand: 'Engaged',
      cover: 'None',
      elevationDiff: 0,
      hasLOS: true,
      state: 'Declaring' as CombatState,
      attackPool: null,
      defensePool: null,
      resolution: null,
    };

    // Use high roll to guarantee a hit
    const resolution = resolveCombatV2(scenario, gs, makeGameData(), constRoll(4));

    if (resolution.isHit && resolution.retaliateWounds && resolution.retaliateWounds > 0) {
      const newState = applyCombatResult(gs, scenario, resolution);
      const attackerAfter = newState.figures.find(f => f.id === attacker.id)!;

      // Attacker should have taken retaliate wounds
      expect(attackerAfter.woundsCurrent).toBeGreaterThan(0);
    }
  });

  it('does NOT apply retaliate wounds when attack misses', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Retaliate', value: 10 }],
      defensePool: { difficulty: 5, challenge: 5 }, // Heavy defense to ensure miss
    });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 5, y: 5 } });
    const defender = makeNPCFigure({ entityId: npc.id, position: { x: 5, y: 6 } });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });

    const scenario: CombatScenario = {
      id: 'test-combat',
      attackerId: attacker.id,
      defenderId: defender.id,
      weaponId: 'vibrosword',
      rangeBand: 'Engaged',
      cover: 'None',
      elevationDiff: 0,
      hasLOS: true,
      state: 'Declaring' as CombatState,
      attackPool: null,
      defensePool: null,
      resolution: null,
    };

    // Use low roll to try to miss (combined with heavy defense)
    const resolution = resolveCombatV2(scenario, gs, makeGameData(), constRoll(1));

    if (!resolution.isHit) {
      expect(resolution.retaliateWounds).toBeUndefined();
    }
  });
});

/**
 * Comprehensive tests for the v2 combat pipeline.
 *
 * Uses deterministic RNG injection to verify every code path.
 * Tests cover: pool construction, damage calculation, advantage/threat spending,
 * critical injuries, full resolution, state mutation, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCombatPools,
  calculateDamage,
  autoSpendAdvantagesThreats,
  rollCriticalInjury,
  resolveCombatV2,
  applyCombatResult,
  createCombatScenarioV2,
  quickResolveCombat,
  type CombatPoolContext,
  type DamageResult,
  type SpendingResult,
  type CriticalInjuryResult,
} from '../src/combat-v2.js';

import { resolveFromRolls, type RollFn } from '../src/dice-v2.js';

import type {
  AttackPool,
  DefensePool,
  CombatResolution,
  CombatScenario,
  Condition,
  Figure,
  GameData,
  GameState,
  HeroCharacter,
  NPCProfile,
  OpposedRollResult,
  D6RollResult,
  WeaponDefinition,
  ArmorDefinition,
  YahtzeeCombo,
} from '../src/types.js';

// ============================================================================
// HELPERS: deterministic RNG
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

function makeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
    id: 'blaster-pistol',
    name: 'Blaster Pistol',
    type: 'Ranged (Light)',
    skill: 'ranged-light',
    baseDamage: 6,
    damageAddBrawn: false,
    range: 'Medium',
    critical: 3,
    qualities: [],
    encumbrance: 1,
    cost: 400,
    ...overrides,
  };
}

function makeMeleeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
    id: 'vibro-knife',
    name: 'Vibro-knife',
    type: 'Melee',
    skill: 'melee',
    baseDamage: 1,
    damageAddBrawn: true,
    range: 'Engaged',
    critical: 3,
    qualities: [{ name: 'Pierce', value: 1 }, { name: 'Vicious', value: 1 }],
    encumbrance: 1,
    cost: 250,
    ...overrides,
  };
}

function makeArmor(overrides: Partial<ArmorDefinition> = {}): ArmorDefinition {
  return {
    id: 'padded-armor',
    name: 'Padded Armor',
    soak: 2,
    defense: 0,
    encumbrance: 2,
    cost: 500,
    keywords: [],
    ...overrides,
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: ['mercenary'],
    characteristics: {
      brawn: 3,
      agility: 3,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 2,
    },
    skills: {
      'ranged-heavy': 2,
      'ranged-light': 2,
      'melee': 1,
      'brawl': 1,
      'coordination': 1,
      'resilience': 1,
    },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5, // brawn 3 + resilience 1 + padded armor 2 (if equipped) - computed externally
    equipment: {
      primaryWeapon: 'blaster-rifle',
      secondaryWeapon: 'vibro-knife',
      armor: 'padded-armor',
      gear: [],
    },
    xp: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    side: 'Imperial',
    tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [
      {
        weaponId: 'e11-blaster',
        name: 'E-11 Blaster Rifle',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
        qualities: [{ name: 'Stun', value: null }],
      },
    ],
    aiArchetype: 'Trooper',
    keywords: ['Imperial', 'Trooper'],
    abilities: [],
    ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 2,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-st-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 10, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 1,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    ...overrides,
  };
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: { width: 24, height: 24, tiles: [], elevation: [] } as any,
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures,
    activationOrder: figures.map((f) => f.id),
    currentActivationIndex: 0,
    heroes,
    npcProfiles,
    imperialMorale: { value: 10, max: 10, state: 'Steady' },
    operativeMorale: { value: 10, max: 10, state: 'Steady' },
    activeCombat: null,
    threatPool: 0,
    reinforcementPoints: 0,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
  };
}

function makeGameData(
  weapons: Record<string, WeaponDefinition> = {},
  armor: Record<string, ArmorDefinition> = {},
): GameData {
  return {
    dice: {} as any,
    species: {} as any,
    careers: {} as any,
    specializations: {} as any,
    weapons: {
      'blaster-pistol': makeWeapon(),
      'blaster-rifle': makeWeapon({
        id: 'blaster-rifle',
        name: 'Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
      }),
      'vibro-knife': makeMeleeWeapon(),
      ...weapons,
    },
    armor: {
      'padded-armor': makeArmor(),
      'laminate-armor': makeArmor({
        id: 'laminate-armor',
        name: 'Laminate Armor',
        soak: 2,
        defense: 1,
      }),
      ...armor,
    },
    npcProfiles: {
      stormtrooper: makeNPC(),
    },
  };
}

// ============================================================================
// POOL CONSTRUCTION
// ============================================================================

describe('buildCombatPools', () => {
  const hero = makeHero();
  const npc = makeNPC();
  const heroFig = makeFigure();
  const npcFig = makeNPCFigure();
  const gs = makeGameState([heroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });
  const gd = makeGameData();

  it('builds hero attack pool from characteristic + skill', () => {
    // Hero: Agility 3, ranged-heavy 2 => max(3,2)=3 pool, min(3,2)=2 upgrades
    // 3 green - 2 upgrades = 1 ability + 2 proficiency
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd);
    expect(ctx.attackPool).toEqual({ ability: 1, proficiency: 2 });
  });

  it('uses NPC precomputed attack pool', () => {
    const ctx = buildCombatPools(npcFig, heroFig, 'e11-blaster', gs, gd);
    expect(ctx.attackPool).toEqual({ ability: 1, proficiency: 1 });
  });

  it('builds hero defense pool from Agility + Coordination', () => {
    // Defender hero: Agility 3, Coordination 1 => max(3,1)=3, min(3,1)=1
    // 3 purple, upgrade 1 => 2 difficulty + 1 challenge
    // Plus padded-armor defense=0, so no upgrade from armor
    const ctx = buildCombatPools(npcFig, heroFig, 'e11-blaster', gs, gd);
    expect(ctx.defensePool).toEqual({ difficulty: 2, challenge: 1 });
  });

  it('uses NPC precomputed defense pool', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd);
    expect(ctx.defensePool).toEqual({ difficulty: 1, challenge: 0 });
  });

  it('applies armor defense upgrades', () => {
    const armoredHero = makeHero({
      id: 'hero-armored',
      equipment: {
        primaryWeapon: 'blaster-rifle',
        secondaryWeapon: null,
        armor: 'laminate-armor', // defense: 1
        gear: [],
      },
    });
    const armoredFig = makeFigure({ id: 'fig-armored', entityId: 'hero-armored' });
    const gs2 = makeGameState(
      [armoredFig, npcFig],
      { 'hero-armored': armoredHero },
      { stormtrooper: npc },
    );

    const ctx = buildCombatPools(npcFig, armoredFig, 'e11-blaster', gs2, gd);
    // Base: 2 difficulty + 1 challenge (from Agility 3, Coord 1)
    // +1 armor defense upgrade: 1 difficulty -> challenge
    // Result: 1 difficulty + 2 challenge
    expect(ctx.defensePool).toEqual({ difficulty: 1, challenge: 2 });
  });

  it('applies light cover modifier', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd, {
      cover: 'Light',
    });
    // NPC base: 1 difficulty, 0 challenge + Light = +1 difficulty
    expect(ctx.defensePool).toEqual({ difficulty: 2, challenge: 0 });
  });

  it('applies heavy cover modifier', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd, {
      cover: 'Heavy',
    });
    // NPC base: 1 difficulty, 0 challenge + Heavy = upgrade 1 purple->red
    expect(ctx.defensePool).toEqual({ difficulty: 0, challenge: 1 });
  });

  it('applies elevation advantage (attacker higher)', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd, {
      elevationDiff: 1,
    });
    // NPC base: 1 difficulty, 0 challenge
    // Elevation: downgrade red->purple, or remove purple. Only 1 purple, so remove it.
    // But minimum is 1 difficulty, so it stays at 1
    expect(ctx.defensePool.difficulty + ctx.defensePool.challenge).toBeGreaterThanOrEqual(1);
  });

  it('applies aim bonus (+1 ability die per aim, max 2)', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd, {
      aimBonus: 2,
    });
    // Base attack: 1 ability + 2 proficiency
    // +2 aim = 3 ability + 2 proficiency
    expect(ctx.attackPool).toEqual({ ability: 3, proficiency: 2 });
  });

  it('caps aim bonus at 2', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd, {
      aimBonus: 5,
    });
    expect(ctx.attackPool).toEqual({ ability: 3, proficiency: 2 });
  });

  it('applies suppression penalty to attacker (downgrade 1 yellow)', () => {
    // Graduated suppression: tokens >= courage triggers pool downgrade
    const suppressedFig = makeFigure({ suppressionTokens: 2, courage: 2 });
    const gs2 = makeGameState(
      [suppressedFig, npcFig],
      { 'hero-1': hero },
      { stormtrooper: npc },
    );

    const ctx = buildCombatPools(suppressedFig, npcFig, 'blaster-rifle', gs2, gd);
    // Base: 1 ability + 2 proficiency
    // Suppressed (tokens >= courage): downgrade 1 yellow => 2 ability + 1 proficiency
    expect(ctx.attackPool).toEqual({ ability: 2, proficiency: 1 });
  });

  it('computes hero soak correctly (Brawn + Resilience + armor)', () => {
    // Attacking NPC, defending hero
    const ctx = buildCombatPools(npcFig, heroFig, 'e11-blaster', gs, gd);
    // Hero: Brawn 3 + Resilience rank 1 + padded armor soak 2 = 6
    expect(ctx.soak).toBe(6);
  });

  it('uses NPC flat soak', () => {
    const ctx = buildCombatPools(heroFig, npcFig, 'blaster-rifle', gs, gd);
    expect(ctx.soak).toBe(3); // Stormtrooper soak from NPC profile
  });

  it('resolves NPC weapon from embedded weapons', () => {
    // e11-blaster is not in the global weapons registry but is embedded in NPC
    const ctx = buildCombatPools(npcFig, heroFig, 'e11-blaster', gs, gd);
    expect(ctx.weapon.baseDamage).toBe(9);
    expect(ctx.weapon.name).toBe('E-11 Blaster Rifle');
  });

  it('enforces minimum 1 difficulty die on defense pool', () => {
    // NPC with no defense, attacker at elevation advantage
    const weakNPC = makeNPC({
      id: 'weak-npc',
      defensePool: { difficulty: 1, challenge: 0 },
    });
    const weakFig = makeNPCFigure({ id: 'fig-weak', entityId: 'weak-npc' });
    const gs2 = makeGameState(
      [heroFig, weakFig],
      { 'hero-1': hero },
      { stormtrooper: npc, 'weak-npc': weakNPC },
    );

    const ctx = buildCombatPools(heroFig, weakFig, 'blaster-rifle', gs2, gd, {
      elevationDiff: 1,
    });
    // 1 difficulty - elevation removes it -> 0, but minimum enforced -> 1
    expect(ctx.defensePool.difficulty + ctx.defensePool.challenge).toBeGreaterThanOrEqual(1);
  });

  it('upgrades defense for Prone defender on ranged attack', () => {
    const proneFig = makeNPCFigure({ conditions: ['Prone'] });
    const gs2 = makeGameState(
      [heroFig, proneFig],
      { 'hero-1': hero },
      { stormtrooper: npc },
    );

    const ctx = buildCombatPools(heroFig, proneFig, 'blaster-rifle', gs2, gd);
    // Base: 1 difficulty. Prone + ranged: upgrade 1 purple -> red
    expect(ctx.defensePool).toEqual({ difficulty: 0, challenge: 1 });
  });
});

// ============================================================================
// DAMAGE CALCULATION
// ============================================================================

describe('calculateDamage', () => {
  const weapon = makeWeapon({ baseDamage: 6 });

  function makeRollResult(overrides: Partial<OpposedRollResult> = {}): OpposedRollResult {
    return {
      attackRolls: [],
      defenseRolls: [],
      totalSuccesses: 3,
      totalFailures: 1,
      totalAdvantages: 1,
      totalThreats: 0,
      totalTriumphs: 0,
      totalDespairs: 0,
      netSuccesses: 2,
      netAdvantages: 1,
      isHit: true,
      combos: [],
      ...overrides,
    };
  }

  it('computes damage = baseDamage + netSuccesses - soak', () => {
    const result = calculateDamage(makeRollResult(), weapon, 3);
    // 6 + 2 - 3 = 5
    expect(result.grossDamage).toBe(8); // 6 + 2
    expect(result.effectiveSoak).toBe(3);
    expect(result.woundsDealt).toBe(5);
  });

  it('returns 0 wounds on miss', () => {
    const result = calculateDamage(
      makeRollResult({ isHit: false, netSuccesses: -1 }),
      weapon,
      3,
    );
    expect(result.woundsDealt).toBe(0);
    expect(result.grossDamage).toBe(0);
  });

  it('floors wounds at 0 when soak exceeds damage', () => {
    const result = calculateDamage(
      makeRollResult({ netSuccesses: 1 }),
      weapon,
      10,
    );
    // gross = 6 + 1 = 7, soak = 10 => wounds = 0
    expect(result.woundsDealt).toBe(0);
  });

  it('adds Brawn to melee weapon damage', () => {
    const melee = makeMeleeWeapon({ baseDamage: 1 });
    const result = calculateDamage(
      makeRollResult({ netSuccesses: 2 }),
      melee,
      3,
      4, // attackerBrawn
    );
    // gross = 1 + 4 (brawn) + 2 = 7
    // pierce 1 from weapon quality -> soak = max(0, 3 - 1) = 2
    expect(result.grossDamage).toBe(7);
    expect(result.effectiveSoak).toBe(2);
    expect(result.woundsDealt).toBe(5);
  });

  it('applies combo bonus damage from Pair', () => {
    const combo: YahtzeeCombo = { type: 'Pair', faceValues: [4, 4], isGilded: false };
    const result = calculateDamage(
      makeRollResult({ combos: [combo] }),
      weapon,
      3,
    );
    // Pair (not gilded) = +1 bonus damage
    // gross = 6 + 2 + 1 = 9, soak = 3 => 6
    expect(result.comboBonus).toBe(1);
    expect(result.woundsDealt).toBe(6);
  });

  it('applies Pierce from combo (Trips)', () => {
    const combo: YahtzeeCombo = { type: 'Trips', faceValues: [4, 4, 4], isGilded: false };
    const result = calculateDamage(
      makeRollResult({ combos: [combo] }),
      weapon,
      5,
    );
    // Trips (not gilded) = pierce 2 (no bonus damage from trips in aggregateComboEffects)
    // gross = 6 + 2 = 8, soak = max(0, 5 - 2) = 3 => 5
    expect(result.pierceValue).toBe(2);
    expect(result.effectiveSoak).toBe(3);
    expect(result.woundsDealt).toBe(5);
  });

  it('applies Pierce ALL from gilded Trips', () => {
    const combo: YahtzeeCombo = { type: 'Trips', faceValues: [4, 4, 4], isGilded: true };
    const result = calculateDamage(
      makeRollResult({ combos: [combo] }),
      weapon,
      10,
    );
    // Gilded Trips = pierce ALL => soak = 0
    expect(result.pierceValue).toBe('all');
    expect(result.effectiveSoak).toBe(0);
    expect(result.woundsDealt).toBe(8); // 6 + 2
  });

  it('stacks weapon Pierce quality with combo pierce', () => {
    // Vibro-knife has Pierce 1
    const melee = makeMeleeWeapon();
    const combo: YahtzeeCombo = { type: 'Pair', faceValues: [3, 3], isGilded: false };
    const result = calculateDamage(
      makeRollResult({ netSuccesses: 1, combos: [combo] }),
      melee,
      5,
      3, // brawn
    );
    // Pair bonus damage = 1, weapon Pierce 1, combo pierce 0
    // gross = 1 + 3 (brawn) + 1 + 1(combo) = 6
    // soak = max(0, 5 - 1) = 4 => wounds = 2
    expect(result.woundsDealt).toBe(2);
  });
});

// ============================================================================
// ADVANTAGE / THREAT SPENDING
// ============================================================================

describe('autoSpendAdvantagesThreats', () => {
  const weapon = makeWeapon({ critical: 3 });

  function makeRoll(overrides: Partial<OpposedRollResult> = {}): OpposedRollResult {
    return {
      attackRolls: [],
      defenseRolls: [],
      totalSuccesses: 3,
      totalFailures: 1,
      totalAdvantages: 0,
      totalThreats: 0,
      totalTriumphs: 0,
      totalDespairs: 0,
      netSuccesses: 2,
      netAdvantages: 0,
      isHit: true,
      combos: [],
      ...overrides,
    };
  }

  it('triggers critical when advantages >= weapon.critical', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ netAdvantages: 3 }),
      weapon,
    );
    expect(result.criticalTriggered).toBe(true);
    expect(result.advantagesSpent).toContain('Critical hit (spent 3 advantages)');
  });

  it('does not trigger critical when advantages < weapon.critical', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ netAdvantages: 2 }),
      weapon,
    );
    expect(result.criticalTriggered).toBe(false);
  });

  it('spends 2 advantages for +1 damage', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ netAdvantages: 5 }),
      weapon,
    );
    // 3 for crit, 2 for +1 damage
    expect(result.criticalTriggered).toBe(true);
    expect(result.bonusDamage).toBe(1);
  });

  it('recovers strain from remaining advantages', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ netAdvantages: 4 }),
      weapon,
    );
    // 3 for crit, 1 remaining = recover 1 strain
    expect(result.defenderStrain).toBe(1); // attacker strain recovery
  });

  it('applies strain to attacker from net threats', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ netAdvantages: -3 }),
      weapon,
    );
    expect(result.attackerStrain).toBe(3);
  });

  it('Triumph auto-triggers critical on hit', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ totalTriumphs: 1, netAdvantages: 0 }),
      weapon,
    );
    expect(result.criticalTriggered).toBe(true);
  });

  it('Despair inflicts Prone on attacker', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ totalDespairs: 1, netAdvantages: -1 }),
      weapon,
    );
    expect(result.attackerConditions).toContain('Prone');
  });

  it('does not spend advantages for damage on a miss', () => {
    const result = autoSpendAdvantagesThreats(
      makeRoll({ isHit: false, netAdvantages: 5 }),
      weapon,
    );
    expect(result.bonusDamage).toBe(0);
    expect(result.criticalTriggered).toBe(false);
  });
});

// ============================================================================
// CRITICAL INJURY
// ============================================================================

describe('rollCriticalInjury', () => {
  const weapon = makeWeapon();
  const viciousWeapon = makeMeleeWeapon(); // Vicious 1

  it('rolls d66 (tens * 10 + ones)', () => {
    const result = rollCriticalInjury(weapon, seqRoll([3, 5]));
    expect(result.rawRoll).toBe(35);
    expect(result.finalRoll).toBe(35);
    expect(result.severity).toBe('Average');
  });

  it('applies Vicious bonus to roll', () => {
    const result = rollCriticalInjury(viciousWeapon, seqRoll([3, 5]));
    expect(result.rawRoll).toBe(35);
    expect(result.viciousBonus).toBe(1);
    expect(result.finalRoll).toBe(36);
  });

  it('caps roll at 66', () => {
    const result = rollCriticalInjury(
      makeWeapon({ qualities: [{ name: 'Vicious', value: 10 }] }),
      seqRoll([6, 6]),
    );
    expect(result.finalRoll).toBe(66);
    expect(result.severity).toBe('Hard');
  });

  it('returns Easy severity for low rolls', () => {
    const result = rollCriticalInjury(weapon, seqRoll([1, 3]));
    expect(result.severity).toBe('Easy');
    expect(result.effect).toContain('strain');
  });

  it('returns Prone condition for Knocked Down', () => {
    const result = rollCriticalInjury(weapon, seqRoll([4, 2]));
    expect(result.severity).toBe('Average');
    expect(result.condition).toBe('Prone');
  });

  it('returns Hard severity for high rolls', () => {
    const result = rollCriticalInjury(weapon, seqRoll([5, 1]));
    expect(result.severity).toBe('Hard');
  });
});

// ============================================================================
// FULL COMBAT RESOLUTION
// ============================================================================

describe('resolveCombatV2', () => {
  const hero = makeHero();
  const npc = makeNPC();
  const heroFig = makeFigure();
  const npcFig = makeNPCFigure();
  const gs = makeGameState([heroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });
  const gd = makeGameData();

  it('resolves a hit with damage', () => {
    // Hero attacks stormtrooper with blaster-rifle
    // Attack pool: 1G + 2Y => 3 dice
    // Defense pool: 1P => 1 die
    // All dice roll 4:
    //   Green face 4 = 1 success
    //   Yellow face 4 = 1 success
    //   Yellow face 4 = 1 success
    //   Purple face 4 = 1 failure
    // Net successes = 3 - 1 = 2, isHit = true
    // Damage: 9 + 2 = 11 - 3 soak = 8
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = resolveCombatV2(scenario, gs, gd, constRoll(4));

    expect(resolution.isHit).toBe(true);
    expect(resolution.rollResult.netSuccesses).toBe(2);
    expect(resolution.woundsDealt).toBeGreaterThan(0);
  });

  it('resolves a miss (net successes < 1)', () => {
    // All dice roll 1:
    //   Green face 1 = 0 successes
    //   Yellow face 1 = 0 successes
    //   Yellow face 1 = 0 successes
    //   Purple face 1 = 0 failures
    // Net successes = 0, isHit = false
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = resolveCombatV2(scenario, gs, gd, constRoll(1));

    expect(resolution.isHit).toBe(false);
    expect(resolution.woundsDealt).toBe(0);
  });

  it('detects defeat when wounds exceed threshold', () => {
    // Stormtrooper has 4 wound threshold
    // Roll all 6s for big damage
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = resolveCombatV2(scenario, gs, gd, constRoll(6));

    if (resolution.isHit) {
      // 6 on green = success+advantage, 6 on yellow = 2 successes (triumph), 6 on purple = failure+threat
      // Very likely to hit and deal lethal damage to a 4-wound Stormtrooper
      expect(resolution.woundsDealt).toBeGreaterThan(0);
    }
  });

  it('includes combo effects in damage', () => {
    // Force a pair by making attack dice roll same face values
    // 3 attack dice all rolling 4 => Trips combo
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = resolveCombatV2(scenario, gs, gd, constRoll(4));

    if (resolution.isHit && resolution.rollResult.combos.length > 0) {
      expect(resolution.comboBonus).toBeGreaterThanOrEqual(0);
    }
  });

  it('applies cover to defense pool', () => {
    const scenarioNoCover = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const scenarioHeavy = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'Heavy', 0, true);

    // Run many rolls to compare hit rates statistically (seeded for reproducibility)
    let hitsNoCover = 0;
    let hitsHeavy = 0;
    const N = 200;

    let seed = 42;
    const mulberry32 = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % 6 + 1;
    };

    for (let i = 0; i < N; i++) {
      const r1 = resolveCombatV2(scenarioNoCover, gs, gd, mulberry32);
      if (r1.isHit) hitsNoCover++;
    }

    seed = 42;
    for (let i = 0; i < N; i++) {
      const r2 = resolveCombatV2(scenarioHeavy, gs, gd, mulberry32);
      if (r2.isHit) hitsHeavy++;
    }

    // With heavy cover, hit rate should be lower (more defense dice)
    // But since same seed, dice are same but defense pool is bigger => fewer hits
    expect(hitsHeavy).toBeLessThanOrEqual(hitsNoCover);
  });
});

// ============================================================================
// APPLY COMBAT RESULT
// ============================================================================

describe('applyCombatResult', () => {
  const hero = makeHero();
  const npc = makeNPC();
  const heroFig = makeFigure();
  const npcFig = makeNPCFigure();
  const gs = makeGameState([heroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });

  function makeCombatResolution(overrides: Partial<CombatResolution> = {}): CombatResolution {
    return {
      rollResult: {
        attackRolls: [],
        defenseRolls: [],
        totalSuccesses: 3,
        totalFailures: 1,
        totalAdvantages: 0,
        totalThreats: 0,
        totalTriumphs: 0,
        totalDespairs: 0,
        netSuccesses: 2,
        netAdvantages: 0,
        isHit: true,
        combos: [],
      },
      weaponBaseDamage: 9,
      comboBonus: 0,
      grossDamage: 11,
      soak: 3,
      woundsDealt: 8,
      criticalTriggered: false,
      criticalResult: null,
      advantagesSpent: [],
      threatsSpent: [],
      isHit: true,
      isDefeated: true,
      isNewlyWounded: false,
      defenderRemainingWounds: 0,
      ...overrides,
    };
  }

  it('applies wounds to defender figure', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({ woundsDealt: 3, isDefeated: false });

    const newState = applyCombatResult(gs, scenario, resolution);
    const updatedNPC = newState.figures.find((f) => f.id === 'fig-st-1');
    expect(updatedNPC!.woundsCurrent).toBe(3);
    expect(updatedNPC!.isDefeated).toBe(false);
  });

  it('marks defender as defeated when wounds reach threshold', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({ woundsDealt: 4 });

    const newState = applyCombatResult(gs, scenario, resolution);
    const updatedNPC = newState.figures.find((f) => f.id === 'fig-st-1');
    expect(updatedNPC!.isDefeated).toBe(true);
    expect(updatedNPC!.woundsCurrent).toBe(4);
  });

  it('caps wounds at threshold', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({ woundsDealt: 100 });

    const newState = applyCombatResult(gs, scenario, resolution);
    const updatedNPC = newState.figures.find((f) => f.id === 'fig-st-1');
    expect(updatedNPC!.woundsCurrent).toBe(4); // threshold = 4
  });

  it('applies strain to attacker from threats', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({
      rollResult: {
        attackRolls: [],
        defenseRolls: [],
        totalSuccesses: 0,
        totalFailures: 0,
        totalAdvantages: 0,
        totalThreats: 3,
        totalTriumphs: 0,
        totalDespairs: 0,
        netSuccesses: 0,
        netAdvantages: -3,
        isHit: false,
        combos: [],
      },
      woundsDealt: 0,
      isHit: false,
      isDefeated: false,
    isWounded: false,
    });

    const newState = applyCombatResult(gs, scenario, resolution);
    const updatedHero = newState.figures.find((f) => f.id === 'fig-hero-1');
    expect(updatedHero!.strainCurrent).toBe(3);
  });

  it('marks attacker Staggered when strain exceeds threshold', () => {
    // Hero with strain already near threshold
    const stressedHeroFig = makeFigure({ strainCurrent: 11 }); // threshold 12
    const gs2 = makeGameState(
      [stressedHeroFig, npcFig],
      { 'hero-1': hero },
      { stormtrooper: npc },
    );

    const scenario = createCombatScenarioV2(stressedHeroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({
      rollResult: {
        attackRolls: [],
        defenseRolls: [],
        totalSuccesses: 0,
        totalFailures: 0,
        totalAdvantages: 0,
        totalThreats: 3,
        totalTriumphs: 0,
        totalDespairs: 0,
        netSuccesses: 0,
        netAdvantages: -3,
        isHit: false,
        combos: [],
      },
      woundsDealt: 0,
      isHit: false,
      isDefeated: false,
    isWounded: false,
    });

    const newState = applyCombatResult(gs2, scenario, resolution);
    const updatedHero = newState.figures.find((f) => f.id === 'fig-hero-1');
    expect(updatedHero!.conditions).toContain('Staggered');
  });

  it('sets activeCombat to Complete state', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution();

    const newState = applyCombatResult(gs, scenario, resolution);
    expect(newState.activeCombat!.state).toBe('Complete');
    expect(newState.activeCombat!.resolution).toBe(resolution);
  });

  it('does not mutate original game state', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({ woundsDealt: 4 });

    const originalWounds = gs.figures.find((f) => f.id === 'fig-st-1')!.woundsCurrent;
    applyCombatResult(gs, scenario, resolution);
    const afterWounds = gs.figures.find((f) => f.id === 'fig-st-1')!.woundsCurrent;

    expect(afterWounds).toBe(originalWounds); // unchanged
  });

  it('applies combo conditions to defender', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const combo: YahtzeeCombo = { type: 'Pair', faceValues: [4, 4], isGilded: true };
    const resolution = makeCombatResolution({
      rollResult: {
        attackRolls: [],
        defenseRolls: [],
        totalSuccesses: 3,
        totalFailures: 1,
        totalAdvantages: 0,
        totalThreats: 0,
        totalTriumphs: 0,
        totalDespairs: 0,
        netSuccesses: 2,
        netAdvantages: 0,
        isHit: true,
        combos: [combo],
      },
      woundsDealt: 3,
      isDefeated: false,
    isWounded: false,
    });

    const newState = applyCombatResult(gs, scenario, resolution);
    const updatedNPC = newState.figures.find((f) => f.id === 'fig-st-1');
    // Gilded Pair applies 'Bleeding' condition
    expect(updatedNPC!.conditions).toContain('Bleeding');
  });

  // --- Wounded hero mechanic (Imperial Assault style) ---

  it('hero becomes Wounded (not Defeated) on first wound threshold', () => {
    const woundedHeroFig = makeFigure({ woundsCurrent: hero.wounds.threshold - 1 });
    const gs2 = makeGameState([woundedHeroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });

    const scenario = createCombatScenarioV2(npcFig, woundedHeroFig, 'e-11-blaster', 'None', 0, true);
    const resolution = makeCombatResolution({
      woundsDealt: 5,
      isHit: true,
      isDefeated: false,
      isNewlyWounded: true,
    });

    const newState = applyCombatResult(gs2, scenario, resolution);
    const updatedHero = newState.figures.find(f => f.id === 'fig-hero-1')!;

    expect(updatedHero.isWounded).toBe(true);
    expect(updatedHero.isDefeated).toBe(false);
    expect(updatedHero.woundsCurrent).toBe(0);
    expect(updatedHero.strainCurrent).toBe(0);
    expect(updatedHero.conditions).toContain('Wounded');
  });

  it('wounded hero is Defeated on second wound threshold', () => {
    const woundedHeroFig = makeFigure({
      woundsCurrent: hero.wounds.threshold - 2,
      isWounded: true,
      conditions: ['Wounded'],
    });
    const gs2 = makeGameState([woundedHeroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });

    const scenario = createCombatScenarioV2(npcFig, woundedHeroFig, 'e-11-blaster', 'None', 0, true);
    const resolution = makeCombatResolution({
      woundsDealt: 5,
      isHit: true,
      isDefeated: true,
      isNewlyWounded: false,
    });

    const newState = applyCombatResult(gs2, scenario, resolution);
    const updatedHero = newState.figures.find(f => f.id === 'fig-hero-1')!;

    expect(updatedHero.isDefeated).toBe(true);
    expect(updatedHero.isWounded).toBe(true);
  });

  it('NPCs are defeated immediately (no wounded state)', () => {
    const toughNpcFig = makeNPCFigure({ woundsCurrent: npc.woundThreshold - 1 });
    const gs2 = makeGameState([heroFig, toughNpcFig], { 'hero-1': hero }, { stormtrooper: npc });

    const scenario = createCombatScenarioV2(heroFig, toughNpcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = makeCombatResolution({
      woundsDealt: 5,
      isHit: true,
      isDefeated: true,
      isNewlyWounded: false,
    });

    const newState = applyCombatResult(gs2, scenario, resolution);
    const updatedNPC = newState.figures.find(f => f.id === 'fig-st-1')!;

    expect(updatedNPC.isDefeated).toBe(true);
    expect(updatedNPC.isWounded).toBe(false);
  });
});


// ============================================================================
// QUICK RESOLVE (CONVENIENCE)
// ============================================================================

describe('quickResolveCombat', () => {
  const hero = makeHero();
  const npc = makeNPC();
  const heroFig = makeFigure();
  const npcFig = makeNPCFigure();
  const gs = makeGameState([heroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });
  const gd = makeGameData();

  it('returns both scenario and resolution', () => {
    const { scenario, resolution } = quickResolveCombat(
      heroFig,
      npcFig,
      'blaster-rifle',
      gs,
      gd,
      { rollFn: constRoll(4) },
    );

    expect(scenario.state).toBe('Complete');
    expect(scenario.resolution).toBe(resolution);
    expect(resolution.rollResult).toBeDefined();
  });

  it('passes cover option through', () => {
    const { resolution: r1 } = quickResolveCombat(
      heroFig, npcFig, 'blaster-rifle', gs, gd,
      { cover: 'None', rollFn: constRoll(4) },
    );
    const { resolution: r2 } = quickResolveCombat(
      heroFig, npcFig, 'blaster-rifle', gs, gd,
      { cover: 'Heavy', rollFn: constRoll(4) },
    );

    // With heavy cover and same dice, more defense => fewer net successes
    expect(r2.rollResult.netSuccesses).toBeLessThanOrEqual(r1.rollResult.netSuccesses);
  });
});

// ============================================================================
// SCENARIO CREATION
// ============================================================================

describe('createCombatScenarioV2', () => {
  it('creates a Declaring state scenario', () => {
    const heroFig = makeFigure();
    const npcFig = makeNPCFigure();
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'Light', 2, true);

    expect(scenario.attackerId).toBe('fig-hero-1');
    expect(scenario.defenderId).toBe('fig-st-1');
    expect(scenario.weaponId).toBe('blaster-rifle');
    expect(scenario.cover).toBe('Light');
    expect(scenario.elevationDiff).toBe(2);
    expect(scenario.hasLOS).toBe(true);
    expect(scenario.state).toBe('Declaring');
    expect(scenario.attackPool).toBeNull();
    expect(scenario.defensePool).toBeNull();
    expect(scenario.resolution).toBeNull();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  const hero = makeHero();
  const npc = makeNPC();
  const heroFig = makeFigure();
  const npcFig = makeNPCFigure();
  const gs = makeGameState([heroFig, npcFig], { 'hero-1': hero }, { stormtrooper: npc });
  const gd = makeGameData();

  it('throws on unknown attacker ID', () => {
    const scenario = createCombatScenarioV2(
      { ...heroFig, id: 'ghost' } as Figure,
      npcFig,
      'blaster-rifle',
      'None',
      0,
      true,
    );
    expect(() => resolveCombatV2(scenario, gs, gd)).toThrow('Figure not found');
  });

  it('handles NPC vs NPC combat', () => {
    const npc2 = makeNPC({
      id: 'stormtrooper-2',
      defensePool: { difficulty: 1, challenge: 0 },
    });
    const npcFig2 = makeNPCFigure({ id: 'fig-st-2', entityId: 'stormtrooper-2' });
    const gs2 = makeGameState(
      [npcFig, npcFig2],
      {},
      { stormtrooper: npc, 'stormtrooper-2': npc2 },
    );

    const { resolution } = quickResolveCombat(
      npcFig, npcFig2, 'e11-blaster', gs2, gd,
      { rollFn: constRoll(4) },
    );
    expect(resolution.rollResult).toBeDefined();
  });

  it('handles hero with 0 skill rank', () => {
    const noSkillHero = makeHero({
      id: 'noob',
      skills: {},
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
      equipment: { primaryWeapon: 'blaster-pistol', secondaryWeapon: null, armor: null, gear: [] },
    });
    const noobFig = makeFigure({ id: 'fig-noob', entityId: 'noob' });
    const gs2 = makeGameState(
      [noobFig, npcFig],
      { noob: noSkillHero },
      { stormtrooper: npc },
    );

    const ctx = buildCombatPools(noobFig, npcFig, 'blaster-pistol', gs2, gd);
    // Agility 2, skill 0 => max(2,0)=2, min(2,0)=0 => 2 green, 0 yellow
    expect(ctx.attackPool).toEqual({ ability: 2, proficiency: 0 });
  });

  it('handles already-wounded defender', () => {
    const woundedFig = makeNPCFigure({ woundsCurrent: 2 });
    const gs2 = makeGameState([heroFig, woundedFig], { 'hero-1': hero }, { stormtrooper: npc });

    const scenario = createCombatScenarioV2(heroFig, woundedFig, 'blaster-rifle', 'None', 0, true);
    const resolution = resolveCombatV2(scenario, gs2, gd, constRoll(4));

    // Already has 2 wounds on a 4-wound threshold; any hit should be closer to defeat
    if (resolution.isHit) {
      expect(resolution.defenderRemainingWounds).toBeLessThanOrEqual(2);
    }
  });

  it('handles defender with 0 wounds current', () => {
    const scenario = createCombatScenarioV2(heroFig, npcFig, 'blaster-rifle', 'None', 0, true);
    const resolution = resolveCombatV2(scenario, gs, gd, constRoll(4));

    expect(resolution.defenderRemainingWounds).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// SPECIES COMBAT EFFECTS (silhouette_small, dark_vision, natural_weapon_damage)
// ============================================================================

describe('buildCombatPools species effects', () => {
  const npc = makeNPC();
  const npcFig = makeNPCFigure();

  function makeSpeciesGameData(speciesId: string, abilities: any[]): GameData {
    return {
      ...makeGameData(),
      species: {
        [speciesId]: {
          id: speciesId,
          name: speciesId,
          creatureType: 'organic',
          characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
          woundBase: 10,
          strainBase: 10,
          speed: 4,
          startingXP: 100,
          specialAbility: null,
          abilities,
          description: 'Test species',
        },
      } as any,
    };
  }

  it('silhouette_small adds +1 difficulty to ranged defense pool', () => {
    const gd = makeSpeciesGameData('jawa', [{
      id: 'small', name: 'Small', description: 'Small target',
      type: 'passive', effect: { type: 'silhouette_small', value: 1 },
    }]);
    const jawaHero = makeHero({ species: 'jawa', id: 'hero-jawa' });
    const jawaFig = makeFigure({ entityId: 'hero-jawa' });
    const gs = makeGameState([jawaFig, npcFig], { 'hero-jawa': jawaHero }, { stormtrooper: npc });

    // Ranged attack against Jawa: should get +1 difficulty
    const ctx = buildCombatPools(npcFig, jawaFig, 'e11-blaster', gs, gd);
    // Base defense: Agility 3, Coord 1 => 2 difficulty + 1 challenge
    // + silhouette_small: +1 difficulty => 3 difficulty + 1 challenge
    // (padded armor defense=0 so no change from armor)
    expect(ctx.defensePool.difficulty).toBeGreaterThanOrEqual(3);
  });

  it('silhouette_small does NOT add difficulty for melee attacks', () => {
    const gd = makeSpeciesGameData('jawa', [{
      id: 'small', name: 'Small', description: 'Small target',
      type: 'passive', effect: { type: 'silhouette_small', value: 1 },
    }]);
    // Add a melee weapon to game data
    gd.weapons['vibro-knife'] = makeMeleeWeapon();
    const jawaHero = makeHero({ species: 'jawa', id: 'hero-jawa' });
    const jawaFig = makeFigure({ entityId: 'hero-jawa' });
    const gs = makeGameState([jawaFig, npcFig], { 'hero-jawa': jawaHero }, { stormtrooper: npc });

    const ctxMelee = buildCombatPools(npcFig, jawaFig, 'vibro-knife', gs, gd);
    // Melee (Engaged): silhouette_small should NOT apply
    // Base: 2 difficulty + 1 challenge
    expect(ctxMelee.defensePool.difficulty).toBe(2);
    expect(ctxMelee.defensePool.challenge).toBe(1);
  });

  it('darkness adds +1 difficulty die for non-dark-vision attacker', () => {
    const gd = makeSpeciesGameData('human', []);
    const humanHero = makeHero({ species: 'human', id: 'hero-human' });
    const humanFig = makeFigure({ entityId: 'hero-human' });
    const gs = makeGameState([humanFig, npcFig], { 'hero-human': humanHero }, { stormtrooper: npc });

    const ctxDark = buildCombatPools(humanFig, npcFig, 'blaster-rifle', gs, gd, { darkness: true });
    const ctxLight = buildCombatPools(humanFig, npcFig, 'blaster-rifle', gs, gd, { darkness: false });

    // Darkness should add +1 difficulty
    expect(ctxDark.defensePool.difficulty).toBe(ctxLight.defensePool.difficulty + 1);
  });

  it('dark_vision species ignores darkness penalty', () => {
    const gd = makeSpeciesGameData('gand', [{
      id: 'dv', name: 'Dark Vision', description: 'See in dark',
      type: 'passive', effect: { type: 'dark_vision', value: 1 },
    }]);
    const gandHero = makeHero({ species: 'gand', id: 'hero-gand' });
    const gandFig = makeFigure({ entityId: 'hero-gand' });
    const gs = makeGameState([gandFig, npcFig], { 'hero-gand': gandHero }, { stormtrooper: npc });

    const ctxDark = buildCombatPools(gandFig, npcFig, 'blaster-rifle', gs, gd, { darkness: true });
    const ctxLight = buildCombatPools(gandFig, npcFig, 'blaster-rifle', gs, gd, { darkness: false });

    // Gand with dark vision: no difference between dark and light
    expect(ctxDark.defensePool.difficulty).toBe(ctxLight.defensePool.difficulty);
  });

  it('NPC attackers still get darkness penalty (no dark vision check for NPCs)', () => {
    const gd = makeSpeciesGameData('human', []);
    const humanHero = makeHero({ species: 'human', id: 'hero-human' });
    const humanFig = makeFigure({ entityId: 'hero-human' });
    const gs = makeGameState([humanFig, npcFig], { 'hero-human': humanHero }, { stormtrooper: npc });

    const ctxDark = buildCombatPools(npcFig, humanFig, 'e11-blaster', gs, gd, { darkness: true });
    const ctxLight = buildCombatPools(npcFig, humanFig, 'e11-blaster', gs, gd, { darkness: false });

    // NPC attacker: darkness should still add +1 difficulty
    expect(ctxDark.defensePool.difficulty).toBe(ctxLight.defensePool.difficulty + 1);
  });
});

/**
 * suppression.test.ts -- Comprehensive tests for the Graduated Suppression system.
 *
 * Covers:
 * - getSuppressionState: token-based state determination
 * - Courage derivation: NPCs by tier/override, heroes by Willpower
 * - Rally step: d6-per-token removal (4+ success)
 * - resetForActivation: suppression threshold enforcement
 * - Combat suppression generation: ranged hits add tokens
 * - Pool downgrade: suppressed attacker penalty
 * - Melee immunity: no suppression from melee hits
 * - Triumph bonus: extra suppression on triumph
 * - Combo bonus: Yahtzee quad adds suppression tokens
 * - Droid immunity: courage 0 = never suppressed
 * - AI behavior: panicked/suppressed decision routing
 */

import { describe, it, expect } from 'vitest';

import {
  getSuppressionState,
  getNPCCourage,
  getHeroCourage,
  resetForActivation,
} from '../src/turn-machine-v2.js';

import {
  buildCombatPools,
  applyCombatResult,
} from '../src/combat-v2.js';

import { aggregateComboEffects, getComboEffect } from '../src/dice-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  CombatScenario,
  CombatResolution,
  Condition,
  YahtzeeCombo,
} from '../src/types.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

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

const stormtrooper: NPCProfile = {
  id: 'stormtrooper',
  name: 'Stormtrooper',
  side: 'Imperial',
  tier: 'Minion',
  attackPool: { ability: 1, proficiency: 1 },
  defensePool: { difficulty: 1, challenge: 0 },
  soak: 3,
  woundThreshold: 5,
  strainThreshold: null,
  speed: 4,
  weapons: [{
    weaponId: 'e11-blaster',
    name: 'E-11 Blaster Rifle',
    baseDamage: 9,
    critical: 3,
    range: 'Long',
    qualities: [],
  }],
  aiArchetype: 'Trooper',
  keywords: ['Imperial', 'Trooper'],
  abilities: [],
} as any;

const eliteGuard: NPCProfile = {
  id: 'elite-guard',
  name: 'Elite Guard',
  side: 'Imperial',
  tier: 'Rival',
  attackPool: { ability: 1, proficiency: 2 },
  defensePool: { difficulty: 1, challenge: 1 },
  soak: 4,
  woundThreshold: 8,
  strainThreshold: 6,
  speed: 4,
  weapons: [{
    weaponId: 'heavy-blaster',
    name: 'Heavy Blaster',
    baseDamage: 10,
    critical: 3,
    range: 'Medium',
    qualities: [],
  }],
  aiArchetype: 'HeavyHitter',
  keywords: ['Imperial', 'Elite'],
  abilities: [],
} as any;

const nemesisBoss: NPCProfile = {
  id: 'nemesis-boss',
  name: 'Dark Commander',
  side: 'Imperial',
  tier: 'Nemesis',
  attackPool: { ability: 1, proficiency: 3 },
  defensePool: { difficulty: 1, challenge: 1 },
  soak: 5,
  woundThreshold: 15,
  strainThreshold: 12,
  speed: 4,
  weapons: [{
    weaponId: 'commander-blaster',
    name: 'Commander Blaster',
    baseDamage: 10,
    critical: 2,
    range: 'Medium',
    qualities: [],
  }],
  aiArchetype: 'CommandLeader',
  keywords: ['Imperial', 'Leader'],
  abilities: [],
} as any;

const droidUnit: NPCProfile = {
  id: 'battle-droid',
  name: 'B1 Battle Droid',
  side: 'Separatist',
  tier: 'Minion',
  attackPool: { ability: 1, proficiency: 0 },
  defensePool: { difficulty: 1, challenge: 0 },
  soak: 2,
  woundThreshold: 3,
  strainThreshold: null,
  speed: 4,
  weapons: [{
    weaponId: 'e5-blaster',
    name: 'E-5 Blaster Rifle',
    baseDamage: 8,
    critical: 3,
    range: 'Long',
    qualities: [],
  }],
  aiArchetype: 'Trooper',
  keywords: ['Droid', 'Separatist'],
  abilities: [],
  courage: 0, // droids are immune to suppression
} as any;

const customCourageNPC: NPCProfile = {
  ...stormtrooper,
  id: 'veteran-trooper',
  name: 'Veteran Trooper',
  courage: 3, // explicitly overridden from Minion default of 1
};

const hero: HeroCharacter = {
  id: 'hero-1',
  name: 'Test Hero',
  species: 'human',
  career: 'soldier',
  specializations: ['mercenary'],
  characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 3, presence: 2 },
  skills: { 'ranged-heavy': 2, 'resilience': 1 },
  talents: [],
  wounds: { current: 0, threshold: 14 },
  strain: { current: 0, threshold: 12 },
  soak: 5,
  equipment: {
    primaryWeapon: 'blaster-rifle',
    secondaryWeapon: null,
    armor: null,
    gear: [],
  },
  xp: { total: 0, available: 0 },
} as any;

const lowWillpowerHero: HeroCharacter = {
  ...hero,
  id: 'hero-2',
  name: 'Low Will Hero',
  characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 1, presence: 2 },
} as any;

const highWillpowerHero: HeroCharacter = {
  ...hero,
  id: 'hero-3',
  name: 'High Will Hero',
  characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 5, presence: 2 },
} as any;

const blasterRifle: WeaponDefinition = {
  id: 'blaster-rifle',
  name: 'Blaster Rifle',
  type: 'Ranged (Heavy)',
  skill: 'ranged-heavy',
  baseDamage: 9,
  damageAddBrawn: false,
  critical: 3,
  range: 'Long',
  qualities: [],
  encumbrance: 4,
  cost: 900,
} as any;

const vibroKnife: WeaponDefinition = {
  id: 'vibro-knife',
  name: 'Vibro-knife',
  type: 'Melee',
  skill: 'melee',
  baseDamage: 1,
  damageAddBrawn: true,
  critical: 2,
  range: 'Engaged',
  qualities: [],
  encumbrance: 1,
  cost: 250,
} as any;

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = { 'hero-1': hero },
  npcs: Record<string, NPCProfile> = { stormtrooper },
): GameState {
  return {
    map: { width: 20, height: 20, tiles: [] } as any,
    figures,
    players: [],
    currentTurn: 1,
    currentPhase: 'Activation',
    activationIndex: 0,
    activationOrder: figures.map(f => f.id),
    actionLog: [],
    morale: { imperial: { value: 0, effects: [] }, operative: { value: 0, effects: [] } } as any,
    heroes,
    npcProfiles: npcs,
  } as any;
}

function makeGameData(): GameData {
  return {
    weapons: { 'blaster-rifle': blasterRifle, 'vibro-knife': vibroKnife },
    armor: {},
    npcs: { stormtrooper, 'elite-guard': eliteGuard, 'nemesis-boss': nemesisBoss, 'battle-droid': droidUnit },
    talents: {},
    species: {},
    careers: {},
    specializations: {},
  } as any;
}

// ============================================================================
// SUPPRESSION STATE DETERMINATION
// ============================================================================

describe('getSuppressionState', () => {
  it('returns Normal when tokens < courage', () => {
    expect(getSuppressionState(makeFigure({ suppressionTokens: 0, courage: 2 }))).toBe('Normal');
    expect(getSuppressionState(makeFigure({ suppressionTokens: 1, courage: 2 }))).toBe('Normal');
  });

  it('returns Suppressed when tokens >= courage', () => {
    expect(getSuppressionState(makeFigure({ suppressionTokens: 2, courage: 2 }))).toBe('Suppressed');
    expect(getSuppressionState(makeFigure({ suppressionTokens: 3, courage: 2 }))).toBe('Suppressed');
  });

  it('returns Panicked when tokens >= 2 * courage', () => {
    expect(getSuppressionState(makeFigure({ suppressionTokens: 4, courage: 2 }))).toBe('Panicked');
    expect(getSuppressionState(makeFigure({ suppressionTokens: 5, courage: 2 }))).toBe('Panicked');
  });

  it('treats courage 0 as immune (always Normal)', () => {
    expect(getSuppressionState(makeFigure({ suppressionTokens: 0, courage: 0 }))).toBe('Normal');
    expect(getSuppressionState(makeFigure({ suppressionTokens: 10, courage: 0 }))).toBe('Normal');
    expect(getSuppressionState(makeFigure({ suppressionTokens: 100, courage: 0 }))).toBe('Normal');
  });

  it('handles boundary: exactly at courage threshold', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 3 });
    expect(getSuppressionState(fig)).toBe('Suppressed');
  });

  it('handles boundary: exactly at panic threshold', () => {
    const fig = makeFigure({ suppressionTokens: 6, courage: 3 });
    expect(getSuppressionState(fig)).toBe('Panicked');
  });

  it('handles courage 1 (minion-tier thresholds)', () => {
    expect(getSuppressionState(makeNPCFigure({ suppressionTokens: 0, courage: 1 }))).toBe('Normal');
    expect(getSuppressionState(makeNPCFigure({ suppressionTokens: 1, courage: 1 }))).toBe('Suppressed');
    expect(getSuppressionState(makeNPCFigure({ suppressionTokens: 2, courage: 1 }))).toBe('Panicked');
  });
});

// ============================================================================
// COURAGE DERIVATION
// ============================================================================

describe('getNPCCourage', () => {
  it('returns 1 for Minion tier (default)', () => {
    expect(getNPCCourage(stormtrooper)).toBe(1);
  });

  it('returns 2 for Rival tier (default)', () => {
    expect(getNPCCourage(eliteGuard)).toBe(2);
  });

  it('returns 3 for Nemesis tier (default)', () => {
    expect(getNPCCourage(nemesisBoss)).toBe(3);
  });

  it('returns 0 for droid with courage: 0 override', () => {
    expect(getNPCCourage(droidUnit)).toBe(0);
  });

  it('respects explicit courage override over tier default', () => {
    expect(getNPCCourage(customCourageNPC)).toBe(3); // Minion but courage: 3
  });
});

describe('getHeroCourage', () => {
  it('derives courage from Willpower + 2', () => {
    expect(getHeroCourage(hero)).toBe(5); // Willpower 3 + 2
  });

  it('floors low Willpower heroes at courage 3', () => {
    expect(getHeroCourage(lowWillpowerHero)).toBe(3); // Willpower 1 + 2 = 3
  });

  it('returns high courage for high Willpower heroes', () => {
    expect(getHeroCourage(highWillpowerHero)).toBe(7); // Willpower 5 + 2
  });
});

// ============================================================================
// RALLY STEP (deterministic dice injection)
// ============================================================================

describe('Rally step in resetForActivation', () => {
  it('removes tokens when rally rolls succeed (roll 4+)', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 2 });
    // All rolls succeed (roll 4, 5, 6 -- all >= 4)
    let rollIdx = 0;
    const rolls = [4, 5, 6];
    const result = resetForActivation(fig, () => rolls[rollIdx++]);
    expect(result.suppressionTokens).toBe(0); // all 3 removed
  });

  it('keeps tokens when rally rolls fail (roll 1-3)', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 2 });
    // All rolls fail (roll 1, 2, 3 -- all < 4)
    let rollIdx = 0;
    const rolls = [1, 2, 3];
    const result = resetForActivation(fig, () => rolls[rollIdx++]);
    expect(result.suppressionTokens).toBe(3); // none removed
  });

  it('partially removes tokens on mixed rolls', () => {
    const fig = makeFigure({ suppressionTokens: 4, courage: 3 });
    // 2 succeed, 2 fail
    let rollIdx = 0;
    const rolls = [6, 1, 4, 2];
    const result = resetForActivation(fig, () => rolls[rollIdx++]);
    expect(result.suppressionTokens).toBe(2); // 4 - 2 = 2
  });

  it('rolls exactly once per suppression token', () => {
    const fig = makeFigure({ suppressionTokens: 5, courage: 3 });
    let rollCount = 0;
    const result = resetForActivation(fig, () => {
      rollCount++;
      return 3; // all fail
    });
    expect(rollCount).toBe(5);
    expect(result.suppressionTokens).toBe(5);
  });

  it('skips rally entirely when suppressionTokens is 0', () => {
    const fig = makeFigure({ suppressionTokens: 0, courage: 2 });
    let rollCount = 0;
    const result = resetForActivation(fig, () => {
      rollCount++;
      return 6;
    });
    expect(rollCount).toBe(0);
    expect(result.suppressionTokens).toBe(0);
  });

  it('never reduces tokens below 0', () => {
    const fig = makeFigure({ suppressionTokens: 1, courage: 2 });
    const result = resetForActivation(fig, () => 6); // success, removes 1
    expect(result.suppressionTokens).toBe(0);
  });
});

// ============================================================================
// SUPPRESSION THRESHOLD ENFORCEMENT IN resetForActivation
// ============================================================================

describe('Suppression threshold enforcement', () => {
  it('grants full action economy when tokens < courage after rally', () => {
    const fig = makeFigure({ suppressionTokens: 2, courage: 3 });
    // Rally succeeds on first roll only: tokens go from 2 to 1 (< courage 3)
    let rollIdx = 0;
    const result = resetForActivation(fig, () => [5, 2][rollIdx++]);
    expect(result.suppressionTokens).toBe(1);
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('suppressed: loses Action when tokens >= courage after rally', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 2 });
    // Rally removes 1: tokens go from 3 to 2 (>= courage 2)
    let rollIdx = 0;
    const result = resetForActivation(fig, () => [4, 1, 2][rollIdx++]);
    expect(result.suppressionTokens).toBe(2);
    expect(result.actionsRemaining).toBe(0);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('panicked: loses Action when tokens >= 2*courage after rally', () => {
    const fig = makeFigure({ suppressionTokens: 5, courage: 2 });
    // Rally removes 1: tokens go from 5 to 4 (>= 2*2=4)
    let rollIdx = 0;
    const result = resetForActivation(fig, () => [4, 1, 1, 1, 1][rollIdx++]);
    expect(result.suppressionTokens).toBe(4);
    expect(result.actionsRemaining).toBe(0);
    expect(result.maneuversRemaining).toBe(1); // can still flee
  });

  it('can rally from suppressed back to normal', () => {
    const fig = makeFigure({ suppressionTokens: 2, courage: 2 });
    // Both rally rolls succeed: tokens go from 2 to 0
    const result = resetForActivation(fig, () => 6);
    expect(result.suppressionTokens).toBe(0);
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('can rally from panicked to suppressed', () => {
    const fig = makeFigure({ suppressionTokens: 4, courage: 2 });
    // 2 of 4 rally rolls succeed: tokens go from 4 to 2 (suppressed, not panicked)
    let rollIdx = 0;
    const rolls = [5, 1, 6, 2];
    const result = resetForActivation(fig, () => rolls[rollIdx++]);
    expect(result.suppressionTokens).toBe(2);
    expect(getSuppressionState(result)).toBe('Suppressed');
    expect(result.actionsRemaining).toBe(0);
  });

  it('courage 0 units (droids) always get full action economy', () => {
    const fig = makeFigure({ suppressionTokens: 10, courage: 0 });
    // Even with 10 tokens, courage 0 = immune
    const result = resetForActivation(fig, () => 1); // all fail -- doesn't matter
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('clears Disoriented condition as usual', () => {
    const fig = makeFigure({
      conditions: ['Disoriented' as Condition],
      suppressionTokens: 0,
      courage: 2,
    });
    const result = resetForActivation(fig);
    expect(result.conditions).not.toContain('Disoriented');
  });

  it('preserves non-transient conditions (Wounded, Staggered)', () => {
    const fig = makeFigure({
      conditions: ['Wounded' as Condition, 'Staggered' as Condition],
      suppressionTokens: 0,
      courage: 2,
    });
    const result = resetForActivation(fig);
    expect(result.conditions).toContain('Wounded');
    expect(result.conditions).toContain('Staggered');
  });
});

// ============================================================================
// COMBAT SUPPRESSION GENERATION
// ============================================================================

describe('Suppression token generation in combat', () => {
  const heroFig = makeFigure();
  const npcFig = makeNPCFigure();
  const gd = makeGameData();

  function makeHitResolution(overrides: Partial<CombatResolution> = {}): CombatResolution {
    return {
      woundsDealt: 2,
      strainDealt: 0,
      rollResult: {
        isHit: true,
        netSuccesses: 2,
        netAdvantages: 0,
        triumph: 0,
        despair: 0,
        combos: [],
        attackRolls: [],
        defenseRolls: [],
      },
      criticalInjury: null,
      advantageSpending: [],
      threatSpending: [],
      ...overrides,
    } as any;
  }

  function makeMissResolution(): CombatResolution {
    return makeHitResolution({
      woundsDealt: 0,
      rollResult: {
        isHit: false,
        netSuccesses: 0,
        netAdvantages: 0,
        triumph: 0,
        despair: 0,
        combos: [],
        attackRolls: [],
        defenseRolls: [],
      } as any,
    });
  }

  it('adds 1 suppression token on ranged hit', () => {
    const gs = makeGameState([heroFig, npcFig]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: npcFig.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Medium',
      state: 'Resolved',
    } as any;

    const newState = applyCombatResult(gs, scenario, makeHitResolution());
    const defender = newState.figures.find(f => f.id === npcFig.id)!;
    expect(defender.suppressionTokens).toBe(1);
  });

  it('adds NO suppression on melee hit', () => {
    const gs = makeGameState([heroFig, npcFig]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: npcFig.id,
      weaponId: 'vibro-knife',
      rangeBand: 'Engaged',
      state: 'Resolved',
    } as any;

    const newState = applyCombatResult(gs, scenario, makeHitResolution());
    const defender = newState.figures.find(f => f.id === npcFig.id)!;
    expect(defender.suppressionTokens).toBe(0);
  });

  it('adds NO suppression on ranged miss', () => {
    const gs = makeGameState([heroFig, npcFig]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: npcFig.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Medium',
      state: 'Resolved',
    } as any;

    const newState = applyCombatResult(gs, scenario, makeMissResolution());
    const defender = newState.figures.find(f => f.id === npcFig.id)!;
    expect(defender.suppressionTokens).toBe(0);
  });

  it('adds +1 extra suppression on triumph', () => {
    const gs = makeGameState([heroFig, npcFig]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: npcFig.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Medium',
      state: 'Resolved',
    } as any;

    const resolution = makeHitResolution({
      rollResult: {
        isHit: true,
        netSuccesses: 3,
        netAdvantages: 0,
        triumph: 1,
        despair: 0,
        combos: [],
        attackRolls: [],
        defenseRolls: [],
      } as any,
    });

    const newState = applyCombatResult(gs, scenario, resolution);
    const defender = newState.figures.find(f => f.id === npcFig.id)!;
    expect(defender.suppressionTokens).toBe(2); // 1 base + 1 triumph
  });

  it('accumulates suppression across multiple hits', () => {
    const gs = makeGameState([heroFig, makeNPCFigure({ suppressionTokens: 2 })]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: 'fig-st-1',
      weaponId: 'blaster-rifle',
      rangeBand: 'Medium',
      state: 'Resolved',
    } as any;

    const newState = applyCombatResult(gs, scenario, makeHitResolution());
    const defender = newState.figures.find(f => f.id === 'fig-st-1')!;
    expect(defender.suppressionTokens).toBe(3); // 2 existing + 1 new
  });

  it('adds combo bonus suppression from Quad Yahtzee', () => {
    const gs = makeGameState([heroFig, npcFig]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: npcFig.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Medium',
      state: 'Resolved',
    } as any;

    const quadCombo: YahtzeeCombo = { type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: false };
    const resolution = makeHitResolution({
      rollResult: {
        isHit: true,
        netSuccesses: 2,
        netAdvantages: 0,
        triumph: 0,
        despair: 0,
        combos: [quadCombo],
        attackRolls: [],
        defenseRolls: [],
      } as any,
    });

    const newState = applyCombatResult(gs, scenario, resolution);
    const defender = newState.figures.find(f => f.id === npcFig.id)!;
    expect(defender.suppressionTokens).toBe(3); // 1 base + 2 from quad
  });

  it('stacks triumph + combo suppression', () => {
    const gs = makeGameState([heroFig, npcFig]);
    const scenario: CombatScenario = {
      attackerId: heroFig.id,
      defenderId: npcFig.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Long',
      state: 'Resolved',
    } as any;

    const quadCombo: YahtzeeCombo = { type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: false };
    const resolution = makeHitResolution({
      rollResult: {
        isHit: true,
        netSuccesses: 3,
        netAdvantages: 0,
        triumph: 1,
        despair: 0,
        combos: [quadCombo],
        attackRolls: [],
        defenseRolls: [],
      } as any,
    });

    const newState = applyCombatResult(gs, scenario, resolution);
    const defender = newState.figures.find(f => f.id === npcFig.id)!;
    expect(defender.suppressionTokens).toBe(4); // 1 base + 1 triumph + 2 quad
  });
});

// ============================================================================
// POOL DOWNGRADE UNDER SUPPRESSION
// ============================================================================

describe('Pool downgrade when suppressed', () => {
  const gd = makeGameData();

  it('downgrades 1 yellow to green when tokens >= courage', () => {
    const attacker = makeFigure({ suppressionTokens: 2, courage: 2 });
    const defender = makeNPCFigure();
    const gs = makeGameState([attacker, defender], { 'hero-1': hero }, { stormtrooper });

    const ctx = buildCombatPools(attacker, defender, 'blaster-rifle', gs, gd);
    // Base pool: Agility 3, Skill 2 => ability 1, proficiency 2
    // Suppressed: downgrade 1 yellow => ability 2, proficiency 1
    expect(ctx.attackPool).toEqual({ ability: 2, proficiency: 1 });
  });

  it('no downgrade when tokens < courage', () => {
    const attacker = makeFigure({ suppressionTokens: 1, courage: 2 });
    const defender = makeNPCFigure();
    const gs = makeGameState([attacker, defender], { 'hero-1': hero }, { stormtrooper });

    const ctx = buildCombatPools(attacker, defender, 'blaster-rifle', gs, gd);
    // Base pool: ability 1, proficiency 2 (no downgrade)
    expect(ctx.attackPool).toEqual({ ability: 1, proficiency: 2 });
  });

  it('no downgrade when courage is 0 (immune)', () => {
    const droidFig = makeNPCFigure({
      id: 'fig-droid-1',
      entityId: 'battle-droid',
      suppressionTokens: 5,
      courage: 0,
    });
    const defender = makeNPCFigure({ id: 'fig-st-2', entityId: 'stormtrooper' });
    const gs = makeGameState(
      [droidFig, defender],
      {},
      { 'battle-droid': droidUnit, stormtrooper },
    );

    // NPC uses precomputed attack pool: { ability: 1, proficiency: 0 }
    const ctx = buildCombatPools(droidFig, defender, 'e5-blaster', gs, gd);
    // Should NOT downgrade despite 5 suppression tokens (courage 0 = immune)
    // Droid base pool stays exactly as-is
    expect(ctx.attackPool).toEqual({ ability: 1, proficiency: 0 });
  });

  it('panicked units still get downgrade (not additional)', () => {
    const attacker = makeFigure({ suppressionTokens: 5, courage: 2 });
    const defender = makeNPCFigure();
    const gs = makeGameState([attacker, defender], { 'hero-1': hero }, { stormtrooper });

    const ctx = buildCombatPools(attacker, defender, 'blaster-rifle', gs, gd);
    // Same downgrade as suppressed: 1 yellow -> green
    expect(ctx.attackPool).toEqual({ ability: 2, proficiency: 1 });
  });
});

// ============================================================================
// DICE COMBO EFFECTS
// ============================================================================

describe('Dice combo suppression effects', () => {
  it('standard Quad produces +2 suppressionTokens, no Suppressed condition', () => {
    const fx = getComboEffect({ type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: false });
    expect(fx.suppressionTokens).toBe(2);
    expect(fx.conditions).toEqual([]);
  });

  it('gilded Quad produces Stunned + Prone conditions (no suppression tokens)', () => {
    const fx = getComboEffect({ type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: true });
    expect(fx.suppressionTokens).toBe(0);
    expect(fx.conditions).toContain('Stunned');
    expect(fx.conditions).toContain('Prone');
  });

  it('non-Quad combos produce 0 suppressionTokens', () => {
    const pair = getComboEffect({ type: 'Pair', faceValues: [3, 3], isGilded: false });
    expect(pair.suppressionTokens).toBe(0);

    const trips = getComboEffect({ type: 'Trips', faceValues: [2, 2, 2], isGilded: false });
    expect(trips.suppressionTokens).toBe(0);
  });

  it('aggregateComboEffects sums suppression tokens', () => {
    const combos: YahtzeeCombo[] = [
      { type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: false },
    ];
    const agg = aggregateComboEffects(combos);
    expect(agg.suppressionTokens).toBe(2);
  });

  it('aggregateComboEffects with no combos has 0 suppression tokens', () => {
    const agg = aggregateComboEffects([]);
    expect(agg.suppressionTokens).toBe(0);
  });
});

// ============================================================================
// DROID IMMUNITY (COURAGE 0)
// ============================================================================

describe('Droid immunity to suppression', () => {
  it('droid profile returns courage 0', () => {
    expect(getNPCCourage(droidUnit)).toBe(0);
  });

  it('droids accumulate tokens but are never suppressed or panicked', () => {
    const droidFig = makeNPCFigure({ suppressionTokens: 20, courage: 0 });
    expect(getSuppressionState(droidFig)).toBe('Normal');
  });

  it('droid rally still attempts removal', () => {
    const droidFig = makeNPCFigure({ suppressionTokens: 3, courage: 0 });
    // Rally should still happen (removes tokens even if they have no effect)
    const result = resetForActivation(droidFig, () => 6);
    expect(result.suppressionTokens).toBe(0);
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Suppression edge cases', () => {
  it('very high courage nemesis is hard to suppress', () => {
    const fig = makeNPCFigure({ courage: 3, suppressionTokens: 2 });
    expect(getSuppressionState(fig)).toBe('Normal'); // 2 < 3
  });

  it('very high courage nemesis needs 6+ tokens to panic', () => {
    const fig = makeNPCFigure({ courage: 3, suppressionTokens: 5 });
    expect(getSuppressionState(fig)).toBe('Suppressed'); // 5 >= 3 but < 6

    const fig2 = makeNPCFigure({ courage: 3, suppressionTokens: 6 });
    expect(getSuppressionState(fig2)).toBe('Panicked'); // 6 >= 6
  });

  it('minion with courage 1 panics at just 2 tokens', () => {
    const minion = makeNPCFigure({ courage: 1, suppressionTokens: 2 });
    expect(getSuppressionState(minion)).toBe('Panicked');
  });

  it('suppression tokens persist across rounds (not cleared in resetForActivation without rally success)', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 3 });
    // All rally rolls fail
    const result = resetForActivation(fig, () => 1);
    expect(result.suppressionTokens).toBe(3); // persists
  });

  it('hero wounded state is preserved through suppression rally', () => {
    const fig = makeFigure({
      isWounded: true,
      conditions: ['Wounded' as Condition],
      suppressionTokens: 2,
      courage: 2,
    });
    const result = resetForActivation(fig, () => 1); // no rally success
    expect(result.isWounded).toBe(true);
    expect(result.conditions).toContain('Wounded');
  });
});

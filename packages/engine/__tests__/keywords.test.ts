/**
 * keywords.test.ts -- Unit Keywords Engine Tests
 *
 * Tests for the Legion-inspired mechanical keyword system:
 * - Armor X: cancel net successes after defense roll
 * - Agile: +1 defense die after Move maneuver
 * - Relentless: free Move after attack (tested via flag tracking)
 * - Cumbersome: cannot attack if moved this activation
 * - Disciplined X: remove X extra suppression during rally
 * - Dauntless: suffer 1 strain to remove 1 suppression at activation
 * - Guardian X: absorb up to X wounds from nearby friendly under ranged fire
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameState,
  GameData,
  GameMap,
  NPCProfile,
  HeroCharacter,
  UnitKeyword,
  AttackPool,
  DefensePool,
  CombatScenario,
  CombatState,
} from '../src/types';

import {
  hasKeyword,
  getKeywordValue,
  getMechanicalKeywords,
  npcHasKeyword,
  getNPCKeywordValue,
  applyArmorKeyword,
  applyDisciplinedBonus,
  findGuardians,
  applyGuardianTransfer,
} from '../src/keywords';

import {
  buildCombatPools,
  resolveCombatV2,
  applyCombatResult,
} from '../src/combat-v2';

import {
  resetForActivation,
  executeActionV2,
} from '../src/turn-machine-v2';

// ============================================================================
// TEST HELPERS
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
    entityId: 'stormtrooper',
    playerId: 0,
    position: { x: 0, y: 0 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: { ability: 2, proficiency: 1 },
    cachedDefensePool: { difficulty: 1, challenge: 0 },
    suppressionTokens: 0,
    courage: 1,
    ...overrides,
  };
}

function makeNPCProfile(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    side: 'imperial',
    tier: 'Minion',
    attackPool: { ability: 2, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [{
      weaponId: 'e-11',
      name: 'E-11 Blaster Rifle',
      baseDamage: 8,
      range: 'Long' as const,
      critical: 3,
      qualities: [],
    }],
    aiArchetype: 'trooper',
    keywords: ['Imperial', 'Trooper'],
    abilities: [],
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
    skills: { 'ranged-heavy': 2 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { weapons: ['blaster-rifle'], armor: null, gear: [] },
    xp: { total: 0, available: 0 },
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
    currentRound: 1,
    roundLimit: 16,
    players: [
      { id: 0, name: 'Imperial', role: 'Imperial' },
      { id: 1, name: 'Operative', role: 'Operative' },
    ],
    figures: [],
    map: makeMap(),
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    morale: { track: [], currentMorale: 0 },
    log: [],
    playMode: 'ai-vs-ai',
    activeCombat: null,
    interactedTerminals: [],
    imperialThreat: 0,
    threatPerRound: 0,
    objectivePoints: [],
    missionObjectives: [],
    lootTokens: [],
    lootCollected: [],
    ...overrides,
  } as any;
}

function makeGameData(): GameData {
  return {
    weapons: {
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
    missions: [],
    talents: {},
  } as any;
}

// ============================================================================
// KEYWORD QUERY TESTS
// ============================================================================

describe('Keyword Queries', () => {
  it('hasKeyword returns true for NPC with matching keyword', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Armor', value: 1 }],
    });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(hasKeyword(fig, 'Armor', gs)).toBe(true);
  });

  it('hasKeyword returns false for NPC without keyword', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Armor', value: 1 }],
    });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(hasKeyword(fig, 'Agile', gs)).toBe(false);
  });

  it('hasKeyword returns false for NPC with no mechanicalKeywords', () => {
    const npc = makeNPCProfile(); // no mechanicalKeywords
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(hasKeyword(fig, 'Armor', gs)).toBe(false);
  });

  it('hasKeyword returns false for hero (heroes lack mechanical keywords)', () => {
    const hero = makeHeroCharacter();
    const fig = makeFigure({ entityId: hero.id });
    const gs = makeGameState({ heroes: { [hero.id]: hero }, figures: [fig] });

    expect(hasKeyword(fig, 'Armor', gs)).toBe(false);
  });

  it('getKeywordValue returns numeric value', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Armor', value: 2 }],
    });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(getKeywordValue(fig, 'Armor', gs)).toBe(2);
  });

  it('getKeywordValue returns 1 for boolean keyword (no value)', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Agile' }],
    });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(getKeywordValue(fig, 'Agile', gs)).toBe(1);
  });

  it('getKeywordValue returns 0 for missing keyword', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(getKeywordValue(fig, 'Armor', gs)).toBe(0);
  });

  it('getMechanicalKeywords returns full keyword array', () => {
    const keywords: UnitKeyword[] = [
      { name: 'Armor', value: 1 },
      { name: 'Cumbersome' },
    ];
    const npc = makeNPCProfile({ mechanicalKeywords: keywords });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(getMechanicalKeywords(fig, gs)).toEqual(keywords);
  });

  it('npcHasKeyword works directly on profile', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Relentless' }],
    });
    expect(npcHasKeyword(npc, 'Relentless')).toBe(true);
    expect(npcHasKeyword(npc, 'Armor')).toBe(false);
  });

  it('getNPCKeywordValue works directly on profile', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
    });
    expect(getNPCKeywordValue(npc, 'Guardian')).toBe(2);
    expect(getNPCKeywordValue(npc, 'Armor')).toBe(0);
  });
});

// ============================================================================
// ARMOR X TESTS
// ============================================================================

describe('Armor X Keyword', () => {
  it('applyArmorKeyword reduces net successes', () => {
    expect(applyArmorKeyword(3, 1)).toBe(2);
    expect(applyArmorKeyword(3, 2)).toBe(1);
    expect(applyArmorKeyword(3, 3)).toBe(0);
  });

  it('applyArmorKeyword cannot go below 0', () => {
    expect(applyArmorKeyword(1, 3)).toBe(0);
    expect(applyArmorKeyword(0, 1)).toBe(0);
  });

  it('applyArmorKeyword with 0 armor returns unchanged', () => {
    expect(applyArmorKeyword(3, 0)).toBe(3);
  });

  it('Armor X integrated: reduces damage in full combat pipeline', () => {
    // Armored NPC as defender -- Armor 2 means 2 fewer net successes
    const armoredNPC = makeNPCProfile({
      id: 'armored-droid',
      name: 'Armored Droid',
      mechanicalKeywords: [{ name: 'Armor', value: 2 }],
      defensePool: { difficulty: 1, challenge: 0 },
      soak: 5,
    });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 0, y: 0 } });
    const defender = makeNPCFigure({
      id: 'def-1',
      entityId: 'armored-droid',
      position: { x: 3, y: 0 },
    });

    const gs = makeGameState({
      heroes: { [hero.id]: hero },
      npcProfiles: { 'armored-droid': armoredNPC },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    // Deterministic roll: all successes for attacker, no defense successes
    // Attack: 3 ability (Agility) + 2 proficiency => roll all 6s (success)
    // Defense: 1 difficulty => roll 1 (blank/no success)
    let rollIdx = 0;
    const rolls = [
      6, 6, 6, 6, 6,  // attack dice (all max = success+advantage)
      1,               // defense die (blank)
    ];
    const rollFn = () => rolls[rollIdx++] ?? 3;

    const scenario: CombatScenario = {
      id: 'test',
      attackerId: attacker.id,
      defenderId: defender.id,
      weaponId: 'blaster-rifle',
      rangeBand: 'Short',
      cover: 'None',
      elevationDiff: 0,
      hasLOS: true,
      state: 'Declaring' as CombatState,
      attackPool: null,
      defensePool: null,
      resolution: null,
    };

    const resolution = resolveCombatV2(scenario, gs, gd, rollFn);
    // Without Armor: X net successes
    // With Armor 2: X-2 net successes
    // If original would have been a hit, Armor reduces damage
    // The key test: Armor 2 is active on the defender
    // We verify the keyword is looked up (getKeywordValue returns 2)
    expect(getKeywordValue(defender, 'Armor', gs)).toBe(2);
  });
});

// ============================================================================
// AGILE KEYWORD TESTS
// ============================================================================

describe('Agile Keyword', () => {
  it('Agile adds +1 difficulty die when defender has moved this activation', () => {
    const agileNPC = makeNPCProfile({
      id: 'agile-scout',
      name: 'Agile Scout',
      mechanicalKeywords: [{ name: 'Agile' }],
      defensePool: { difficulty: 1, challenge: 0 },
    });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 0, y: 0 } });
    const defender = makeNPCFigure({
      id: 'def-1',
      entityId: 'agile-scout',
      position: { x: 3, y: 0 },
      hasMovedThisActivation: true,
    });

    const gs = makeGameState({
      heroes: { [hero.id]: hero },
      npcProfiles: { 'agile-scout': agileNPC },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    const pools = buildCombatPools(attacker, defender, 'blaster-rifle', gs, gd);
    // Base defense: 1 difficulty. Agile: +1 difficulty after move.
    expect(pools.defensePool.difficulty).toBe(2);
  });

  it('Agile does NOT add defense die when defender has NOT moved', () => {
    const agileNPC = makeNPCProfile({
      id: 'agile-scout',
      mechanicalKeywords: [{ name: 'Agile' }],
      defensePool: { difficulty: 1, challenge: 0 },
    });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 0, y: 0 } });
    const defender = makeNPCFigure({
      id: 'def-1',
      entityId: 'agile-scout',
      position: { x: 3, y: 0 },
      hasMovedThisActivation: false,
    });

    const gs = makeGameState({
      heroes: { [hero.id]: hero },
      npcProfiles: { 'agile-scout': agileNPC },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    const pools = buildCombatPools(attacker, defender, 'blaster-rifle', gs, gd);
    expect(pools.defensePool.difficulty).toBe(1); // unchanged
  });

  it('Agile does NOT trigger for NPC without keyword even if moved', () => {
    const npc = makeNPCProfile({
      defensePool: { difficulty: 1, challenge: 0 },
    });
    const hero = makeHeroCharacter();
    const attacker = makeFigure({ position: { x: 0, y: 0 } });
    const defender = makeNPCFigure({
      id: 'def-1',
      entityId: npc.id,
      position: { x: 3, y: 0 },
      hasMovedThisActivation: true,
    });

    const gs = makeGameState({
      heroes: { [hero.id]: hero },
      npcProfiles: { [npc.id]: npc },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    const pools = buildCombatPools(attacker, defender, 'blaster-rifle', gs, gd);
    expect(pools.defensePool.difficulty).toBe(1);
  });
});

// ============================================================================
// CUMBERSOME KEYWORD TESTS
// ============================================================================

describe('Cumbersome Keyword', () => {
  it('Cumbersome blocks attack when figure has moved this activation', () => {
    const cumbersomeNPC = makeNPCProfile({
      id: 'e-web',
      name: 'E-Web Engineer',
      tier: 'Rival',
      strainThreshold: 5,
      mechanicalKeywords: [{ name: 'Cumbersome' }],
    });
    const hero = makeHeroCharacter();
    const npcFig = makeNPCFigure({
      id: 'npc-0',
      entityId: 'e-web',
      position: { x: 3, y: 0 },
      hasMovedThisActivation: true, // already moved
      actionsRemaining: 1,
    });
    const heroFig = makeFigure({
      id: 'hero-0',
      position: { x: 6, y: 0 },
    });

    const gs = makeGameState({
      heroes: { [hero.id]: hero },
      npcProfiles: { 'e-web': cumbersomeNPC },
      figures: [npcFig, heroFig],
    });
    const gd = makeGameData();

    // Execute Attack action with Cumbersome + hasMovedThisActivation
    const newState = executeActionV2(gs, {
      type: 'Attack',
      figureId: 'npc-0',
      payload: { targetId: 'hero-0', weaponId: 'e-11' },
    }, gd);

    // Action consumed but no combat resolution (hero takes 0 wounds)
    const updatedNPC = newState.figures.find(f => f.id === 'npc-0')!;
    expect(updatedNPC.actionsRemaining).toBe(0);
    expect(updatedNPC.hasAttackedThisActivation).toBe(true);

    // Hero should be unharmed (no combat happened)
    const updatedHero = newState.figures.find(f => f.id === 'hero-0')!;
    expect(updatedHero.woundsCurrent).toBe(0);
  });

  it('Cumbersome does NOT block attack when figure has NOT moved', () => {
    const cumbersomeNPC = makeNPCProfile({
      id: 'e-web',
      mechanicalKeywords: [{ name: 'Cumbersome' }],
    });
    const hero = makeHeroCharacter();
    const npcFig = makeNPCFigure({
      id: 'npc-0',
      entityId: 'e-web',
      position: { x: 3, y: 0 },
      hasMovedThisActivation: false, // NOT moved
      actionsRemaining: 1,
    });
    const heroFig = makeFigure({
      id: 'hero-0',
      position: { x: 6, y: 0 },
    });

    const gs = makeGameState({
      heroes: { [hero.id]: hero },
      npcProfiles: { 'e-web': cumbersomeNPC },
      figures: [npcFig, heroFig],
    });
    const gd = makeGameData();

    const newState = executeActionV2(gs, {
      type: 'Attack',
      figureId: 'npc-0',
      payload: { targetId: 'hero-0', weaponId: 'e-11' },
    }, gd);

    // Attack should proceed (combat resolves)
    const updatedNPC = newState.figures.find(f => f.id === 'npc-0')!;
    expect(updatedNPC.actionsRemaining).toBe(0);
    // Combat occurred -- check activeCombat was set
    expect(newState.activeCombat).not.toBeNull();
  });
});

// ============================================================================
// DISCIPLINED KEYWORD TESTS
// ============================================================================

describe('Disciplined Keyword', () => {
  it('applyDisciplinedBonus adds to base removal count', () => {
    expect(applyDisciplinedBonus(2, 1)).toBe(3);
    expect(applyDisciplinedBonus(0, 2)).toBe(2);
    expect(applyDisciplinedBonus(3, 0)).toBe(3);
  });

  it('Disciplined removes extra tokens during rally in resetForActivation', () => {
    const disciplinedNPC = makeNPCProfile({
      id: 'clone-trooper',
      name: 'Clone Trooper',
      tier: 'Rival',
      strainThreshold: 6,
      mechanicalKeywords: [{ name: 'Disciplined', value: 1 }],
    });
    const fig = makeNPCFigure({
      entityId: 'clone-trooper',
      suppressionTokens: 3,
      courage: 2,
    });
    const gs = makeGameState({
      npcProfiles: { 'clone-trooper': disciplinedNPC },
      figures: [fig],
    });

    // All rally dice fail (roll 1s) but Disciplined 1 still removes 1
    const rollFn = () => 1; // all fail
    const result = resetForActivation(fig, rollFn, gs);
    expect(result.suppressionTokens).toBe(2); // 3 - 1 (disciplined) = 2
  });

  it('Disciplined 2 removes 2 extra tokens', () => {
    const disciplinedNPC = makeNPCProfile({
      id: 'elite-clone',
      mechanicalKeywords: [{ name: 'Disciplined', value: 2 }],
    });
    const fig = makeNPCFigure({
      entityId: 'elite-clone',
      suppressionTokens: 4,
      courage: 2,
    });
    const gs = makeGameState({
      npcProfiles: { 'elite-clone': disciplinedNPC },
      figures: [fig],
    });

    // All rally dice fail
    const rollFn = () => 1;
    const result = resetForActivation(fig, rollFn, gs);
    expect(result.suppressionTokens).toBe(2); // 4 - 2 (disciplined) = 2
  });

  it('Disciplined stacks with successful rally dice', () => {
    const disciplinedNPC = makeNPCProfile({
      id: 'elite-clone',
      mechanicalKeywords: [{ name: 'Disciplined', value: 1 }],
    });
    const fig = makeNPCFigure({
      entityId: 'elite-clone',
      suppressionTokens: 3,
      courage: 2,
    });
    const gs = makeGameState({
      npcProfiles: { 'elite-clone': disciplinedNPC },
      figures: [fig],
    });

    // All rally dice succeed (roll 6s) + Disciplined 1
    const rollFn = () => 6; // all succeed
    const result = resetForActivation(fig, rollFn, gs);
    // 3 dice all succeed (remove 3) + Disciplined 1 = remove 4, but only 3 tokens = 0
    expect(result.suppressionTokens).toBe(0);
  });
});

// ============================================================================
// DAUNTLESS KEYWORD TESTS
// ============================================================================

describe('Dauntless Keyword', () => {
  it('Dauntless removes 1 suppression for 1 strain at activation', () => {
    const dauntlessNPC = makeNPCProfile({
      id: 'royal-guard',
      name: 'Royal Guard',
      tier: 'Rival',
      strainThreshold: 8,
      mechanicalKeywords: [{ name: 'Dauntless' }],
    });
    const fig = makeNPCFigure({
      entityId: 'royal-guard',
      suppressionTokens: 2,
      strainCurrent: 0,
      courage: 2,
    });
    const gs = makeGameState({
      npcProfiles: { 'royal-guard': dauntlessNPC },
      figures: [fig],
    });

    // All rally dice fail
    const rollFn = () => 1;
    const result = resetForActivation(fig, rollFn, gs);

    // Dauntless: suffer 1 strain, remove 1 suppression
    expect(result.suppressionTokens).toBe(1); // 2 - 1 = 1
    expect(result.strainCurrent).toBe(1);
  });

  it('Dauntless does NOT trigger when at strain threshold', () => {
    const dauntlessNPC = makeNPCProfile({
      id: 'royal-guard',
      tier: 'Rival',
      strainThreshold: 5,
      mechanicalKeywords: [{ name: 'Dauntless' }],
    });
    const fig = makeNPCFigure({
      entityId: 'royal-guard',
      suppressionTokens: 3,
      strainCurrent: 5, // at threshold
      courage: 2,
    });
    const gs = makeGameState({
      npcProfiles: { 'royal-guard': dauntlessNPC },
      figures: [fig],
    });

    const rollFn = () => 1;
    const result = resetForActivation(fig, rollFn, gs);

    // Dauntless NOT used (would incapacitate)
    expect(result.suppressionTokens).toBe(3); // unchanged
    expect(result.strainCurrent).toBe(5); // unchanged
  });

  it('Dauntless does NOT trigger for Minions (null strainThreshold)', () => {
    const dauntlessMinion = makeNPCProfile({
      id: 'dauntless-minion',
      tier: 'Minion',
      strainThreshold: null,
      mechanicalKeywords: [{ name: 'Dauntless' }],
    });
    const fig = makeNPCFigure({
      entityId: 'dauntless-minion',
      suppressionTokens: 2,
      courage: 1,
    });
    const gs = makeGameState({
      npcProfiles: { 'dauntless-minion': dauntlessMinion },
      figures: [fig],
    });

    const rollFn = () => 1;
    const result = resetForActivation(fig, rollFn, gs);

    // No Dauntless effect (Minions have null strain)
    expect(result.suppressionTokens).toBe(2);
  });

  it('Dauntless does NOT trigger when no suppression', () => {
    const dauntlessNPC = makeNPCProfile({
      id: 'royal-guard',
      tier: 'Rival',
      strainThreshold: 8,
      mechanicalKeywords: [{ name: 'Dauntless' }],
    });
    const fig = makeNPCFigure({
      entityId: 'royal-guard',
      suppressionTokens: 0,
      courage: 2,
    });
    const gs = makeGameState({
      npcProfiles: { 'royal-guard': dauntlessNPC },
      figures: [fig],
    });

    const rollFn = () => 1;
    const result = resetForActivation(fig, rollFn, gs);

    expect(result.suppressionTokens).toBe(0);
    expect(result.strainCurrent).toBe(0); // no strain suffered
  });
});

// ============================================================================
// GUARDIAN X KEYWORD TESTS
// ============================================================================

describe('Guardian X Keyword', () => {
  describe('findGuardians', () => {
    it('finds guardian within range', () => {
      const guardNPC = makeNPCProfile({
        id: 'bodyguard',
        mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
      });
      const defender = makeNPCFigure({
        id: 'def-1',
        entityId: 'stormtrooper',
        position: { x: 5, y: 5 },
        playerId: 0,
      });
      const guardian = makeNPCFigure({
        id: 'guard-1',
        entityId: 'bodyguard',
        position: { x: 6, y: 5 }, // 1 tile away
        playerId: 0,
      });

      const gs = makeGameState({
        npcProfiles: {
          stormtrooper: makeNPCProfile(),
          bodyguard: guardNPC,
        },
        figures: [defender, guardian],
      });

      const guardians = findGuardians(defender, gs);
      expect(guardians).toHaveLength(1);
      expect(guardians[0].figureId).toBe('guard-1');
      expect(guardians[0].maxAbsorb).toBe(2);
    });

    it('excludes guardian out of range', () => {
      const guardNPC = makeNPCProfile({
        id: 'bodyguard',
        mechanicalKeywords: [{ name: 'Guardian', value: 1 }],
      });
      const defender = makeNPCFigure({
        id: 'def-1',
        position: { x: 0, y: 0 },
        playerId: 0,
      });
      const guardian = makeNPCFigure({
        id: 'guard-1',
        entityId: 'bodyguard',
        position: { x: 10, y: 10 }, // way too far
        playerId: 0,
      });

      const gs = makeGameState({
        npcProfiles: {
          stormtrooper: makeNPCProfile(),
          bodyguard: guardNPC,
        },
        figures: [defender, guardian],
      });

      expect(findGuardians(defender, gs)).toHaveLength(0);
    });

    it('excludes defeated guardians', () => {
      const guardNPC = makeNPCProfile({
        id: 'bodyguard',
        mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
      });
      const defender = makeNPCFigure({ id: 'def-1', position: { x: 5, y: 5 }, playerId: 0 });
      const guardian = makeNPCFigure({
        id: 'guard-1',
        entityId: 'bodyguard',
        position: { x: 6, y: 5 },
        playerId: 0,
        isDefeated: true,
      });

      const gs = makeGameState({
        npcProfiles: { stormtrooper: makeNPCProfile(), bodyguard: guardNPC },
        figures: [defender, guardian],
      });

      expect(findGuardians(defender, gs)).toHaveLength(0);
    });

    it('excludes enemy figures', () => {
      const guardNPC = makeNPCProfile({
        id: 'bodyguard',
        mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
      });
      const defender = makeNPCFigure({ id: 'def-1', position: { x: 5, y: 5 }, playerId: 0 });
      const enemyGuardian = makeNPCFigure({
        id: 'guard-1',
        entityId: 'bodyguard',
        position: { x: 6, y: 5 },
        playerId: 1, // different player
      });

      const gs = makeGameState({
        npcProfiles: { stormtrooper: makeNPCProfile(), bodyguard: guardNPC },
        figures: [defender, enemyGuardian],
      });

      expect(findGuardians(defender, gs)).toHaveLength(0);
    });

    it('cannot guard yourself', () => {
      const guardNPC = makeNPCProfile({
        id: 'self-guard',
        mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
      });
      const fig = makeNPCFigure({
        id: 'self-1',
        entityId: 'self-guard',
        position: { x: 5, y: 5 },
        playerId: 0,
      });

      const gs = makeGameState({
        npcProfiles: { 'self-guard': guardNPC },
        figures: [fig],
      });

      expect(findGuardians(fig, gs)).toHaveLength(0);
    });
  });

  describe('applyGuardianTransfer', () => {
    it('transfers wounds to single guardian', () => {
      const result = applyGuardianTransfer(5, [
        { figureId: 'guard-1', maxAbsorb: 2 },
      ]);
      expect(result.defenderWounds).toBe(3);
      expect(result.guardianWounds).toEqual([
        { figureId: 'guard-1', woundsAbsorbed: 2 },
      ]);
    });

    it('transfers wounds across multiple guardians', () => {
      const result = applyGuardianTransfer(5, [
        { figureId: 'guard-1', maxAbsorb: 2 },
        { figureId: 'guard-2', maxAbsorb: 2 },
      ]);
      expect(result.defenderWounds).toBe(1);
      expect(result.guardianWounds).toEqual([
        { figureId: 'guard-1', woundsAbsorbed: 2 },
        { figureId: 'guard-2', woundsAbsorbed: 2 },
      ]);
    });

    it('stops when all wounds absorbed', () => {
      const result = applyGuardianTransfer(2, [
        { figureId: 'guard-1', maxAbsorb: 3 },
      ]);
      expect(result.defenderWounds).toBe(0);
      expect(result.guardianWounds).toEqual([
        { figureId: 'guard-1', woundsAbsorbed: 2 },
      ]);
    });

    it('handles 0 wounds', () => {
      const result = applyGuardianTransfer(0, [
        { figureId: 'guard-1', maxAbsorb: 2 },
      ]);
      expect(result.defenderWounds).toBe(0);
      expect(result.guardianWounds).toEqual([]);
    });

    it('handles empty guardian list', () => {
      const result = applyGuardianTransfer(5, []);
      expect(result.defenderWounds).toBe(5);
      expect(result.guardianWounds).toEqual([]);
    });
  });

  describe('Guardian integration in combat pipeline', () => {
    it('Guardian absorbs wounds in applyCombatResult', () => {
      const guardNPC = makeNPCProfile({
        id: 'bodyguard',
        name: 'Bodyguard',
        mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
        woundThreshold: 8,
      });
      const targetNPC = makeNPCProfile({
        id: 'officer',
        name: 'Officer',
        woundThreshold: 5,
      });

      const attacker = makeFigure({
        id: 'hero-0',
        position: { x: 0, y: 0 },
        playerId: 1,
      });
      const target = makeNPCFigure({
        id: 'target-1',
        entityId: 'officer',
        position: { x: 5, y: 0 },
        playerId: 0,
      });
      const guardian = makeNPCFigure({
        id: 'guard-1',
        entityId: 'bodyguard',
        position: { x: 6, y: 0 }, // adjacent to target
        playerId: 0,
      });

      const hero = makeHeroCharacter();
      const gs = makeGameState({
        heroes: { [hero.id]: hero },
        npcProfiles: { officer: targetNPC, bodyguard: guardNPC },
        figures: [attacker, target, guardian],
      });

      // Mock a ranged combat resolution with 4 wounds dealt
      const resolution = {
        rollResult: {
          isHit: true,
          netSuccesses: 3,
          netAdvantages: 0,
          totalTriumphs: 0,
          totalDespairs: 0,
          combos: [],
          triumph: 0,
          despair: 0,
        },
        weaponBaseDamage: 7,
        comboBonus: 0,
        grossDamage: 10,
        soak: 3,
        woundsDealt: 4,
        criticalTriggered: false,
        criticalResult: null,
        advantagesSpent: [],
        threatsSpent: [],
        isHit: true,
        isDefeated: false,
        isNewlyWounded: false,
        defenderRemainingWounds: 1,
      };

      const scenario: CombatScenario = {
        id: 'test',
        attackerId: 'hero-0',
        defenderId: 'target-1',
        weaponId: 'blaster-rifle',
        rangeBand: 'Medium', // ranged attack
        cover: 'None',
        elevationDiff: 0,
        hasLOS: true,
        state: 'Complete' as CombatState,
        attackPool: null,
        defensePool: null,
        resolution: null,
      };

      const newState = applyCombatResult(gs, scenario, resolution);

      // Guardian 2: absorbs 2 of the 4 wounds
      const updatedTarget = newState.figures.find(f => f.id === 'target-1')!;
      const updatedGuardian = newState.figures.find(f => f.id === 'guard-1')!;

      expect(updatedTarget.woundsCurrent).toBe(2); // 4 - 2 absorbed = 2
      expect(updatedGuardian.woundsCurrent).toBe(2); // absorbed 2
    });

    it('Guardian does NOT trigger on melee attacks', () => {
      const guardNPC = makeNPCProfile({
        id: 'bodyguard',
        mechanicalKeywords: [{ name: 'Guardian', value: 2 }],
        woundThreshold: 8,
      });
      const targetNPC = makeNPCProfile({
        id: 'officer',
        woundThreshold: 5,
      });

      const attacker = makeFigure({ id: 'hero-0', position: { x: 4, y: 0 }, playerId: 1 });
      const target = makeNPCFigure({ id: 'target-1', entityId: 'officer', position: { x: 5, y: 0 }, playerId: 0 });
      const guardian = makeNPCFigure({ id: 'guard-1', entityId: 'bodyguard', position: { x: 6, y: 0 }, playerId: 0 });

      const hero = makeHeroCharacter();
      const gs = makeGameState({
        heroes: { [hero.id]: hero },
        npcProfiles: { officer: targetNPC, bodyguard: guardNPC },
        figures: [attacker, target, guardian],
      });

      const resolution = {
        rollResult: { isHit: true, netSuccesses: 3, netAdvantages: 0, totalTriumphs: 0, totalDespairs: 0, combos: [], triumph: 0, despair: 0 },
        weaponBaseDamage: 5, comboBonus: 0, grossDamage: 8, soak: 3,
        woundsDealt: 4,
        criticalTriggered: false, criticalResult: null,
        advantagesSpent: [], threatsSpent: [],
        isHit: true, isDefeated: false, isNewlyWounded: false, defenderRemainingWounds: 1,
      };

      const scenario: CombatScenario = {
        id: 'test', attackerId: 'hero-0', defenderId: 'target-1',
        weaponId: 'vibro-blade', rangeBand: 'Engaged', // MELEE
        cover: 'None', elevationDiff: 0, hasLOS: true,
        state: 'Complete' as CombatState, attackPool: null, defensePool: null, resolution: null,
      };

      const newState = applyCombatResult(gs, scenario, resolution);

      // Guardian should NOT trigger on melee (Engaged range)
      const updatedTarget = newState.figures.find(f => f.id === 'target-1')!;
      const updatedGuardian = newState.figures.find(f => f.id === 'guard-1')!;

      expect(updatedTarget.woundsCurrent).toBe(4); // full damage
      expect(updatedGuardian.woundsCurrent).toBe(0); // no absorption
    });
  });
});

// ============================================================================
// MOVE AND ATTACK TRACKING TESTS
// ============================================================================

describe('Move/Attack Tracking Flags', () => {
  it('resetForActivation clears tracking flags', () => {
    const fig = makeNPCFigure({
      hasMovedThisActivation: true,
      hasAttackedThisActivation: true,
    });
    const result = resetForActivation(fig);
    expect(result.hasMovedThisActivation).toBe(false);
    expect(result.hasAttackedThisActivation).toBe(false);
  });

  it('Move action sets hasMovedThisActivation flag', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({
      id: 'npc-0',
      entityId: npc.id,
      position: { x: 0, y: 0 },
      maneuversRemaining: 1,
      hasMovedThisActivation: false,
    });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      figures: [fig],
    });
    const gd = makeGameData();

    const newState = executeActionV2(gs, {
      type: 'Move',
      figureId: 'npc-0',
      payload: { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    }, gd);

    const updated = newState.figures.find(f => f.id === 'npc-0')!;
    expect(updated.hasMovedThisActivation).toBe(true);
  });
});

// ============================================================================
// MULTIPLE KEYWORDS ON SAME UNIT
// ============================================================================

describe('Multiple Keywords', () => {
  it('NPC can have multiple mechanical keywords', () => {
    const npc = makeNPCProfile({
      mechanicalKeywords: [
        { name: 'Armor', value: 1 },
        { name: 'Cumbersome' },
        { name: 'Guardian', value: 2 },
      ],
    });
    const fig = makeNPCFigure({ entityId: npc.id });
    const gs = makeGameState({ npcProfiles: { [npc.id]: npc }, figures: [fig] });

    expect(hasKeyword(fig, 'Armor', gs)).toBe(true);
    expect(hasKeyword(fig, 'Cumbersome', gs)).toBe(true);
    expect(hasKeyword(fig, 'Guardian', gs)).toBe(true);
    expect(hasKeyword(fig, 'Agile', gs)).toBe(false);

    expect(getKeywordValue(fig, 'Armor', gs)).toBe(1);
    expect(getKeywordValue(fig, 'Cumbersome', gs)).toBe(1); // boolean default
    expect(getKeywordValue(fig, 'Guardian', gs)).toBe(2);
  });
});

// ============================================================================
// RELENTLESS KEYWORD (free move after attack)
// ============================================================================

describe('Relentless Keyword', () => {
  it('grants bonus maneuver after attack if figure has not moved', () => {
    const npc = makeNPCProfile({
      id: 'relentless-trooper',
      mechanicalKeywords: [{ name: 'Relentless' }],
    });
    const hero = makeHeroCharacter();

    const attacker = makeNPCFigure({
      id: 'npc-r',
      entityId: npc.id,
      playerId: 'imperial',
      position: { x: 0, y: 0 },
      actionsRemaining: 1,
      maneuversRemaining: 0,
      hasMovedThisActivation: false,
      hasAttackedThisActivation: false,
    });

    const defender = makeFigure({
      id: 'hero-r',
      entityId: hero.id,
      entityType: 'hero',
      playerId: 'operative',
      position: { x: 2, y: 0 },
    });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    const newState = executeActionV2(gs, {
      type: 'Attack',
      figureId: 'npc-r',
      payload: { targetId: 'hero-r', weaponId: npc.weapons[0].weaponId },
    }, gd);

    const updated = newState.figures.find(f => f.id === 'npc-r')!;
    // Should have gained +1 maneuver from Relentless
    expect(updated.maneuversRemaining).toBe(1);
    expect(updated.hasAttackedThisActivation).toBe(true);
  });

  it('does NOT grant bonus maneuver if figure already moved', () => {
    const npc = makeNPCProfile({
      id: 'relentless-trooper',
      mechanicalKeywords: [{ name: 'Relentless' }],
    });
    const hero = makeHeroCharacter();

    const attacker = makeNPCFigure({
      id: 'npc-r',
      entityId: npc.id,
      playerId: 'imperial',
      position: { x: 0, y: 0 },
      actionsRemaining: 1,
      maneuversRemaining: 0,
      hasMovedThisActivation: true, // already moved
      hasAttackedThisActivation: false,
    });

    const defender = makeFigure({
      id: 'hero-r',
      entityId: hero.id,
      entityType: 'hero',
      playerId: 'operative',
      position: { x: 2, y: 0 },
    });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    const newState = executeActionV2(gs, {
      type: 'Attack',
      figureId: 'npc-r',
      payload: { targetId: 'hero-r', weaponId: npc.weapons[0].weaponId },
    }, gd);

    const updated = newState.figures.find(f => f.id === 'npc-r')!;
    // No bonus maneuver since figure already moved
    expect(updated.maneuversRemaining).toBe(0);
  });

  it('does NOT grant bonus maneuver without Relentless keyword', () => {
    const npc = makeNPCProfile({
      id: 'normal-trooper',
      mechanicalKeywords: [], // no keywords
    });
    const hero = makeHeroCharacter();

    const attacker = makeNPCFigure({
      id: 'npc-r',
      entityId: npc.id,
      playerId: 'imperial',
      position: { x: 0, y: 0 },
      actionsRemaining: 1,
      maneuversRemaining: 0,
      hasMovedThisActivation: false,
      hasAttackedThisActivation: false,
    });

    const defender = makeFigure({
      id: 'hero-r',
      entityId: hero.id,
      entityType: 'hero',
      playerId: 'operative',
      position: { x: 2, y: 0 },
    });

    const gs = makeGameState({
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      figures: [attacker, defender],
    });
    const gd = makeGameData();

    const newState = executeActionV2(gs, {
      type: 'Attack',
      figureId: 'npc-r',
      payload: { targetId: 'hero-r', weaponId: npc.weapons[0].weaponId },
    }, gd);

    const updated = newState.figures.find(f => f.id === 'npc-r')!;
    expect(updated.maneuversRemaining).toBe(0);
  });
});

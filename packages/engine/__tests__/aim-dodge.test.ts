/**
 * aim-dodge.test.ts -- Aim & Dodge Token Tests
 *
 * Tests for the Legion-inspired resource management tokens:
 * - Aim: spend Action to gain token (max 2), adds +1 Ability die per token to next attack
 * - AimManeuver: same as Aim but costs maneuver
 * - Dodge: spend Action to gain token (max 1), cancels 1 net success when hit
 * - Aim tokens persist across activations, dodge tokens cleared at activation
 * - Tokens consumed in combat (aim on attack, dodge when hit)
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
} from '../src/types';

import {
  executeActionV2,
  resetForActivation,
} from '../src/turn-machine-v2';

import {
  resolveCombatV2,
  applyCombatResult,
  createCombatScenarioV2,
} from '../src/combat-v2';

import { defaultRollFn } from '../src/dice-v2';

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
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
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
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
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

function makeHeroCharacter(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
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
    ...overrides,
  } as any;
}

function makeMap(width = 20, height = 20): GameMap {
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
      'e-11': {
        id: 'e-11',
        name: 'E-11 Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 8,
        damageAddBrawn: false,
        range: 'Long',
        critical: 3,
        qualities: [],
        encumbrance: 4,
        cost: 1000,
      },
    },
    armor: {},
    npcProfiles: {},
    missions: [],
    talents: {},
  } as any;
}

// ============================================================================
// AIM TOKEN TESTS
// ============================================================================

describe('Aim Tokens', () => {
  it('Aim action grants 1 aimToken and consumes action', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1, aimTokens: 0 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'Aim', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.aimTokens).toBe(1);
    expect(updated.actionsRemaining).toBe(0);
  });

  it('Aim action stacks to max 2 tokens', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1, aimTokens: 1 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'Aim', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.aimTokens).toBe(2);
  });

  it('Aim action does not exceed max 2 tokens', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1, aimTokens: 2 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'Aim', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.aimTokens).toBe(2); // capped at 2
  });

  it('AimManeuver grants 1 aimToken and consumes maneuver', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, maneuversRemaining: 1, aimTokens: 0 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'AimManeuver', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.aimTokens).toBe(1);
    expect(updated.maneuversRemaining).toBe(0);
  });

  it('Aim tokens persist across activations (not cleared by resetForActivation)', () => {
    const fig = makeFigure({ aimTokens: 2 });
    const reset = resetForActivation(fig);
    expect(reset.aimTokens).toBe(2); // aim persists
  });
});

// ============================================================================
// DODGE TOKEN TESTS
// ============================================================================

describe('Dodge Tokens', () => {
  it('Dodge action grants 1 dodgeToken and consumes action', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1, dodgeTokens: 0 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'Dodge', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.dodgeTokens).toBe(1);
    expect(updated.actionsRemaining).toBe(0);
  });

  it('Dodge token capped at max 1', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1, dodgeTokens: 1 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'Dodge', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.dodgeTokens).toBe(1); // stays at 1
  });

  it('Dodge tokens cleared by resetForActivation', () => {
    const fig = makeFigure({ dodgeTokens: 1 });
    const reset = resetForActivation(fig);
    expect(reset.dodgeTokens).toBe(0); // cleared
  });
});

// ============================================================================
// COMBAT INTEGRATION: AIM TOKENS CONSUMED ON ATTACK
// ============================================================================

describe('Aim Tokens - Combat Integration', () => {
  it('aim tokens consumed after combat (set to 0 on attacker)', () => {
    const npc = makeNPCProfile();
    const attacker = makeNPCFigure({
      id: 'attacker',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      aimTokens: 2,
    });
    const defender = makeFigure({
      id: 'defender',
      playerId: 1,
      position: { x: 8, y: 5 },
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [attacker, defender],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });
    const gd = makeGameData();

    const scenario = createCombatScenarioV2(
      attacker, defender, 'e-11', 'None', 0, true,
    );
    const resolution = resolveCombatV2(scenario, gs, gd);
    const result = applyCombatResult(gs, scenario, resolution);

    const updatedAttacker = result.figures.find(f => f.id === 'attacker')!;
    expect(updatedAttacker.aimTokens).toBe(0);
  });

  it('attacker with 0 aim tokens stays at 0 after combat', () => {
    const npc = makeNPCProfile();
    const attacker = makeNPCFigure({
      id: 'attacker',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      aimTokens: 0,
    });
    const defender = makeFigure({
      id: 'defender',
      playerId: 1,
      position: { x: 8, y: 5 },
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [attacker, defender],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });
    const gd = makeGameData();

    const scenario = createCombatScenarioV2(
      attacker, defender, 'e-11', 'None', 0, true,
    );
    const resolution = resolveCombatV2(scenario, gs, gd);
    const result = applyCombatResult(gs, scenario, resolution);

    const updatedAttacker = result.figures.find(f => f.id === 'attacker')!;
    expect(updatedAttacker.aimTokens).toBe(0);
  });
});

// ============================================================================
// COMBAT INTEGRATION: DODGE TOKENS CONSUMED ON DEFENSE
// ============================================================================

describe('Dodge Tokens - Combat Integration', () => {
  it('dodge token consumed after combat (decremented on defender)', () => {
    const npc = makeNPCProfile();
    const attacker = makeNPCFigure({
      id: 'attacker',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
    });
    const defender = makeFigure({
      id: 'defender',
      playerId: 1,
      position: { x: 8, y: 5 },
      dodgeTokens: 1,
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [attacker, defender],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });
    const gd = makeGameData();

    const scenario = createCombatScenarioV2(
      attacker, defender, 'e-11', 'None', 0, true,
    );
    const resolution = resolveCombatV2(scenario, gs, gd);
    const result = applyCombatResult(gs, scenario, resolution);

    const updatedDefender = result.figures.find(f => f.id === 'defender')!;
    expect(updatedDefender.dodgeTokens).toBe(0); // consumed
  });

  it('defender with 0 dodge tokens stays at 0', () => {
    const npc = makeNPCProfile();
    const attacker = makeNPCFigure({
      id: 'attacker',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
    });
    const defender = makeFigure({
      id: 'defender',
      playerId: 1,
      position: { x: 8, y: 5 },
      dodgeTokens: 0,
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [attacker, defender],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });
    const gd = makeGameData();

    const scenario = createCombatScenarioV2(
      attacker, defender, 'e-11', 'None', 0, true,
    );
    const resolution = resolveCombatV2(scenario, gs, gd);
    const result = applyCombatResult(gs, scenario, resolution);

    const updatedDefender = result.figures.find(f => f.id === 'defender')!;
    expect(updatedDefender.dodgeTokens).toBe(0);
  });
});

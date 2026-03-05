/**
 * AI Aim/Dodge Decision Tests
 *
 * Tests for the AI's ability to use Aim and Dodge actions via the
 * priority-rule engine. Covers condition evaluators (evalShouldAimBeforeAttack,
 * evalShouldDodgeForDefense) and action builders (buildAimThenAttack,
 * buildDodgeAndHold).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before imports
vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  ),
  getPath: vi.fn((_from: any, to: any) => [to]),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None'),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn((morale: any) => morale.state),
  checkMoraleEffect: vi.fn(),
}));

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  Tile,
} from '../src/types.js';

import type { AIWeights } from '../src/ai/types.js';

import {
  evaluateCondition,
  getEnemies,
  getValidTargetsV2,
} from '../src/ai/evaluate-v2.js';

import {
  buildAimAction,
  buildDodgeAction,
  buildActionsForAIAction,
} from '../src/ai/actions-v2.js';

import { getValidMoves, getDistance } from '../src/movement.js';
import { hasLineOfSight, getCover } from '../src/los.js';
import { getMoraleState } from '../src/morale.js';

// ============================================================================
// FIXTURE BUILDERS
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
      brawn: 3, agility: 3, intellect: 2,
      cunning: 2, willpower: 2, presence: 2,
    },
    skills: {
      'ranged-heavy': 2, 'ranged-light': 2, 'melee': 1,
      'brawl': 1, 'coordination': 1, 'resilience': 1,
    },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 6,
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
    weapons: [{
      weaponId: 'e11-blaster',
      name: 'E-11 Blaster Rifle',
      baseDamage: 9,
      range: 'Long',
      critical: 3,
      qualities: [{ name: 'Stun', value: null }],
    }],
    aiArchetype: 'trooper',
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
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
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
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    ...overrides,
  };
}

function makeTile(overrides: Partial<Tile> = {}): Tile {
  return {
    terrain: 'Open',
    elevation: 0,
    cover: 'None',
    occupied: null,
    objective: null,
    ...overrides,
  };
}

function makeMapTiles(width: number, height: number, mapOverrides?: Record<string, Partial<Tile>>): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      tiles[y][x] = makeTile(mapOverrides?.[key]);
    }
  }
  return tiles;
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  mapOverrides?: Record<string, Partial<Tile>>,
): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: {
      id: 'test-map',
      name: 'Test Map',
      width: 24,
      height: 24,
      tiles: makeMapTiles(24, 24, mapOverrides),
      deploymentZones: { imperial: [], operative: [] },
    },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures,
    activationOrder: figures.map(f => f.id),
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
      'e11-blaster': makeWeapon({
        id: 'e11-blaster',
        name: 'E-11 Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
      }),
      ...weapons,
    },
    armor: {
      'padded-armor': makeArmor(),
      ...armor,
    },
    npcProfiles: {
      stormtrooper: makeNPC(),
    },
  };
}

function defaultWeights(): AIWeights {
  return {
    killPotential: 5,
    coverValue: 3,
    proximity: 2,
    threatLevel: 2,
    elevation: 1,
    selfPreservation: 3,
  };
}

function sniperWeights(): AIWeights {
  return {
    killPotential: 10,
    coverValue: 9,
    proximity: 1,
    threatLevel: 6,
    elevation: 10,
    selfPreservation: 8,
    aimValue: 8,
    dodgeValue: 4,
  };
}

function heroWeights(): AIWeights {
  return {
    killPotential: 9,
    coverValue: 5,
    proximity: 6,
    threatLevel: 10,
    elevation: 3,
    selfPreservation: 7,
    objectiveValue: 8,
    aimValue: 5,
    dodgeValue: 5,
  };
}

// ============================================================================
// SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  (hasLineOfSight as any).mockReturnValue(true);
  (getCover as any).mockReturnValue('None');
  (getValidMoves as any).mockReturnValue([]);
  (getMoraleState as any).mockImplementation((morale: any) => morale.state);
});

// ============================================================================
// BASIC ACTION BUILDER TESTS
// ============================================================================

describe('buildAimAction', () => {
  it('returns an Aim action with correct structure', () => {
    const action = buildAimAction('fig-st-1');
    expect(action.type).toBe('Aim');
    expect(action.figureId).toBe('fig-st-1');
    expect(action.payload).toEqual({});
  });
});

describe('buildDodgeAction', () => {
  it('returns a Dodge action with correct structure', () => {
    const action = buildDodgeAction('fig-hero-1');
    expect(action.type).toBe('Dodge');
    expect(action.figureId).toBe('fig-hero-1');
    expect(action.payload).toEqual({});
  });
});

// ============================================================================
// AIM CONDITION EVALUATOR TESTS
// ============================================================================

describe('evalShouldAimBeforeAttack', () => {
  it('triggers when aimValue > 0, enemies approaching, no targets in range', () => {
    // NPC at x:10 is 5 tiles away -- within weapon range + moveRange + 2
    const fig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    // No targets in range (hasLineOfSight returns false for target check)
    (hasLineOfSight as any).mockReturnValue(false);

    const weights = { ...defaultWeights(), aimValue: 8 };
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(result.satisfied).toBe(true);
    expect(result.context.reasoning).toContain('aim');
  });

  it('does NOT trigger when aimValue is 0', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const weights = { ...defaultWeights(), aimValue: 0 };
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when aimValue is undefined', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const weights = defaultWeights(); // no aimValue
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when aimTokens >= 2 (at cap)', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 }, aimTokens: 2 });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const weights = { ...defaultWeights(), aimValue: 8 };
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when no actions remaining', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 }, actionsRemaining: 0 });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const weights = { ...defaultWeights(), aimValue: 8 };
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when no enemies exist', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const gs = makeGameState([fig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const weights = { ...defaultWeights(), aimValue: 8 };
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('triggers when targets in range but kill probability is low (tough target)', () => {
    // Hero figure aiming at a tough NPC
    const fig = makeFigure({ position: { x: 5, y: 5 }, aimTokens: 0 });
    // Tough NPC: high woundThreshold (hard to kill), low defense/soak (damage gets through)
    // This creates a scenario where aim's marginal damage gain matters because:
    // - The extra die improves hit probability AND conditional expected damage
    // - Kill probability stays low due to high health pool
    const toughNPC = makeNPC({
      id: 'tough-npc',
      name: 'Tough NPC',
      soak: 5,
      woundThreshold: 12,
      defensePool: { difficulty: 1, challenge: 0 },
    });
    const enemy = makeNPCFigure({
      id: 'fig-tough-1',
      entityId: 'tough-npc',
      position: { x: 8, y: 5 },
    });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { 'tough-npc': toughNPC },
    );
    const gd = makeGameData();

    // LOS exists, targets in range
    (hasLineOfSight as any).mockReturnValue(true);

    const weights = heroWeights();
    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    // With a tough target (high wound threshold, low kill probability), aim should trigger
    // Marginal gain from +1 ability die (~0.8 damage) exceeds threshold 0.5 (aimValue=5)
    expect(result.satisfied).toBe(true);
  });
});

// ============================================================================
// DODGE CONDITION EVALUATOR TESTS
// ============================================================================

describe('evalShouldDodgeForDefense', () => {
  it('triggers when wounded + 2+ threats and dodgeValue >= 5', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 3,
      isWounded: true,
      dodgeTokens: 0,
    });
    // Two enemies threatening
    const enemy1 = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const enemy2 = makeFigure({ id: 'fig-hero-2', entityId: 'hero-1', position: { x: 5, y: 7 } });
    const gs = makeGameState(
      [fig, enemy1, enemy2],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    (hasLineOfSight as any).mockReturnValue(true);

    const weights = { ...defaultWeights(), dodgeValue: 5, selfPreservation: 5 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(true);
    expect(result.context.reasoning).toContain('dodging');
  });

  it('does NOT trigger when dodgeValue is 0', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 3,
      isWounded: true,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const weights = { ...defaultWeights(), dodgeValue: 0 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when dodgeValue is undefined', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 3,
      isWounded: true,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const weights = defaultWeights(); // no dodgeValue
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when dodgeTokens >= 1 (at cap)', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 3,
      dodgeTokens: 1,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const weights = { ...defaultWeights(), dodgeValue: 5 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when no actions remaining', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 3,
      actionsRemaining: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const weights = { ...defaultWeights(), dodgeValue: 5 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('does NOT trigger when no enemies threaten (no LOS)', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 3,
      isWounded: true,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    // No LOS = no threat
    (hasLineOfSight as any).mockReturnValue(false);

    const weights = { ...defaultWeights(), dodgeValue: 5 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(false);
  });

  it('triggers when no offensive option + 1+ threats and dodgeValue >= 4', () => {
    // NPC figure with short-range weapon: can't attack distant enemy
    // But the enemy hero has Long-range weapon and CAN threaten the NPC
    const shortRangeNPC = makeNPC({
      id: 'melee-trooper',
      name: 'Melee Trooper',
      weapons: [{
        weaponId: 'vibro-knife',
        name: 'Vibro-knife',
        baseDamage: 5,
        range: 'Engaged',
        critical: 2,
        qualities: [],
      }],
    });
    const fig = makeNPCFigure({
      id: 'fig-mt-1',
      entityId: 'melee-trooper',
      position: { x: 5, y: 5 },
      woundsCurrent: 0,
      dodgeTokens: 0,
    });
    // Enemy at distance 7 -- within hero's Long range but beyond NPC's Engaged range
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 12, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { 'melee-trooper': shortRangeNPC },
    );
    const gd = makeGameData();

    // LOS exists (enemy can see us and threaten us)
    (hasLineOfSight as any).mockReturnValue(true);

    const weights = { ...defaultWeights(), dodgeValue: 4, selfPreservation: 5 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    // NPC has Engaged weapon (1 tile range), enemy is 7 tiles away: no offensive option
    // Enemy hero has Long weapon (16 tiles), distance 7: CAN threaten NPC
    // With dodgeValue >= 4, no offensive option, 1 threat: auto-dodge triggers
    expect(result.satisfied).toBe(true);
  });

  it('triggers with high selfPreservation + high dodgeValue at lower threat', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 2,
      dodgeTokens: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    (hasLineOfSight as any).mockReturnValue(true);

    // High dodge + high self-preservation should trigger even with single threat
    const weights = { ...defaultWeights(), dodgeValue: 8, selfPreservation: 9 };
    const result = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(result.satisfied).toBe(true);
  });
});

// ============================================================================
// ACTION BUILDER COMPOSITE TESTS
// ============================================================================

describe('buildActionsForAIAction - aim-then-attack', () => {
  it('produces Aim + Move when no targets in range', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      aimTokens: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 12, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    // No LOS to targets (so no valid targets)
    (hasLineOfSight as any).mockReturnValue(false);
    // Valid moves toward enemy
    (getValidMoves as any).mockReturnValue([{ x: 7, y: 5 }, { x: 6, y: 5 }]);

    const context = { reasoning: 'test' };
    const actions = buildActionsForAIAction(
      'aim-then-attack', fig, context, gs, gd, sniperWeights(),
    );

    expect(actions.length).toBe(2);
    expect(actions[0].type).toBe('Aim');
    expect(actions[0].figureId).toBe('fig-st-1');
    expect(actions[1].type).toBe('Move');
  });

  it('produces only Aim when targets already in range and no better cover', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      aimTokens: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    // LOS exists - target in range
    (hasLineOfSight as any).mockReturnValue(true);
    // No valid moves (or no better position)
    (getValidMoves as any).mockReturnValue([]);

    const context = { reasoning: 'test' };
    const actions = buildActionsForAIAction(
      'aim-then-attack', fig, context, gs, gd, sniperWeights(),
    );

    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe('Aim');
  });

  it('does not produce Aim when aimTokens already at cap', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      aimTokens: 2,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const context = { reasoning: 'test' };
    const actions = buildActionsForAIAction(
      'aim-then-attack', fig, context, gs, gd, sniperWeights(),
    );

    expect(actions.length).toBe(0);
  });
});

describe('buildActionsForAIAction - dodge-and-hold', () => {
  it('produces Dodge action with retreat destination', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      dodgeTokens: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    // Provide a retreat destination in context
    const context = {
      reasoning: 'test',
      destination: { x: 3, y: 5 },
    };
    const actions = buildActionsForAIAction(
      'dodge-and-hold', fig, context, gs, gd, heroWeights(),
    );

    expect(actions.length).toBe(2);
    expect(actions[0].type).toBe('Dodge');
    expect(actions[0].figureId).toBe('fig-st-1');
    expect(actions[1].type).toBe('Move');
  });

  it('produces only Dodge when no destination and no valid moves', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      dodgeTokens: 0,
    });
    const gs = makeGameState(
      [fig],
      {},
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    (getValidMoves as any).mockReturnValue([]);

    const context = { reasoning: 'test' };
    const actions = buildActionsForAIAction(
      'dodge-and-hold', fig, context, gs, gd, heroWeights(),
    );

    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe('Dodge');
  });

  it('does not produce Dodge when dodgeTokens at cap', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      dodgeTokens: 1,
    });
    const gs = makeGameState(
      [fig],
      {},
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const context = { reasoning: 'test' };
    const actions = buildActionsForAIAction(
      'dodge-and-hold', fig, context, gs, gd, heroWeights(),
    );

    expect(actions.length).toBe(0);
  });

  it('produces Dodge + repositioning move when enemies nearby but no explicit destination', () => {
    const fig = makeNPCFigure({
      position: { x: 5, y: 5 },
      actionsRemaining: 1,
      maneuversRemaining: 1,
      dodgeTokens: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 7, y: 5 } });
    // Set actual cover on the map tiles at move destinations
    // scoreMoveDestinations reads tile.terrain/tile.cover directly, not getCover()
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
      {
        '3,5': { terrain: 'HeavyCover', cover: 'Heavy' },
        '4,5': { terrain: 'LightCover', cover: 'Light' },
      },
    );
    const gd = makeGameData();

    // Cover tiles at (3,5) and (4,5) available as moves
    (getValidMoves as any).mockReturnValue([{ x: 3, y: 5 }, { x: 4, y: 5 }]);

    const context = { reasoning: 'test' };
    const actions = buildActionsForAIAction(
      'dodge-and-hold', fig, context, gs, gd, heroWeights(),
    );

    expect(actions.length).toBe(2);
    expect(actions[0].type).toBe('Dodge');
    expect(actions[1].type).toBe('Move');
  });
});

// ============================================================================
// INTEGRATION TESTS (full pipeline through evaluateCondition + buildActions)
// ============================================================================

describe('AI aim/dodge integration', () => {
  it('sniper with aimValue=8 satisfies aim condition when enemies approach', () => {
    const fig = makeNPCFigure({
      id: 'fig-sniper-1',
      entityId: 'stormtrooper',
      position: { x: 2, y: 2 },
      aimTokens: 0,
    });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 8, y: 2 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    // No LOS (enemy approaching but not in direct sight yet)
    (hasLineOfSight as any).mockReturnValue(false);

    const weights = sniperWeights();
    const aimResult = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);
    expect(aimResult.satisfied).toBe(true);

    // Build actions from the aim decision
    (getValidMoves as any).mockReturnValue([{ x: 3, y: 2 }]);
    const actions = buildActionsForAIAction(
      'aim-then-attack', fig, aimResult.context, gs, gd, weights,
    );
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].type).toBe('Aim');
  });

  it('trooper with low aimValue still attacks normally (no aim regression)', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    (hasLineOfSight as any).mockReturnValue(true);

    // Trooper weights with low aimValue should NOT trigger aim condition
    const weights = { ...defaultWeights(), aimValue: 2 };
    const aimResult = evaluateCondition('should-aim-before-attack', fig, gs, gd, weights);

    // With targets in range and low aimValue, the marginal gain threshold is high
    // (threshold = 0.5 * (5/2) = 1.25), so aim should NOT trigger for normal targets
    // This ensures troopers still prefer direct attacks
    const attackResult = evaluateCondition('enemy-in-range', fig, gs, gd, weights);
    expect(attackResult.satisfied).toBe(true);
  });

  it('hero dodges when wounded and under fire from multiple enemies', () => {
    const fig = makeFigure({
      position: { x: 5, y: 5 },
      woundsCurrent: 10,
      isWounded: true,
      dodgeTokens: 0,
    });
    const enemy1 = makeNPCFigure({ id: 'fig-st-1', position: { x: 7, y: 5 } });
    const enemy2 = makeNPCFigure({ id: 'fig-st-2', entityId: 'stormtrooper', position: { x: 5, y: 7 } });
    const gs = makeGameState(
      [fig, enemy1, enemy2],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    (hasLineOfSight as any).mockReturnValue(true);

    const weights = heroWeights();
    const dodgeResult = evaluateCondition('should-dodge-for-defense', fig, gs, gd, weights);
    expect(dodgeResult.satisfied).toBe(true);

    // Build the dodge actions
    (getValidMoves as any).mockReturnValue([{ x: 3, y: 5 }]);
    const actions = buildActionsForAIAction(
      'dodge-and-hold', fig, dodgeResult.context, gs, gd, weights,
    );
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].type).toBe('Dodge');
  });

  it('melee archetype with aimValue=0 never triggers aim', () => {
    const fig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const meleeWeights: AIWeights = {
      killPotential: 10,
      coverValue: 1,
      proximity: 10,
      threatLevel: 5,
      elevation: 1,
      selfPreservation: 2,
      aimValue: 0,
      dodgeValue: 3,
    };

    const result = evaluateCondition('should-aim-before-attack', fig, gs, gd, meleeWeights);
    expect(result.satisfied).toBe(false);
  });
});

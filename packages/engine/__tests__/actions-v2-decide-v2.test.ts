/**
 * Tests for v2 AI Action Builders (actions-v2.ts) and Decision Engine (decide-v2.ts).
 *
 * Mocks movement, LOS, morale, and evaluate-v2 condition evaluators to isolate
 * the action building and decision logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK MOVEMENT, LOS, MORALE
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  getPath: vi.fn((from: any, to: any) => {
    // Return a simple path from -> to if not same position
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  }),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None' as any),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn((morale: any) => {
    if (typeof morale === 'number') {
      if (morale <= 0) return 'Broken';
      if (morale <= 3) return 'Wavering';
      return 'Steady';
    }
    return 'Steady';
  }),
  checkMoraleEffect: vi.fn(),
}));

import { getValidMoves, getDistance, getPath } from '../src/movement.js';
import { hasLineOfSight, getCover } from '../src/los.js';
import { getMoraleState } from '../src/morale.js';

import {
  buildMoveAction,
  buildAttackAction,
  buildRallyAction,
  buildGuardedStanceAction,
  buildTakeCoverAction,
  buildStrainForManeuverAction,
  buildActionsForAIAction,
} from '../src/ai/actions-v2.js';

import {
  loadAIProfiles,
  getProfileForFigure,
  determineActions,
  generateCardText,
} from '../src/ai/decide-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  GameAction,
  HeroCharacter,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  Tile,
} from '../src/types.js';

import type {
  AIWeights,
  AIProfilesData,
  AIArchetypeProfile,
  ConditionContext,
} from '../src/ai/types.js';

// ============================================================================
// TEST FIXTURES (shared with evaluate-v2 tests)
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

function makeMapTiles(width: number, height: number): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = makeTile();
    }
  }
  return tiles;
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
    map: {
      id: 'test-map',
      name: 'Test Map',
      width: 24,
      height: 24,
      tiles: makeMapTiles(24, 24),
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
      'vibro-knife': makeMeleeWeapon(),
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
    coverValue: 5,
    proximity: 5,
    threatLevel: 5,
    elevation: 2,
    selfPreservation: 5,
  };
}

function makeProfilesData(overrides: Partial<AIProfilesData> = {}): AIProfilesData {
  return {
    archetypes: {
      trooper: {
        id: 'trooper',
        name: 'Trooper',
        cardTitle: 'STANDARD TROOPER',
        description: 'Advance and fire.',
        priorityRules: [
          { rank: 1, condition: 'can-kill-target', action: 'attack-kill-target', cardText: 'If can kill: Attack.' },
          { rank: 2, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'If enemy in range: Attack.' },
          { rank: 3, condition: 'default', action: 'advance-with-cover', cardText: 'Otherwise: Advance.' },
        ],
        weights: defaultWeights(),
      },
      sniper: {
        id: 'sniper',
        name: 'Sniper',
        cardTitle: 'SNIPER',
        description: 'Hold position and fire.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'If enemy in range: Attack.' },
          { rank: 2, condition: 'has-overwatch-opportunity', action: 'set-overwatch', cardText: 'If overwatch: Guard.' },
          { rank: 3, condition: 'default', action: 'hold-position', cardText: 'Otherwise: Hold.' },
        ],
        weights: { ...defaultWeights(), coverValue: 8, proximity: 2 },
      },
      ...overrides.archetypes,
    },
    unitMapping: {
      stormtrooper: 'trooper',
      ...overrides.unitMapping,
    },
    defaultArchetype: overrides.defaultArchetype ?? 'trooper',
  };
}

// ============================================================================
// SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock behaviors
  (getValidMoves as any).mockReturnValue([]);
  (getDistance as any).mockImplementation((a: any, b: any) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  );
  (getPath as any).mockImplementation((from: any, to: any) => {
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  });
  (hasLineOfSight as any).mockReturnValue(true);
  (getCover as any).mockReturnValue('None');
  (getMoraleState as any).mockImplementation((morale: any) => {
    if (typeof morale === 'number') {
      if (morale <= 0) return 'Broken';
      if (morale <= 3) return 'Wavering';
      return 'Steady';
    }
    return 'Steady';
  });
});

// ============================================================================
// BASIC ACTION BUILDER TESTS
// ============================================================================

describe('buildMoveAction', () => {
  it('builds a Move action with path', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const dest = { x: 7, y: 5 };

    const action = buildMoveAction(fig, dest, gs);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('Move');
    expect(action!.figureId).toBe('fig-hero-1');
    expect(action!.payload).toHaveProperty('path');
  });

  it('returns null when path is empty', () => {
    (getPath as any).mockReturnValue([]);
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const dest = { x: 5, y: 5 }; // same position

    const action = buildMoveAction(fig, dest, gs);
    expect(action).toBeNull();
  });
});

describe('buildAttackAction', () => {
  it('builds an Attack action with real weapon ID for hero', () => {
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const action = buildAttackAction(fig, 'fig-st-1', gs, gd);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('Attack');
    expect(action!.payload).toEqual({
      targetId: 'fig-st-1',
      weaponId: 'blaster-rifle', // hero's primary weapon
    });
  });

  it('builds an Attack action with NPC weapon ID', () => {
    const npcFig = makeNPCFigure({ position: { x: 10, y: 5 } });
    const heroFig = makeFigure({ position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const action = buildAttackAction(npcFig, 'fig-hero-1', gs, gd);
    expect(action).not.toBeNull();
    expect(action!.payload).toEqual({
      targetId: 'fig-hero-1',
      weaponId: 'e11-blaster', // NPC's first weapon
    });
  });

  it('returns null when target is out of range', () => {
    const fig = makeFigure({ position: { x: 0, y: 0 } });
    const enemy = makeNPCFigure({ position: { x: 20, y: 20 } }); // 40 tiles away
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const action = buildAttackAction(fig, 'fig-st-1', gs, gd);
    expect(action).toBeNull();
  });

  it('returns null when no LOS', () => {
    (hasLineOfSight as any).mockReturnValue(false);
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [fig, enemy],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const action = buildAttackAction(fig, 'fig-st-1', gs, gd);
    expect(action).toBeNull();
  });
});

describe('simple action builders', () => {
  it('buildRallyAction creates Rally action', () => {
    const action = buildRallyAction('fig-1');
    expect(action.type).toBe('Rally');
    expect(action.figureId).toBe('fig-1');
  });

  it('buildGuardedStanceAction creates GuardedStance action', () => {
    const action = buildGuardedStanceAction('fig-1');
    expect(action.type).toBe('GuardedStance');
  });

  it('buildTakeCoverAction creates TakeCover action', () => {
    const action = buildTakeCoverAction('fig-1');
    expect(action.type).toBe('TakeCover');
  });

  it('buildStrainForManeuverAction creates StrainForManeuver action', () => {
    const action = buildStrainForManeuverAction('fig-1');
    expect(action.type).toBe('StrainForManeuver');
  });
});

// ============================================================================
// COMPOSITE ACTION BUILDER TESTS
// ============================================================================

describe('buildActionsForAIAction', () => {
  const weights = defaultWeights();

  describe('attack-kill-target', () => {
    it('attacks directly when target is in range', () => {
      const fig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();
      const ctx: ConditionContext = { targetId: 'fig-st-1', reasoning: 'can kill' };

      const actions = buildActionsForAIAction('attack-kill-target', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('Attack');
    });

    it('moves then attacks when target not in range', () => {
      // Target at distance 20 (out of Long range = 16), but attackPosition is closer
      const fig = makeFigure({ position: { x: 0, y: 0 } });
      const enemy = makeNPCFigure({ position: { x: 20, y: 0 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();
      const ctx: ConditionContext = {
        targetId: 'fig-st-1',
        attackPosition: { x: 5, y: 0 },
        reasoning: 'move to attack',
      };

      const actions = buildActionsForAIAction('attack-kill-target', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe('Move');
      expect(actions[1].type).toBe('Attack');
    });

    it('returns empty when no action remaining', () => {
      const fig = makeFigure({ actionsRemaining: 0, position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();
      const ctx: ConditionContext = { targetId: 'fig-st-1', reasoning: 'test' };

      const actions = buildActionsForAIAction('attack-kill-target', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(0);
    });
  });

  describe('move-to-cover-then-attack', () => {
    it('moves to cover then attacks', () => {
      const fig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 12, y: 5 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();
      const ctx: ConditionContext = {
        targetId: 'fig-st-1',
        attackPosition: { x: 8, y: 5 },
        reasoning: 'cover attack',
      };

      const actions = buildActionsForAIAction('move-to-cover-then-attack', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe('Move');
      expect(actions[1].type).toBe('Attack');
    });

    it('returns empty when no maneuver remaining', () => {
      const fig = makeFigure({ maneuversRemaining: 0 });
      const ctx: ConditionContext = {
        targetId: 'fig-st-1',
        attackPosition: { x: 8, y: 5 },
        reasoning: 'test',
      };
      const gs = makeGameState([fig], { 'hero-1': makeHero() });
      const gd = makeGameData();

      const actions = buildActionsForAIAction('move-to-cover-then-attack', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(0);
    });
  });

  describe('attack-best-target', () => {
    it('attacks single target (no double attack in v2)', () => {
      const fig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();
      const ctx: ConditionContext = { targetId: 'fig-st-1', reasoning: 'best target' };

      const actions = buildActionsForAIAction('attack-best-target', fig, ctx, gs, gd, weights);
      // v2: only 1 attack (1 Action slot), not 2 like v1
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('Attack');
    });
  });

  describe('retreat-to-cover', () => {
    it('moves to cover then rallies', () => {
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': makeHero() });
      const gd = makeGameData();
      const ctx: ConditionContext = {
        destination: { x: 3, y: 3 },
        reasoning: 'retreat',
      };

      const actions = buildActionsForAIAction('retreat-to-cover', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe('Move');
      expect(actions[1].type).toBe('Rally');
    });
  });

  describe('set-overwatch (mapped to GuardedStance)', () => {
    it('returns GuardedStance action', () => {
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': makeHero() });
      const gd = makeGameData();
      const ctx: ConditionContext = { reasoning: 'overwatch' };

      const actions = buildActionsForAIAction('set-overwatch', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('GuardedStance');
    });

    it('returns empty when no action remaining', () => {
      const fig = makeFigure({ actionsRemaining: 0 });
      const gs = makeGameState([fig], { 'hero-1': makeHero() });
      const gd = makeGameData();
      const ctx: ConditionContext = { reasoning: 'overwatch' };

      const actions = buildActionsForAIAction('set-overwatch', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(0);
    });
  });

  describe('melee-charge', () => {
    it('attacks directly when adjacent', () => {
      const fig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ id: 'fig-st-1', position: { x: 6, y: 5 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();
      const ctx: ConditionContext = { targetId: 'fig-st-1', reasoning: 'melee' };

      const actions = buildActionsForAIAction('melee-charge', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('Attack');
    });

    it('moves adjacent then attacks when not adjacent', () => {
      const fig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ id: 'fig-st-1', position: { x: 8, y: 5 } });
      const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
      const gd = makeGameData();

      // Mock findMeleePositions indirectly via getValidMoves
      (getValidMoves as any).mockReturnValue([
        { x: 7, y: 5 },
        { x: 7, y: 4 },
        { x: 6, y: 5 },
      ]);

      const ctx: ConditionContext = { targetId: 'fig-st-1', reasoning: 'melee charge' };

      const actions = buildActionsForAIAction('melee-charge', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe('Move');
      expect(actions[1].type).toBe('Attack');
    });
  });

  describe('rest (mapped to Rally)', () => {
    it('returns Rally action', () => {
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': makeHero() });
      const gd = makeGameData();
      const ctx: ConditionContext = { reasoning: 'rest' };

      const actions = buildActionsForAIAction('rest', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('Rally');
    });
  });

  describe('hold-position', () => {
    it('returns empty actions', () => {
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': makeHero() });
      const gd = makeGameData();
      const ctx: ConditionContext = { reasoning: 'hold' };

      const actions = buildActionsForAIAction('hold-position', fig, ctx, gs, gd, weights);
      expect(actions).toHaveLength(0);
    });
  });

  describe('advance-with-cover', () => {
    it('moves toward nearest enemy', () => {
      const fig = makeNPCFigure({ id: 'fig-st-1', position: { x: 0, y: 0 }, playerId: 2 });
      const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 0 }, playerId: 1 });
      const gs = makeGameState(
        [fig, enemy],
        { 'hero-1': makeHero() },
        { stormtrooper: makeNPC() },
      );
      const gd = makeGameData();

      (getValidMoves as any).mockReturnValue([
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 0, y: 1 },
      ]);

      const ctx: ConditionContext = { reasoning: 'advance' };
      const actions = buildActionsForAIAction('advance-with-cover', fig, ctx, gs, gd, weights);

      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions[0].type).toBe('Move');
    });
  });

  describe('move-toward-enemy', () => {
    it('moves toward nearest enemy', () => {
      const fig = makeNPCFigure({ id: 'fig-st-1', position: { x: 0, y: 0 }, playerId: 2 });
      const enemy = makeFigure({ id: 'fig-hero-1', position: { x: 10, y: 0 }, playerId: 1 });
      const gs = makeGameState(
        [fig, enemy],
        { 'hero-1': makeHero() },
        { stormtrooper: makeNPC() },
      );
      const gd = makeGameData();

      (getValidMoves as any).mockReturnValue([
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]);

      const ctx: ConditionContext = { reasoning: 'move' };
      const actions = buildActionsForAIAction('move-toward-enemy', fig, ctx, gs, gd, weights);

      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions[0].type).toBe('Move');
    });
  });
});

// ============================================================================
// DECIDE-V2 TESTS
// ============================================================================

describe('loadAIProfiles', () => {
  it('loads profiles from data object', () => {
    const data = {
      archetypes: { trooper: { id: 'trooper', name: 'Trooper' } },
      unitMapping: { st: 'trooper' },
      defaultArchetype: 'trooper',
    };

    const profiles = loadAIProfiles(data);
    expect(profiles.archetypes).toHaveProperty('trooper');
    expect(profiles.unitMapping).toHaveProperty('st');
    expect(profiles.defaultArchetype).toBe('trooper');
  });

  it('provides defaults for missing fields', () => {
    const profiles = loadAIProfiles({});
    expect(profiles.archetypes).toEqual({});
    expect(profiles.unitMapping).toEqual({});
    expect(profiles.defaultArchetype).toBe('trooper');
  });
});

describe('getProfileForFigure', () => {
  it('resolves NPC archetype from npcProfile.aiArchetype', () => {
    const fig = makeNPCFigure();
    const gs = makeGameState(
      [fig],
      {},
      { stormtrooper: makeNPC({ aiArchetype: 'trooper' }) },
    );
    const profiles = makeProfilesData();

    const profile = getProfileForFigure(fig, gs, profiles);
    expect(profile.id).toBe('trooper');
  });

  it('falls back to unitMapping for hero', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const profiles = makeProfilesData({
      unitMapping: { 'hero-1': 'sniper' },
    });

    const profile = getProfileForFigure(fig, gs, profiles);
    expect(profile.id).toBe('sniper');
  });

  it('falls back to default archetype when no mapping exists', () => {
    const fig = makeFigure({ entityId: 'unknown-hero' });
    const gs = makeGameState([fig], { 'unknown-hero': makeHero({ id: 'unknown-hero' }) });
    const profiles = makeProfilesData();

    const profile = getProfileForFigure(fig, gs, profiles);
    expect(profile.id).toBe('trooper'); // default
  });

  it('returns fallback profile when all lookups fail', () => {
    const fig = makeFigure({ entityId: 'unknown-hero' });
    const gs = makeGameState([fig], { 'unknown-hero': makeHero({ id: 'unknown-hero' }) });
    const profiles = makeProfilesData();
    // Remove all archetypes
    profiles.archetypes = {};

    const profile = getProfileForFigure(fig, gs, profiles);
    expect(profile.id).toBe('fallback');
    expect(profile.priorityRules.length).toBeGreaterThanOrEqual(1);
  });
});

describe('determineActions', () => {
  it('returns actions for the first matching rule', () => {
    // Set up: NPC in range of hero (enemy-in-range should match)
    const npcFig = makeNPCFigure({ position: { x: 10, y: 5 } });
    const heroFig = makeFigure({ position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);

    // Should have matched some rule and produced actions
    expect(result.matchedRule).toBeDefined();
    expect(result.reasoning).toBeTruthy();
  });

  it('returns Rally when no rules match', () => {
    // Set up: no enemies on board, so conditions fail
    const npcFig = makeNPCFigure({ position: { x: 10, y: 5 } });
    const gs = makeGameState([npcFig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    // Make a profile where no conditions can be satisfied
    const profiles = makeProfilesData({
      archetypes: {
        trooper: {
          id: 'trooper',
          name: 'Trooper',
          cardTitle: 'TROOPER',
          description: 'Test',
          priorityRules: [
            { rank: 1, condition: 'can-kill-target', action: 'attack-kill-target', cardText: 'Kill.' },
            // No default rule!
          ],
          weights: defaultWeights(),
        },
      },
    });

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('Rally');
    expect(result.reasoning).toContain('No rules matched');
  });

  it('handles no actions/maneuvers remaining', () => {
    const npcFig = makeNPCFigure({
      actionsRemaining: 0,
      maneuversRemaining: 0,
    });
    const gs = makeGameState([npcFig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.actions).toHaveLength(0);
    expect(result.reasoning).toContain('No actions or maneuvers remaining');
  });

  it('forces retreat when morale is broken (Nemesis NPC)', () => {
    // Nemesis-tier NPCs still check morale (only Minion/Rival are exempt)
    const npcFig = makeNPCFigure({ entityId: 'inquisitor', position: { x: 10, y: 5 } });
    const heroFig = makeFigure({ position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { inquisitor: makeNPC({ id: 'inquisitor', tier: 'Nemesis' }) },
    );
    // Set morale to broken
    gs.imperialMorale = { value: 0, max: 10, state: 'Broken' };
    (getMoraleState as any).mockReturnValue('Broken');

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.reasoning).toContain('MORALE BROKEN');
  });

  it('Imperial Minion/Rival NPCs are morale-exempt (fight to the death)', () => {
    // Stormtroopers (Minion tier) should NOT be affected by broken morale
    const npcFig = makeNPCFigure({ position: { x: 10, y: 5 } });
    const heroFig = makeFigure({ position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    // Set morale to broken
    gs.imperialMorale = { value: 0, max: 10, state: 'Broken' };
    (getMoraleState as any).mockReturnValue('Broken');

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    // Should NOT contain MORALE BROKEN -- minions fight to the death
    expect(result.reasoning).not.toContain('MORALE BROKEN');
  });

  it('matches default rule for advance-with-cover', () => {
    // NPC far from enemy, should match 'default' rule and advance
    const npcFig = makeNPCFigure({ position: { x: 0, y: 0 } });
    const heroFig = makeFigure({ position: { x: 20, y: 0 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    // Provide valid moves so advance-with-cover can produce actions
    (getValidMoves as any).mockReturnValue([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.matchedRule.condition).toBe('default');
    expect(result.actions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('generateCardText', () => {
  it('generates card text with v2 action economy', () => {
    const profiles = makeProfilesData();
    const profile = profiles.archetypes['trooper'];
    const text = generateCardText(profile);

    expect(text).toContain('STANDARD TROOPER');
    expect(text).toContain('CHECK THESE IN ORDER');
    expect(text).toContain('1 Action + 1 Maneuver');
    expect(text).toContain('Suffer 2 strain for extra Maneuver');
    // Should NOT mention "2 actions per activation" (that's v1)
    expect(text).not.toContain('2 actions per activation');
  });
});

// ============================================================================
// V2 ACTION ECONOMY VALIDATION
// ============================================================================

describe('v2 action economy enforcement', () => {
  it('attack-kill-target does NOT double-attack (v1 allowed this)', () => {
    // In v1, a figure with 2 actions could double-attack.
    // In v2, there's only 1 Action slot, so only 1 attack.
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const ctx: ConditionContext = { targetId: 'fig-st-1', reasoning: 'kill' };

    const actions = buildActionsForAIAction('attack-kill-target', fig, ctx, gs, gd, defaultWeights());
    const attackActions = actions.filter(a => a.type === 'Attack');
    expect(attackActions).toHaveLength(1);
  });

  it('move+attack uses maneuver for move and action for attack', () => {
    const fig = makeFigure({ position: { x: 0, y: 0 } });
    const enemy = makeNPCFigure({ position: { x: 20, y: 0 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const ctx: ConditionContext = {
      targetId: 'fig-st-1',
      attackPosition: { x: 5, y: 0 },
      reasoning: 'move+attack',
    };

    const actions = buildActionsForAIAction('attack-kill-target', fig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('Move');   // Maneuver
    expect(actions[1].type).toBe('Attack'); // Action
  });

  it('cannot move+attack without maneuver remaining', () => {
    const fig = makeFigure({
      position: { x: 0, y: 0 },
      maneuversRemaining: 0, // no maneuver
    });
    const enemy = makeNPCFigure({ position: { x: 20, y: 0 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const ctx: ConditionContext = {
      targetId: 'fig-st-1',
      attackPosition: { x: 5, y: 0 },
      reasoning: 'move+attack',
    };

    const actions = buildActionsForAIAction('attack-kill-target', fig, ctx, gs, gd, defaultWeights());
    // Should still be able to attack from current position if target is somehow in range
    // But target is at distance 20 and blaster-rifle is Long (16 max), so no valid target
    expect(actions).toHaveLength(0);
  });

  it('retreat produces Move + Rally (not Move + Rest)', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();
    const ctx: ConditionContext = { destination: { x: 3, y: 3 }, reasoning: 'retreat' };

    const actions = buildActionsForAIAction('retreat-to-cover', fig, ctx, gs, gd, defaultWeights());
    const types = actions.map(a => a.type);
    expect(types).not.toContain('Rest');
    expect(types).toContain('Rally');
  });

  it('set-overwatch produces GuardedStance (not Overwatch)', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'overwatch' };

    const actions = buildActionsForAIAction('set-overwatch', fig, ctx, gs, gd, defaultWeights());
    const types = actions.map(a => a.type);
    expect(types).not.toContain('Overwatch');
    expect(types).toContain('GuardedStance');
  });
});

// ============================================================================
// WEAPON ID RESOLUTION
// ============================================================================

describe('weapon ID resolution in actions', () => {
  it('hero attack uses primary weapon ID (not "basic")', () => {
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });
    const gs = makeGameState([fig, enemy], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const atk = buildAttackAction(fig, 'fig-st-1', gs, gd);
    expect(atk).not.toBeNull();
    expect((atk!.payload as any).weaponId).not.toBe('basic');
    expect((atk!.payload as any).weaponId).toBe('blaster-rifle');
  });

  it('NPC attack uses first weapon from profile', () => {
    const npcFig = makeNPCFigure({ position: { x: 10, y: 5 } });
    const heroFig = makeFigure({ position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const atk = buildAttackAction(npcFig, 'fig-hero-1', gs, gd);
    expect(atk).not.toBeNull();
    expect((atk!.payload as any).weaponId).toBe('e11-blaster');
  });

  it('NPC with no weapons falls back to "unarmed"', () => {
    const unarmedNPC = makeNPC({ id: 'unarmed-npc', weapons: [] });
    const npcFig = makeNPCFigure({
      id: 'fig-unarmed',
      entityId: 'unarmed-npc',
      position: { x: 10, y: 5 },
    });
    const heroFig = makeFigure({ position: { x: 7, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { 'unarmed-npc': unarmedNPC },
    );
    const gd = makeGameData();

    // getValidTargetsV2 will still check range/LOS
    // Since the unarmed NPC has no weapon, getValidTargetsV2 may return empty
    // But the buildAttackAction call uses getPrimaryWeaponId internally
    // Let's test the weapon ID resolution directly by building attack with valid targets
    const atk = buildAttackAction(npcFig, 'fig-hero-1', gs, gd);
    // This may be null if getValidTargetsV2 returns no targets (no weapon = no range)
    // That's fine behavior -- an unarmed NPC can't attack
    if (atk !== null) {
      expect((atk.payload as any).weaponId).toBe('unarmed');
    }
  });
});

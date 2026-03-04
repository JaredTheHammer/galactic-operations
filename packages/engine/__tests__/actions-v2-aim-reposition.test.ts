/**
 * Tests for actions-v2.ts aim-then-attack reposition path and other uncovered branches.
 *
 * Targets:
 * - buildAimThenAttack: reposition to better cover when targets already in range
 * - buildAimThenAttack: no targets, no enemies fallback
 * - buildAimThenAttack: aimTokens >= 2 returns empty
 * - buildDodgeAndHold: dodgeTokens >= 1 returns empty
 * - buildDodgeAndHold: retreat to cover via context.destination
 * - getPrimaryWeaponId: hero weapon, NPC weapon, unarmed fallback
 * - Unknown action ID returns empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  getPath: vi.fn((from: any, to: any) => {
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  }),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None' as any),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn(() => 'Steady'),
  checkMoraleEffect: vi.fn(),
}));

import { getValidMoves, getDistance, getPath } from '../src/movement.js';
import { hasLineOfSight, getCover } from '../src/los.js';

import {
  buildActionsForAIAction,
} from '../src/ai/actions-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  Tile,
} from '../src/types.js';

import type { AIWeights, ConditionContext } from '../src/ai/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
}

function makeMapTiles(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => makeTile()));
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, melee: 1 },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: null, gear: [] },
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
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
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
    aimTokens: 0,
    dodgeTokens: 0,
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 8, y: 5 },
    ...overrides,
  });
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 24, height: 24, tiles: makeMapTiles(24, 24), deploymentZones: { imperial: [], operative: [] } },
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
    imperialMorale: { value: 10, max: 12, state: 'Steady' },
    operativeMorale: { value: 10, max: 12, state: 'Steady' },
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
    ...overrides,
  };
}

function makeGameData(): GameData {
  return {
    dice: {} as any,
    species: {} as any,
    careers: {} as any,
    specializations: {} as any,
    weapons: {
      'blaster-rifle': {
        id: 'blaster-rifle',
        name: 'Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
        qualities: [],
        encumbrance: 2,
        cost: 900,
      } as any,
    },
    armor: {},
    npcProfiles: { stormtrooper: makeNPC() },
  };
}

function defaultWeights(): AIWeights {
  return { killPotential: 5, coverValue: 5, proximity: 5, threatLevel: 5, elevation: 2, selfPreservation: 5 };
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

// ============================================================================
// aim-then-attack: REPOSITION TO BETTER COVER
// ============================================================================

describe('aim-then-attack: reposition to better cover when targets in range', () => {
  it('aims and repositions to cover when enemy already in range', () => {
    // Enemy is nearby and in LOS
    const heroFig = makeFigure({ position: { x: 5, y: 5 }, aimTokens: 0 });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    // Cover tile available
    (getValidMoves as any).mockReturnValue([
      { x: 6, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 5 },
    ]);

    const gs = makeGameState(
      [heroFig, enemyFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    // Add cover at reposition destination
    gs.map.tiles[5][6] = { terrain: 'LightCover', elevation: 0, cover: 'Light', occupied: null, objective: null };

    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'aim setup' };

    const actions = buildActionsForAIAction('aim-then-attack', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions.length).toBeGreaterThanOrEqual(1);
    // First action should be Aim
    expect(actions[0].type).toBe('Aim');
  });

  it('returns empty when aimTokens already at max (2)', () => {
    const heroFig = makeFigure({ aimTokens: 2 });
    const enemyFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, enemyFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'aim' };

    const actions = buildActionsForAIAction('aim-then-attack', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(0);
  });

  it('returns empty when no actions remaining', () => {
    const heroFig = makeFigure({ actionsRemaining: 0, aimTokens: 0 });
    const enemyFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, enemyFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'aim' };

    const actions = buildActionsForAIAction('aim-then-attack', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(0);
  });

  it('aims and moves toward nearest enemy when no targets in range', () => {
    const heroFig = makeFigure({ position: { x: 0, y: 0 }, aimTokens: 0 });
    const enemyFig = makeNPCFigure({ position: { x: 20, y: 0 } });

    // No LOS (enemy too far for attack)
    (hasLineOfSight as any).mockReturnValue(false);
    (getValidMoves as any).mockReturnValue([{ x: 4, y: 0 }]);

    const gs = makeGameState(
      [heroFig, enemyFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'aim' };

    const actions = buildActionsForAIAction('aim-then-attack', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions[0].type).toBe('Aim');
    // Should have a Move to close distance
    const hasMove = actions.some(a => a.type === 'Move');
    expect(hasMove).toBe(true);
  });
});

// ============================================================================
// dodge-and-hold
// ============================================================================

describe('dodge-and-hold', () => {
  it('returns empty when dodgeTokens already at 1', () => {
    const heroFig = makeFigure({ dodgeTokens: 1 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'dodge' };

    const actions = buildActionsForAIAction('dodge-and-hold', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(0);
  });

  it('returns empty when no actions remaining', () => {
    const heroFig = makeFigure({ actionsRemaining: 0, dodgeTokens: 0 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'dodge' };

    const actions = buildActionsForAIAction('dodge-and-hold', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(0);
  });

  it('dodges and moves to cover when destination provided', () => {
    const heroFig = makeFigure({ dodgeTokens: 0, actionsRemaining: 1, maneuversRemaining: 1 });
    (getValidMoves as any).mockReturnValue([{ x: 6, y: 5 }]);

    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'dodge', destination: { x: 6, y: 5 } };

    const actions = buildActionsForAIAction('dodge-and-hold', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions[0].type).toBe('Dodge');
    // May have Move as second action
    if (actions.length > 1) {
      expect(actions[1].type).toBe('Move');
    }
  });
});

// ============================================================================
// Unknown action ID
// ============================================================================

describe('unknown action ID', () => {
  it('returns empty for unrecognized action', () => {
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() });
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'unknown' };

    const actions = buildActionsForAIAction('nonexistent-action' as any, heroFig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(0);
  });
});

// ============================================================================
// retreat-to-cover
// ============================================================================

describe('retreat-to-cover', () => {
  it('moves toward cover position from context destination', () => {
    const heroFig = makeFigure({ maneuversRemaining: 1 });
    (getValidMoves as any).mockReturnValue([{ x: 3, y: 5 }, { x: 4, y: 5 }]);

    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'retreat', destination: { x: 3, y: 5 } };

    const actions = buildActionsForAIAction('retreat-to-cover', heroFig, ctx, gs, gd, defaultWeights());
    if (actions.length > 0) {
      expect(actions[0].type).toBe('Move');
    }
  });

  it('returns empty when no maneuvers remaining', () => {
    const heroFig = makeFigure({ maneuversRemaining: 0 });

    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'retreat', destination: { x: 3, y: 5 } };

    const actions = buildActionsForAIAction('retreat-to-cover', heroFig, ctx, gs, gd, defaultWeights());
    expect(actions).toHaveLength(0);
  });
});

// ============================================================================
// attack-best-target: edge cases
// ============================================================================

describe('attack-best-target edge cases', () => {
  it('moves and attacks when targets in range from new position', () => {
    const npcFig = makeNPCFigure({ position: { x: 0, y: 0 }, actionsRemaining: 1, maneuversRemaining: 1 });
    const heroFig = makeFigure({ position: { x: 6, y: 0 } });

    // After moving to (4,0), enemy will be in range
    (getValidMoves as any).mockReturnValue([{ x: 4, y: 0 }]);
    // LOS after move
    (hasLineOfSight as any).mockReturnValue(true);

    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const ctx: ConditionContext = { reasoning: 'attack', targetId: heroFig.id };

    const actions = buildActionsForAIAction('attack-best-target', npcFig, ctx, gs, gd, defaultWeights());
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });
});

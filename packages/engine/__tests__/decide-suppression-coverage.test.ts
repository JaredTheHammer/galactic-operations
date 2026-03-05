/**
 * decide-suppression-coverage.test.ts
 *
 * Additional coverage for suppression/panic decision paths in decide-v2.ts:
 * - Panicked figure with cover reachable: verifies attack actions are stripped
 * - Suppressed figure with cover reachable: verifies only move actions returned
 * - Threshold boundary tests (exact boundary values)
 * - NPC suppression behavior
 * - Panicked figure with no valid moves returns empty actions
 * - Imperial NPC suppression (not exempt from suppression, only morale)
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
import { getMoraleState } from '../src/morale.js';

import { determineActions } from '../src/ai/decide-v2.js';

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

import type { AIProfilesData, AIWeights } from '../src/ai/types.js';

// ============================================================================
// FIXTURES (reused from decide-morale-suppression.test.ts pattern)
// ============================================================================

function makeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
    id: 'blaster-rifle', name: 'Blaster Rifle', type: 'Ranged (Heavy)',
    skill: 'ranged-heavy', baseDamage: 9, range: 'Long', critical: 3,
    qualities: [], encumbrance: 2, cost: 900, ...overrides,
  };
}

function makeArmor(overrides: Partial<ArmorDefinition> = {}): ArmorDefinition {
  return {
    id: 'padded-armor', name: 'Padded Armor', soak: 2, defense: 0,
    encumbrance: 2, cost: 500, keywords: [], ...overrides,
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1', name: 'Test Hero', species: 'human', career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, melee: 1 }, talents: [],
    wounds: { current: 0, threshold: 14 }, strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 0, available: 0 }, ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper', name: 'Stormtrooper', side: 'Imperial', tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4, strainThreshold: null, soak: 3, speed: 4,
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
    aiArchetype: 'trooper', keywords: ['Imperial', 'Trooper'], abilities: [], ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1', entityType: 'hero', entityId: 'hero-1', playerId: 1,
    position: { x: 5, y: 5 }, woundsCurrent: 0, strainCurrent: 0,
    actionsRemaining: 1, maneuversRemaining: 1, hasUsedStrainForManeuver: false,
    isActivated: false, isDefeated: false, isWounded: false, conditions: [],
    suppressionTokens: 0, courage: 2,
    talentUsesThisEncounter: {}, talentUsesThisSession: {},
    cachedAttackPool: null, cachedDefensePool: null, ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1', entityType: 'npc', entityId: 'stormtrooper',
    playerId: 2, position: { x: 15, y: 5 }, ...overrides,
  });
}

function makeTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
}

function makeMapTiles(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => makeTile()));
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission', roundNumber: 1, turnPhase: 'Activation', playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 24, height: 24, tiles: makeMapTiles(24, 24), deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0, figures, activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0, heroes, npcProfiles,
    imperialMorale: { value: 10, max: 12, state: 'Steady' },
    operativeMorale: { value: 10, max: 12, state: 'Steady' },
    activeCombat: null, threatPool: 0, reinforcementPoints: 0, actionLog: [],
    gameMode: 'Solo', winner: null, victoryCondition: null, activeMissionId: null,
    lootCollected: [], interactedTerminals: [], completedObjectiveIds: [], objectivePoints: [],
    ...overrides,
  };
}

function makeGameData(): GameData {
  return {
    dice: {} as any, species: {} as any, careers: {} as any, specializations: {} as any,
    weapons: { 'blaster-rifle': makeWeapon() }, armor: { 'padded-armor': makeArmor() },
    npcProfiles: { stormtrooper: makeNPC() },
  };
}

function defaultWeights(): AIWeights {
  return { killPotential: 5, coverValue: 5, proximity: 5, threatLevel: 5, elevation: 2, selfPreservation: 5 };
}

function makeProfilesData(): AIProfilesData {
  return {
    archetypes: {
      trooper: {
        id: 'trooper', name: 'Trooper', cardTitle: 'TROOPER', description: 'Advance and fire.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Attack.' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance.' },
        ],
        weights: defaultWeights(),
      },
      hero: {
        id: 'hero', name: 'Hero', cardTitle: 'HERO', description: 'Hero behavior.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Attack.' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance.' },
        ],
        weights: defaultWeights(),
      },
    },
    unitMapping: { stormtrooper: 'trooper' },
    defaultArchetype: 'trooper',
  };
}

// ============================================================================
// SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  (getValidMoves as any).mockReturnValue([]);
  (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
  (getPath as any).mockImplementation((from: any, to: any) => {
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  });
  (hasLineOfSight as any).mockReturnValue(true);
  (getCover as any).mockReturnValue('None');
  (getMoraleState as any).mockReturnValue('Steady');
});

// ============================================================================
// SUPPRESSION THRESHOLD BOUNDARY TESTS
// ============================================================================

describe('suppression threshold boundaries', () => {
  it('figure at courage-1 tokens is NOT suppressed (normal behavior)', () => {
    const heroFig = makeFigure({ playerId: 1, suppressionTokens: 1, courage: 2 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([heroFig, npcFig], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).not.toContain('SUPPRESSED');
    expect(result.reasoning).not.toContain('PANICKED');
  });

  it('figure at exactly courage tokens IS suppressed', () => {
    (getValidMoves as any).mockReturnValue([]);
    const heroFig = makeFigure({ playerId: 1, suppressionTokens: 3, courage: 3 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([heroFig, npcFig], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('SUPPRESSED');
  });

  it('figure at 2*courage-1 tokens is suppressed (not panicked)', () => {
    (getValidMoves as any).mockReturnValue([]);
    const heroFig = makeFigure({ playerId: 1, suppressionTokens: 5, courage: 3 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([heroFig, npcFig], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('SUPPRESSED');
    expect(result.reasoning).not.toContain('PANICKED');
  });

  it('figure at exactly 2*courage tokens IS panicked', () => {
    (getValidMoves as any).mockReturnValue([]);
    const heroFig = makeFigure({ playerId: 1, suppressionTokens: 6, courage: 3 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([heroFig, npcFig], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('PANICKED');
  });
});

// ============================================================================
// NPC SUPPRESSION (not morale-exempt)
// ============================================================================

describe('NPC suppression', () => {
  it('Imperial NPC is still subject to suppression even when morale-exempt', () => {
    // Morale exemption doesn't apply to suppression
    const npcFig = makeNPCFigure({ suppressionTokens: 4, courage: 2 });
    const heroFig = makeFigure({ playerId: 1 });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC({ tier: 'Minion' }) },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.reasoning).toContain('PANICKED');
  });

  it('Suppressed NPC holds position when no cover reachable', () => {
    const npcFig = makeNPCFigure({ suppressionTokens: 2, courage: 2 });
    const heroFig = makeFigure({ playerId: 1 });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.reasoning).toContain('SUPPRESSED');
    expect(result.actions).toHaveLength(0);
  });
});

// ============================================================================
// PANICKED: ACTION FILTERING VERIFICATION
// ============================================================================

describe('panicked action filtering', () => {
  it('strips all non-Move/TakeCover actions from panicked figure', () => {
    // Provide valid moves so retreat builds some actions
    (getValidMoves as any).mockReturnValue([{ x: 3, y: 3 }, { x: 4, y: 4 }]);

    const heroFig = makeFigure({
      playerId: 1,
      suppressionTokens: 6,
      courage: 3,
      woundsCurrent: 10, // low health triggers retreat
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero({ wounds: { current: 0, threshold: 14 } }) },
      { stormtrooper: makeNPC() },
    );

    // Place cover at retreat destination
    gs.map.tiles[3][3] = { terrain: 'HeavyCover', elevation: 0, cover: 'Heavy', occupied: null, objective: null };

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('PANICKED');
    // Every action must be Move or TakeCover
    for (const action of result.actions) {
      expect(['Move', 'TakeCover']).toContain(action.type);
    }
  });

  it('panicked reasoning includes suppression token count and threshold', () => {
    const heroFig = makeFigure({ playerId: 1, suppressionTokens: 8, courage: 3 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([heroFig, npcFig], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('8');
    expect(result.reasoning).toContain('6'); // 2*courage = 6
  });
});

// ============================================================================
// SUPPRESSED: ACTION FILTERING VERIFICATION
// ============================================================================

describe('suppressed action filtering', () => {
  it('strips all non-Move/TakeCover actions from suppressed figure', () => {
    (getValidMoves as any).mockReturnValue([{ x: 3, y: 3 }]);

    const heroFig = makeFigure({
      playerId: 1,
      suppressionTokens: 3,
      courage: 3,
      woundsCurrent: 10,
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero({ wounds: { current: 0, threshold: 14 } }) },
      { stormtrooper: makeNPC() },
    );

    gs.map.tiles[3][3] = { terrain: 'LightCover', elevation: 0, cover: 'Light', occupied: null, objective: null };

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('SUPPRESSED');
    for (const action of result.actions) {
      expect(['Move', 'TakeCover']).toContain(action.type);
    }
  });

  it('suppressed reasoning includes token count and courage', () => {
    const heroFig = makeFigure({ playerId: 1, suppressionTokens: 3, courage: 3 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([heroFig, npcFig], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('3 >= 3');
  });
});

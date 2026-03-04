/**
 * Tests for decide-v2.ts morale and suppression decision paths.
 *
 * Covers:
 * - Broken morale: retreat to cover, fallback to Rally
 * - Panicked suppression: flee to cover, hunker down
 * - Suppressed: move to cover, hold position
 * - Imperial NPC (Minion/Rival) morale exemption
 * - Nemesis tier respects morale
 * - No actions/maneuvers remaining: skip
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

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

import {
  determineActions,
  getProfileForFigure,
  loadAIProfiles,
} from '../src/ai/decide-v2.js';

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
// FIXTURES
// ============================================================================

function makeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
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
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, melee: 1 },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
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
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 15, y: 5 },
    ...overrides,
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
    weapons: { 'blaster-rifle': makeWeapon() },
    armor: { 'padded-armor': makeArmor() },
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
        id: 'trooper',
        name: 'Trooper',
        cardTitle: 'TROOPER',
        description: 'Advance and fire.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Attack.' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance.' },
        ],
        weights: defaultWeights(),
      },
      hero: {
        id: 'hero',
        name: 'Hero',
        cardTitle: 'HERO',
        description: 'Hero behavior.',
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
  (getDistance as any).mockImplementation((a: any, b: any) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  );
  (getPath as any).mockImplementation((from: any, to: any) => {
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  });
  (hasLineOfSight as any).mockReturnValue(true);
  (getCover as any).mockReturnValue('None');
  (getMoraleState as any).mockReturnValue('Steady');
});

// ============================================================================
// BROKEN MORALE DECISION PATH
// ============================================================================

describe('Broken morale decision', () => {
  it('rallies when morale is Broken and no cover available', () => {
    (getMoraleState as any).mockReturnValue('Broken');
    (getValidMoves as any).mockReturnValue([]);

    const heroFig = makeFigure({ playerId: 1 });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
      { operativeMorale: { value: 0, max: 12, state: 'Broken' } },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('MORALE BROKEN');
    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    // Should have a Rally action when retreat fails
    const hasRally = result.actions.some(a => a.type === 'Rally');
    expect(hasRally).toBe(true);
  });
});

// ============================================================================
// SUPPRESSION DECISION PATHS
// ============================================================================

describe('Panicked suppression decision', () => {
  it('hunkers down when panicked and no cover reachable', () => {
    // Panicked = suppressionTokens >= 2*courage
    (getValidMoves as any).mockReturnValue([]);

    const heroFig = makeFigure({
      playerId: 1,
      suppressionTokens: 4,
      courage: 2,
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('PANICKED');
    // Should have no actions (hunker down)
    expect(result.actions).toHaveLength(0);
  });
});

describe('Suppressed decision', () => {
  it('holds position when suppressed and no cover reachable', () => {
    // Suppressed = suppressionTokens >= courage but < 2*courage
    (getValidMoves as any).mockReturnValue([]);

    const heroFig = makeFigure({
      playerId: 1,
      suppressionTokens: 2,
      courage: 2,
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('SUPPRESSED');
    expect(result.actions).toHaveLength(0);
  });
});

// ============================================================================
// BROKEN MORALE: SUCCESSFUL RETREAT PATH
// ============================================================================

describe('Broken morale successful retreat', () => {
  it('retreats to cover when broken morale, low health, and cover reachable', () => {
    (getMoraleState as any).mockReturnValue('Broken');
    // Cover tile is reachable at (6,5)
    (getValidMoves as any).mockReturnValue([{ x: 6, y: 5 }]);

    const heroFig = makeFigure({
      playerId: 1,
      woundsCurrent: 8, // 8/14 = 43% health remaining (below 50%)
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero({ wounds: { current: 0, threshold: 14 } }) },
      { stormtrooper: makeNPC() },
      { operativeMorale: { value: 0, max: 12, state: 'Broken' } },
    );

    // Place cover tile at retreat destination
    gs.map.tiles[5][6] = { terrain: 'LightCover', elevation: 0, cover: 'Light', occupied: null, objective: null };

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('MORALE BROKEN');
    expect(result.reasoning).toContain('Retreating to cover');
    const hasMove = result.actions.some(a => a.type === 'Move');
    expect(hasMove).toBe(true);
  });
});

// ============================================================================
// PANICKED: SUCCESSFUL FLEE PATH
// ============================================================================

describe('Panicked successful flee', () => {
  it('flees to cover when panicked and cover reachable', () => {
    (getValidMoves as any).mockReturnValue([{ x: 6, y: 5 }]);

    const heroFig = makeFigure({
      playerId: 1,
      suppressionTokens: 4,
      courage: 2,
      woundsCurrent: 8,
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero({ wounds: { current: 0, threshold: 14 } }) },
      { stormtrooper: makeNPC() },
    );

    gs.map.tiles[5][6] = { terrain: 'LightCover', elevation: 0, cover: 'Light', occupied: null, objective: null };

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('PANICKED');
    expect(result.reasoning).toContain('Fleeing to cover');
    // Panicked filters to move-only actions
    result.actions.forEach(a => {
      expect(['Move', 'TakeCover']).toContain(a.type);
    });
  });
});

// ============================================================================
// SUPPRESSED: SUCCESSFUL COVER PATH
// ============================================================================

describe('Suppressed successful cover move', () => {
  it('moves to cover when suppressed and cover reachable', () => {
    (getValidMoves as any).mockReturnValue([{ x: 6, y: 5 }]);

    const heroFig = makeFigure({
      playerId: 1,
      suppressionTokens: 2,
      courage: 2,
      woundsCurrent: 8,
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [heroFig, npcFig],
      { 'hero-1': makeHero({ wounds: { current: 0, threshold: 14 } }) },
      { stormtrooper: makeNPC() },
    );

    gs.map.tiles[5][6] = { terrain: 'LightCover', elevation: 0, cover: 'Light', occupied: null, objective: null };

    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(heroFig, gs, gd, profiles);
    expect(result.reasoning).toContain('SUPPRESSED');
    expect(result.reasoning).toContain('Moving to cover');
    result.actions.forEach(a => {
      expect(['Move', 'TakeCover']).toContain(a.type);
    });
  });
});

// ============================================================================
// IMPERIAL NPC MORALE EXEMPTION
// ============================================================================

describe('Imperial NPC morale exemption', () => {
  it('Minion tier NPCs ignore Broken morale and fight normally', () => {
    (getMoraleState as any).mockReturnValue('Broken');

    const npcFig = makeNPCFigure({ playerId: 2, suppressionTokens: 0, courage: 1 });
    const heroFig = makeFigure({ playerId: 1, position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC({ tier: 'Minion' }) },
      { imperialMorale: { value: 0, max: 12, state: 'Broken' } },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    // Should NOT contain "MORALE BROKEN" reasoning
    expect(result.reasoning).not.toContain('MORALE BROKEN');
  });

  it('Rival tier NPCs ignore Broken morale', () => {
    (getMoraleState as any).mockReturnValue('Broken');

    const npcFig = makeNPCFigure({ playerId: 2 });
    const heroFig = makeFigure({ playerId: 1, position: { x: 8, y: 5 } });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC({ tier: 'Rival' }) },
      { imperialMorale: { value: 0, max: 12, state: 'Broken' } },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.reasoning).not.toContain('MORALE BROKEN');
  });

  it('Nemesis tier NPCs respect Broken morale', () => {
    (getMoraleState as any).mockReturnValue('Broken');
    (getValidMoves as any).mockReturnValue([]);

    const npcFig = makeNPCFigure({ playerId: 2 });
    const heroFig = makeFigure({ playerId: 1, position: { x: 8, y: 5 } });
    const nemesis = makeNPC({ id: 'stormtrooper', tier: 'Nemesis' });
    const gs = makeGameState(
      [npcFig, heroFig],
      { 'hero-1': makeHero() },
      { stormtrooper: nemesis },
      { imperialMorale: { value: 0, max: 12, state: 'Broken' } },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(npcFig, gs, gd, profiles);
    expect(result.reasoning).toContain('MORALE BROKEN');
  });
});

// ============================================================================
// NO ACTIONS REMAINING
// ============================================================================

describe('no actions or maneuvers remaining', () => {
  it('returns empty actions when both are 0', () => {
    const fig = makeFigure({
      actionsRemaining: 0,
      maneuversRemaining: 0,
    });
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [fig, npcFig],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();
    const profiles = makeProfilesData();

    const result = determineActions(fig, gs, gd, profiles);
    expect(result.actions).toHaveLength(0);
    expect(result.reasoning).toContain('No actions or maneuvers remaining');
  });
});

// ============================================================================
// PROFILE RESOLUTION
// ============================================================================

describe('getProfileForFigure', () => {
  it('resolves NPC archetype from npcProfile.aiArchetype', () => {
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [npcFig],
      {},
      { stormtrooper: makeNPC({ aiArchetype: 'trooper' }) },
    );
    const profiles = makeProfilesData();

    const profile = getProfileForFigure(npcFig, gs, profiles);
    expect(profile.id).toBe('trooper');
  });

  it('resolves hero to "hero" archetype by default', () => {
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() });
    const profiles = makeProfilesData();

    const profile = getProfileForFigure(heroFig, gs, profiles);
    expect(profile.id).toBe('hero');
  });

  it('falls back to defaultArchetype when archetype not found', () => {
    const npcFig = makeFigure({
      id: 'fig-mystery',
      entityType: 'npc',
      entityId: 'mystery',
      playerId: 2,
    });
    const gs = makeGameState(
      [npcFig],
      {},
      { mystery: makeNPC({ id: 'mystery', aiArchetype: 'nonexistent' }) },
    );
    const profiles = makeProfilesData();

    const profile = getProfileForFigure(npcFig, gs, profiles);
    expect(profile.id).toBe('trooper'); // defaultArchetype
  });

  it('creates fallback profile when even defaultArchetype is missing', () => {
    const npcFig = makeNPCFigure();
    const gs = makeGameState(
      [npcFig],
      {},
      { stormtrooper: makeNPC({ aiArchetype: 'nonexistent' }) },
    );
    const profiles: AIProfilesData = {
      archetypes: {},
      unitMapping: {},
      defaultArchetype: 'also-missing',
    };

    const profile = getProfileForFigure(npcFig, gs, profiles);
    expect(profile.id).toBe('fallback');
    expect(profile.priorityRules.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// loadAIProfiles
// ============================================================================

describe('loadAIProfiles', () => {
  it('loads archetypes, unitMapping, and defaultArchetype from data', () => {
    const data = {
      archetypes: { trooper: { id: 'trooper' } },
      unitMapping: { stormtrooper: 'trooper' },
      defaultArchetype: 'trooper',
    };
    const result = loadAIProfiles(data);
    expect(result.archetypes).toHaveProperty('trooper');
    expect(result.unitMapping.stormtrooper).toBe('trooper');
    expect(result.defaultArchetype).toBe('trooper');
  });

  it('defaults to empty objects when data is incomplete', () => {
    const result = loadAIProfiles({});
    expect(result.archetypes).toEqual({});
    expect(result.unitMapping).toEqual({});
    expect(result.defaultArchetype).toBe('trooper');
  });
});

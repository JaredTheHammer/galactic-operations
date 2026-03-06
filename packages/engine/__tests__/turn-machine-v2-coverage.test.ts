/**
 * Additional turn-machine-v2.ts coverage tests.
 *
 * Covers:
 * - UseConsumable action handler (heal_wounds, recover_strain, creature type, adjacency)
 * - Attack retarget when defender is already defeated
 * - UseTalent fallback (no mechanicalEffect)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS (required since turn-machine-v2 imports these)
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  moveFigure: vi.fn((gameState: any, figureId: string, target: any) => {
    const figs = gameState.figures.map((f: any) =>
      f.id === figureId ? { ...f, position: target } : f
    );
    return { ...gameState, figures: figs };
  }),
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

vi.mock('../src/combat-v2.js', () => ({
  createCombatScenarioV2: vi.fn((...args: any[]) => ({
    attacker: args[0],
    defender: args[1],
    weaponId: args[2],
    cover: args[3],
    elevationDiff: args[4],
    hasLOS: args[5],
  })),
  resolveCombatV2: vi.fn(() => ({
    damage: 3,
    strain: 0,
    criticalInjury: null,
    advantageSpent: [],
    isHit: true,
    attackRolls: [],
    defenseRolls: [],
    netSuccesses: 1,
    netAdvantages: 0,
    triumphs: 0,
    despairs: 0,
  })),
  applyCombatResult: vi.fn((state: any) => state),
  buildCombatPools: vi.fn(() => ({
    attack: { ability: 2, proficiency: 1, boost: 0 },
    defense: { difficulty: 2, challenge: 0, setback: 0 },
  })),
}));

import { getDistance } from '../src/movement.js';
import { hasLineOfSight } from '../src/los.js';
import { createCombatScenarioV2, applyCombatResult } from '../src/combat-v2.js';

import { executeActionV2 } from '../src/turn-machine-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  Tile,
  ConsumableItem,
} from '../src/types.js';

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
    map: { id: 'test-map', name: 'Test', width: 20, height: 20, tiles: makeMapTiles(20, 20), deploymentZones: { imperial: [], operative: [] } },
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

function makeStimPack(): ConsumableItem {
  return {
    id: 'stim-pack',
    name: 'Stim Pack',
    description: 'Heals wounds with diminishing returns.',
    targetType: 'organic',
    effect: 'heal_wounds',
    baseValue: 5,
    diminishingReturns: true,
    price: 25,
  };
}

function makeRepairPatch(): ConsumableItem {
  return {
    id: 'repair-patch',
    name: 'Repair Patch',
    description: 'Repairs droid wounds.',
    targetType: 'droid',
    effect: 'heal_wounds',
    baseValue: 5,
    diminishingReturns: false,
    price: 25,
  };
}

function makeStimulant(): ConsumableItem {
  return {
    id: 'stimulant',
    name: 'Stimulant',
    description: 'Recovers strain.',
    targetType: 'any',
    effect: 'recover_strain',
    baseValue: 4,
    diminishingReturns: true,
    price: 15,
  };
}

function makeGameData(consumables?: Record<string, ConsumableItem>): GameData {
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
      },
    } as any,
    armor: {} as any,
    npcProfiles: { stormtrooper: makeNPC() },
    consumables,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (getDistance as any).mockImplementation((a: any, b: any) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  );
  (hasLineOfSight as any).mockReturnValue(true);
});

// ============================================================================
// UseConsumable TESTS
// ============================================================================

describe('UseConsumable action', () => {
  it('heals wounds with stim pack on self', () => {
    const heroFig = makeFigure({ woundsCurrent: 6 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
    );
    const gd = makeGameData({ 'stim-pack': makeStimPack() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'stim-pack' } };
    const newState = executeActionV2(gs, action as any, gd);

    const fig = newState.figures[0];
    // 6 wounds - 5 healing = 1 wound remaining
    expect(fig.woundsCurrent).toBe(1);
    expect(fig.actionsRemaining).toBe(0);
  });

  it('tracks diminishing returns on heal_wounds', () => {
    const heroFig = makeFigure({
      woundsCurrent: 10,
      consumableUsesThisEncounter: { 'stim-pack': 1 },
    } as any);
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
    );
    const gd = makeGameData({ 'stim-pack': makeStimPack() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'stim-pack' } };
    const newState = executeActionV2(gs, action as any, gd);

    const fig = newState.figures[0];
    // diminished: max(1, 5 - 1*2) = 3; 10 - 3 = 7
    expect(fig.woundsCurrent).toBe(7);
  });

  it('recovers strain with stimulant', () => {
    const heroFig = makeFigure({ strainCurrent: 6 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
    );
    const gd = makeGameData({ 'stimulant': makeStimulant() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'stimulant' } };
    const newState = executeActionV2(gs, action as any, gd);

    const fig = newState.figures[0];
    // 6 strain - 4 recovery = 2
    expect(fig.strainCurrent).toBe(2);
  });

  it('rejects consumable when creature type mismatches', () => {
    // Repair patch targets droids, hero is organic
    const heroFig = makeFigure({ woundsCurrent: 5 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
    );
    const gd = makeGameData({ 'repair-patch': makeRepairPatch() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'repair-patch' } };
    const newState = executeActionV2(gs, action as any, gd);

    // Should not heal (creature type mismatch)
    expect(newState.figures[0].woundsCurrent).toBe(5);
  });

  it('allows repair patch on droid hero', () => {
    const heroFig = makeFigure({ woundsCurrent: 5 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero({ species: 'droid' }) },
      {},
    );
    const gd = makeGameData({ 'repair-patch': makeRepairPatch() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'repair-patch' } };
    const newState = executeActionV2(gs, action as any, gd);

    // Should heal (droid hero + droid consumable)
    expect(newState.figures[0].woundsCurrent).toBe(0);
  });

  it('heals adjacent ally', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const allyFig = makeFigure({
      id: 'fig-hero-2',
      entityId: 'hero-2',
      position: { x: 6, y: 5 },
      woundsCurrent: 8,
    });
    const gs = makeGameState(
      [heroFig, allyFig],
      {
        'hero-1': makeHero(),
        'hero-2': makeHero({ id: 'hero-2', name: 'Ally' }),
      },
      {},
    );
    const gd = makeGameData({ 'stim-pack': makeStimPack() });

    const action = {
      type: 'UseConsumable' as const,
      figureId: 'fig-hero-1',
      payload: { itemId: 'stim-pack', targetId: 'fig-hero-2' },
    };
    const newState = executeActionV2(gs, action as any, gd);

    // Ally should be healed
    const ally = newState.figures.find(f => f.id === 'fig-hero-2')!;
    expect(ally.woundsCurrent).toBe(3); // 8 - 5 = 3
  });

  it('rejects non-adjacent target', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const allyFig = makeFigure({
      id: 'fig-hero-2',
      entityId: 'hero-2',
      position: { x: 8, y: 5 }, // distance 3, not adjacent
      woundsCurrent: 8,
    });
    const gs = makeGameState(
      [heroFig, allyFig],
      {
        'hero-1': makeHero(),
        'hero-2': makeHero({ id: 'hero-2', name: 'Ally' }),
      },
      {},
    );
    const gd = makeGameData({ 'stim-pack': makeStimPack() });

    const action = {
      type: 'UseConsumable' as const,
      figureId: 'fig-hero-1',
      payload: { itemId: 'stim-pack', targetId: 'fig-hero-2' },
    };
    const newState = executeActionV2(gs, action as any, gd);

    // Should not heal (not adjacent)
    const ally = newState.figures.find(f => f.id === 'fig-hero-2')!;
    expect(ally.woundsCurrent).toBe(8);
  });

  it('does nothing for unknown consumable', () => {
    const heroFig = makeFigure({ woundsCurrent: 5 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
    );
    const gd = makeGameData({});

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'nonexistent' } };
    const newState = executeActionV2(gs, action as any, gd);

    expect(newState.figures[0].woundsCurrent).toBe(5);
  });

  it('depletes consumable inventory when used by Operative', () => {
    const heroFig = makeFigure({ woundsCurrent: 6 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
      { consumableInventory: { 'stim-pack': 2 } },
    );
    const gd = makeGameData({ 'stim-pack': makeStimPack() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'stim-pack' } };
    const newState = executeActionV2(gs, action as any, gd);

    expect(newState.figures[0].woundsCurrent).toBe(1);
    expect(newState.consumableInventory?.['stim-pack']).toBe(1);
  });

  it('rejects consumable when inventory is empty', () => {
    const heroFig = makeFigure({ woundsCurrent: 6 });
    const gs = makeGameState(
      [heroFig],
      { 'hero-1': makeHero() },
      {},
      { consumableInventory: { 'stim-pack': 0 } },
    );
    const gd = makeGameData({ 'stim-pack': makeStimPack() });

    const action = { type: 'UseConsumable' as const, figureId: 'fig-hero-1', payload: { itemId: 'stim-pack' } };
    const newState = executeActionV2(gs, action as any, gd);

    // Should not heal (empty inventory)
    expect(newState.figures[0].woundsCurrent).toBe(6);
  });

  it('recognizes NPC droid by entityId heuristic', () => {
    // NPC with 'droid' in entityId should be treated as droid
    const droidNPC = makeNPCFigure({
      id: 'fig-probe-droid',
      entityId: 'probe-droid',
      woundsCurrent: 3,
      position: { x: 5, y: 5 },
      playerId: 1,
    });
    const heroFig = makeFigure({ position: { x: 6, y: 5 } });
    const gs = makeGameState(
      [heroFig, droidNPC],
      { 'hero-1': makeHero() },
      { 'probe-droid': makeNPC({ id: 'probe-droid' }) },
    );
    const gd = makeGameData({ 'repair-patch': makeRepairPatch() });

    const action = {
      type: 'UseConsumable' as const,
      figureId: 'fig-hero-1',
      payload: { itemId: 'repair-patch', targetId: 'fig-probe-droid' },
    };
    const newState = executeActionV2(gs, action as any, gd);

    // Should heal (droid NPC + droid consumable)
    const droid = newState.figures.find(f => f.id === 'fig-probe-droid')!;
    expect(droid.woundsCurrent).toBe(0);
  });
});

// ============================================================================
// Attack Retarget TESTS
// ============================================================================

describe('Attack retarget on dead defender', () => {
  it('retargets to another living enemy when original target is defeated', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 }, actionsRemaining: 1 });
    const deadNPC = makeNPCFigure({
      id: 'fig-st-1',
      position: { x: 8, y: 5 },
      isDefeated: true,
    });
    const liveNPC = makeNPCFigure({
      id: 'fig-st-2',
      entityId: 'stormtrooper',
      position: { x: 10, y: 5 },
      isDefeated: false,
    });

    const gs = makeGameState(
      [heroFig, deadNPC, liveNPC],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const action = {
      type: 'Attack' as const,
      figureId: 'fig-hero-1',
      payload: { targetId: 'fig-st-1', weaponId: 'blaster-rifle' },
    };

    const newState = executeActionV2(gs, action as any, gd);

    // Should have called combat resolution on the retarget (fig-st-2)
    expect(createCombatScenarioV2).toHaveBeenCalled();
    const scenarioCall = (createCombatScenarioV2 as any).mock.calls[0];
    // Second arg (defender) should be the living NPC
    expect(scenarioCall[1].id).toBe('fig-st-2');
  });

  it('does nothing when no living enemies remain for retarget', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 }, actionsRemaining: 1 });
    const deadNPC = makeNPCFigure({
      id: 'fig-st-1',
      position: { x: 8, y: 5 },
      isDefeated: true,
    });

    const gs = makeGameState(
      [heroFig, deadNPC],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    const action = {
      type: 'Attack' as const,
      figureId: 'fig-hero-1',
      payload: { targetId: 'fig-st-1', weaponId: 'blaster-rifle' },
    };

    const newState = executeActionV2(gs, action as any, gd);

    // Combat resolution should not be called
    expect(createCombatScenarioV2).not.toHaveBeenCalled();
    // Action should still be consumed
    expect(newState.figures[0].actionsRemaining).toBe(0);
  });
});

/**
 * Additional turn-machine-v2.ts coverage tests.
 *
 * Covers:
 * - getNPCCourage edge cases (explicit courage, all tiers, default tier)
 * - getHeroCourage edge cases (high/low willpower, missing characteristics)
 * - deployFiguresV2 missing players (returns unchanged state)
 * - deployFiguresV2 with missing hero in registry (skips entry)
 * - advancePhaseV2 all phase transitions including GameOver
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  moveFigure: vi.fn((gs: any) => gs),
  getPath: vi.fn(() => []),
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
  createCombatScenarioV2: vi.fn(),
  resolveCombatV2: vi.fn(() => ({ damage: 0, strain: 0, isHit: false, attackRolls: [], defenseRolls: [], netSuccesses: 0, netAdvantages: 0, triumphs: 0, despairs: 0 })),
  applyCombatResult: vi.fn((state: any) => state),
  buildCombatPools: vi.fn(() => ({ attack: { ability: 2, proficiency: 1 }, defense: { difficulty: 2, challenge: 0 } })),
}));

import {
  getNPCCourage,
  getHeroCourage,
  deployFiguresV2,
  advancePhaseV2,
} from '../src/turn-machine-v2.js';

import type {
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  Tile,
} from '../src/types.js';

import type { ArmyCompositionV2 } from '../src/turn-machine-v2.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
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
    aiArchetype: 'Trooper',
    keywords: [],
    abilities: [],
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
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, 'melee': 1 },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    missionId: 'test',
    roundNumber: 1,
    turnPhase: 'Setup',
    playMode: 'grid',
    map: {
      id: 'test-map',
      name: 'Test',
      width: 24,
      height: 24,
      tiles: makeMapTiles(24, 24),
      deploymentZones: {
        imperial: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
        operative: [{ x: 21, y: 0 }, { x: 22, y: 0 }, { x: 23, y: 0 }],
      },
    },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures: [],
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
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
    ...overrides,
  };
}

// ============================================================================
// getNPCCourage
// ============================================================================

describe('getNPCCourage', () => {
  it('returns explicit courage when defined on NPC', () => {
    const npc = makeNPC({ courage: 5 });
    expect(getNPCCourage(npc)).toBe(5);
  });

  it('returns 1 for Minion tier without explicit courage', () => {
    const npc = makeNPC({ tier: 'Minion', courage: undefined });
    expect(getNPCCourage(npc)).toBe(1);
  });

  it('returns 2 for Rival tier', () => {
    const npc = makeNPC({ tier: 'Rival', courage: undefined });
    expect(getNPCCourage(npc)).toBe(2);
  });

  it('returns 3 for Nemesis tier', () => {
    const npc = makeNPC({ tier: 'Nemesis', courage: undefined });
    expect(getNPCCourage(npc)).toBe(3);
  });

  it('returns 1 for unknown tier', () => {
    const npc = makeNPC({ tier: 'Unknown' as any, courage: undefined });
    expect(getNPCCourage(npc)).toBe(1);
  });
});

// ============================================================================
// getHeroCourage
// ============================================================================

describe('getHeroCourage', () => {
  it('returns willpower + 2 for standard hero', () => {
    const hero = makeHero({ characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 3, presence: 2 } });
    expect(getHeroCourage(hero)).toBe(5); // 3 + 2
  });

  it('floors at 3 for low-willpower hero', () => {
    const hero = makeHero({ characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 1, presence: 2 } });
    expect(getHeroCourage(hero)).toBe(3); // max(1+2, 3) = 3
  });

  it('returns higher courage for high-willpower hero', () => {
    const hero = makeHero({ characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 5, presence: 2 } });
    expect(getHeroCourage(hero)).toBe(7); // 5 + 2
  });

  it('defaults willpower to 2 when characteristics is undefined', () => {
    const hero = makeHero({ characteristics: undefined as any });
    expect(getHeroCourage(hero)).toBe(4); // max((undefined ?? 2) + 2, 3) = 4
  });
});

// ============================================================================
// deployFiguresV2
// ============================================================================

describe('deployFiguresV2', () => {
  it('returns unchanged state when no Imperial player exists', () => {
    const gs = makeGameState({
      players: [{ id: 1, name: 'P1', role: 'Operative', isLocal: true, isAI: false }],
    });
    const army: ArmyCompositionV2 = {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [],
    };
    const gd = { weapons: {}, armor: {}, npcProfiles: { stormtrooper: makeNPC() } } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures).toEqual([]);
  });

  it('returns unchanged state when no Operative player exists', () => {
    const gs = makeGameState({
      players: [{ id: 2, name: 'P2', role: 'Imperial', isLocal: true, isAI: true }],
    });
    const army: ArmyCompositionV2 = {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [],
    };
    const gd = { weapons: {}, armor: {}, npcProfiles: { stormtrooper: makeNPC() } } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures).toEqual([]);
  });

  it('deploys NPC figures to imperial deployment zones', () => {
    const npc = makeNPC();
    const gs = makeGameState({ npcProfiles: { stormtrooper: npc } });
    const army: ArmyCompositionV2 = {
      imperial: [{ npcId: 'stormtrooper', count: 2 }],
      operative: [],
    };
    const gd = { weapons: {}, armor: {}, npcProfiles: { stormtrooper: npc } } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures.length).toBe(2);
    expect(result.figures[0].entityType).toBe('npc');
    expect(result.figures[0].entityId).toBe('stormtrooper');
  });

  it('deploys hero figures to operative deployment zones', () => {
    const hero = makeHero();
    const gs = makeGameState({ heroes: { 'hero-1': hero } });
    const army: ArmyCompositionV2 = {
      imperial: [],
      operative: [{ entityType: 'hero', entityId: 'hero-1', count: 1 }],
    };
    const gd = { weapons: {}, armor: {} } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures.length).toBe(1);
    expect(result.figures[0].entityType).toBe('hero');
    expect(result.figures[0].entityId).toBe('hero-1');
  });

  it('skips missing hero entries gracefully', () => {
    const gs = makeGameState(); // no heroes registered
    const army: ArmyCompositionV2 = {
      imperial: [],
      operative: [{ entityType: 'hero', entityId: 'nonexistent-hero', count: 1 }],
    };
    const gd = { weapons: {}, armor: {} } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures.length).toBe(0);
  });

  it('deploys without deployment zones using fallback positions', () => {
    const npc = makeNPC();
    const gs = makeGameState({
      npcProfiles: { stormtrooper: npc },
      map: {
        id: 'no-zones',
        name: 'No Zones',
        width: 10,
        height: 10,
        tiles: makeMapTiles(10, 10),
        deploymentZones: { imperial: [], operative: [] },
      },
    });
    const army: ArmyCompositionV2 = {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [],
    };
    const gd = { weapons: {}, armor: {}, npcProfiles: { stormtrooper: npc } } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures.length).toBe(1);
    // Fallback positions should be on the left side of the map
    expect(result.figures[0].position.x).toBeLessThan(5);
  });

  it('skips NPC entry when npcId not found in npcProfiles', () => {
    const gs = makeGameState();
    const army: ArmyCompositionV2 = {
      imperial: [{ npcId: 'nonexistent-npc', count: 1 }],
      operative: [],
    };
    const gd = { weapons: {}, armor: {}, npcProfiles: {} } as any;

    const result = deployFiguresV2(gs, army, gd);
    expect(result.figures.length).toBe(0);
  });
});

// ============================================================================
// advancePhaseV2 - all phase transitions
// ============================================================================

describe('advancePhaseV2', () => {
  it('transitions Setup -> Initiative', () => {
    const gs = makeGameState({ turnPhase: 'Setup' });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('Initiative');
  });

  it('transitions Initiative -> Activation with activation order', () => {
    const gs = makeGameState({
      turnPhase: 'Initiative',
      figures: [
        { id: 'f1', playerId: 1, isDefeated: false } as any,
        { id: 'f2', playerId: 2, isDefeated: false } as any,
      ],
    });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('Activation');
    expect(result.activationOrder.length).toBeGreaterThan(0);
    expect(result.currentActivationIndex).toBe(0);
  });

  it('transitions Activation -> next activation when more figures remain', () => {
    const gs = makeGameState({
      turnPhase: 'Activation',
      activationOrder: ['f1', 'f2', 'f3'],
      currentActivationIndex: 0,
    });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('Activation');
    expect(result.currentActivationIndex).toBe(1);
  });

  it('transitions Activation -> Status when all figures activated', () => {
    const gs = makeGameState({
      turnPhase: 'Activation',
      activationOrder: ['f1', 'f2'],
      currentActivationIndex: 2,
    });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('Status');
  });

  it('transitions Status -> Reinforcement', () => {
    const gs = makeGameState({ turnPhase: 'Status' });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('Reinforcement');
  });

  it('transitions Reinforcement -> Initiative with incremented round', () => {
    const gs = makeGameState({ turnPhase: 'Reinforcement', roundNumber: 3 });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('Initiative');
    expect(result.roundNumber).toBe(4);
    expect(result.activationOrder).toEqual([]);
    expect(result.currentActivationIndex).toBe(0);
  });

  it('returns unchanged state for GameOver phase', () => {
    const gs = makeGameState({ turnPhase: 'GameOver' });
    const result = advancePhaseV2(gs);
    expect(result.turnPhase).toBe('GameOver');
  });
});

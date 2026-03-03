/**
 * Loot Token & Deploy Zone Wiring Tests
 *
 * Session 28b: Validates that:
 * - Loot tokens from mission definitions are correctly initialized in GameState
 * - CollectLoot action properly tracks collected tokens
 * - Mission-specific operative deploy zones override map defaults
 * - Real mission JSON loot token data is structurally correct
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialGameStateV2,
  deployFiguresV2,
  executeActionV2,
} from '../src/turn-machine-v2';
import type {
  GameState,
  GameData,
  NPCProfile,
  Player,
  LootToken,
  Figure,
} from '../src/types';

import imperialsNpcData from '../../../data/npcs/imperials.json';
import m1Data from '../../../data/missions/act1-mission1-arrival.json';
import m2Data from '../../../data/missions/act1-mission2-intel.json';
import m3aData from '../../../data/missions/act1-mission3a-cache.json';
import m3bData from '../../../data/missions/act1-mission3b-ambush.json';
import m4Data from '../../../data/missions/act1-mission4-finale.json';

// ============================================================================
// HELPERS
// ============================================================================

function loadNPCProfiles(): Record<string, NPCProfile> {
  const npcProfiles: Record<string, NPCProfile> = {};
  const npcsRaw = (imperialsNpcData as any).npcs ?? imperialsNpcData;
  for (const [id, npc] of Object.entries(npcsRaw)) {
    npcProfiles[id] = npc as NPCProfile;
  }
  return npcProfiles;
}

function buildMinimalGameData(): GameData {
  return {
    dice: {},
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: loadNPCProfiles(),
  } as GameData;
}

function buildMap(width: number, height: number, deployZones?: {
  imperial: { x: number; y: number }[];
  operative: { x: number; y: number }[];
}) {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        terrain: 'Open' as const,
        elevation: 0,
        cover: 'None' as const,
        occupied: null,
        objective: null,
      });
    }
    tiles.push(row);
  }
  return {
    id: 'test-map',
    width,
    height,
    tiles,
    deploymentZones: deployZones ?? {
      imperial: [{ x: 18, y: 10 }, { x: 19, y: 10 }],
      operative: [{ x: 0, y: 10 }, { x: 1, y: 10 }],
    },
    metadata: { name: 'Test Map' },
  };
}

function buildGameState(opts?: {
  lootTokens?: LootToken[];
  operativeDeployZone?: { x: number; y: number }[];
  overrides?: Partial<GameState>;
}): GameState {
  const players: Player[] = [
    { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
  ];

  const gameData = buildMinimalGameData();
  const mission = {
    id: 'test-mission',
    name: 'Test Mission',
    description: 'Test',
    mapId: 'test',
    roundLimit: 10,
    imperialThreat: 10,
    imperialReinforcementPoints: 3,
    victoryConditions: [],
  };

  const deployZones = opts?.operativeDeployZone
    ? {
        imperial: [{ x: 18, y: 10 }, { x: 19, y: 10 }],
        operative: opts.operativeDeployZone,
      }
    : undefined;

  const map = buildMap(20, 20, deployZones);

  const gs = createInitialGameStateV2(
    mission,
    players,
    gameData,
    map as any,
    {
      npcProfiles: gameData.npcProfiles,
      lootTokens: opts?.lootTokens,
    },
  );

  return { ...gs, ...opts?.overrides };
}

const SAMPLE_LOOT_TOKENS: LootToken[] = [
  { id: 'loot-1', position: { x: 5, y: 5 }, reward: { type: 'xp', value: 3 } },
  { id: 'loot-2', position: { x: 10, y: 8 }, reward: { type: 'credits', value: 100 } },
  { id: 'loot-3', position: { x: 15, y: 12 }, reward: { type: 'equipment', itemId: 'blaster-rifle' } },
  { id: 'loot-4', position: { x: 3, y: 3 }, reward: { type: 'narrative', itemId: 'sith-holocron', description: 'A glowing red artifact' } },
];

// ============================================================================
// TESTS: Loot Token Initialization
// ============================================================================

describe('Loot Token Initialization', () => {
  it('initializes lootTokens as empty array when no tokens provided', () => {
    const gs = buildGameState();
    expect(gs.lootTokens).toEqual([]);
  });

  it('initializes lootTokens from options when provided', () => {
    const gs = buildGameState({ lootTokens: SAMPLE_LOOT_TOKENS });
    expect(gs.lootTokens).toHaveLength(4);
    expect(gs.lootTokens).toEqual(SAMPLE_LOOT_TOKENS);
  });

  it('preserves loot token positions exactly', () => {
    const gs = buildGameState({ lootTokens: SAMPLE_LOOT_TOKENS });
    expect(gs.lootTokens[0].position).toEqual({ x: 5, y: 5 });
    expect(gs.lootTokens[3].position).toEqual({ x: 3, y: 3 });
  });

  it('preserves all reward types correctly', () => {
    const gs = buildGameState({ lootTokens: SAMPLE_LOOT_TOKENS });
    expect(gs.lootTokens[0].reward).toEqual({ type: 'xp', value: 3 });
    expect(gs.lootTokens[1].reward).toEqual({ type: 'credits', value: 100 });
    expect(gs.lootTokens[2].reward).toEqual({ type: 'equipment', itemId: 'blaster-rifle' });
    expect(gs.lootTokens[3].reward.type).toBe('narrative');
  });

  it('starts with empty lootCollected array', () => {
    const gs = buildGameState({ lootTokens: SAMPLE_LOOT_TOKENS });
    expect(gs.lootCollected).toEqual([]);
  });
});

// ============================================================================
// TESTS: CollectLoot Action
// ============================================================================

describe('CollectLoot Action', () => {
  function stateWithFigureAndLoot(): GameState {
    const gs = buildGameState({ lootTokens: SAMPLE_LOOT_TOKENS });

    // Place a hero figure at the first loot token position
    const heroFigure: Figure = {
      id: 'op-0',
      entityId: 'test-hero',
      entityType: 'hero',
      playerId: 1,
      side: 'Operative',
      position: { x: 5, y: 5 }, // Same as loot-1
      hp: { current: 10, max: 10 },
      defense: { value: 1, type: 'Soak' as any },
      speed: 4,
      actionsRemaining: 2,
      maneuversRemaining: 1,
      isDefeated: false,
      isActivated: false,
      statusEffects: [],
      npcProfileId: null,
      attacks: [],
      skills: {},
    };

    return {
      ...gs,
      figures: [heroFigure],
      activationOrder: ['op-0'],
      currentActivationIndex: 0,
      turnPhase: 'Activation',
    };
  }

  it('adds loot token ID to lootCollected on CollectLoot', () => {
    const gs = stateWithFigureAndLoot();
    const result = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: 'op-0',
      payload: { lootTokenId: 'loot-1' },
    });
    expect(result.lootCollected).toContain('loot-1');
  });

  it('does not duplicate loot token IDs if collected twice', () => {
    let gs = stateWithFigureAndLoot();
    // Give extra maneuvers for second collect
    gs.figures[0] = { ...gs.figures[0], maneuversRemaining: 2 };

    gs = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: 'op-0',
      payload: { lootTokenId: 'loot-1' },
    });
    gs = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: 'op-0',
      payload: { lootTokenId: 'loot-1' },
    });
    const count = gs.lootCollected.filter(id => id === 'loot-1').length;
    expect(count).toBe(1);
  });

  it('can collect multiple distinct loot tokens', () => {
    let gs = stateWithFigureAndLoot();
    gs.figures[0] = { ...gs.figures[0], maneuversRemaining: 3 };

    gs = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: 'op-0',
      payload: { lootTokenId: 'loot-1' },
    });
    gs = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: 'op-0',
      payload: { lootTokenId: 'loot-2' },
    });
    expect(gs.lootCollected).toContain('loot-1');
    expect(gs.lootCollected).toContain('loot-2');
    expect(gs.lootCollected).toHaveLength(2);
  });

  it('consumes a maneuver when collecting loot', () => {
    const gs = stateWithFigureAndLoot();
    const before = gs.figures[0].maneuversRemaining;
    const result = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: 'op-0',
      payload: { lootTokenId: 'loot-1' },
    });
    expect(result.figures[0].maneuversRemaining).toBe(before - 1);
  });
});

// ============================================================================
// TESTS: Operative Deploy Zone Override
// ============================================================================

describe('Operative Deploy Zone Override', () => {
  it('uses provided operative deploy zone positions', () => {
    const customZone = [
      { x: 0, y: 14 }, { x: 1, y: 14 }, { x: 2, y: 14 }, { x: 3, y: 14 },
    ];
    const gs = buildGameState({ operativeDeployZone: customZone });
    expect(gs.map.deploymentZones.operative).toEqual(customZone);
  });

  it('deploys operative figures within the custom zone', () => {
    const customZone = [
      { x: 5, y: 15 }, { x: 6, y: 15 }, { x: 7, y: 15 }, { x: 8, y: 15 },
    ];
    const gs = buildGameState({ operativeDeployZone: customZone });
    const gameData = buildMinimalGameData();

    const army = {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [{ entityType: 'npc' as const, entityId: 'stormtrooper', count: 2 }],
    };

    const deployed = deployFiguresV2(gs, army, gameData);
    const opFigures = deployed.figures.filter(f => f.side === 'Operative');

    // All operative figures should be within the custom deploy zone
    for (const fig of opFigures) {
      const inZone = customZone.some(z => z.x === fig.position.x && z.y === fig.position.y);
      expect(inZone).toBe(true);
    }
  });

  it('keeps imperial deploy zone unaffected by operative zone override', () => {
    const customZone = [{ x: 5, y: 15 }, { x: 6, y: 15 }];
    const gs = buildGameState({ operativeDeployZone: customZone });
    // Imperial zone should remain the default
    expect(gs.map.deploymentZones.imperial).toEqual([{ x: 18, y: 10 }, { x: 19, y: 10 }]);
  });
});

// ============================================================================
// TESTS: Real Mission JSON Loot Token Validation
// ============================================================================

describe('Mission JSON Loot Token Structural Validation', () => {
  const allMissions = [
    { name: 'M1 Arrival', data: m1Data },
    { name: 'M2 Intel', data: m2Data },
    { name: 'M3a Cache', data: m3aData },
    { name: 'M3b Ambush', data: m3bData },
    { name: 'M4 Finale', data: m4Data },
  ];

  const VALID_REWARD_TYPES = ['xp', 'credits', 'equipment', 'narrative'];

  for (const { name, data } of allMissions) {
    describe(name, () => {
      it('has a lootTokens array', () => {
        expect(Array.isArray(data.lootTokens)).toBe(true);
      });

      it('every loot token has required fields', () => {
        for (const token of data.lootTokens) {
          expect(token).toHaveProperty('id');
          expect(token).toHaveProperty('position');
          expect(token).toHaveProperty('reward');
          expect(typeof token.id).toBe('string');
          expect(token.id.length).toBeGreaterThan(0);
          expect(typeof token.position.x).toBe('number');
          expect(typeof token.position.y).toBe('number');
        }
      });

      it('every reward has a valid type', () => {
        for (const token of data.lootTokens) {
          expect(VALID_REWARD_TYPES).toContain(token.reward.type);
        }
      });

      it('all loot token IDs are unique within the mission', () => {
        const ids = data.lootTokens.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      });
    });
  }

  it('M1 has 3 loot tokens', () => {
    expect(m1Data.lootTokens).toHaveLength(3);
  });

  it('M4 finale has 4 loot tokens including sith-holocron', () => {
    expect(m4Data.lootTokens).toHaveLength(4);
    const holocron = m4Data.lootTokens.find((t: any) => t.id === 'loot-holocron');
    expect(holocron).toBeDefined();
    expect(holocron!.reward.type).toBe('narrative');
  });
});

// ============================================================================
// TESTS: Mission JSON Operative Deploy Zone Validation
// ============================================================================

describe('Mission JSON Operative Deploy Zone Validation', () => {
  const allMissions = [
    { name: 'M1 Arrival', data: m1Data },
    { name: 'M2 Intel', data: m2Data },
    { name: 'M3a Cache', data: m3aData },
    { name: 'M3b Ambush', data: m3bData },
    { name: 'M4 Finale', data: m4Data },
  ];

  for (const { name, data } of allMissions) {
    it(`${name} has an operativeDeployZone array with valid coordinates`, () => {
      expect(Array.isArray(data.operativeDeployZone)).toBe(true);
      expect(data.operativeDeployZone.length).toBeGreaterThan(0);
      for (const pos of data.operativeDeployZone) {
        expect(typeof pos.x).toBe('number');
        expect(typeof pos.y).toBe('number');
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it('M4 operative deploy zone has 8 positions (4x2 block)', () => {
    expect(m4Data.operativeDeployZone).toHaveLength(8);
  });
});

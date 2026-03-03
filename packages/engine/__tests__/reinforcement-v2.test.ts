/**
 * Reinforcement System v2 Tests
 *
 * Tests for:
 * - applyMissionReinforcements (mission-scripted waves)
 * - objectivePointsFromTemplates
 * - applyReinforcementPhase integration with mission data
 */

import { describe, it, expect } from 'vitest';
import {
  applyMissionReinforcements,
  objectivePointsFromTemplates,
  applyReinforcementPhase,
  createInitialGameStateV2,
} from '../src/turn-machine-v2';

import type {
  GameState,
  GameData,
  NPCProfile,
  Player,
  ObjectivePointTemplate,
  ReinforcementWave,
} from '../src/types';

import imperialsNpcData from '../../../data/npcs/imperials.json';

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

function buildMinimalGameState(overrides?: Partial<GameState>): GameState {
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

  // Build a minimal 20x20 map
  const width = 20;
  const height = 20;
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

  const map = {
    id: 'test-map',
    width,
    height,
    tiles,
    deploymentZones: {
      imperial: [{ x: 18, y: 10 }, { x: 19, y: 10 }],
      operative: [{ x: 0, y: 10 }, { x: 1, y: 10 }],
    },
    metadata: { name: 'Test Map' },
  };

  const gs = createInitialGameStateV2(
    mission,
    players,
    gameData,
    map as any,
    { npcProfiles: gameData.npcProfiles },
  );

  return { ...gs, ...overrides };
}

// ============================================================================
// TESTS: objectivePointsFromTemplates
// ============================================================================

describe('objectivePointsFromTemplates', () => {
  it('converts templates to runtime ObjectivePoints with isCompleted=false', () => {
    const templates: ObjectivePointTemplate[] = [
      {
        id: 'obj-1',
        position: { x: 10, y: 5 },
        type: 'terminal',
        skillRequired: 'computers',
        alternateSkill: 'mechanics',
        difficulty: 2,
        description: 'Security terminal',
      },
      {
        id: 'obj-2',
        position: { x: 15, y: 8 },
        type: 'lock',
        skillRequired: 'skulduggery',
        difficulty: 3,
        description: 'Blast door lock',
      },
    ];

    const points = objectivePointsFromTemplates(templates);

    expect(points).toHaveLength(2);
    expect(points[0].isCompleted).toBe(false);
    expect(points[0].id).toBe('obj-1');
    expect(points[0].skillRequired).toBe('computers');
    expect(points[0].alternateSkill).toBe('mechanics');
    expect(points[1].isCompleted).toBe(false);
    expect(points[1].id).toBe('obj-2');
    expect(points[1].difficulty).toBe(3);
  });

  it('handles empty templates array', () => {
    const points = objectivePointsFromTemplates([]);
    expect(points).toHaveLength(0);
  });
});

// ============================================================================
// TESTS: applyMissionReinforcements
// ============================================================================

describe('applyMissionReinforcements', () => {
  const gameData = buildMinimalGameData();

  const testWaves: ReinforcementWave[] = [
    {
      id: 'wave-1',
      triggerRound: 3,
      groups: [
        {
          npcProfileId: 'stormtrooper',
          count: 2,
          asMinGroup: true,
          deployZone: [{ x: 10, y: 0 }, { x: 11, y: 0 }],
        },
      ],
      threatCost: 4,
      narrativeText: 'A patrol rushes in from the north!',
    },
    {
      id: 'wave-2',
      triggerRound: 6,
      groups: [
        {
          npcProfileId: 'stormtrooper-elite',
          count: 1,
          asMinGroup: false,
          deployZone: [{ x: 15, y: 0 }],
        },
      ],
      threatCost: 6,
      narrativeText: 'Elite troopers arrive!',
    },
  ];

  it('spawns wave on matching round', () => {
    const gs = buildMinimalGameState({ roundNumber: 3 });
    const result = applyMissionReinforcements(gs, gameData, testWaves, []);

    expect(result.wavesTriggered).toContain('wave-1');
    expect(result.wavesTriggered).not.toContain('wave-2');
    expect(result.events).toHaveLength(2); // 2 stormtroopers
    expect(result.narrativeTexts).toContain('A patrol rushes in from the north!');
    expect(result.gameState.figures.length).toBeGreaterThan(gs.figures.length);
  });

  it('does not re-trigger already deployed waves', () => {
    const gs = buildMinimalGameState({ roundNumber: 3 });
    const result = applyMissionReinforcements(gs, gameData, testWaves, ['wave-1']);

    expect(result.wavesTriggered).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it('does not trigger waves for non-matching rounds', () => {
    const gs = buildMinimalGameState({ roundNumber: 4 });
    const result = applyMissionReinforcements(gs, gameData, testWaves, []);

    expect(result.wavesTriggered).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it('deploys units at specified positions', () => {
    const gs = buildMinimalGameState({ roundNumber: 3 });
    const result = applyMissionReinforcements(gs, gameData, testWaves, []);

    // Find the newly spawned figures
    const newFigures = result.gameState.figures.filter(
      f => !gs.figures.some(orig => orig.id === f.id)
    );
    expect(newFigures).toHaveLength(2);
    expect(newFigures[0].position).toEqual({ x: 10, y: 0 });
    expect(newFigures[1].position).toEqual({ x: 11, y: 0 });
  });

  it('clamps positions to map bounds', () => {
    const gs = buildMinimalGameState({ roundNumber: 3 });
    const outOfBoundsWaves: ReinforcementWave[] = [
      {
        id: 'wave-oob',
        triggerRound: 3,
        groups: [
          {
            npcProfileId: 'stormtrooper',
            count: 1,
            asMinGroup: false,
            deployZone: [{ x: 999, y: -5 }],
          },
        ],
        threatCost: 2,
      },
    ];

    const result = applyMissionReinforcements(gs, gameData, outOfBoundsWaves, []);
    const newFig = result.gameState.figures[result.gameState.figures.length - 1];
    expect(newFig.position.x).toBe(19); // clamped to map width - 1
    expect(newFig.position.y).toBe(0);  // clamped to 0
  });

  it('assigns Imperial player ID to spawned figures', () => {
    const gs = buildMinimalGameState({ roundNumber: 6 });
    const result = applyMissionReinforcements(gs, gameData, testWaves, []);

    const imperialPlayer = gs.players.find(p => p.role === 'Imperial')!;
    const newFigures = result.gameState.figures.filter(
      f => !gs.figures.some(orig => orig.id === f.id)
    );
    for (const fig of newFigures) {
      expect(fig.playerId).toBe(imperialPlayer.id);
    }
  });

  it('generates unique figure IDs', () => {
    const gs = buildMinimalGameState({ roundNumber: 3 });
    const result = applyMissionReinforcements(gs, gameData, testWaves, []);

    const allIds = result.gameState.figures.map(f => f.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('registers NPC profiles in game state for spawned units', () => {
    const gs = buildMinimalGameState({ roundNumber: 6 });
    // Ensure stormtrooper-elite isn't in gameState.npcProfiles initially
    const gsClean = { ...gs, npcProfiles: {} };
    const result = applyMissionReinforcements(gsClean, gameData, testWaves, []);

    expect(result.gameState.npcProfiles['stormtrooper-elite']).toBeDefined();
  });

  it('handles multiple waves on the same round', () => {
    const doubleWaves: ReinforcementWave[] = [
      {
        id: 'wave-a',
        triggerRound: 5,
        groups: [{ npcProfileId: 'stormtrooper', count: 2, asMinGroup: true }],
        threatCost: 4,
        narrativeText: 'First wave!',
      },
      {
        id: 'wave-b',
        triggerRound: 5,
        groups: [{ npcProfileId: 'probe-droid', count: 1, asMinGroup: false }],
        threatCost: 2,
        narrativeText: 'Second wave!',
      },
    ];

    const gs = buildMinimalGameState({ roundNumber: 5 });
    const result = applyMissionReinforcements(gs, gameData, doubleWaves, []);

    expect(result.wavesTriggered).toContain('wave-a');
    expect(result.wavesTriggered).toContain('wave-b');
    expect(result.events).toHaveLength(3); // 2 stormtroopers + 1 probe droid
    expect(result.narrativeTexts).toHaveLength(2);
  });
});

// ============================================================================
// TESTS: applyReinforcementPhase (threat-based, integration)
// ============================================================================

describe('applyReinforcementPhase', () => {
  const gameData = buildMinimalGameData();

  it('accumulates threat each round', () => {
    const gs = buildMinimalGameState({
      roundNumber: 2,
      threatPool: 5,
      reinforcementPoints: 3,
    });

    const result = applyReinforcementPhase(gs, gameData);
    expect(result.threatGained).toBe(3);
    // Pool should be at least 5 + 3 = 8 (minus any spent)
    expect(result.newThreatPool + result.threatSpent).toBe(8);
  });

  it('returns empty events when no imperial player exists', () => {
    const gs = buildMinimalGameState();
    gs.players = [{ id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false }];

    const result = applyReinforcementPhase(gs, gameData);
    expect(result.events).toHaveLength(0);
    expect(result.threatGained).toBe(0);
  });
});

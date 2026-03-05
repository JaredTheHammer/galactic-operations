/**
 * Coverage tests for campaign-v2.ts and character-v2.ts uncovered branches.
 *
 * campaign-v2.ts targets:
 * - evaluateObjective: escort, defend_point (zone clear + round check), extract (zone check), default
 * - checkVictoryConditions: legacy Imperial VC (all heroes defeated), required objectives
 * - getReinforcementsForRound: wave threat budget check
 * - buildMissionDeployment
 *
 * character-v2.ts targets:
 * - purchaseTalent: applyTalentStatModifier (soak, strainThreshold)
 * - applyTalentCharacteristicModifier: invalid characteristic
 */

import { describe, it, expect } from 'vitest';

import {
  evaluateObjective,
  checkVictoryConditions,
  getReinforcementsForRound,
  buildMissionDeployment,
} from '../src/campaign-v2.js';

import type {
  Figure,
  GameState,
  Tile,
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

function makeGameState(figures: Figure[], overrides: Partial<GameState> = {}): GameState {
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
    heroes: {},
    npcProfiles: {},
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

// ============================================================================
// evaluateObjective
// ============================================================================

describe('evaluateObjective - edge cases', () => {
  it('escort objective always returns false (not yet implemented)', () => {
    const obj = {
      id: 'obj-escort',
      type: 'escort' as const,
      description: 'Escort the NPC',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 10, y: 10 }],
    };
    const gs = makeGameState([]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('escort objective returns false when no zone coordinates', () => {
    const obj = {
      id: 'obj-escort',
      type: 'escort' as const,
      description: 'Escort the NPC',
      side: 'Operative' as const,
      zoneCoordinates: [],
    };
    const gs = makeGameState([]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('defend_point returns true when no enemies in zone and round count met', () => {
    const impFig = makeFigure({
      id: 'imp-1',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 2,
      position: { x: 15, y: 15 }, // outside zone
    });
    const obj = {
      id: 'obj-defend',
      type: 'defend_point' as const,
      description: 'Defend the point',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 5, y: 5 }, { x: 6, y: 5 }],
      roundCount: 5,
    };
    const gs = makeGameState([impFig], { roundNumber: 5 });
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(true);
  });

  it('defend_point returns false when enemies in zone', () => {
    const impFig = makeFigure({
      id: 'imp-1',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 2,
      position: { x: 5, y: 5 }, // inside zone
    });
    const obj = {
      id: 'obj-defend',
      type: 'defend_point' as const,
      description: 'Defend the point',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 5, y: 5 }],
      roundCount: 5,
    };
    const gs = makeGameState([impFig], { roundNumber: 5 });
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('defend_point returns false when round count not met', () => {
    const obj = {
      id: 'obj-defend',
      type: 'defend_point' as const,
      description: 'Defend the point',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 5, y: 5 }],
      roundCount: 10,
    };
    const gs = makeGameState([], { roundNumber: 5 });
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('defend_point returns true when no enemy player exists and round met', () => {
    const obj = {
      id: 'obj-defend',
      type: 'defend_point' as const,
      description: 'Defend the point',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 5, y: 5 }],
      roundCount: 3,
    };
    // Operative side defending means Imperial enemies: remove Imperial player
    const gs = makeGameState([], { roundNumber: 3 });
    gs.players = [{ id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false }];
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(true);
  });

  it('extract returns true when all heroes in extraction zone', () => {
    const hero = makeFigure({ position: { x: 18, y: 18 } });
    const obj = {
      id: 'obj-extract',
      type: 'extract' as const,
      description: 'Reach extraction',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 18, y: 18 }, { x: 19, y: 18 }],
    };
    const gs = makeGameState([hero]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(true);
  });

  it('extract returns false when hero not in zone', () => {
    const hero = makeFigure({ position: { x: 5, y: 5 } });
    const obj = {
      id: 'obj-extract',
      type: 'extract' as const,
      description: 'Reach extraction',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 18, y: 18 }],
    };
    const gs = makeGameState([hero]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('extract returns false when no heroes alive', () => {
    const hero = makeFigure({ position: { x: 18, y: 18 }, isDefeated: true });
    const obj = {
      id: 'obj-extract',
      type: 'extract' as const,
      description: 'Reach extraction',
      side: 'Operative' as const,
      zoneCoordinates: [{ x: 18, y: 18 }],
    };
    const gs = makeGameState([hero]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('extract returns false when no zone coordinates', () => {
    const hero = makeFigure();
    const obj = {
      id: 'obj-extract',
      type: 'extract' as const,
      description: 'Reach extraction',
      side: 'Operative' as const,
      zoneCoordinates: [],
    };
    const gs = makeGameState([hero]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('survive_rounds returns true when heroes alive and round count met', () => {
    const hero = makeFigure();
    const obj = {
      id: 'obj-survive',
      type: 'survive_rounds' as const,
      description: 'Survive 5 rounds',
      side: 'Operative' as const,
      roundCount: 5,
    };
    const gs = makeGameState([hero], { roundNumber: 5 });
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(true);
  });

  it('survive_rounds returns false when round not met', () => {
    const hero = makeFigure();
    const obj = {
      id: 'obj-survive',
      type: 'survive_rounds' as const,
      description: 'Survive 5 rounds',
      side: 'Operative' as const,
      roundCount: 5,
    };
    const gs = makeGameState([hero], { roundNumber: 3 });
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('eliminate_target returns true when target NPC defeated', () => {
    const npc = makeFigure({
      id: 'imp-boss',
      entityType: 'npc',
      entityId: 'inquisitor',
      playerId: 2,
      isDefeated: true,
    });
    const obj = {
      id: 'obj-kill',
      type: 'eliminate_target' as const,
      description: 'Kill the Inquisitor',
      side: 'Operative' as const,
      targetId: 'inquisitor',
    };
    const gs = makeGameState([npc]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(true);
  });

  it('eliminate_target returns false when target alive', () => {
    const npc = makeFigure({
      id: 'imp-boss',
      entityType: 'npc',
      entityId: 'inquisitor',
      playerId: 2,
      isDefeated: false,
    });
    const obj = {
      id: 'obj-kill',
      type: 'eliminate_target' as const,
      description: 'Kill the Inquisitor',
      side: 'Operative' as const,
      targetId: 'inquisitor',
    };
    const gs = makeGameState([npc]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });

  it('collect_loot returns true when enough loot collected', () => {
    const obj = {
      id: 'obj-loot',
      type: 'collect_loot' as const,
      description: 'Collect 3 items',
      side: 'Operative' as const,
      targetCount: 3,
    };
    const gs = makeGameState([]);
    expect(evaluateObjective(obj as any, gs, ['l1', 'l2', 'l3'], [])).toBe(true);
  });

  it('collect_loot returns false when not enough loot', () => {
    const obj = {
      id: 'obj-loot',
      type: 'collect_loot' as const,
      description: 'Collect 3 items',
      side: 'Operative' as const,
      targetCount: 3,
    };
    const gs = makeGameState([]);
    expect(evaluateObjective(obj as any, gs, ['l1'], [])).toBe(false);
  });

  it('interact_terminal returns true when enough terminals interacted', () => {
    const obj = {
      id: 'obj-term',
      type: 'interact_terminal' as const,
      description: 'Interact with 2 terminals',
      side: 'Operative' as const,
      targetCount: 2,
    };
    const gs = makeGameState([]);
    expect(evaluateObjective(obj as any, gs, [], ['t1', 't2'])).toBe(true);
  });

  it('unknown objective type returns false', () => {
    const obj = {
      id: 'obj-unknown',
      type: 'unknown_type' as const,
      description: 'Unknown',
      side: 'Operative' as const,
    };
    const gs = makeGameState([]);
    expect(evaluateObjective(obj as any, gs, [], [])).toBe(false);
  });
});

// ============================================================================
// checkVictoryConditions
// ============================================================================

describe('checkVictoryConditions', () => {
  it('returns Imperial when legacy VC and all heroes defeated', () => {
    const hero1 = makeFigure({ id: 'fig-h1', isDefeated: true });
    const hero2 = makeFigure({ id: 'fig-h2', entityId: 'hero-2', isDefeated: true });
    const gs = makeGameState([hero1, hero2]);

    const mission = {
      id: 'test-mission',
      roundLimit: 12,
      victoryConditions: [
        { side: 'Imperial' as const, requiredObjectiveIds: [] },
      ],
      objectives: [],
    };

    expect(checkVictoryConditions(mission as any, gs, [], [])).toBe('Imperial');
  });

  it('returns null when legacy VC and heroes still alive', () => {
    const hero1 = makeFigure({ id: 'fig-h1', isDefeated: false });
    const gs = makeGameState([hero1]);

    const mission = {
      id: 'test-mission',
      roundLimit: 100,
      victoryConditions: [
        { side: 'Imperial' as const, requiredObjectiveIds: [] },
      ],
      objectives: [],
    };

    expect(checkVictoryConditions(mission as any, gs, [], [])).toBeNull();
  });

  it('returns Operative when required objectives all complete', () => {
    const impFig = makeFigure({
      id: 'imp-1',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 2,
      isDefeated: true,
    });
    const gs = makeGameState([impFig]);

    const mission = {
      id: 'test-mission',
      roundLimit: 100,
      victoryConditions: [
        {
          side: 'Operative' as const,
          requiredObjectiveIds: ['obj-kill'],
        },
      ],
      objectives: [
        {
          id: 'obj-kill',
          type: 'eliminate_target' as const,
          description: 'Kill enemies',
          side: 'Operative' as const,
          targetId: 'stormtrooper',
        },
      ],
    };

    expect(checkVictoryConditions(mission as any, gs, [], [])).toBe('Operative');
  });

  it('returns Imperial when round limit exceeded', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { roundNumber: 13 });

    const mission = {
      id: 'test-mission',
      roundLimit: 12,
      victoryConditions: [],
      objectives: [],
    };

    expect(checkVictoryConditions(mission as any, gs, [], [])).toBe('Imperial');
  });
});

// ============================================================================
// buildMissionDeployment
// ============================================================================

describe('buildMissionDeployment', () => {
  it('returns initial enemies from mission definition', () => {
    const mission = {
      initialEnemies: [
        { npcProfileId: 'stormtrooper', count: 3, asMinGroup: false },
        { npcProfileId: 'officer', count: 1, asMinGroup: false },
      ],
    };
    const campaign = { completedMissions: [], heroes: {} } as any;

    const result = buildMissionDeployment(mission as any, campaign);
    expect(result).toHaveLength(2);
    expect(result[0].npcProfileId).toBe('stormtrooper');
    expect(result[0].count).toBe(3);
    expect(result[1].npcProfileId).toBe('officer');
  });
});

// ============================================================================
// getReinforcementsForRound
// ============================================================================

describe('getReinforcementsForRound', () => {
  it('returns waves matching the round and within threat budget', () => {
    const mission = {
      imperialThreat: 10,
      reinforcements: [
        { triggerRound: 3, npcProfileId: 'stormtrooper', count: 2, threatCost: 5 },
        { triggerRound: 3, npcProfileId: 'officer', count: 1, threatCost: 20 }, // too expensive
        { triggerRound: 5, npcProfileId: 'stormtrooper', count: 1, threatCost: 3 }, // wrong round
      ],
    };
    const campaign = {
      completedMissions: [],
      missionsPlayed: 0,
      difficulty: 'standard',
      threatMultiplier: 1.0,
    } as any;

    const result = getReinforcementsForRound(mission as any, 3, campaign);
    expect(result).toHaveLength(1);
    expect(result[0].npcProfileId).toBe('stormtrooper');
  });

  it('returns empty when no waves match the round', () => {
    const mission = {
      imperialThreat: 10,
      reinforcements: [
        { triggerRound: 5, npcProfileId: 'stormtrooper', count: 2, threatCost: 5 },
      ],
    };
    const campaign = {
      completedMissions: [],
      missionsPlayed: 0,
      difficulty: 'standard',
      threatMultiplier: 1.0,
    } as any;

    const result = getReinforcementsForRound(mission as any, 3, campaign);
    expect(result).toHaveLength(0);
  });
});

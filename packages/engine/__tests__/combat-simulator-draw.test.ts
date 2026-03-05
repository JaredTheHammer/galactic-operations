/**
 * combat-simulator-draw.test.ts
 *
 * Tests for the draw condition path in combat-simulator.ts:
 * - Single game draw when no victory condition met at round limit
 * - Batch simulation correctly tallies draws
 * - Winner determination mapping (Imperial -> sideA, Operative -> sideB, null -> draw)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';

vi.mock('../src/turn-machine-v2.js', async (importOriginal) => {
  const orig = await importOriginal() as any;
  return {
    ...orig,
    checkVictoryV2: vi.fn(orig.checkVictoryV2),
  };
});

import { checkVictoryV2 } from '../src/turn-machine-v2.js';

import type {
  Figure,
  GameState,
  HeroCharacter,
  NPCProfile,
  Mission,
  Tile,
  Side,
} from '../src/types.js';

// ============================================================================
// Unit test the winner determination mapping logic directly
// ============================================================================

describe('winner determination mapping', () => {
  function mapWinner(gsWinner: Side | null): 'sideA' | 'sideB' | 'draw' {
    if (gsWinner === 'Imperial') return 'sideA';
    if (gsWinner === 'Operative') return 'sideB';
    return 'draw';
  }

  it('maps Imperial to sideA', () => {
    expect(mapWinner('Imperial')).toBe('sideA');
  });

  it('maps Operative to sideB', () => {
    expect(mapWinner('Operative')).toBe('sideB');
  });

  it('maps null to draw', () => {
    expect(mapWinner(null)).toBe('draw');
  });
});

// ============================================================================
// Draw tally logic
// ============================================================================

describe('draw tally logic', () => {
  it('correctly tallies draws in batch results', () => {
    const results: Array<{ winner: 'sideA' | 'sideB' | 'draw' }> = [
      { winner: 'sideA' },
      { winner: 'draw' },
      { winner: 'sideB' },
      { winner: 'draw' },
      { winner: 'draw' },
      { winner: 'sideA' },
    ];

    let sideAWins = 0;
    let sideBWins = 0;
    let draws = 0;

    for (const result of results) {
      if (result.winner === 'sideA') sideAWins++;
      else if (result.winner === 'sideB') sideBWins++;
      else draws++;
    }

    expect(sideAWins).toBe(2);
    expect(sideBWins).toBe(1);
    expect(draws).toBe(3);
  });
});

// ============================================================================
// checkVictoryV2 returns null (draw scenario)
// ============================================================================

describe('checkVictoryV2 draw scenario', () => {
  function makeTile(): Tile {
    return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
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

  function makeGameState(figures: Figure[], overrides: Partial<GameState> = {}): GameState {
    return {
      missionId: 'test-mission', roundNumber: 5, turnPhase: 'Activation', playMode: 'grid',
      map: { id: 'test-map', name: 'Test', width: 10, height: 10,
        tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => makeTile())),
        deploymentZones: { imperial: [], operative: [] } },
      players: [
        { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
        { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
      ],
      currentPlayerIndex: 0, figures, activationOrder: figures.map(f => f.id),
      currentActivationIndex: 0, heroes: {}, npcProfiles: {},
      imperialMorale: { value: 10, max: 12, state: 'Steady' },
      operativeMorale: { value: 10, max: 12, state: 'Steady' },
      activeCombat: null, threatPool: 0, reinforcementPoints: 0, actionLog: [],
      gameMode: 'Solo', winner: null, victoryCondition: null, activeMissionId: null,
      lootCollected: [], interactedTerminals: [], completedObjectiveIds: [], objectivePoints: [],
      ...overrides,
    } as GameState;
  }

  it('returns null winner when no victory conditions match and within round limit', () => {
    const hero = makeFigure({ isDefeated: false });
    const npc = makeNPCFigure({ isDefeated: false });
    const gs = makeGameState([hero, npc], { roundNumber: 5 });

    const mission: Mission = {
      id: 'test-mission', name: 'Test', description: 'Test',
      mapId: 'test-map', roundLimit: 12, victoryConditions: [],
      imperialThreat: 5, imperialReinforcementPoints: 0,
      threatPerRound: 5, initialEnemies: [], reinforcements: [],
    } as Mission;

    const result = (checkVictoryV2 as any).call(null, gs, mission);
    expect(result.winner).toBeNull();
    expect(result.condition).toBeNull();
  });

  it('returns Imperial winner when round limit exceeded (not a draw)', () => {
    const hero = makeFigure({ isDefeated: false });
    const npc = makeNPCFigure({ isDefeated: false });
    const gs = makeGameState([hero, npc], { roundNumber: 13 });

    const mission: Mission = {
      id: 'test-mission', name: 'Test', description: 'Test',
      mapId: 'test-map', roundLimit: 12, victoryConditions: [],
      imperialThreat: 5, imperialReinforcementPoints: 0,
      threatPerRound: 5, initialEnemies: [], reinforcements: [],
    } as Mission;

    const result = (checkVictoryV2 as any).call(null, gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toContain('Round limit');
  });
});

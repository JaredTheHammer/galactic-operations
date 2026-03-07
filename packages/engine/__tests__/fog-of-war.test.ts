/**
 * fog-of-war.test.ts -- Progressive Room Reveal / Fog of War Tests
 *
 * Tests for the Gloomhaven-inspired fog-of-war system:
 * - Tile visibility states: hidden, explored, visible
 * - Vision computation with LOS and range
 * - Room reveal (12x12 board tile reveal)
 * - Fog state updates after movement and deployment
 * - Serialization/deserialization
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameState,
  GameMap,
  FogOfWarState,
  Tile,
} from '../src/types';

import {
  createFogOfWarState,
  getTileVisibility,
  isFigureVisible,
  computeVisibleTiles,
  computeVisibleTilesWithRoomReveal,
  updateFogOfWar,
  serializeFogOfWar,
  deserializeFogOfWar,
} from '../src/fog-of-war';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeTile(terrain: string = 'Open'): Tile {
  return {
    terrain: terrain as any,
    elevation: 0,
    cover: 'None' as const,
    occupied: null,
    objective: null,
  };
}

function makeMap(width = 24, height = 24, opts?: { walls?: Array<{ x: number; y: number }> }): GameMap {
  const tiles: Tile[][] = Array(height).fill(null).map(() =>
    Array(width).fill(null).map(() => makeTile())
  );

  // Place walls
  if (opts?.walls) {
    for (const w of opts.walls) {
      if (w.y < height && w.x < width) {
        tiles[w.y][w.x] = makeTile('Wall');
      }
    }
  }

  return {
    id: 'test-map',
    name: 'Test Map',
    width,
    height,
    tiles,
    deploymentZones: { imperial: [], operative: [] },
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: 2,
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    turnPhase: 'Activation',
    roundNumber: 1,
    missionId: 'test',
    players: [
      { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
    ],
    figures: [],
    map: makeMap(),
    activationOrder: [],
    currentActivationIndex: 0,
    currentPlayerIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { value: 12, max: 12, state: 'Steady' },
    operativeMorale: { value: 12, max: 12, state: 'Steady' },
    activeCombat: null,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    playMode: 'grid',
    threatPool: 0,
    reinforcementPoints: 0,
    activeMissionId: 'test',
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    lootTokens: [],
    ...overrides,
  } as any;
}

// ============================================================================
// FOG STATE CREATION
// ============================================================================

describe('createFogOfWarState', () => {
  it('creates enabled fog state with default vision range', () => {
    const fog = createFogOfWarState(true);
    expect(fog.enabled).toBe(true);
    expect(fog.visionRange).toBe(8);
    expect(fog.imperialVisible.size).toBe(0);
    expect(fog.operativeVisible.size).toBe(0);
    expect(fog.imperialExplored.size).toBe(0);
    expect(fog.operativeExplored.size).toBe(0);
  });

  it('creates disabled fog state', () => {
    const fog = createFogOfWarState(false);
    expect(fog.enabled).toBe(false);
  });

  it('accepts custom vision range', () => {
    const fog = createFogOfWarState(true, 12);
    expect(fog.visionRange).toBe(12);
  });
});

// ============================================================================
// TILE VISIBILITY QUERIES
// ============================================================================

describe('getTileVisibility', () => {
  it('returns visible when fog is disabled', () => {
    const fog = createFogOfWarState(false);
    expect(getTileVisibility(fog, 0, 0, 'Imperial')).toBe('visible');
  });

  it('returns hidden for unseen tile', () => {
    const fog = createFogOfWarState(true);
    expect(getTileVisibility(fog, 5, 5, 'Imperial')).toBe('hidden');
  });

  it('returns visible for currently visible tile', () => {
    const fog = createFogOfWarState(true);
    fog.imperialVisible.add('5,5');
    expect(getTileVisibility(fog, 5, 5, 'Imperial')).toBe('visible');
  });

  it('returns explored for previously seen tile no longer in LOS', () => {
    const fog = createFogOfWarState(true);
    fog.imperialExplored.add('5,5');
    // Not in imperialVisible
    expect(getTileVisibility(fog, 5, 5, 'Imperial')).toBe('explored');
  });

  it('sides have independent visibility', () => {
    const fog = createFogOfWarState(true);
    fog.imperialVisible.add('5,5');
    expect(getTileVisibility(fog, 5, 5, 'Imperial')).toBe('visible');
    expect(getTileVisibility(fog, 5, 5, 'Operative')).toBe('hidden');
  });
});

// ============================================================================
// FIGURE VISIBILITY
// ============================================================================

describe('isFigureVisible', () => {
  it('always visible when fog disabled', () => {
    const fog = createFogOfWarState(false);
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    expect(isFigureVisible(fog, fig, 'Imperial')).toBe(true);
  });

  it('visible when figure tile is in visible set', () => {
    const fog = createFogOfWarState(true);
    fog.operativeVisible.add('5,5');
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    expect(isFigureVisible(fog, fig, 'Operative')).toBe(true);
  });

  it('not visible when figure tile is only explored', () => {
    const fog = createFogOfWarState(true);
    fog.operativeExplored.add('5,5');
    const fig = makeFigure({ position: { x: 5, y: 5 } });
    expect(isFigureVisible(fog, fig, 'Operative')).toBe(false);
  });
});

// ============================================================================
// VISION COMPUTATION
// ============================================================================

describe('computeVisibleTiles', () => {
  it('reveals tiles within vision range on open map', () => {
    const map = makeMap(24, 24);
    const visible = computeVisibleTiles({ x: 12, y: 12 }, map, 3);

    // The figure's own tile should be visible
    expect(visible.has('12,12')).toBe(true);

    // Adjacent tiles should be visible
    expect(visible.has('13,12')).toBe(true);
    expect(visible.has('11,12')).toBe(true);
    expect(visible.has('12,13')).toBe(true);

    // Tiles at range 3 should be visible (diagonal)
    expect(visible.has('15,12')).toBe(true);

    // Tiles beyond range should NOT be visible
    expect(visible.has('16,12')).toBe(false);
  });

  it('walls block line of sight', () => {
    // Place a wall between the figure and a target tile
    const walls = [
      { x: 7, y: 5 }, // Wall at (7,5) blocks LOS from (5,5) to (9,5)
    ];
    const map = makeMap(24, 24, { walls });
    const visible = computeVisibleTiles({ x: 5, y: 5 }, map, 8);

    // Tile before wall should be visible
    expect(visible.has('6,5')).toBe(true);

    // Wall tile itself blocks LOS (the LOS check fails at Wall)
    expect(visible.has('7,5')).toBe(false);

    // Tile behind wall should NOT be visible
    expect(visible.has('8,5')).toBe(false);
    expect(visible.has('9,5')).toBe(false);
  });

  it('figure at map corner sees correct tiles', () => {
    const map = makeMap(12, 12);
    const visible = computeVisibleTiles({ x: 0, y: 0 }, map, 4);

    expect(visible.has('0,0')).toBe(true);
    expect(visible.has('4,0')).toBe(true);
    expect(visible.has('0,4')).toBe(true);

    // Negative coordinates should not appear (out of bounds)
    expect(visible.has('-1,0')).toBe(false);
  });

  it('returns empty set for vision range 0', () => {
    const map = makeMap(12, 12);
    const visible = computeVisibleTiles({ x: 5, y: 5 }, map, 0);

    // Only the figure's own tile
    expect(visible.has('5,5')).toBe(true);
    expect(visible.size).toBe(1);
  });
});

// ============================================================================
// ROOM REVEAL
// ============================================================================

describe('computeVisibleTilesWithRoomReveal', () => {
  it('reveals entire 12x12 board when any tile in it is visible', () => {
    const map = makeMap(24, 24);
    // Add board info
    map.boardsWide = 2;
    map.boardsTall = 2;

    // Figure at (1, 1) with range 2 should see tiles in board (0,0)
    const visible = computeVisibleTilesWithRoomReveal({ x: 1, y: 1 }, map, 2);

    // The entire first board (0,0) to (11,11) should be revealed
    expect(visible.has('0,0')).toBe(true);
    expect(visible.has('11,11')).toBe(true);
    expect(visible.has('11,0')).toBe(true);
    expect(visible.has('0,11')).toBe(true);

    // Second board should NOT be revealed (no direct vision into it with range 2)
    // Actually with range 2 from (1,1), the max x is 3, so board (1,0) starting at x=12 is not visible
    expect(visible.has('12,0')).toBe(false);
  });

  it('reveals adjacent board when vision reaches into it', () => {
    const map = makeMap(24, 24);
    map.boardsWide = 2;
    map.boardsTall = 2;

    // Figure near board boundary at (11, 5) with range 3 reaches into board (1,0)
    const visible = computeVisibleTilesWithRoomReveal({ x: 11, y: 5 }, map, 3);

    // Both board (0,0) and board (1,0) should be fully revealed
    expect(visible.has('0,0')).toBe(true);    // board (0,0)
    expect(visible.has('12,5')).toBe(true);   // board (1,0)
    expect(visible.has('23,11')).toBe(true);  // far corner of board (1,0)
  });

  it('falls back to direct vision when board info is missing', () => {
    const map = makeMap(24, 24);
    // No boardsWide/boardsTall set

    const visible = computeVisibleTilesWithRoomReveal({ x: 1, y: 1 }, map, 2);

    // Should behave like computeVisibleTiles (no room reveal)
    expect(visible.has('1,1')).toBe(true);
    expect(visible.has('3,1')).toBe(true);
    // Far tiles should NOT be visible
    expect(visible.has('11,11')).toBe(false);
  });
});

// ============================================================================
// FOG STATE UPDATE
// ============================================================================

describe('updateFogOfWar', () => {
  it('updates visible and explored sets from figure positions', () => {
    const imperialFig = makeFigure({
      id: 'imp-1',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 0,
      position: { x: 2, y: 2 },
    });

    const gs = makeGameState({
      figures: [imperialFig],
      fogOfWar: createFogOfWarState(true, 3),
    });

    const newFog = updateFogOfWar(gs);

    // Imperial should see tiles near (2,2)
    expect(newFog.imperialVisible.has('2,2')).toBe(true);
    expect(newFog.imperialVisible.has('3,2')).toBe(true);

    // Explored should be the same as visible after first update
    expect(newFog.imperialExplored.has('2,2')).toBe(true);

    // Operative should see nothing (no operative figures)
    expect(newFog.operativeVisible.size).toBe(0);
  });

  it('preserves explored tiles from previous updates', () => {
    const fig = makeFigure({
      id: 'op-1',
      playerId: 1,
      position: { x: 5, y: 5 },
    });

    const fog = createFogOfWarState(true, 2);
    // Pre-populate some explored tiles from a previous position
    fog.operativeExplored.add('0,0');
    fog.operativeExplored.add('1,1');

    const gs = makeGameState({
      figures: [fig],
      fogOfWar: fog,
    });

    const newFog = updateFogOfWar(gs);

    // Previously explored tiles should persist
    expect(newFog.operativeExplored.has('0,0')).toBe(true);
    expect(newFog.operativeExplored.has('1,1')).toBe(true);

    // New tiles near figure should also be explored
    expect(newFog.operativeExplored.has('5,5')).toBe(true);
  });

  it('defeated figures do not contribute to visibility', () => {
    const fig = makeFigure({
      id: 'op-1',
      playerId: 1,
      position: { x: 5, y: 5 },
      isDefeated: true,
    });

    const gs = makeGameState({
      figures: [fig],
      fogOfWar: createFogOfWarState(true, 3),
    });

    const newFog = updateFogOfWar(gs);
    expect(newFog.operativeVisible.size).toBe(0);
  });

  it('returns disabled fog state unchanged when fog is disabled', () => {
    const gs = makeGameState({
      fogOfWar: createFogOfWarState(false),
      figures: [makeFigure()],
    });

    const newFog = updateFogOfWar(gs);
    expect(newFog.enabled).toBe(false);
    expect(newFog.imperialVisible.size).toBe(0);
  });

  it('handles multiple figures on same side', () => {
    const fig1 = makeFigure({
      id: 'op-1',
      playerId: 1,
      position: { x: 2, y: 2 },
    });
    const fig2 = makeFigure({
      id: 'op-2',
      playerId: 1,
      position: { x: 20, y: 20 },
    });

    const gs = makeGameState({
      figures: [fig1, fig2],
      fogOfWar: createFogOfWarState(true, 2),
    });

    const newFog = updateFogOfWar(gs);

    // Both figures contribute to operative visibility
    expect(newFog.operativeVisible.has('2,2')).toBe(true);
    expect(newFog.operativeVisible.has('20,20')).toBe(true);

    // Each sees their own area, not the other's
    expect(newFog.operativeVisible.has('3,2')).toBe(true);
    expect(newFog.operativeVisible.has('21,20')).toBe(true);
  });
});

// ============================================================================
// SERIALIZATION
// ============================================================================

describe('Fog of War serialization', () => {
  it('round-trips through serialize/deserialize', () => {
    const fog = createFogOfWarState(true, 10);
    fog.imperialVisible.add('1,2');
    fog.imperialVisible.add('3,4');
    fog.operativeExplored.add('5,6');

    const serialized = serializeFogOfWar(fog);
    expect(Array.isArray(serialized.imperialVisible)).toBe(true);
    expect(serialized.imperialVisible).toHaveLength(2);

    const deserialized = deserializeFogOfWar(serialized);
    expect(deserialized.enabled).toBe(true);
    expect(deserialized.visionRange).toBe(10);
    expect(deserialized.imperialVisible.has('1,2')).toBe(true);
    expect(deserialized.imperialVisible.has('3,4')).toBe(true);
    expect(deserialized.operativeExplored.has('5,6')).toBe(true);
  });

  it('serializes empty fog state correctly', () => {
    const fog = createFogOfWarState(false);
    const serialized = serializeFogOfWar(fog);
    expect(serialized.imperialVisible).toEqual([]);
    expect(serialized.enabled).toBe(false);

    const deserialized = deserializeFogOfWar(serialized);
    expect(deserialized.imperialVisible.size).toBe(0);
    expect(deserialized.enabled).toBe(false);
  });
});

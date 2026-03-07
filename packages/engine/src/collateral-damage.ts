/**
 * Spirit Island Subsystem #5: Collateral Damage
 *
 * Combat actions with explosive/destructive weapon qualities damage the
 * environment. Tiles accumulate collateral levels (0-3). At level 3, damage
 * cascades to adjacent tiles. Too much total collateral triggers XP penalties.
 *
 * Inspired by Spirit Island's Blight cascade system.
 */

import type {
  CollateralDamageState,
  CollateralLevel,
  DamagedTile,
  GridCoordinate,
  GameState,
  GameMap,
} from './types.js';

import { COLLATERAL_SOURCES } from './types.js';

/** Default penalty threshold (total collateral points before XP penalty) */
const DEFAULT_PENALTY_THRESHOLD = 15;

/** XP multiplier when penalty is triggered */
const PENALTY_XP_MULTIPLIER = 0.75;

/**
 * Create initial collateral damage state for a mission.
 */
export function initializeCollateralDamage(
  penaltyThreshold: number = DEFAULT_PENALTY_THRESHOLD,
): CollateralDamageState {
  return {
    damagedTiles: [],
    totalCollateral: 0,
    penaltyThreshold,
    penaltyTriggered: false,
    xpMultiplier: 1.0,
  };
}

/**
 * Get the current collateral level of a tile.
 */
export function getTileCollateral(
  state: CollateralDamageState,
  position: GridCoordinate,
): CollateralLevel {
  const tile = state.damagedTiles.find(
    t => t.position.x === position.x && t.position.y === position.y,
  );
  return tile?.level ?? 0;
}

/**
 * Get 8-directional adjacent positions.
 */
function getAdjacentPositions(pos: GridCoordinate): GridCoordinate[] {
  const offsets = [
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 0 },                     { x: 1, y: 0 },
    { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 },
  ];
  return offsets.map(o => ({ x: pos.x + o.x, y: pos.y + o.y }));
}

/**
 * Check if a position is within map bounds.
 */
function isInBounds(pos: GridCoordinate, map: GameMap): boolean {
  return pos.x >= 0 && pos.x < map.width && pos.y >= 0 && pos.y < map.height;
}

/**
 * Apply collateral damage to a specific tile.
 * Returns the updated state including any cascade effects.
 */
export function applyCollateralToTile(
  state: CollateralDamageState,
  position: GridCoordinate,
  amount: number,
  source: string,
  map: GameMap,
  cascadesAllowed: boolean = true,
): CollateralDamageState {
  const currentLevel = getTileCollateral(state, position);
  const newLevel = Math.min(3, currentLevel + amount) as CollateralLevel;

  if (newLevel === currentLevel) return state;

  // Update or add the damaged tile
  const existingIndex = state.damagedTiles.findIndex(
    t => t.position.x === position.x && t.position.y === position.y,
  );

  let newDamagedTiles: DamagedTile[];
  if (existingIndex >= 0) {
    newDamagedTiles = [...state.damagedTiles];
    newDamagedTiles[existingIndex] = {
      position,
      level: newLevel,
      source,
    };
  } else {
    newDamagedTiles = [
      ...state.damagedTiles,
      { position, level: newLevel, source },
    ];
  }

  const collateralAdded = newLevel - currentLevel;
  let newState: CollateralDamageState = {
    ...state,
    damagedTiles: newDamagedTiles,
    totalCollateral: state.totalCollateral + collateralAdded,
    penaltyTriggered: state.totalCollateral + collateralAdded >= state.penaltyThreshold,
    xpMultiplier: state.totalCollateral + collateralAdded >= state.penaltyThreshold
      ? PENALTY_XP_MULTIPLIER
      : 1.0,
  };

  // Cascade: if tile reached level 3, apply 1 collateral to adjacent tiles
  if (newLevel === 3 && cascadesAllowed) {
    const adjacent = getAdjacentPositions(position)
      .filter(p => isInBounds(p, map));

    for (const adj of adjacent) {
      const adjLevel = getTileCollateral(newState, adj);
      if (adjLevel < 3) {
        // Cascade applies 1 level, but does NOT cascade further (prevents infinite loops)
        newState = applyCollateralToTile(
          newState,
          adj,
          1,
          `cascade from (${position.x},${position.y})`,
          map,
          false, // no further cascades
        );
      }
    }
  }

  return newState;
}

/**
 * Check if a weapon quality generates collateral damage.
 * Returns the collateral source config if applicable.
 */
export function getCollateralForQuality(quality: string): {
  baseCollateral: number;
  cascades: boolean;
} | null {
  const source = COLLATERAL_SOURCES.find(s => s.quality === quality);
  return source ? { baseCollateral: source.baseCollateral, cascades: source.cascades } : null;
}

/**
 * Apply collateral damage from a combat action at a position.
 * Checks weapon qualities to determine if collateral is generated.
 */
export function applyWeaponCollateral(
  state: CollateralDamageState,
  position: GridCoordinate,
  weaponQualities: string[],
  map: GameMap,
): CollateralDamageState {
  let current = state;

  for (const quality of weaponQualities) {
    const collateral = getCollateralForQuality(quality);
    if (collateral) {
      current = applyCollateralToTile(
        current,
        position,
        collateral.baseCollateral,
        quality,
        map,
        collateral.cascades,
      );
    }
  }

  return current;
}

/**
 * Get all tiles at a specific damage level (for UI highlighting).
 */
export function getTilesAtLevel(
  state: CollateralDamageState,
  level: CollateralLevel,
): GridCoordinate[] {
  return state.damagedTiles
    .filter(t => t.level === level)
    .map(t => t.position);
}

/**
 * Get the terrain modification for a damaged tile.
 * Level 1: cover removed. Level 2: difficult terrain. Level 3: impassable.
 */
export function getTerrainModification(
  level: CollateralLevel,
): { coverRemoved: boolean; difficultTerrain: boolean; impassable: boolean } {
  return {
    coverRemoved: level >= 1,
    difficultTerrain: level >= 2,
    impassable: level >= 3,
  };
}

/**
 * Apply collateral damage tracking to game state after a weapon fires.
 */
export function applyCollateralToGameState(
  gameState: GameState,
  position: GridCoordinate,
  weaponQualities: string[],
): GameState {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.collateralDamage || !si.collateralDamage) {
    return gameState;
  }

  const updated = applyWeaponCollateral(
    si.collateralDamage,
    position,
    weaponQualities,
    gameState.map,
  );

  return {
    ...gameState,
    spiritIsland: {
      ...si,
      collateralDamage: updated,
    },
  };
}

/**
 * Get the XP multiplier to apply at end of mission.
 */
export function getXPMultiplier(state: CollateralDamageState): number {
  return state.xpMultiplier;
}

/**
 * Get summary statistics for the collateral damage system (for UI/reports).
 */
export function getCollateralSummary(state: CollateralDamageState): {
  totalPoints: number;
  tilesAffected: number;
  penaltyActive: boolean;
  xpMultiplier: number;
  byLevel: Record<CollateralLevel, number>;
} {
  const byLevel: Record<CollateralLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const tile of state.damagedTiles) {
    byLevel[tile.level]++;
  }

  return {
    totalPoints: state.totalCollateral,
    tilesAffected: state.damagedTiles.length,
    penaltyActive: state.penaltyTriggered,
    xpMultiplier: state.xpMultiplier,
    byLevel,
  };
}

/**
 * Fog of War / Progressive Room Reveal
 *
 * Gloomhaven-inspired progressive map reveal system. Each side only sees
 * tiles within line-of-sight of their figures. Previously seen tiles are
 * "explored" (dimmed) and tiles never seen are "hidden" (black fog).
 *
 * Vision is computed per-figure using LOS checks within a vision range.
 * Board tiles (12x12 sections) can optionally be revealed as whole rooms
 * when any tile in the room becomes visible.
 *
 * Hook points:
 * - turn-machine-v2.ts: createInitialGameStateV2 (init fog), moveFigure (update after move),
 *   advancePhaseV2 (recalculate at activation start)
 * - Client renderer: uses getTileVisibility() to determine render state
 */

import type {
  Figure,
  FogOfWarState,
  GameMap,
  GameState,
  GridCoordinate,
  Side,
  TileVisibility,
} from './types.js';

import { BOARD_SIZE } from './types.js';
import { hasLineOfSight } from './los.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISION_RANGE = 8;

// ============================================================================
// FOG STATE CREATION
// ============================================================================

/**
 * Create an empty fog-of-war state.
 * All tiles start hidden. Call updateFogOfWar() after deploying figures
 * to reveal deployment zones.
 */
export function createFogOfWarState(
  enabled: boolean = true,
  visionRange: number = DEFAULT_VISION_RANGE,
): FogOfWarState {
  return {
    imperialVisible: new Set(),
    operativeVisible: new Set(),
    imperialExplored: new Set(),
    operativeExplored: new Set(),
    enabled,
    visionRange,
  };
}

// ============================================================================
// TILE VISIBILITY QUERIES
// ============================================================================

const tileKey = (x: number, y: number): string => `${x},${y}`;

/**
 * Get the visibility state of a tile for a given side.
 * Returns 'visible', 'explored', or 'hidden'.
 */
export function getTileVisibility(
  fogState: FogOfWarState,
  x: number,
  y: number,
  side: Side,
): TileVisibility {
  if (!fogState.enabled) return 'visible';

  const key = tileKey(x, y);
  const visibleSet = side === 'Imperial' ? fogState.imperialVisible : fogState.operativeVisible;
  const exploredSet = side === 'Imperial' ? fogState.imperialExplored : fogState.operativeExplored;

  if (visibleSet.has(key)) return 'visible';
  if (exploredSet.has(key)) return 'explored';
  return 'hidden';
}

/**
 * Check if a figure is visible to a given side.
 * A figure is visible if the tile it occupies is visible to that side.
 */
export function isFigureVisible(
  fogState: FogOfWarState,
  figure: Figure,
  viewingSide: Side,
): boolean {
  if (!fogState.enabled) return true;
  return getTileVisibility(fogState, figure.position.x, figure.position.y, viewingSide) === 'visible';
}

// ============================================================================
// VISION COMPUTATION
// ============================================================================

/**
 * Compute all tiles visible from a given position within vision range,
 * respecting LOS (walls block sight).
 */
export function computeVisibleTiles(
  position: GridCoordinate,
  map: GameMap,
  visionRange: number,
): Set<string> {
  const visible = new Set<string>();

  const minX = Math.max(0, position.x - visionRange);
  const maxX = Math.min(map.width - 1, position.x + visionRange);
  const minY = Math.max(0, position.y - visionRange);
  const maxY = Math.min(map.height - 1, position.y + visionRange);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Chebyshev distance check
      const dist = Math.max(Math.abs(x - position.x), Math.abs(y - position.y));
      if (dist > visionRange) continue;

      // The figure's own tile is always visible
      if (x === position.x && y === position.y) {
        visible.add(tileKey(x, y));
        continue;
      }

      // LOS check
      if (hasLineOfSight(position, { x, y }, map)) {
        visible.add(tileKey(x, y));
      }
    }
  }

  return visible;
}

/**
 * Compute all tiles visible from a position, and also reveal the entire
 * board tile (12x12 room) for any tile that becomes visible.
 * This creates the Gloomhaven "room reveal" effect.
 */
export function computeVisibleTilesWithRoomReveal(
  position: GridCoordinate,
  map: GameMap,
  visionRange: number,
): Set<string> {
  const directlyVisible = computeVisibleTiles(position, map, visionRange);

  // If the map doesn't have board tile info, skip room reveal
  if (!map.boardsWide || !map.boardsTall) {
    return directlyVisible;
  }

  const revealed = new Set(directlyVisible);
  const revealedBoards = new Set<string>();

  // Find which boards have at least one visible tile
  for (const key of directlyVisible) {
    const [xStr, yStr] = key.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const boardX = Math.floor(x / BOARD_SIZE);
    const boardY = Math.floor(y / BOARD_SIZE);
    revealedBoards.add(`${boardX},${boardY}`);
  }

  // Reveal all tiles in those boards
  for (const boardKey of revealedBoards) {
    const [bxStr, byStr] = boardKey.split(',');
    const bx = parseInt(bxStr, 10);
    const by = parseInt(byStr, 10);
    const startX = bx * BOARD_SIZE;
    const startY = by * BOARD_SIZE;

    for (let dy = 0; dy < BOARD_SIZE; dy++) {
      for (let dx = 0; dx < BOARD_SIZE; dx++) {
        const tx = startX + dx;
        const ty = startY + dy;
        if (tx < map.width && ty < map.height) {
          revealed.add(tileKey(tx, ty));
        }
      }
    }
  }

  return revealed;
}

// ============================================================================
// FOG STATE UPDATE
// ============================================================================

/**
 * Determine which side a figure belongs to based on playerId and game players.
 */
function getFigureSide(figure: Figure, gameState: GameState): Side | null {
  const player = gameState.players.find(p => p.id === figure.playerId);
  if (!player) return null;
  return player.role === 'Imperial' ? 'Imperial' : 'Operative';
}

/**
 * Full fog-of-war recalculation for all living figures.
 * Called after movement, deployment, or phase transitions.
 *
 * 1. Clear current visible sets
 * 2. For each alive figure, compute visible tiles
 * 3. Merge into side's visible set
 * 4. Add all visible tiles to explored set (explored is monotonically increasing)
 *
 * @param roomReveal If true, seeing any tile in a 12x12 board reveals the whole board
 */
export function updateFogOfWar(
  gameState: GameState,
  roomReveal: boolean = true,
): FogOfWarState {
  const fog = gameState.fogOfWar;
  if (!fog || !fog.enabled) {
    return fog ?? createFogOfWarState(false);
  }

  const imperialVisible = new Set<string>();
  const operativeVisible = new Set<string>();

  // Preserve existing explored tiles
  const imperialExplored = new Set(fog.imperialExplored);
  const operativeExplored = new Set(fog.operativeExplored);

  const computeFn = roomReveal
    ? computeVisibleTilesWithRoomReveal
    : computeVisibleTiles;

  for (const figure of gameState.figures) {
    if (figure.isDefeated) continue;

    const side = getFigureSide(figure, gameState);
    if (!side) continue;

    const figureVisible = computeFn(figure.position, gameState.map, fog.visionRange);

    if (side === 'Imperial') {
      for (const key of figureVisible) {
        imperialVisible.add(key);
        imperialExplored.add(key);
      }
    } else {
      for (const key of figureVisible) {
        operativeVisible.add(key);
        operativeExplored.add(key);
      }
    }
  }

  return {
    ...fog,
    imperialVisible,
    operativeVisible,
    imperialExplored,
    operativeExplored,
  };
}

/**
 * Incremental fog update after a single figure moves.
 * More efficient than full recalculation for single-figure movement.
 */
export function updateFogAfterMove(
  gameState: GameState,
  movedFigure: Figure,
  roomReveal: boolean = true,
): FogOfWarState {
  // For simplicity and correctness (other figures may have been defeated/moved),
  // do a full recalculation. The cost is bounded by figureCount * visionRange^2 * LOS checks.
  // For typical games (6-20 figures, range 8), this is ~10K LOS checks -- fast enough.
  return updateFogOfWar(gameState, roomReveal);
}

// ============================================================================
// SERIALIZATION (Sets -> arrays for JSON persistence)
// ============================================================================

/**
 * Serialize FogOfWarState for JSON (Sets become arrays).
 */
export function serializeFogOfWar(fog: FogOfWarState): {
  imperialVisible: string[];
  operativeVisible: string[];
  imperialExplored: string[];
  operativeExplored: string[];
  enabled: boolean;
  visionRange: number;
} {
  return {
    imperialVisible: [...fog.imperialVisible],
    operativeVisible: [...fog.operativeVisible],
    imperialExplored: [...fog.imperialExplored],
    operativeExplored: [...fog.operativeExplored],
    enabled: fog.enabled,
    visionRange: fog.visionRange,
  };
}

/**
 * Deserialize FogOfWarState from JSON (arrays become Sets).
 */
export function deserializeFogOfWar(data: {
  imperialVisible: string[];
  operativeVisible: string[];
  imperialExplored: string[];
  operativeExplored: string[];
  enabled: boolean;
  visionRange: number;
}): FogOfWarState {
  return {
    imperialVisible: new Set(data.imperialVisible),
    operativeVisible: new Set(data.operativeVisible),
    imperialExplored: new Set(data.imperialExplored),
    operativeExplored: new Set(data.operativeExplored),
    enabled: data.enabled,
    visionRange: data.visionRange,
  };
}

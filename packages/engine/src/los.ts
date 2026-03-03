/**
 * Line of Sight and Cover System
 * Handles visibility checks and cover determination
 */

import type { GridCoordinate, GameMap, CoverType } from './types.js';

/**
 * Bresenham line algorithm to find all tiles along a line
 * Returns all tiles the line passes through from start to end
 *
 * @param from Starting coordinate
 * @param to Ending coordinate
 * @returns Array of all tiles the line passes through
 */
export function getLineOfSightTiles(
  from: GridCoordinate,
  to: GridCoordinate
): GridCoordinate[] {
  const tiles: GridCoordinate[] = [];

  const x0 = from.x;
  const y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    tiles.push({ x, y });

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return tiles;
}

/**
 * Check if a coordinate is within map bounds
 */
function isInBounds(coord: GridCoordinate, map: GameMap): boolean {
  return coord.x >= 0 && coord.x < map.width && coord.y >= 0 && coord.y < map.height;
}

/**
 * Check if line of sight exists between two coordinates
 * Line of sight is blocked by Wall terrain
 * Returns false if the line passes through a Wall tile (except at the endpoints)
 *
 * @param from Starting coordinate
 * @param to Ending coordinate
 * @param map The game map
 * @returns True if there is clear line of sight
 */
export function hasLineOfSight(
  from: GridCoordinate,
  to: GridCoordinate,
  map: GameMap
): boolean {
  const tiles = getLineOfSightTiles(from, to);

  // Check each tile along the line (excluding the starting tile, including the end)
  for (let i = 1; i < tiles.length; i++) {
    const tile = tiles[i];

    if (!isInBounds(tile, map)) {
      return false;
    }

    const mapTile = map.tiles[tile.y][tile.x];

    // Wall terrain blocks line of sight
    if (mapTile.terrain === 'Wall') {
      return false;
    }
  }

  return true;
}

/**
 * Determine the cover type between attacker and defender
 * Returns the best (heaviest) cover the defender has along the line of sight
 *
 * Cover is determined by checking tiles along the line for cover terrain:
 * - LightCover provides Light cover
 * - HeavyCover provides Heavy cover
 * - Full cover blocks line of sight entirely (handled separately)
 *
 * @param from Attacker position
 * @param to Defender position
 * @param map The game map
 * @returns The best cover type the defender has
 */
export function getCover(
  from: GridCoordinate,
  to: GridCoordinate,
  map: GameMap
): CoverType {
  const tiles = getLineOfSightTiles(from, to);

  let bestCover: CoverType = 'None';

  // Check tiles along the line (excluding the attacker's position, excluding the defender's position)
  for (let i = 1; i < tiles.length - 1; i++) {
    const tile = tiles[i];

    if (!isInBounds(tile, map)) {
      continue;
    }

    const mapTile = map.tiles[tile.y][tile.x];

    // Determine cover from terrain type
    if (mapTile.terrain === 'HeavyCover' || mapTile.cover === 'Heavy') {
      bestCover = 'Heavy';
    } else if (mapTile.terrain === 'LightCover' || mapTile.cover === 'Light') {
      if (bestCover === 'None') {
        bestCover = 'Light';
      }
    }
  }

  // Check the defender's own tile for cover
  if (isInBounds(to, map)) {
    const defenderTile = map.tiles[to.y][to.x];
    if (defenderTile.terrain === 'HeavyCover' || defenderTile.cover === 'Heavy') {
      bestCover = 'Heavy';
    } else if (defenderTile.terrain === 'LightCover' || defenderTile.cover === 'Light') {
      if (bestCover === 'None') {
        bestCover = 'Light';
      }
    }
  }

  return bestCover;
}

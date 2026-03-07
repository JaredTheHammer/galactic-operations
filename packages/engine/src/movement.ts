/**
 * Movement and Pathfinding System
 * Handles movement validation, pathfinding, and distance calculations
 */

import type { GridCoordinate, GameMap, Figure, GameState } from './types.js';

/**
 * Get Chebyshev distance (king's move distance) between two coordinates
 * Used for range checks in the game
 *
 * @param a First coordinate
 * @param b Second coordinate
 * @returns Chebyshev distance
 */
export function getDistance(a: GridCoordinate, b: GridCoordinate): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Get the movement cost to move from one tile to an adjacent tile
 * Returns the cost in movement points
 *
 * @param from Source coordinate
 * @param to Target coordinate (must be adjacent)
 * @param map The game map
 * @returns Movement cost (1 for Open, 2 for Difficult, Infinity for Wall/Impassable)
 */
export function getMovementCost(
  from: GridCoordinate,
  to: GridCoordinate,
  map: GameMap
): number {
  // Check bounds
  if (to.x < 0 || to.x >= map.width || to.y < 0 || to.y >= map.height) {
    return Infinity;
  }

  const tile = map.tiles[to.y][to.x];

  // Determine cost based on terrain
  switch (tile.terrain) {
    case 'Open':
      return 1;
    case 'Door':
      return 1;
    case 'Difficult':
      return 2;
    case 'Elevated':
      return 1; // Movement across elevation changes costs 1 (elevation affects combat, not movement)
    case 'LightCover':
      return 1;
    case 'HeavyCover':
      return 2; // Heavy cover costs more to move through
    case 'Wall':
      return Infinity;
    case 'Impassable':
      return Infinity;
    default:
      return Infinity;
  }
}

/**
 * Find all valid tiles a figure can move to using breadth-first search
 * Respects figure speed, terrain costs, occupied tiles, and impassable terrain
 *
 * @param figure The figure to move
 * @param gameState The current game state
 * @returns Array of valid destination coordinates
 */
export function getValidMoves(
  figure: Figure,
  gameState: GameState
): GridCoordinate[] {
  const { map, figures } = gameState;
  const baseSpeed = 4;
  const focusBonus = figure.focusBonusMove ? 2 : 0;
  const speed = figure.actionsRemaining > 0 ? baseSpeed + focusBonus : 0;

  if (speed <= 0) {
    return [];
  }

  const visited = new Set<string>();
  const validMoves: GridCoordinate[] = [];
  const queue: { coord: GridCoordinate; costRemaining: number }[] = [
    { coord: figure.position, costRemaining: speed },
  ];

  const coordKey = (c: GridCoordinate) => `${c.x},${c.y}`;

  while (queue.length > 0) {
    const { coord, costRemaining } = queue.shift()!;
    const key = coordKey(coord);

    if (visited.has(key) || costRemaining < 1) {
      continue;
    }

    visited.add(key);

    // Check all 8 adjacent tiles (or 4 if you prefer cardinal only)
    const adjacent = [
      { x: coord.x + 1, y: coord.y },
      { x: coord.x - 1, y: coord.y },
      { x: coord.x, y: coord.y + 1 },
      { x: coord.x, y: coord.y - 1 },
      { x: coord.x + 1, y: coord.y + 1 },
      { x: coord.x - 1, y: coord.y - 1 },
      { x: coord.x + 1, y: coord.y - 1 },
      { x: coord.x - 1, y: coord.y + 1 },
    ];

    for (const nextCoord of adjacent) {
      const nextKey = coordKey(nextCoord);

      // Skip if already visited
      if (visited.has(nextKey)) {
        continue;
      }

      // Get movement cost
      const cost = getMovementCost(coord, nextCoord, map);

      // Skip if impassable
      if (cost === Infinity) {
        continue;
      }

      // Check if occupied by another figure
      const occupyingFigure = figures.find(
        (f) => f.position.x === nextCoord.x && f.position.y === nextCoord.y && f.id !== figure.id
      );

      if (occupyingFigure) {
        continue;
      }

      const newCostRemaining = costRemaining - cost;

      if (newCostRemaining >= 0) {
        // This is a valid move destination
        validMoves.push(nextCoord);

        // Add to queue to explore further
        queue.push({ coord: nextCoord, costRemaining: newCostRemaining });
      }
    }
  }

  return validMoves;
}

/**
 * Find the shortest path between two coordinates using A* pathfinding
 * Respects terrain costs and figure positions
 *
 * @param from Starting coordinate
 * @param to Target coordinate
 * @param map The game map
 * @param figures Array of figures on the map
 * @returns Array of coordinates representing the path, or empty array if no path exists
 */
export function getPath(
  from: GridCoordinate,
  to: GridCoordinate,
  map: GameMap,
  figures: Figure[]
): GridCoordinate[] {
  const heuristic = (a: GridCoordinate, b: GridCoordinate) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  };

  const coordKey = (c: GridCoordinate) => `${c.x},${c.y}`;

  const openSet: GridCoordinate[] = [from];
  const cameFrom = new Map<string, GridCoordinate>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(coordKey(from), 0);
  fScore.set(coordKey(from), heuristic(from, to));

  while (openSet.length > 0) {
    // Find node with lowest fScore
    let currentIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (
        (fScore.get(coordKey(openSet[i])) ?? Infinity) <
        (fScore.get(coordKey(openSet[currentIdx])) ?? Infinity)
      ) {
        currentIdx = i;
      }
    }

    const current = openSet[currentIdx];

    if (current.x === to.x && current.y === to.y) {
      // Reconstruct path
      const path: GridCoordinate[] = [current];
      let curr = current;

      while (cameFrom.has(coordKey(curr))) {
        curr = cameFrom.get(coordKey(curr))!;
        path.unshift(curr);
      }

      return path;
    }

    openSet.splice(currentIdx, 1);

    // Check adjacent tiles
    const adjacent = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const neighbor of adjacent) {
      const cost = getMovementCost(current, neighbor, map);

      if (cost === Infinity) {
        continue;
      }

      // Check if occupied
      const occupyingFigure = figures.find(
        (f) => f.position.x === neighbor.x && f.position.y === neighbor.y
      );

      if (occupyingFigure) {
        continue;
      }

      const tentativeGScore = (gScore.get(coordKey(current)) ?? Infinity) + cost;
      const neighborKey = coordKey(neighbor);
      const currentGScore = gScore.get(neighborKey) ?? Infinity;

      if (tentativeGScore < currentGScore) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, to));

        if (!openSet.some((c) => c.x === neighbor.x && c.y === neighbor.y)) {
          openSet.push(neighbor);
        }
      }
    }
  }

  return []; // No path found
}

/**
 * Execute movement of a figure along a path
 * Updates figure position and clears tile occupation
 * Returns a new GameState with the movement applied
 *
 * @param figure The figure to move
 * @param path The path to follow
 * @param gameState The current game state
 * @returns New game state with figure moved
 */
export function moveFigure(
  figure: Figure,
  path: GridCoordinate[],
  gameState: GameState
): GameState {
  if (path.length === 0) {
    return gameState;
  }

  // Update figure position to the end of the path
  const newPosition = path[path.length - 1];

  // Bounds check: reject moves to coordinates outside the map
  const { width, height } = gameState.map;
  if (
    newPosition.x < 0 || newPosition.x >= width ||
    newPosition.y < 0 || newPosition.y >= height ||
    figure.position.x < 0 || figure.position.x >= width ||
    figure.position.y < 0 || figure.position.y >= height
  ) {
    return gameState;
  }

  // Create updated figures array
  const updatedFigures = gameState.figures.map((f) =>
    f.id === figure.id
      ? {
          ...f,
          position: newPosition,
          actionsRemaining: f.actionsRemaining - 1,
        }
      : f
  );

  // Update map tiles to reflect new occupation
  const updatedMap = {
    ...gameState.map,
    tiles: gameState.map.tiles.map((row) => [...row]),
  };

  // Clear old position
  const oldTile = updatedMap.tiles[figure.position.y][figure.position.x];
  if (oldTile.occupied === figure.id) {
    updatedMap.tiles[figure.position.y][figure.position.x] = {
      ...oldTile,
      occupied: null,
    };
  }

  // Set new position
  const newTile = updatedMap.tiles[newPosition.y][newPosition.x];
  updatedMap.tiles[newPosition.y][newPosition.x] = {
    ...newTile,
    occupied: figure.id,
  };

  return {
    ...gameState,
    figures: updatedFigures,
    map: updatedMap,
  };
}

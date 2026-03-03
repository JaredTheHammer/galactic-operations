/**
 * Map Generator
 *
 * Assembles a full GameMap from modular 12x12 board templates.
 * Each board is a self-contained terrain layout that snaps into a grid.
 *
 * Physical scale:
 *   1 cell  = 1 inch
 *   1 board = 12x12 cells = 1 foot x 1 foot
 *   Skirmish = 3x3 boards = 36x36 cells = 3' x 3'
 *   Epic     = 6x3 boards = 72x36 cells = 6' x 3'
 */

import type {
  GameMap,
  Tile,
  GridCoordinate,
  DeploymentZone,
  MapConfig,
  BoardTemplate,
} from './types.js';

import { BOARD_SIZE, computeGameScale } from './types.js';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate a complete map from a MapConfig and a set of board templates.
 *
 * @param config Map dimensions (in boards)
 * @param templates Available board templates to choose from
 * @param seed Optional seed for deterministic board selection
 */
export function generateMap(
  config: MapConfig,
  templates: BoardTemplate[],
  seed?: number
): GameMap {
  const { boardsWide, boardsTall } = config;
  const width = boardsWide * BOARD_SIZE;
  const height = boardsTall * BOARD_SIZE;

  // Simple seeded RNG (mulberry32)
  let rngState = seed ?? (Date.now() ^ 0xDEADBEEF);
  const rng = (): number => {
    rngState |= 0;
    rngState = (rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Select board templates for each grid position
  const boardGrid: BoardTemplate[][] = [];
  for (let by = 0; by < boardsTall; by++) {
    const row: BoardTemplate[] = [];
    for (let bx = 0; bx < boardsWide; bx++) {
      const template = selectBoard(templates, bx, by, boardsWide, boardsTall, rng);
      row.push(template);
    }
    boardGrid.push(row);
  }

  // Assemble the full tile grid
  const tiles = assembleMap(boardGrid, width, height);

  // Generate deployment zones on opposite ends
  const deploymentZones = generateDeploymentZones(tiles, width, height, boardsWide);

  return {
    id: `generated-${boardsWide}x${boardsTall}`,
    name: `${boardsWide * BOARD_SIZE}" x ${boardsTall * BOARD_SIZE}" Battlefield`,
    width,
    height,
    tiles,
    deploymentZones,
    boardsWide,
    boardsTall,
  };
}

// ============================================================================
// BOARD SELECTION
// ============================================================================

/**
 * Select a board template for a given grid position.
 * Uses weighted random selection with some heuristics:
 *   - Edge boards prefer open edges facing the map boundary
 *   - Center boards are fully random
 *   - Avoids placing identical boards adjacent horizontally
 */
function selectBoard(
  templates: BoardTemplate[],
  bx: number,
  by: number,
  boardsWide: number,
  boardsTall: number,
  rng: () => number
): BoardTemplate {
  if (templates.length === 0) {
    throw new Error('No board templates available');
  }
  if (templates.length === 1) {
    return templates[0];
  }

  // Weighted random: all templates start equal
  const weights = templates.map(() => 1.0);

  // Boost boards with open edges that face the map boundary
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (bx === 0 && t.edges.west === 'open') weights[i] += 0.5;
    if (bx === boardsWide - 1 && t.edges.east === 'open') weights[i] += 0.5;
    if (by === 0 && t.edges.north === 'open') weights[i] += 0.5;
    if (by === boardsTall - 1 && t.edges.south === 'open') weights[i] += 0.5;
  }

  // Pick by weighted random
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = rng() * totalWeight;
  for (let i = 0; i < templates.length; i++) {
    r -= weights[i];
    if (r <= 0) return templates[i];
  }

  return templates[templates.length - 1];
}

// ============================================================================
// MAP ASSEMBLY
// ============================================================================

/**
 * Stamp board templates into the full tile grid.
 */
function assembleMap(
  boardGrid: BoardTemplate[][],
  width: number,
  height: number
): Tile[][] {
  // Initialize empty grid
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      terrain: 'Open' as const,
      elevation: 0,
      cover: 'None' as const,
      occupied: null,
      objective: null,
    }))
  );

  // Stamp each board template
  for (let by = 0; by < boardGrid.length; by++) {
    for (let bx = 0; bx < boardGrid[by].length; bx++) {
      const board = boardGrid[by][bx];
      const offsetX = bx * BOARD_SIZE;
      const offsetY = by * BOARD_SIZE;

      for (let ly = 0; ly < BOARD_SIZE; ly++) {
        for (let lx = 0; lx < BOARD_SIZE; lx++) {
          const gx = offsetX + lx;
          const gy = offsetY + ly;
          if (gx < width && gy < height) {
            // Deep copy the tile (avoid shared references)
            const src = board.tiles[ly][lx];
            tiles[gy][gx] = {
              terrain: src.terrain as any,
              elevation: src.elevation,
              cover: src.cover as any,
              occupied: null, // Always clear occupancy for fresh map
              objective: src.objective,
            };
          }
        }
      }
    }
  }

  return tiles;
}

// ============================================================================
// DEPLOYMENT ZONES
// ============================================================================

/**
 * Generate deployment zones on opposite ends of the map.
 * Imperial deploys on the left (first 2 columns of boards),
 * Operatives deploy on the right (last 2 columns of boards).
 *
 * Only passable, unoccupied tiles are included.
 */
function generateDeploymentZones(
  tiles: Tile[][],
  width: number,
  height: number,
  boardsWide: number
): DeploymentZone {
  // Use scaled deploy depth: larger maps get proportionally deeper zones
  // to reduce the dead approach phase between deployment and first contact.
  const scale = computeGameScale({ preset: 'custom', boardsWide, boardsTall: Math.floor(height / BOARD_SIZE) });
  const deployDepth = scale.deployDepth;

  const imperial: GridCoordinate[] = [];
  const operative: GridCoordinate[] = [];

  for (let y = 0; y < height; y++) {
    // Imperial: left side
    for (let x = 0; x < deployDepth; x++) {
      if (isPassable(tiles[y][x])) {
        imperial.push({ x, y });
      }
    }
    // Operative: right side
    for (let x = width - deployDepth; x < width; x++) {
      if (isPassable(tiles[y][x])) {
        operative.push({ x, y });
      }
    }
  }

  return { imperial, operative };
}

function isPassable(tile: Tile): boolean {
  return tile.terrain !== 'Wall' && tile.terrain !== 'Impassable';
}

/**
 * Board Template Generator
 *
 * Creates 6 modular 12x12 board templates as JSON files.
 * Each board has designed terrain layouts for tactical gameplay.
 *
 * Run: npx tsx scripts/generate-boards.ts
 */

import * as fs from 'fs'
import * as path from 'path'

interface Tile {
  terrain: string
  elevation: number
  cover: string
  occupied: null
  objective: null
}

interface BoardTemplate {
  id: string
  name: string
  description: string
  width: 12
  height: 12
  tiles: Tile[][]
  /** Edge connectivity: 'open' means figures can cross, 'mixed' has some walls */
  edges: {
    north: 'open' | 'mixed'
    south: 'open' | 'mixed'
    east: 'open' | 'mixed'
    west: 'open' | 'mixed'
  }
}

const SIZE = 12

function emptyTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null }
}

function wallTile(): Tile {
  return { terrain: 'Wall', elevation: 0, cover: 'None', occupied: null, objective: null }
}

function lightCoverTile(): Tile {
  return { terrain: 'LightCover', elevation: 0, cover: 'Light', occupied: null, objective: null }
}

function heavyCoverTile(): Tile {
  return { terrain: 'HeavyCover', elevation: 0, cover: 'Heavy', occupied: null, objective: null }
}

function elevatedTile(elev: number = 1, cover: string = 'None'): Tile {
  return { terrain: 'Elevated', elevation: elev, cover, occupied: null, objective: null }
}

function difficultTile(): Tile {
  return { terrain: 'Difficult', elevation: 0, cover: 'None', occupied: null, objective: null }
}

function doorTile(): Tile {
  return { terrain: 'Door', elevation: 0, cover: 'None', occupied: null, objective: null }
}

function createGrid(): Tile[][] {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => emptyTile())
  )
}

function setTile(grid: Tile[][], x: number, y: number, tile: Tile) {
  if (y >= 0 && y < SIZE && x >= 0 && x < SIZE) {
    grid[y][x] = tile
  }
}

function setRect(grid: Tile[][], x1: number, y1: number, x2: number, y2: number, tile: () => Tile) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setTile(grid, x, y, tile())
    }
  }
}

function setWallLine(grid: Tile[][], x1: number, y1: number, x2: number, y2: number) {
  if (x1 === x2) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      setTile(grid, x1, y, wallTile())
    }
  } else if (y1 === y2) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      setTile(grid, x, y1, wallTile())
    }
  }
}

// ============================================================================
// BOARD 1: Open Ground -- scattered crates and barricades
// Good for ranged firefights with light cover options
// ============================================================================
function createOpenGround(): BoardTemplate {
  const tiles = createGrid()

  // Scattered light cover clusters (crate piles)
  setTile(tiles, 2, 2, lightCoverTile())
  setTile(tiles, 3, 2, lightCoverTile())

  setTile(tiles, 8, 3, lightCoverTile())
  setTile(tiles, 9, 3, lightCoverTile())

  setTile(tiles, 5, 5, heavyCoverTile())
  setTile(tiles, 6, 5, heavyCoverTile())
  setTile(tiles, 5, 6, heavyCoverTile())
  setTile(tiles, 6, 6, heavyCoverTile())

  setTile(tiles, 2, 8, lightCoverTile())
  setTile(tiles, 3, 9, lightCoverTile())

  setTile(tiles, 9, 8, lightCoverTile())
  setTile(tiles, 8, 9, lightCoverTile())

  // A couple of difficult terrain patches (rubble)
  setTile(tiles, 1, 5, difficultTile())
  setTile(tiles, 10, 6, difficultTile())

  return {
    id: 'open-ground',
    name: 'Open Ground',
    description: 'Scattered cover positions across open terrain. Favors ranged combat.',
    width: 12, height: 12,
    tiles,
    edges: { north: 'open', south: 'open', east: 'open', west: 'open' },
  }
}

// ============================================================================
// BOARD 2: Corridor Complex -- walls forming L-shaped hallways
// Forces close-quarters engagements with chokepoints
// ============================================================================
function createCorridor(): BoardTemplate {
  const tiles = createGrid()

  // Outer walls (with gaps for board connectivity)
  // North wall with 2 gaps
  setWallLine(tiles, 0, 0, 3, 0)
  setWallLine(tiles, 6, 0, 11, 0)

  // South wall with 2 gaps
  setWallLine(tiles, 0, 11, 5, 11)
  setWallLine(tiles, 8, 11, 11, 11)

  // Interior L-shaped wall creating a corridor
  setWallLine(tiles, 4, 2, 4, 6)     // vertical wall
  setWallLine(tiles, 4, 6, 8, 6)     // horizontal branch
  setTile(tiles, 4, 4, doorTile())    // door through the vertical wall

  // Second interior wall
  setWallLine(tiles, 7, 2, 7, 4)     // short vertical wall
  setWallLine(tiles, 3, 9, 8, 9)     // horizontal wall near south
  setTile(tiles, 6, 9, doorTile())    // door

  // Cover inside corridors
  setTile(tiles, 2, 3, lightCoverTile())
  setTile(tiles, 9, 4, lightCoverTile())
  setTile(tiles, 2, 8, heavyCoverTile())
  setTile(tiles, 10, 7, lightCoverTile())

  return {
    id: 'corridor-complex',
    name: 'Corridor Complex',
    description: 'L-shaped hallways with chokepoints and doors. Close-quarters combat.',
    width: 12, height: 12,
    tiles,
    edges: { north: 'mixed', south: 'mixed', east: 'open', west: 'open' },
  }
}

// ============================================================================
// BOARD 3: Command Center -- rooms with terminals and heavy cover
// Defensive positions with objectives
// ============================================================================
function createCommandCenter(): BoardTemplate {
  const tiles = createGrid()

  // Central room walls
  setWallLine(tiles, 3, 3, 8, 3)     // north wall of room
  setWallLine(tiles, 3, 8, 8, 8)     // south wall of room
  setWallLine(tiles, 3, 3, 3, 8)     // west wall
  setWallLine(tiles, 8, 3, 8, 8)     // east wall

  // Doors into the room
  setTile(tiles, 5, 3, doorTile())    // north door
  setTile(tiles, 6, 3, doorTile())
  setTile(tiles, 5, 8, doorTile())    // south door
  setTile(tiles, 3, 5, doorTile())    // west door
  setTile(tiles, 8, 6, doorTile())    // east door

  // Heavy cover inside the room (console banks)
  setTile(tiles, 5, 5, heavyCoverTile())
  setTile(tiles, 6, 5, heavyCoverTile())
  setTile(tiles, 5, 6, heavyCoverTile())
  setTile(tiles, 6, 6, heavyCoverTile())

  // Light cover outside the room (approach cover)
  setTile(tiles, 1, 1, lightCoverTile())
  setTile(tiles, 10, 1, lightCoverTile())
  setTile(tiles, 1, 10, lightCoverTile())
  setTile(tiles, 10, 10, lightCoverTile())

  // Elevated observation alcoves in corners
  setTile(tiles, 0, 0, elevatedTile(1, 'Light'))
  setTile(tiles, 11, 0, elevatedTile(1, 'Light'))
  setTile(tiles, 0, 11, elevatedTile(1, 'Light'))
  setTile(tiles, 11, 11, elevatedTile(1, 'Light'))

  return {
    id: 'command-center',
    name: 'Command Center',
    description: 'Fortified room with consoles. Strong defensive position.',
    width: 12, height: 12,
    tiles,
    edges: { north: 'open', south: 'open', east: 'open', west: 'open' },
  }
}

// ============================================================================
// BOARD 4: Storage Bay -- crates forming lanes and cover clusters
// Lots of cover, supports flanking maneuvers
// ============================================================================
function createStorageBay(): BoardTemplate {
  const tiles = createGrid()

  // Rows of crate stacks forming lanes
  // Lane 1 (y=2-3)
  setRect(tiles, 1, 2, 3, 3, heavyCoverTile)
  setRect(tiles, 6, 2, 8, 3, heavyCoverTile)

  // Lane 2 (y=5-6) offset
  setRect(tiles, 3, 5, 5, 6, heavyCoverTile)
  setRect(tiles, 8, 5, 10, 6, heavyCoverTile)

  // Lane 3 (y=8-9)
  setRect(tiles, 1, 8, 3, 9, heavyCoverTile)
  setRect(tiles, 6, 8, 8, 9, heavyCoverTile)

  // Elevated platform in center (loading dock)
  setTile(tiles, 5, 4, elevatedTile(1))
  setTile(tiles, 6, 4, elevatedTile(1))
  setTile(tiles, 5, 7, elevatedTile(1))
  setTile(tiles, 6, 7, elevatedTile(1))

  // Scattered single crates for additional cover
  setTile(tiles, 10, 1, lightCoverTile())
  setTile(tiles, 1, 10, lightCoverTile())
  setTile(tiles, 11, 10, lightCoverTile())

  return {
    id: 'storage-bay',
    name: 'Storage Bay',
    description: 'Crate-filled warehouse with lanes and flanking routes.',
    width: 12, height: 12,
    tiles,
    edges: { north: 'open', south: 'open', east: 'open', west: 'open' },
  }
}

// ============================================================================
// BOARD 5: Landing Pad -- open center with walled perimeter
// Dangerous crossing with cover on the edges
// ============================================================================
function createLandingPad(): BoardTemplate {
  const tiles = createGrid()

  // Perimeter walls with gaps
  // North wall
  setWallLine(tiles, 0, 2, 4, 2)
  setWallLine(tiles, 7, 2, 11, 2)

  // South wall
  setWallLine(tiles, 0, 9, 4, 9)
  setWallLine(tiles, 7, 9, 11, 9)

  // West wall segments
  setWallLine(tiles, 2, 0, 2, 1)
  setWallLine(tiles, 2, 10, 2, 11)

  // East wall segments
  setWallLine(tiles, 9, 0, 9, 1)
  setWallLine(tiles, 9, 10, 9, 11)

  // Open pad center is all open (default)

  // Elevated rim (control towers at corners of the pad)
  setTile(tiles, 3, 3, elevatedTile(2, 'Light'))
  setTile(tiles, 8, 3, elevatedTile(2, 'Light'))
  setTile(tiles, 3, 8, elevatedTile(2, 'Light'))
  setTile(tiles, 8, 8, elevatedTile(2, 'Light'))

  // Light cover near the gaps (fuel tanks, pylons)
  setTile(tiles, 5, 2, lightCoverTile())
  setTile(tiles, 6, 2, lightCoverTile())
  setTile(tiles, 5, 9, lightCoverTile())
  setTile(tiles, 6, 9, lightCoverTile())

  // Difficult terrain on the pad surface (scorched ground)
  setTile(tiles, 5, 5, difficultTile())
  setTile(tiles, 6, 5, difficultTile())
  setTile(tiles, 5, 6, difficultTile())
  setTile(tiles, 6, 6, difficultTile())

  return {
    id: 'landing-pad',
    name: 'Landing Pad',
    description: 'Open pad with walled perimeter. Dangerous to cross, strong sniper positions.',
    width: 12, height: 12,
    tiles,
    edges: { north: 'open', south: 'open', east: 'open', west: 'open' },
  }
}

// ============================================================================
// BOARD 6: Barracks -- small rooms with doors and mixed cover
// Lots of LOS-blocking, room-to-room fighting
// ============================================================================
function createBarracks(): BoardTemplate {
  const tiles = createGrid()

  // 4 rooms (2x2 grid of rooms) with a central hallway

  // Central cross hallway (vertical and horizontal)
  // (leave rows 5-6 and columns 5-6 open as hallway)

  // Top-left room walls
  setWallLine(tiles, 0, 4, 4, 4)
  setWallLine(tiles, 4, 0, 4, 4)
  setTile(tiles, 2, 4, doorTile())    // south door
  setTile(tiles, 4, 2, doorTile())    // east door

  // Top-right room walls
  setWallLine(tiles, 7, 0, 7, 4)
  setWallLine(tiles, 7, 4, 11, 4)
  setTile(tiles, 7, 2, doorTile())    // west door
  setTile(tiles, 9, 4, doorTile())    // south door

  // Bottom-left room walls
  setWallLine(tiles, 0, 7, 4, 7)
  setWallLine(tiles, 4, 7, 4, 11)
  setTile(tiles, 2, 7, doorTile())    // north door
  setTile(tiles, 4, 9, doorTile())    // east door

  // Bottom-right room walls
  setWallLine(tiles, 7, 7, 11, 7)
  setWallLine(tiles, 7, 7, 7, 11)
  setTile(tiles, 7, 9, doorTile())    // west door
  setTile(tiles, 9, 7, doorTile())    // north door

  // Cover inside rooms
  setTile(tiles, 1, 1, lightCoverTile())   // TL room
  setTile(tiles, 2, 2, heavyCoverTile())
  setTile(tiles, 9, 1, lightCoverTile())   // TR room
  setTile(tiles, 10, 2, heavyCoverTile())
  setTile(tiles, 1, 9, lightCoverTile())   // BL room
  setTile(tiles, 2, 10, heavyCoverTile())
  setTile(tiles, 9, 9, lightCoverTile())   // BR room
  setTile(tiles, 10, 10, heavyCoverTile())

  // Hallway cover
  setTile(tiles, 5, 3, lightCoverTile())
  setTile(tiles, 6, 8, lightCoverTile())
  setTile(tiles, 3, 5, lightCoverTile())
  setTile(tiles, 8, 6, lightCoverTile())

  return {
    id: 'barracks',
    name: 'Barracks',
    description: 'Four rooms connected by a central hallway. Room-to-room fighting.',
    width: 12, height: 12,
    tiles,
    edges: { north: 'open', south: 'open', east: 'open', west: 'open' },
  }
}

// ============================================================================
// WRITE ALL BOARDS
// ============================================================================

const boards = [
  createOpenGround(),
  createCorridor(),
  createCommandCenter(),
  createStorageBay(),
  createLandingPad(),
  createBarracks(),
]

const outDir = path.resolve(__dirname, '..', 'data', 'boards')
fs.mkdirSync(outDir, { recursive: true })

for (const board of boards) {
  const filePath = path.join(outDir, `${board.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(board, null, 2))
  console.log(`Wrote ${filePath}`)
}

// Also write an index file listing all available boards
const index = boards.map(b => ({ id: b.id, name: b.name, description: b.description, edges: b.edges }))
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2))
console.log(`Wrote board index (${boards.length} boards)`)

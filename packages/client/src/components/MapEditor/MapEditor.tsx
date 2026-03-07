/**
 * MapEditor - Visual board creation tool.
 * Paint terrain tiles, place cover/objectives/spawn zones,
 * and export to JSON board format for custom scenarios.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

type TerrainType = 'Open' | 'Wall' | 'LightCover' | 'HeavyCover' | 'Difficult' | 'Elevated' | 'Door' | 'Impassable'
type CoverType = 'None' | 'Light' | 'Heavy'
type EdgeType = 'open' | 'mixed'

interface Tile {
  terrain: TerrainType
  elevation: number
  cover: CoverType
  occupied: null
  objective: null
}

interface BoardTemplate {
  id: string
  name: string
  description: string
  width: number
  height: number
  tiles: Tile[][]
  edges: { north: EdgeType; south: EdgeType; east: EdgeType; west: EdgeType }
}

type ToolMode = 'paint' | 'fill' | 'eyedrop'

// ============================================================================
// CONSTANTS
// ============================================================================

const BOARD_SIZE = 12
const CELL_SIZE = 40

const TERRAIN_PALETTE: { type: TerrainType; label: string; color: string; key: string }[] = [
  { type: 'Open',       label: 'Open',       color: '#1a1a2e', key: '1' },
  { type: 'Wall',       label: 'Wall',       color: '#333355', key: '2' },
  { type: 'LightCover', label: 'Light Cover', color: '#2a2a1e', key: '3' },
  { type: 'HeavyCover', label: 'Heavy Cover', color: '#3a2a1e', key: '4' },
  { type: 'Difficult',  label: 'Difficult',  color: '#2a2a1e', key: '5' },
  { type: 'Elevated',   label: 'Elevated',   color: '#2a2a3e', key: '6' },
  { type: 'Door',       label: 'Door',       color: '#2a2a4e', key: '7' },
  { type: 'Impassable', label: 'Impassable', color: '#0a0a0a', key: '8' },
]

function terrainToCover(t: TerrainType): CoverType {
  if (t === 'LightCover') return 'Light'
  if (t === 'HeavyCover') return 'Heavy'
  return 'None'
}

function createEmptyBoard(): BoardTemplate {
  const tiles: Tile[][] = []
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row: Tile[] = []
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push({ terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null })
    }
    tiles.push(row)
  }
  return {
    id: 'custom-board',
    name: 'Custom Board',
    description: 'A custom-designed board.',
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    tiles,
    edges: { north: 'open', south: 'open', east: 'open', west: 'open' },
  }
}

function cloneBoard(board: BoardTemplate): BoardTemplate {
  return {
    ...board,
    tiles: board.tiles.map(row => row.map(t => ({ ...t }))),
    edges: { ...board.edges },
  }
}

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#c0c0c0',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderBottom: '1px solid #2a2a3f',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
}

const sidebarStyle: React.CSSProperties = {
  width: '240px',
  borderRight: '1px solid #2a2a3f',
  padding: '12px',
  overflowY: 'auto',
  flexShrink: 0,
}

const canvasAreaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
  padding: '16px',
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #333355',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  letterSpacing: '0.5px',
  backgroundColor: '#2a2a3a',
  color: '#bb99ff',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  marginBottom: '6px',
  marginTop: '12px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  backgroundColor: '#131320',
  border: '1px solid #333355',
  borderRadius: '4px',
  color: '#c0c0c0',
  fontSize: '12px',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  boxSizing: 'border-box',
}

// ============================================================================
// CANVAS RENDERER
// ============================================================================

function renderBoard(ctx: CanvasRenderingContext2D, board: BoardTemplate, hoveredTile: { x: number; y: number } | null) {
  const w = board.width * CELL_SIZE
  const h = board.height * CELL_SIZE
  ctx.clearRect(0, 0, w, h)

  // Draw tiles
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const tile = board.tiles[y][x]
      const px = x * CELL_SIZE
      const py = y * CELL_SIZE

      // Background
      const paletteEntry = TERRAIN_PALETTE.find(p => p.type === tile.terrain)
      ctx.fillStyle = paletteEntry?.color ?? '#1a1a2e'
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE)

      // Cover markers
      if (tile.terrain === 'LightCover') {
        ctx.fillStyle = '#cccc44'
        ctx.fillRect(px + CELL_SIZE / 2 - 3, py + CELL_SIZE / 2 - 3, 6, 6)
      } else if (tile.terrain === 'HeavyCover') {
        ctx.fillStyle = '#ff9944'
        ctx.save()
        ctx.translate(px + CELL_SIZE / 2, py + CELL_SIZE / 2)
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-5, -5, 10, 10)
        ctx.restore()
      }

      // Elevation number
      if (tile.terrain === 'Elevated' && tile.elevation > 0) {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(tile.elevation), px + CELL_SIZE / 2, py + CELL_SIZE / 2)
      }

      // Door marker
      if (tile.terrain === 'Door') {
        ctx.strokeStyle = '#6688cc'
        ctx.lineWidth = 2
        ctx.strokeRect(px + 4, py + CELL_SIZE / 2 - 1, CELL_SIZE - 8, 2)
      }

      // Grid line
      ctx.strokeStyle = 'rgba(60, 60, 100, 0.4)'
      ctx.lineWidth = 0.5
      ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE)
    }
  }

  // Hover highlight
  if (hoveredTile && hoveredTile.x >= 0 && hoveredTile.x < board.width && hoveredTile.y >= 0 && hoveredTile.y < board.height) {
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2
    ctx.strokeRect(hoveredTile.x * CELL_SIZE + 1, hoveredTile.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2)
  }
}

// ============================================================================
// FLOOD FILL
// ============================================================================

function floodFill(board: BoardTemplate, startX: number, startY: number, newTerrain: TerrainType): BoardTemplate {
  const target = board.tiles[startY][startX].terrain
  if (target === newTerrain) return board
  const result = cloneBoard(board)
  const stack: [number, number][] = [[startX, startY]]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const [x, y] = stack.pop()!
    const key = `${x},${y}`
    if (visited.has(key)) continue
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) continue
    if (result.tiles[y][x].terrain !== target) continue
    visited.add(key)
    result.tiles[y][x] = { ...result.tiles[y][x], terrain: newTerrain, cover: terrainToCover(newTerrain) }
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1])
  }
  return result
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MapEditorProps {
  onClose: () => void
}

export default function MapEditor({ onClose }: MapEditorProps) {
  const [board, setBoard] = useState<BoardTemplate>(createEmptyBoard)
  const [selectedTerrain, setSelectedTerrain] = useState<TerrainType>('Wall')
  const [toolMode, setToolMode] = useState<ToolMode>('paint')
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)
  const [isPainting, setIsPainting] = useState(false)
  const [boardName, setBoardName] = useState('Custom Board')
  const [boardId, setBoardId] = useState('custom-board')
  const [boardDesc, setBoardDesc] = useState('A custom-designed board.')
  const [elevationValue, setElevationValue] = useState(1)
  const [undoStack, setUndoStack] = useState<BoardTemplate[]>([])
  const [statusMsg, setStatusMsg] = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Redraw on any change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderBoard(ctx, board, hoveredTile)
  }, [board, hoveredTile])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Number keys for terrain selection
      const match = TERRAIN_PALETTE.find(p => p.key === e.key)
      if (match) {
        setSelectedTerrain(match.type)
        return
      }
      // Tool shortcuts
      if (e.key === 'b') setToolMode('paint')
      if (e.key === 'g') setToolMode('fill')
      if (e.key === 'i') setToolMode('eyedrop')
      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undoStack])

  const pushUndo = useCallback((prev: BoardTemplate) => {
    setUndoStack(stack => [...stack.slice(-19), prev])
  }, [])

  const handleUndo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack
      const prev = stack[stack.length - 1]
      setBoard(prev)
      return stack.slice(0, -1)
    })
  }, [])

  const applyTerrain = useCallback((x: number, y: number) => {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return
    if (toolMode === 'eyedrop') {
      setSelectedTerrain(board.tiles[y][x].terrain)
      return
    }
    if (toolMode === 'fill') {
      pushUndo(board)
      setBoard(floodFill(board, x, y, selectedTerrain))
      return
    }
    // Paint mode
    const current = board.tiles[y][x]
    if (current.terrain === selectedTerrain && selectedTerrain !== 'Elevated') return
    pushUndo(board)
    const newBoard = cloneBoard(board)
    newBoard.tiles[y][x] = {
      ...current,
      terrain: selectedTerrain,
      cover: terrainToCover(selectedTerrain),
      elevation: selectedTerrain === 'Elevated' ? elevationValue : 0,
    }
    setBoard(newBoard)
  }, [board, selectedTerrain, toolMode, elevationValue, pushUndo])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE)
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE)
    setIsPainting(true)
    applyTerrain(x, y)
  }, [applyTerrain])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE)
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE)
    setHoveredTile({ x, y })
    if (isPainting && toolMode === 'paint') {
      applyTerrain(x, y)
    }
  }, [isPainting, toolMode, applyTerrain])

  const handleCanvasMouseUp = useCallback(() => {
    setIsPainting(false)
  }, [])

  const handleCanvasMouseLeave = useCallback(() => {
    setIsPainting(false)
    setHoveredTile(null)
  }, [])

  // ---- Export ----
  const handleExport = useCallback(() => {
    const exportBoard: BoardTemplate = {
      ...board,
      id: boardId,
      name: boardName,
      description: boardDesc,
    }
    const json = JSON.stringify(exportBoard, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${boardId}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Exported!')
  }, [board, boardId, boardName, boardDesc])

  // ---- Import ----
  const importRef = useRef<HTMLInputElement>(null)
  const handleImport = useCallback(() => {
    importRef.current?.click()
  }, [])

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as BoardTemplate
        if (!data.tiles || !Array.isArray(data.tiles)) throw new Error('Invalid board: missing tiles array')
        if (!Array.isArray(data.tiles[0])) throw new Error('Invalid board: tiles must be a 2D array')
        if (typeof data.width !== 'number' || typeof data.height !== 'number') throw new Error('Invalid board: missing width/height')
        if (data.width < 1 || data.width > 100 || data.height < 1 || data.height > 100) throw new Error('Invalid board: dimensions out of range')
        if (data.tiles.length !== data.height) throw new Error('Invalid board: tiles row count does not match height')
        pushUndo(board)
        setBoard(data)
        setBoardName(data.name ?? 'Imported Board')
        setBoardId(data.id ?? 'imported-board')
        setBoardDesc(data.description ?? '')
        flash('Imported!')
      } catch (err) {
        flash('Import failed: invalid JSON')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [board, pushUndo])

  // ---- Clear ----
  const handleClear = useCallback(() => {
    pushUndo(board)
    setBoard(createEmptyBoard())
    flash('Cleared')
  }, [board, pushUndo])

  // ---- Edge toggle ----
  const toggleEdge = useCallback((edge: 'north' | 'south' | 'east' | 'west') => {
    setBoard(prev => ({
      ...prev,
      edges: { ...prev.edges, [edge]: prev.edges[edge] === 'open' ? 'mixed' : 'open' },
    }))
  }, [])

  const flash = (msg: string) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 2000)
  }

  // ---- Tile info ----
  const tileInfo = hoveredTile && hoveredTile.x >= 0 && hoveredTile.x < BOARD_SIZE && hoveredTile.y >= 0 && hoveredTile.y < BOARD_SIZE
    ? board.tiles[hoveredTile.y][hoveredTile.x]
    : null

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#4a9eff', margin: 0, fontSize: '18px' }}>Map Editor</h1>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>
            {boardName} ({BOARD_SIZE}x{BOARD_SIZE})
            {hoveredTile ? ` | Tile: ${hoveredTile.x},${hoveredTile.y}` : ''}
            {tileInfo ? ` | ${tileInfo.terrain}` : ''}
            {statusMsg ? ` | ${statusMsg}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btnStyle} onClick={handleExport}>EXPORT JSON</button>
          <button style={btnStyle} onClick={handleImport}>IMPORT</button>
          <button style={{ ...btnStyle, backgroundColor: '#3a2a2a', color: '#ff6644' }} onClick={onClose}>CLOSE</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      </div>

      <div style={bodyStyle}>
        {/* Sidebar */}
        <div style={sidebarStyle}>
          {/* Board Properties */}
          <div style={sectionLabelStyle}>Board Info</div>
          <input style={inputStyle} value={boardName} onChange={e => setBoardName(e.target.value)} placeholder="Board name" />
          <input style={{ ...inputStyle, marginTop: '4px' }} value={boardId} onChange={e => setBoardId(e.target.value)} placeholder="board-id" />
          <textarea
            style={{ ...inputStyle, marginTop: '4px', resize: 'vertical', height: '48px' }}
            value={boardDesc}
            onChange={e => setBoardDesc(e.target.value)}
            placeholder="Description..."
          />

          {/* Tools */}
          <div style={sectionLabelStyle}>Tool</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['paint', 'fill', 'eyedrop'] as ToolMode[]).map(mode => (
              <button
                key={mode}
                style={{
                  ...btnStyle,
                  flex: 1,
                  fontSize: '10px',
                  padding: '6px 4px',
                  backgroundColor: toolMode === mode ? '#4a9eff' : '#1a1a2f',
                  color: toolMode === mode ? '#fff' : '#888',
                  border: toolMode === mode ? '1px solid #4a9eff' : '1px solid #333355',
                }}
                onClick={() => setToolMode(mode)}
              >
                {mode === 'paint' ? 'Brush (B)' : mode === 'fill' ? 'Fill (G)' : 'Pick (I)'}
              </button>
            ))}
          </div>

          {/* Terrain Palette */}
          <div style={sectionLabelStyle}>Terrain</div>
          {TERRAIN_PALETTE.map(p => (
            <button
              key={p.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 8px',
                marginBottom: '2px',
                border: selectedTerrain === p.type ? '2px solid #4a9eff' : '1px solid #333355',
                borderRadius: '3px',
                backgroundColor: selectedTerrain === p.type ? '#1a2a3a' : '#0d0d18',
                color: selectedTerrain === p.type ? '#4a9eff' : '#888',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: "'Segoe UI', sans-serif",
                textAlign: 'left',
              }}
              onClick={() => setSelectedTerrain(p.type)}
            >
              <div style={{ width: '16px', height: '16px', backgroundColor: p.color, border: '1px solid #555', borderRadius: '2px', flexShrink: 0 }} />
              <span>{p.label}</span>
              <span style={{ marginLeft: 'auto', color: '#555', fontSize: '10px' }}>[{p.key}]</span>
            </button>
          ))}

          {/* Elevation slider */}
          {selectedTerrain === 'Elevated' && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Elevation: {elevationValue}</div>
              <input
                type="range"
                min={1}
                max={3}
                value={elevationValue}
                onChange={e => setElevationValue(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Edge Connectivity */}
          <div style={sectionLabelStyle}>Edge Connectivity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {(['north', 'south', 'east', 'west'] as const).map(edge => (
              <button
                key={edge}
                style={{
                  ...btnStyle,
                  fontSize: '10px',
                  padding: '4px',
                  backgroundColor: board.edges[edge] === 'open' ? '#2a4a2a' : '#3a2a2a',
                  color: board.edges[edge] === 'open' ? '#44ff44' : '#ff6644',
                }}
                onClick={() => toggleEdge(edge)}
              >
                {edge[0].toUpperCase()}: {board.edges[edge]}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={sectionLabelStyle}>Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button style={btnStyle} onClick={handleUndo}>Undo (Ctrl+Z)</button>
            <button style={{ ...btnStyle, backgroundColor: '#3a2a2a', color: '#ff6644' }} onClick={handleClear}>Clear Board</button>
          </div>

          {/* Keyboard shortcuts reference */}
          <div style={sectionLabelStyle}>Shortcuts</div>
          <div style={{ fontSize: '10px', color: '#555', lineHeight: '1.6' }}>
            1-8: Select terrain<br />
            B: Brush tool<br />
            G: Fill tool<br />
            I: Eyedropper<br />
            Ctrl+Z: Undo<br />
            Click+Drag: Paint tiles
          </div>
        </div>

        {/* Canvas */}
        <div style={canvasAreaStyle}>
          <canvas
            ref={canvasRef}
            width={BOARD_SIZE * CELL_SIZE}
            height={BOARD_SIZE * CELL_SIZE}
            style={{
              border: '2px solid #333355',
              borderRadius: '4px',
              cursor: toolMode === 'eyedrop' ? 'crosshair' : toolMode === 'fill' ? 'cell' : 'pointer',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
          />
        </div>
      </div>
    </div>
  )
}

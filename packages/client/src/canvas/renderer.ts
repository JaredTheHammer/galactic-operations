import type { GameState, GridCoordinate, Figure, ObjectivePoint, BaseSize, Side } from '@engine/types.js'
import { BOARD_SIZE } from '@engine/types.js'
import { getTileVisibility, isFigureVisible } from '@engine/fog-of-war.js'
import { getNPCKeywordValue } from '@engine/keywords.js'
import type { SilhouetteType } from '../types/portrait'
import { drawSilhouetteOnContext, inferSilhouetteType } from './silhouettes'
import type { AnimationManager } from './animation-manager'

export const TILE_SIZE = 56
const GRID_COLOR = '#1a2a4a'
const BOARD_BOUNDARY_COLOR = '#4a9eff'
const DEPLOY_IMPERIAL_COLOR = 'rgba(255, 68, 68, 0.06)'
const DEPLOY_OPERATIVE_COLOR = 'rgba(68, 255, 68, 0.06)'
const OPEN_TERRAIN = '#1a1a2e'
const WALL_TERRAIN = '#2a2a44'
const COVER_LIGHT = '#1e2a1e'
const COVER_HEAVY = '#1e331e'
const DIFFICULT_TERRAIN = '#2e2a18'
const ELEVATED_TERRAIN = '#242038'
const DOOR_TERRAIN = '#2a2a4e'
const IMPASSABLE_TERRAIN = '#0a0a0a'

const IMPERIAL_COLOR = '#ff4444'
const IMPERIAL_ELITE_COLOR = '#cc2222'
const OPERATIVE_COLOR = '#44ff44'
const OPERATIVE_HERO_COLOR = '#22ff22'

const VALID_MOVE_OVERLAY = '#4a9eff'
const VALID_TARGET_OVERLAY = '#ff4444'
const SELECTED_GLOW = '#ffd700'
const HOVER_OUTLINE = '#ffffff'
const ACTIVATED_DIM_ALPHA = 0.35
const NAME_LABEL_COLOR = '#e0e0e0'
const STRAIN_BAR_COLOR = '#6699ff'

interface UIState {
  selectedFigureId: string | null
  validMoves: GridCoordinate[]
  validTargets: string[]
  highlightedTile: GridCoordinate | null
  currentActivatingId: string | null
  aiMovePath: GridCoordinate[] | null
  aiAttackTarget: { from: GridCoordinate; to: GridCoordinate } | null
  attackRange: { center: GridCoordinate; radius: number } | null
  playerMovePath: GridCoordinate[] | null
  playerMovePathCost: number | null
  movePreviewTargets: string[] | null
  threateningEnemies: string[]
  playerSide: Side
}

// ============================================================================
// Token size mapping for base sizes
// ============================================================================

/** Map base size to tile footprint (widthInTiles) and visual radius multiplier. */
function getBaseSizeMetrics(baseSize?: BaseSize): { footprint: number; radiusMult: number } {
  switch (baseSize) {
    case 'small':    return { footprint: 1, radiusMult: 0.75 }
    case 'heavy':    return { footprint: 1, radiusMult: 1.15 }
    case 'large':    return { footprint: 2, radiusMult: 1.8 }
    case 'extended': return { footprint: 2, radiusMult: 2.2 }
    case 'huge':     return { footprint: 3, radiusMult: 2.8 }
    case 'massive':  return { footprint: 4, radiusMult: 3.5 }
    case 'colossal': return { footprint: 5, radiusMult: 4.2 }
    case 'standard':
    default:         return { footprint: 1, radiusMult: 1.0 }
  }
}

// ============================================================================
// Renderer
// ============================================================================

export class TacticalGridRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private offscreenLayers: Map<string, OffscreenCanvas> = new Map()
  private cameraX: number = 0
  private cameraY: number = 0
  private zoom: number = 1.0

  /**
   * Portrait bitmaps keyed by portrait ID (SHA-256 hash).
   * Populated by the React wrapper from the portrait store's cache.
   */
  private portraitBitmaps: Map<string, ImageBitmap> = new Map()

  /**
   * Push resolved portrait bitmaps into the renderer.
   * Called by TacticalGrid.tsx each frame with cached ImageBitmaps.
   */
  setPortraitBitmaps(bitmaps: Map<string, ImageBitmap>): void {
    this.portraitBitmaps = bitmaps
  }

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    if (!this.ctx) {
      throw new Error('Could not get 2D context from canvas')
    }

    // Initialize offscreen canvas layers
    this.offscreenLayers.set('terrain', new OffscreenCanvas(canvas.width, canvas.height))
    this.offscreenLayers.set('grid', new OffscreenCanvas(canvas.width, canvas.height))
    this.offscreenLayers.set('highlights', new OffscreenCanvas(canvas.width, canvas.height))
    this.offscreenLayers.set('figures', new OffscreenCanvas(canvas.width, canvas.height))
    this.offscreenLayers.set('effects', new OffscreenCanvas(canvas.width, canvas.height))

    // Default center; will be overridden by camera.fitToMap
    this.centerOn({ x: 5, y: 5 })
  }

  private animationManager: AnimationManager | null = null

  setAnimationManager(manager: AnimationManager): void {
    this.animationManager = manager
  }

  render(gameState: GameState, uiState: UIState) {
    if (!this.ctx || !this.canvas) return

    // Clear canvas
    this.ctx.fillStyle = '#0a0a0f'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Save context state
    this.ctx.save()

    // Apply camera transform with screen shake offset
    const shakeX = this.animationManager?.shakeOffsetX ?? 0
    const shakeY = this.animationManager?.shakeOffsetY ?? 0
    this.ctx.translate(
      this.canvas.width / 2 - this.cameraX * this.zoom + shakeX,
      this.canvas.height / 2 - this.cameraY * this.zoom + shakeY
    )
    this.ctx.scale(this.zoom, this.zoom)

    // Draw terrain (includes fog-of-war overlay)
    this.drawTerrain(gameState, uiState)

    // Draw deployment zone shading
    this.drawDeploymentZones(gameState)

    // Draw grid
    this.drawGrid(gameState)

    // Draw board boundaries (modular board edges)
    this.drawBoardBoundaries(gameState)

    // Draw highlights
    this.drawHighlights(gameState, uiState)

    // Draw enhanced objective markers (over highlights, under figures)
    this.drawObjectives(gameState)

    // Draw loot tokens (over highlights, under figures)
    this.drawLootTokens(gameState)

    // Draw figures
    this.drawFigures(gameState, uiState)

    // Draw effects (animations, status, etc)
    this.drawEffects(gameState, uiState)

    // Draw combat animations (projectiles, damage numbers, particles)
    if (this.animationManager) {
      this.animationManager.drawAnimations(this.ctx)
    }

    this.ctx.restore()
  }

  private drawTerrain(gameState: GameState, uiState: UIState) {
    if (!this.ctx) return

    const { map } = gameState

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x]
        const screenX = x * TILE_SIZE
        const screenY = y * TILE_SIZE

        // Determine color based on terrain type
        let color = OPEN_TERRAIN
        switch (tile.terrain) {
          case 'Wall':
            color = WALL_TERRAIN
            break
          case 'LightCover':
            color = COVER_LIGHT
            break
          case 'HeavyCover':
            color = COVER_HEAVY
            break
          case 'Difficult':
            color = DIFFICULT_TERRAIN
            break
          case 'Elevated':
            color = ELEVATED_TERRAIN
            break
          case 'Door':
            color = DOOR_TERRAIN
            break
          case 'Impassable':
            color = IMPASSABLE_TERRAIN
            break
          default:
            color = OPEN_TERRAIN
        }

        this.ctx.fillStyle = color
        this.ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)

        // Terrain-specific visual patterns
        if (tile.terrain === 'LightCover') {
          // Diagonal hash lines + corner marker
          this.ctx.strokeStyle = 'rgba(180, 200, 80, 0.15)'
          this.ctx.lineWidth = 1
          for (let d = -TILE_SIZE; d < TILE_SIZE * 2; d += 12) {
            this.ctx.beginPath()
            this.ctx.moveTo(screenX + d, screenY)
            this.ctx.lineTo(screenX + d + TILE_SIZE, screenY + TILE_SIZE)
            this.ctx.stroke()
          }
          // Corner shield marker
          this.ctx.fillStyle = 'rgba(220, 220, 80, 0.5)'
          this.ctx.fillRect(screenX + 2, screenY + 2, 6, 6)
        } else if (tile.terrain === 'HeavyCover') {
          // Cross-hatch pattern + larger corner marker
          this.ctx.strokeStyle = 'rgba(100, 200, 100, 0.18)'
          this.ctx.lineWidth = 1
          for (let d = -TILE_SIZE; d < TILE_SIZE * 2; d += 10) {
            this.ctx.beginPath()
            this.ctx.moveTo(screenX + d, screenY)
            this.ctx.lineTo(screenX + d + TILE_SIZE, screenY + TILE_SIZE)
            this.ctx.stroke()
            this.ctx.beginPath()
            this.ctx.moveTo(screenX + d + TILE_SIZE, screenY)
            this.ctx.lineTo(screenX + d, screenY + TILE_SIZE)
            this.ctx.stroke()
          }
          // Corner shield marker (orange diamond)
          const cx = screenX + 7
          const cy = screenY + 7
          this.ctx.fillStyle = 'rgba(255, 160, 40, 0.7)'
          this.ctx.beginPath()
          this.ctx.moveTo(cx, cy - 5)
          this.ctx.lineTo(cx + 5, cy)
          this.ctx.lineTo(cx, cy + 5)
          this.ctx.lineTo(cx - 5, cy)
          this.ctx.closePath()
          this.ctx.fill()
        } else if (tile.terrain === 'Wall') {
          // Brick-like pattern
          this.ctx.strokeStyle = 'rgba(100, 100, 160, 0.25)'
          this.ctx.lineWidth = 1
          const bw = TILE_SIZE / 3
          const bh = TILE_SIZE / 2
          for (let by = 0; by < 2; by++) {
            const offsetX = by % 2 === 0 ? 0 : bw / 2
            for (let bx = 0; bx < 4; bx++) {
              this.ctx.strokeRect(screenX + bx * bw + offsetX, screenY + by * bh, bw, bh)
            }
          }
        } else if (tile.terrain === 'Difficult') {
          // Scattered dots pattern
          this.ctx.fillStyle = 'rgba(200, 180, 80, 0.2)'
          const offsets = [[8, 12], [22, 8], [38, 18], [14, 38], [32, 34], [46, 44]]
          for (const [dx, dy] of offsets) {
            this.ctx.beginPath()
            this.ctx.arc(screenX + dx, screenY + dy, 2, 0, Math.PI * 2)
            this.ctx.fill()
          }
        } else if (tile.terrain === 'Elevated') {
          // Upward chevron pattern
          this.ctx.strokeStyle = 'rgba(140, 120, 200, 0.2)'
          this.ctx.lineWidth = 1
          const cx = screenX + TILE_SIZE / 2
          this.ctx.beginPath()
          this.ctx.moveTo(cx - 10, screenY + TILE_SIZE - 8)
          this.ctx.lineTo(cx, screenY + TILE_SIZE - 16)
          this.ctx.lineTo(cx + 10, screenY + TILE_SIZE - 8)
          this.ctx.stroke()
        } else if (tile.terrain === 'Impassable') {
          // X pattern
          this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.15)'
          this.ctx.lineWidth = 1.5
          this.ctx.beginPath()
          this.ctx.moveTo(screenX + 4, screenY + 4)
          this.ctx.lineTo(screenX + TILE_SIZE - 4, screenY + TILE_SIZE - 4)
          this.ctx.stroke()
          this.ctx.beginPath()
          this.ctx.moveTo(screenX + TILE_SIZE - 4, screenY + 4)
          this.ctx.lineTo(screenX + 4, screenY + TILE_SIZE - 4)
          this.ctx.stroke()
        }

        // Also render tile.cover when it differs from terrain type
        if (tile.cover === 'Light' && tile.terrain !== 'LightCover') {
          this.ctx.fillStyle = 'rgba(220, 220, 80, 0.4)'
          this.ctx.fillRect(screenX + 2, screenY + 2, 5, 5)
        } else if (tile.cover === 'Heavy' && tile.terrain !== 'HeavyCover') {
          this.ctx.fillStyle = 'rgba(255, 160, 40, 0.6)'
          const cx = screenX + 6
          const cy = screenY + 6
          this.ctx.beginPath()
          this.ctx.moveTo(cx, cy - 4)
          this.ctx.lineTo(cx + 4, cy)
          this.ctx.lineTo(cx, cy + 4)
          this.ctx.lineTo(cx - 4, cy)
          this.ctx.closePath()
          this.ctx.fill()
        }

        // Draw elevation number
        if (tile.elevation > 0) {
          this.ctx.fillStyle = 'rgba(180, 160, 255, 0.7)'
          this.ctx.font = 'bold 10px monospace'
          this.ctx.fillText(`E${tile.elevation}`, screenX + TILE_SIZE - 22, screenY + 12)
        }

        // Draw objectives (legacy fallback -- enhanced objectives drawn in drawObjectives)
        if (tile.objective && (!gameState.objectivePoints || gameState.objectivePoints.length === 0)) {
          this.ctx.fillStyle = '#ffd700'
          const size = 8
          this.ctx.beginPath()
          this.ctx.moveTo(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2 - size)
          for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
            const x = screenX + TILE_SIZE / 2 + size * Math.cos(angle)
            const y = screenY + TILE_SIZE / 2 + size * Math.sin(angle)
            if (i === 0) this.ctx.moveTo(x, y)
            else this.ctx.lineTo(x, y)
          }
          this.ctx.closePath()
          this.ctx.fill()
        }
      }
    }

    // --- Fog of war overlay ---
    if (gameState.fogOfWar?.enabled) {
      const side = uiState.playerSide
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const vis = getTileVisibility(gameState.fogOfWar, x, y, side)
          if (vis === 'visible') continue
          const screenX = x * TILE_SIZE
          const screenY = y * TILE_SIZE
          if (vis === 'hidden') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
          } else {
            // explored: dimmed but recognizable
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
          }
          this.ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
        }
      }
    }
  }

  private drawGrid(gameState: GameState) {
    if (!this.ctx) return

    const { map } = gameState

    this.ctx.strokeStyle = GRID_COLOR
    this.ctx.lineWidth = 0.5

    // Vertical lines
    for (let x = 0; x <= map.width; x++) {
      const screenX = x * TILE_SIZE
      this.ctx.beginPath()
      this.ctx.moveTo(screenX, 0)
      this.ctx.lineTo(screenX, map.height * TILE_SIZE)
      this.ctx.stroke()
    }

    // Horizontal lines
    for (let y = 0; y <= map.height; y++) {
      const screenY = y * TILE_SIZE
      this.ctx.beginPath()
      this.ctx.moveTo(0, screenY)
      this.ctx.lineTo(map.width * TILE_SIZE, screenY)
      this.ctx.stroke()
    }
  }

  private drawBoardBoundaries(gameState: GameState) {
    if (!this.ctx) return

    const { map } = gameState
    const boardsWide = map.boardsWide ?? Math.ceil(map.width / BOARD_SIZE)
    const boardsTall = map.boardsTall ?? Math.ceil(map.height / BOARD_SIZE)

    this.ctx.save()
    this.ctx.strokeStyle = BOARD_BOUNDARY_COLOR
    this.ctx.lineWidth = 1.5
    this.ctx.setLineDash([8, 6])
    this.ctx.globalAlpha = 0.35

    // Vertical board boundaries (skip outer edges, already covered by map border)
    for (let bx = 1; bx < boardsWide; bx++) {
      const screenX = bx * BOARD_SIZE * TILE_SIZE
      this.ctx.beginPath()
      this.ctx.moveTo(screenX, 0)
      this.ctx.lineTo(screenX, map.height * TILE_SIZE)
      this.ctx.stroke()
    }

    // Horizontal board boundaries
    for (let by = 1; by < boardsTall; by++) {
      const screenY = by * BOARD_SIZE * TILE_SIZE
      this.ctx.beginPath()
      this.ctx.moveTo(0, screenY)
      this.ctx.lineTo(map.width * TILE_SIZE, screenY)
      this.ctx.stroke()
    }

    this.ctx.restore()

    // Draw solid outer map border
    this.ctx.save()
    this.ctx.strokeStyle = BOARD_BOUNDARY_COLOR
    this.ctx.lineWidth = 2.5
    this.ctx.globalAlpha = 0.6
    this.ctx.strokeRect(0, 0, map.width * TILE_SIZE, map.height * TILE_SIZE)
    this.ctx.restore()
  }

  private drawDeploymentZones(gameState: GameState) {
    if (!this.ctx) return

    const { map } = gameState
    if (!map.deploymentZones) return

    // Imperial deployment zone (left side, red tint)
    if (map.deploymentZones.imperial) {
      this.ctx.fillStyle = DEPLOY_IMPERIAL_COLOR
      for (const coord of map.deploymentZones.imperial) {
        this.ctx.fillRect(coord.x * TILE_SIZE, coord.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      }
    }

    // Operative deployment zone (right side, green tint)
    if (map.deploymentZones.operative) {
      this.ctx.fillStyle = DEPLOY_OPERATIVE_COLOR
      for (const coord of map.deploymentZones.operative) {
        this.ctx.fillRect(coord.x * TILE_SIZE, coord.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      }
    }
  }

  private drawHighlights(gameState: GameState, uiState: UIState) {
    if (!this.ctx) return

    // Draw attack range overlay (subtle tint showing weapon reach)
    if (uiState.attackRange) {
      const { center, radius } = uiState.attackRange
      const ctx = this.ctx!
      const cx = center.x * TILE_SIZE + TILE_SIZE / 2
      const cy = center.y * TILE_SIZE + TILE_SIZE / 2
      const radiusPx = radius * TILE_SIZE

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 68, 68, 0.04)'
      ctx.fill()

      // Dashed border ring
      ctx.strokeStyle = 'rgba(255, 68, 68, 0.15)'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.restore()
    }

    // Draw valid moves
    uiState.validMoves.forEach(coord => {
      const screenX = coord.x * TILE_SIZE
      const screenY = coord.y * TILE_SIZE

      this.ctx!.fillStyle = VALID_MOVE_OVERLAY
      this.ctx!.globalAlpha = 0.2
      this.ctx!.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
      this.ctx!.globalAlpha = 1.0
    })

    // Draw valid attack targets (figures)
    gameState.figures.forEach(figure => {
      if (uiState.validTargets.includes(figure.id)) {
        const screenX = figure.position.x * TILE_SIZE
        const screenY = figure.position.y * TILE_SIZE

        this.ctx!.fillStyle = VALID_TARGET_OVERLAY
        this.ctx!.globalAlpha = 0.15
        this.ctx!.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
        this.ctx!.globalAlpha = 1.0
      }
    })

    // Draw highlighted tile hover
    if (uiState.highlightedTile) {
      const screenX = uiState.highlightedTile.x * TILE_SIZE
      const screenY = uiState.highlightedTile.y * TILE_SIZE

      this.ctx.strokeStyle = HOVER_OUTLINE
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
    }

    // Player move path preview
    if (uiState.playerMovePath && uiState.playerMovePath.length >= 2) {
      this.drawPlayerMovePath(uiState.playerMovePath, uiState.playerMovePathCost, uiState.movePreviewTargets?.length ?? 0)
    }

    // Move preview targets: show which enemies are targetable from hovered move destination
    if (uiState.movePreviewTargets && uiState.movePreviewTargets.length > 0) {
      const ctx = this.ctx!
      ctx.save()
      gameState.figures.forEach(figure => {
        if (uiState.movePreviewTargets!.includes(figure.id)) {
          const fx = figure.position.x * TILE_SIZE
          const fy = figure.position.y * TILE_SIZE

          // Amber/orange pulsing border to distinguish from current valid targets (red)
          const pulse = Math.sin(Date.now() / 300) * 0.15 + 0.55
          ctx.strokeStyle = '#ffaa22'
          ctx.lineWidth = 2
          ctx.globalAlpha = pulse
          ctx.strokeRect(fx + 1, fy + 1, TILE_SIZE - 2, TILE_SIZE - 2)

          // Small crosshair icon at top-right corner
          ctx.globalAlpha = pulse + 0.15
          ctx.fillStyle = '#ffaa22'
          ctx.font = 'bold 10px monospace'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'top'
          ctx.fillText('\u2316', fx + TILE_SIZE - 3, fy + 2)
        }
      })
      ctx.restore()
    }

    // Threat indicators: enemies that can attack the selected figure
    if (uiState.threateningEnemies.length > 0) {
      const ctx = this.ctx!
      ctx.save()
      gameState.figures.forEach(figure => {
        if (uiState.threateningEnemies.includes(figure.id)) {
          const fx = figure.position.x * TILE_SIZE
          const fy = figure.position.y * TILE_SIZE

          // Small red warning triangle at bottom-left of tile
          ctx.globalAlpha = 0.85
          ctx.fillStyle = '#ff3333'
          ctx.beginPath()
          const tx = fx + 4
          const ty = fy + TILE_SIZE - 4
          ctx.moveTo(tx, ty)
          ctx.lineTo(tx + 5, ty - 9)
          ctx.lineTo(tx + 10, ty)
          ctx.closePath()
          ctx.fill()

          // Exclamation mark
          ctx.fillStyle = '#000000'
          ctx.font = 'bold 7px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText('!', tx + 5, ty - 1)
        }
      })
      ctx.restore()
    }

    // AI move path visualization
    if (uiState.aiMovePath && uiState.aiMovePath.length >= 2) {
      this.drawAIMovePath(uiState.aiMovePath, gameState, uiState)
    }

    // AI attack target visualization
    if (uiState.aiAttackTarget) {
      this.drawAIAttackTarget(uiState.aiAttackTarget, gameState)
    }
  }

  private drawAIMovePath(pathCoords: GridCoordinate[], gameState: GameState, uiState: UIState) {
    if (!this.ctx) return

    // Determine faction color from currently activating figure
    let pathColor = VALID_MOVE_OVERLAY // default blue
    if (uiState.currentActivatingId) {
      const fig = gameState.figures.find(f => f.id === uiState.currentActivatingId)
      if (fig) {
        const player = gameState.players.find(p => p.id === fig.playerId)
        pathColor = player?.role === 'Imperial' ? IMPERIAL_COLOR : OPERATIVE_COLOR
      }
    }

    this.ctx.save()
    this.ctx.strokeStyle = pathColor
    this.ctx.lineWidth = 3
    this.ctx.setLineDash([6, 4])
    this.ctx.globalAlpha = 0.7

    // Draw path line
    this.ctx.beginPath()
    const startX = pathCoords[0].x * TILE_SIZE + TILE_SIZE / 2
    const startY = pathCoords[0].y * TILE_SIZE + TILE_SIZE / 2
    this.ctx.moveTo(startX, startY)
    for (let i = 1; i < pathCoords.length; i++) {
      const px = pathCoords[i].x * TILE_SIZE + TILE_SIZE / 2
      const py = pathCoords[i].y * TILE_SIZE + TILE_SIZE / 2
      this.ctx.lineTo(px, py)
    }
    this.ctx.stroke()

    // Draw arrowheads along path
    this.ctx.setLineDash([])
    this.ctx.fillStyle = pathColor
    const step = Math.max(1, Math.floor(pathCoords.length / 4))
    for (let i = step; i < pathCoords.length; i += step) {
      const prev = pathCoords[i - 1]
      const curr = pathCoords[i]
      const cx = curr.x * TILE_SIZE + TILE_SIZE / 2
      const cy = curr.y * TILE_SIZE + TILE_SIZE / 2
      const angle = Math.atan2(
        (curr.y - prev.y) * TILE_SIZE,
        (curr.x - prev.x) * TILE_SIZE
      )
      const sz = 7
      this.ctx.beginPath()
      this.ctx.moveTo(cx + Math.cos(angle) * sz, cy + Math.sin(angle) * sz)
      this.ctx.lineTo(cx + Math.cos(angle + 2.5) * sz, cy + Math.sin(angle + 2.5) * sz)
      this.ctx.lineTo(cx + Math.cos(angle - 2.5) * sz, cy + Math.sin(angle - 2.5) * sz)
      this.ctx.closePath()
      this.ctx.fill()
    }

    // Destination marker: pulsing circle at end of path
    const dest = pathCoords[pathCoords.length - 1]
    const destX = dest.x * TILE_SIZE + TILE_SIZE / 2
    const destY = dest.y * TILE_SIZE + TILE_SIZE / 2
    const pulse = Math.sin(Date.now() / 250) * 0.3 + 0.5
    this.ctx.globalAlpha = pulse
    this.ctx.strokeStyle = pathColor
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([])
    this.ctx.beginPath()
    this.ctx.arc(destX, destY, TILE_SIZE / 3 + 4, 0, Math.PI * 2)
    this.ctx.stroke()

    this.ctx.restore()
  }

  private drawPlayerMovePath(pathCoords: GridCoordinate[], cost: number | null, targetCount: number) {
    if (!this.ctx || pathCoords.length < 2) return

    const ctx = this.ctx
    ctx.save()

    // Dashed path line in blue
    ctx.strokeStyle = VALID_MOVE_OVERLAY
    ctx.lineWidth = 2.5
    ctx.setLineDash([5, 3])
    ctx.globalAlpha = 0.6

    ctx.beginPath()
    ctx.moveTo(
      pathCoords[0].x * TILE_SIZE + TILE_SIZE / 2,
      pathCoords[0].y * TILE_SIZE + TILE_SIZE / 2,
    )
    for (let i = 1; i < pathCoords.length; i++) {
      ctx.lineTo(
        pathCoords[i].x * TILE_SIZE + TILE_SIZE / 2,
        pathCoords[i].y * TILE_SIZE + TILE_SIZE / 2,
      )
    }
    ctx.stroke()

    // Destination circle
    const dest = pathCoords[pathCoords.length - 1]
    const dx = dest.x * TILE_SIZE + TILE_SIZE / 2
    const dy = dest.y * TILE_SIZE + TILE_SIZE / 2
    ctx.setLineDash([])
    ctx.globalAlpha = 0.8
    ctx.strokeStyle = VALID_MOVE_OVERLAY
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(dx, dy, TILE_SIZE / 3, 0, Math.PI * 2)
    ctx.stroke()

    // Info badge at destination: movement cost + target count
    if (cost != null) {
      ctx.globalAlpha = 1.0
      ctx.font = 'bold 10px monospace'

      // Build label parts
      const costLabel = `${cost}mp`
      const targetLabel = targetCount > 0 ? `${targetCount}\u2316` : ''
      const fullLabel = targetLabel ? `${costLabel} ${targetLabel}` : costLabel

      const tw = ctx.measureText(fullLabel).width
      const bw = tw + 10
      const bh = 16
      const bx = dx - bw / 2
      const by = dy - TILE_SIZE / 2 - bh - 2

      // Badge background
      ctx.fillStyle = 'rgba(10, 10, 20, 0.88)'
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, bh, 3)
      ctx.fill()
      ctx.strokeStyle = targetCount > 0 ? '#ffaa22' : VALID_MOVE_OVERLAY
      ctx.lineWidth = 1
      ctx.stroke()

      // Cost text
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(costLabel, dx - (targetLabel ? ctx.measureText(` ${targetLabel}`).width / 2 : 0), by + bh / 2)

      // Target count in amber
      if (targetLabel) {
        const costW = ctx.measureText(`${costLabel} `).width
        ctx.fillStyle = '#ffaa22'
        ctx.textAlign = 'left'
        ctx.fillText(targetLabel, bx + (bw - tw) / 2 + costW, by + bh / 2)
      }
    }

    ctx.restore()
  }

  private drawAIAttackTarget(target: { from: GridCoordinate; to: GridCoordinate }, _gameState: GameState) {
    if (!this.ctx) return

    const fromX = target.from.x * TILE_SIZE + TILE_SIZE / 2
    const fromY = target.from.y * TILE_SIZE + TILE_SIZE / 2
    const toX = target.to.x * TILE_SIZE + TILE_SIZE / 2
    const toY = target.to.y * TILE_SIZE + TILE_SIZE / 2

    this.ctx.save()

    // Targeting line (dashed red)
    this.ctx.strokeStyle = VALID_TARGET_OVERLAY
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([4, 4])
    this.ctx.globalAlpha = 0.6
    this.ctx.beginPath()
    this.ctx.moveTo(fromX, fromY)
    this.ctx.lineTo(toX, toY)
    this.ctx.stroke()

    // Source indicator (small filled circle)
    this.ctx.setLineDash([])
    this.ctx.fillStyle = VALID_TARGET_OVERLAY
    this.ctx.globalAlpha = 0.4
    this.ctx.beginPath()
    this.ctx.arc(fromX, fromY, 5, 0, Math.PI * 2)
    this.ctx.fill()

    // Target reticle
    this.ctx.strokeStyle = VALID_TARGET_OVERLAY
    this.ctx.lineWidth = 2
    const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.7
    this.ctx.globalAlpha = pulse

    const r = 14  // reticle radius

    // Crosshair lines
    this.ctx.beginPath()
    this.ctx.moveTo(toX - r, toY)
    this.ctx.lineTo(toX - 4, toY)
    this.ctx.moveTo(toX + 4, toY)
    this.ctx.lineTo(toX + r, toY)
    this.ctx.moveTo(toX, toY - r)
    this.ctx.lineTo(toX, toY - 4)
    this.ctx.moveTo(toX, toY + 4)
    this.ctx.lineTo(toX, toY + r)
    this.ctx.stroke()

    // Outer ring
    this.ctx.beginPath()
    this.ctx.arc(toX, toY, r, 0, Math.PI * 2)
    this.ctx.stroke()

    // Corner brackets
    const b = 5  // bracket size
    const offsets = [
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 },
    ]
    for (const o of offsets) {
      const bx = toX + o.dx * (r + 3)
      const by = toY + o.dy * (r + 3)
      this.ctx.beginPath()
      this.ctx.moveTo(bx, by + o.dy * -b)
      this.ctx.lineTo(bx, by)
      this.ctx.lineTo(bx + o.dx * -b, by)
      this.ctx.stroke()
    }

    this.ctx.restore()
  }

  /** Get wound threshold for a figure from its backing data. */
  private getWoundThreshold(figure: Figure, gameState: GameState): number {
    if (figure.entityType === 'hero') {
      const hero = gameState.heroes[figure.entityId]
      return hero?.wounds.threshold ?? 10
    }
    const npc = gameState.npcProfiles[figure.entityId]
    return npc?.woundThreshold ?? 4
  }

  /** Get short display name for a figure. */
  private getFigureLabel(figure: Figure, gameState: GameState): string {
    if (figure.entityType === 'hero') {
      const hero = gameState.heroes[figure.entityId]
      return hero?.name ?? figure.entityId
    }
    const npc = gameState.npcProfiles[figure.entityId]
    // For NPCs, use profile name but strip "Imperial" prefix for brevity
    const name = npc?.name ?? figure.entityId
    // Add suffix number if ID has one (e.g. "stormtrooper-2" -> "Stormtrooper 2")
    const numMatch = figure.id.match(/-(\d+)$/)
    if (numMatch) {
      return `${name} ${numMatch[1]}`
    }
    return name
  }

  private drawFigures(gameState: GameState, uiState: UIState) {
    if (!this.ctx) return

    gameState.figures.forEach(figure => {
      if (figure.isDefeated) return

      // Fog of war: hide enemy figures that aren't visible to the player
      if (gameState.fogOfWar?.enabled) {
        const player = gameState.players.find(p => p.id === figure.playerId)
        const figureSide = player?.role as Side | undefined
        if (figureSide !== uiState.playerSide) {
          if (!isFigureVisible(gameState.fogOfWar, figure, uiState.playerSide)) return
        }
      }

      const { footprint, radiusMult } = getBaseSizeMetrics(figure.baseSize)
      const tileSpan = footprint * TILE_SIZE

      // Center of the figure's tile footprint
      const screenX = figure.position.x * TILE_SIZE + tileSpan / 2
      const screenY = figure.position.y * TILE_SIZE + tileSpan / 2
      const radius = (TILE_SIZE / 3) * radiusMult

      // Get player for faction coloring
      const player = gameState.players.find(p => p.id === figure.playerId)
      const isOperative = player?.role === 'Operative'
      const factionColor = isOperative ? OPERATIVE_COLOR : IMPERIAL_COLOR

      // --- Activation dimming: reduce alpha for figures that have already activated ---
      const isDimmed = figure.isActivated
      if (isDimmed) {
        this.ctx.save()
        this.ctx.globalAlpha = ACTIVATED_DIM_ALPHA
      }

      // --- Selection glow ---
      if (figure.id === uiState.selectedFigureId) {
        this.ctx.strokeStyle = SELECTED_GLOW
        this.ctx.lineWidth = 3
        this.ctx.beginPath()
        this.ctx.arc(screenX, screenY, radius + 4, 0, Math.PI * 2)
        this.ctx.stroke()
      }

      // --- Pulsing border for current activation ---
      if (figure.id === uiState.currentActivatingId) {
        const pulse = Math.sin(Date.now() / 200) * 0.5 + 0.5
        this.ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`
        this.ctx.lineWidth = 2
        this.ctx.beginPath()
        this.ctx.arc(screenX, screenY, radius + 2, 0, Math.PI * 2)
        this.ctx.stroke()
      }

      // --- Token face: portrait, silhouette, or colored circle ---
      this.drawTokenFace(figure, gameState, screenX, screenY, radius, factionColor)

      // --- Faction-colored border ring ---
      this.ctx.strokeStyle = factionColor
      this.ctx.lineWidth = 2
      this.ctx.beginPath()
      this.ctx.arc(screenX, screenY, radius, 0, Math.PI * 2)
      this.ctx.stroke()

      // --- Wounded indicator (dashed red ring + red dot) ---
      if (figure.isWounded && !figure.isDefeated) {
        this.ctx.save()
        this.ctx.strokeStyle = '#ff4444'
        this.ctx.lineWidth = 2.5
        this.ctx.setLineDash([4, 3])
        this.ctx.beginPath()
        this.ctx.arc(screenX, screenY, radius + 3, 0, Math.PI * 2)
        this.ctx.stroke()
        this.ctx.setLineDash([])
        this.ctx.fillStyle = '#ff4444'
        this.ctx.beginPath()
        this.ctx.arc(screenX, screenY - radius - 6, 3, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.restore()
      }

      // --- Minion group count badge ---
      if (figure.minionGroupSize && figure.minionGroupSize > 1) {
        const badgeR = 7
        const badgeX = screenX + radius * 0.7
        const badgeY = screenY - radius * 0.7
        this.ctx.fillStyle = factionColor
        this.ctx.beginPath()
        this.ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.strokeStyle = '#0a0a0f'
        this.ctx.lineWidth = 1
        this.ctx.stroke()
        this.ctx.fillStyle = '#ffffff'
        this.ctx.font = 'bold 9px monospace'
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'middle'
        this.ctx.fillText(String(figure.minionGroupSize), badgeX, badgeY)
      }

      // --- Health bar below figure ---
      const barWidth = Math.min(TILE_SIZE * 0.6, radius * 2 * 0.8)
      const barHeight = 4
      const barX = screenX - barWidth / 2
      const barY = screenY + radius + 6

      this.ctx.fillStyle = '#333333'
      this.ctx.fillRect(barX, barY, barWidth, barHeight)

      const woundThreshold = this.getWoundThreshold(figure, gameState)
      const woundsRemaining = Math.max(0, woundThreshold - figure.woundsCurrent)
      const healthPercent = woundThreshold > 0 ? woundsRemaining / woundThreshold : 1
      const healthBarWidth = barWidth * healthPercent

      if (healthPercent > 0.5) {
        this.ctx.fillStyle = '#44ff44'
      } else if (healthPercent > 0.25) {
        this.ctx.fillStyle = '#ffff00'
      } else {
        this.ctx.fillStyle = '#ff4444'
      }

      this.ctx.fillRect(barX, barY, healthBarWidth, barHeight)

      // --- Strain bar for heroes (thin blue bar below health bar) ---
      if (figure.entityType === 'hero') {
        const hero = gameState.heroes[figure.entityId]
        if (hero && hero.strain && hero.strain.threshold > 0) {
          const strainBarY = barY + barHeight + 1
          const strainHeight = 2

          this.ctx.fillStyle = '#222233'
          this.ctx.fillRect(barX, strainBarY, barWidth, strainHeight)

          const strainRemaining = Math.max(0, hero.strain.threshold - figure.strainCurrent)
          const strainPercent = strainRemaining / hero.strain.threshold
          this.ctx.fillStyle = STRAIN_BAR_COLOR
          this.ctx.fillRect(barX, strainBarY, barWidth * strainPercent, strainHeight)
        }
      }

      // --- Restore alpha after dimming ---
      if (isDimmed) {
        this.ctx.restore()
      }

      // --- Name label above figure (rendered at full alpha, outside dimming) ---
      const label = this.getFigureLabel(figure, gameState)
      if (label) {
        const labelY = screenY - radius - 10
        this.ctx.save()
        this.ctx.font = '8px sans-serif'
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'bottom'

        // Background pill for readability
        const measured = this.ctx.measureText(label)
        const pillW = Math.min(measured.width + 6, TILE_SIZE * 1.2)
        const pillH = 10
        const pillX = screenX - pillW / 2
        const pillY = labelY - pillH

        this.ctx.fillStyle = 'rgba(10, 10, 15, 0.75)'
        this.ctx.beginPath()
        this.ctx.roundRect(pillX, pillY, pillW, pillH, 3)
        this.ctx.fill()

        this.ctx.fillStyle = isDimmed ? '#777777' : NAME_LABEL_COLOR
        // Truncate if too long
        const maxChars = 12
        const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label
        this.ctx.fillText(displayLabel, screenX, labelY)
        this.ctx.restore()
      }
    })
  }

  /**
   * Draw the token face for a figure: portrait bitmap, silhouette, or colored circle.
   * Priority: 1) Portrait from bitmap cache, 2) Silhouette fallback, 3) Colored circle
   */
  private drawTokenFace(
    figure: Figure,
    gameState: GameState,
    cx: number,
    cy: number,
    radius: number,
    factionColor: string,
  ): void {
    if (!this.ctx) return

    // Resolve portrait ID: figure override -> hero/NPC default
    const portraitId = this.resolvePortraitId(figure, gameState)
    const bitmap = portraitId ? this.portraitBitmaps.get(portraitId) : undefined

    if (bitmap) {
      // --- Draw portrait bitmap clipped to circle ---
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2)
      this.ctx.clip()

      // Draw bitmap centered and scaled to cover the circle
      const size = radius * 2
      const aspect = bitmap.width / bitmap.height
      let drawW: number, drawH: number
      if (aspect >= 1) {
        drawH = size
        drawW = size * aspect
      } else {
        drawW = size
        drawH = size / aspect
      }
      this.ctx.drawImage(bitmap, cx - drawW / 2, cy - drawH / 2, drawW, drawH)
      this.ctx.restore()
    } else {
      // --- Silhouette or colored circle fallback ---
      const silType = this.inferSilhouetteForFigure(figure, gameState)

      if (silType) {
        // Draw silhouette into circle
        drawSilhouetteOnContext(
          this.ctx,
          silType,
          cx,
          cy,
          radius * 2,
          factionColor,
          '#1a1a2e',
        )
      } else {
        // Ultimate fallback: simple colored circle with initial
        this.ctx.fillStyle = factionColor
        this.ctx.beginPath()
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        this.ctx.fill()

        this.ctx.fillStyle = '#ffffff'
        this.ctx.font = `bold ${Math.round(radius * 0.9)}px monospace`
        this.ctx.textAlign = 'center'
        this.ctx.textBaseline = 'middle'
        this.ctx.fillText(figure.id.charAt(0).toUpperCase(), cx, cy)
      }
    }
  }

  /**
   * Resolve the portrait ID for a figure by checking:
   * 1. Figure instance override (figure.portraitId)
   * 2. Hero character default (hero.portraitId)
   * 3. NPC profile default (npc.defaultPortraitId)
   */
  private resolvePortraitId(figure: Figure, gameState: GameState): string | undefined {
    if (figure.portraitId) return figure.portraitId

    if (figure.entityType === 'hero') {
      return gameState.heroes?.[figure.entityId]?.portraitId
    }
    if (figure.entityType === 'npc') {
      return gameState.npcProfiles?.[figure.entityId]?.defaultPortraitId
    }

    return undefined
  }

  /**
   * Infer a silhouette type for figures without portraits.
   * Uses NPC keywords, entity type, and base size hints.
   */
  private inferSilhouetteForFigure(figure: Figure, gameState: GameState): SilhouetteType | null {
    // NPCs: use keywords from their profile
    if (figure.entityType === 'npc') {
      const npc = gameState.npcProfiles?.[figure.entityId]
      if (npc?.keywords && npc.keywords.length > 0) {
        return inferSilhouetteType(npc.keywords)
      }
      // Fallback: infer from base size
      if (figure.baseSize === 'large' || figure.baseSize === 'huge' ||
          figure.baseSize === 'extended' || figure.baseSize === 'massive' ||
          figure.baseSize === 'colossal') {
        return 'vehicle'
      }
      return 'infantry'
    }

    // Heroes: default to officer
    if (figure.entityType === 'hero') {
      return 'officer'
    }

    return null
  }

  private drawObjectives(gameState: GameState) {
    if (!this.ctx || !gameState.objectivePoints || gameState.objectivePoints.length === 0) return

    const OBJECTIVE_COLORS: Record<string, string> = {
      terminal: '#4a9eff',
      lock: '#ff9900',
      console: '#ff9900',
      datapad: '#44ff44',
      person: '#ffd700',
      crate: '#ffd700',
    }

    for (const obj of gameState.objectivePoints) {
      const screenX = obj.position.x * TILE_SIZE + TILE_SIZE / 2
      const screenY = obj.position.y * TILE_SIZE + TILE_SIZE / 2
      const size = 10

      this.ctx.save()

      const color = OBJECTIVE_COLORS[obj.type] || '#ffd700'

      if (obj.isCompleted) {
        // Dimmed completed marker
        this.ctx.globalAlpha = 0.35
      } else {
        // Subtle pulse for active objectives
        const pulse = Math.sin(Date.now() / 400) * 0.15 + 0.85
        this.ctx.globalAlpha = pulse
      }

      // Draw 5-pointed star
      this.ctx.fillStyle = color
      this.ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        // Outer point
        const outerAngle = (i * 2 * Math.PI) / 5 - Math.PI / 2
        const outerX = screenX + size * Math.cos(outerAngle)
        const outerY = screenY + size * Math.sin(outerAngle)
        // Inner point
        const innerAngle = outerAngle + Math.PI / 5
        const innerX = screenX + size * 0.4 * Math.cos(innerAngle)
        const innerY = screenY + size * 0.4 * Math.sin(innerAngle)

        if (i === 0) this.ctx.moveTo(outerX, outerY)
        else this.ctx.lineTo(outerX, outerY)
        this.ctx.lineTo(innerX, innerY)
      }
      this.ctx.closePath()
      this.ctx.fill()

      // Stroke outline for visibility on dark tiles
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      this.ctx.lineWidth = 0.5
      this.ctx.stroke()

      // Draw checkmark overlay for completed objectives
      if (obj.isCompleted) {
        this.ctx.globalAlpha = 0.8
        this.ctx.strokeStyle = '#44ff44'
        this.ctx.lineWidth = 2.5
        this.ctx.lineCap = 'round'
        this.ctx.beginPath()
        this.ctx.moveTo(screenX - 5, screenY + 1)
        this.ctx.lineTo(screenX - 1, screenY + 5)
        this.ctx.lineTo(screenX + 6, screenY - 4)
        this.ctx.stroke()
      }

      this.ctx.restore()
    }
  }

  private drawLootTokens(gameState: GameState) {
    if (!this.ctx || !gameState.lootTokens || gameState.lootTokens.length === 0) return

    const LOOT_COLORS: Record<string, string> = {
      xp: '#44ff44',
      credits: '#ffd700',
      equipment: '#ff6644',
      narrative: '#cc77ff',
    }

    const collectedSet = new Set(gameState.lootCollected)

    for (const token of gameState.lootTokens) {
      // Skip already-collected tokens
      if (collectedSet.has(token.id)) continue

      const screenX = token.position.x * TILE_SIZE + TILE_SIZE / 2
      const screenY = token.position.y * TILE_SIZE + TILE_SIZE / 2
      const radius = 7

      this.ctx.save()

      // Gentle bob animation
      const bob = Math.sin(Date.now() / 500 + token.position.x * 0.7) * 1.5
      const drawY = screenY + bob

      const color = LOOT_COLORS[token.reward.type] || '#ffd700'

      // Outer glow
      this.ctx.shadowColor = color
      this.ctx.shadowBlur = 6

      // Filled diamond shape
      this.ctx.fillStyle = color
      this.ctx.beginPath()
      this.ctx.moveTo(screenX, drawY - radius)        // top
      this.ctx.lineTo(screenX + radius, drawY)          // right
      this.ctx.lineTo(screenX, drawY + radius)          // bottom
      this.ctx.lineTo(screenX - radius, drawY)          // left
      this.ctx.closePath()
      this.ctx.fill()

      // Inner highlight for depth
      this.ctx.shadowBlur = 0
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      this.ctx.beginPath()
      this.ctx.moveTo(screenX, drawY - radius * 0.5)
      this.ctx.lineTo(screenX + radius * 0.5, drawY)
      this.ctx.lineTo(screenX, drawY + radius * 0.5)
      this.ctx.lineTo(screenX - radius * 0.5, drawY)
      this.ctx.closePath()
      this.ctx.fill()

      // Thin outline
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      this.ctx.lineWidth = 0.5
      this.ctx.beginPath()
      this.ctx.moveTo(screenX, drawY - radius)
      this.ctx.lineTo(screenX + radius, drawY)
      this.ctx.lineTo(screenX, drawY + radius)
      this.ctx.lineTo(screenX - radius, drawY)
      this.ctx.closePath()
      this.ctx.stroke()

      this.ctx.restore()
    }
  }

  private drawEffects(gameState: GameState, uiState: UIState) {
    if (!this.ctx) return

    const ctx = this.ctx

    gameState.figures.forEach(figure => {
      if (figure.isDefeated) return

      // Fog of war: skip effects for hidden enemy figures
      if (gameState.fogOfWar?.enabled) {
        const player = gameState.players.find(p => p.id === figure.playerId)
        const figureSide = player?.role as Side | undefined
        if (figureSide !== uiState.playerSide) {
          if (!isFigureVisible(gameState.fogOfWar, figure, uiState.playerSide)) return
        }
      }

      const cx = figure.position.x * TILE_SIZE + TILE_SIZE / 2
      const cy = figure.position.y * TILE_SIZE + TILE_SIZE / 2
      const radius = TILE_SIZE / 3

      // --- Standby: green pulsing ring around figure ---
      if (figure.hasStandby) {
        ctx.save()
        const pulse = Math.sin(Date.now() / 300) * 0.25 + 0.65
        ctx.strokeStyle = `rgba(68, 255, 68, ${pulse})`
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // --- Suppression pips: arc of dots above the figure (above health bar area) ---
      if (figure.suppressionTokens > 0) {
        const pipRadius = 3
        const arcRadius = radius + 14  // above the wound marker zone
        const tokens = figure.suppressionTokens
        const courage = figure.courage
        const totalAngle = Math.min(tokens * 0.35, Math.PI * 0.8) // spread
        const startAngle = -Math.PI / 2 - totalAngle / 2

        for (let i = 0; i < tokens; i++) {
          const angle = startAngle + (tokens > 1 ? (i / (tokens - 1)) * totalAngle : 0)
          const px = cx + Math.cos(angle) * arcRadius
          const py = cy + Math.sin(angle) * arcRadius

          ctx.fillStyle = i >= courage ? '#ff4444' : '#ff8844'
          ctx.beginPath()
          ctx.arc(px, py, pipRadius, 0, Math.PI * 2)
          ctx.fill()

          // Subtle outline
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }

      // --- Aim tokens: yellow diamonds to the left of the figure ---
      if (figure.aimTokens > 0) {
        for (let i = 0; i < figure.aimTokens; i++) {
          const ox = cx - radius - 8 - i * 9
          const oy = cy

          ctx.save()
          ctx.translate(ox, oy)
          ctx.rotate(Math.PI / 4)
          ctx.fillStyle = '#ffd700'
          ctx.fillRect(-3.5, -3.5, 7, 7)
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
          ctx.lineWidth = 0.5
          ctx.strokeRect(-3.5, -3.5, 7, 7)
          ctx.restore()
        }
      }

      // --- Dodge token: blue diamond to the right of the figure ---
      if (figure.dodgeTokens > 0) {
        const ox = cx + radius + 8
        const oy = cy

        ctx.save()
        ctx.translate(ox, oy)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = '#4a9eff'
        ctx.fillRect(-3.5, -3.5, 7, 7)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(-3.5, -3.5, 7, 7)
        ctx.restore()
      }

      // --- Retaliate keyword: orange thorns icon below-right of figure ---
      if (figure.entityType === 'npc') {
        const npcProfile = gameState.npcProfiles[figure.entityId]
        if (npcProfile) {
          const retVal = getNPCKeywordValue(npcProfile, 'Retaliate')
          if (retVal > 0) {
            const ox = cx + radius + 2
            const oy = cy + radius + 2
            // Draw a small thorns/spikes badge
            ctx.save()
            ctx.fillStyle = '#ff6644'
            ctx.beginPath()
            // 6-point starburst
            for (let i = 0; i < 6; i++) {
              const angle = (i * Math.PI * 2) / 6 - Math.PI / 2
              const outerR = 5
              const innerR = 2.5
              const outerX = ox + Math.cos(angle) * outerR
              const outerY = oy + Math.sin(angle) * outerR
              const midAngle = angle + Math.PI / 6
              const innerX = ox + Math.cos(midAngle) * innerR
              const innerY = oy + Math.sin(midAngle) * innerR
              if (i === 0) ctx.moveTo(outerX, outerY)
              else ctx.lineTo(outerX, outerY)
              ctx.lineTo(innerX, innerY)
            }
            ctx.closePath()
            ctx.fill()
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
            ctx.lineWidth = 0.5
            ctx.stroke()
            // Value number in center
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 7px monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(retVal), ox, oy)
            ctx.restore()
          }
        }
      }
    })
  }

  screenToGrid(screenX: number, screenY: number): GridCoordinate {
    if (!this.canvas) return { x: 0, y: 0 }

    // Transform screen coordinates to world coordinates
    const worldX =
      (screenX - this.canvas.width / 2) / this.zoom + this.cameraX
    const worldY =
      (screenY - this.canvas.height / 2) / this.zoom + this.cameraY

    // Transform world coordinates to grid coordinates
    const gridX = Math.floor(worldX / TILE_SIZE)
    const gridY = Math.floor(worldY / TILE_SIZE)

    return { x: gridX, y: gridY }
  }

  gridToScreen(gridX: number, gridY: number): { x: number; y: number } {
    if (!this.canvas) return { x: 0, y: 0 }

    const worldX = gridX * TILE_SIZE
    const worldY = gridY * TILE_SIZE

    const screenX =
      (worldX - this.cameraX) * this.zoom + this.canvas.width / 2
    const screenY =
      (worldY - this.cameraY) * this.zoom + this.canvas.height / 2

    return { x: screenX, y: screenY }
  }

  setCamera(x: number, y: number, zoom: number) {
    this.cameraX = x
    this.cameraY = y
    this.zoom = Math.max(0.15, Math.min(3.0, zoom)) // Clamp zoom
  }

  centerOn(gridCoord: GridCoordinate) {
    const worldX = gridCoord.x * TILE_SIZE + TILE_SIZE / 2
    const worldY = gridCoord.y * TILE_SIZE + TILE_SIZE / 2
    this.cameraX = worldX
    this.cameraY = worldY
  }

  panBy(dx: number, dy: number) {
    this.cameraX -= dx
    this.cameraY -= dy
  }

  zoomTo(level: number) {
    this.zoom = Math.max(0.15, Math.min(3.0, level))
  }

  zoomBy(delta: number) {
    this.zoomTo(this.zoom + delta)
  }
}

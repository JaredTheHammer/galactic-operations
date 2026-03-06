/**
 * Minimap - Small overview widget in the bottom-left corner showing
 * the full battlefield with figure positions and a viewport rectangle.
 *
 * Renders its own canvas at ~3px per tile. Reads shared camera state
 * (non-reactive) and game state (reactive) to draw.
 *
 * Click/drag on the minimap to pan the main camera to that location.
 */

import React, { useRef, useEffect, useCallback } from 'react'
import { useGameStore } from '../../store/game-store'
import { sharedCamera } from '../../canvas/camera-state'
import { TILE_SIZE } from '../../canvas/renderer'

const MINIMAP_SCALE = 3 // pixels per tile
const BORDER_COLOR = '#4a9eff'

export const Minimap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameState = useGameStore(s => s.gameState)
  const setCameraTarget = useGameStore(s => s.setCameraTarget)
  const isDragging = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !gameState?.map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { map, figures } = gameState
    const w = map.width * MINIMAP_SCALE
    const h = map.height * MINIMAP_SCALE

    // Resize canvas if needed
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    // Clear
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, w, h)

    // Draw terrain
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x]
        let color: string
        switch (tile.terrain) {
          case 'Wall':       color = '#3a3a55'; break
          case 'LightCover': color = '#2a3a2a'; break
          case 'HeavyCover': color = '#2a4a2a'; break
          case 'Difficult':  color = '#3a3520'; break
          case 'Elevated':   color = '#2a2840'; break
          case 'Impassable': color = '#0a0a0a'; break
          case 'Door':       color = '#2a2a4e'; break
          default:           color = '#1a1a2e'; break
        }
        ctx.fillStyle = color
        ctx.fillRect(x * MINIMAP_SCALE, y * MINIMAP_SCALE, MINIMAP_SCALE, MINIMAP_SCALE)
      }
    }

    // Draw objectives
    if (gameState.objectivePoints) {
      for (const obj of gameState.objectivePoints) {
        ctx.fillStyle = obj.isCompleted ? '#44ff4480' : '#ffd700'
        ctx.fillRect(
          obj.position.x * MINIMAP_SCALE,
          obj.position.y * MINIMAP_SCALE,
          MINIMAP_SCALE,
          MINIMAP_SCALE,
        )
      }
    }

    // Draw figures
    if (figures) {
      for (const fig of figures) {
        if (fig.isDefeated) continue
        const isPlayer = fig.playerId === 0
        ctx.fillStyle = isPlayer ? '#44ff44' : '#ff4444'
        const px = fig.position.x * MINIMAP_SCALE
        const py = fig.position.y * MINIMAP_SCALE
        if (fig.entityType === 'hero') {
          ctx.fillRect(px - 1, py - 1, MINIMAP_SCALE + 2, MINIMAP_SCALE + 2)
        } else {
          ctx.fillRect(px, py, MINIMAP_SCALE, MINIMAP_SCALE)
        }
      }
    }

    // Draw viewport rectangle
    const cam = sharedCamera
    if (cam.canvasWidth > 0 && cam.zoom > 0) {
      const viewW = cam.canvasWidth / cam.zoom
      const viewH = cam.canvasHeight / cam.zoom
      const viewLeft = (cam.x - viewW / 2) / TILE_SIZE * MINIMAP_SCALE
      const viewTop = (cam.y - viewH / 2) / TILE_SIZE * MINIMAP_SCALE
      const viewWidth = viewW / TILE_SIZE * MINIMAP_SCALE
      const viewHeight = viewH / TILE_SIZE * MINIMAP_SCALE

      ctx.strokeStyle = '#ffffff80'
      ctx.lineWidth = 1
      ctx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight)
    }
  }, [gameState])

  // Single rAF loop throttled to ~10fps via timestamp check
  useEffect(() => {
    let animId: number
    let lastDraw = 0
    const FRAME_INTERVAL = 100 // ~10fps

    const tick = (timestamp: number) => {
      if (timestamp - lastDraw >= FRAME_INTERVAL) {
        draw()
        lastDraw = timestamp
      }
      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [draw])

  // Click/drag on minimap to pan camera
  const panToMinimapPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !gameState?.map) return

    const rect = canvas.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top

    // Convert minimap pixel to grid coordinate
    const gridX = Math.floor(mx / MINIMAP_SCALE)
    const gridY = Math.floor(my / MINIMAP_SCALE)

    // Clamp to map bounds
    const clampedX = Math.max(0, Math.min(gridX, gameState.map.width - 1))
    const clampedY = Math.max(0, Math.min(gridY, gameState.map.height - 1))

    setCameraTarget({ x: clampedX, y: clampedY })
  }, [gameState?.map, setCameraTarget])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    panToMinimapPos(e.clientX, e.clientY)
  }, [panToMinimapPos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      panToMinimapPos(e.clientX, e.clientY)
    }
  }, [panToMinimapPos])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  if (!gameState?.map) return null

  const w = gameState.map.width * MINIMAP_SCALE
  const h = gameState.map.height * MINIMAP_SCALE

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '12px',
      zIndex: 120,
      border: `1px solid ${BORDER_COLOR}40`,
      borderRadius: '4px',
      backgroundColor: 'rgba(10, 10, 15, 0.85)',
      padding: '2px',
      backdropFilter: 'blur(4px)',
    }}>
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          display: 'block',
          width: `${w}px`,
          height: `${h}px`,
          imageRendering: 'pixelated',
          cursor: 'crosshair',
        }}
      />
    </div>
  )
}

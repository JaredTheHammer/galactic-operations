import React, { useEffect, useRef, useState, useCallback } from 'react'
import { TacticalGridRenderer, TILE_SIZE } from './renderer'
import { Camera } from './camera'
import { useGameStore } from '../store/game-store'
import type { GridCoordinate } from '@engine/types.js'

interface TacticalGridProps {
  gameState: any
}

export const TacticalGrid: React.FC<TacticalGridProps> = ({ gameState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<TacticalGridRenderer | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const {
    selectFigure,
    moveFigure,
    startAttack,
    validMoves,
    validTargets,
    selectedFigureId,
    setHighlightedTile,
    highlightedTile,
    aiMovePath,
    aiAttackTarget,
  } = useGameStore()

  // Initialize renderer and camera
  useEffect(() => {
    if (!canvasRef.current || isInitialized) return

    const canvas = canvasRef.current
    const renderer = new TacticalGridRenderer()
    const camera = new Camera()

    renderer.init(canvas)
    if (gameState?.map) {
      const mapWidthPx = gameState.map.width * TILE_SIZE
      const mapHeightPx = gameState.map.height * TILE_SIZE
      camera.setBounds(0, 0, mapWidthPx, mapHeightPx)
      // Auto-zoom to fit the full battlefield in the viewport
      camera.fitToMap(mapWidthPx, mapHeightPx, canvas.width, canvas.height)
    }

    rendererRef.current = renderer
    cameraRef.current = camera

    setIsInitialized(true)
  }, [isInitialized])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return
      canvasRef.current.width = window.innerWidth
      canvasRef.current.height = window.innerHeight
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Animation frame loop
  useEffect(() => {
    let animationId: number

    const animate = () => {
      if (!rendererRef.current || !cameraRef.current || !gameState) return

      // Update camera
      cameraRef.current.update()
      const cameraState = cameraRef.current.getState()
      rendererRef.current.setCamera(cameraState.x, cameraState.y, cameraState.zoom)

      // Get current activation figure
      const currentFigure =
        gameState.figures &&
        gameState.activationOrder[gameState.currentActivationIndex]
          ? gameState.figures.find(
              (f: any) => f.id === gameState.activationOrder[gameState.currentActivationIndex]
            )
          : null

      // Render
      rendererRef.current.render(gameState, {
        selectedFigureId,
        validMoves,
        validTargets,
        highlightedTile,
        currentActivatingId: currentFigure?.id || null,
        aiMovePath,
        aiAttackTarget,
      })

      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [gameState, selectedFigureId, validMoves, validTargets, highlightedTile, aiMovePath, aiAttackTarget])

  // Handle mouse/touch events
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!rendererRef.current || !cameraRef.current || !gameState) return

      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      const gridCoord = rendererRef.current.screenToGrid(screenX, screenY)

      // Check if clicked on a figure
      const clickedFigure = gameState.figures.find(
        (f: any) =>
          f.position.x === gridCoord.x &&
          f.position.y === gridCoord.y &&
          !f.isDefeated
      )

      if (clickedFigure) {
        selectFigure(clickedFigure.id)
      } else if (selectedFigureId) {
        // Check if destination is a valid move
        const isValidMove = validMoves.some(
          m => m.x === gridCoord.x && m.y === gridCoord.y
        )

        // Check if target is attackable
        const targetFigure = validTargets.find(id => {
          const fig = gameState.figures.find((f: any) => f.id === id)
          return fig && fig.position.x === gridCoord.x && fig.position.y === gridCoord.y
        })

        if (isValidMove) {
          moveFigure(gridCoord)
          selectFigure(null)
        } else if (targetFigure) {
          startAttack(targetFigure)
        }
      }
    },
    [gameState, selectedFigureId, validMoves, validTargets, selectFigure, moveFigure, startAttack]
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!rendererRef.current || !canvasRef.current) return

      const rect = canvasRef.current.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      const gridCoord = rendererRef.current.screenToGrid(screenX, screenY)
      setHighlightedTile(gridCoord)

      // Check if hovering over an objective point for tooltip
      const objectives = gameState?.objectivePoints
      if (objectives && objectives.length > 0) {
        const hovered = objectives.find(
          (o: any) => o.position.x === gridCoord.x && o.position.y === gridCoord.y
        )
        useGameStore.getState().setHoveredObjective(
          hovered ? hovered.id : null,
          hovered ? { x: e.clientX, y: e.clientY } : undefined,
        )
      }
    },
    [setHighlightedTile, gameState?.objectivePoints]
  )

  const handleCanvasMouseLeave = useCallback(() => {
    setHighlightedTile(null)
    useGameStore.getState().setHoveredObjective(null)
  }, [setHighlightedTile])

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!cameraRef.current) return

    const delta = e.deltaY > 0 ? -0.1 : 0.1
    cameraRef.current.zoomBy(delta)
  }, [])

  // Handle touch gestures (pinch zoom, pan)
  const touchStartDistance = useRef<number | null>(null)
  const touchStartZoom = useRef<number>(0)

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchStartDistance.current = Math.sqrt(dx * dx + dy * dy)
      if (cameraRef.current) {
        touchStartZoom.current = cameraRef.current.getZoom()
      }
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && touchStartDistance.current !== null && cameraRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(dx * dx + dy * dy)

      const scale = distance / touchStartDistance.current
      const newZoom = touchStartZoom.current * scale
      cameraRef.current.zoomTo(newZoom)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    touchStartDistance.current = null
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      onMouseMove={handleCanvasMouseMove}
      onMouseLeave={handleCanvasMouseLeave}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        touchAction: 'manipulation',
      }}
    />
  )
}

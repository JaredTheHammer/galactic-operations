/**
 * FloatingCombatText - Renders animated damage numbers, defeat callouts,
 * and status text floating above figures on the tactical map.
 *
 * Uses shared camera state to position HTML elements over canvas grid
 * coordinates. Each text entry floats upward and fades out over ~1.5s.
 */

import React, { useEffect, useState } from 'react'
import { useGameStore, type FloatingCombatText as FCTEntry } from '../../store/game-store'
import { TILE_SIZE } from '../../canvas/renderer'
import { sharedCamera } from '../../canvas/camera-state'

const FCT_LIFETIME = 1500 // ms
const FCT_CLEANUP_INTERVAL = 500 // ms

const TYPE_STYLES: Record<FCTEntry['type'], { fontSize: string; fontWeight: string; shadow: string }> = {
  damage:   { fontSize: '18px', fontWeight: 'bold',   shadow: '0 0 6px rgba(0,0,0,0.8)' },
  heal:     { fontSize: '16px', fontWeight: 'bold',   shadow: '0 0 6px rgba(0,0,0,0.8)' },
  miss:     { fontSize: '14px', fontWeight: 'normal', shadow: '0 0 4px rgba(0,0,0,0.8)' },
  defeat:   { fontSize: '20px', fontWeight: 'bold',   shadow: '0 0 8px rgba(0,0,0,0.9)' },
  critical: { fontSize: '20px', fontWeight: 'bold',   shadow: '0 0 8px rgba(255,0,0,0.4)' },
  token:    { fontSize: '13px', fontWeight: 'normal', shadow: '0 0 4px rgba(0,0,0,0.8)' },
  status:   { fontSize: '13px', fontWeight: 'normal', shadow: '0 0 4px rgba(0,0,0,0.8)' },
}

function gridToScreen(gridX: number, gridY: number): { x: number; y: number } | null {
  const cam = sharedCamera
  if (cam.canvasWidth === 0) return null
  const worldX = gridX * TILE_SIZE + TILE_SIZE / 2
  const worldY = gridY * TILE_SIZE
  return {
    x: (worldX - cam.x) * cam.zoom + cam.canvasWidth / 2,
    y: (worldY - cam.y) * cam.zoom + cam.canvasHeight / 2,
  }
}

const FCTItem: React.FC<{ entry: FCTEntry }> = ({ entry }) => {
  const age = Date.now() - entry.createdAt
  const progress = Math.min(1, age / FCT_LIFETIME)

  const screen = gridToScreen(entry.gridX, entry.gridY)
  if (!screen) return null

  const style = TYPE_STYLES[entry.type]
  const yOffset = -30 * progress // float upward 30px
  const opacity = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3

  return (
    <div style={{
      position: 'absolute',
      left: `${screen.x}px`,
      top: `${screen.y + yOffset}px`,
      transform: 'translate(-50%, -100%)',
      color: entry.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontFamily: 'monospace',
      textShadow: style.shadow,
      opacity,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      zIndex: 50,
      letterSpacing: entry.type === 'defeat' ? '2px' : '0.5px',
    }}>
      {entry.text}
    </div>
  )
}

export const FloatingCombatTextOverlay: React.FC = () => {
  const texts = useGameStore(s => s.floatingTexts)
  const [, setTick] = useState(0)

  // Animation tick -- re-render every ~50ms while there are active texts
  useEffect(() => {
    if (texts.length === 0) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [texts.length])

  // Cleanup expired entries periodically
  useEffect(() => {
    if (texts.length === 0) return
    const id = setInterval(() => {
      const now = Date.now()
      useGameStore.setState(state => ({
        floatingTexts: state.floatingTexts.filter(t => now - t.createdAt < FCT_LIFETIME),
      }))
    }, FCT_CLEANUP_INTERVAL)
    return () => clearInterval(id)
  }, [texts.length > 0])

  const now = Date.now()
  const active = texts.filter(t => now - t.createdAt < FCT_LIFETIME)

  if (active.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {active.map(entry => (
        <FCTItem key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

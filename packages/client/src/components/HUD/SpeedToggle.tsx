/**
 * SpeedToggle - Compact button to cycle combat speed (Normal/Fast/Instant).
 * Positioned top-right of the combat HUD. Click to cycle through speeds.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'

const SPEED_CONFIG = {
  normal:  { label: '1x',  color: '#888',    bg: 'transparent' },
  fast:    { label: '3x',  color: '#ffaa00', bg: 'rgba(255, 170, 0, 0.1)' },
  instant: { label: 'MAX', color: '#ff4444', bg: 'rgba(255, 68, 68, 0.1)' },
} as const

export const SpeedToggle: React.FC = () => {
  const speed = useGameStore(s => s.combatSpeed)
  const cycle = useGameStore(s => s.cycleCombatSpeed)
  const config = SPEED_CONFIG[speed]

  return (
    <button
      onClick={cycle}
      title={`Combat speed: ${speed} (click to cycle)`}
      style={{
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: 100,
        background: config.bg,
        border: `1px solid ${config.color}60`,
        borderRadius: '4px',
        color: config.color,
        padding: '4px 10px',
        fontSize: '11px',
        fontWeight: 'bold',
        fontFamily: 'monospace',
        cursor: 'pointer',
        letterSpacing: '0.5px',
        transition: 'all 0.15s',
        backdropFilter: 'blur(4px)',
      }}
    >
      {config.label}
    </button>
  )
}

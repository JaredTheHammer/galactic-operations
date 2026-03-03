/**
 * ObjectiveProgress - Objective completion progress bar HUD element.
 *
 * Shows X/Y objectives completed with a visual progress bar.
 * Positioned below TurnIndicator at top-center.
 * Only renders when objectivePoints exist in the game state.
 */

import React from 'react'
import type { GameState } from '@engine/types.js'

interface ObjectiveProgressProps {
  gameState: GameState | null
}

export const ObjectiveProgress: React.FC<ObjectiveProgressProps> = ({ gameState }) => {
  if (!gameState?.objectivePoints || gameState.objectivePoints.length === 0) return null

  const completed = gameState.objectivePoints.filter(o => o.isCompleted).length
  const total = gameState.objectivePoints.length
  const allDone = completed === total
  const percent = (completed / total) * 100

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: '180px',
    backgroundColor: 'rgba(19, 19, 32, 0.92)',
    border: `1px solid ${allDone ? '#44ff44' : '#ffd700'}`,
    borderRadius: '6px',
    padding: '6px 12px',
    zIndex: 85,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
    textAlign: 'center',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#ffd700',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
    marginBottom: '4px',
  }

  const barContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '8px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #333355',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '3px',
  }

  const barFillStyle: React.CSSProperties = {
    height: '100%',
    width: `${percent}%`,
    backgroundColor: allDone ? '#44ff44' : '#4a9eff',
    transition: 'width 0.4s ease',
  }

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>Objectives</div>
      <div style={barContainerStyle}>
        <div style={barFillStyle} />
      </div>
      <div style={{ color: allDone ? '#44ff44' : '#cccccc' }}>
        {completed}/{total} Complete
      </div>
    </div>
  )
}

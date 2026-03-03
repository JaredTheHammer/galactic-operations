/**
 * ObjectiveTooltip - Hover tooltip for objective points on the tactical map.
 *
 * Renders near the mouse cursor when hovering over an objective tile.
 * Shows objective type, description, required skill, difficulty, and completion status.
 * Uses pointerEvents: 'none' to avoid interfering with canvas interactions.
 */

import React from 'react'
import type { ObjectivePoint } from '@engine/types.js'
import { useGameStore } from '../../store/game-store'

const OBJECTIVE_LABELS: Record<string, string> = {
  terminal: 'Terminal',
  lock: 'Lock',
  console: 'Console',
  datapad: 'Datapad',
  person: 'Contact',
  crate: 'Supply Crate',
}

const OBJECTIVE_ICONS: Record<string, string> = {
  terminal: '\u25C6',   // diamond
  lock: '\u25A0',       // square
  console: '\u25C7',    // diamond outline
  datapad: '\u25B3',    // triangle
  person: '\u25CF',     // circle
  crate: '\u25A1',      // square outline
}

export const ObjectiveTooltip: React.FC = () => {
  const hoveredObjectiveId = useGameStore(s => s.hoveredObjectiveId)
  const tooltipScreenPos = useGameStore(s => s.tooltipScreenPos)
  const gameState = useGameStore(s => s.gameState)

  if (!hoveredObjectiveId || !tooltipScreenPos || !gameState?.objectivePoints) return null

  const objective = gameState.objectivePoints.find(o => o.id === hoveredObjectiveId)
  if (!objective) return null

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${tooltipScreenPos.x + 14}px`,
    top: `${tooltipScreenPos.y + 14}px`,
    backgroundColor: 'rgba(14, 14, 24, 0.96)',
    border: '1px solid #4a9eff',
    borderRadius: '6px',
    padding: '10px 12px',
    maxWidth: '240px',
    zIndex: 160,
    backdropFilter: 'blur(6px)',
    color: '#ffffff',
    fontSize: '11px',
    pointerEvents: 'none',
    lineHeight: '1.4',
  }

  const titleColor = objective.isCompleted ? '#44ff44' : '#ffd700'
  const icon = OBJECTIVE_ICONS[objective.type] || '\u25CF'
  const label = OBJECTIVE_LABELS[objective.type] || objective.type

  // Build difficulty indicator (purple dots)
  const difficultyDots = '\u25CF'.repeat(objective.difficulty)

  return (
    <div style={tooltipStyle}>
      {/* Type + name */}
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: titleColor, marginBottom: '4px' }}>
        {icon} {label}
      </div>

      {/* Description */}
      <div style={{ color: '#cccccc', marginBottom: '6px' }}>
        {objective.description}
      </div>

      {/* Skill requirement */}
      <div style={{ fontSize: '10px', marginBottom: '3px' }}>
        <span style={{ color: '#999999' }}>Skill: </span>
        <span style={{ color: '#4a9eff', fontWeight: 'bold' }}>{objective.skillRequired}</span>
        {objective.alternateSkill && (
          <span style={{ color: '#999999' }}>
            {' '}or <span style={{ color: '#4a9eff', fontWeight: 'bold' }}>{objective.alternateSkill}</span>
          </span>
        )}
      </div>

      {/* Difficulty */}
      <div style={{ fontSize: '10px', marginBottom: '3px' }}>
        <span style={{ color: '#999999' }}>Difficulty: </span>
        <span style={{ color: '#bb66ff' }}>{difficultyDots}</span>
        <span style={{ color: '#999999' }}> ({objective.difficulty})</span>
      </div>

      {/* Completion status */}
      {objective.isCompleted && (
        <div style={{ color: '#44ff44', fontWeight: 'bold', fontSize: '10px', marginTop: '4px' }}>
          \u2713 Completed
        </div>
      )}
    </div>
  )
}

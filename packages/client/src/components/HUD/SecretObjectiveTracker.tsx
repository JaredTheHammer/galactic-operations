/**
 * SecretObjectiveTracker - Displays each hero's secret objective progress.
 *
 * Shows assigned secret objectives with progress bars.
 * Only visible to the player (operative side).
 */

import React, { useState } from 'react'
import type { GameState, GameData } from '@engine/types.js'

interface SecretObjectiveTrackerProps {
  gameState: GameState | null
  gameData: GameData | null
  compact?: boolean
}

export const SecretObjectiveTracker: React.FC<SecretObjectiveTrackerProps> = ({
  gameState,
  gameData,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(false)

  if (!gameState?.secretObjectives || !gameData) return null

  const { assignments } = gameState.secretObjectives
  if (assignments.length === 0) return null

  const objectives = gameData.secretObjectives ?? {}

  if (compact) {
    const completed = assignments.filter(a => a.isCompleted).length
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
        <span style={{ color: '#cc77ff' }}>{completed}/{assignments.length}</span>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '380px',
    left: '20px',
    width: '220px',
    backgroundColor: 'rgba(19, 19, 32, 0.92)',
    border: '1px solid #cc77ff',
    borderRadius: '6px',
    padding: '8px 10px',
    zIndex: 85,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
    cursor: 'pointer',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#cc77ff',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
    marginBottom: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  const completedCount = assignments.filter(a => a.isCompleted).length

  return (
    <div style={containerStyle} onClick={() => setExpanded(!expanded)}>
      <div style={titleStyle}>
        <span>Secret Objectives</span>
        <span style={{ color: '#999', fontSize: '9px' }}>
          {completedCount}/{assignments.length} {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {expanded && assignments.map(assignment => {
        const def = objectives[assignment.objectiveId]
        if (!def) return null

        const hero = gameState.heroes[assignment.heroId]
        const heroName = hero?.name ?? assignment.heroId
        const progress = assignment.progress
        const target = def.targetCount ?? 1
        const percent = Math.min((progress / target) * 100, 100)

        return (
          <div key={assignment.objectiveId} style={{ marginBottom: '6px' }}>
            <div style={{
              fontSize: '10px',
              color: assignment.isCompleted ? '#44ff44' : '#cccccc',
              marginBottom: '2px',
            }}>
              <span style={{ color: '#cc77ff', fontWeight: 'bold' }}>{heroName}</span>
              {' '}{def.name ?? assignment.objectiveId}
              {assignment.isCompleted && ' \u2713'}
            </div>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '3px' }}>
              {def.description}
            </div>
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#1a1a2e',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${percent}%`,
                backgroundColor: assignment.isCompleted ? '#44ff44' : '#cc77ff',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: '8px', color: '#666', textAlign: 'right' }}>
              {progress}/{target}
            </div>
          </div>
        )
      })}

      {!expanded && (
        <div style={{ textAlign: 'center', color: '#888', fontSize: '9px' }}>
          Click to expand
        </div>
      )}
    </div>
  )
}

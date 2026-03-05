/**
 * ObjectiveProgress - Objective completion progress bar HUD element.
 *
 * Shows X/Y objectives completed with a visual progress bar.
 * Click to expand and see individual objective descriptions.
 * Positioned below TurnIndicator at top-center.
 * Only renders when objectivePoints exist in the game state.
 */

import React, { useState } from 'react'
import type { GameState } from '@engine/types.js'
import { useGameStore } from '../../store/game-store'

interface ObjectiveProgressProps {
  gameState: GameState | null
  compact?: boolean
}

export const ObjectiveProgress: React.FC<ObjectiveProgressProps> = ({ gameState, compact = false }) => {
  const [expanded, setExpanded] = useState(false)
  const activeMission = useGameStore(s => s.activeMission)

  if (!gameState?.objectivePoints || gameState.objectivePoints.length === 0) return null

  const completed = gameState.objectivePoints.filter(o => o.isCompleted).length
  const total = gameState.objectivePoints.length
  const allDone = completed === total
  const percent = (completed / total) * 100

  // Get mission objectives for richer descriptions
  const missionObjectives = activeMission?.objectives ?? []

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
        <span style={{ color: allDone ? '#44ff44' : '#ffd700', fontWeight: 'bold' }}>OBJ</span>
        <div style={{ width: '30px', height: '6px', backgroundColor: '#1a1a2e', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${percent}%`, backgroundColor: allDone ? '#44ff44' : '#4a9eff' }} />
        </div>
        <span style={{ color: allDone ? '#44ff44' : '#cccccc' }}>{completed}/{total}</span>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: '200px',
    maxWidth: '320px',
    backgroundColor: 'rgba(19, 19, 32, 0.95)',
    border: `1px solid ${allDone ? '#44ff44' : '#ffd700'}`,
    borderRadius: '6px',
    padding: '6px 12px',
    zIndex: 85,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
    textAlign: 'center',
    cursor: 'pointer',
    userSelect: 'none' as const,
  }

  return (
    <div style={containerStyle} onClick={() => setExpanded(e => !e)}>
      <div style={{
        fontSize: '9px',
        color: '#ffd700',
        textTransform: 'uppercase',
        fontWeight: 'bold',
        letterSpacing: '1px',
        marginBottom: '4px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span>Objectives</span>
        <span style={{ fontSize: '7px', color: '#666', fontWeight: 'normal' }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </div>
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: '#1a1a2e',
        border: '1px solid #333355',
        borderRadius: '3px',
        overflow: 'hidden',
        marginBottom: '3px',
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          backgroundColor: allDone ? '#44ff44' : '#4a9eff',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ color: allDone ? '#44ff44' : '#cccccc' }}>
        {completed}/{total} Complete
      </div>

      {/* Expanded objective list */}
      {expanded && (
        <div style={{
          marginTop: '6px',
          borderTop: '1px solid #333355',
          paddingTop: '6px',
          textAlign: 'left',
        }}>
          {/* Mission objectives (strategic goals) */}
          {missionObjectives.length > 0 && missionObjectives.map((obj, i) => {
            const isDone = gameState.completedObjectiveIds?.includes(obj.id)
            const priorityColor = obj.side === 'Operative' ? '#44ff44' : '#ff4444'
            return (
              <div key={obj.id ?? i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                marginBottom: '4px',
                opacity: isDone ? 0.5 : 1,
              }}>
                <span style={{ color: isDone ? '#44ff44' : '#555', fontSize: '10px', flexShrink: 0 }}>
                  {isDone ? '\u2713' : '\u25CB'}
                </span>
                <div>
                  <span style={{ color: isDone ? '#668866' : priorityColor, fontSize: '9px' }}>
                    {obj.description}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Interactive objective points (terminals, locks, etc.) */}
          {gameState.objectivePoints.map(obj => {
            const typeIcons: Record<string, string> = {
              terminal: '\uD83D\uDDA5\uFE0F',
              lock: '\uD83D\uDD12',
              console: '\u2328\uFE0F',
              datapad: '\uD83D\uDCCB',
              person: '\uD83D\uDDE3\uFE0F',
              crate: '\uD83D\uDCE6',
            }
            return (
              <div key={obj.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                marginBottom: '4px',
                opacity: obj.isCompleted ? 0.5 : 1,
              }}>
                <span style={{ color: obj.isCompleted ? '#44ff44' : '#555', fontSize: '10px', flexShrink: 0 }}>
                  {obj.isCompleted ? '\u2713' : '\u25CB'}
                </span>
                <div>
                  <span style={{ fontSize: '9px', color: obj.isCompleted ? '#668866' : '#cccccc' }}>
                    {typeIcons[obj.type] ?? ''} {obj.description}
                  </span>
                  {!obj.isCompleted && (
                    <div style={{ fontSize: '8px', color: '#777', marginTop: '1px' }}>
                      {obj.skillRequired} check at ({obj.position.x},{obj.position.y})
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

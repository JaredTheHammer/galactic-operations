/**
 * ActivationOrder - Horizontal strip showing the activation sequence for the current round.
 *
 * Each figure appears as a small colored pip with name tooltip. The current activating
 * figure is highlighted; activated figures are dimmed. Defeated figures show as X.
 * Positioned below the TurnIndicator at top-center.
 */

import React from 'react'
import type { GameState, Figure } from '@engine/types.js'
import { getFigureName } from '@engine/turn-machine-v2.js'
import { useGameStore } from '../../store/game-store'

interface ActivationOrderProps {
  gameState: GameState | null
}

export const ActivationOrder: React.FC<ActivationOrderProps> = ({ gameState }) => {
  const { selectFigure } = useGameStore()

  if (!gameState || gameState.turnPhase !== 'Activation') return null
  if (gameState.activationOrder.length === 0) return null

  const figures = gameState.activationOrder.map(id =>
    gameState.figures.find(f => f.id === id)
  )

  return (
    <div style={containerStyle}>
      {figures.map((fig, idx) => {
        if (!fig) return null

        const isCurrent = idx === gameState.currentActivationIndex
        const isActivated = fig.isActivated
        const isDefeated = fig.isDefeated
        const player = gameState.players.find(p => p.id === fig.playerId)
        const isOperative = player?.role === 'Operative'
        const factionColor = isOperative ? '#44ff44' : '#ff4444'
        const name = getFigureName(fig, gameState)

        let bgColor: string
        let borderColor: string
        let opacity: number

        if (isDefeated) {
          bgColor = '#333333'
          borderColor = '#555555'
          opacity = 0.4
        } else if (isCurrent) {
          bgColor = factionColor
          borderColor = '#ffd700'
          opacity = 1
        } else if (isActivated) {
          bgColor = factionColor + '40'
          borderColor = '#333355'
          opacity = 0.5
        } else {
          bgColor = factionColor + '20'
          borderColor = factionColor + '80'
          opacity = 0.85
        }

        return (
          <div
            key={fig.id}
            onClick={() => !isDefeated && selectFigure(fig.id)}
            title={`${name}${isDefeated ? ' (defeated)' : isActivated ? ' (done)' : isCurrent ? ' (activating)' : ''}`}
            style={{
              ...pipStyle,
              backgroundColor: bgColor,
              border: `2px solid ${borderColor}`,
              opacity,
              cursor: isDefeated ? 'default' : 'pointer',
              boxShadow: isCurrent ? `0 0 8px ${factionColor}` : 'none',
            }}
          >
            <span style={{
              fontSize: '8px',
              fontWeight: isCurrent ? 'bold' : 'normal',
              color: isCurrent ? '#000' : isDefeated ? '#666' : '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}>
              {isDefeated ? '\u2715' : name.slice(0, 6)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: '108px',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: '3px',
  zIndex: 85,
  backgroundColor: 'rgba(10, 10, 15, 0.85)',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #333355',
  backdropFilter: 'blur(4px)',
  maxWidth: '80vw',
  overflowX: 'auto',
  flexWrap: 'nowrap',
}

const pipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '44px',
  height: '22px',
  borderRadius: '4px',
  flexShrink: 0,
  transition: 'all 0.2s',
}

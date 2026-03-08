import React from 'react'
import { useGameStore } from '../../store/game-store'
import { getFigureName } from '@engine/turn-machine-v2.js'
import type { GameState } from '@engine/types.js'

interface TurnIndicatorProps {
  gameState: GameState | null
  hideControls?: boolean
  compact?: boolean
}

const PHASE_COLORS: Record<string, string> = {
  Setup: '#999999',
  Initiative: '#ffd700',
  Activation: '#4a9eff',
  Status: '#44ff44',
  Reinforcement: '#ff4444',
  GameOver: '#ff4444',
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({ gameState, hideControls = false, compact = false }) => {
  const { advancePhase, imperialAIPhase, activeMission, campaignState } = useGameStore()
  const roundLimit = activeMission?.roundLimit ?? 0

  if (!gameState) return null

  const currentFigureId = gameState.activationOrder[gameState.currentActivationIndex]
  const currentFigure = gameState.figures.find(f => f.id === currentFigureId)
  // During Activation, derive the "current player" from the activating figure's owner
  // (not currentPlayerIndex, which tracks initiative winner and doesn't update per-figure)
  const currentPlayer = (gameState.turnPhase === 'Activation' && currentFigure)
    ? gameState.players.find(p => p.id === currentFigure.playerId) ?? gameState.players[gameState.currentPlayerIndex]
    : gameState.players[gameState.currentPlayerIndex]
  const isAITurn = currentFigure && gameState.players.find(p => p.id === currentFigure.playerId)?.isAI
  const figureName = currentFigure ? getFigureName(currentFigure, gameState) : currentFigure?.id

  const phaseColor = PHASE_COLORS[gameState.turnPhase] || '#999999'
  const isNonInteractivePhase = ['Setup', 'Initiative', 'Status', 'Reinforcement'].includes(gameState.turnPhase)
  const allActivationsDone = gameState.turnPhase === 'Activation'
    && currentFigure?.isActivated
    && gameState.currentActivationIndex + 1 >= gameState.activationOrder.length

  if (compact) {
    const roundsLeft = roundLimit > 0 ? roundLimit - gameState.roundNumber : -1
    const compactRoundColor = roundsLeft >= 0 && roundsLeft <= 2 ? '#ff4444' : '#ffd700'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
        <span style={{ color: compactRoundColor, fontWeight: 'bold' }}>
          R{gameState.roundNumber}{roundLimit > 0 ? `/${roundLimit}` : ''}
        </span>
        <span style={{ color: phaseColor, fontWeight: 'bold' }}>{gameState.turnPhase}</span>
        {isAITurn && imperialAIPhase && (
          <span style={{ color: '#ff4444', fontWeight: 'bold', animation: 'pulse 1.5s ease-in-out infinite' }}>
            ENEMY
          </span>
        )}
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(19, 19, 32, 0.95)',
    border: `2px solid ${phaseColor}`,
    borderRadius: '8px',
    padding: '12px 20px',
    textAlign: 'center',
    zIndex: 90,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    minWidth: '300px',
  }

  const roundStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#ffd700',
    marginBottom: '4px',
  }

  const phaseStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: phaseColor,
    marginBottom: '4px',
  }

  const playerStyle: React.CSSProperties = {
    fontSize: '12px',
    color: currentPlayer.role === 'Imperial' ? '#ff4444' : '#44ff44',
    marginBottom: '4px',
  }

  const figureStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#999999',
    marginBottom: '8px',
  }

  const buttonStyle: React.CSSProperties = {
    marginTop: '8px',
    padding: '6px 12px',
    backgroundColor: phaseColor,
    color: '#000000',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
    minWidth: '120px',
  }

  const roundsRemaining = roundLimit > 0 ? roundLimit - gameState.roundNumber : -1
  const urgencyColor = roundsRemaining >= 0 && roundsRemaining <= 2 ? '#ff4444'
    : roundsRemaining >= 0 && roundsRemaining <= 4 ? '#ffaa00'
    : '#ffd700'

  return (
    <div style={containerStyle}>
      <div style={{ ...roundStyle, color: urgencyColor }}>
        ROUND {gameState.roundNumber}{roundLimit > 0 ? ` / ${roundLimit}` : ''}
        {campaignState && (
          <span style={{
            fontSize: '9px',
            fontWeight: 'normal',
            marginLeft: '8px',
            padding: '1px 6px',
            borderRadius: '3px',
            backgroundColor: campaignState.difficulty === 'standard' ? 'rgba(68, 255, 68, 0.15)'
              : campaignState.difficulty === 'veteran' ? 'rgba(255, 170, 0, 0.15)'
              : 'rgba(255, 68, 68, 0.15)',
            color: campaignState.difficulty === 'standard' ? '#44ff44'
              : campaignState.difficulty === 'veteran' ? '#ffaa00'
              : '#ff4444',
            verticalAlign: 'middle',
          }}>
            {campaignState.difficulty.toUpperCase()}
          </span>
        )}
      </div>
      {roundsRemaining >= 0 && roundsRemaining <= 4 && (
        <div style={{
          fontSize: '10px',
          fontWeight: 'bold',
          color: urgencyColor,
          marginBottom: '4px',
          letterSpacing: '1px',
        }}>
          {roundsRemaining === 0 ? 'FINAL ROUND' : `${roundsRemaining} ROUND${roundsRemaining > 1 ? 'S' : ''} LEFT`}
        </div>
      )}
      <div style={phaseStyle}>{gameState.turnPhase}</div>
      <div style={playerStyle}>
        {currentPlayer.role === 'Imperial' ? '// ' : ':: '}{currentPlayer.name}
      </div>
      {gameState.turnPhase === 'Activation' && currentFigure && (
        <div style={figureStyle}>Activating: {figureName}</div>
      )}
      {isAITurn && imperialAIPhase && (
        <div style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#ff4444',
          padding: '4px 12px',
          backgroundColor: 'rgba(255, 68, 68, 0.15)',
          borderRadius: '4px',
          marginBottom: '4px',
        }}>
          ENEMY TURN{imperialAIPhase === 'thinking' ? ' - Analyzing...' : ' - Executing...'}
        </div>
      )}
      {!hideControls && isNonInteractivePhase && !gameState.winner && (
        <button
          style={{ ...buttonStyle, opacity: 0.7 }}
          onClick={() => advancePhase()}
        >
          Continuing...
        </button>
      )}
      {!hideControls && allActivationsDone && !gameState.winner && (
        <button
          style={{ ...buttonStyle, opacity: 0.7 }}
          onClick={() => advancePhase()}
        >
          All units done
        </button>
      )}
      {!hideControls && !isAITurn && !isNonInteractivePhase && !allActivationsDone && gameState.turnPhase === 'Activation' && (
        <button style={buttonStyle} onClick={() => advancePhase()}>
          Next Phase
        </button>
      )}
    </div>
  )
}

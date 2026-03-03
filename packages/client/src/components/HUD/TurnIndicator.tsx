import React from 'react'
import { useGameStore } from '../../store/game-store'
import type { GameState } from '@engine/types.js'

interface TurnIndicatorProps {
  gameState: GameState | null
  hideControls?: boolean
}

const PHASE_COLORS: Record<string, string> = {
  Setup: '#999999',
  Initiative: '#ffd700',
  Activation: '#4a9eff',
  Status: '#44ff44',
  Reinforcement: '#ff4444',
  GameOver: '#ff4444',
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({ gameState, hideControls = false }) => {
  const { advancePhase } = useGameStore()

  if (!gameState) return null

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const currentFigureId = gameState.activationOrder[gameState.currentActivationIndex]
  const currentFigure = gameState.figures.find(f => f.id === currentFigureId)

  const phaseColor = PHASE_COLORS[gameState.turnPhase] || '#999999'

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

  return (
    <div style={containerStyle}>
      <div style={roundStyle}>ROUND {gameState.roundNumber}</div>
      <div style={phaseStyle}>{gameState.turnPhase}</div>
      <div style={playerStyle}>
        {currentPlayer.role === 'Imperial' ? '⚔️' : '🎯'} {currentPlayer.name}
      </div>
      {gameState.turnPhase === 'Activation' && currentFigure && (
        <div style={figureStyle}>Activating: {currentFigure.id}</div>
      )}
      {!hideControls && (
        <button style={buttonStyle} onClick={() => advancePhase()}>
          Next Phase
        </button>
      )}
    </div>
  )
}

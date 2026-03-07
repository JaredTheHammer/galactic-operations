/**
 * CommandTokenPanel - Displays command token pools for both sides.
 *
 * Shows operative and imperial token counts with spend buttons.
 * Positioned in the HUD area alongside other tracker panels.
 */

import React from 'react'
import type { GameState } from '@engine/types.js'

interface CommandTokenPanelProps {
  gameState: GameState | null
  compact?: boolean
}

export const CommandTokenPanel: React.FC<CommandTokenPanelProps> = ({ gameState, compact = false }) => {
  if (!gameState?.commandTokens) return null

  const { operativeTokens, imperialTokens, operativeMaxPerRound, imperialMaxPerRound } = gameState.commandTokens

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
        <span style={{ color: '#00ccff' }} title="Operative tokens">{operativeTokens}</span>
        <span style={{ color: '#666' }}>/</span>
        <span style={{ color: '#ff4444' }} title="Imperial tokens">{imperialTokens}</span>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '300px',
    left: '20px',
    width: '180px',
    backgroundColor: 'rgba(19, 19, 32, 0.92)',
    border: '1px solid #00ccff',
    borderRadius: '6px',
    padding: '8px 10px',
    zIndex: 85,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#00ccff',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
    marginBottom: '8px',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  }

  const tokenDotStyle = (color: string, filled: boolean): React.CSSProperties => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: filled ? color : 'transparent',
    border: `1.5px solid ${color}`,
    display: 'inline-block',
    margin: '0 1px',
  })

  const renderTokenDots = (current: number, max: number, color: string) => {
    const dots = []
    for (let i = 0; i < max; i++) {
      dots.push(<span key={i} style={tokenDotStyle(color, i < current)} />)
    }
    return <div style={{ display: 'flex', gap: '2px' }}>{dots}</div>
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Command Tokens</div>
      <div style={rowStyle}>
        <span style={{ color: '#00ccff', fontSize: '10px' }}>Operative</span>
        {renderTokenDots(operativeTokens, operativeMaxPerRound, '#00ccff')}
      </div>
      <div style={rowStyle}>
        <span style={{ color: '#ff4444', fontSize: '10px' }}>Imperial</span>
        {renderTokenDots(imperialTokens, imperialMaxPerRound, '#ff4444')}
      </div>
    </div>
  )
}

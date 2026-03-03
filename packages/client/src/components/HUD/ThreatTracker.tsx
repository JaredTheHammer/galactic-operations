/**
 * ThreatTracker - Imperial threat pool display HUD element.
 *
 * Shows current threat pool value, income per round, and a visual bar.
 * Positioned top-left below MoraleTracker.
 * Flashes briefly when threat is spent on reinforcements.
 */

import React from 'react'
import type { GameState } from '@engine/types.js'
import { useGameStore } from '../../store/game-store'

interface ThreatTrackerProps {
  gameState: GameState | null
  compact?: boolean
}

export const ThreatTracker: React.FC<ThreatTrackerProps> = ({ gameState, compact = false }) => {
  const threatFlash = useGameStore(s => s.threatFlash)

  if (!gameState) return null

  const threat = gameState.threatPool ?? 0
  const income = gameState.reinforcementPoints ?? 0

  // Soft cap for bar visualization (most games won't exceed this)
  const barMax = 20
  const barPercent = Math.min((threat / barMax) * 100, 100)
  const isHigh = threat >= 12

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
        <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{threat}</span>
        <div style={{ width: '30px', height: '6px', backgroundColor: '#1a1a2e', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPercent}%`, backgroundColor: isHigh ? '#ff4444' : '#ffd700' }} />
        </div>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '220px',
    left: '20px',
    width: '180px',
    backgroundColor: threatFlash
      ? 'rgba(255, 215, 0, 0.12)'
      : 'rgba(19, 19, 32, 0.92)',
    border: '1px solid #ffd700',
    borderRadius: '6px',
    padding: '8px 10px',
    zIndex: 85,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
    transition: 'background-color 0.15s ease',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#ffd700',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
    marginBottom: '6px',
  }

  const valueStyle: React.CSSProperties = {
    fontSize: '22px',
    fontWeight: 'bold',
    color: isHigh ? '#ff4444' : '#ffd700',
    textAlign: 'center',
    lineHeight: '1',
    marginBottom: '6px',
  }

  const barContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '8px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #333355',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '4px',
  }

  const barFillStyle: React.CSSProperties = {
    height: '100%',
    width: `${barPercent}%`,
    backgroundColor: isHigh ? '#ff4444' : '#ffd700',
    transition: 'width 0.3s ease',
  }

  const incomeStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#999999',
    textAlign: 'center',
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Threat Pool</div>
      <div style={valueStyle}>{threat}</div>
      <div style={barContainerStyle}>
        <div style={barFillStyle} />
      </div>
      <div style={incomeStyle}>
        +{income}/round
      </div>
    </div>
  )
}

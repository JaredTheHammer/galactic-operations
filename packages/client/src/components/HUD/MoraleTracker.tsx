import React, { useEffect, useState } from 'react'
import type { GameState } from '@engine/types.js'

interface MoraleTrackerProps {
  gameState: GameState | null
}

const MORALE_COLORS: Record<string, string> = {
  Steady: '#44ff44',
  Shaken: '#ffff00',
  Wavering: '#ff9900',
  Broken: '#ff4444',
}

export const MoraleTracker: React.FC<MoraleTrackerProps> = ({ gameState }) => {
  const [imperialFlash, setImperialFlash] = useState(false)
  const [operativeFlash, setOperativeFlash] = useState(false)

  useEffect(() => {
    if (gameState?.imperialMorale.state === 'Shaken' || gameState?.imperialMorale.state === 'Broken') {
      setImperialFlash(true)
      const timer = setTimeout(() => setImperialFlash(false), 600)
      return () => clearTimeout(timer)
    }
  }, [gameState?.imperialMorale.state])

  useEffect(() => {
    if (gameState?.operativeMorale.state === 'Shaken' || gameState?.operativeMorale.state === 'Broken') {
      setOperativeFlash(true)
      const timer = setTimeout(() => setOperativeFlash(false), 600)
      return () => clearTimeout(timer)
    }
  }, [gameState?.operativeMorale.state])

  if (!gameState) return null

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    left: '20px',
    width: '240px',
    backgroundColor: 'rgba(19, 19, 32, 0.95)',
    border: '2px solid #4a9eff',
    borderRadius: '8px',
    padding: '12px',
    zIndex: 90,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
  }

  const trackerStyle = (side: 'imperial' | 'operative'): React.CSSProperties => {
    const morale = side === 'imperial' ? gameState.imperialMorale : gameState.operativeMorale
    const flash = side === 'imperial' ? imperialFlash : operativeFlash
    const color = side === 'imperial' ? '#ff4444' : '#44ff44'

    return {
      marginBottom: '12px',
      backgroundColor: flash ? 'rgba(255, 68, 68, 0.1)' : 'rgba(10, 10, 15, 0.5)',
      padding: '8px',
      borderRadius: '4px',
      border: `1px solid ${color}`,
      transition: 'background-color 0.1s',
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#999999',
    textTransform: 'uppercase',
    marginBottom: '4px',
  }

  const barContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '12px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #333355',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '4px',
  }

  const barFillStyle = (morale: any): React.CSSProperties => {
    const percent = (morale.value / morale.max) * 100
    const color = MORALE_COLORS[morale.state] || '#999999'

    return {
      height: '100%',
      width: `${percent}%`,
      backgroundColor: color,
      transition: 'width 0.3s, background-color 0.2s',
    }
  }

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
  }

  return (
    <div style={containerStyle}>
      <div style={trackerStyle('imperial')}>
        <div style={labelStyle}>⚔️ Imperial</div>
        <div style={barContainerStyle}>
          <div style={barFillStyle(gameState.imperialMorale)} />
        </div>
        <div style={statsStyle}>
          <span>
            {gameState.imperialMorale.value}/{gameState.imperialMorale.max}
          </span>
          <span style={{ color: MORALE_COLORS[gameState.imperialMorale.state] }}>
            {gameState.imperialMorale.state}
          </span>
        </div>
      </div>

      <div style={trackerStyle('operative')}>
        <div style={labelStyle}>🎯 Operative</div>
        <div style={barContainerStyle}>
          <div style={barFillStyle(gameState.operativeMorale)} />
        </div>
        <div style={statsStyle}>
          <span>
            {gameState.operativeMorale.value}/{gameState.operativeMorale.max}
          </span>
          <span style={{ color: MORALE_COLORS[gameState.operativeMorale.state] }}>
            {gameState.operativeMorale.state}
          </span>
        </div>
      </div>
    </div>
  )
}

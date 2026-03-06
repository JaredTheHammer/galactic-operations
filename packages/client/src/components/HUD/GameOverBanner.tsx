/**
 * GameOverBanner - Dramatic full-screen overlay when a mission ends.
 *
 * Shows VICTORY or DEFEAT with the victory condition text.
 * Displayed for 3 seconds before fading, then the PostMission screen takes over.
 */

import React, { useEffect, useState } from 'react'
import { useGameStore } from '../../store/game-store'

export const GameOverBanner: React.FC = () => {
  const gameOverBanner = useGameStore(s => s.gameOverBanner)
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!gameOverBanner) {
      setVisible(false)
      setFading(false)
      return
    }

    setVisible(true)
    setFading(false)

    const fadeTimer = setTimeout(() => setFading(true), 2800)
    const hideTimer = setTimeout(() => {
      setVisible(false)
      useGameStore.getState().clearGameOverBanner()
    }, 3600)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [gameOverBanner])

  if (!visible || !gameOverBanner) return null

  const isVictory = gameOverBanner.outcome === 'victory'
  const accentColor = isVictory ? '#ffd700' : '#ff4444'
  const bgGlow = isVictory ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 68, 68, 0.08)'

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
      pointerEvents: 'none',
      backgroundColor: fading ? 'transparent' : 'rgba(0, 0, 0, 0.7)',
      transition: 'background-color 0.8s ease-out',
    }}>
      <div style={{
        textAlign: 'center',
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(0.95)' : 'scale(1)',
        transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
        padding: '40px 60px',
        backgroundColor: bgGlow,
        borderRadius: '12px',
        border: `2px solid ${accentColor}40`,
      }}>
        {/* Main result */}
        <div style={{
          fontSize: '72px',
          fontWeight: 'bold',
          color: accentColor,
          textShadow: `0 0 40px ${accentColor}60, 0 0 80px ${accentColor}30`,
          letterSpacing: '10px',
          textTransform: 'uppercase',
        }}>
          {isVictory ? 'VICTORY' : 'DEFEAT'}
        </div>

        {/* Condition text */}
        {gameOverBanner.condition && (
          <div style={{
            fontSize: '16px',
            color: '#cccccc',
            marginTop: '16px',
            maxWidth: '400px',
            lineHeight: '1.5',
          }}>
            {gameOverBanner.condition}
          </div>
        )}

        {/* Round count */}
        {gameOverBanner.rounds && (
          <div style={{
            fontSize: '13px',
            color: '#666666',
            marginTop: '12px',
            letterSpacing: '1px',
          }}>
            Completed in {gameOverBanner.rounds} rounds
          </div>
        )}
      </div>
    </div>
  )
}

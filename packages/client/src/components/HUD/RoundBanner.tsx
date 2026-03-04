/**
 * RoundBanner - Full-width cinematic banner that flashes briefly
 * when a new combat round begins.
 *
 * Triggered by the game store setting `roundBanner` state.
 * Auto-dismisses after 2 seconds with a fade-out animation.
 */

import React, { useEffect, useState } from 'react'
import { useGameStore } from '../../store/game-store'

export const RoundBanner: React.FC = () => {
  const roundBanner = useGameStore(s => s.roundBanner)
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!roundBanner) {
      setVisible(false)
      setFading(false)
      return
    }

    setVisible(true)
    setFading(false)

    const fadeTimer = setTimeout(() => setFading(true), 1600)
    const hideTimer = setTimeout(() => {
      setVisible(false)
      useGameStore.getState().clearRoundBanner()
    }, 2200)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [roundBanner])

  if (!visible || !roundBanner) return null

  const isUrgent = roundBanner.roundsLeft != null && roundBanner.roundsLeft <= 3
  const accentColor = isUrgent ? '#ff4444' : '#ffd700'

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
      zIndex: 250,
      pointerEvents: 'none',
      backgroundColor: fading ? 'transparent' : 'rgba(0, 0, 0, 0.4)',
      transition: 'background-color 0.6s ease-out',
    }}>
      <div style={{
        textAlign: 'center',
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(1.1)' : 'scale(1)',
        transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
      }}>
        {/* Round number */}
        <div style={{
          fontSize: '56px',
          fontWeight: 'bold',
          color: accentColor,
          textShadow: `0 0 30px ${accentColor}80, 0 0 60px ${accentColor}40`,
          letterSpacing: '6px',
          textTransform: 'uppercase',
        }}>
          Round {roundBanner.round}
        </div>

        {/* Round limit info */}
        {roundBanner.roundLimit && (
          <div style={{
            fontSize: '16px',
            color: '#999999',
            marginTop: '8px',
            letterSpacing: '2px',
          }}>
            of {roundBanner.roundLimit}
          </div>
        )}

        {/* Urgency text */}
        {roundBanner.roundsLeft != null && roundBanner.roundsLeft <= 4 && (
          <div style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: isUrgent ? '#ff4444' : '#ff8844',
            marginTop: '12px',
            textTransform: 'uppercase',
            letterSpacing: '3px',
            textShadow: isUrgent ? '0 0 10px rgba(255,68,68,0.5)' : undefined,
          }}>
            {roundBanner.roundsLeft === 0
              ? 'FINAL ROUND'
              : `${roundBanner.roundsLeft} round${roundBanner.roundsLeft > 1 ? 's' : ''} remaining`}
          </div>
        )}
      </div>
    </div>
  )
}

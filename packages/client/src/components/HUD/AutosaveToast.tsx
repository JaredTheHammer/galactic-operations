import React, { useEffect, useState } from 'react'
import { useGameStore } from '../../store/game-store'

/**
 * A brief toast notification that appears when the campaign autosaves.
 * Shows "Saved" for 2 seconds, then fades out.
 */
export const AutosaveToast: React.FC = () => {
  const lastAutosaveTime = useGameStore(s => s.lastAutosaveTime)
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!lastAutosaveTime) return

    setVisible(true)
    setFading(false)

    const fadeTimer = setTimeout(() => setFading(true), 1500)
    const hideTimer = setTimeout(() => setVisible(false), 2200)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [lastAutosaveTime])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      backgroundColor: 'rgba(19, 19, 32, 0.9)',
      border: '1px solid #333355',
      borderRadius: '6px',
      fontSize: '11px',
      color: '#44ff44',
      zIndex: 50,
      pointerEvents: 'none',
      opacity: fading ? 0 : 0.8,
      transition: 'opacity 0.7s ease',
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke="#44ff44" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Saved
    </div>
  )
}

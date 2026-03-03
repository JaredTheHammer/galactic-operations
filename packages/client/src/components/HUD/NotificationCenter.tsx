/**
 * NotificationCenter - Two-tier notification/toast system.
 *
 * Renders two types of notifications:
 * 1. Narrative popups (isNarrative=true): cinematic center-screen overlays
 *    for mission-scripted reinforcement waves with narrativeText.
 * 2. Regular notifications: smaller top-center cards for threat-based
 *    reinforcement events and other alerts.
 *
 * All notifications auto-dismiss after their duration. Click to dismiss early.
 */

import React, { useEffect, useRef } from 'react'
import { useGameStore, type GameNotification } from '../../store/game-store'

// ============================================================================
// MAIN CONTAINER
// ============================================================================

export const NotificationCenter: React.FC = () => {
  const notifications = useGameStore(s => s.notifications)
  const removeNotification = useGameStore(s => s.removeNotification)

  if (notifications.length === 0) return null

  const narrativeNotifs = notifications.filter(n => n.isNarrative)
  const regularNotifs = notifications.filter(n => !n.isNarrative)

  return (
    <>
      {/* Narrative popups: center-screen, cinematic */}
      {narrativeNotifs.map(notif => (
        <NarrativePopup
          key={notif.id}
          notif={notif}
          onDismiss={() => removeNotification(notif.id)}
        />
      ))}

      {/* Regular notifications: top-center, stacked */}
      {regularNotifs.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 180,
          pointerEvents: 'none',
        }}>
          {regularNotifs.map(notif => (
            <RegularNotification
              key={notif.id}
              notif={notif}
              onDismiss={() => removeNotification(notif.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ============================================================================
// NARRATIVE POPUP (center-screen cinematic)
// ============================================================================

const NarrativePopup: React.FC<{ notif: GameNotification; onDismiss: () => void }> = ({
  notif,
  onDismiss,
}) => {
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '480px',
    maxWidth: '90vw',
    backgroundColor: 'rgba(10, 10, 15, 0.97)',
    border: '3px solid #ffd700',
    borderRadius: '10px',
    padding: '28px 32px',
    zIndex: 210,
    backdropFilter: 'blur(8px)',
    color: '#ffffff',
    textAlign: 'center',
    cursor: 'pointer',
    pointerEvents: 'auto',
    animation: 'fadeInScale 0.3s ease-out',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#ffd700',
    textTransform: 'uppercase',
    letterSpacing: '3px',
    marginBottom: '16px',
  }

  const messageStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#e8e8e8',
    lineHeight: '1.7',
    fontStyle: 'italic',
  }

  const hintStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#666666',
    marginTop: '16px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  }

  return (
    <div style={containerStyle} onClick={onDismiss}>
      <div style={titleStyle}>{notif.title}</div>
      <div style={messageStyle}>{notif.message}</div>
      <div style={hintStyle}>Click to dismiss</div>
    </div>
  )
}

// ============================================================================
// REGULAR NOTIFICATION (top-center card)
// ============================================================================

const RegularNotification: React.FC<{ notif: GameNotification; onDismiss: () => void }> = ({
  notif,
  onDismiss,
}) => {
  const BORDER_COLORS: Record<string, string> = {
    reinforcement: '#ff4444',
    objective: '#44ff44',
    info: '#4a9eff',
    narrative: '#ffd700',
  }

  const borderColor = BORDER_COLORS[notif.type] || '#4a9eff'

  const containerStyle: React.CSSProperties = {
    backgroundColor: 'rgba(19, 19, 32, 0.94)',
    border: `1px solid ${borderColor}`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: '6px',
    padding: '8px 14px',
    minWidth: '280px',
    maxWidth: '400px',
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    cursor: 'pointer',
    pointerEvents: 'auto',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 'bold',
    color: borderColor,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '2px',
  }

  const messageStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#cccccc',
    lineHeight: '1.3',
  }

  return (
    <div style={containerStyle} onClick={onDismiss}>
      <div style={titleStyle}>{notif.title}</div>
      <div style={messageStyle}>{notif.message}</div>
    </div>
  )
}

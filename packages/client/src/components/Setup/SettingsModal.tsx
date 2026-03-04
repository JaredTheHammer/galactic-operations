import React, { useState } from 'react'
import { t, mixins } from '../../styles/theme'

const CAMPAIGN_STORAGE_KEY = 'galactic-ops-campaign-save'

interface SettingsModalProps {
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)

  const hasSave = !!localStorage.getItem(CAMPAIGN_STORAGE_KEY)

  const handleClearSave = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    localStorage.removeItem(CAMPAIGN_STORAGE_KEY)
    setConfirmClear(false)
    setCleared(true)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        ...mixins.panel,
        maxWidth: '420px',
        width: '90%',
        padding: '24px',
        position: 'relative',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          fontSize: t.textXl,
          fontWeight: 'bold',
          color: t.accentGold,
          marginBottom: '20px',
          textAlign: 'center',
        }}>
          Settings
        </div>

        {/* Keyboard shortcuts reference */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ ...sectionLabel }}>Combat Keyboard Shortcuts</div>
          <div style={shortcutGrid}>
            <Shortcut k="I" desc="Aim" />
            <Shortcut k="R" desc="Rally" />
            <Shortcut k="D" desc="Dodge" />
            <Shortcut k="G" desc="Guard" />
            <Shortcut k="E" desc="End Turn" />
            <Shortcut k="N" desc="Next Phase" />
            <Shortcut k="Tab" desc="Cycle Units" />
            <Shortcut k="Esc" desc="Deselect" />
            <Shortcut k="Ctrl+Z" desc="Undo" />
          </div>
        </div>

        {/* Save data */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ ...sectionLabel }}>Save Data</div>
          {cleared ? (
            <div style={{ color: t.accentGreen, fontSize: t.textSm }}>
              Campaign save cleared.
            </div>
          ) : hasSave ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                style={{
                  ...mixins.buttonGhost,
                  color: confirmClear ? t.accentRed : t.textSecondary,
                  borderColor: confirmClear ? t.accentRed : t.border,
                  fontSize: t.textSm,
                }}
                onClick={handleClearSave}
              >
                {confirmClear ? 'Are you sure? Click again to confirm' : 'Clear Campaign Save'}
              </button>
              {confirmClear && (
                <button
                  style={{ ...mixins.buttonGhost, fontSize: t.textSm }}
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <div style={{ color: t.textMuted, fontSize: t.textSm }}>
              No saved campaign found.
            </div>
          )}
        </div>

        {/* Version info */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ ...sectionLabel }}>About</div>
          <div style={{ color: t.textMuted, fontSize: t.textSm, lineHeight: '1.5' }}>
            Galactic Operations v0.1.0<br />
            882 engine tests passing<br />
            3-act campaign with 15 missions
          </div>
        </div>

        <button
          style={{
            ...mixins.buttonPrimary,
            width: '100%',
            backgroundColor: t.bgSurface2,
            border: `1px solid ${t.border}`,
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  color: t.accentGold,
  textTransform: 'uppercase',
  fontWeight: 'bold',
  letterSpacing: '1px',
  marginBottom: '8px',
}

const shortcutGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '4px',
}

const Shortcut: React.FC<{ k: string; desc: string }> = ({ k, desc }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
    <span style={{
      backgroundColor: t.bgSurface2,
      border: `1px solid ${t.border}`,
      borderRadius: '3px',
      padding: '1px 6px',
      color: t.textPrimary,
      fontFamily: 'monospace',
      fontSize: '10px',
      minWidth: '36px',
      textAlign: 'center',
    }}>
      {k}
    </span>
    <span style={{ color: t.textSecondary }}>{desc}</span>
  </div>
)

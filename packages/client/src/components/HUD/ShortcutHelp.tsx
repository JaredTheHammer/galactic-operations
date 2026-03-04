import React, { useState, useEffect } from 'react'

const SHORTCUTS = [
  { key: 'I', action: 'Aim (gain aim token)' },
  { key: 'D', action: 'Dodge (gain dodge token)' },
  { key: 'G', action: 'Guard / Standby' },
  { key: 'C', action: 'Take Cover (+1 defense)' },
  { key: 'R', action: 'Rally (recover strain)' },
  { key: 'E', action: 'End Activation' },
  { key: 'N', action: 'Next Phase' },
  { key: 'Tab', action: 'Cycle friendly figures' },
  { key: 'Esc', action: 'Deselect figure' },
  { key: 'Ctrl+Z', action: 'Undo last action' },
  { key: '?', action: 'Toggle this help' },
]

export const ShortcutHelp: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setVisible(false)
      return
    }

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setVisible(v => !v)
      }
      if (e.key === 'Escape' && visible) {
        setVisible(false)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, visible])

  if (!visible) return null

  return (
    <div style={overlayStyle} onClick={() => setVisible(false)}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={titleStyle}>Keyboard Shortcuts</div>
        <div style={gridStyle}>
          {SHORTCUTS.map(s => (
            <React.Fragment key={s.key}>
              <kbd style={kbdStyle}>{s.key}</kbd>
              <span style={descStyle}>{s.action}</span>
            </React.Fragment>
          ))}
        </div>
        <div style={hintStyle}>Click anywhere or press ? to close</div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(10, 10, 15, 0.85)',
  zIndex: 250,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const panelStyle: React.CSSProperties = {
  backgroundColor: '#131320',
  border: '2px solid #4a9eff',
  borderRadius: '12px',
  padding: '24px 32px',
  maxWidth: '360px',
  width: '90%',
}

const titleStyle: React.CSSProperties = {
  color: '#4a9eff',
  fontSize: '14px',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  marginBottom: '16px',
  textAlign: 'center',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '8px 16px',
  alignItems: 'center',
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  backgroundColor: '#0a0a1a',
  border: '1px solid #4a9eff',
  borderRadius: '4px',
  color: '#ffd700',
  fontFamily: 'monospace',
  fontSize: '12px',
  fontWeight: 'bold',
  textAlign: 'center',
  minWidth: '36px',
}

const descStyle: React.CSSProperties = {
  color: '#ccc',
  fontSize: '12px',
}

const hintStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '10px',
  textAlign: 'center',
  marginTop: '16px',
}

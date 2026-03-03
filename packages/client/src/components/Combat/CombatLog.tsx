import React, { useEffect, useRef } from 'react'

interface CombatLogProps {
  messages: string[]
  compact?: boolean
  visible?: boolean
  onClose?: () => void
}

export const CombatLog: React.FC<CombatLogProps> = ({ messages, compact = false, visible, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (compact) {
    if (!visible) return null
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(10, 10, 15, 0.98)',
        zIndex: 300,
        display: 'flex', flexDirection: 'column',
        padding: '16px',
        paddingTop: 'calc(16px + var(--safe-top))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '14px' }}>Combat Log</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #333355',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, fontFamily: 'monospace', lineHeight: '1.4', fontSize: '12px', color: '#ffffff' }}>
          {messages.length === 0 ? (
            <div style={{ color: '#999999', textAlign: 'center', padding: '20px 0' }}>
              No events yet
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} style={{ marginBottom: '4px', padding: '2px 0', borderBottom: '1px solid rgba(74, 158, 255, 0.1)' }}>
                {msg}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '320px',
    maxHeight: '240px',
    backgroundColor: 'rgba(19, 19, 32, 0.9)',
    border: '2px solid #4a9eff',
    borderRadius: '8px',
    padding: '12px',
    zIndex: 80,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '11px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }

  const logStyle: React.CSSProperties = {
    overflowY: 'auto',
    flex: 1,
    fontFamily: 'monospace',
    lineHeight: '1.4',
  }

  const messageStyle: React.CSSProperties = {
    marginBottom: '4px',
    padding: '2px 0',
    borderBottom: '1px solid rgba(74, 158, 255, 0.1)',
  }

  const headerStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#4a9eff',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: '8px',
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Combat Log</div>
      <div ref={scrollRef} style={logStyle}>
        {messages.length === 0 ? (
          <div style={{ color: '#999999', textAlign: 'center', padding: '20px 0' }}>
            No events yet
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={messageStyle}>
              {msg}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

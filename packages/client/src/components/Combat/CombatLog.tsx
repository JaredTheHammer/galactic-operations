import React, { useEffect, useRef } from 'react'

interface CombatLogProps {
  messages: string[]
}

export const CombatLog: React.FC<CombatLogProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

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

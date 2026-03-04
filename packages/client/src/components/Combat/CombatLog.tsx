import React, { useEffect, useRef, useMemo } from 'react'

// ============================================================================
// Event type detection from log message strings
// ============================================================================

type LogEventType =
  | 'attack'
  | 'defeat'
  | 'movement'
  | 'defense'
  | 'talent'
  | 'consumable'
  | 'tacticCard'
  | 'reinforcement'
  | 'phaseChange'
  | 'victory'
  | 'missionFail'
  | 'aiDecision'
  | 'aiAction'
  | 'roundEnd'
  | 'info'

const EVENT_COLORS: Record<LogEventType, string> = {
  attack:        '#ff6b6b',  // red
  defeat:        '#ff4444',  // bright red
  movement:      '#8bc6fc',  // light blue
  defense:       '#66d9ef',  // cyan
  talent:        '#e6c84c',  // gold
  consumable:    '#a3e635',  // lime
  tacticCard:    '#c084fc',  // purple
  reinforcement: '#f97316',  // orange
  phaseChange:   '#6b7280',  // gray
  victory:       '#22c55e',  // green
  missionFail:   '#ef4444',  // red
  aiDecision:    '#a78bfa',  // violet
  aiAction:      '#93a0b4',  // muted
  roundEnd:      '#6b7280',  // gray
  info:          '#d1d5db',  // light gray
}

/** Match patterns to classify log messages by event type */
function classifyMessage(msg: string): LogEventType {
  // Strip round prefix for pattern matching
  const text = msg.replace(/^\[R\d+\]\s*/, '')

  if (/\*\*\s*VICTORY/i.test(text)) return 'victory'
  if (/\*\*\s*MISSION FAILED/i.test(text)) return 'missionFail'
  if (/\*\*\s*MISSION\s+(OPERATIVE|IMPERIAL)/i.test(text)) return 'victory'
  if (/!!.*defeated!/i.test(text)) return 'defeat'
  if (/^Combat:|wounds? dealt|hit for \d+/i.test(text)) return 'attack'
  if (/moved to/i.test(text)) return 'movement'
  if (/aimed|dodge|guarded stance|rallied/i.test(text)) return 'defense'
  if (/used talent:/i.test(text)) return 'talent'
  if (/used .+ on /i.test(text)) return 'consumable'
  if (/tactic card/i.test(text)) return 'tacticCard'
  if (/DEPLOYED:|REINFORCEMENT:|--- Reinforcement/i.test(text)) return 'reinforcement'
  if (/Phase advanced to/i.test(text)) return 'phaseChange'
  if (/All units activated/i.test(text)) return 'roundEnd'
  if (/activation ended/i.test(text)) return 'roundEnd'
  if (/^AI \[/i.test(text)) return 'aiDecision'
  if (/^\s*->/i.test(text)) return 'aiAction'

  return 'info'
}

/** Extract round number from [R5] prefix, or null */
function extractRound(msg: string): number | null {
  const m = msg.match(/^\[R(\d+)\]/)
  return m ? parseInt(m[1], 10) : null
}

/** Strip the [R#] prefix for display */
function stripRoundPrefix(msg: string): string {
  return msg.replace(/^\[R\d+\]\s*/, '')
}

// ============================================================================
// Structured entry used for rendering
// ============================================================================

interface ParsedEntry {
  raw: string
  text: string
  round: number | null
  type: LogEventType
  color: string
}

function parseEntries(messages: string[]): ParsedEntry[] {
  return messages.map(msg => {
    const type = classifyMessage(msg)
    return {
      raw: msg,
      text: stripRoundPrefix(msg),
      round: extractRound(msg),
      type,
      color: EVENT_COLORS[type],
    }
  })
}

// ============================================================================
// Component
// ============================================================================

interface CombatLogProps {
  messages: string[]
  compact?: boolean
  visible?: boolean
  onClose?: () => void
}

export const CombatLog: React.FC<CombatLogProps> = ({ messages, compact = false, visible, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => parseEntries(messages), [messages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  /** Render a single log entry with color and optional round separator */
  const renderEntry = (entry: ParsedEntry, idx: number) => {
    const showRoundSeparator =
      entry.round !== null &&
      idx > 0 &&
      entries[idx - 1].round !== null &&
      entries[idx - 1].round !== entry.round

    const isHighlight =
      entry.type === 'victory' ||
      entry.type === 'missionFail' ||
      entry.type === 'defeat'

    return (
      <React.Fragment key={idx}>
        {showRoundSeparator && (
          <div style={roundSepStyle}>
            Round {entry.round}
          </div>
        )}
        <div style={{
          ...msgBaseStyle,
          color: entry.color,
          fontWeight: isHighlight ? 'bold' : 'normal',
          backgroundColor: isHighlight ? 'rgba(255,255,255,0.05)' : 'transparent',
          borderLeft: `2px solid ${entry.color}33`,
          paddingLeft: '6px',
        }}>
          {entry.text}
        </div>
      </React.Fragment>
    )
  }

  if (compact) {
    if (!visible) return null
    return (
      <div style={compactOverlayStyle}>
        <div style={compactHeaderRow}>
          <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '14px' }}>Combat Log</span>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>
        <div ref={scrollRef} style={compactScrollStyle}>
          {entries.length === 0 ? (
            <div style={emptyStyle}>No events yet</div>
          ) : (
            entries.map(renderEntry)
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Combat Log</div>
      <div ref={scrollRef} style={logStyle}>
        {entries.length === 0 ? (
          <div style={emptyStyle}>No events yet</div>
        ) : (
          entries.map(renderEntry)
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const compactOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(10, 10, 15, 0.98)',
  zIndex: 300,
  display: 'flex', flexDirection: 'column',
  padding: '16px',
  paddingTop: 'calc(16px + var(--safe-top))',
}

const compactHeaderRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px',
}

const compactScrollStyle: React.CSSProperties = {
  overflowY: 'auto', flex: 1, fontFamily: 'monospace', lineHeight: '1.4', fontSize: '12px',
}

const closeButtonStyle: React.CSSProperties = {
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

const headerStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#4a9eff',
  textTransform: 'uppercase',
  fontWeight: 'bold',
  marginBottom: '8px',
}

const msgBaseStyle: React.CSSProperties = {
  marginBottom: '2px',
  padding: '2px 0',
}

const roundSepStyle: React.CSSProperties = {
  margin: '8px 0 4px',
  padding: '2px 8px',
  fontSize: '9px',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  color: '#4a9eff',
  borderTop: '1px solid #333355',
  borderBottom: '1px solid #333355',
  backgroundColor: 'rgba(74, 158, 255, 0.08)',
}

const emptyStyle: React.CSSProperties = {
  color: '#999999', textAlign: 'center', padding: '20px 0',
}

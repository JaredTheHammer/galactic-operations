import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { t } from '../../styles/theme'

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
  attack:        '#ff6b6b',
  defeat:        '#ff4444',
  movement:      '#8bc6fc',
  defense:       '#66d9ef',
  talent:        '#e6c84c',
  consumable:    '#a3e635',
  tacticCard:    '#c084fc',
  reinforcement: '#f97316',
  phaseChange:   '#6b7280',
  victory:       '#22c55e',
  missionFail:   '#ef4444',
  aiDecision:    '#a78bfa',
  aiAction:      '#93a0b4',
  roundEnd:      '#6b7280',
  info:          '#d1d5db',
}

/** Match patterns to classify log messages by event type */
function classifyMessage(msg: string): LogEventType {
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
// Filter categories (grouped event types)
// ============================================================================

type FilterCategory = 'combat' | 'movement' | 'defense' | 'abilities' | 'ai' | 'system'

const FILTER_CATEGORIES: { key: FilterCategory; label: string; color: string; types: LogEventType[] }[] = [
  { key: 'combat',    label: 'Combat',   color: '#ff6b6b', types: ['attack', 'defeat'] },
  { key: 'movement',  label: 'Move',     color: '#8bc6fc', types: ['movement'] },
  { key: 'defense',   label: 'Defense',  color: '#66d9ef', types: ['defense'] },
  { key: 'abilities', label: 'Abilities', color: '#e6c84c', types: ['talent', 'consumable', 'tacticCard'] },
  { key: 'ai',        label: 'AI',       color: '#a78bfa', types: ['aiDecision', 'aiAction'] },
  { key: 'system',    label: 'System',   color: '#6b7280', types: ['phaseChange', 'roundEnd', 'reinforcement', 'info', 'victory', 'missionFail'] },
]

// Build lookup: eventType -> category key
const TYPE_TO_CATEGORY = {} as Record<LogEventType, FilterCategory>
for (const cat of FILTER_CATEGORIES) {
  for (const t of cat.types) {
    TYPE_TO_CATEGORY[t] = cat.key
  }
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
  category: FilterCategory
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
      category: TYPE_TO_CATEGORY[type] ?? 'system',
    }
  })
}

// ============================================================================
// Inline text formatting: bold **text**, damage numbers, unit names
// ============================================================================

function formatLogText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Split on bold markers, damage numbers, and keywords
  const regex = /(\*\*[^*]+\*\*)|(\d+ wounds?)|(\d+ strain)|(defeated!)|(\d+ damage)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  const r = new RegExp(regex)
  while ((match = r.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const m = match[0]
    if (m.startsWith('**') && m.endsWith('**')) {
      parts.push(<strong key={match.index} style={{ color: t.textPrimary }}>{m.slice(2, -2)}</strong>)
    } else if (/defeated!/i.test(m)) {
      parts.push(<strong key={match.index} style={{ color: t.accentRed }}>{m}</strong>)
    } else if (/wounds?/i.test(m)) {
      parts.push(<span key={match.index} style={{ color: t.accentOrange, fontWeight: 'bold' }}>{m}</span>)
    } else if (/strain/i.test(m)) {
      parts.push(<span key={match.index} style={{ color: t.accentBlue, fontWeight: 'bold' }}>{m}</span>)
    } else if (/damage/i.test(m)) {
      parts.push(<span key={match.index} style={{ color: t.accentOrange, fontWeight: 'bold' }}>{m}</span>)
    } else {
      parts.push(m)
    }

    lastIndex = match.index + m.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
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
  const [disabledCategories, setDisabledCategories] = useState<Set<FilterCategory>>(new Set())

  const entries = useMemo(() => parseEntries(messages), [messages])

  const filteredEntries = useMemo(() => {
    if (disabledCategories.size === 0) return entries
    return entries.filter(e => !disabledCategories.has(e.category))
  }, [entries, disabledCategories])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredEntries])

  const toggleCategory = useCallback((cat: FilterCategory) => {
    setDisabledCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  /** Render filter chips */
  const renderFilters = () => (
    <div style={{
      display: 'flex',
      gap: '3px',
      flexWrap: 'wrap',
      marginBottom: '6px',
    }}>
      {FILTER_CATEGORIES.map(cat => {
        const active = !disabledCategories.has(cat.key)
        return (
          <button
            key={cat.key}
            onClick={() => toggleCategory(cat.key)}
            style={{
              background: active ? `${cat.color}20` : 'transparent',
              border: `1px solid ${active ? cat.color + '60' : t.border}`,
              borderRadius: '3px',
              color: active ? cat.color : t.textDim,
              padding: '1px 5px',
              fontSize: '9px',
              fontWeight: 'bold',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              transition: 'all 0.15s',
            }}
          >
            {cat.label}
          </button>
        )
      })}
    </div>
  )

  /** Render a single log entry with color and optional round separator */
  const renderEntry = (entry: ParsedEntry, idx: number) => {
    // Find previous visible entry for round separator logic
    const prevIdx = filteredEntries.indexOf(entry) - 1
    const prevEntry = prevIdx >= 0 ? filteredEntries[prevIdx] : null
    const showRoundSeparator =
      entry.round !== null &&
      prevEntry !== null &&
      prevEntry.round !== null &&
      prevEntry.round !== entry.round

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
          {formatLogText(entry.text)}
        </div>
      </React.Fragment>
    )
  }

  if (compact) {
    if (!visible) return null
    return (
      <div style={compactOverlayStyle}>
        <div style={compactHeaderRow}>
          <span style={{ color: t.accentGold, fontWeight: 'bold', fontSize: '14px' }}>Combat Log</span>
          <button onClick={onClose} style={closeButtonStyle}>&#x2715;</button>
        </div>
        {renderFilters()}
        <div ref={scrollRef} style={compactScrollStyle}>
          {filteredEntries.length === 0 ? (
            <div style={emptyStyle}>
              {entries.length === 0 ? 'No events yet' : 'All events filtered out'}
            </div>
          ) : (
            filteredEntries.map(renderEntry)
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>Combat Log</span>
        <span style={{ color: t.textDim, fontSize: '9px', fontWeight: 'normal' }}>
          {filteredEntries.length}/{entries.length}
        </span>
      </div>
      {renderFilters()}
      <div ref={scrollRef} style={logStyle}>
        {filteredEntries.length === 0 ? (
          <div style={emptyStyle}>
            {entries.length === 0 ? 'No events yet' : 'All events filtered out'}
          </div>
        ) : (
          filteredEntries.map(renderEntry)
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
  border: `1px solid ${t.border}`,
  color: t.textPrimary,
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
  width: '340px',
  maxHeight: '280px',
  backgroundColor: t.panelBg,
  border: `2px solid ${t.accentBlue}`,
  borderRadius: t.radiusMd,
  padding: '10px',
  zIndex: 80,
  backdropFilter: 'blur(4px)',
  color: t.textPrimary,
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
  color: t.accentBlue,
  textTransform: 'uppercase',
  fontWeight: 'bold',
  marginBottom: '4px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
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
  color: t.accentBlue,
  borderTop: `1px solid ${t.border}`,
  borderBottom: `1px solid ${t.border}`,
  backgroundColor: 'rgba(74, 158, 255, 0.08)',
}

const emptyStyle: React.CSSProperties = {
  color: t.textMuted, textAlign: 'center', padding: '20px 0',
}

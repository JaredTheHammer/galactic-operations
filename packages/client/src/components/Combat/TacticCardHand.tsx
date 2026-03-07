import React, { useState } from 'react'
import { useGameStore } from '../../store/game-store'
import type { TacticCard } from '@engine/types.js'
import { t } from '../../styles/theme'

interface TacticCardHandProps {
  cards: TacticCard[] | null
  side: 'attacker' | 'defender'
  isActive: boolean
}

const altModeTypeLabels: Record<string, string> = {
  movement: 'Move',
  action_point: 'Action',
  defense_stance: 'Defense',
  strain_recovery: 'Strain',
  draw_card: 'Draw',
}

const altModeTypeColors: Record<string, string> = {
  movement: '#ffaa00',
  action_point: '#ff44ff',
  defense_stance: '#4a9eff',
  strain_recovery: '#44ff44',
  draw_card: '#ff8844',
}

export const TacticCardHand: React.FC<TacticCardHandProps> = ({ cards, side, isActive }) => {
  const { playTacticCard, playTacticCardAltMode } = useGameStore()
  const [altModeCardId, setAltModeCardId] = useState<string | null>(null)

  if (!cards || cards.length === 0) {
    return (
      <div style={{ padding: '12px', color: t.textMuted, textAlign: 'center', fontSize: '12px' }}>
        No cards in hand
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    padding: '12px',
    flexWrap: 'wrap',
  }

  const timingColor: Record<string, string> = {
    Attack: t.accentRed,
    Defense: t.accentBlue,
    Any: t.accentGold,
  }

  const cardStyle = (card: TacticCard): React.CSSProperties => {
    const isValid = (
      (side === 'attacker' && ['Attack', 'Any'].includes(card.timing)) ||
      (side === 'defender' && ['Defense', 'Any'].includes(card.timing))
    )
    const isShowingAlt = altModeCardId === card.id

    return {
      width: '120px',
      padding: '8px',
      backgroundColor: isShowingAlt ? '#1a1a2e' : isValid ? t.panelBg : t.bgSurface2,
      border: `2px solid ${isShowingAlt && card.altMode ? altModeTypeColors[card.altMode.type] : timingColor[card.timing]}`,
      borderRadius: '4px',
      cursor: isValid && isActive ? 'pointer' : 'default',
      opacity: isValid && isActive ? 1 : 0.6,
      transition: 'all 0.2s',
      color: t.textPrimary,
      fontSize: '10px',
      position: 'relative' as const,
    }
  }

  const handleCardClick = (card: TacticCard) => {
    const isValid = (
      (side === 'attacker' && ['Attack', 'Any'].includes(card.timing)) ||
      (side === 'defender' && ['Defense', 'Any'].includes(card.timing))
    )

    if (isValid && isActive) {
      if (altModeCardId === card.id) {
        // Already showing alt mode, click again to dismiss
        setAltModeCardId(null)
      } else {
        playTacticCard(card.id, side)
      }
    }
  }

  const handleAltModeClick = (e: React.MouseEvent, card: TacticCard) => {
    e.stopPropagation()
    if (!isActive || !card.altMode) return

    if (altModeCardId === card.id) {
      // Confirmed: play in alt mode
      playTacticCardAltMode(card.id)
      setAltModeCardId(null)
    } else {
      // Show alt mode preview
      setAltModeCardId(card.id)
    }
  }

  return (
    <div style={containerStyle}>
      {cards.map(card => (
        <button
          key={card.id}
          style={cardStyle(card)}
          onClick={() => handleCardClick(card)}
          title={altModeCardId === card.id && card.altMode ? card.altMode.text : card.text}
        >
          {/* Alt mode indicator dot */}
          {card.altMode && altModeCardId !== card.id && (
            <div
              style={{
                position: 'absolute', top: '3px', right: '3px',
                width: '6px', height: '6px', borderRadius: '50%',
                backgroundColor: altModeTypeColors[card.altMode.type],
              }}
              title="Dual-use card: right-click for alt mode"
            />
          )}

          {altModeCardId === card.id && card.altMode ? (
            /* Alt mode view */
            <>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>
                {card.name}
              </div>
              <div style={{
                fontSize: '9px',
                color: altModeTypeColors[card.altMode.type],
                marginBottom: '4px',
                fontWeight: 'bold',
              }}>
                ALT: {altModeTypeLabels[card.altMode.type]} +{card.altMode.value}
              </div>
              <div style={{ fontSize: '8px', color: t.textMuted, marginBottom: '4px' }}>
                {card.altMode.text}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <span
                  onClick={(e) => handleAltModeClick(e, card)}
                  style={{
                    fontSize: '8px', fontWeight: 'bold', cursor: 'pointer',
                    color: '#44ff44', textDecoration: 'underline',
                  }}
                >
                  USE ALT
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); setAltModeCardId(null) }}
                  style={{
                    fontSize: '8px', cursor: 'pointer',
                    color: t.textMuted,
                  }}
                >
                  BACK
                </span>
              </div>
            </>
          ) : (
            /* Normal combat view */
            <>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>
                {card.name}
              </div>
              <div
                style={{
                  fontSize: '9px',
                  color: timingColor[card.timing],
                  marginBottom: '4px',
                }}
              >
                {card.timing}
              </div>
              <div style={{
                fontSize: '9px', color: t.textMuted,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>Cost: {card.cost}</span>
                {card.altMode && isActive && (
                  <span
                    onClick={(e) => handleAltModeClick(e, card)}
                    style={{
                      fontSize: '8px', cursor: 'pointer',
                      color: altModeTypeColors[card.altMode.type],
                      fontWeight: 'bold',
                    }}
                    title={card.altMode.text}
                  >
                    ALT
                  </span>
                )}
              </div>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

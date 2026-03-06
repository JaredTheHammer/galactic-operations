import React from 'react'
import { useGameStore } from '../../store/game-store'
import type { TacticCard } from '@engine/types.js'
import { t } from '../../styles/theme'

interface TacticCardHandProps {
  cards: TacticCard[] | null
  side: 'attacker' | 'defender'
  isActive: boolean
}

export const TacticCardHand: React.FC<TacticCardHandProps> = ({ cards, side, isActive }) => {
  const { playTacticCard } = useGameStore()

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

    return {
      width: '120px',
      padding: '8px',
      backgroundColor: isValid ? t.panelBg : t.bgSurface2,
      border: `2px solid ${timingColor[card.timing]}`,
      borderRadius: '4px',
      cursor: isValid && isActive ? 'pointer' : 'default',
      opacity: isValid && isActive ? 1 : 0.6,
      transition: 'all 0.2s',
      color: t.textPrimary,
      fontSize: '10px',
    }
  }

  const handleCardClick = (card: TacticCard) => {
    const isValid = (
      (side === 'attacker' && ['Attack', 'Any'].includes(card.timing)) ||
      (side === 'defender' && ['Defense', 'Any'].includes(card.timing))
    )

    if (isValid && isActive) {
      playTacticCard(card.id, side)
    }
  }

  return (
    <div style={containerStyle}>
      {cards.map(card => (
        <button
          key={card.id}
          style={cardStyle(card)}
          onClick={() => handleCardClick(card)}
          title={card.text}
        >
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
          <div style={{ fontSize: '9px', color: t.textMuted }}>Cost: {card.cost}</div>
        </button>
      ))}
    </div>
  )
}

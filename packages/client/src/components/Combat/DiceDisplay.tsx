import React, { useState, useEffect } from 'react'
import type { D6RollResult, D6DieType } from '@engine/types.js'
import { t } from '../../styles/theme'

interface DiceDisplayProps {
  rolls: D6RollResult[] | null
  isRolling?: boolean
}

/** Map die types to theme color tokens */
const DIE_COLORS: Record<D6DieType | string, string> = {
  ability: t.diceAbility,
  proficiency: t.diceProficiency,
  difficulty: t.diceDifficulty,
  challenge: t.diceChallenge,
}

/** Summarize a single die result into a compact symbol string */
function summarizeDie(roll: D6RollResult): string {
  const parts: string[] = []
  if (roll.successes > 0) parts.push('S'.repeat(roll.successes))
  if (roll.advantages > 0) parts.push('A'.repeat(roll.advantages))
  if (roll.triumphs > 0) parts.push('T'.repeat(roll.triumphs))
  if (roll.failures > 0) parts.push('F'.repeat(roll.failures))
  if (roll.threats > 0) parts.push('H'.repeat(roll.threats))
  if (roll.despairs > 0) parts.push('D'.repeat(roll.despairs))
  return parts.join('') || '·'
}

export const DiceDisplay: React.FC<DiceDisplayProps> = ({ rolls, isRolling }) => {
  const [animatingDice, setAnimatingDice] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (isRolling && rolls) {
      setAnimatingDice(new Set(rolls.map((_, i) => i)))
      const timer = setTimeout(() => setAnimatingDice(new Set()), 800)
      return () => clearTimeout(timer)
    }
  }, [isRolling, rolls])

  if (!rolls || rolls.length === 0) {
    return (
      <div style={{ padding: '12px', color: t.textMuted, textAlign: 'center' }}>
        No dice rolled
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: '12px',
  }

  const dieStyle = (roll: D6RollResult, index: number): React.CSSProperties => {
    const isAnimating = animatingDice.has(index)
    const color = DIE_COLORS[roll.dieType] || t.textPrimary

    return {
      width: '52px',
      height: '52px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      border: `2px solid ${color}`,
      borderRadius: '4px',
      color: t.textPrimary,
      fontSize: isAnimating ? '20px' : '14px',
      fontWeight: 'bold',
      transition: 'transform 0.1s, font-size 0.1s',
      transform: isAnimating ? 'scale(1.1) rotate(180deg)' : 'scale(1) rotate(0deg)',
      cursor: 'default',
      userSelect: 'none',
    }
  }

  return (
    <div style={containerStyle}>
      {rolls.map((roll, index) => (
        <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={dieStyle(roll, index)}>
            {summarizeDie(roll)}
          </div>
          <div style={{
            fontSize: '9px',
            color: DIE_COLORS[roll.dieType] || t.textPrimary,
            marginTop: '2px',
            textTransform: 'uppercase',
          }}>
            {roll.dieType}
          </div>
        </div>
      ))}
    </div>
  )
}

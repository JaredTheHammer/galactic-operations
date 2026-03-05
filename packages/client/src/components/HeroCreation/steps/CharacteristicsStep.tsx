/**
 * CharacteristicsStep.tsx -- Characteristic allocation with +/- controls.
 * Uses 2-column grid on mobile for compactness.
 * Derived stats (WT, ST, Soak) shown as horizontal badges.
 */

import React from 'react'
import type { SpeciesDefinition, Characteristics, CharacteristicName } from '@engine/types.js'
import { computeWoundThreshold, computeStrainThreshold, computeSoak } from '@engine/character-v2.js'
import { colors, wizardStyles as ws } from '../shared/wizardStyles'

const CHAR_NAMES: CharacteristicName[] = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence']

interface CharacteristicsStepProps {
  species: SpeciesDefinition
  charIncreases: Partial<Characteristics>
  currentChars: Characteristics
  xpRemaining: number
  selectedSkills: Record<string, number>
  onIncrease: (char: CharacteristicName) => void
  onDecrease: (char: CharacteristicName) => void
  isMobile: boolean
}

/** XP cost to raise a characteristic from N to N+1 during creation */
function charUpgradeCost(currentValue: number): number {
  return (currentValue + 1) * 10
}

export default function CharacteristicsStep({
  species, charIncreases, currentChars, xpRemaining, selectedSkills,
  onIncrease, onDecrease, isMobile,
}: CharacteristicsStepProps) {
  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 4 } : {}),
      }}>Allocate Characteristics</h3>
      <div style={{
        ...ws.hint,
        fontSize: isMobile ? 10 : 11,
        marginBottom: isMobile ? 8 : 10,
      }}>
        Cost: (new value) x 10 XP. Permanent at creation.
      </div>

      <div style={{
        ...ws.charGrid,
        ...(isMobile ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 } : {}),
      }}>
        {CHAR_NAMES.map(c => {
          const base = species.characteristics[c]
          const inc = charIncreases[c] ?? 0
          const current = base + inc
          const upgradeCost = current < 5 ? charUpgradeCost(current) : 0
          return (
            <div key={c} style={{
              ...ws.charRow,
              ...(isMobile ? { gap: 4 } : {}),
            }}>
              <span style={{
                ...ws.charLabel,
                ...(isMobile ? { width: 'auto', fontSize: 11, minWidth: 50 } : {}),
              }}>{c.toUpperCase()}</span>
              {!isMobile && <span style={ws.charBase}>(base {base})</span>}
              <button
                style={{
                  ...ws.charBtn,
                  ...(isMobile ? { width: 24, height: 24, fontSize: 14 } : {}),
                }}
                onClick={() => onDecrease(c)}
                disabled={inc <= 0}
              >-</button>
              <span style={{
                ...ws.charValue,
                ...(isMobile ? { width: 22, fontSize: 15 } : {}),
              }}>{current}</span>
              <button
                style={{
                  ...ws.charBtn,
                  ...(isMobile ? { width: 24, height: 24, fontSize: 14 } : {}),
                }}
                onClick={() => onIncrease(c)}
                disabled={current >= 5 || upgradeCost > xpRemaining}
              >+</button>
              {current < 5 && <span style={{
                ...ws.charCost,
                ...(isMobile ? { fontSize: 10 } : {}),
              }}>{upgradeCost} XP</span>}
            </div>
          )
        })}
      </div>

      {/* Derived stats as horizontal badges */}
      <div style={{
        display: 'flex',
        gap: isMobile ? 8 : 16,
        marginTop: isMobile ? 10 : 16,
        padding: '8px 12px',
        backgroundColor: colors.panel,
        borderRadius: 4,
        fontSize: isMobile ? 12 : 13,
        color: '#d1d5db',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <span>WT {computeWoundThreshold(species, currentChars)}</span>
        <span>ST {computeStrainThreshold(species, currentChars)}</span>
        <span>Soak {computeSoak(currentChars, selectedSkills)}</span>
      </div>
    </div>
  )
}

/**
 * SpeciesStep.tsx -- Compact species selection with detail panel.
 * Shows species as scannable rows with inline stat chips.
 * Selected species expands a detail panel with description and derived stats.
 */

import React from 'react'
import type { SpeciesDefinition, CharacteristicName } from '@engine/types.js'
import { compactCardStyle, detailPanelStyle, colors, wizardStyles as ws } from '../shared/wizardStyles'

const CHAR_NAMES: CharacteristicName[] = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence']
const CHAR_ABBREV: Record<CharacteristicName, string> = {
  brawn: 'BR', agility: 'AG', intellect: 'INT', cunning: 'CUN', willpower: 'WIL', presence: 'PR',
}

interface SpeciesStepProps {
  speciesList: SpeciesDefinition[]
  selectedSpecies: string | null
  onSelectSpecies: (id: string) => void
  isMobile: boolean
}

export default function SpeciesStep({ speciesList, selectedSpecies, onSelectSpecies, isMobile }: SpeciesStepProps) {
  const selected = speciesList.find(s => s.id === selectedSpecies)

  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
      }}>Choose Species</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6 }}>
        {speciesList.map(sp => {
          const isSelected = selectedSpecies === sp.id
          return (
            <div
              key={sp.id}
              style={compactCardStyle(isSelected)}
              onClick={() => onSelectSpecies(sp.id)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontWeight: 'bold',
                    fontSize: isMobile ? 13 : 14,
                    color: colors.textBright,
                  }}>{sp.name}</span>
                  <span style={{
                    fontSize: isMobile ? 10 : 11,
                    color: colors.accent,
                    fontWeight: 'bold',
                  }}>XP {sp.startingXP}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {CHAR_NAMES.map(c => (
                    <span key={c} style={{
                      ...ws.statChip,
                      fontSize: isMobile ? 9 : 10,
                      padding: '1px 4px',
                    }}>
                      {CHAR_ABBREV[c]}{sp.characteristics[c]}
                    </span>
                  ))}
                </div>
              </div>
              {isSelected && (
                <span style={{ color: colors.accent, fontSize: 16, flexShrink: 0 }}>{'\u2713'}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail panel for selected species */}
      {selected && (
        <div style={detailPanelStyle}>
          <div style={{ marginBottom: 6, color: colors.textSecondary, fontSize: isMobile ? 11 : 12 }}>
            {selected.description}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={ws.statChip}>WT {selected.woundBase} + Brawn</span>
            <span style={ws.statChip}>ST {selected.strainBase} + Willpower</span>
            <span style={ws.statChip}>XP {selected.startingXP}</span>
          </div>
        </div>
      )}
    </div>
  )
}

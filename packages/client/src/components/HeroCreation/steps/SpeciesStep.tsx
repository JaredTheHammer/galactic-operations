/**
 * SpeciesStep.tsx -- Species selection with search, category filters, and detail panel.
 * Handles 70+ species with text search and stat-focus filter chips.
 * Selected species expands a detail panel with description, abilities, and derived stats.
 */

import React, { useState, useMemo } from 'react'
import type { SpeciesDefinition, CharacteristicName } from '@engine/types.js'
import { compactCardStyle, detailPanelStyle, filterChipStyle, colors, wizardStyles as ws } from '../shared/wizardStyles'

const CHAR_NAMES: CharacteristicName[] = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence']
const CHAR_ABBREV: Record<CharacteristicName, string> = {
  brawn: 'BR', agility: 'AG', intellect: 'INT', cunning: 'CUN', willpower: 'WIL', presence: 'PR',
}

type CategoryFilter = 'all' | 'brawny' | 'agile' | 'brainy' | 'cunning' | 'resolute' | 'charismatic' | 'balanced' | 'small' | 'droid'

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  brawny: 'Brawny',
  agile: 'Agile',
  brainy: 'Brainy',
  cunning: 'Cunning',
  resolute: 'Resolute',
  charismatic: 'Charismatic',
  balanced: 'Balanced',
  small: 'Small',
  droid: 'Droid',
}

function getSpeciesCategory(sp: SpeciesDefinition): CategoryFilter[] {
  const c = sp.characteristics
  const cats: CategoryFilter[] = []
  if (sp.creatureType === 'droid') cats.push('droid')
  if (c.brawn >= 3) cats.push('brawny')
  if (c.agility >= 3) cats.push('agile')
  if (c.intellect >= 3) cats.push('brainy')
  if (c.cunning >= 3) cats.push('cunning')
  if (c.willpower >= 3) cats.push('resolute')
  if (c.presence >= 3) cats.push('charismatic')
  const allEqual = CHAR_NAMES.every(n => c[n] === 2)
  if (allEqual) cats.push('balanced')
  const hasSmall = sp.abilities?.some(a => a.effect.type === 'silhouette_small')
  if (hasSmall) cats.push('small')
  if (cats.length === 0) cats.push('balanced')
  return cats
}

interface SpeciesStepProps {
  speciesList: SpeciesDefinition[]
  selectedSpecies: string | null
  onSelectSpecies: (id: string) => void
  isMobile: boolean
}

export default function SpeciesStep({ speciesList, selectedSpecies, onSelectSpecies, isMobile }: SpeciesStepProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')

  const filtered = useMemo(() => {
    let list = speciesList
    if (category !== 'all') {
      list = list.filter(sp => getSpeciesCategory(sp).includes(category))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(sp =>
        sp.name.toLowerCase().includes(q) ||
        sp.description.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [speciesList, search, category])

  const selected = speciesList.find(s => s.id === selectedSpecies)

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: speciesList.length,
      brawny: 0, agile: 0, brainy: 0, cunning: 0,
      resolute: 0, charismatic: 0, balanced: 0, small: 0, droid: 0,
    }
    for (const sp of speciesList) {
      for (const cat of getSpeciesCategory(sp)) {
        counts[cat]++
      }
    }
    return counts
  }, [speciesList])

  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
      }}>Choose Species</h3>

      {/* Search input */}
      <div style={{ marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search species..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            ...ws.nameInput,
            width: '100%',
            boxSizing: 'border-box',
            fontSize: isMobile ? 12 : 13,
          }}
        />
      </div>

      {/* Category filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map(cat => (
          categoryCounts[cat] > 0 && (
            <button
              key={cat}
              style={filterChipStyle(category === cat, isMobile)}
              onClick={() => setCategory(cat)}
            >
              {CATEGORY_LABELS[cat]} ({categoryCounts[cat]})
            </button>
          )
        ))}
      </div>

      {/* Species count */}
      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>
        {filtered.length} species{search || category !== 'all' ? ' matching' : ''}
      </div>

      {/* Species list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6 }}>
        {filtered.map(sp => {
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
                  {CHAR_NAMES.map(c => {
                    const val = sp.characteristics[c]
                    const isHigh = val >= 3
                    const isLow = val <= 1
                    return (
                      <span key={c} style={{
                        ...ws.statChip,
                        fontSize: isMobile ? 9 : 10,
                        padding: '1px 4px',
                        ...(isHigh ? { color: colors.accent, borderColor: colors.accent } : {}),
                        ...(isLow ? { color: colors.textMuted, opacity: 0.7 } : {}),
                      }}>
                        {CHAR_ABBREV[c]}{val}
                      </span>
                    )
                  })}
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

          {/* Species abilities */}
          {selected.abilities && selected.abilities.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: colors.accent,
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}>
                Species Abilities
              </div>
              {selected.abilities.map(ability => (
                <div key={ability.id} style={{
                  marginBottom: 4,
                  padding: '4px 8px',
                  backgroundColor: 'rgba(251, 191, 36, 0.06)',
                  borderRadius: 4,
                  border: `1px solid ${colors.border}`,
                }}>
                  <span style={{
                    fontWeight: 'bold',
                    fontSize: isMobile ? 11 : 12,
                    color: colors.textBright,
                  }}>{ability.name}</span>
                  <span style={{
                    fontSize: isMobile ? 10 : 11,
                    color: colors.textSecondary,
                    marginLeft: 8,
                  }}>{ability.description}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={ws.statChip}>WT {selected.woundBase} + Brawn</span>
            <span style={ws.statChip}>ST {selected.strainBase} + Willpower</span>
            <span style={ws.statChip}>Speed {selected.speed}</span>
            <span style={ws.statChip}>XP {selected.startingXP}</span>
          </div>
        </div>
      )}
    </div>
  )
}

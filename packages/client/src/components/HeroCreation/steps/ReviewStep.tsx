/**
 * ReviewStep.tsx -- Final review before hero creation.
 * Streamlined layout: identity line, name+portrait, compact stats, equipment summary.
 */

import React from 'react'
import type {
  SpeciesDefinition, CareerDefinition, SpecializationDefinition,
  Characteristics, CharacteristicName, WeaponDefinition, ArmorDefinition,
  TalentCard,
} from '@engine/types.js'
import { computeWoundThreshold, computeStrainThreshold, computeSoak } from '@engine/character-v2.js'
import { PortraitPicker } from '../../Portrait/PortraitPicker'
import { colors, wizardStyles as ws } from '../shared/wizardStyles'

const CHAR_NAMES: CharacteristicName[] = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence']
const CHAR_ABBREV: Record<CharacteristicName, string> = {
  brawn: 'BR', agility: 'AG', intellect: 'INT', cunning: 'CUN', willpower: 'WIL', presence: 'PR',
}

interface ReviewStepProps {
  species: SpeciesDefinition
  career: CareerDefinition | null
  specDef: (SpecializationDefinition & { talents: TalentCard[] }) | null
  currentChars: Characteristics
  charIncreases: Partial<Characteristics>
  selectedSkills: Record<string, number>
  selectedWeapon: string | null
  selectedArmor: string | null
  weaponDef: WeaponDefinition | null
  armorDef: ArmorDefinition | null
  heroName: string
  onSetHeroName: (name: string) => void
  selectedPortraitId: string | null
  onSetPortraitId: (id: string | null) => void
  xpRemaining: number
  isMobile: boolean
}

export default function ReviewStep({
  species, career, specDef, currentChars, charIncreases, selectedSkills,
  selectedWeapon, selectedArmor, weaponDef, armorDef,
  heroName, onSetHeroName, selectedPortraitId, onSetPortraitId,
  xpRemaining, isMobile,
}: ReviewStepProps) {
  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
      }}>Review Hero</h3>

      {/* Identity line */}
      <div style={{
        fontSize: isMobile ? 12 : 14,
        color: colors.accent,
        fontWeight: 'bold',
        marginBottom: isMobile ? 8 : 10,
      }}>
        {species.name} {career?.name}{specDef ? ` (${specDef.name})` : ''}
        <span style={{ color: colors.textMuted, fontWeight: 'normal', marginLeft: 8, fontSize: isMobile ? 10 : 12 }}>
          XP: {xpRemaining}
        </span>
      </div>

      {/* Name input */}
      <div style={{ marginBottom: isMobile ? 8 : 12 }}>
        <label style={{ color: colors.textSecondary, marginRight: 8, fontSize: isMobile ? 11 : 12 }}>Name:</label>
        <input
          type="text"
          value={heroName}
          onChange={e => onSetHeroName(e.target.value)}
          placeholder="Enter hero name..."
          style={{
            ...ws.nameInput,
            ...(isMobile ? { width: '100%', fontSize: 13, boxSizing: 'border-box' as const } : {}),
          }}
        />
      </div>

      {/* Portrait picker */}
      <div style={{ marginBottom: isMobile ? 8 : 12 }}>
        <label style={{ color: colors.textSecondary, display: 'block', marginBottom: 4, fontSize: isMobile ? 11 : 12 }}>Portrait:</label>
        <PortraitPicker
          selectedPortraitId={selectedPortraitId}
          onSelect={onSetPortraitId}
          placeholder="No portrait (uses silhouette)"
          defaultTags={[
            'character',
            ...(species ? [species.name.toLowerCase()] : []),
          ]}
        />
      </div>

      {/* Characteristics as badge row */}
      <div style={{ ...ws.statRow, marginBottom: 6 }}>
        {CHAR_NAMES.map(c => (
          <span key={c} style={{
            ...ws.statChip,
            backgroundColor: (charIncreases[c] ?? 0) > 0 ? colors.successDim : colors.panel,
            fontSize: isMobile ? 10 : 11,
          }}>
            {CHAR_ABBREV[c]} {currentChars[c]}
          </span>
        ))}
      </div>

      {/* Derived stats */}
      <div style={{ ...ws.statRow, marginBottom: 8 }}>
        <span style={ws.statChip}>WT {computeWoundThreshold(species, currentChars)}</span>
        <span style={ws.statChip}>ST {computeStrainThreshold(species, currentChars)}</span>
        <span style={ws.statChip}>Soak {computeSoak(currentChars, selectedSkills)}</span>
      </div>

      {/* Skills */}
      {Object.keys(selectedSkills).length > 0 && (
        <div style={{ color: colors.textSecondary, fontSize: isMobile ? 11 : 12, marginBottom: 4 }}>
          <strong>Skills:</strong> {Object.entries(selectedSkills).map(([s, r]) => `${s} ${r}`).join(', ')}
        </div>
      )}

      {/* Equipment */}
      <div style={{ color: colors.textSecondary, fontSize: isMobile ? 11 : 12 }}>
        <strong>Gear:</strong>{' '}
        {weaponDef?.name ?? 'Fists'}
        {' + '}
        {armorDef?.name ?? 'None'}
      </div>
    </div>
  )
}

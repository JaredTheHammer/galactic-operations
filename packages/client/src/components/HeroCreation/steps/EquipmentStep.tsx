/**
 * EquipmentStep.tsx -- Tabbed equipment selection with weapon category filters.
 *
 * Two tabs: WEAPON and ARMOR. Weapon tab has filter chips by category
 * (All, Melee, Pistol, Rifle, Heavy). Compact rows instead of full cards.
 * Selection summary bar shows current picks persistently.
 */

import React, { useState, useMemo } from 'react'
import type { WeaponDefinition, ArmorDefinition, WeaponQuality } from '@engine/types.js'
import {
  colors, wizardStyles as ws,
  tabBarStyle, tabStyle, filterChipStyle, equipRowStyle, selectionSummaryStyle,
} from '../shared/wizardStyles'

type EquipTab = 'weapon' | 'armor'

const WEAPON_CATEGORIES = [
  { id: 'all',    label: 'All' },
  { id: 'melee',  label: 'Melee',  skills: ['brawl', 'melee'] },
  { id: 'pistol', label: 'Pistol', skills: ['ranged-light'] },
  { id: 'rifle',  label: 'Rifle',  skills: ['ranged-heavy'] },
  { id: 'heavy',  label: 'Heavy',  skills: ['gunnery'] },
] as const

interface EquipmentStepProps {
  weaponList: WeaponDefinition[]
  armorList: ArmorDefinition[]
  selectedWeapon: string | null
  selectedArmor: string | null
  onSelectWeapon: (id: string) => void
  onSelectArmor: (id: string | null) => void
  isMobile: boolean
}

export default function EquipmentStep({
  weaponList, armorList, selectedWeapon, selectedArmor,
  onSelectWeapon, onSelectArmor, isMobile,
}: EquipmentStepProps) {
  const [equipTab, setEquipTab] = useState<EquipTab>('weapon')
  const [weaponFilter, setWeaponFilter] = useState('all')

  const weaponName = weaponList.find(w => w.id === selectedWeapon)?.name ?? null
  const armorName = armorList.find(a => a.id === selectedArmor)?.name ?? null

  const filteredWeapons = useMemo(() => {
    if (weaponFilter === 'all') return weaponList
    const cat = WEAPON_CATEGORIES.find(c => c.id === weaponFilter)
    if (!cat || !('skills' in cat)) return weaponList
    return weaponList.filter(w => (cat.skills as readonly string[]).includes(w.skill))
  }, [weaponList, weaponFilter])

  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 6 } : {}),
      }}>Choose Equipment</h3>

      {/* Selection summary */}
      <div style={selectionSummaryStyle}>
        <span style={{ color: weaponName ? colors.accent : colors.textMuted }}>
          {weaponName ?? 'No weapon'}
        </span>
        {' + '}
        <span style={{ color: armorName ? colors.accent : colors.textMuted }}>
          {armorName ?? 'No armor'}
        </span>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        <button style={tabStyle(equipTab === 'weapon', isMobile)} onClick={() => setEquipTab('weapon')}>
          WEAPON{weaponName ? ` \u2713` : ''}
        </button>
        <button style={tabStyle(equipTab === 'armor', isMobile)} onClick={() => setEquipTab('armor')}>
          ARMOR{armorName ? ` \u2713` : ''}
        </button>
      </div>

      {/* Weapon tab */}
      {equipTab === 'weapon' && (
        <div>
          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {WEAPON_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                style={filterChipStyle(weaponFilter === cat.id, isMobile)}
                onClick={() => setWeaponFilter(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Weapon rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 3 : 4 }}>
            {filteredWeapons.map(w => (
              <div
                key={w.id}
                style={equipRowStyle(selectedWeapon === w.id)}
                onClick={() => onSelectWeapon(w.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 'bold',
                    fontSize: isMobile ? 12 : 13,
                    color: colors.textBright,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{w.name}</div>
                  {w.qualities.length > 0 && (
                    <div style={{
                      fontSize: isMobile ? 9 : 10,
                      color: colors.textMuted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {w.qualities.map((q: WeaponQuality) => q.value != null ? `${q.name} ${q.value}` : q.name).join(', ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  <span style={{ ...ws.statChip, fontSize: isMobile ? 9 : 10, padding: '1px 4px' }}>
                    {w.baseDamage}{w.damageAddBrawn ? '+BR' : ''}
                  </span>
                  <span style={{ ...ws.statChip, fontSize: isMobile ? 9 : 10, padding: '1px 4px' }}>
                    {w.range}
                  </span>
                  <span style={{ ...ws.statChip, fontSize: isMobile ? 9 : 10, padding: '1px 4px' }}>
                    C{w.critical}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Armor tab */}
      {equipTab === 'armor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 3 : 4 }}>
          {armorList.map(a => (
            <div
              key={a.id}
              style={equipRowStyle(selectedArmor === a.id)}
              onClick={() => onSelectArmor(selectedArmor === a.id ? null : a.id)}
            >
              <span style={{
                fontWeight: 'bold',
                fontSize: isMobile ? 12 : 13,
                color: colors.textBright,
              }}>{a.name}</span>
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                <span style={{ ...ws.statChip, fontSize: isMobile ? 9 : 10, padding: '1px 4px' }}>
                  Soak +{a.soak}
                </span>
                {a.defense > 0 && (
                  <span style={{ ...ws.statChip, fontSize: isMobile ? 9 : 10, padding: '1px 4px' }}>
                    Def {a.defense}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

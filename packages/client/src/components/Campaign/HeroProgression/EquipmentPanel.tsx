import React, { useState } from 'react'
import type { HeroCharacter, WeaponDefinition, ArmorDefinition } from '@engine/types.js'
import type { EquipmentSlot } from '@engine/character-v2.js'
import { getInventory } from '@engine/campaign-v2.js'
import { useGameStore } from '../../../store/game-store'
import { useIsMobile } from '../../../hooks/useIsMobile'

interface EquipmentPanelProps {
  hero: HeroCharacter
}

export const EquipmentPanel: React.FC<EquipmentPanelProps> = ({ hero }) => {
  const { campaignState, gameData, equipHeroItem, unequipHeroItem } = useGameStore()
  const { isMobile } = useIsMobile()
  const [expandedSlot, setExpandedSlot] = useState<EquipmentSlot | null>(null)

  if (!campaignState || !gameData) return null

  const inventory = getInventory(campaignState)

  // Separate inventory into weapons and armor
  const availableWeapons = inventory
    .filter(id => gameData.weapons[id])
    .reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1
      return acc
    }, {})

  const availableArmor = inventory
    .filter(id => gameData.armor[id])
    .reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1
      return acc
    }, {})

  const containerStyle: React.CSSProperties = {
    maxWidth: isMobile ? '100%' : '700px',
    margin: '0 auto',
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: isMobile ? '16px' : '24px',
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '12px' : '13px',
    fontWeight: 'bold',
    color: '#bb99ff',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
    paddingBottom: '6px',
    borderBottom: '1px solid #333355',
  }

  const slotCardStyle: React.CSSProperties = {
    padding: isMobile ? '12px' : '14px',
    backgroundColor: '#131320',
    borderRadius: '8px',
    border: '1px solid #333355',
    marginBottom: '8px',
  }

  const itemRowStyle = (isHighlighted: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: isMobile ? '10px 8px' : '8px 10px',
    borderRadius: '4px',
    marginBottom: '4px',
    backgroundColor: isHighlighted ? '#1a1a2e' : '#0f0f1a',
    border: isHighlighted ? '1px solid #bb99ff' : '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  const btnStyle = (enabled: boolean, variant: 'equip' | 'remove' = 'equip'): React.CSSProperties => ({
    padding: isMobile ? '8px 14px' : '4px 12px',
    fontSize: isMobile ? '11px' : '11px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '4px',
    cursor: enabled ? 'pointer' : 'default',
    backgroundColor: enabled
      ? (variant === 'remove' ? '#3a1a1a' : '#2a1a3a')
      : '#1a1a1a',
    color: enabled
      ? (variant === 'remove' ? '#ff6666' : '#bb99ff')
      : '#444',
    opacity: enabled ? 1 : 0.5,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    transition: 'all 0.2s',
    flexShrink: 0,
    minHeight: isMobile ? '44px' : 'auto',
  })

  function renderEquippedSlot(
    label: string,
    slot: EquipmentSlot,
    itemId: string | null,
    itemDef: WeaponDefinition | ArmorDefinition | undefined,
  ) {
    const isExpanded = expandedSlot === slot
    const items = slot === 'armor' ? availableArmor : availableWeapons

    return (
      <div key={slot} style={slotCardStyle}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: isExpanded ? '10px' : 0,
        }}>
          <div>
            <div style={{
              fontSize: '10px',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '2px',
            }}>
              {label}
            </div>
            <div style={{
              fontSize: isMobile ? '14px' : '15px',
              color: itemId ? '#fff' : '#555',
              fontWeight: itemId ? 'bold' : 'normal',
            }}>
              {itemDef ? itemDef.name : 'Empty'}
            </div>
            {itemDef && renderItemStats(itemDef, slot)}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {itemId && (
              <button
                style={btnStyle(true, 'remove')}
                onClick={() => unequipHeroItem(hero.id, slot)}
              >
                Unequip
              </button>
            )}
            <button
              style={btnStyle(Object.keys(items).length > 0)}
              onClick={() => {
                if (Object.keys(items).length > 0) {
                  setExpandedSlot(isExpanded ? null : slot)
                }
              }}
              disabled={Object.keys(items).length === 0}
            >
              {isExpanded ? 'Close' : 'Change'}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div style={{
            borderTop: '1px solid #333355',
            paddingTop: '8px',
          }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
              Available in inventory:
            </div>
            {Object.entries(items).length === 0 ? (
              <div style={{ color: '#555', fontSize: '12px', padding: '8px' }}>
                No items available. Purchase from shops or collect from missions.
              </div>
            ) : (
              Object.entries(items).map(([id, count]) => {
                const def = slot === 'armor'
                  ? gameData!.armor[id]
                  : gameData!.weapons[id]
                if (!def) return null
                return (
                  <div
                    key={id}
                    style={itemRowStyle(false)}
                    onClick={() => {
                      equipHeroItem(hero.id, slot, id)
                      setExpandedSlot(null)
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>
                        {def.name}
                        {count > 1 && (
                          <span style={{ color: '#888', fontWeight: 'normal', marginLeft: '6px' }}>
                            x{count}
                          </span>
                        )}
                      </div>
                      {renderItemStats(def, slot)}
                    </div>
                    <button
                      style={btnStyle(true)}
                      onClick={(e) => {
                        e.stopPropagation()
                        equipHeroItem(hero.id, slot, id)
                        setExpandedSlot(null)
                      }}
                    >
                      Equip
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    )
  }

  function renderItemStats(def: WeaponDefinition | ArmorDefinition, slot: EquipmentSlot) {
    if (slot === 'armor') {
      const armor = def as ArmorDefinition
      return (
        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', display: 'flex', gap: '10px' }}>
          <span>Soak +{armor.soak}</span>
          {armor.defense > 0 && <span>Defense +{armor.defense}</span>}
          <span>Enc {armor.encumbrance}</span>
          {armor.keywords.length > 0 && (
            <span style={{ color: '#99bbdd' }}>{armor.keywords.join(', ')}</span>
          )}
        </div>
      )
    }

    const weapon = def as WeaponDefinition
    return (
      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <span>Dmg {weapon.baseDamage}{weapon.damageAddBrawn ? '+Br' : ''}</span>
        <span>Crit {weapon.critical}</span>
        <span>{weapon.range}</span>
        <span>Enc {weapon.encumbrance}</span>
        {weapon.qualities.length > 0 && (
          <span style={{ color: '#99bbdd' }}>
            {weapon.qualities.map(q => q.value !== null ? `${q.name} ${q.value}` : q.name).join(', ')}
          </span>
        )}
      </div>
    )
  }

  // Current equipment lookups
  const primaryWeaponDef = hero.equipment.primaryWeapon
    ? gameData.weapons[hero.equipment.primaryWeapon]
    : undefined
  const secondaryWeaponDef = hero.equipment.secondaryWeapon
    ? gameData.weapons[hero.equipment.secondaryWeapon]
    : undefined
  const armorDef = hero.equipment.armor
    ? gameData.armor[hero.equipment.armor]
    : undefined

  return (
    <div style={containerStyle}>
      {/* Hero stat summary */}
      <div style={{
        textAlign: 'center',
        padding: isMobile ? '10px' : '12px',
        marginBottom: isMobile ? '10px' : '16px',
        backgroundColor: '#131320',
        borderRadius: '8px',
        border: '1px solid #333355',
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Soak</div>
          <div style={{ fontSize: '20px', color: '#bb99ff', fontWeight: 'bold' }}>{hero.soak}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Wounds</div>
          <div style={{ fontSize: '20px', color: '#ff9966', fontWeight: 'bold' }}>{hero.wounds.threshold}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Strain</div>
          <div style={{ fontSize: '20px', color: '#6699ff', fontWeight: 'bold' }}>{hero.strain.threshold}</div>
        </div>
      </div>

      {/* Equipped Loadout */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Current Loadout</div>
        {renderEquippedSlot('Primary Weapon', 'primaryWeapon', hero.equipment.primaryWeapon, primaryWeaponDef)}
        {renderEquippedSlot('Secondary Weapon', 'secondaryWeapon', hero.equipment.secondaryWeapon, secondaryWeaponDef)}
        {renderEquippedSlot('Armor', 'armor', hero.equipment.armor, armorDef)}
      </div>

      {/* Inventory Summary */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Inventory</div>
        {inventory.length === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#555',
            fontSize: '13px',
            backgroundColor: '#0f0f1a',
            borderRadius: '8px',
          }}>
            No unequipped items. Purchase from shops or collect from missions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries({ ...availableWeapons, ...availableArmor }).map(([id, count]) => {
              const def = gameData.weapons[id] || gameData.armor[id]
              if (!def) return null
              return (
                <div key={id} style={{
                  padding: '6px 10px',
                  backgroundColor: '#131320',
                  border: '1px solid #333355',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#ccc',
                }}>
                  {def.name}{count > 1 ? ` x${count}` : ''}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

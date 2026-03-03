import React, { useState } from 'react'
import type { HeroCharacter, TalentCard, TalentSlot } from '@engine/types.js'
import { TALENT_XP_COST } from '@engine/character-v2.js'
import { useGameStore } from '../../../store/game-store'

interface TalentPyramidEditorProps {
  hero: HeroCharacter
}

const ACTIVATION_COLORS: Record<string, string> = {
  passive: '#44ff44',
  action: '#9966ff',
  maneuver: '#ff8844',
  incidental: '#4a9eff',
}

const SLOTS_PER_TIER: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 }

export const TalentPyramidEditor: React.FC<TalentPyramidEditorProps> = ({ hero }) => {
  const { gameData, purchaseHeroTalent } = useGameStore()
  const [openSlot, setOpenSlot] = useState<{ tier: number; position: number } | null>(null)
  const [hoveredTalentId, setHoveredTalentId] = useState<string | null>(null)

  if (!gameData) return null

  // Build talent card lookup from hero's specializations
  const allTalentCards: Map<string, TalentCard> = new Map()
  for (const specId of hero.specializations) {
    const spec = gameData.specializations[specId]
    if (spec) {
      for (const card of spec.talents) {
        allTalentCards.set(card.id, card)
      }
    }
  }

  // Count filled slots per tier
  const filledByTier: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const placedTalentIds = new Set<string>()
  for (const slot of hero.talents) {
    if (slot.talentId) {
      filledByTier[slot.tier] = (filledByTier[slot.tier] ?? 0) + 1
      placedTalentIds.add(slot.talentId)
    }
  }

  // Determine if a slot is purchasable
  function isSlotPurchasable(slot: TalentSlot): boolean {
    if (slot.talentId !== null) return false
    const cost = TALENT_XP_COST[slot.tier]
    if (hero.xp.available < cost) return false
    // Need at least 1 talent in the tier below (except tier 1)
    if (slot.tier > 1 && filledByTier[slot.tier - 1] === 0) return false
    // Wide Base Rule: 4th Tier 2 slot requires all 5 Tier 1 filled
    if (slot.tier === 2 && filledByTier[2] >= 3 && filledByTier[1] < 5) return false
    return true
  }

  // Get lock reason for a slot
  function getLockReason(slot: TalentSlot): string | null {
    if (slot.talentId !== null) return null
    const cost = TALENT_XP_COST[slot.tier]
    if (hero.xp.available < cost) return `Need ${cost} XP (have ${hero.xp.available})`
    if (slot.tier > 1 && filledByTier[slot.tier - 1] === 0) {
      return `Fill at least 1 Tier ${slot.tier - 1} slot first`
    }
    if (slot.tier === 2 && filledByTier[2] >= 3 && filledByTier[1] < 5) {
      return 'Wide Base Rule: fill all 5 Tier 1 slots first'
    }
    return null
  }

  // Get available talents for a tier
  function getAvailableTalents(tier: number): TalentCard[] {
    const available: TalentCard[] = []
    for (const card of allTalentCards.values()) {
      if (card.tier !== tier) continue
      // Non-ranked talents can only be placed once
      if (!card.ranked && placedTalentIds.has(card.id)) continue
      available.push(card)
    }
    return available.sort((a, b) => a.name.localeCompare(b.name))
  }

  function handleSlotClick(slot: TalentSlot, e: React.MouseEvent) {
    if (slot.talentId !== null) return
    if (!isSlotPurchasable(slot)) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 })
    setOpenSlot({ tier: slot.tier, position: slot.position })
  }

  function handleSelectTalent(talentId: string) {
    if (!openSlot) return
    purchaseHeroTalent(hero.id, talentId, openSlot.tier as 1 | 2 | 3 | 4 | 5, openSlot.position)
    setOpenSlot(null)
  }

  // Organize slots into tiers
  const slotsByTier: Record<number, TalentSlot[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const slot of hero.talents) {
    if (slotsByTier[slot.tier]) {
      slotsByTier[slot.tier].push(slot)
    }
  }
  // Sort by position within each tier
  for (const tier of Object.keys(slotsByTier)) {
    slotsByTier[Number(tier)].sort((a, b) => a.position - b.position)
  }

  const pyramidStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 0',
  }

  const tierLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '2px',
  }

  const xpSummaryStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#131320',
    borderRadius: '8px',
    border: '1px solid #333355',
  }

  // Dropdown for talent selection -- uses fixed positioning to escape overflow containers
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    top: dropdownPos?.top ?? 0,
    left: dropdownPos?.left ?? 0,
    transform: 'translateX(-50%)',
    zIndex: 1000,
    backgroundColor: '#1a1a2e',
    border: '2px solid #bb99ff',
    borderRadius: '6px',
    padding: '6px',
    minWidth: '280px',
    maxHeight: '300px',
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  }

  return (
    <div>
      {/* XP Summary */}
      <div style={xpSummaryStyle}>
        <span style={{ color: '#bb99ff', fontSize: '18px', fontWeight: 'bold' }}>
          {hero.xp.available} XP
        </span>
        <span style={{ color: '#666', fontSize: '13px', marginLeft: '8px' }}>
          available ({hero.xp.total} total)
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '16px' }}>
        {Object.entries(ACTIVATION_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
            <span style={{ fontSize: '11px', color: '#888', textTransform: 'capitalize' }}>{type}</span>
          </div>
        ))}
      </div>

      {/* Pyramid (Tier 5 at top, Tier 1 at bottom) */}
      <div style={pyramidStyle}>
        {[5, 4, 3, 2, 1].map(tier => {
          const slots = slotsByTier[tier] ?? []
          const cost = TALENT_XP_COST[tier]

          return (
            <div key={tier} style={{ textAlign: 'center' }}>
              <div style={tierLabelStyle}>
                Tier {tier} ({cost} XP)
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                {slots.map(slot => {
                  const card = slot.talentId ? allTalentCards.get(slot.talentId) ?? null : null
                  const purchasable = isSlotPurchasable(slot)
                  const lockReason = getLockReason(slot)
                  const isOpen = openSlot?.tier === slot.tier && openSlot?.position === slot.position

                  const slotWidth = 130
                  const slotHeight = 70

                  const slotStyle: React.CSSProperties = {
                    position: 'relative',
                    width: slotWidth,
                    height: slotHeight,
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                    cursor: purchasable ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    ...(card ? {
                      backgroundColor: '#1a1a2e',
                      border: `2px solid ${ACTIVATION_COLORS[card.activation] ?? '#4a9eff'}`,
                    } : purchasable ? {
                      backgroundColor: '#0f0f1a',
                      border: '2px solid #bb99ff',
                      boxShadow: '0 0 12px rgba(187, 153, 255, 0.2)',
                    } : {
                      backgroundColor: '#0a0a0f',
                      border: '2px solid #222',
                      opacity: 0.5,
                    }),
                  }

                  return (
                    <div
                      key={`${slot.tier}-${slot.position}`}
                      style={slotStyle}
                      onClick={(e) => handleSlotClick(slot, e)}
                      onMouseEnter={() => card && setHoveredTalentId(slot.talentId)}
                      onMouseLeave={() => setHoveredTalentId(null)}
                      title={lockReason ?? (card ? card.description : undefined)}
                    >
                      {card ? (
                        // Filled slot
                        <>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: '#fff',
                            textAlign: 'center',
                            lineHeight: '1.2',
                          }}>
                            {card.name}
                          </div>
                          <div style={{
                            fontSize: '9px',
                            color: ACTIVATION_COLORS[card.activation] ?? '#888',
                            textTransform: 'uppercase',
                            marginTop: '4px',
                          }}>
                            {card.activation}
                            {card.ranked && ' (R)'}
                          </div>
                        </>
                      ) : purchasable ? (
                        // Empty purchasable slot
                        <>
                          <div style={{ fontSize: '18px', color: '#bb99ff' }}>+</div>
                          <div style={{ fontSize: '10px', color: '#888' }}>{cost} XP</div>
                        </>
                      ) : (
                        // Locked slot
                        <>
                          <div style={{ fontSize: '16px', color: '#444' }}>&#128274;</div>
                          <div style={{ fontSize: '9px', color: '#555', textAlign: 'center' }}>
                            {lockReason ? lockReason.split(' ').slice(0, 4).join(' ') + '...' : 'Locked'}
                          </div>
                        </>
                      )}

                      {/* Selection indicator */}
                      {isOpen && (
                        <div style={{
                          position: 'absolute',
                          bottom: -4,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 0,
                          height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: '6px solid #bb99ff',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Talent count summary */}
      <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', marginTop: '8px' }}>
        {hero.talents.filter(s => s.talentId !== null).length} / 15 talent slots filled
      </div>

      {/* Fixed-position talent selection dropdown (outside overflow containers) */}
      {openSlot && dropdownPos && (
        <>
          {/* Click-away backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setOpenSlot(null)}
          />
          <div
            style={dropdownStyle}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '11px', color: '#bb99ff', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
              Select Tier {openSlot.tier} Talent
            </div>
            {getAvailableTalents(openSlot.tier).length === 0 ? (
              <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', padding: '8px' }}>
                No talents available at this tier
              </div>
            ) : (
              getAvailableTalents(openSlot.tier).map(talent => (
                <div
                  key={talent.id}
                  style={{
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginBottom: '2px',
                    backgroundColor: hoveredTalentId === talent.id ? '#2a2a4a' : 'transparent',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => handleSelectTalent(talent.id)}
                  onMouseEnter={() => setHoveredTalentId(talent.id)}
                  onMouseLeave={() => setHoveredTalentId(null)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: ACTIVATION_COLORS[talent.activation] ?? '#888',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>
                      {talent.name}
                    </span>
                    {talent.ranked && (
                      <span style={{ fontSize: '9px', color: '#bb99ff', padding: '1px 4px', backgroundColor: '#2a1a3a', borderRadius: '3px' }}>
                        RANKED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '3px', marginLeft: '14px' }}>
                    {talent.description}
                  </div>
                </div>
              ))
            )}
            <div
              style={{
                textAlign: 'center',
                marginTop: '6px',
                padding: '4px',
                fontSize: '11px',
                color: '#666',
                cursor: 'pointer',
                borderTop: '1px solid #333',
              }}
              onClick={() => setOpenSlot(null)}
            >
              Cancel
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import React from 'react'
import type { Figure, GameState, HeroCharacter, TalentCard, TalentSlot } from '@engine/types.js'
import { getWoundThresholdV2 } from '@engine/turn-machine-v2.js'
import { useGameStore } from '../../store/game-store'

const ThreatCount: React.FC = () => {
  const threateningEnemies = useGameStore(s => s.threateningEnemies)
  if (threateningEnemies.length === 0) return null

  const color = threateningEnemies.length >= 3 ? '#ff3333' : threateningEnemies.length >= 2 ? '#ff8844' : '#ffaa00'

  return (
    <div style={{
      padding: '4px 8px',
      marginBottom: '4px',
      backgroundColor: 'rgba(255, 50, 50, 0.08)',
      border: '1px solid rgba(255, 50, 50, 0.2)',
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    }}>
      <span style={{ color, fontSize: '12px', fontWeight: 'bold' }}>!</span>
      <span style={{ color: '#cc9999', fontSize: '10px' }}>
        {threateningEnemies.length} {threateningEnemies.length === 1 ? 'enemy' : 'enemies'} in range
      </span>
    </div>
  )
}

interface InfoPanelProps {
  selectedFigure: Figure | null
  gameState: GameState | null
  compact?: boolean
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ selectedFigure, gameState, compact = false }) => {
  const gameData = useGameStore(s => s.gameData)

  if (!selectedFigure || !gameState) return null

  const unit = gameState.players.find(p => p.id === selectedFigure.playerId)
  const woundThreshold = getWoundThresholdV2(selectedFigure, gameState)
  const woundPercent = woundThreshold > 0
    ? ((woundThreshold - selectedFigure.woundsCurrent) / woundThreshold) * 100
    : 100

  // Hero-specific data
  const isHero = selectedFigure.entityType === 'hero'
  const hero: HeroCharacter | null = isHero ? gameState.heroes[selectedFigure.entityId] ?? null : null

  // Strain threshold
  let strainThreshold = 0
  if (isHero && hero) {
    strainThreshold = hero.strain.threshold
  } else {
    const npc = gameState.npcProfiles[selectedFigure.entityId]
    strainThreshold = npc?.strainThreshold ?? 0
  }

  const strainPercent = strainThreshold > 0
    ? ((strainThreshold - selectedFigure.strainCurrent) / strainThreshold) * 100
    : 100

  // Resolve talent cards for display
  const talentCards: Map<string, TalentCard> = new Map()
  if (hero && gameData) {
    for (const specId of hero.specializations) {
      const spec = gameData.specializations[specId]
      if (spec) {
        for (const card of spec.talents) {
          talentCards.set(card.id, card)
        }
      }
    }
  }

  const panelStyle: React.CSSProperties = compact ? {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '40vh',
    overflowY: 'auto',
    backgroundColor: 'rgba(19, 19, 32, 0.98)',
    borderTop: '2px solid #4a9eff',
    borderRadius: '12px 12px 0 0',
    padding: '12px 16px',
    paddingBottom: 'calc(12px + var(--safe-bottom))',
    zIndex: 200,
    color: '#ffffff',
    fontSize: '12px',
  } : {
    position: 'fixed',
    top: '80px',
    right: '20px',
    width: '300px',
    maxHeight: 'calc(100vh - 160px)',
    overflowY: 'auto',
    backgroundColor: 'rgba(19, 19, 32, 0.95)',
    border: '2px solid #4a9eff',
    borderRadius: '8px',
    padding: '16px',
    zIndex: 90,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '12px',
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #333355',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#999999',
    textTransform: 'uppercase',
    marginBottom: '4px',
  }

  const barStyle: React.CSSProperties = {
    width: '100%',
    height: '16px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #333355',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '4px',
  }

  const woundFillColor = woundPercent > 50 ? '#44ff44' : woundPercent > 25 ? '#ffff00' : '#ff4444'
  const strainFillColor = strainPercent > 50 ? '#4a9eff' : strainPercent > 25 ? '#ff8844' : '#ff4444'

  const woundFillStyle: React.CSSProperties = {
    height: '100%',
    width: `${Math.max(0, woundPercent)}%`,
    backgroundColor: woundFillColor,
    transition: 'width 0.3s',
  }

  const conditionBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: '10px',
    padding: '2px 6px',
    backgroundColor: '#333355',
    borderRadius: '3px',
    marginRight: '4px',
    marginBottom: '4px',
    color: '#999999',
  }

  // Display name and subline
  const npc = !isHero ? gameState.npcProfiles[selectedFigure.entityId] : null
  const displayName = isHero && hero ? hero.name : npc?.name ?? selectedFigure.entityId
  const npcTier = npc?.tier
  const tierColors: Record<string, string> = {
    Minion: '#888888', Rival: '#ffaa00', Elite: '#cc77ff', Nemesis: '#ff4444',
  }
  const displaySubline = isHero && hero && gameData
    ? `${gameData.species[hero.species]?.name ?? hero.species} ${gameData.careers[hero.career]?.name ?? hero.career}`
    : npcTier
      ? npcTier
      : `${selectedFigure.entityType}`

  return (
    <div style={panelStyle}>
      {/* Drag handle for mobile drawer */}
      {compact && (
        <div style={{ width: '40px', height: '4px', backgroundColor: '#4a9eff', borderRadius: '2px', margin: '0 auto 8px' }} />
      )}
      {/* Title */}
      <div style={{ ...sectionStyle, marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffd700' }}>
          {displayName}
        </div>
        <div style={{ fontSize: '11px', color: '#999999', marginTop: '4px' }}>
          {unit?.role === 'Imperial' ? (
            <span style={{ color: '#ff4444' }}>Imperial</span>
          ) : (
            <span style={{ color: '#44ff44' }}>Operative</span>
          )}
          <span style={{ marginLeft: '8px', color: npcTier ? tierColors[npcTier] ?? '#666' : '#666' }}>
            {displaySubline}
          </span>
        </div>
      </div>

      {/* Wounded Status Banner */}
      {selectedFigure.isWounded && (
        <div style={{
          ...sectionStyle,
          backgroundColor: 'rgba(255, 68, 68, 0.12)',
          borderLeft: '3px solid #ff4444',
          padding: '8px 12px',
        }}>
          <div style={{ color: '#ff4444', fontWeight: 'bold', fontSize: '12px' }}>
            WOUNDED
          </div>
          <div style={{ fontSize: '10px', color: '#cc9999', marginTop: '2px' }}>
            -1 to all characteristics (min 1). Defeated on next wound threshold.
          </div>
        </div>
      )}

      {/* Hero Characteristics */}
      {isHero && hero && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Characteristics</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {(['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'] as const).map(c => (
              <div key={c} style={{
                padding: '2px 6px',
                backgroundColor: '#1a1a2e',
                border: '1px solid #333355',
                borderRadius: '3px',
                fontSize: '10px',
                textAlign: 'center',
                minWidth: '34px',
              }}>
                <div style={{ color: '#666', fontSize: '8px' }}>{c.slice(0, 3).toUpperCase()}</div>
                <div style={{ color: '#ffd700', fontWeight: 'bold' }}>{hero.characteristics[c]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wounds */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Wounds</div>
        <div style={barStyle}>
          <div style={woundFillStyle} />
        </div>
        <div style={{ fontSize: '11px' }}>
          {selectedFigure.woundsCurrent} / {woundThreshold} wounds taken
        </div>
      </div>

      {/* Strain */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Strain</div>
        {strainThreshold > 0 ? (
          <>
            <div style={barStyle}>
              <div style={{
                height: '100%',
                width: `${Math.max(0, strainPercent)}%`,
                backgroundColor: strainFillColor,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: '11px' }}>
              {selectedFigure.strainCurrent} / {strainThreshold} strain
            </div>
          </>
        ) : (
          <div style={{ fontSize: '11px' }}>
            {selectedFigure.strainCurrent} strain (no threshold)
          </div>
        )}
      </div>

      {/* Suppression */}
      {selectedFigure.suppressionTokens > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Suppression</div>
          {(() => {
            const tokens = selectedFigure.suppressionTokens
            const courage = selectedFigure.courage
            const isPanicking = tokens >= courage * 2
            const isSuppressed = tokens >= courage
            const statusColor = isPanicking ? '#ff4444' : isSuppressed ? '#ff6644' : '#ff8844'
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {Array.from({ length: tokens }, (_, i) => (
                      <div key={i} style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: i >= courage ? '#ff4444' : '#ff8844',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '10px', color: '#888' }}>
                    / {courage} courage
                  </span>
                </div>
                {isSuppressed && (
                  <div style={{
                    marginTop: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: statusColor,
                    animation: isPanicking ? 'none' : undefined,
                  }}>
                    {isPanicking ? '!! PANICKING !!' : 'SUPPRESSED - No actions'}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* Threat Assessment */}
      <ThreatCount />

      {/* Combat Tokens */}
      {(selectedFigure.aimTokens > 0 || selectedFigure.dodgeTokens > 0 || selectedFigure.hasStandby) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Tokens</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {selectedFigure.aimTokens > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {Array.from({ length: selectedFigure.aimTokens }, (_, i) => (
                  <div key={i} style={{
                    width: '10px', height: '10px',
                    backgroundColor: '#ffd700',
                    transform: 'rotate(45deg)',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }} />
                ))}
                <span style={{ fontSize: '10px', color: '#ffd700' }}>Aim</span>
              </div>
            )}
            {selectedFigure.dodgeTokens > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '10px', height: '10px',
                  backgroundColor: '#4a9eff',
                  transform: 'rotate(45deg)',
                  border: '1px solid rgba(255,255,255,0.3)',
                }} />
                <span style={{ fontSize: '10px', color: '#4a9eff' }}>Dodge</span>
              </div>
            )}
            {selectedFigure.hasStandby && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  backgroundColor: '#44ff44',
                  boxShadow: '0 0 4px #44ff44',
                }} />
                <span style={{ fontSize: '10px', color: '#44ff44' }}>Standby</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mechanical Keywords (NPCs only) */}
      {!isHero && (() => {
        const npc = gameState.npcProfiles[selectedFigure.entityId]
        const keywords = npc?.mechanicalKeywords
        if (!keywords || keywords.length === 0) return null
        const kwColors: Record<string, string> = {
          Armor: '#8899aa', Agile: '#00cccc', Relentless: '#cc3333',
          Cumbersome: '#cc8833', Disciplined: '#4477cc', Dauntless: '#9944cc',
          Guardian: '#ccaa00', Retaliate: '#ff6644',
        }
        return (
          <div style={sectionStyle}>
            <div style={labelStyle}>Keywords</div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {keywords.map((kw: any, i: number) => (
                <div key={i} style={{
                  ...conditionBadgeStyle,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: kwColors[kw.name] ?? '#aaa',
                  border: `1px solid ${kwColors[kw.name] ?? '#555'}`,
                }}>
                  {kw.name}{kw.value != null ? ` ${kw.value}` : ''}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Action Economy */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Action Economy</div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: selectedFigure.actionsRemaining > 0 ? '#ffd700' : '#333355',
            }} />
            <span style={{ fontSize: '10px', color: '#aaa' }}>Action</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: selectedFigure.maneuversRemaining > 0 ? '#4a9eff' : '#333355',
            }} />
            <span style={{ fontSize: '10px', color: '#aaa' }}>Maneuver</span>
          </div>
        </div>
        {selectedFigure.hasUsedStrainForManeuver && (
          <div style={{ fontSize: '10px', color: '#ff8844', marginTop: '4px' }}>
            Strain-for-maneuver used
          </div>
        )}
      </div>

      {/* Talent Pyramid (heroes only) */}
      {isHero && hero && hero.talents.some(s => s.talentId !== null) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Talent Pyramid</div>
          <TalentPyramidDisplay
            slots={hero.talents}
            cards={talentCards}
            figure={selectedFigure}
          />
        </div>
      )}

      {/* Conditions */}
      {selectedFigure.conditions.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Conditions</div>
          <div>
            {selectedFigure.conditions.map((cond, i) => (
              <div key={`${cond}-${i}`} style={conditionBadgeStyle}>
                {cond}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equipment (heroes) */}
      {isHero && hero && gameData && (() => {
        const pw = hero.equipment.primaryWeapon ? gameData.weapons[hero.equipment.primaryWeapon] : null
        const sw = hero.equipment.secondaryWeapon ? gameData.weapons[hero.equipment.secondaryWeapon] : null
        const arm = hero.equipment.armor ? gameData.armor[hero.equipment.armor] : null
        return (
          <div style={sectionStyle}>
            <div style={labelStyle}>Equipment</div>
            {pw && (
              <div style={{ fontSize: '11px', color: '#ff8844', marginBottom: '2px' }}>
                {pw.name}
                <span style={{ color: '#888', marginLeft: '6px' }}>
                  Dmg {pw.baseDamage}{pw.damageAddBrawn ? '+Br' : ''} | {pw.range} | Crit {pw.critical}
                </span>
                {pw.qualities?.length > 0 && (
                  <span style={{ color: '#cc77ff', marginLeft: '6px' }}>
                    {pw.qualities.map((q: any) => q.value != null ? `${q.name} ${q.value}` : q.name).join(', ')}
                  </span>
                )}
              </div>
            )}
            {sw && (
              <div style={{ fontSize: '11px', color: '#ff8844', marginBottom: '2px' }}>
                {sw.name}
                <span style={{ color: '#888', marginLeft: '6px' }}>
                  Dmg {sw.baseDamage}{sw.damageAddBrawn ? '+Br' : ''} | {sw.range} | Crit {sw.critical}
                </span>
              </div>
            )}
            {arm && (
              <div style={{ fontSize: '11px', color: '#4a9eff' }}>
                {arm.name}
                {arm.soak > 0 && <span style={{ color: '#888', marginLeft: '6px' }}>Soak +{arm.soak}</span>}
                {arm.defense > 0 && <span style={{ color: '#888', marginLeft: '6px' }}>Def {arm.defense}</span>}
              </div>
            )}
            {!pw && !arm && (
              <div style={{ fontSize: '11px', color: '#666' }}>Unarmed</div>
            )}
            <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
              Soak: {hero.soak} | Speed: {gameData.species[hero.species]?.speed ?? '?'}
            </div>
          </div>
        )
      })()}

      {/* NPC combat stats */}
      {!isHero && npc && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Combat Stats</div>
          <div style={{ fontSize: '10px', color: '#888', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span>Soak: {npc.soak}</span>
            <span>Speed: {npc.speed ?? '?'}</span>
            {selectedFigure.minionGroupSize != null && selectedFigure.minionGroupSize > 0 && (
              <span>Group: {selectedFigure.minionGroupSize}/{selectedFigure.minionGroupMax ?? selectedFigure.minionGroupSize}</span>
            )}
          </div>
          {npc.weapons?.map((w: any, i: number) => (
            <div key={i} style={{ fontSize: '11px', color: '#ff8844', marginTop: '4px' }}>
              {w.name ?? w.weaponId ?? 'Weapon'}
              <span style={{ color: '#888', marginLeft: '6px' }}>
                Dmg {w.baseDamage} | {w.range ?? 'Short'} | Crit {w.critical ?? 4}
              </span>
              {w.qualities?.length > 0 && (
                <span style={{ color: '#cc77ff', marginLeft: '6px' }}>
                  {w.qualities.map((q: any) => q.value != null ? `${q.name} ${q.value}` : q.name).join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Position */}
      <div style={{ ...sectionStyle, marginBottom: '0' }}>
        <div style={labelStyle}>Position</div>
        <div>
          ({selectedFigure.position.x}, {selectedFigure.position.y})
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TALENT PYRAMID DISPLAY
// ============================================================================

interface TalentPyramidProps {
  slots: TalentSlot[]
  cards: Map<string, TalentCard>
  figure: Figure
}

const TalentPyramidDisplay: React.FC<TalentPyramidProps> = ({ slots, cards, figure }) => {
  const TIERS = [1, 2, 3, 4, 5] as const

  const tierColors: Record<number, string> = {
    1: '#374151', 2: '#1e3a5f', 3: '#3b1f6e', 4: '#5f2d1e', 5: '#5f1e1e',
  }

  const activationColors: Record<string, string> = {
    passive: '#4a9eff', action: '#ff4444', maneuver: '#ff8844', incidental: '#44ff44',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {TIERS.map(tier => {
        const tierSlots = slots.filter(s => s.tier === tier)
        return (
          <div key={tier} style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            {tierSlots.map((slot, i) => {
              const card = slot.talentId ? cards.get(slot.talentId) ?? null : null
              const isUsed = slot.talentId
                ? (figure.talentUsesThisEncounter[slot.talentId] ?? 0) > 0
                : false

              return (
                <div
                  key={`${tier}-${i}`}
                  title={card
                    ? `${card.name} (T${tier} ${card.activation})\n${card.description}`
                    : `Empty T${tier} slot`}
                  style={{
                    width: 48,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: card ? tierColors[tier] : '#111827',
                    border: `1px solid ${card
                      ? (isUsed ? '#666' : activationColors[card.activation] ?? '#555')
                      : '#222'}`,
                    borderRadius: 3,
                    fontSize: 8,
                    color: isUsed ? '#666' : (card ? '#e5e7eb' : '#333'),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: isUsed ? 0.5 : 1,
                    cursor: card ? 'help' : 'default',
                    textDecoration: isUsed ? 'line-through' : 'none',
                  }}
                >
                  {card ? card.name.slice(0, 7) : '.'}
                </div>
              )
            })}
          </div>
        )
      })}
      <div style={{ fontSize: '8px', color: '#666', marginTop: 2 }}>
        Hover for details
      </div>
    </div>
  )
}

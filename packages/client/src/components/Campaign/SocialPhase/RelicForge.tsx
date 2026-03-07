/**
 * RelicForge - Relic forging UI within the Social Phase.
 * Shows fragment inventory, forgeable relic options, and assignment.
 */

import React, { useState, useMemo } from 'react'
import type { CampaignState, GameData, RelicFragmentType, RelicDefinition } from '../../../../../engine/src/types'
import { RELIC_FRAGMENT_TYPES, FRAGMENTS_TO_FORGE } from '../../../../../engine/src/types'
import {
  getFragmentCounts,
  getForgeableTypes,
  getAvailableRelics,
  forgeRelic,
  assignRelic,
} from '../../../../../engine/src/relic-fragments'

interface RelicForgeProps {
  campaign: CampaignState
  gameData: GameData
  onUpdate: (updatedCampaign: CampaignState) => void
  onBack: () => void
}

const FRAGMENT_COLORS: Record<RelicFragmentType, string> = {
  combat: '#ff4444',
  tech: '#00ccff',
  force: '#cc77ff',
  intel: '#44ff44',
}

const FRAGMENT_LABELS: Record<RelicFragmentType, string> = {
  combat: 'Combat',
  tech: 'Tech',
  force: 'Force',
  intel: 'Intel',
}

export function RelicForge({ campaign, gameData, onUpdate, onBack }: RelicForgeProps) {
  const [selectedType, setSelectedType] = useState<RelicFragmentType | null>(null)
  const [forgedMessage, setForgedMessage] = useState<string | null>(null)

  const fragmentCounts = useMemo(() => getFragmentCounts(campaign), [campaign])
  const forgeableTypes = useMemo(() => getForgeableTypes(campaign), [campaign])
  const forgedRelics = campaign.forgedRelics ?? []

  const availableRelics = useMemo(() => {
    if (!selectedType) return []
    return getAvailableRelics(campaign, selectedType, gameData)
  }, [campaign, selectedType, gameData])

  const totalFragments = RELIC_FRAGMENT_TYPES.reduce((sum, t) => sum + (fragmentCounts[t] ?? 0), 0)

  const handleForge = (relicId: string) => {
    const result = forgeRelic(campaign, relicId, gameData)
    if (result) {
      const def = (gameData.relicDefinitions ?? {})[relicId]
      setForgedMessage(`Forged: ${def?.name ?? relicId}`)
      onUpdate(result)
      setSelectedType(null)
      setTimeout(() => setForgedMessage(null), 3000)
    }
  }

  const handleAssign = (relicId: string, heroId: string) => {
    const result = assignRelic(campaign, relicId, heroId)
    if (result) onUpdate(result)
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button style={backButtonStyle} onClick={onBack}>&larr; Back</button>
        <div>
          <div style={{ fontSize: '10px', color: '#ffd700', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
            Relic Forge
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>
            Fragment Inventory & Forging
          </div>
        </div>
      </div>

      {forgedMessage && (
        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: 'rgba(255, 215, 0, 0.1)', border: '1px solid #ffd700', borderRadius: '6px', color: '#ffd700', fontSize: '14px', fontWeight: 'bold' }}>
          {forgedMessage}
        </div>
      )}

      {/* Fragment Inventory */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Fragments ({totalFragments})</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {RELIC_FRAGMENT_TYPES.map(type => {
            const count = fragmentCounts[type] ?? 0
            const canForgeThis = count >= FRAGMENTS_TO_FORGE
            return (
              <div
                key={type}
                style={{
                  ...fragmentCardStyle,
                  borderColor: canForgeThis ? FRAGMENT_COLORS[type] : '#333355',
                  cursor: canForgeThis ? 'pointer' : 'default',
                  opacity: count === 0 ? 0.5 : 1,
                }}
                onClick={() => canForgeThis && setSelectedType(type)}
              >
                <div style={{ fontSize: '9px', color: FRAGMENT_COLORS[type], textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px' }}>
                  {FRAGMENT_LABELS[type]}
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: FRAGMENT_COLORS[type] }}>
                  {count}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>
                  / {FRAGMENTS_TO_FORGE} to forge
                </div>
                {canForgeThis && (
                  <div style={{ fontSize: '10px', color: '#ffd700', marginTop: '4px' }}>
                    Ready to forge
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Available Relics to Forge */}
      {selectedType && availableRelics.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            Available {FRAGMENT_LABELS[selectedType]} Relics
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {availableRelics.map((relic: RelicDefinition) => (
              <div key={relic.id} style={relicCardStyle}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffd700', marginBottom: '6px' }}>
                  {relic.name}
                </div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px', lineHeight: '1.4' }}>
                  {relic.description}
                </div>
                <div style={{ fontSize: '10px', color: FRAGMENT_COLORS[selectedType], marginBottom: '4px' }}>
                  {relic.effect.type.replace(/_/g, ' ')}
                  {relic.effect.duration && ` (${relic.effect.duration})`}
                </div>
                {relic.flavorText && (
                  <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginBottom: '8px' }}>
                    {relic.flavorText}
                  </div>
                )}
                <button
                  style={forgeButtonStyle}
                  onClick={() => handleForge(relic.id)}
                >
                  FORGE ({FRAGMENTS_TO_FORGE} {FRAGMENT_LABELS[selectedType]} fragments)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedType && availableRelics.length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
          No unforged {FRAGMENT_LABELS[selectedType]} relics available.
        </div>
      )}

      {/* Forged Relics */}
      {forgedRelics.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Forged Relics ({forgedRelics.length})</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {forgedRelics.map(forged => {
              const def = (gameData.relicDefinitions ?? {})[forged.relicId]
              if (!def) return null

              const assignedHero = forged.assignedHeroId
                ? campaign.heroes[forged.assignedHeroId]
                : null

              return (
                <div key={forged.relicId} style={{ ...relicCardStyle, borderColor: '#ffd700' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffd700', marginBottom: '4px' }}>
                    {def.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>
                    {def.description}
                  </div>
                  {assignedHero ? (
                    <div style={{ fontSize: '11px', color: '#44ff44' }}>
                      Assigned to: {assignedHero.name}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>Assign to:</div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {Object.values(campaign.heroes).map(hero => (
                          <button
                            key={hero.id}
                            style={assignButtonStyle}
                            onClick={() => handleAssign(forged.relicId, hero.id)}
                          >
                            {hero.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  padding: '30px',
  maxWidth: '900px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
}

const backButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  backgroundColor: 'transparent',
  color: '#888',
  border: '1px solid #555',
  borderRadius: '4px',
  fontSize: '13px',
  cursor: 'pointer',
}

const sectionStyle: React.CSSProperties = {
  padding: '16px',
  backgroundColor: 'rgba(19, 19, 32, 0.8)',
  borderRadius: '8px',
  border: '1px solid #333355',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#ffd700',
  textTransform: 'uppercase',
  fontWeight: 'bold',
  letterSpacing: '1px',
  marginBottom: '12px',
}

const fragmentCardStyle: React.CSSProperties = {
  width: '120px',
  padding: '14px',
  backgroundColor: 'rgba(10, 10, 20, 0.9)',
  borderRadius: '8px',
  border: '2px solid #333355',
  textAlign: 'center',
  transition: 'border-color 0.2s ease',
}

const relicCardStyle: React.CSSProperties = {
  width: '260px',
  padding: '16px',
  backgroundColor: 'rgba(10, 10, 20, 0.9)',
  borderRadius: '8px',
  border: '1px solid #555555',
}

const forgeButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#ffd700',
  color: '#0a0a0f',
  border: 'none',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold',
  cursor: 'pointer',
  width: '100%',
}

const assignButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  backgroundColor: 'transparent',
  color: '#00ccff',
  border: '1px solid #00ccff',
  borderRadius: '4px',
  fontSize: '10px',
  cursor: 'pointer',
}

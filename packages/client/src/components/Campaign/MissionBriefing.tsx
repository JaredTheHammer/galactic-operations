/**
 * MissionBriefing - Tactical briefing screen shown before mission combat starts.
 * Displays mission narrative, objectives, enemy intel, map info, loot, and difficulty.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'

// ============================================================================
// Difficulty helpers
// ============================================================================

function getDifficultyColor(d: string): string {
  switch (d) {
    case 'easy': return '#44ff44'
    case 'moderate': return '#ffaa00'
    case 'hard': return '#ff6644'
    case 'deadly': return '#ff2222'
    default: return '#888'
  }
}

function getTierColor(tier?: string): string {
  switch (tier) {
    case 'Nemesis': return '#ff4444'
    case 'Rival': return '#ffaa00'
    case 'Elite': return '#cc77ff'
    default: return '#888'
  }
}

// ============================================================================
// Component
// ============================================================================

export default function MissionBriefing() {
  const { campaignState, campaignMissions, gameData, pendingMissionId, dismissMissionBriefing } = useGameStore()
  const { isMobile } = useIsMobile()

  if (!pendingMissionId || !campaignMissions) return null
  const mission = campaignMissions[pendingMissionId]
  if (!mission) return null

  const companions = campaignState?.companions ?? []

  // Compute total initial enemy count
  const totalEnemies = mission.initialEnemies.reduce((sum, g) => sum + g.count, 0)
  const totalReinforcements = mission.reinforcements.reduce(
    (sum, wave) => sum + wave.groups.reduce((s, g) => s + g.count, 0),
    0,
  )

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0a0a0f',
      color: '#c0c0c0',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflow: 'auto',
      padding: isMobile ? '0' : '20px 0',
    }}>
      <div style={{
        backgroundColor: '#12121f',
        border: '1px solid #2a2a3f',
        borderRadius: isMobile ? '0' : '12px',
        padding: isMobile ? '16px' : '32px',
        maxWidth: '800px',
        width: isMobile ? '100%' : '90%',
      }}>
        {/* Mission header */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{
            fontSize: '10px',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '3px',
            marginBottom: '6px',
          }}>
            Mission Briefing
          </div>
          <h1 style={{
            color: '#ffd700',
            margin: '0 0 6px 0',
            fontSize: isMobile ? '22px' : '28px',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
          }}>
            {mission.name}
          </h1>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '12px',
          }}>
            <span style={{ color: '#888' }}>Act {mission.campaignAct}</span>
            <span style={{ color: getDifficultyColor(mission.difficulty), fontWeight: 'bold' }}>
              {mission.difficulty.toUpperCase()}
            </span>
            <span style={{ color: '#888' }}>{mission.roundLimit} Rounds</span>
            <span style={{ color: '#888' }}>{mission.boardsWide}x{mission.boardsTall} Boards</span>
          </div>
        </div>

        {/* Narrative intro */}
        <div style={{
          backgroundColor: '#0a0a1a',
          border: '1px solid #2a2a3f',
          borderLeft: '3px solid #ffd700',
          borderRadius: '8px',
          padding: isMobile ? '12px' : '16px',
          margin: '20px 0',
          fontStyle: 'italic',
          color: '#ddd',
          fontSize: '13px',
          lineHeight: '1.7',
        }}>
          {mission.narrativeIntro}
        </div>

        {/* Two-column layout: Objectives + Intel */}
        <div style={{
          display: 'flex',
          gap: '16px',
          flexDirection: isMobile ? 'column' : 'row',
        }}>
          {/* Left column: Objectives */}
          <div style={{ flex: 1 }}>
            <SectionHeader color="#4a9eff">Objectives</SectionHeader>
            {mission.objectives.map(obj => {
              const isPrimary = obj.priority === 'primary'
              return (
                <div key={obj.id} style={{
                  fontSize: '12px',
                  padding: '7px 10px',
                  marginBottom: '4px',
                  backgroundColor: '#0a0a1a',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${isPrimary ? '#ffd700' : '#444'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <span style={{ color: isPrimary ? '#ffd700' : '#555', fontSize: '13px' }}>
                    {isPrimary ? '\u2605' : '\u2022'}
                  </span>
                  <span style={{ color: isPrimary ? '#ddd' : '#999', flex: 1 }}>
                    {obj.description}
                  </span>
                  {obj.xpReward > 0 && (
                    <span style={{ color: '#44ff44', fontSize: '10px', flexShrink: 0 }}>+{obj.xpReward} XP</span>
                  )}
                </div>
              )
            })}

            {/* Companions */}
            {companions.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <SectionHeader color="#44ff44">Companion Allies</SectionHeader>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {companions.map(id => (
                    <span key={id} style={{
                      padding: '3px 8px',
                      backgroundColor: '#0a2a1a',
                      border: '1px solid #44ff4440',
                      borderRadius: '4px',
                      color: '#44ff44',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}>
                      {id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Enemy intel + tactical info */}
          <div style={{ flex: 1 }}>
            {/* Enemy Intel */}
            {mission.initialEnemies.length > 0 && (
              <div>
                <SectionHeader color="#ff6b6b">
                  Enemy Intel
                  <span style={{ fontWeight: 'normal', fontSize: '10px', color: '#888', marginLeft: '6px' }}>
                    {totalEnemies} initial{totalReinforcements > 0 ? ` + ${totalReinforcements} reinforcements` : ''}
                  </span>
                </SectionHeader>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {mission.initialEnemies.map((group, idx) => {
                    const profile = gameData?.npcProfiles?.[group.npcProfileId]
                    const name = profile?.name ?? group.npcProfileId.replace(/-/g, ' ')
                    const tier = profile?.tier
                    const tierColor = getTierColor(tier)
                    return (
                      <span key={idx} style={{
                        padding: '4px 8px',
                        backgroundColor: '#1a0a0a',
                        border: `1px solid ${tierColor}40`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: tierColor,
                      }}>
                        {group.count > 1 ? `${group.count}x ` : ''}{name}
                        {tier && tier !== 'Minion' && (
                          <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '3px' }}>
                            [{tier}]
                          </span>
                        )}
                      </span>
                    )
                  })}
                </div>

                {/* Reinforcement waves */}
                {mission.reinforcements.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {mission.reinforcements.map((wave, wIdx) => (
                      <div key={wave.id} style={{
                        fontSize: '10px',
                        color: '#f97316',
                        padding: '4px 8px',
                        backgroundColor: '#1a100a',
                        borderRadius: '3px',
                        border: '1px solid #f9731620',
                        marginBottom: '3px',
                      }}>
                        <strong>Wave {wIdx + 1}</strong>
                        <span style={{ color: '#888', marginLeft: '6px' }}>
                          Round {wave.triggerRound}{wave.triggerEvent ? ` / ${wave.triggerEvent}` : ''}
                        </span>
                        <span style={{ marginLeft: '6px' }}>
                          {wave.groups.map((g, gi) => {
                            const p = gameData?.npcProfiles?.[g.npcProfileId]
                            return (gi > 0 ? ', ' : '') + (g.count > 1 ? `${g.count}x ` : '') + (p?.name ?? g.npcProfileId.replace(/-/g, ' '))
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Loot preview */}
            {mission.lootTokens.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <SectionHeader color="#ffd700">Loot Available</SectionHeader>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {mission.lootTokens.map((loot, idx) => {
                    const r = loot.reward
                    const label = r.type === 'xp' ? `${r.value} XP`
                      : r.type === 'credits' ? `${r.value} Cr`
                      : r.type === 'equipment' ? (r as any).itemId?.replace(/-/g, ' ') ?? 'Equipment'
                      : r.type === 'narrative' ? (r as any).description ?? 'Narrative'
                      : '???'
                    const color = r.type === 'xp' ? '#44ff44'
                      : r.type === 'credits' ? '#ffd700'
                      : r.type === 'equipment' ? '#ff6644'
                      : '#cc77ff'
                    return (
                      <span key={idx} style={{
                        padding: '3px 7px',
                        backgroundColor: '#0a0a1a',
                        border: `1px solid ${color}30`,
                        borderRadius: '3px',
                        fontSize: '11px',
                        color,
                      }}>
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tactical summary */}
            <div style={{ marginTop: '12px' }}>
              <SectionHeader color="#888">Tactical Summary</SectionHeader>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px',
                fontSize: '11px',
              }}>
                <StatRow label="Threat Pool" value={String(mission.imperialThreat)} color="#ff6b6b" />
                <StatRow label="Threat/Round" value={`+${mission.threatPerRound}`} color="#f97316" />
                <StatRow label="Round Limit" value={String(mission.roundLimit)} color="#4a9eff" />
                <StatRow label="Rec. Heroes" value={String(mission.recommendedHeroCount)} color="#44ff44" />
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={() => {
              useGameStore.setState({
                showMissionBriefing: false,
                pendingMissionId: null,
                showMissionSelect: true,
              })
            }}
            style={{
              padding: '12px 20px',
              borderRadius: '6px',
              border: '1px solid #555',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              backgroundColor: 'transparent',
              color: '#888',
              flex: isMobile ? 1 : undefined,
            }}
          >
            BACK
          </button>
          <button
            onClick={dismissMissionBriefing}
            style={{
              padding: '12px 24px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
              backgroundColor: '#4a9eff',
              color: '#fff',
              flex: 1,
              textShadow: '0 0 10px rgba(74, 158, 255, 0.5)',
            }}
          >
            BEGIN MISSION
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function SectionHeader({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '11px',
      color,
      textTransform: 'uppercase',
      fontWeight: 'bold',
      letterSpacing: '0.5px',
      marginBottom: '6px',
    }}>
      {children}
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '4px 8px',
      backgroundColor: '#0a0a1a',
      borderRadius: '3px',
      display: 'flex',
      justifyContent: 'space-between',
    }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color, fontWeight: 'bold' }}>{value}</span>
    </div>
  )
}

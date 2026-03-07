/**
 * PostMission - Shown after a campaign mission ends.
 * Displays XP breakdown, hero status, mission result, and lets the player continue.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { MissionResult, HeroCharacter, SectorMapDefinition } from '../../../../engine/src/types'
import { getExposureStatus } from '../../../../engine/src/types'
import { calculateMissionExposure, calculateMissionInfluence, calculateMissionControl } from '../../../../engine/src/campaign-v2'
import { HeroPortrait } from '../Portrait/HeroPortrait'
import { t } from '../../styles/theme'
import { CriticalInjuryPanel } from './CriticalInjuryPanel'
import { MomentumIndicator } from './MomentumIndicator'
import { LegacyEventReveal } from './LegacyEventReveal'
import sectorMapData from '../../../../../data/sector-map.json'

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: t.bgBase,
  color: t.textSecondary,
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
}

const panelStyle: React.CSSProperties = {
  backgroundColor: t.bgSurface1,
  border: `1px solid ${t.border}`,
  borderRadius: t.radiusLg,
  padding: '32px',
  maxWidth: '700px',
  width: '90%',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: t.radiusSm,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '16px',
  width: '100%',
  marginTop: '16px',
}

const sectionHeaderStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: '14px',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: t.bgSurface2,
  border: `1px solid ${t.borderSubtle}`,
  borderRadius: t.radiusSm,
  padding: '6px 10px',
  fontSize: '12px',
  marginRight: '8px',
  marginBottom: '6px',
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function XPRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}>
      <span>{label}</span>
      <span style={{ color: t.accentGreen, fontWeight: 'bold' }}>+{value} XP</span>
    </div>
  )
}

function HeroStatusCard({
  hero,
  kills,
  wasIncapacitated,
  isMobile,
}: {
  hero: HeroCharacter
  kills: number
  wasIncapacitated: boolean
  isMobile?: boolean
}) {
  const isWounded = hero.isWounded
  const borderColor = wasIncapacitated ? t.accentRed : isWounded ? t.accentOrange : '#2a4a2a'
  const statusColor = wasIncapacitated ? t.accentRed : isWounded ? t.accentOrange : t.accentGreen
  const statusText = wasIncapacitated ? 'INCAPACITATED' : isWounded ? 'WOUNDED' : 'HEALTHY'
  const statusIcon = wasIncapacitated ? '\u2620' : isWounded ? '\u26A0' : '\u2714'

  return (
    <div style={{
      ...pillStyle,
      borderColor,
      padding: '8px 12px',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '4px',
      minWidth: isMobile ? undefined : '140px',
      width: isMobile ? '100%' : undefined,
      marginRight: isMobile ? 0 : pillStyle.marginRight,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={28} accentColor={t.accentBlue} />
          <span style={{ color: t.accentBlue, fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</span>
        </div>
        <span style={{ color: statusColor, fontSize: '10px', fontWeight: 'bold' }}>
          {statusIcon} {statusText}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: t.textMuted }}>
        <span>W: {hero.wounds.current}/{hero.wounds.threshold}</span>
        <span>S: {hero.strain.current}/{hero.strain.threshold}</span>
        {kills > 0 && <span style={{ color: t.accentOrange }}>{kills} kill{kills !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PostMission() {
  const {
    lastMissionResult, lastBountyCompletions, returnToMissionSelect, openSocialPhase,
    campaignState, activeMissionDef, campaignMissions,
    criticalInjuryDefs, legacyEventDefs, showLegacyEvents, acknowledgeLegacyEvents,
  } = useGameStore()
  const { isMobile } = useIsMobile()

  if (!lastMissionResult) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: t.accentRed, marginBottom: '16px' }}>No mission result available.</div>
          <button
            style={{ ...buttonStyle, backgroundColor: t.bgSurface2, color: t.textSecondary, width: 'auto' }}
            onClick={returnToMissionSelect}
          >
            Return to Campaign
          </button>
        </div>
      </div>
    )
  }

  const result = lastMissionResult
  const isVictory = result.outcome === 'victory'
  const outcomeColor = isVictory ? t.accentGreen : t.accentRed
  const outcomeText = isVictory ? 'MISSION COMPLETE' : 'MISSION FAILED'

  const heroes = campaignState
    ? (Object.values(campaignState.heroes) as HeroCharacter[])
    : []

  // Compute credit rewards from loot tokens
  const missionDef = campaignMissions?.[result.missionId]
  let creditsEarned = 0
  const lootDetails: { label: string; color: string }[] = []
  if (missionDef && result.lootCollected.length > 0) {
    for (const lootId of result.lootCollected) {
      const token = missionDef.lootTokens.find(l => l.id === lootId)
      if (!token) {
        lootDetails.push({ label: lootId, color: t.textMuted })
        continue
      }
      const r = token.reward
      if (r.type === 'credits') {
        creditsEarned += r.value
        lootDetails.push({ label: `${r.value} Credits`, color: t.accentGold })
      } else if (r.type === 'xp') {
        lootDetails.push({ label: `${r.value} XP`, color: t.accentGreen })
      } else if (r.type === 'equipment') {
        lootDetails.push({ label: r.itemId.replace(/-/g, ' '), color: t.accentOrange })
      } else if (r.type === 'narrative') {
        lootDetails.push({ label: r.description, color: t.accentPurple })
      }
    }
  }

  // Enemy casualty summary
  const totalKills = Object.values(result.heroKills).reduce((sum, k) => sum + k, 0)

  return (
    <div style={containerStyle}>
      <div style={{
        ...panelStyle,
        ...(isMobile ? {
          maxWidth: '100%',
          width: '100%',
          padding: '16px',
          borderRadius: '0',
        } : {}),
      }}>
        {/* Outcome header */}
        <h1 style={{
          color: outcomeColor,
          textAlign: 'center',
          margin: '0 0 8px 0',
          fontSize: isMobile ? '22px' : '28px',
          textShadow: `0 0 20px ${outcomeColor}40`,
        }}>
          {outcomeText}
        </h1>
        <div style={{
          textAlign: 'center',
          color: t.textMuted,
          marginBottom: isMobile ? '12px' : '16px',
          fontSize: isMobile ? '13px' : '14px',
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <span>{result.roundsPlayed} rounds</span>
          {totalKills > 0 && (
            <span style={{ color: t.accentRed }}>{totalKills} enem{totalKills === 1 ? 'y' : 'ies'} defeated</span>
          )}
          {creditsEarned > 0 && (
            <span style={{ color: t.accentGold }}>+{creditsEarned} credits</span>
          )}
        </div>

        {/* Narrative outcome text */}
        {(() => {
          const narrativeMission = activeMissionDef ?? campaignMissions?.[result.missionId]
          const narrativeText = narrativeMission
            ? (isVictory ? narrativeMission.narrativeSuccess : narrativeMission.narrativeFailure)
            : null
          if (!narrativeText) return null
          return (
            <div style={{
              backgroundColor: t.bgSurface1,
              border: `1px solid ${t.border}`,
              borderLeft: `3px solid ${outcomeColor}`,
              borderRadius: t.radiusMd,
              padding: isMobile ? '12px' : '16px',
              marginBottom: isMobile ? '16px' : '24px',
              fontStyle: 'italic',
              color: t.textPrimary,
              fontSize: '13px',
              lineHeight: '1.7',
            }}>
              {narrativeText}
            </div>
          )
        })()}

        {/* XP Breakdown */}
        <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
          <h3 style={{ color: t.accentBlue, margin: '0 0 8px 0', fontSize: isMobile ? '14px' : '16px' }}>XP Earned</h3>
          <div style={{
            backgroundColor: t.bgSurface2,
            borderRadius: t.radiusMd,
            padding: isMobile ? '8px' : '12px',
            border: `1px solid ${t.borderSubtle}`,
          }}>
            <XPRow label="Participation" value={result.xpBreakdown.participation} />
            <XPRow label="Mission Success" value={result.xpBreakdown.missionSuccess} />
            <XPRow label="Loot Tokens" value={result.xpBreakdown.lootTokens} />
            <XPRow label="Enemy Kills" value={result.xpBreakdown.enemyKills} />
            <XPRow label="Leader Eliminated" value={result.xpBreakdown.leaderKill} />
            <XPRow label="Objective Bonuses" value={result.xpBreakdown.objectiveBonus} />
            <XPRow label="Narrative Bonus" value={result.xpBreakdown.narrativeBonus} />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 0 0 0',
              marginTop: '8px',
              borderTop: `1px solid ${t.border}`,
              fontSize: isMobile ? '15px' : '18px',
              fontWeight: 'bold',
            }}>
              <span style={{ color: t.textPrimary }}>Total</span>
              <span style={{ color: t.accentGreen, textShadow: t.shadowGlowSm }}>
                +{result.xpBreakdown.total} XP
              </span>
            </div>
          </div>
        </div>

        {/* Hero Status */}
        {heroes.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '20px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: t.accentBlue }}>Squad Status</h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              flexDirection: isMobile ? 'column' : 'row',
            }}>
              {heroes.map(hero => (
                <HeroStatusCard
                  key={hero.id}
                  hero={hero}
                  kills={result.heroKills[hero.id] ?? 0}
                  wasIncapacitated={result.heroesIncapacitated.includes(hero.name)}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>
        )}

        {/* Objectives completed */}
        {result.completedObjectiveIds.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: t.accentBlue }}>
              Objectives Completed ({result.completedObjectiveIds.length})
            </h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
            }}>
              {result.completedObjectiveIds.map(id => (
                <span key={id} style={{
                  ...pillStyle,
                  color: t.accentGreen,
                  ...(isMobile ? { width: '100%', marginRight: 0 } : {}),
                }}>
                  <span style={{ fontSize: '14px' }}>{'\u2714'}</span>
                  {id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loot collected (enhanced with reward details) */}
        {lootDetails.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: t.accentOrange }}>
              Loot Secured ({lootDetails.length})
            </h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
            }}>
              {lootDetails.map((item, i) => (
                <span key={i} style={{
                  ...pillStyle,
                  color: item.color,
                  borderColor: `${item.color}30`,
                  ...(isMobile ? { width: '100%', marginRight: 0 } : {}),
                }}>
                  <span style={{ fontSize: '14px' }}>{'\u2B50'}</span>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Fallback: raw loot IDs when no mission definition available */}
        {lootDetails.length === 0 && result.lootCollected.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: t.accentOrange }}>
              Loot Secured ({result.lootCollected.length})
            </h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
            }}>
              {result.lootCollected.map((item, i) => (
                <span key={i} style={{
                  ...pillStyle,
                  color: t.accentGold,
                  borderColor: t.borderSubtle,
                  ...(isMobile ? { width: '100%', marginRight: 0 } : {}),
                }}>
                  <span style={{ fontSize: '14px' }}>{'\u2B50'}</span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* TI4 Systems Summary */}
        {campaignState && (campaignState.completedSecretObjectives?.length || 0) > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: '#cc77ff' }}>Secret Objectives</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(campaignState.completedSecretObjectives ?? []).slice(-4).map((so, i) => (
                <span key={i} style={{
                  ...pillStyle,
                  color: '#44ff44',
                  borderColor: '#44ff4466',
                }}>
                  {so.objectiveId.replace(/-/g, ' ')} (+{so.xpAwarded}XP)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bounty Completions */}
        {lastBountyCompletions.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: t.accentGold }}>
              Bounties Completed ({lastBountyCompletions.length})
            </h3>
            <div style={{
              backgroundColor: t.bgSurface2,
              borderRadius: t.radiusMd,
              padding: isMobile ? '8px' : '12px',
              border: `1px solid ${t.accentGold}30`,
            }}>
              {lastBountyCompletions.map((bounty, i) => (
                <div key={bounty.bountyId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < lastBountyCompletions.length - 1 ? `1px solid ${t.borderSubtle}` : 'none',
                }}>
                  <div>
                    <div style={{ color: t.textPrimary, fontSize: '13px', fontWeight: 'bold' }}>
                      {bounty.bountyName}
                    </div>
                    <div style={{ fontSize: '11px', color: t.textMuted }}>
                      {bounty.targetName} -- {bounty.condition}
                      {bounty.wasPrepped && ' (intel advantage)'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: t.accentGold, fontWeight: 'bold', fontSize: '14px' }}>
                      +{bounty.creditReward}
                    </div>
                    {bounty.reputationReward && (
                      <div style={{ fontSize: '10px', color: t.accentPurple }}>
                        {bounty.reputationReward.factionId} {bounty.reputationReward.delta >= 0 ? '+' : ''}{bounty.reputationReward.delta}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {campaignState?.relicFragments && Object.values(campaignState.relicFragments).some(v => v > 0) && (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: t.accentGold }}>Relic Fragments</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
              {Object.entries(campaignState.relicFragments).map(([type, count]) => count > 0 && (
                <span key={type} style={{
                  fontSize: '12px',
                  color: type === 'combat' ? '#ff4444' : type === 'tech' ? '#00ccff' : type === 'force' ? '#cc77ff' : '#44ff44',
                }}>
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {campaignState?.activeDirectives && campaignState.activeDirectives.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: '#cc77ff' }}>Active Directives</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {campaignState.activeDirectives.map((d, i) => (
                <span key={i} style={{
                  ...pillStyle,
                  color: '#cc77ff',
                  borderColor: '#cc77ff66',
                }}>
                  {d.directiveId.replace(/-/g, ' ')} ({d.missionsRemaining}m)
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Critical Injuries */}
        {campaignState && heroes.length > 0 && Object.keys(criticalInjuryDefs).length > 0 && (
          <CriticalInjuryPanel
            heroes={heroes}
            injuryDefs={criticalInjuryDefs}
            compact
          />
        )}

        {/* Momentum */}
        {campaignState && (
          <MomentumIndicator campaign={campaignState} />
        )}
        {/* Rebellion Mechanics Deltas */}
        {campaignState?.actProgress && activeMissionDef && (() => {
          const totalKillsAll = Object.values(result.heroKills).reduce((sum, k) => sum + k, 0);
          const exposureDelta = calculateMissionExposure(
            activeMissionDef, result.outcome, result.heroesIncapacitated,
            result.completedObjectiveIds, totalKillsAll, result.roundsPlayed,
          );
          const influenceDelta = calculateMissionInfluence(result.outcome, result.completedObjectiveIds);
          const controlDelta = calculateMissionControl(result.outcome, result.heroesIncapacitated);
          const ap = campaignState.actProgress!;
          const status = getExposureStatus(ap.exposure);
          const statusColors: Record<string, string> = {
            ghost: t.accentGreen, detected: t.accentOrange, hunted: t.accentRed,
          };
          const statusLabels: Record<string, string> = {
            ghost: 'GHOST', detected: 'DETECTED', hunted: 'HUNTED',
          };

          return (
            <div style={{
              marginBottom: isMobile ? '12px' : '16px',
              backgroundColor: t.bgSurface2,
              borderRadius: t.radiusMd,
              padding: isMobile ? '10px' : '14px',
              border: `1px solid ${t.borderSubtle}`,
            }}>
              <h3 style={{ ...sectionHeaderStyle, color: t.accentBlue, marginBottom: '12px' }}>
                Rebellion Status (Act {ap.act})
              </h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {exposureDelta !== 0 && (
                  <span style={{
                    ...pillStyle,
                    color: exposureDelta > 0 ? t.accentRed : t.accentGreen,
                    borderColor: `${exposureDelta > 0 ? t.accentRed : t.accentGreen}40`,
                  }}>
                    Exposure {exposureDelta > 0 ? '+' : ''}{exposureDelta}
                  </span>
                )}
                {influenceDelta > 0 && (
                  <span style={{
                    ...pillStyle,
                    color: t.accentBlue,
                    borderColor: `${t.accentBlue}40`,
                  }}>
                    Influence +{influenceDelta}
                  </span>
                )}
                {controlDelta > 0 && (
                  <span style={{
                    ...pillStyle,
                    color: t.accentRed,
                    borderColor: `${t.accentRed}40`,
                  }}>
                    Control +{controlDelta}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: t.textMuted }}>
                <span>
                  Exposure: {ap.exposure}/10{' '}
                  <span style={{ color: statusColors[status], fontWeight: 'bold' }}>
                    [{statusLabels[status]}]
                  </span>
                </span>
                <span>
                  Influence {ap.influence} vs Control {ap.control}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Supply Network Consequences */}
        {campaignState?.supplyNetwork && (() => {
          const sectorMap = sectorMapData as SectorMapDefinition
          const network = campaignState.supplyNetwork!
          const severedNodes = network.nodes.filter(n => n.severed)

          // Find the mission's location to show location-specific impact
          const missionLocation = sectorMap.locations.find(
            loc => loc.unlocksMissions?.includes(result.missionId)
          )
          const locationSevered = missionLocation
            ? severedNodes.filter(n => n.locationId === missionLocation.id)
            : []

          // Show if mission failed and nodes were severed, or if any nodes are severed
          if (!isVictory && locationSevered.length > 0) {
            return (
              <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
                <h3 style={{ ...sectionHeaderStyle, color: t.accentRed }}>
                  Supply Network Damaged
                </h3>
                <div style={{
                  backgroundColor: 'rgba(255, 68, 68, 0.05)',
                  border: `1px solid ${t.accentRed}30`,
                  borderLeft: `3px solid ${t.accentRed}`,
                  borderRadius: t.radiusMd,
                  padding: isMobile ? '10px' : '14px',
                  fontSize: '13px',
                  lineHeight: '1.6',
                }}>
                  <div style={{ color: t.textPrimary, marginBottom: '8px' }}>
                    Imperial forces have severed your supply connections at {missionLocation?.name ?? 'the mission location'}:
                  </div>
                  {locationSevered.map(node => {
                    const typeLabel = node.type === 'contact' ? 'Contact'
                      : node.type === 'safehouse' ? 'Safehouse'
                      : 'Supply Route'
                    const typeColor = node.type === 'contact' ? t.accentBlue
                      : node.type === 'safehouse' ? t.accentGreen
                      : t.accentOrange
                    return (
                      <div key={node.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 0',
                      }}>
                        <span style={{ color: t.accentRed, fontSize: '14px' }}>{'\u2716'}</span>
                        <span style={{ color: typeColor, fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase' }}>
                          {typeLabel}
                        </span>
                        <span style={{ color: t.textSecondary }}>
                          {node.name} ({node.buildCost} credits to rebuild)
                        </span>
                      </div>
                    )
                  })}
                  {network.nodes.filter(n => !n.severed).length > 0 && (
                    <div style={{ marginTop: '8px', color: t.textMuted, fontSize: '11px', fontStyle: 'italic' }}>
                      Remaining active nodes: {network.nodes.filter(n => !n.severed).length} / {network.nodes.length}
                    </div>
                  )}
                </div>
              </div>
            )
          }

          // On victory, show network intact status if player has nodes
          if (isVictory && network.nodes.length > 0 && severedNodes.length === 0) {
            return (
              <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
                <h3 style={{ ...sectionHeaderStyle, color: t.accentGreen }}>
                  Supply Network Intact
                </h3>
                <div style={{
                  backgroundColor: 'rgba(68, 255, 68, 0.05)',
                  border: `1px solid ${t.accentGreen}30`,
                  borderRadius: t.radiusMd,
                  padding: '8px 14px',
                  fontSize: '12px',
                  color: t.textMuted,
                }}>
                  All {network.nodes.length} supply nodes operational. Network income: {network.networkIncome} credits/mission.
                </div>
              </div>
            )
          }

          return null
        })()}

        {/* Continue button */}
        <button
          style={{
            ...buttonStyle,
            backgroundColor: t.accentBlue,
            color: '#fff',
          }}
          onClick={campaignState ? openSocialPhase : returnToMissionSelect}
        >
          {campaignState ? 'CONTINUE TO CANTINA' : 'CONTINUE TO CAMPAIGN'}
        </button>
      </div>

      {/* Legacy Event Reveal overlay */}
      {showLegacyEvents && campaignState && (
        <LegacyEventReveal
          campaign={campaignState}
          eventDefs={legacyEventDefs}
          onAcknowledge={acknowledgeLegacyEvents}
        />
      )}
    </div>
  )
}

/**
 * PostMission - Shown after a campaign mission ends.
 * Displays XP breakdown, hero status, mission result, and lets the player continue.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { MissionResult, HeroCharacter } from '../../../../engine/src/types'
import { getExposureStatus } from '../../../../engine/src/types'
import { calculateMissionExposure, calculateMissionInfluence, calculateMissionControl } from '../../../../engine/src/campaign-v2'
import { HeroPortrait } from '../Portrait/HeroPortrait'
import { t } from '../../styles/theme'
import { CriticalInjuryPanel } from './CriticalInjuryPanel'
import { MomentumIndicator } from './MomentumIndicator'
import { LegacyEventReveal } from './LegacyEventReveal'

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
    lastMissionResult, returnToMissionSelect, openSocialPhase,
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

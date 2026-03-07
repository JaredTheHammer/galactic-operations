/**
 * CampaignJournal - Full-screen journal showing completed missions
 * and social phase history with narrative text, XP earned, objectives,
 * rival activity, bounty outcomes, and threat clock progression.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type {
  MissionResult,
  MissionDefinition,
  ExpandedSocialPhaseResult,
  SocialPhaseResult,
} from '../../../../engine/src/types'

type Tab = 'missions' | 'social'
import type { MissionResult, MissionDefinition, ActOutcome } from '../../../../engine/src/types'

export default function CampaignJournal() {
  const { campaignState, campaignMissions, closeCampaignJournal } = useGameStore()
  const { isMobile } = useIsMobile()
  const [activeTab, setActiveTab] = useState<Tab>('missions')

  if (!campaignState) return null

  const missions = campaignState.completedMissions
  const reversedMissions = [...missions].reverse()
  const socialResults = (campaignState.socialPhaseResults ?? []) as (SocialPhaseResult | ExpandedSocialPhaseResult)[]
  const reversedSocial = [...socialResults].reverse()
  const actOutcomes = campaignState.actOutcomes ?? []

  const containerStyle: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    color: '#c0c0c0',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: isMobile ? '12px 16px' : '14px 24px',
    borderBottom: '2px solid #333355',
    backgroundColor: '#131320',
    flexShrink: 0,
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    border: 'none',
    borderBottom: isActive ? '2px solid #cc8800' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    backgroundColor: 'transparent',
    color: isActive ? '#cc8800' : '#666',
  })

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#cc8800', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>
            Campaign Journal
          </h1>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button style={tabStyle(activeTab === 'missions')} onClick={() => setActiveTab('missions')}>
              Missions ({missions.length})
            </button>
            <button style={tabStyle(activeTab === 'social')} onClick={() => setActiveTab('social')}>
              Social ({socialResults.length})
            </button>
          </div>
        </div>
        <button
          style={{
            padding: '8px 16px',
            border: '1px solid #333355',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            backgroundColor: '#2a2a3a',
            color: '#cc8800',
          }}
          onClick={closeCampaignJournal}
        >
          Back
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '12px' : '20px 32px' }}>
        {activeTab === 'missions' && (
          <>
            {missions.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#555',
                fontSize: '15px',
              }}>
                No missions completed yet. Your story awaits.
              </div>
            ) : (
              <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px' }}>
                {reversedMissions.map((result, i) => (
                  <JournalEntry
                    key={i}
                    result={result}
                    missionDef={campaignMissions[result.missionId]}
                    index={missions.length - i}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'social' && (
          <>
            {socialResults.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#555',
                fontSize: '15px',
              }}>
                No social phase visits yet.
              </div>
            ) : (
              <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px' }}>
                {reversedSocial.map((result, i) => (
                  <SocialPhaseEntry
                    key={i}
                    result={result}
                    index={socialResults.length - i}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}
          </>
        {missions.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#555',
            fontSize: '15px',
          }}>
            No missions completed yet. Your story awaits.
          </div>
        ) : (
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px' }}>
            {/* Act outcome badges at top for completed acts in current view */}
            {actOutcomes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '12px' }}>
                {[...actOutcomes].reverse().map(outcome => (
                  <ActOutcomeBadge key={outcome.act} outcome={outcome} isMobile={isMobile} />
                ))}
              </div>
            )}
            {reversedMissions.map((result, i) => (
              <JournalEntry
                key={i}
                result={result}
                missionDef={campaignMissions[result.missionId]}
                index={missions.length - i}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function JournalEntry({
  result,
  missionDef,
  index,
  isMobile,
}: {
  result: MissionResult
  missionDef: MissionDefinition | undefined
  index: number
  isMobile: boolean
}) {
  const isVictory = result.outcome === 'victory'
  const outcomeColor = isVictory ? '#44ff44' : '#ff4444'
  const narrativeText = missionDef
    ? (isVictory ? missionDef.narrativeSuccess : missionDef.narrativeFailure)
    : null

  const date = result.completedAt ? new Date(result.completedAt) : null
  const dateStr = date
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  return (
    <div style={{
      backgroundColor: '#12121f',
      border: '1px solid #2a2a3f',
      borderLeft: `3px solid ${outcomeColor}`,
      borderRadius: isMobile ? '6px' : '8px',
      padding: isMobile ? '14px' : '20px',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '10px',
        gap: '8px',
      }}>
        <div>
          <div style={{
            fontSize: '10px',
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}>
            Mission {index}{missionDef ? ` \u2014 Act ${missionDef.campaignAct}` : ''}
          </div>
          <div style={{
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: 'bold',
            color: '#ffd966',
          }}>
            {missionDef?.name ?? result.missionId}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            color: outcomeColor,
            fontWeight: 'bold',
            fontSize: '12px',
          }}>
            {isVictory ? 'VICTORY' : result.outcome === 'defeat' ? 'DEFEAT' : 'DRAW'}
          </div>
          {dateStr && (
            <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{dateStr}</div>
          )}
        </div>
      </div>

      {/* Narrative text */}
      {narrativeText && (
        <div style={{
          padding: isMobile ? '10px' : '12px 16px',
          marginBottom: '12px',
          backgroundColor: '#0a0a12',
          borderRadius: '6px',
          borderLeft: `2px solid ${outcomeColor}40`,
        }}>
          <p style={{
            color: '#ccbb88',
            fontSize: isMobile ? '13px' : '14px',
            lineHeight: '1.6',
            fontStyle: 'italic',
            margin: 0,
          }}>
            {narrativeText}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: isMobile ? '10px' : '16px',
        flexWrap: 'wrap',
        fontSize: '12px',
        color: '#888',
      }}>
        <span>{result.roundsPlayed} rounds</span>
        <span style={{ color: '#44ff44' }}>+{result.xpBreakdown.total} XP</span>
        {result.completedObjectiveIds.length > 0 && (
          <span>{result.completedObjectiveIds.length} objective{result.completedObjectiveIds.length !== 1 ? 's' : ''}</span>
        )}
        {result.lootCollected.length > 0 && (
          <span style={{ color: '#ffd700' }}>{result.lootCollected.length} loot</span>
        )}
        {result.heroesIncapacitated.length > 0 && (
          <span style={{ color: '#ff6644' }}>
            {result.heroesIncapacitated.length} incapacitated
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SOCIAL PHASE JOURNAL ENTRY
// ============================================================================

const THREAT_LEVEL_COLORS: Record<string, string> = {
  caught_off_guard: '#44ff44',
  normal: '#888',
  prepared: '#ffaa00',
  fortified: '#ff6600',
  ambush: '#ff2222',
}

function isExpanded(result: SocialPhaseResult | ExpandedSocialPhaseResult): result is ExpandedSocialPhaseResult {
  return 'slotsUsed' in result
}

function SocialPhaseEntry({
  result,
  index,
  isMobile,
}: {
  result: SocialPhaseResult | ExpandedSocialPhaseResult
  index: number
  isMobile: boolean
}) {
  const expanded = isExpanded(result)
  const encounterCount = result.encounterResults.length
  const purchaseCount = result.itemsPurchased.length
  const saleCount = result.itemsSold.length

  const threatColor = expanded
    ? (THREAT_LEVEL_COLORS[result.threatClockEffects.level] ?? '#888')
    : '#888'

  return (
    <div style={{
      backgroundColor: '#12121f',
      border: '1px solid #2a2a3f',
      borderLeft: `3px solid #4a9eff`,
      borderRadius: isMobile ? '6px' : '8px',
      padding: isMobile ? '14px' : '20px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <div>
          <div style={{
            fontSize: '10px',
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}>
            Social Phase {index}
          </div>
          <div style={{
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: 'bold',
            color: '#4a9eff',
          }}>
            {result.locationId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </div>
        </div>
        {expanded && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: '11px',
              color: '#aaa',
            }}>
              {result.slotsUsed}/{result.slotsTotal} slots
              {result.deployedEarly && ' (early deploy)'}
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 'bold',
              color: threatColor,
              marginTop: '2px',
            }}>
              Threat: {result.threatClockFinal}/10
            </div>
          </div>
        )}
      </div>

      {/* Threat Clock Effects */}
      {expanded && result.threatClockEffects.level !== 'normal' && (
        <div style={{
          padding: '8px 10px',
          marginBottom: '10px',
          borderRadius: '4px',
          backgroundColor: `${threatColor}10`,
          border: `1px solid ${threatColor}30`,
          fontSize: '11px',
          color: threatColor,
        }}>
          {result.threatClockEffects.level.replace(/_/g, ' ').toUpperCase()}
          {result.threatClockEffects.operativeSurpriseRound && ' -- Operative surprise round'}
          {result.threatClockEffects.enemySurpriseRound && ' -- Enemy surprise round'}
          {result.threatClockEffects.bonusReinforcements > 0 &&
            ` -- +${result.threatClockEffects.bonusReinforcements} reinforcement${result.threatClockEffects.bonusReinforcements > 1 ? 's' : ''}`}
          {result.threatClockEffects.enemiesStartInCover && ' -- Enemies in cover'}
        </div>
      )}

      {/* Rival Actions */}
      {expanded && result.rivalActions.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', color: '#ff8800', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Rival Activity
          </div>
          <div style={{
            backgroundColor: '#0a0a12',
            borderRadius: '4px',
            padding: '8px',
            border: '1px solid #1a1a2f',
          }}>
            {result.rivalActions.map((action, i) => (
              <div key={i} style={{
                fontSize: '11px', color: '#aaa', padding: '2px 0',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>{action.description}</span>
                <span style={{ color: '#666', fontSize: '10px' }}>
                  {action.type.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bounty Outcomes */}
      {expanded && (result.bountiesAccepted.length > 0 || result.bountiesClaimedByRival.length > 0) && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', color: '#ffd700', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Bounties
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px' }}>
            {result.bountiesAccepted.map(id => (
              <span key={id} style={{
                padding: '2px 8px',
                borderRadius: '3px',
                backgroundColor: '#4a9eff20',
                color: '#4a9eff',
              }}>
                {id.replace(/^bounty-/, '').replace(/-/g, ' ')}
              </span>
            ))}
            {result.bountiesClaimedByRival.map(id => (
              <span key={id} style={{
                padding: '2px 8px',
                borderRadius: '3px',
                backgroundColor: '#ff444420',
                color: '#ff4444',
              }}>
                {id.replace(/^bounty-/, '').replace(/-/g, ' ')} (rival)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: isMobile ? '10px' : '16px',
        flexWrap: 'wrap',
        fontSize: '12px',
        color: '#888',
      }}>
        {encounterCount > 0 && (
          <span>{encounterCount} encounter{encounterCount !== 1 ? 's' : ''}</span>
        )}
        {purchaseCount > 0 && (
          <span style={{ color: '#ff6644' }}>
            {purchaseCount} purchase{purchaseCount !== 1 ? 's' : ''}
          </span>
        )}
        {saleCount > 0 && (
          <span style={{ color: '#44ff44' }}>
            {saleCount} sale{saleCount !== 1 ? 's' : ''}
          </span>
        )}
        {result.creditsSpentOnHealing > 0 && (
          <span style={{ color: '#ff8800' }}>
            -{result.creditsSpentOnHealing} healing
          </span>
        )}
function ActOutcomeBadge({ outcome, isMobile }: { outcome: ActOutcome; isMobile: boolean }) {
  const tierColors: Record<string, string> = {
    dominant: '#44ff44', favorable: '#88ccff',
    contested: '#ffaa00', unfavorable: '#ff8844', dire: '#ff4444',
  }
  const tierLabels: Record<string, string> = {
    dominant: 'DOMINANT', favorable: 'FAVORABLE',
    contested: 'CONTESTED', unfavorable: 'UNFAVORABLE', dire: 'DIRE',
  }
  const tc = tierColors[outcome.tier] ?? '#888'

  return (
    <div style={{
      backgroundColor: '#0a0a12',
      border: `1px solid ${tc}30`,
      borderRadius: isMobile ? '6px' : '8px',
      padding: isMobile ? '12px' : '16px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '10px',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: '6px',
      }}>
        Act {outcome.act} Outcome
      </div>
      <div style={{
        fontSize: isMobile ? '16px' : '20px',
        fontWeight: 'bold',
        color: tc,
        letterSpacing: '4px',
        marginBottom: '8px',
      }}>
        {tierLabels[outcome.tier]}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        fontSize: '11px',
        color: '#777',
      }}>
        <span>Influence: {outcome.influence}</span>
        <span>Control: {outcome.control}</span>
        <span>Exposure: {outcome.exposure}</span>
        <span>Delta: {outcome.delta > 0 ? '+' : ''}{outcome.delta}</span>
      </div>
    </div>
  )
}

/**
 * PostMission - Shown after a campaign mission ends.
 * Displays XP breakdown, hero status, mission result, and lets the player continue.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { MissionResult, HeroCharacter } from '../../../../engine/src/types'

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#c0c0c0',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
}

const panelStyle: React.CSSProperties = {
  backgroundColor: '#12121f',
  border: '1px solid #2a2a3f',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '700px',
  width: '90%',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: '6px',
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
  backgroundColor: '#0a0a1a',
  border: '1px solid #1a1a2f',
  borderRadius: '6px',
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
      <span style={{ color: '#44ff44', fontWeight: 'bold' }}>+{value} XP</span>
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
  const borderColor = wasIncapacitated ? '#ff4444' : isWounded ? '#ffaa00' : '#2a4a2a'
  const statusColor = wasIncapacitated ? '#ff4444' : isWounded ? '#ffaa00' : '#44ff44'
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
        <span style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</span>
        <span style={{ color: statusColor, fontSize: '10px', fontWeight: 'bold' }}>
          {statusIcon} {statusText}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#888' }}>
        <span>W: {hero.wounds.current}/{hero.wounds.threshold}</span>
        <span>S: {hero.strain.current}/{hero.strain.threshold}</span>
        {kills > 0 && <span style={{ color: '#ffaa00' }}>{kills} kill{kills !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PostMission() {
  const { lastMissionResult, returnToMissionSelect, openSocialPhase, campaignState } = useGameStore()
  const { isMobile } = useIsMobile()

  if (!lastMissionResult) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ff4444', marginBottom: '16px' }}>No mission result available.</div>
          <button
            style={{ ...buttonStyle, backgroundColor: '#2a2a3f', color: '#c0c0c0', width: 'auto' }}
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
  const outcomeColor = isVictory ? '#44ff44' : '#ff4444'
  const outcomeText = isVictory ? 'MISSION COMPLETE' : 'MISSION FAILED'

  const heroes = campaignState
    ? (Object.values(campaignState.heroes) as HeroCharacter[])
    : []

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
        <div style={{ textAlign: 'center', color: '#888', marginBottom: isMobile ? '16px' : '24px', fontSize: isMobile ? '13px' : '14px' }}>
          Completed in {result.roundsPlayed} rounds
        </div>

        {/* XP Breakdown */}
        <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
          <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: isMobile ? '14px' : '16px' }}>XP Earned</h3>
          <div style={{
            backgroundColor: '#0a0a1a',
            borderRadius: '8px',
            padding: isMobile ? '8px' : '12px',
            border: '1px solid #1a1a2f',
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
              borderTop: '1px solid #2a2a3f',
              fontSize: isMobile ? '15px' : '18px',
              fontWeight: 'bold',
            }}>
              <span style={{ color: '#fff' }}>Total</span>
              <span style={{ color: '#44ff44', textShadow: '0 0 8px #44ff4440' }}>
                +{result.xpBreakdown.total} XP
              </span>
            </div>
          </div>
        </div>

        {/* Hero Status */}
        {heroes.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '20px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: '#4a9eff' }}>Squad Status</h3>
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
            <h3 style={{ ...sectionHeaderStyle, color: '#4a9eff' }}>
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
                  color: '#44ff44',
                  ...(isMobile ? { width: '100%', marginRight: 0 } : {}),
                }}>
                  <span style={{ fontSize: '14px' }}>{'\u2714'}</span>
                  {id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loot collected */}
        {result.lootCollected.length > 0 && (
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            <h3 style={{ ...sectionHeaderStyle, color: '#ffaa00' }}>
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
                  color: '#ffd700',
                  borderColor: '#3a3a1a',
                  ...(isMobile ? { width: '100%', marginRight: 0 } : {}),
                }}>
                  <span style={{ fontSize: '14px' }}>{'\u2B50'}</span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Continue button */}
        <button
          style={{
            ...buttonStyle,
            backgroundColor: '#4a9eff',
            color: '#fff',
          }}
          onClick={campaignState ? openSocialPhase : returnToMissionSelect}
        >
          {campaignState ? 'CONTINUE TO CANTINA' : 'CONTINUE TO CAMPAIGN'}
        </button>
      </div>
    </div>
  )
}

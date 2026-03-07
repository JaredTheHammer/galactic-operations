/**
 * MissionBriefing - Full-screen briefing card shown before combat begins.
 * Displays narrativeIntro, objectives summary, and a DEPLOY button.
 * Styled as a mission dossier with dark panel and amber accent.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import { getThreatClockEffects } from '../../../../engine/src/social-phase'
import type { ExpandedSocialPhaseResult } from '../../../../engine/src/types'

// ============================================================================
// Component
// ============================================================================

export default function MissionBriefing() {
  const { activeMissionDef, campaignState, deployFromBriefing, closeMissionBriefing } = useGameStore()
  const { isMobile } = useIsMobile()

  if (!activeMissionDef || !campaignState) return null

  const mission = activeMissionDef
  const heroes = Object.values(campaignState.heroes)
  const primaryObjectives = mission.objectives.filter(o => o.priority === 'primary')
  const secondaryObjectives = mission.objectives.filter(o => o.priority === 'secondary')

  // Threat clock effects from last social phase
  const lastSocialResult = campaignState.socialPhaseResults?.at(-1) as ExpandedSocialPhaseResult | undefined
  const clockEffects = lastSocialResult?.threatClockEffects ?? null

  // Active bounty targets for this mission
  const activeBounties = campaignState.activeBounties ?? []

  const containerStyle: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: isMobile ? '16px' : '32px',
  }

  const panelStyle: React.CSSProperties = {
    backgroundColor: '#0f0f1a',
    border: '2px solid #cc8800',
    borderRadius: isMobile ? '0' : '12px',
    padding: isMobile ? '20px' : '36px 40px',
    maxWidth: '720px',
    width: '100%',
    boxShadow: '0 0 40px rgba(204, 136, 0, 0.15), inset 0 0 80px rgba(0, 0, 0, 0.3)',
  }

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '24px',
  }

  const actBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#cc8800',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    marginBottom: '8px',
    padding: '4px 12px',
    border: '1px solid #cc8800',
    borderRadius: '3px',
  }

  const titleStyle: React.CSSProperties = {
    color: '#ffd966',
    fontSize: isMobile ? '22px' : '28px',
    fontWeight: 'bold',
    margin: '8px 0 4px 0',
    textShadow: '0 0 20px rgba(255, 217, 102, 0.3)',
  }

  const subtitleStyle: React.CSSProperties = {
    color: '#888',
    fontSize: '13px',
    margin: 0,
  }

  const dividerStyle: React.CSSProperties = {
    height: '1px',
    background: 'linear-gradient(90deg, transparent, #cc880060, transparent)',
    margin: '20px 0',
  }

  const narrativeStyle: React.CSSProperties = {
    color: '#ccbb88',
    fontSize: isMobile ? '14px' : '15px',
    lineHeight: '1.7',
    fontStyle: 'italic',
    textAlign: 'left',
    marginBottom: '20px',
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#cc8800',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    marginBottom: '8px',
  }

  const objectiveStyle = (isPrimary: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '6px 0',
    fontSize: '13px',
    color: isPrimary ? '#ddd' : '#999',
  })

  const markerStyle = (isPrimary: boolean): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: isPrimary ? '#cc8800' : '#666',
    marginTop: '5px',
    flexShrink: 0,
  })

  const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: isMobile ? '12px' : '24px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: '20px',
  }

  const infoCardStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '8px 16px',
    backgroundColor: '#0a0a12',
    border: '1px solid #2a2a3f',
    borderRadius: '6px',
  }

  return (
    <div style={containerStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={actBadgeStyle}>Act {mission.campaignAct} -- Mission Briefing</div>
          <h1 style={titleStyle}>{mission.name}</h1>
          <p style={subtitleStyle}>{mission.description}</p>
        </div>

        <div style={dividerStyle} />

        {/* Narrative intro */}
        <p style={narrativeStyle}>{mission.narrativeIntro}</p>

        <div style={dividerStyle} />

        {/* Mission parameters */}
        <div style={infoRowStyle}>
          <div style={infoCardStyle}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Difficulty</div>
            <div style={{ fontSize: '14px', color: '#ffd966', fontWeight: 'bold', textTransform: 'capitalize' }}>
              {mission.difficulty}
            </div>
          </div>
          <div style={infoCardStyle}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Round Limit</div>
            <div style={{ fontSize: '14px', color: '#ffd966', fontWeight: 'bold' }}>{mission.roundLimit}</div>
          </div>
          <div style={infoCardStyle}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Squad</div>
            <div style={{ fontSize: '14px', color: '#ffd966', fontWeight: 'bold' }}>{heroes.length} heroes</div>
          </div>
          <div style={infoCardStyle}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Threat</div>
            <div style={{ fontSize: '14px', color: '#ff6644', fontWeight: 'bold' }}>{mission.imperialThreat}</div>
          </div>
        </div>

        {/* Threat Clock Effects */}
        {clockEffects && clockEffects.level !== 'normal' && (
          <div style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: clockEffects.level === 'caught_off_guard' ? '#44ff4410' : '#ff440015',
            border: `1px solid ${clockEffects.level === 'caught_off_guard' ? '#44ff4440' : '#ff444040'}`,
          }}>
            <div style={{
              fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1.5px',
              color: clockEffects.level === 'caught_off_guard' ? '#44ff44' : '#ff6644',
              marginBottom: '4px',
            }}>
              Intel Assessment: {clockEffects.level.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '12px', color: '#aaa' }}>
              {clockEffects.operativeSurpriseRound && 'Your team will get a surprise round -- enemies are caught off guard.'}
              {clockEffects.enemySurpriseRound && 'Enemy forces are aware of your approach -- expect an ambush.'}
              {clockEffects.bonusReinforcements > 0 && !clockEffects.enemySurpriseRound &&
                `Enemy reinforcements detected: +${clockEffects.bonusReinforcements} additional group${clockEffects.bonusReinforcements > 1 ? 's' : ''}.`}
              {clockEffects.enemiesStartInCover && ' Enemies have fortified positions.'}
            </div>
          </div>
        )}

        {/* Active Bounties */}
        {activeBounties.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={sectionTitleStyle}>Active Bounties</div>
            {activeBounties.map(bounty => (
              <div key={bounty.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', marginBottom: '4px',
                backgroundColor: '#0a0a12', border: '1px solid #2a2a3f', borderRadius: '4px',
                fontSize: '12px',
              }}>
                <div>
                  <span style={{ color: '#ffd966', fontWeight: 'bold' }}>{bounty.targetName}</span>
                  <span style={{ color: '#888', marginLeft: '8px' }}>({bounty.condition})</span>
                </div>
                <span style={{ color: '#cc8800' }}>+{bounty.creditReward} cr</span>
              </div>
            ))}
          </div>
        )}

        {/* Objectives */}
        {primaryObjectives.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={sectionTitleStyle}>Primary Objectives</div>
            {primaryObjectives.map(obj => (
              <div key={obj.id} style={objectiveStyle(true)}>
                <div style={markerStyle(true)} />
                <span>{obj.description}</span>
              </div>
            ))}
          </div>
        )}

        {secondaryObjectives.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={sectionTitleStyle}>Secondary Objectives</div>
            {secondaryObjectives.map(obj => (
              <div key={obj.id} style={objectiveStyle(false)}>
                <div style={markerStyle(false)} />
                <span>{obj.description} (+{obj.xpReward} XP)</span>
              </div>
            ))}
          </div>
        )}

        <div style={dividerStyle} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
          <button
            style={{
              flex: 1,
              padding: '14px 24px',
              borderRadius: '6px',
              border: '1px solid #333355',
              backgroundColor: '#1a1a2e',
              color: '#999',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
            onClick={closeMissionBriefing}
          >
            Abort
          </button>
          <button
            style={{
              flex: 2,
              padding: '14px 24px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#cc8800',
              color: '#000',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              textShadow: '0 1px 0 rgba(255, 255, 255, 0.2)',
              boxShadow: '0 0 20px rgba(204, 136, 0, 0.3)',
            }}
            onClick={deployFromBriefing}
          >
            Deploy Squad
          </button>
        </div>
      </div>
    </div>
  )
}


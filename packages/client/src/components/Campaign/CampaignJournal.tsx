/**
 * CampaignJournal - Full-screen mission log showing completed missions
 * with narrative text, XP earned, objectives completed, and outcome details.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { MissionResult, MissionDefinition } from '../../../../engine/src/types'

export default function CampaignJournal() {
  const { campaignState, campaignMissions, closeCampaignJournal } = useGameStore()
  const { isMobile } = useIsMobile()

  if (!campaignState) return null

  const missions = campaignState.completedMissions
  const reversedMissions = [...missions].reverse()

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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#cc8800', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>
            Mission Journal
          </h1>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
            {missions.length} mission{missions.length !== 1 ? 's' : ''} completed
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

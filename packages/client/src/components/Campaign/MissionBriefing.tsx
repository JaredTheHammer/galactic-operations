/**
 * MissionBriefing - Narrative briefing screen shown before mission combat starts.
 * Displays mission name, narrative intro, objectives, and companion info.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function MissionBriefing() {
  const { campaignState, campaignMissions, pendingMissionId, dismissMissionBriefing } = useGameStore()
  const { isMobile } = useIsMobile()

  if (!pendingMissionId || !campaignMissions) return null
  const mission = campaignMissions[pendingMissionId]
  if (!mission) return null

  const companions = campaignState?.companions ?? []

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
      justifyContent: 'center',
      overflow: 'auto',
    }}>
      <div style={{
        backgroundColor: '#12121f',
        border: '1px solid #2a2a3f',
        borderRadius: '12px',
        padding: isMobile ? '20px' : '40px',
        maxWidth: '700px',
        width: isMobile ? '100%' : '90%',
        ...(isMobile ? { borderRadius: '0' } : {}),
      }}>
        {/* Mission header */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px',
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            marginBottom: '8px',
          }}>
            Mission Briefing
          </div>
          <h1 style={{
            color: '#ffd700',
            margin: '0 0 4px 0',
            fontSize: isMobile ? '22px' : '28px',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
          }}>
            {mission.name}
          </h1>
          <div style={{
            fontSize: '12px',
            color: '#888',
          }}>
            Act {mission.campaignAct} \u2022 {mission.difficulty.toUpperCase()} \u2022 Round Limit: {mission.roundLimit}
          </div>
        </div>

        {/* Narrative intro */}
        <div style={{
          backgroundColor: '#0a0a1a',
          border: '1px solid #2a2a3f',
          borderLeft: '3px solid #ffd700',
          borderRadius: '8px',
          padding: isMobile ? '14px' : '20px',
          margin: '24px 0',
          fontStyle: 'italic',
          color: '#ddd',
          fontSize: '14px',
          lineHeight: '1.8',
        }}>
          {mission.narrativeIntro}
        </div>

        {/* Objectives */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '12px',
            color: '#4a9eff',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            marginBottom: '8px',
          }}>
            Objectives
          </div>
          {mission.objectives.map(obj => {
            const isPrimary = obj.priority === 'primary'
            return (
              <div key={obj.id} style={{
                fontSize: '13px',
                padding: '8px 10px',
                marginBottom: '4px',
                backgroundColor: '#0a0a1a',
                borderRadius: '4px',
                borderLeft: `3px solid ${isPrimary ? '#ffd700' : '#555'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ color: isPrimary ? '#ffd700' : '#666', fontSize: '14px' }}>
                  {isPrimary ? '\u2605' : '\u2022'}
                </span>
                <span style={{ color: isPrimary ? '#ddd' : '#999', flex: 1 }}>
                  {obj.description}
                </span>
                {obj.xpReward > 0 && (
                  <span style={{ color: '#44ff44', fontSize: '11px' }}>+{obj.xpReward} XP</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Companions deploying */}
        {companions.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '12px',
              color: '#44ff44',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              marginBottom: '8px',
            }}>
              Companion Allies
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {companions.map(id => (
                <span key={id} style={{
                  padding: '4px 10px',
                  backgroundColor: '#0a2a1a',
                  border: '1px solid #44ff4440',
                  borderRadius: '4px',
                  color: '#44ff44',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}>
                  {id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
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

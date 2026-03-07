/**
 * MissionSelect - Campaign mission selection screen.
 * Shows available missions, campaign stats, hero roster with wound status,
 * completed mission history, and XP spending.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { MissionDefinition, CampaignState, HeroCharacter, MissionResult, CriticalInjuryDefinition, ActProgress } from '../../../../engine/src/types'
import type { MissionDefinition, CampaignState, HeroCharacter, MissionResult, SectorMapDefinition } from '../../../../engine/src/types'
import { getCampaignStats } from '../../../../engine/src/campaign-v2'
import { getNetworkUnlockedMissions, getNetworkSummary } from '../../../../engine/src/supply-network'
import sectorMapData from '../../../../../data/sector-map.json'
import type { MissionDefinition, CampaignState, HeroCharacter, MissionResult, ActProgress } from '../../../../engine/src/types'
import { getExposureStatus } from '../../../../engine/src/types'
import { getCampaignStats, getFinaleExposureModifiers, getCampaignEpilogue } from '../../../../engine/src/campaign-v2'
import { HeroPortrait } from '../Portrait/HeroPortrait'
import { downloadCampaignBundle, importCampaignFromFile } from '../../services/campaign-export'
import { usePortraitStore } from '../../store/portrait-store'
import { listSaveSlots, MAX_SLOTS, findEmptySlot, type SaveSlotMeta } from '../../services/save-slots'
import { MomentumIndicator } from './MomentumIndicator'
import { SectorControlDisplay } from './SectorControlDisplay'
import { CriticalInjuryPanel } from './CriticalInjuryPanel'
import { CampaignVictory } from './CampaignVictory'

// ============================================================================
// STYLES
// ============================================================================

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
  padding: '16px 24px',
  borderBottom: '1px solid #2a2a3f',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
}

const sidebarStyle: React.CSSProperties = {
  width: '280px',
  borderRight: '1px solid #2a2a3f',
  padding: '16px',
  overflowY: 'auto',
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: '24px',
  overflowY: 'auto',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#12121f',
  border: '1px solid #2a2a3f',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
}

const selectedCardStyle: React.CSSProperties = {
  ...cardStyle,
  borderColor: '#4a9eff',
  boxShadow: '0 0 10px rgba(74, 158, 255, 0.2)',
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '14px',
}

const difficultyColors: Record<string, string> = {
  easy: '#44ff44',
  moderate: '#ffaa00',
  hard: '#ff6644',
  deadly: '#ff2222',
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function HeroCard({ hero }: { hero: HeroCharacter }) {
  const isWounded = hero.isWounded
  const borderColor = isWounded ? '#ffaa00' : '#2a2a3f'

  return (
    <div style={{ ...cardStyle, cursor: 'default', borderColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={28} accentColor="#4a9eff" />
          <span style={{ color: '#4a9eff', fontWeight: 'bold' }}>{hero.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isWounded && (
            <span style={{
              color: '#ffaa00',
              fontSize: '10px',
              fontWeight: 'bold',
              backgroundColor: '#3a2a0a',
              padding: '2px 6px',
              borderRadius: '3px',
              border: '1px solid #ffaa0040',
            }}>
              {'\u26A0'} WOUNDED
            </span>
          )}
          {(hero.missionsRested ?? 0) > 0 && (
            <span style={{
              color: '#4a9eff',
              fontSize: '10px',
              fontWeight: 'bold',
              backgroundColor: '#0a1a3a',
              padding: '2px 6px',
              borderRadius: '3px',
            }}>
              REST {hero.missionsRested}
            </span>
          )}
          <span style={{ color: '#888', fontSize: '12px' }}>
            XP: {hero.xp.available}/{hero.xp.total}
          </span>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: '#888' }}>
        {hero.species} {hero.career} / {hero.specializations[0]}
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', display: 'flex', gap: '8px' }}>
        <span>W: {hero.wounds.current}/{hero.wounds.threshold}</span>
        <span>S: {hero.strain.current}/{hero.strain.threshold}</span>
        <span>Soak: {hero.soak}</span>
      </div>
    </div>
  )
}

function CampaignStatsPanel({ campaign }: { campaign: CampaignState }) {
  const victories = campaign.completedMissions.filter(r => r.outcome === 'victory').length
  const defeats = campaign.completedMissions.filter(r => r.outcome === 'defeat').length

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>Campaign Stats</h3>
      <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
        <div>Missions: {campaign.missionsPlayed} ({victories}W / {defeats}L)</div>
        <div>Credits: <span style={{ color: '#ffd700' }}>{campaign.credits}</span></div>
        <div>Threat Level: {campaign.threatLevel}</div>
        <div>Difficulty: {campaign.difficulty}</div>
      </div>
    </div>
  )
}

function NetworkStatsWidget({ campaign }: { campaign: CampaignState }) {
  const summary = getNetworkSummary(campaign.supplyNetwork, sectorMapData as SectorMapDefinition)

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#44ff44', margin: '0 0 8px 0', fontSize: '14px' }}>Supply Network</h3>
      <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
        <div>Nodes: {summary.activeNodes} active{summary.severedNodes > 0 ? `, ${summary.severedNodes} severed` : ''}</div>
        <div>Income: <span style={{ color: '#ffd700' }}>+{summary.networkIncome}</span>/mission</div>
        <div>Upkeep: <span style={{ color: '#ff8844' }}>-{summary.totalUpkeep}</span>/mission</div>
        {summary.threatReduction > 0 && (
          <div>Threat reduction: <span style={{ color: '#44ff44' }}>-{summary.threatReduction}</span></div>
        )}
        {summary.reinforcementBonus > 0 && (
          <div>Reinforce bonus: <span style={{ color: '#4a9eff' }}>+{summary.reinforcementBonus}</span></div>
        )}
        <div>Locations: {summary.connectedLocations.length}</div>
      </div>
    </div>
  )
}

function RebellionStatusPanel({ actProgress }: { actProgress: ActProgress }) {
  const exposureStatus = getExposureStatus(actProgress.exposure)
  const exposurePct = (actProgress.exposure / 10) * 100
  const delta = actProgress.influence - actProgress.control

  const statusConfig = {
    ghost: { label: 'GHOST', color: '#44ff44', icon: '\u{1F47B}' },
    detected: { label: 'DETECTED', color: '#ffaa00', icon: '\u26A0' },
    hunted: { label: 'HUNTED', color: '#ff4444', icon: '\u{1F6A8}' },
  }
  const status = statusConfig[exposureStatus]

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>Rebellion Status</h3>

      {/* Exposure tracker */}
      <div style={{
        padding: '8px',
        marginBottom: '6px',
        backgroundColor: '#0a0a1a',
        borderRadius: '4px',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#888' }}>Exposure</span>
          <span style={{ color: status.color, fontWeight: 'bold', fontSize: '11px' }}>
            {status.icon} {status.label}
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#1a1a2e',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${exposurePct}%`,
            height: '100%',
            backgroundColor: status.color,
            borderRadius: '3px',
            transition: 'width 0.3s, background-color 0.3s',
            boxShadow: `0 0 6px ${status.color}40`,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '10px', color: '#555' }}>
          <span>0</span>
          <span>{actProgress.exposure}/10</span>
        </div>
      </div>

      {/* Influence vs Control */}
      <div style={{
        padding: '8px',
        backgroundColor: '#0a0a1a',
        borderRadius: '4px',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#4a9eff' }}>Influence: {actProgress.influence}</span>
          <span style={{ color: '#ff6666' }}>Control: {actProgress.control}</span>
        </div>
        {/* Tug-of-war bar */}
        <div style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#1a1a2e',
          borderRadius: '4px',
          overflow: 'hidden',
          display: 'flex',
        }}>
          {(() => {
            const total = actProgress.influence + actProgress.control
            const influencePct = total > 0 ? (actProgress.influence / total) * 100 : 50
            return (
              <>
                <div style={{
                  width: `${influencePct}%`,
                  height: '100%',
                  backgroundColor: '#4a9eff',
                  transition: 'width 0.3s',
                }} />
                <div style={{
                  flex: 1,
                  height: '100%',
                  backgroundColor: '#ff444480',
                }} />
              </>
            )
          })()}
        </div>
        <div style={{
          textAlign: 'center',
          marginTop: '4px',
          fontSize: '11px',
          color: delta > 0 ? '#4a9eff' : delta < 0 ? '#ff6666' : '#888',
          fontWeight: 'bold',
        }}>
          {delta > 0 ? `+${delta} Rebellion` : delta < 0 ? `${delta} Imperial` : 'Contested'}
        </div>
      </div>
    </div>
  )
}

const factionDisplayNames: Record<string, string> = {
  underworld: 'Underworld',
  mandalorian: 'Mandalorians',
  rebel: 'Rebel Alliance',
  imperial: 'Empire',
  hutt: 'Hutt Cartel',
}

function FactionReputationPanel({ reputation }: { reputation: Record<string, number> }) {
  const entries = Object.entries(reputation)
  if (entries.length === 0) return null

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>Faction Standing</h3>
      {entries.map(([factionId, value]) => {
        const name = factionDisplayNames[factionId] ?? factionId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const color = value > 0 ? '#44ff44' : value < 0 ? '#ff4444' : '#888'
        const sign = value > 0 ? '+' : ''
        // Bar: map value to a visual width (-10 to +10 range)
        const barWidth = Math.min(Math.abs(value) * 10, 100)
        const barColor = value > 0 ? '#44ff4440' : '#ff444440'
        const barAlign = value >= 0 ? 'left' : 'right'
        return (
          <div key={factionId} style={{
            padding: '6px 8px',
            marginBottom: '4px',
            backgroundColor: '#0a0a1a',
            borderRadius: '4px',
            fontSize: '12px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              [barAlign]: 0,
              bottom: 0,
              width: `${barWidth}%`,
              backgroundColor: barColor,
              transition: 'width 0.3s',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              <span style={{ color: '#ccc' }}>{name}</span>
              <span style={{ color, fontWeight: 'bold' }}>{sign}{value}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InventoryPanel({ campaign }: { campaign: CampaignState }) {
  const narrativeItems = campaign.narrativeItems ?? []
  const consumables = Object.entries(campaign.consumableInventory ?? {}).filter(([, qty]) => qty > 0)

  if (narrativeItems.length === 0 && consumables.length === 0) return null

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>Inventory</h3>
      {consumables.length > 0 && (
        <div style={{ marginBottom: narrativeItems.length > 0 ? '8px' : '0' }}>
          {consumables.map(([id, qty]) => {
            const name = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            return (
              <div key={id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 8px',
                marginBottom: '2px',
                backgroundColor: '#0a0a1a',
                borderRadius: '3px',
                fontSize: '11px',
              }}>
                <span style={{ color: '#ff6644' }}>{name}</span>
                <span style={{ color: '#888' }}>x{qty}</span>
              </div>
            )
          })}
        </div>
      )}
      {narrativeItems.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>Intel & Items</div>
          {narrativeItems.map((item, i) => {
            const name = item.replace(/^(item:|info:)/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            return (
              <div key={i} style={{
                padding: '3px 8px',
                marginBottom: '2px',
                backgroundColor: '#0a0a1a',
                borderRadius: '3px',
                fontSize: '11px',
                color: '#cc77ff',
              }}>
                {name}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MissionHistoryPanel({
  missions,
  missionDefs,
}: {
  missions: MissionResult[]
  missionDefs: Record<string, MissionDefinition>
}) {
  if (missions.length === 0) return null

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>
        Mission History
      </h3>
      <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
        {missions.map((result, i) => {
          const def = missionDefs[result.missionId]
          const isVictory = result.outcome === 'victory'
          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 8px',
              fontSize: '11px',
              backgroundColor: '#0a0a1a',
              borderRadius: '4px',
              marginBottom: '4px',
              borderLeft: `3px solid ${isVictory ? '#44ff44' : '#ff4444'}`,
            }}>
              <span style={{
                color: isVictory ? '#44ff44' : '#ff4444',
                fontWeight: 'bold',
                minWidth: '14px',
              }}>
                {isVictory ? 'W' : 'L'}
              </span>
              <span style={{ color: '#ccc', flex: 1 }}>
                {def?.name ?? result.missionId}
              </span>
              <span style={{ color: '#666' }}>
                {result.roundsPlayed}r
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MissionCard({
  mission,
  isSelected,
  onClick,
  isNetworkUnlocked,
  isNetworkLocked,
}: {
  mission: MissionDefinition
  isSelected: boolean
  onClick: () => void
  isNetworkUnlocked?: boolean
  isNetworkLocked?: boolean
}) {
  const diffColor = difficultyColors[mission.difficulty] ?? '#888'
  return (
    <div
      style={{
        ...(isSelected ? selectedCardStyle : cardStyle),
        ...(isNetworkLocked ? { opacity: 0.5 } : {}),
      }}
      onClick={onClick}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget.style.borderColor = '#3a3a5f') }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget.style.borderColor = '#2a2a3f') }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{mission.name}</span>
          {isNetworkLocked && (
            <span style={{
              fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase',
              padding: '2px 6px', borderRadius: '3px',
              backgroundColor: '#2a1a1a', color: '#ff4444', border: '1px solid #4a2a2a',
            }}>
              LOCKED
            </span>
          )}
          {isNetworkUnlocked && !isNetworkLocked && (
            <span style={{
              fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase',
              padding: '2px 6px', borderRadius: '3px',
              backgroundColor: '#1a2a1a', color: '#44ff44', border: '1px solid #2a4a2a',
            }}>
              NETWORK
            </span>
          )}
        </div>
        <span style={{ color: diffColor, fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
          {mission.difficulty}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
        Act {mission.campaignAct}, Mission {mission.missionIndex}
      </div>
      <div style={{ fontSize: '12px', color: '#aaa' }}>{mission.description}</div>
    </div>
  )
}

// ============================================================================
// CAMPAIGN COMPLETE SCREEN
// ============================================================================

function CampaignCompleteScreen({
  campaign,
  onNewCampaign,
  onExport,
  isMobile,
}: {
  campaign: CampaignState
  onNewCampaign: () => void
  onExport: () => void
  isMobile: boolean
}) {
  const stats = getCampaignStats(campaign)
  const heroes = Object.values(campaign.heroes) as HeroCharacter[]
  const bestHero = heroes.reduce((best, h) => {
    const kills = campaign.completedMissions.reduce(
      (sum, r) => sum + (r.heroKills[h.id] ?? 0), 0,
    )
    const bestKills = campaign.completedMissions.reduce(
      (sum, r) => sum + (r.heroKills[best.id] ?? 0), 0,
    )
    return kills > bestKills ? h : best
  }, heroes[0])

  const bestHeroKills = bestHero
    ? campaign.completedMissions.reduce((sum, r) => sum + (r.heroKills[bestHero.id] ?? 0), 0)
    : 0

  const epilogue = getCampaignEpilogue(campaign)
  const epilogueTierColors: Record<string, string> = {
    legendary: '#ffd700', heroic: '#44ff44', pyrrhic: '#ffaa00',
    bittersweet: '#ff8844', fallen: '#ff4444',
  }
  const epilogueColor = epilogue ? (epilogueTierColors[epilogue.tier] ?? '#ffd700') : '#ffd700'
  const actTierColors: Record<string, string> = {
    dominant: '#44ff44', favorable: '#88ccff',
    contested: '#ffaa00', unfavorable: '#ff8844', dire: '#ff4444',
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '24px 16px' : '48px',
      textAlign: 'center',
      overflowY: 'auto',
    }}>
      <div style={{
        fontSize: isMobile ? '36px' : '48px',
        marginBottom: '8px',
      }}>
        {'\u2728'}
      </div>
      <h1 style={{
        color: epilogueColor,
        margin: '0 0 8px 0',
        fontSize: isMobile ? '24px' : '32px',
        textShadow: `0 0 30px ${epilogueColor}40`,
      }}>
        {epilogue ? epilogue.title.toUpperCase() : 'CAMPAIGN COMPLETE'}
      </h1>
      {epilogue ? (
        <div style={{ margin: '0 0 24px 0', maxWidth: '550px' }}>
          <p style={{ color: '#ccc', lineHeight: '1.7', fontSize: '14px', margin: '0 0 16px 0' }}>
            {epilogue.narrative}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {epilogue.actSummaries.map(s => (
              <span key={s.act} style={{
                padding: '4px 12px',
                backgroundColor: '#12121f',
                border: `1px solid ${actTierColors[s.tier] ?? '#888'}40`,
                borderRadius: '4px',
                fontSize: '11px',
                color: actTierColors[s.tier] ?? '#888',
                fontWeight: 'bold',
                letterSpacing: '1px',
              }}>
                Act {s.act}: {s.tier.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ color: '#aaa', margin: '0 0 32px 0', maxWidth: '500px', lineHeight: '1.5' }}>
          Your operatives have completed their mission. The galaxy shifts in the wake of their actions.
        </p>
      )}

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '12px',
        maxWidth: '600px',
        width: '100%',
        marginBottom: '24px',
      }}>
        {[
          { label: 'Missions', value: `${stats.missionsPlayed}`, color: '#4a9eff' },
          { label: 'Victories', value: `${stats.victories}`, color: '#44ff44' },
          { label: 'Defeats', value: `${stats.defeats}`, color: '#ff4444' },
          { label: 'Total XP', value: `${stats.totalXPEarned}`, color: '#bb99ff' },
          { label: 'Total Kills', value: `${stats.totalKills}`, color: '#ffaa00' },
          { label: 'Credits', value: `${stats.totalCredits}`, color: '#ffd700' },
          { label: 'Heroes', value: `${stats.heroCount}`, color: '#4a9eff' },
          { label: 'Avg XP/Mission', value: `${stats.averageMissionXP}`, color: '#88bbff' },
        ].map(stat => (
          <div key={stat.label} style={{
            backgroundColor: '#12121f',
            border: '1px solid #2a2a3f',
            borderRadius: '8px',
            padding: '12px',
          }}>
            <div style={{ color: stat.color, fontSize: '20px', fontWeight: 'bold' }}>{stat.value}</div>
            <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* MVP Hero */}
      {bestHero && bestHeroKills > 0 && (
        <div style={{
          backgroundColor: '#12121f',
          border: '1px solid #ffd70040',
          borderRadius: '8px',
          padding: '16px 24px',
          marginBottom: '24px',
          maxWidth: '400px',
          width: '100%',
        }}>
          <div style={{ color: '#ffd700', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>
            MOST VALUABLE OPERATIVE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
            <HeroPortrait portraitId={bestHero.portraitId} name={bestHero.name} size={40} accentColor="#ffd700" />
            <div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>{bestHero.name}</div>
              <div style={{ color: '#ffaa00', fontSize: '12px' }}>{bestHeroKills} kills</div>
            </div>
          </div>
        </div>
      )}

      {/* Hero roster final state */}
      <div style={{ maxWidth: '600px', width: '100%', marginBottom: '32px' }}>
        <h3 style={{ color: '#4a9eff', margin: '0 0 12px 0', fontSize: '14px' }}>Final Roster</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '8px',
        }}>
          {heroes.map(hero => (
            <div key={hero.id} style={{
              ...cardStyle,
              cursor: 'default',
              borderColor: hero.isWounded ? '#ffaa00' : '#2a4a2a',
              padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={24} accentColor="#4a9eff" />
                <span style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</span>
                <span style={{ color: '#888', fontSize: '11px', marginLeft: 'auto' }}>
                  {hero.xp.total} XP earned
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
        <button
          style={{
            ...buttonStyle,
            backgroundColor: '#1a2a3a',
            color: '#88bbff',
          }}
          onClick={onExport}
        >
          EXPORT CAMPAIGN
        </button>
        <button
          style={{
            ...buttonStyle,
            backgroundColor: '#4a9eff',
            color: '#fff',
          }}
          onClick={onNewCampaign}
        >
          NEW CAMPAIGN
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// EXIT CONFIRMATION DIALOG
// ============================================================================

function ExitConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        backgroundColor: '#12121f',
        border: '1px solid #3a2a2a',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center',
      }}>
        <h2 style={{ color: '#ff6644', margin: '0 0 12px 0', fontSize: '18px' }}>
          Exit Campaign?
        </h2>
        <p style={{ color: '#aaa', margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.5' }}>
          Unsaved progress will be lost. Make sure to save your campaign before exiting.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            style={{
              ...buttonStyle,
              flex: 1,
              backgroundColor: '#2a2a3f',
              color: '#c0c0c0',
            }}
            onClick={onCancel}
          >
            CANCEL
          </button>
          <button
            style={{
              ...buttonStyle,
              flex: 1,
              backgroundColor: '#3a2a2a',
              color: '#ff6644',
            }}
            onClick={onConfirm}
          >
            EXIT
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MissionSelect() {
  const {
    campaignState,
    campaignMissions,
    gameData,
    showMissionBriefingScreen,
    saveCampaignToStorage,
    saveCampaignToSlot,
    activeSaveSlot,
    loadImportedCampaign,
    exitCampaign,
    openSocialPhase,
    openHeroProgression,
    openPortraitManager,
    openSectorMap,
    openCampaignStats,
    openCampaignJournal,
    openCampaignOverworld,
    travelToSector,
    treatCriticalInjury,
    criticalInjuryDefs,
    openStrategicCommand,
  } = useGameStore()

  const { isMobile } = useIsMobile()
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [saveFlash, setSaveFlash] = useState(false)
  const [exportFlash, setExportFlash] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showSaveSlotPicker, setShowSaveSlotPicker] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Auto-select first available mission
  useEffect(() => {
    if (
      selectedMissionId === null &&
      campaignState &&
      campaignMissions &&
      campaignState.availableMissionIds.length > 0
    ) {
      const firstId = campaignState.availableMissionIds[0]
      if (campaignMissions[firstId]) {
        setSelectedMissionId(firstId)
      }
    }
  }, [campaignState, campaignMissions, selectedMissionId])

  if (!campaignState || !campaignMissions) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ color: '#ff4444' }}>No campaign loaded.</div>
        </div>
      </div>
    )
  }

  const availableMissions = campaignState.availableMissionIds
    .map(id => campaignMissions[id])
    .filter(Boolean)

  const networkUnlockedIds = new Set(
    campaignState.supplyNetwork
      ? getNetworkUnlockedMissions(campaignState.supplyNetwork, sectorMapData as SectorMapDefinition)
      : [],
  )

  // Build set of all missions that require network connections to launch
  const sectorMap = sectorMapData as SectorMapDefinition
  const networkGatedMissionIds = new Set(
    sectorMap.locations.flatMap(loc => loc.unlocksMissions ?? [])
  )

  const selectedMission = selectedMissionId ? campaignMissions[selectedMissionId] : null

  // A mission is locked if it's network-gated but not yet unlocked by the player's network
  const isSelectedMissionLocked = selectedMissionId
    ? networkGatedMissionIds.has(selectedMissionId) && !networkUnlockedIds.has(selectedMissionId)
    : false

  const handleLaunchMission = () => {
    if (!selectedMissionId || isSelectedMissionLocked) return
    showMissionBriefingScreen(selectedMissionId)
  }

  const handleSave = () => {
    saveCampaignToStorage()
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 2000)
  }

  const handleExport = useCallback(async () => {
    if (!campaignState) return
    try {
      await downloadCampaignBundle(campaignState)
      setExportFlash(true)
      setTimeout(() => setExportFlash(false), 2000)
    } catch (e) {
      console.error('Export failed:', e)
      setImportStatus('Export failed')
      setTimeout(() => setImportStatus(null), 3000)
    }
  }, [campaignState])

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setImportStatus('Importing...')
      const result = await importCampaignFromFile(file)

      // Load the imported campaign into the game store
      loadImportedCampaign(result.campaign)

      // Re-hydrate portrait store to pick up imported portraits
      await usePortraitStore.getState().hydrate()

      const parts: string[] = [`Imported!`]
      if (result.portraitsImported > 0) parts.push(`${result.portraitsImported} portraits`)
      if (result.portraitsSkipped > 0) parts.push(`${result.portraitsSkipped} skipped`)
      setImportStatus(parts.join(' \u2022 '))
      setTimeout(() => setImportStatus(null), 4000)
    } catch (err) {
      console.error('Import failed:', err)
      setImportStatus('Import failed -- invalid file')
      setTimeout(() => setImportStatus(null), 4000)
    }

    // Reset file input so same file can be re-imported
    e.target.value = ''
  }, [loadImportedCampaign])

  // Count healthy heroes for warning
  const heroes = Object.values(campaignState.heroes) as HeroCharacter[]
  const healthyHeroCount = heroes.filter(h => !h.isWounded).length

  // Derive subtitle from act info
  const currentAct = campaignState.currentAct
  const subtitle = `Act ${currentAct} \u2014 ${campaignState.difficulty.charAt(0).toUpperCase() + campaignState.difficulty.slice(1)} Difficulty`

  // Responsive style overrides for mobile
  const headerResponsive: React.CSSProperties = {
    ...headerStyle,
    padding: isMobile ? '12px 16px' : headerStyle.padding,
    flexWrap: isMobile ? 'wrap' : undefined,
    gap: isMobile ? '8px' : undefined,
  }

  const mainResponsive: React.CSSProperties = isMobile
    ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : mainStyle

  const sidebarResponsive: React.CSSProperties = isMobile
    ? { padding: '12px', borderBottom: '1px solid #2a2a3f', maxHeight: '200px', overflowY: 'auto' }
    : sidebarStyle

  const contentResponsive: React.CSSProperties = isMobile
    ? { flex: 1, padding: '16px', overflowY: 'auto' }
    : contentStyle

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerResponsive}>
        <div style={isMobile ? { width: '100%' } : undefined}>
          <h1 style={{ color: '#4a9eff', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>{campaignState.name}</h1>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
            {subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: isMobile ? 'wrap' : undefined, width: isMobile ? '100%' : undefined }}>
          <button
            style={{ ...buttonStyle, backgroundColor: '#3a2a1a', color: '#ffd700', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openSocialPhase}
          >
            VISIT CANTINA
          </button>
          <button
            style={{ ...buttonStyle, backgroundColor: '#2a1a1a', color: '#cc8800', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openStrategicCommand}
          >
            COMMAND
          </button>
          <button
            style={{ ...buttonStyle, backgroundColor: '#2a2a3a', color: '#bb99ff', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openHeroProgression}
          >
            UPGRADE HEROES
          </button>
          <button
            style={{ ...buttonStyle, backgroundColor: '#2a2a3a', color: '#bb99ff', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openPortraitManager}
          >
            PORTRAITS
          </button>
          {campaignState.overworld && (
            <button
              style={{ ...buttonStyle, backgroundColor: '#2a1a3a', color: '#bb66ff', flex: isMobile ? '1 1 auto' : undefined }}
              onClick={openCampaignOverworld}
            >
              OVERWORLD
            </button>
          )}
          <button
            style={{ ...buttonStyle, backgroundColor: '#1a2a2a', color: '#44ddaa', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openSectorMap}
          >
            SECTOR MAP
          </button>
          <button
            style={{ ...buttonStyle, backgroundColor: '#1a2a3a', color: '#cc8800', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openCampaignJournal}
          >
            JOURNAL
          </button>
          <button
            style={{ ...buttonStyle, backgroundColor: '#1a2a3a', color: '#4a9eff', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={openCampaignStats}
          >
            STATS
          </button>
          <div style={{ position: 'relative', flex: isMobile ? '1 1 auto' : undefined, display: 'flex', gap: '2px' }}>
            <button
              style={{
                ...buttonStyle,
                backgroundColor: saveFlash ? '#44ff44' : '#2a4a2a',
                color: saveFlash ? '#000' : '#44ff44',
                transition: 'all 0.3s',
                flex: 1,
                borderTopRightRadius: '0',
                borderBottomRightRadius: '0',
              }}
              onClick={handleSave}
            >
              {saveFlash ? '\u2714 SAVED!' : activeSaveSlot != null ? `SAVE (SLOT ${activeSaveSlot})` : 'SAVE'}
            </button>
            <button
              style={{
                ...buttonStyle,
                backgroundColor: '#2a4a2a',
                color: '#44ff44',
                borderTopLeftRadius: '0',
                borderBottomLeftRadius: '0',
                padding: '10px 8px',
                fontSize: '10px',
              }}
              onClick={() => setShowSaveSlotPicker(!showSaveSlotPicker)}
            >
              {'\u25BC'}
            </button>
            {showSaveSlotPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                backgroundColor: '#131320',
                border: '1px solid #333355',
                borderRadius: '6px',
                padding: '6px',
                zIndex: 100,
                minWidth: '180px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}>
                {Array.from({ length: MAX_SLOTS }, (_, i) => i).map(slotId => {
                  const existing = listSaveSlots().find(s => s.slotId === slotId)
                  return (
                    <button
                      key={slotId}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '8px 10px',
                        backgroundColor: activeSaveSlot === slotId ? '#1a2a1a' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#ccc',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '11px',
                      }}
                      onClick={() => {
                        saveCampaignToSlot(slotId)
                        setShowSaveSlotPicker(false)
                        setSaveFlash(true)
                        setTimeout(() => setSaveFlash(false), 2000)
                      }}
                    >
                      <span style={{ color: '#44ff44', fontWeight: 'bold' }}>
                        {slotId === 0 ? 'Auto' : `Slot ${slotId}`}
                      </span>
                      {existing && (
                        <span style={{ color: '#666', marginLeft: '8px' }}>
                          {existing.campaignName} (Act {existing.currentAct})
                        </span>
                      )}
                      {!existing && (
                        <span style={{ color: '#555', marginLeft: '8px' }}>Empty</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: exportFlash ? '#44ff44' : '#1a2a3a',
              color: exportFlash ? '#000' : '#88bbff',
              transition: 'all 0.3s',
              fontSize: '12px',
              padding: '10px 14px',
              flex: isMobile ? '1 1 auto' : undefined,
            }}
            onClick={handleExport}
          >
            {exportFlash ? '\u2714 EXPORTED' : 'EXPORT'}
          </button>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: '#1a2a3a',
              color: '#88bbff',
              fontSize: '12px',
              padding: '10px 14px',
              flex: isMobile ? '1 1 auto' : undefined,
            }}
            onClick={handleImportClick}
          >
            IMPORT
          </button>
          {/* Hidden file input for import */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            style={{ ...buttonStyle, backgroundColor: '#3a2a2a', color: '#ff6644', flex: isMobile ? '1 1 auto' : undefined }}
            onClick={() => setShowExitConfirm(true)}
          >
            EXIT
          </button>
        </div>
      </div>

      {/* Import status toast */}
      {importStatus && (
        <div style={{
          padding: '6px 16px',
          backgroundColor: importStatus.startsWith('Import failed') ? '#3a1a1a' : '#1a2a1a',
          color: importStatus.startsWith('Import failed') ? '#ff6644' : '#44ff44',
          fontSize: '12px',
          textAlign: 'center',
          borderBottom: '1px solid #2a2a3f',
        }}>
          {importStatus}
        </div>
      )}

      <div style={mainResponsive}>
        {/* Left sidebar: hero roster + stats + history */}
        <div style={sidebarResponsive}>
          <CampaignStatsPanel campaign={campaignState} />

          {campaignState.supplyNetwork && campaignState.supplyNetwork.nodes.length > 0 && (
            <NetworkStatsWidget campaign={campaignState} />
          )}
          {campaignState.actProgress && (
            <RebellionStatusPanel actProgress={campaignState.actProgress} />
          )}

          {campaignState.factionReputation && Object.keys(campaignState.factionReputation).length > 0 && (
            <FactionReputationPanel reputation={campaignState.factionReputation} />
          )}

          <MomentumIndicator campaign={campaignState} />

          <SectorControlDisplay
            campaign={campaignState}
            onTravelToSector={travelToSector}
          />

          <CriticalInjuryPanel
            heroes={heroes}
            injuryDefs={criticalInjuryDefs}
            compact
            onTreatInjury={treatCriticalInjury}
            credits={campaignState.credits}
          />

          <InventoryPanel campaign={campaignState} />

          <MissionHistoryPanel
            missions={campaignState.completedMissions}
            missionDefs={campaignMissions}
          />

          <h3 style={{ color: '#4a9eff', margin: '16px 0 8px 0', fontSize: '14px' }}>
            Hero Roster ({healthyHeroCount}/{heroes.length} healthy)
          </h3>
          {heroes.map(hero => (
            <HeroCard key={hero.id} hero={hero} />
          ))}
        </div>

        {/* Main content: mission selection */}
        <div style={contentResponsive}>
          <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>
            Available Missions
          </h2>

          {availableMissions.length === 0 ? (
            <CampaignVictory
              campaign={campaignState}
              onNewCampaign={exitCampaign}
              onExport={handleExport}
            />
          ) : (
            <div style={{ display: 'flex', gap: isMobile ? '16px' : '24px', flexDirection: isMobile ? 'column' : 'row' }}>
              {/* Mission list */}
              <div style={{ flex: isMobile ? undefined : 1 }}>
                {availableMissions.map(mission => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    isSelected={selectedMissionId === mission.id}
                    onClick={() => setSelectedMissionId(mission.id)}
                    isNetworkUnlocked={networkUnlockedIds.has(mission.id)}
                    isNetworkLocked={networkGatedMissionIds.has(mission.id) && !networkUnlockedIds.has(mission.id)}
                  />
                ))}
              </div>

              {/* Mission detail panel */}
              <div style={{ flex: 1 }}>
                {selectedMission ? (
                  <div style={{ ...cardStyle, cursor: 'default', borderColor: '#4a9eff' }}>
                    <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>{selectedMission.name}</h3>
                    <div style={{
                      color: difficultyColors[selectedMission.difficulty],
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '12px',
                    }}>
                      {selectedMission.difficulty.toUpperCase()} \u2022 Round Limit: {selectedMission.roundLimit}
                    </div>

                    <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.5', margin: '0 0 12px 0' }}>
                      {selectedMission.narrativeIntro}
                    </p>

                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                      <strong style={{ color: '#aaa' }}>Objectives:</strong>
                    </div>
                    {selectedMission.objectives.map(obj => {
                      const isPrimary = obj.priority === 'primary'
                      return (
                        <div key={obj.id} style={{
                          fontSize: '12px',
                          padding: '6px 8px',
                          marginBottom: '4px',
                          backgroundColor: '#0a0a1a',
                          borderRadius: '4px',
                          borderLeft: `3px solid ${isPrimary ? '#ffd700' : '#555'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          <span style={{
                            color: isPrimary ? '#ffd700' : '#666',
                            fontSize: '14px',
                          }}>
                            {isPrimary ? '\u2605' : '\u2022'}
                          </span>
                          <span style={{ color: isPrimary ? '#ddd' : '#999', flex: 1 }}>
                            {obj.description}
                          </span>
                          {obj.xpReward > 0 && (
                            <span style={{ color: '#44ff44', fontSize: '11px', whiteSpace: 'nowrap' }}>
                              +{obj.xpReward} XP
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {/* Enemy composition intel */}
                    {selectedMission.initialEnemies.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>
                          <strong style={{ color: '#ff6b6b' }}>Enemy Intel:</strong>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {selectedMission.initialEnemies.map((group, idx) => {
                            const profile = gameData?.npcProfiles?.[group.npcProfileId]
                            const name = profile?.name ?? group.npcProfileId
                            const tier = profile?.tier
                            const tierColor = tier === 'Nemesis' ? '#ff4444'
                              : tier === 'Rival' ? '#ffaa00'
                              : tier === 'Elite' ? '#cc77ff'
                              : '#888'
                            return (
                              <span key={idx} style={{
                                padding: '3px 8px',
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
                        {selectedMission.reinforcements.length > 0 && (
                          <div style={{
                            fontSize: '10px',
                            color: '#f97316',
                            marginTop: '4px',
                            fontStyle: 'italic',
                          }}>
                            + {selectedMission.reinforcements.length} reinforcement wave{selectedMission.reinforcements.length > 1 ? 's' : ''} (threat-based)
                          </div>
                        )}
                      </div>
                    )}

                    {/* Loot preview */}
                    {selectedMission.lootTokens.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>
                          <strong style={{ color: '#ffd700' }}>Loot Available:</strong>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {selectedMission.lootTokens.map((loot, idx) => {
                            const r = loot.reward
                            const label = r.type === 'xp' ? `${r.value} XP`
                              : r.type === 'credits' ? `${r.value} Cr`
                              : r.type === 'equipment' ? r.itemId.replace(/-/g, ' ')
                              : r.type === 'narrative' ? r.description
                              : '???'
                            const color = r.type === 'xp' ? '#44ff44'
                              : r.type === 'credits' ? '#ffd700'
                              : r.type === 'equipment' ? '#ff6644'
                              : '#cc77ff'
                            return (
                              <span key={idx} style={{
                                padding: '2px 7px',
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

                    <div style={{ marginTop: '16px', fontSize: '12px', color: '#888' }}>
                      <div style={{ marginBottom: '4px' }}>
                        Recommended heroes: {selectedMission.recommendedHeroCount}
                        {healthyHeroCount < selectedMission.recommendedHeroCount && (
                          <span style={{
                            color: '#ffaa00',
                            marginLeft: '8px',
                            fontWeight: 'bold',
                          }}>
                            {'\u26A0'} Only {healthyHeroCount} healthy
                          </span>
                        )}
                      </div>
                      <div>
                        Map: {selectedMission.boardsWide}x{selectedMission.boardsTall} boards {'\u2022'}
                        Threat: {selectedMission.imperialThreat} {'\u2022'}
                        Base XP: {selectedMission.baseXP}
                      </div>
                    </div>

                    {/* Companion deployment info */}
                    {campaignState.companions && campaignState.companions.length > 0 && (
                      <div style={{ marginTop: '12px', fontSize: '12px' }}>
                        <strong style={{ color: '#44ff44' }}>Companions deploying:</strong>
                        <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {campaignState.companions.map(id => (
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

                    {/* Exposure warning for act finales */}
                    {selectedMission.missionIndex === 4 && campaignState.actProgress && (() => {
                      const status = getExposureStatus(campaignState.actProgress.exposure);
                      if (status === 'ghost') return null;
                      const mods = getFinaleExposureModifiers(campaignState.actProgress.exposure);
                      const color = status === 'hunted' ? '#ff4444' : '#ffaa00';
                      const icon = status === 'hunted' ? '\u26A0' : '\u26A0';
                      const label = status === 'hunted' ? 'HUNTED' : 'DETECTED';
                      return (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px 12px',
                          backgroundColor: `${color}10`,
                          border: `1px solid ${color}40`,
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}>
                          <div style={{ color, fontWeight: 'bold', marginBottom: '6px' }}>
                            {icon} Imperial Alert: {label}
                          </div>
                          <div style={{ color: '#aaa', lineHeight: '1.5' }}>
                            {status === 'hunted'
                              ? 'The Empire has prepared an ambush. Expect heavy resistance.'
                              : 'Imperial garrison is on alert. Increased patrols expected.'}
                          </div>
                          <div style={{ marginTop: '6px', display: 'flex', gap: '12px', color: '#999', fontSize: '11px' }}>
                            {mods.threatBonus > 0 && <span style={{ color }}>+{mods.threatBonus} Threat</span>}
                            {mods.roundLimitModifier < 0 && <span style={{ color }}>{mods.roundLimitModifier} Round Limit</span>}
                            {mods.extraReinforcements > 0 && <span style={{ color }}>+{mods.extraReinforcements} Extra Wave{mods.extraReinforcements > 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      style={{
                        ...buttonStyle,
                        backgroundColor: isSelectedMissionLocked ? '#333' : '#4a9eff',
                        color: isSelectedMissionLocked ? '#666' : '#fff',
                        cursor: isSelectedMissionLocked ? 'not-allowed' : 'pointer',
                        width: '100%',
                        marginTop: '16px',
                        fontSize: '16px',
                        padding: '12px',
                      }}
                      onClick={handleLaunchMission}
                      disabled={isSelectedMissionLocked}
                    >
                      {isSelectedMissionLocked ? 'REQUIRES NETWORK CONNECTION' : 'LAUNCH MISSION'}
                    </button>
                  </div>
                ) : (
                  <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
                    Select a mission to see details
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Exit confirmation modal */}
      {showExitConfirm && (
        <ExitConfirmDialog
          onConfirm={exitCampaign}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  )
}

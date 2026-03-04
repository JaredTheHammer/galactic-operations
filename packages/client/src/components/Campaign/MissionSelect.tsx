/**
 * MissionSelect - Campaign mission selection screen.
 * Shows available missions, campaign stats, hero roster with wound status,
 * completed mission history, and XP spending.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { useGameStore } from '../../store/game-store'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { MissionDefinition, CampaignState, HeroCharacter, MissionResult } from '../../../../engine/src/types'
import { HeroPortrait } from '../Portrait/HeroPortrait'
import { downloadCampaignBundle, importCampaignFromFile } from '../../services/campaign-export'
import { usePortraitStore } from '../../store/portrait-store'

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
}: {
  mission: MissionDefinition
  isSelected: boolean
  onClick: () => void
}) {
  const diffColor = difficultyColors[mission.difficulty] ?? '#888'
  return (
    <div
      style={isSelected ? selectedCardStyle : cardStyle}
      onClick={onClick}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget.style.borderColor = '#3a3a5f') }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget.style.borderColor = '#2a2a3f') }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{mission.name}</span>
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
// MAIN COMPONENT
// ============================================================================

export default function MissionSelect() {
  const {
    campaignState,
    campaignMissions,
    startCampaignMission,
    saveCampaignToStorage,
    loadImportedCampaign,
    exitCampaign,
    openSocialPhase,
    openHeroProgression,
    openPortraitManager,
    openCampaignStats,
    openCampaignJournal,
  } = useGameStore()

  const { isMobile } = useIsMobile()
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [saveFlash, setSaveFlash] = useState(false)
  const [exportFlash, setExportFlash] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
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

  const selectedMission = selectedMissionId ? campaignMissions[selectedMissionId] : null

  const handleLaunchMission = () => {
    if (!selectedMissionId) return
    startCampaignMission(selectedMissionId)
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
          <button
            style={{
              ...buttonStyle,
              backgroundColor: saveFlash ? '#44ff44' : '#2a4a2a',
              color: saveFlash ? '#000' : '#44ff44',
              transition: 'all 0.3s',
              flex: isMobile ? '1 1 auto' : undefined,
            }}
            onClick={handleSave}
          >
            {saveFlash ? '\u2714 SAVED!' : 'SAVE CAMPAIGN'}
          </button>
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
            onClick={exitCampaign}
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
            <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
              Campaign complete! All missions finished.
            </div>
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
                        Map: {selectedMission.boardsWide}x{selectedMission.boardsTall} boards \u2022
                        Threat: {selectedMission.imperialThreat}
                      </div>
                    </div>

                    <button
                      style={{
                        ...buttonStyle,
                        backgroundColor: '#4a9eff',
                        color: '#fff',
                        width: '100%',
                        marginTop: '16px',
                        fontSize: '16px',
                        padding: '12px',
                      }}
                      onClick={handleLaunchMission}
                    >
                      LAUNCH MISSION
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
    </div>
  )
}

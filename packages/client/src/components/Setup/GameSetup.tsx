import React, { useState, useEffect, useCallback } from 'react'
import { useGameStore } from '../../store/game-store'
import { useTutorialStore } from '../../store/tutorial-store'
import type { Player, MapConfig, MapSizePreset, CampaignDifficulty, MissionDefinition } from '@engine/types.js'
import { MAP_PRESETS, BOARD_SIZE } from '@engine/types.js'
import { t, mixins } from '../../styles/theme'
import { useIsMobile } from '../../hooks/useIsMobile'
import { listSaveSlots, migrateLegacySave, type SaveSlotMeta } from '../../services/save-slots'

// Import mission data for the skirmish mission picker
import mission1Data from '@data/missions/act1-mission1-arrival.json'
import mission2Data from '@data/missions/act1-mission2-intel.json'
import mission3aData from '@data/missions/act1-mission3a-cache.json'
import mission3bData from '@data/missions/act1-mission3b-ambush.json'
import mission4Data from '@data/missions/act1-mission4-finale.json'

const ALL_MISSIONS: MissionDefinition[] = [
  mission1Data,
  mission2Data,
  mission3aData,
  mission3bData,
  mission4Data,
] as unknown as MissionDefinition[]

type PlayPath = 'campaign' | 'skirmish'

export const GameSetup: React.FC = () => {
  const [imperialName, setImperialName] = useState('Empire Commander')
  const [operativeName, setOperativeName] = useState('Rebel Agent')
  const [gameMode, setGameMode] = useState<'Solo' | 'HotSeat' | 'AIBattle'>('Solo')
  const [mapPreset, setMapPreset] = useState<MapSizePreset>('skirmish')
  const [customWide, setCustomWide] = useState(3)
  const [customTall, setCustomTall] = useState(3)
  const [showCampaignDifficulty, setShowCampaignDifficulty] = useState(false)
  const [playPath, setPlayPath] = useState<PlayPath>('skirmish')
  const [selectedMissionId, setSelectedMissionId] = useState<string>(ALL_MISSIONS[0]?.id ?? '')

  const [showSaveSlots, setShowSaveSlots] = useState(false)
  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { isMobile } = useIsMobile()
  const { initGame, startHeroCreation, startCampaign, loadCampaignFromStorage, loadCampaignFromSlot, deleteSaveSlot, openCombatArena, openMapEditor } = useGameStore()

  // When AI Battle is selected, force skirmish path
  useEffect(() => {
    if (gameMode === 'AIBattle') {
      setPlayPath('skirmish')
    }
  }, [gameMode])

  // Sync map preset when a mission is selected
  useEffect(() => {
    const mission = ALL_MISSIONS.find(m => m.id === selectedMissionId)
    if (mission) {
      setMapPreset(mission.mapPreset as MapSizePreset)
      if (mission.mapPreset === 'custom') {
        setCustomWide(mission.boardsWide)
        setCustomTall(mission.boardsTall)
      }
    }
  }, [selectedMissionId])

  const getMapConfig = (): MapConfig => {
    if (mapPreset === 'custom') {
      return { preset: 'custom', boardsWide: customWide, boardsTall: customTall }
    }
    return MAP_PRESETS[mapPreset]
  }

  const currentConfig = getMapConfig()
  const cellsWide = currentConfig.boardsWide * BOARD_SIZE
  const cellsTall = currentConfig.boardsTall * BOARD_SIZE

  const buildPlayers = (): Player[] => [
    {
      id: 0,
      name: gameMode === 'AIBattle' ? 'Imperial AI' : imperialName,
      role: 'Imperial',
      isLocal: true,
      isAI: gameMode === 'Solo' || gameMode === 'AIBattle',
    },
    {
      id: 1,
      name: gameMode === 'AIBattle' ? 'Operative AI' : operativeName,
      role: 'Operative',
      isLocal: true,
      isAI: gameMode === 'AIBattle',
    },
  ]

  const handleStartGame = () => {
    initGame(buildPlayers(), getMapConfig())
  }

  const handleCreateHeroes = () => {
    startHeroCreation(buildPlayers(), getMapConfig())
  }

  const handleStartTutorial = useCallback(() => {
    // Start a quick skirmish game with default units, then activate the tutorial
    const players: Player[] = [
      { id: 0, name: 'Empire', side: 'imperial', isAI: true },
      { id: 1, name: 'You', side: 'operative', isAI: false },
    ]
    const tutorialMap: MapConfig = { preset: 'skirmish', boardsWide: 3, boardsTall: 3 }
    initGame(players, tutorialMap)
    useTutorialStore.getState().startTutorial()
  }, [initGame])

  // Mini board preview
  const previewWidth = 160
  const previewCellSize = Math.min(
    previewWidth / currentConfig.boardsWide,
    80 / currentConfig.boardsTall
  )
  const previewW = currentConfig.boardsWide * previewCellSize
  const previewH = currentConfig.boardsTall * previewCellSize

  const selectedMission = ALL_MISSIONS.find(m => m.id === selectedMissionId)

  // ─── Render ──────────────────────────────────────────────────────────

  const renderGameModeSelector = () => (
    <div style={{ marginBottom: '20px', textAlign: 'left' }}>
      <label style={mixins.label}>Game Mode</label>
      <div style={{ display: 'flex', gap: t.spaceSm, flexWrap: 'wrap' }}>
        <button style={mixins.chip(gameMode === 'Solo')} onClick={() => setGameMode('Solo')}>
          Solo (AI vs Player)
        </button>
        <button style={mixins.chip(gameMode === 'HotSeat')} onClick={() => setGameMode('HotSeat')}>
          Hot-Seat (2 Players)
        </button>
        <button style={mixins.chip(gameMode === 'AIBattle')} onClick={() => setGameMode('AIBattle')}>
          AI vs AI (Watch)
        </button>
      </div>
      <div style={mixins.helpText}>
        {gameMode === 'AIBattle'
          ? 'Watch two AI players battle it out automatically'
          : gameMode === 'Solo'
            ? 'Play as the Operatives against the Imperial AI'
            : 'Two players on the same screen'}
      </div>
      <button
        style={{
          width: '100%',
          marginTop: '12px',
          padding: '10px 16px',
          backgroundColor: 'transparent',
          border: `2px solid ${t.accentOrange}`,
          borderRadius: t.radiusMd,
          color: t.accentOrange,
          fontSize: t.textSm,
          fontWeight: 'bold',
          cursor: 'pointer',
          letterSpacing: '1px',
          transition: `all 300ms`,
        }}
        onClick={openCombatArena}
      >
        COMBAT ARENA -- Build & Watch Custom Battles
      </button>
    </div>
  )

  const renderPathTabs = () => (
    <div style={{ display: 'flex', gap: '0px', marginBottom: '-2px', position: 'relative', zIndex: 1 }}>
      <button
        style={mixins.tab(playPath === 'campaign', gameMode === 'AIBattle')}
        onClick={() => { if (gameMode !== 'AIBattle') setPlayPath('campaign') }}
        disabled={gameMode === 'AIBattle'}
      >
        Campaign
      </button>
      <button
        style={mixins.tab(playPath === 'skirmish', false)}
        onClick={() => setPlayPath('skirmish')}
      >
        Skirmish
      </button>
    </div>
  )

  const refreshSaveSlots = () => {
    migrateLegacySave()
    setSaveSlots(listSaveSlots())
  }

  const handleContinueCampaign = () => {
    refreshSaveSlots()
    const slots = listSaveSlots()
    if (slots.length === 0) {
      // Try legacy load as fallback
      const loaded = loadCampaignFromStorage()
      if (!loaded) alert('No saved campaign found.')
      return
    }
    if (slots.length === 1) {
      // Single save -- load directly
      loadCampaignFromSlot(slots[0].slotId)
      return
    }
    setShowSaveSlots(true)
  }

  const handleDeleteSlot = (slotId: number) => {
    deleteSaveSlot(slotId)
    setDeleteConfirm(null)
    refreshSaveSlots()
    if (saveSlots.length <= 1) setShowSaveSlots(false)
  }

  const formatSlotDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  const renderSaveSlotList = () => (
    <div>
      <div style={{ fontSize: t.textSm, color: t.textSecondary, marginBottom: '8px' }}>
        Select a save to continue:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
        {saveSlots.map(slot => (
          <div
            key={slot.slotId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              backgroundColor: '#131320',
              border: '1px solid #333355',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onClick={() => loadCampaignFromSlot(slot.slotId)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {slot.slotId === 0 && (
                  <span style={{ fontSize: '9px', color: '#44ff44', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    AUTO
                  </span>
                )}
                <span style={{ color: '#ffd966', fontWeight: 'bold', fontSize: '13px' }}>
                  {slot.campaignName}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                Act {slot.currentAct} | {slot.missionsPlayed} missions | {slot.heroNames.join(', ')} | {slot.credits} cr
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: '#666' }}>{formatSlotDate(slot.savedAt)}</div>
              <div style={{ fontSize: '10px', color: '#888', textTransform: 'capitalize' }}>{slot.difficulty}</div>
            </div>
            {deleteConfirm === slot.slotId ? (
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  style={{ ...mixins.buttonPrimary, padding: '4px 8px', fontSize: '10px', backgroundColor: '#ff4444', color: '#fff' }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteSlot(slot.slotId) }}
                >
                  YES
                </button>
                <button
                  style={{ ...mixins.buttonPrimary, padding: '4px 8px', fontSize: '10px', backgroundColor: '#333' }}
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                >
                  NO
                </button>
              </div>
            ) : (
              <button
                style={{
                  background: 'none',
                  border: '1px solid #333355',
                  color: '#666',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(slot.slotId) }}
              >
                DEL
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        style={{ ...mixins.buttonGhost, width: '100%', marginTop: '6px', fontSize: '11px' }}
        onClick={() => { setShowSaveSlots(false); setDeleteConfirm(null) }}
      >
        BACK
      </button>
    </div>
  )

  const renderCampaignPath = () => (
    <div style={mixins.tabContent}>
      {showSaveSlots ? (
        renderSaveSlotList()
      ) : !showCampaignDifficulty ? (
        <div>
          <div style={{ fontSize: t.textSm, color: t.textSecondary, marginBottom: '12px' }}>
            Liberation of the Tangrene Sector -- a 4-mission campaign with branching paths,
            persistent hero progression, and escalating Imperial threat.
          </div>
          <div style={{ display: 'flex', gap: t.spaceSm, flexDirection: isMobile ? 'column' : 'row' }}>
            <button
              style={{
                ...mixins.buttonPrimary,
                backgroundColor: t.accentOrange,
                flex: 1,
              }}
              onClick={() => setShowCampaignDifficulty(true)}
            >
              NEW CAMPAIGN
            </button>
            <button
              style={{
                ...mixins.buttonPrimary,
                backgroundColor: t.bgSurface2,
                color: t.accentOrange,
                border: `2px solid ${t.accentOrange}`,
                flex: 1,
              }}
              onClick={handleContinueCampaign}
            >
              CONTINUE CAMPAIGN
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: t.textSm, color: t.textSecondary, marginBottom: t.spaceSm }}>
            Liberation of the Tangrene Sector (4 missions)
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['standard', 'veteran', 'legendary'] as CampaignDifficulty[]).map(diff => (
              <button
                key={diff}
                style={{
                  ...mixins.buttonPrimary,
                  flex: 1,
                  backgroundColor: diff === 'standard' ? t.accentGreen : diff === 'veteran' ? '#ffaa00' : t.accentRed,
                  color: '#000',
                  fontSize: '11px',
                }}
                onClick={() => {
                  setShowCampaignDifficulty(false)
                  startCampaign(diff)
                }}
              >
                {diff.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            style={{
              ...mixins.buttonGhost,
              width: '100%',
              marginTop: '6px',
              fontSize: '11px',
            }}
            onClick={() => setShowCampaignDifficulty(false)}
          >
            BACK
          </button>
        </div>
      )}
    </div>
  )

  const renderSkirmishPath = () => (
    <div style={mixins.tabContent}>
      {/* Mission Selector */}
      <div style={{ marginBottom: t.spaceMd, textAlign: 'left' }}>
        <label style={mixins.label}>Mission</label>
        <select
          style={mixins.select}
          value={selectedMissionId}
          onChange={e => setSelectedMissionId(e.target.value)}
        >
          {ALL_MISSIONS.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.difficulty})
            </option>
          ))}
          <option value="__custom__">Custom Skirmish (Free Play)</option>
        </select>
        {selectedMission && selectedMissionId !== '__custom__' && (
          <div style={mixins.helpText}>
            {selectedMission.description}
          </div>
        )}
        {selectedMissionId === '__custom__' && (
          <div style={mixins.helpText}>
            Free-form battle with default army compositions. Configure your own battlefield size below.
          </div>
        )}
      </div>

      {/* Battlefield Size */}
      <div style={{ marginBottom: t.spaceMd, textAlign: 'left' }}>
        <label style={mixins.label}>Battlefield Size</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button style={mixins.chipGold(mapPreset === 'skirmish')} onClick={() => setMapPreset('skirmish')}>
            <div>Skirmish</div>
            <div style={{ fontSize: '9px', color: mapPreset === 'skirmish' ? '#333' : t.textDim, marginTop: '2px' }}>
              3' x 3' (9 boards)
            </div>
          </button>
          <button style={mixins.chipGold(mapPreset === 'epic')} onClick={() => setMapPreset('epic')}>
            <div>Epic</div>
            <div style={{ fontSize: '9px', color: mapPreset === 'epic' ? '#333' : t.textDim, marginTop: '2px' }}>
              6' x 3' (18 boards)
            </div>
          </button>
          <button style={mixins.chipGold(mapPreset === 'custom')} onClick={() => setMapPreset('custom')}>
            <div>Custom</div>
            <div style={{ fontSize: '9px', color: mapPreset === 'custom' ? '#333' : t.textDim, marginTop: '2px' }}>
              Set your own
            </div>
          </button>
        </div>

        {mapPreset === 'custom' && (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: t.spaceSm }}>
            <span style={{ fontSize: '11px', color: t.textMuted }}>Boards:</span>
            <input
              type="number" min={1} max={8} value={customWide}
              onChange={e => setCustomWide(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
              style={{
                width: '50px',
                padding: '4px 6px',
                backgroundColor: t.bgSurface2,
                border: `1px solid ${t.border}`,
                borderRadius: '3px',
                color: t.textPrimary,
                fontSize: t.textSm,
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: '11px', color: t.textDim }}>x</span>
            <input
              type="number" min={1} max={8} value={customTall}
              onChange={e => setCustomTall(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
              style={{
                width: '50px',
                padding: '4px 6px',
                backgroundColor: t.bgSurface2,
                border: `1px solid ${t.border}`,
                borderRadius: '3px',
                color: t.textPrimary,
                fontSize: t.textSm,
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: t.textXs, color: t.textDim }}>
              ({customWide}' x {customTall}')
            </span>
          </div>
        )}

        <div style={mixins.dimLabel}>
          <span>
            {cellsWide}" x {cellsTall}" ({currentConfig.boardsWide * currentConfig.boardsTall} boards)
          </span>
          <div style={{
            display: 'inline-flex',
            border: `1px solid ${t.border}`,
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <svg width={previewW} height={previewH} viewBox={`0 0 ${previewW} ${previewH}`}>
              <rect width={previewW} height={previewH} fill="#1a1a2e" />
              {Array.from({ length: currentConfig.boardsWide + 1 }, (_, i) => (
                <line
                  key={`v${i}`}
                  x1={i * previewCellSize} y1={0}
                  x2={i * previewCellSize} y2={previewH}
                  stroke="#333355" strokeWidth={i === 0 || i === currentConfig.boardsWide ? 0 : 1}
                />
              ))}
              {Array.from({ length: currentConfig.boardsTall + 1 }, (_, i) => (
                <line
                  key={`h${i}`}
                  x1={0} y1={i * previewCellSize}
                  x2={previewW} y2={i * previewCellSize}
                  stroke="#333355" strokeWidth={i === 0 || i === currentConfig.boardsTall ? 0 : 1}
                />
              ))}
              <rect x={0} y={0} width={previewCellSize * 0.6} height={previewH} fill="rgba(255,68,68,0.15)" />
              <rect x={previewW - previewCellSize * 0.6} y={0} width={previewCellSize * 0.6} height={previewH} fill="rgba(68,255,68,0.15)" />
            </svg>
          </div>
        </div>
      </div>

      {/* Player Names -- hidden for AI Battle */}
      {gameMode !== 'AIBattle' && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: t.spaceMd, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <label style={mixins.label}>Imperial Commander</label>
            <input
              type="text" value={imperialName}
              onChange={e => setImperialName(e.target.value)}
              style={mixins.input} placeholder="Your name..."
            />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <label style={mixins.label}>Operative Leader</label>
            <input
              type="text" value={operativeName}
              onChange={e => setOperativeName(e.target.value)}
              style={mixins.input} placeholder="Your name..."
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {gameMode === 'AIBattle' ? (
        <button
          style={{
            ...mixins.buttonPrimary,
            marginTop: t.spaceXs,
            padding: '16px',
            fontSize: t.textLg,
            backgroundColor: t.accentCyan,
            boxShadow: '0 0 20px rgba(0, 204, 102, 0.4)',
          }}
          onClick={handleStartGame}
        >
          START AI BATTLE
        </button>
      ) : (
        <div style={{ display: 'flex', gap: t.spaceSm, flexDirection: isMobile ? 'column' : 'row' }}>
          <button
            style={{
              ...mixins.buttonPrimary,
              backgroundColor: t.accentPurple,
              color: t.textPrimary,
              border: '2px solid #a78bfa',
              flex: 1,
              marginTop: t.spaceXs,
            }}
            onClick={handleCreateHeroes}
          >
            CREATE HEROES & DEPLOY
          </button>
          <button
            style={{
              ...mixins.buttonPrimary,
              flex: 1,
              marginTop: t.spaceXs,
            }}
            onClick={handleStartGame}
          >
            QUICK START (Default Units)
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div style={mixins.screenCenter}>
      <div style={{
        ...mixins.panel,
        maxWidth: isMobile ? '100%' : '600px',
        width: '100%',
        textAlign: 'center',
        ...(isMobile ? { padding: '20px 16px', borderRadius: t.radiusMd, margin: '0 8px' } : {}),
      }}>
        <div style={{
          fontSize: isMobile ? t.text2xl : t.text3xl,
          fontWeight: 'bold',
          color: t.accentGold,
          marginBottom: t.spaceXs,
          textShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
        }}>
          GALACTIC OPERATIONS
        </div>
        <div style={{ fontSize: t.textBase, color: t.textMuted, marginBottom: t.spaceLg }}>
          A Star Wars Tactical Campaign Game
        </div>

        {renderGameModeSelector()}
        {renderPathTabs()}
        {playPath === 'campaign' ? renderCampaignPath() : renderSkirmishPath()}

        {/* Tutorial & Map Editor buttons */}
        <div style={{ marginTop: '16px', borderTop: '1px solid #2a2a3f', paddingTop: '16px', display: 'flex', gap: t.spaceSm, flexDirection: isMobile ? 'column' : 'row' }}>
          <button
            style={{
              ...mixins.buttonPrimary,
              flex: 1,
              backgroundColor: '#1a2a3a',
              color: '#4a9eff',
              border: '1px solid #333355',
              fontSize: t.textSm,
            }}
            onClick={handleStartTutorial}
          >
            TUTORIAL
          </button>
          <button
            style={{
              ...mixins.buttonPrimary,
              flex: 1,
              backgroundColor: '#1a2a3a',
              color: '#ff9944',
              border: '1px solid #333355',
              fontSize: t.textSm,
            }}
            onClick={openMapEditor}
          >
            MAP EDITOR
          </button>
        </div>
      </div>
    </div>
  )
}

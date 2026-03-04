import React, { useState, useEffect } from 'react'
import { useGameStore } from '../../store/game-store'
import type { Player, MapConfig, MapSizePreset, CampaignDifficulty, MissionDefinition } from '@engine/types.js'
import { MAP_PRESETS, BOARD_SIZE } from '@engine/types.js'
import { t, mixins } from '../../styles/theme'
import { useIsMobile } from '../../hooks/useIsMobile'
import { SettingsModal } from './SettingsModal'

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

  const [showSettings, setShowSettings] = useState(false)

  const { isMobile } = useIsMobile()
  const { initGame, startHeroCreation, startCampaign, loadCampaignFromStorage, openCombatArena } = useGameStore()

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

  const renderCampaignPath = () => (
    <div style={mixins.tabContent}>
      {!showCampaignDifficulty ? (
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
              onClick={() => {
                const loaded = loadCampaignFromStorage()
                if (!loaded) {
                  alert('No saved campaign found.')
                }
              }}
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
        position: 'relative',
        ...(isMobile ? { padding: '20px 16px', borderRadius: t.radiusMd, margin: '0 8px' } : {}),
      }}>
        {/* Settings gear */}
        <button
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
            lineHeight: 1,
          }}
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

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
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

/**
 * AIBattle - Watch Mode Page
 *
 * Full-screen view for observing AI-vs-AI games.
 * Includes the tactical grid, speed controls, reasoning panel,
 * game statistics overlay, and battle log export buttons.
 */

import React, { useState, useCallback } from 'react'
import { useGameStore } from '../../store/game-store'
import { useAITurn, type AISpeed } from '../../hooks/useAITurn'
import { TacticalGrid } from '../../canvas/TacticalGrid'
import { TurnIndicator } from '../HUD/TurnIndicator'
import { MoraleTracker } from '../HUD/MoraleTracker'
import { ObjectiveProgress } from '../HUD/ObjectiveProgress'
import { ThreatTracker } from '../HUD/ThreatTracker'
import { NotificationCenter } from '../HUD/NotificationCenter'
import { CombatLog } from '../Combat/CombatLog'

// ============================================================================
// FILE DOWNLOAD HELPER
// ============================================================================

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AIBattle: React.FC = () => {
  const { gameState, combatLog } = useGameStore()
  const {
    aiState,
    isPaused,
    speed,
    togglePause,
    setSpeed,
    profiles,
    battleLog,
    getBattleLogJSON,
    getBattleLogSummary,
  } = useAITurn()

  const [showReasoningPanel, setShowReasoningPanel] = useState(true)
  const [showStats, setShowStats] = useState(false)

  const handleExportJSON = useCallback(() => {
    const json = getBattleLogJSON()
    if (json) {
      downloadFile(json, `battle-log-${getTimestamp()}.json`, 'application/json')
    }
  }, [getBattleLogJSON])

  const handleExportSummary = useCallback(() => {
    const summary = getBattleLogSummary()
    if (summary) {
      downloadFile(summary, `battle-summary-${getTimestamp()}.txt`, 'text/plain')
    }
  }, [getBattleLogSummary])

  const handleCopyJSON = useCallback(() => {
    const json = getBattleLogJSON()
    if (json) {
      navigator.clipboard.writeText(json).catch(() => {
        // Fallback: download instead
        downloadFile(json, `battle-log-${getTimestamp()}.json`, 'application/json')
      })
    }
  }, [getBattleLogJSON])

  if (!gameState) return null

  const isGameOver = gameState.turnPhase === 'GameOver'
  const hasLog = battleLog !== null

  return (
    <div style={containerStyle}>
      {/* Tactical Grid (main canvas) */}
      <div style={canvasContainerStyle}>
        <TacticalGrid gameState={gameState} />
      </div>

      {/* Top bar: Turn Indicator + Morale */}
      <TurnIndicator gameState={gameState} hideControls />
      <MoraleTracker gameState={gameState} />
      <ObjectiveProgress gameState={gameState} />
      <ThreatTracker gameState={gameState} />
      <NotificationCenter />

      {/* AI Control Bar (bottom left) */}
      <div style={controlBarStyle}>
        <div style={controlBarTitleStyle}>AI BATTLE MODE</div>
        <div style={controlRowStyle}>
          {/* Pause/Play */}
          <button
            style={controlBtnStyle(isPaused)}
            onClick={togglePause}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? '▶ PLAY' : '⏸ PAUSE'}
          </button>

          {/* Speed controls */}
          {(['slow', 'normal', 'fast', 'instant'] as AISpeed[]).map(s => (
            <button
              key={s}
              style={speedBtnStyle(speed === s)}
              onClick={() => setSpeed(s)}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Toggle buttons */}
        <div style={{ ...controlRowStyle, marginTop: '6px' }}>
          <button
            style={toggleBtnStyle(showReasoningPanel)}
            onClick={() => setShowReasoningPanel(p => !p)}
          >
            {showReasoningPanel ? 'HIDE' : 'SHOW'} AI REASONING
          </button>
          <button
            style={toggleBtnStyle(showStats)}
            onClick={() => setShowStats(p => !p)}
          >
            {showStats ? 'HIDE' : 'SHOW'} STATS
          </button>
        </div>

        {/* AI State Indicator */}
        <div style={stateIndicatorStyle}>
          <span style={stateDotStyle(aiState.phase)} />
          {aiState.phase === 'thinking' && `${aiState.archetypeName} thinking...`}
          {aiState.phase === 'executing' && `Executing actions...`}
          {aiState.phase === 'phase-advance' && `Advancing phase...`}
          {aiState.phase === 'idle' && (isGameOver ? 'Game Over' : 'Waiting...')}
        </div>
      </div>

      {/* AI Reasoning Panel (right side) */}
      {showReasoningPanel && (
        <div style={reasoningPanelStyle}>
          <div style={reasoningTitleStyle}>AI REASONING</div>

          {/* Current decision */}
          {aiState.activeFigure && (
            <div style={currentDecisionStyle}>
              <div style={figureNameStyle}>
                {aiState.activeFigure.entityId.replace(/-/g, ' ').toUpperCase()}
                <span style={archetypeTagStyle}>{aiState.archetypeName}</span>
              </div>
              <div style={reasoningTextStyle}>{aiState.reasoning}</div>
              {aiState.decision?.matchedRule && (
                <div style={ruleStyle}>
                  Rule #{aiState.decision.matchedRule.rank}: {aiState.decision.matchedRule.cardText}
                </div>
              )}
            </div>
          )}

          {/* Decision log */}
          <div style={decisionLogStyle}>
            {aiState.decisionLog.slice(0, 15).map((entry, i) => (
              <div key={`${entry.figureId}-${entry.timestamp}`} style={logEntryStyle(i === 0)}>
                <div style={logFigureStyle}>
                  {entry.entityId.replace(/-/g, ' ')}
                </div>
                <div style={logReasoningStyle}>{entry.reasoning}</div>
                <div style={logActionsStyle}>
                  {entry.actions.map((a, j) => (
                    <span key={j} style={logActionTagStyle}>{a}</span>
                  ))}
                </div>
              </div>
            ))}
            {aiState.decisionLog.length === 0 && (
              <div style={{ color: '#666', fontStyle: 'italic', fontSize: '11px' }}>
                No decisions yet. Game is starting...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Panel (left sidebar, toggled) */}
      {showStats && <StatsPanel gameState={gameState} />}

      {/* Combat Log (bottom right) */}
      <CombatLog messages={combatLog} />

      {/* Game Over Overlay */}
      {isGameOver && (
        <GameOverOverlay
          gameState={gameState}
          hasLog={hasLog}
          onExportJSON={handleExportJSON}
          onExportSummary={handleExportSummary}
          onCopyJSON={handleCopyJSON}
        />
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatsPanel: React.FC<{ gameState: any }> = ({ gameState }) => {
  const imperials = gameState.figures.filter((f: any) => {
    const p = gameState.players.find((p: any) => p.id === f.playerId)
    return p?.role === 'Imperial'
  })
  const operatives = gameState.figures.filter((f: any) => {
    const p = gameState.players.find((p: any) => p.id === f.playerId)
    return p?.role === 'Operative'
  })

  const impAlive = imperials.filter((f: any) => !f.isDefeated)
  const opAlive = operatives.filter((f: any) => !f.isDefeated)
  // v2: resolve wound threshold from NPC profile or hero character
  const getWT = (f: any) => {
    if (f.entityType === 'hero') {
      const hero = gameState.heroes?.[f.entityId]
      return hero?.wounds?.threshold ?? 10
    }
    const npc = gameState.npcProfiles?.[f.entityId]
    return npc?.woundThreshold ?? 5
  }
  const impWoundsRemaining = impAlive.reduce((sum: number, f: any) => sum + Math.max(0, getWT(f) - f.woundsCurrent), 0)
  const impWoundsMax = impAlive.reduce((sum: number, f: any) => sum + getWT(f), 0)
  const opWoundsRemaining = opAlive.reduce((sum: number, f: any) => sum + Math.max(0, getWT(f) - f.woundsCurrent), 0)
  const opWoundsMax = opAlive.reduce((sum: number, f: any) => sum + getWT(f), 0)

  return (
    <div style={statsPanelStyle}>
      <div style={statsTitleStyle}>BATTLE STATS</div>
      <div style={statsRowStyle}>
        <span style={{ color: '#ff4444' }}>IMPERIAL</span>
        <span>{impAlive.length}/{imperials.length} units</span>
      </div>
      <div style={statsBarStyle}>
        <div style={statsBarFillStyle(impWoundsRemaining / Math.max(1, impWoundsMax), '#ff4444')} />
      </div>
      <div style={statsLabelStyle}>{impWoundsRemaining}/{impWoundsMax} wounds remaining</div>

      <div style={{ ...statsRowStyle, marginTop: '12px' }}>
        <span style={{ color: '#44ff44' }}>OPERATIVE</span>
        <span>{opAlive.length}/{operatives.length} units</span>
      </div>
      <div style={statsBarStyle}>
        <div style={statsBarFillStyle(opWoundsRemaining / Math.max(1, opWoundsMax), '#44ff44')} />
      </div>
      <div style={statsLabelStyle}>{opWoundsRemaining}/{opWoundsMax} wounds remaining</div>

      <div style={{ ...statsRowStyle, marginTop: '16px', borderTop: '1px solid #333', paddingTop: '8px' }}>
        <span style={{ color: '#4a9eff' }}>Round</span>
        <span>{gameState.roundNumber}</span>
      </div>
      <div style={statsRowStyle}>
        <span style={{ color: '#4a9eff' }}>Morale (Imp)</span>
        <span>{gameState.imperialMorale.value}/{gameState.imperialMorale.max}</span>
      </div>
      <div style={statsRowStyle}>
        <span style={{ color: '#4a9eff' }}>Morale (Op)</span>
        <span>{gameState.operativeMorale.value}/{gameState.operativeMorale.max}</span>
      </div>
    </div>
  )
}

interface GameOverProps {
  gameState: any
  hasLog: boolean
  onExportJSON: () => void
  onExportSummary: () => void
  onCopyJSON: () => void
}

const GameOverOverlay: React.FC<GameOverProps> = ({
  gameState,
  hasLog,
  onExportJSON,
  onExportSummary,
  onCopyJSON,
}) => {
  const [copied, setCopied] = useState(false)

  const winnerColor = gameState.winner === 'Imperial' ? '#ff4444'
    : gameState.winner === 'Operative' ? '#44ff44'
    : '#ffd700'

  const handleCopy = () => {
    onCopyJSON()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div style={gameOverBackdropStyle} />
      <div style={gameOverPanelStyle}>
        <div style={{ fontSize: '14px', color: '#999', textTransform: 'uppercase', marginBottom: '8px' }}>
          Game Over
        </div>
        <div style={{ fontSize: '36px', fontWeight: 'bold', color: winnerColor, marginBottom: '12px' }}>
          {gameState.winner === 'Draw' ? 'DRAW' : `${gameState.winner?.toUpperCase()} WINS`}
        </div>
        <div style={{ fontSize: '13px', color: '#ccc', marginBottom: '24px' }}>
          {gameState.victoryCondition ?? 'Game concluded'}
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          Completed in {gameState.roundNumber} rounds
        </div>

        {/* Export buttons */}
        {hasLog && (
          <div style={exportContainerStyle}>
            <div style={exportLabelStyle}>BATTLE LOG</div>
            <div style={exportRowStyle}>
              <button style={exportBtnStyle('#4a9eff')} onClick={onExportJSON}>
                SAVE JSON
              </button>
              <button style={exportBtnStyle('#44ff44')} onClick={onExportSummary}>
                SAVE SUMMARY
              </button>
              <button style={exportBtnStyle(copied ? '#ffd700' : '#ff8844')} onClick={handleCopy}>
                {copied ? 'COPIED!' : 'COPY JSON'}
              </button>
            </div>
          </div>
        )}

        <button
          style={newGameBtnStyle}
          onClick={() => useGameStore.setState({ showSetup: true, isInitialized: false, gameState: null })}
        >
          NEW GAME
        </button>
      </div>
    </>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  overflow: 'hidden',
  position: 'relative',
}

const canvasContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
}

// --- Control Bar ---
const controlBarStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  left: 16,
  backgroundColor: 'rgba(10, 10, 20, 0.95)',
  border: '1px solid #333355',
  borderRadius: '8px',
  padding: '12px 16px',
  zIndex: 200,
  minWidth: '320px',
}

const controlBarTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#ffd700',
  fontWeight: 'bold',
  letterSpacing: '2px',
  marginBottom: '8px',
}

const controlRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
}

const controlBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  backgroundColor: active ? '#ffd700' : '#1a1a2e',
  color: active ? '#000' : '#ccc',
  border: `1px solid ${active ? '#ffd700' : '#333355'}`,
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s',
})

const speedBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  backgroundColor: active ? '#4a9eff' : '#1a1a2e',
  color: active ? '#000' : '#888',
  border: `1px solid ${active ? '#4a9eff' : '#222244'}`,
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s',
})

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  backgroundColor: 'transparent',
  color: active ? '#4a9eff' : '#666',
  border: `1px solid ${active ? '#4a9eff33' : '#22224433'}`,
  borderRadius: '3px',
  fontSize: '9px',
  fontWeight: 'bold',
  cursor: 'pointer',
  letterSpacing: '0.5px',
})

const stateIndicatorStyle: React.CSSProperties = {
  marginTop: '8px',
  fontSize: '11px',
  color: '#999',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

const stateDotStyle = (phase: string): React.CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor:
    phase === 'thinking' ? '#ffd700'
    : phase === 'executing' ? '#4a9eff'
    : phase === 'phase-advance' ? '#ff8844'
    : '#333',
  boxShadow:
    phase === 'idle' ? 'none'
    : `0 0 6px ${phase === 'thinking' ? '#ffd700' : phase === 'executing' ? '#4a9eff' : '#ff8844'}`,
  transition: 'all 0.3s',
})

// --- Reasoning Panel ---
const reasoningPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 80,
  right: 16,
  width: '300px',
  maxHeight: 'calc(100vh - 200px)',
  backgroundColor: 'rgba(10, 10, 20, 0.95)',
  border: '1px solid #333355',
  borderRadius: '8px',
  padding: '12px',
  zIndex: 200,
  overflowY: 'auto',
}

const reasoningTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#4a9eff',
  fontWeight: 'bold',
  letterSpacing: '2px',
  marginBottom: '10px',
}

const currentDecisionStyle: React.CSSProperties = {
  backgroundColor: 'rgba(74, 158, 255, 0.08)',
  border: '1px solid #4a9eff33',
  borderRadius: '6px',
  padding: '10px',
  marginBottom: '10px',
}

const figureNameStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 'bold',
  color: '#fff',
  marginBottom: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const archetypeTagStyle: React.CSSProperties = {
  fontSize: '9px',
  color: '#ffd700',
  backgroundColor: 'rgba(255, 215, 0, 0.15)',
  padding: '2px 6px',
  borderRadius: '3px',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const reasoningTextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#ccc',
  lineHeight: '1.4',
  marginBottom: '6px',
}

const ruleStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#888',
  fontStyle: 'italic',
  borderTop: '1px solid #222244',
  paddingTop: '6px',
  marginTop: '4px',
}

// --- Decision Log ---
const decisionLogStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const logEntryStyle = (isLatest: boolean): React.CSSProperties => ({
  padding: '6px 8px',
  backgroundColor: isLatest ? 'rgba(74, 158, 255, 0.05)' : 'transparent',
  borderRadius: '4px',
  borderLeft: isLatest ? '2px solid #4a9eff' : '2px solid transparent',
  opacity: isLatest ? 1 : 0.6,
  transition: 'opacity 0.3s',
})

const logFigureStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#aaa',
  fontWeight: 'bold',
  textTransform: 'capitalize',
  marginBottom: '2px',
}

const logReasoningStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#777',
  lineHeight: '1.3',
  marginBottom: '3px',
}

const logActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
}

const logActionTagStyle: React.CSSProperties = {
  fontSize: '9px',
  color: '#4a9eff',
  backgroundColor: 'rgba(74, 158, 255, 0.1)',
  padding: '1px 5px',
  borderRadius: '2px',
}

// --- Stats Panel ---
const statsPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 80,
  left: 16,
  width: '200px',
  backgroundColor: 'rgba(10, 10, 20, 0.95)',
  border: '1px solid #333355',
  borderRadius: '8px',
  padding: '12px',
  zIndex: 200,
}

const statsTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#4a9eff',
  fontWeight: 'bold',
  letterSpacing: '2px',
  marginBottom: '10px',
}

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: '#ccc',
  marginBottom: '4px',
}

const statsBarStyle: React.CSSProperties = {
  width: '100%',
  height: '4px',
  backgroundColor: '#1a1a2e',
  borderRadius: '2px',
  overflow: 'hidden',
  marginBottom: '2px',
}

const statsBarFillStyle = (pct: number, color: string): React.CSSProperties => ({
  width: `${Math.max(0, Math.min(100, pct * 100))}%`,
  height: '100%',
  backgroundColor: color,
  transition: 'width 0.5s ease',
})

const statsLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#666',
  textAlign: 'right',
}

// --- Game Over ---
const gameOverBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  zIndex: 300,
}

const gameOverPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  backgroundColor: 'rgba(15, 15, 25, 0.98)',
  border: '2px solid #ffd700',
  borderRadius: '12px',
  padding: '40px 60px',
  textAlign: 'center',
  zIndex: 301,
  boxShadow: '0 0 60px rgba(255, 215, 0, 0.2)',
}

const newGameBtnStyle: React.CSSProperties = {
  padding: '10px 32px',
  backgroundColor: '#ffd700',
  color: '#000',
  border: 'none',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
}

// --- Export buttons ---
const exportContainerStyle: React.CSSProperties = {
  marginBottom: '20px',
  padding: '12px 16px',
  backgroundColor: 'rgba(74, 158, 255, 0.08)',
  border: '1px solid #333355',
  borderRadius: '8px',
}

const exportLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#4a9eff',
  fontWeight: 'bold',
  letterSpacing: '1.5px',
  marginBottom: '8px',
}

const exportRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'center',
}

const exportBtnStyle = (color: string): React.CSSProperties => ({
  padding: '6px 14px',
  backgroundColor: 'transparent',
  color,
  border: `1px solid ${color}`,
  borderRadius: '4px',
  fontSize: '10px',
  fontWeight: 'bold',
  cursor: 'pointer',
  letterSpacing: '0.5px',
  transition: 'all 0.2s',
})

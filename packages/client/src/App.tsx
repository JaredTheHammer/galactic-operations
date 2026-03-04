import React, { useEffect, useState } from 'react'
import { useGameStore } from './store/game-store'
import { TacticalGrid } from './canvas/TacticalGrid'
import { GameSetup } from './components/Setup/GameSetup'
import HeroCreation from './components/HeroCreation/HeroCreation'
import { AIBattle } from './components/AIBattle/AIBattle'
import { TurnIndicator } from './components/HUD/TurnIndicator'
import { ActivationOrder } from './components/HUD/ActivationOrder'
import { MoraleTracker } from './components/HUD/MoraleTracker'
import { InfoPanel } from './components/HUD/InfoPanel'
import { ActionButtons } from './components/HUD/ActionButtons'
import { CombatPanel } from './components/Combat/CombatPanel'
import { CombatLog } from './components/Combat/CombatLog'
import { ObjectiveProgress } from './components/HUD/ObjectiveProgress'
import { ThreatTracker } from './components/HUD/ThreatTracker'
import { ObjectiveTooltip } from './components/HUD/ObjectiveTooltip'
import { FigureTooltip } from './components/HUD/FigureTooltip'
import { NotificationCenter } from './components/HUD/NotificationCenter'
import { RoundBanner } from './components/HUD/RoundBanner'
import { GameOverBanner } from './components/HUD/GameOverBanner'
import MissionSelect from './components/Campaign/MissionSelect'
import PostMission from './components/Campaign/PostMission'
import { SocialPhase } from './components/Campaign/SocialPhase/SocialPhase'
import { HeroProgression } from './components/Campaign/HeroProgression/HeroProgression'
import PortraitManagerPage from './components/Campaign/PortraitManagerPage'
import MissionBriefing from './components/Campaign/MissionBriefing'
import { CombatArena } from './components/CombatArena/CombatArena'
import { useIsMobile } from './hooks/useIsMobile'
import { useCombatKeys } from './hooks/useCombatKeys'
import { useImperialAI } from './hooks/useImperialAI'
import { useAutoPhase } from './hooks/useAutoPhase'
import { useAutosave } from './hooks/useAutosave'
import { AutosaveToast } from './components/HUD/AutosaveToast'
import { ShortcutHelp } from './components/HUD/ShortcutHelp'

/** Brief victory/defeat overlay shown on the tactical grid before PostMission transition */
const MissionOutcomeOverlay: React.FC<{ winner: string; victoryCondition?: string }> = ({ winner, victoryCondition }) => {
  const isVictory = winner === 'Operative'
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isVictory ? 'rgba(0, 40, 0, 0.85)' : 'rgba(40, 0, 0, 0.85)',
      zIndex: 500,
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: '42px',
        fontWeight: 'bold',
        color: isVictory ? '#44ff44' : '#ff4444',
        textShadow: `0 0 30px ${isVictory ? 'rgba(68, 255, 68, 0.6)' : 'rgba(255, 68, 68, 0.6)'}`,
        letterSpacing: '4px',
        marginBottom: '16px',
      }}>
        {isVictory ? 'MISSION COMPLETE' : 'MISSION FAILED'}
      </div>
      {victoryCondition && (
        <div style={{ fontSize: '16px', color: '#cccccc', maxWidth: '400px', textAlign: 'center' }}>
          {victoryCondition}
        </div>
      )}
    </div>
  )
}

function App() {
  const {
    gameState,
    isInitialized,
    showSetup,
    showHeroCreation,
    isAIBattle,
    selectedFigureId,
    combatLog,
    showMissionSelect,
    showPostMission,
    showSocialPhase,
    showHeroProgression,
    showPortraitManager,
    showCombatArena,
    showMissionBriefing,
  } = useGameStore()

  const { isMobile } = useIsMobile()
  const [showCombatLog, setShowCombatLog] = useState(false)

  // Keyboard shortcuts for tactical combat (disabled on non-combat screens and mobile)
  const inTacticalCombat = !!gameState && isInitialized && !isAIBattle && !showSetup && !showHeroCreation
    && !showMissionSelect && !showPostMission && !showSocialPhase && !showHeroProgression
    && !showPortraitManager && !showCombatArena && !showMissionBriefing
  useCombatKeys(inTacticalCombat && !isMobile)

  // Auto-execute Imperial AI turns in campaign combat (not AI Battle mode)
  const { isImperialTurn } = useImperialAI(inTacticalCombat && !isAIBattle)

  // Auto-advance non-interactive phases + auto-skip defeated player figures
  useAutoPhase(inTacticalCombat && !isAIBattle)

  // Periodic campaign autosave (every 60s when campaign is active)
  useAutosave()

  const selectedFigure = gameState?.figures.find(f => f.id === selectedFigureId) || null
  const currentActivatingId = gameState?.activationOrder[gameState?.currentActivationIndex]
  const currentActivatingFigure = currentActivatingId ? gameState?.figures.find(f => f.id === currentActivatingId) || null : null

  // If not initialized, show setup
  if (showSetup) {
    return <GameSetup />
  }

  // Combat Arena (interactive force builder + visual replay)
  if (showCombatArena) {
    return <CombatArena />
  }

  // Hero creation flow (between setup and game)
  if (showHeroCreation) {
    return <HeroCreation />
  }

  // Campaign: mission select screen
  if (showMissionSelect) {
    return <><MissionSelect /><AutosaveToast /></>
  }

  // Campaign: mission briefing (between select and combat)
  if (showMissionBriefing) {
    return <><MissionBriefing /><AutosaveToast /></>
  }

  // Campaign: social phase (between missions)
  if (showSocialPhase) {
    return <><SocialPhase /><AutosaveToast /></>
  }

  // Campaign: hero progression (XP spending)
  if (showHeroProgression) {
    return <><HeroProgression /><AutosaveToast /></>
  }

  // Campaign: portrait & faction visual manager
  if (showPortraitManager) {
    return <><PortraitManagerPage /><AutosaveToast /></>
  }

  // Campaign: post-mission results screen
  if (showPostMission) {
    return <><PostMission /><AutosaveToast /></>
  }

  if (!gameState || !isInitialized) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0f' }}>
        <div style={{ color: '#4a9eff', fontSize: '18px' }}>Initializing game...</div>
      </div>
    )
  }

  // AI Battle mode: use the dedicated watch mode UI
  if (isAIBattle) {
    return <AIBattle />
  }

  // ---- Mobile Combat Layout ----
  if (isMobile) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0f', overflow: 'hidden' }}>
        {/* Compact top bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          paddingTop: 'calc(8px + var(--safe-top))',
          backgroundColor: '#131320',
          borderBottom: '1px solid #333355',
          gap: '8px',
          flexShrink: 0,
        }}>
          <TurnIndicator gameState={gameState} compact hideControls />
          <MoraleTracker gameState={gameState} compact />
          <ThreatTracker gameState={gameState} compact />
          <ObjectiveProgress gameState={gameState} compact />
          <button
            onClick={() => setShowCombatLog(true)}
            style={{
              background: 'none',
              border: '1px solid #333355',
              color: '#ffd700',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
              minWidth: '32px',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            LOG
          </button>
        </div>

        {/* Canvas fills remaining space */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <TacticalGrid gameState={gameState} />
        </div>

        {/* Action buttons strip (hidden during Imperial AI turns) */}
        {currentActivatingFigure?.id === selectedFigureId && !isImperialTurn && (
          <ActionButtons selectedFigure={selectedFigure} compact />
        )}

        {/* Info drawer */}
        {selectedFigure && (
          <InfoPanel selectedFigure={selectedFigure} gameState={gameState} compact />
        )}

        {/* Combat log overlay */}
        <CombatLog messages={combatLog} compact visible={showCombatLog} onClose={() => setShowCombatLog(false)} />

        {/* Hover tooltips */}
        <ObjectiveTooltip />
        <FigureTooltip />

        {/* Notification popups + cinematic banners */}
        <NotificationCenter />
        <RoundBanner />
        <GameOverBanner />

        {/* Combat panel overlay */}
        {gameState.activeCombat && (
          <CombatPanel combat={gameState.activeCombat} gameState={gameState} />
        )}

        {/* Semi-transparent backdrop for combat */}
        {gameState.activeCombat && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 150,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Campaign mission outcome overlay */}
        {gameState.winner && (
          <MissionOutcomeOverlay winner={gameState.winner} victoryCondition={gameState.victoryCondition} />
        )}
      </div>
    )
  }

  const appStyle: React.CSSProperties = {
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

  return (
    <div style={appStyle}>
      {/* Tactical Grid (main canvas) */}
      <div style={canvasContainerStyle}>
        <TacticalGrid gameState={gameState} />
      </div>

      {/* HUD Overlays */}

      {/* Top Center: Turn Indicator */}
      <TurnIndicator gameState={gameState} />

      {/* Top Center (below turn indicator): Activation Order */}
      <ActivationOrder gameState={gameState} />

      {/* Top Left: Morale Tracker */}
      <MoraleTracker gameState={gameState} />

      {/* Top Center (below turn indicator): Objective Progress */}
      <ObjectiveProgress gameState={gameState} />

      {/* Top Left (below morale): Threat Pool */}
      <ThreatTracker gameState={gameState} />

      {/* Hover tooltips */}
      <ObjectiveTooltip />
      <FigureTooltip />

      {/* Notification popups + cinematic banners */}
      <NotificationCenter />
      <RoundBanner />
      <GameOverBanner />

      {/* Top Right: Selected Figure Info */}
      {selectedFigure && (
        <InfoPanel selectedFigure={selectedFigure} gameState={gameState} />
      )}

      {/* Bottom Center: Action Buttons (hidden during Imperial AI turns) */}
      {currentActivatingFigure?.id === selectedFigureId && !isImperialTurn && (
        <ActionButtons selectedFigure={selectedFigure} />
      )}

      {/* Bottom Right: Combat Log */}
      <CombatLog messages={combatLog} />

      {/* Keyboard shortcut help overlay (? to toggle) */}
      <ShortcutHelp enabled={inTacticalCombat && !isMobile} />

      {/* Centered Overlay: Combat Panel (shown during combat) */}
      {gameState.activeCombat && (
        <CombatPanel combat={gameState.activeCombat} gameState={gameState} />
      )}

      {/* Semi-transparent backdrop for combat */}
      {gameState.activeCombat && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 150,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Campaign mission outcome overlay */}
      {gameState.winner && (
        <MissionOutcomeOverlay winner={gameState.winner} victoryCondition={gameState.victoryCondition} />
      )}
    </div>
  )
}

export default App

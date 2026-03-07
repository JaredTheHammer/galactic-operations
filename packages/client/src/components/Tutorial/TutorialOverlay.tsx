/**
 * TutorialOverlay - Step-by-step tutorial tooltip overlay.
 * Renders on top of the game canvas with contextual instructions.
 * Watches game state to auto-advance tutorial steps.
 */

import React, { useEffect, useRef } from 'react'
import { useTutorialStore, TUTORIAL_STEPS } from '../../store/tutorial-store'
import { useGameStore } from '../../store/game-store'

// ============================================================================
// GAME STATE WATCHER
// ============================================================================

/** Watches game state changes and notifies the tutorial store */
function useTutorialWatcher() {
  const isActive = useTutorialStore(s => s.isActive)
  const notifyEvent = useTutorialStore(s => s.notifyEvent)

  const gameState = useGameStore(s => s.gameState)
  const selectedFigureId = useGameStore(s => s.selectedFigureId)
  const validMoves = useGameStore(s => s.validMoves)

  const prevSelectedRef = useRef<string | null>(null)
  const prevFigurePositionsRef = useRef<string>('')
  const prevActivationRef = useRef<number>(-1)

  useEffect(() => {
    if (!isActive || !gameState) return

    // Figure selected
    if (selectedFigureId && selectedFigureId !== prevSelectedRef.current) {
      const fig = gameState.figures.find(f => f.id === selectedFigureId)
      if (fig && fig.playerId === 1) { // Operative figure selected
        notifyEvent('figure-selected')
      }
    }
    prevSelectedRef.current = selectedFigureId

    // Figure moved (detect position changes for operative figures)
    const opPositions = gameState.figures
      .filter(f => f.playerId === 1)
      .map(f => `${f.id}:${f.position.x},${f.position.y}`)
      .join('|')
    if (prevFigurePositionsRef.current && opPositions !== prevFigurePositionsRef.current) {
      notifyEvent('figure-moved')
    }
    prevFigurePositionsRef.current = opPositions

    // Activation ended (index changed)
    const activationIdx = gameState.currentActivationIndex ?? -1
    if (prevActivationRef.current >= 0 && activationIdx !== prevActivationRef.current) {
      notifyEvent('activation-ended')
    }
    prevActivationRef.current = activationIdx

  }, [isActive, gameState, selectedFigureId, validMoves, notifyEvent])
}

/** Watches combat log for attack/aim events */
function useCombatLogWatcher() {
  const isActive = useTutorialStore(s => s.isActive)
  const notifyEvent = useTutorialStore(s => s.notifyEvent)
  const combatLog = useGameStore(s => s.combatLog)
  const prevLogLenRef = useRef(0)

  useEffect(() => {
    if (!isActive) return
    if (combatLog.length <= prevLogLenRef.current) {
      prevLogLenRef.current = combatLog.length
      return
    }

    // Check new log entries
    const newEntries = combatLog.slice(prevLogLenRef.current)
    prevLogLenRef.current = combatLog.length

    for (const entry of newEntries) {
      const lower = entry.toLowerCase()
      if (lower.includes('attacks') || lower.includes('damage') || lower.includes('miss')) {
        notifyEvent('attack-started')
      }
      if (lower.includes('aims') || lower.includes('aim token')) {
        notifyEvent('aim-used')
      }
    }
  }, [isActive, combatLog, notifyEvent])
}

// ============================================================================
// STYLES
// ============================================================================

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 9000,
}

const tooltipBaseStyle: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'auto',
  backgroundColor: 'rgba(10, 10, 20, 0.95)',
  border: '2px solid #4a9eff',
  borderRadius: '8px',
  padding: '20px 24px',
  maxWidth: '420px',
  boxShadow: '0 4px 24px rgba(74, 158, 255, 0.3), 0 0 60px rgba(74, 158, 255, 0.1)',
}

const titleStyle: React.CSSProperties = {
  color: '#4a9eff',
  fontSize: '16px',
  fontWeight: 'bold',
  marginBottom: '8px',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
}

const textStyle: React.CSSProperties = {
  color: '#c0c0c0',
  fontSize: '13px',
  lineHeight: '1.6',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '16px',
  gap: '8px',
}

const navButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #333355',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  letterSpacing: '0.5px',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
}

const progressStyle: React.CSSProperties = {
  color: '#555',
  fontSize: '11px',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
}

const skipButtonStyle: React.CSSProperties = {
  ...navButtonStyle,
  backgroundColor: 'transparent',
  border: '1px solid #333',
  color: '#666',
}

function getAnchorPosition(anchor: string): React.CSSProperties {
  switch (anchor) {
    case 'center':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    case 'canvas-center':
      return { top: '40%', left: '40%', transform: 'translate(-50%, -50%)' }
    case 'top-left':
      return { top: '80px', left: '20px' }
    case 'top-right':
      return { top: '80px', right: '20px' }
    case 'bottom-center':
      return { bottom: '120px', left: '50%', transform: 'translateX(-50%)' }
    default:
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
}

// ============================================================================
// HIGHLIGHT PULSE
// ============================================================================

const pulseKeyframes = `
@keyframes tutorial-pulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.35; }
}
`

function HighlightHint({ highlight }: { highlight?: string }) {
  if (!highlight) return null

  let position: React.CSSProperties = {}
  let label = ''

  switch (highlight) {
    case 'figures':
      label = 'Click a green figure on the map'
      position = { bottom: '80px', left: '50%', transform: 'translateX(-50%)' }
      break
    case 'moves':
      label = 'Click a cyan tile to move'
      position = { bottom: '80px', left: '50%', transform: 'translateX(-50%)' }
      break
    case 'targets':
      label = 'Click a red-highlighted enemy to attack'
      position = { bottom: '80px', left: '50%', transform: 'translateX(-50%)' }
      break
    case 'action-buttons':
      label = 'Use the action buttons below'
      position = { bottom: '60px', left: '50%', transform: 'translateX(-50%)' }
      break
    case 'info-panel':
      label = 'Check the info panel on the right'
      position = { top: '50%', right: '290px', transform: 'translateY(-50%)' }
      break
    default:
      return null
  }

  return (
    <div style={{
      position: 'absolute',
      ...position,
      pointerEvents: 'none',
      color: '#4a9eff',
      fontSize: '12px',
      fontWeight: 'bold',
      letterSpacing: '0.5px',
      padding: '6px 12px',
      backgroundColor: 'rgba(10, 10, 20, 0.8)',
      border: '1px solid #4a9eff',
      borderRadius: '4px',
      animation: 'tutorial-pulse 2s ease-in-out infinite',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    }}>
      {label}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TutorialOverlay() {
  const { isActive, currentStep, currentStepIndex, nextStep, prevStep, endTutorial } = useTutorialStore()

  // Activate game state watchers
  useTutorialWatcher()
  useCombatLogWatcher()

  if (!isActive || !currentStep) return null

  const isFirst = currentStepIndex === 0
  const isLast = currentStep.id === 'tutorial-complete'
  const isManual = currentStep.advanceOn === 'manual'
  const stepNum = currentStepIndex + 1
  const totalSteps = TUTORIAL_STEPS.length

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={overlayStyle}>
        {/* Tooltip */}
        <div style={{ ...tooltipBaseStyle, ...getAnchorPosition(currentStep.anchor) }}>
          <div style={titleStyle}>{currentStep.title}</div>
          <div style={textStyle}>{currentStep.text}</div>

          <div style={buttonRowStyle}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!isFirst && (
                <button
                  style={{ ...navButtonStyle, backgroundColor: '#1a1a2f', color: '#888' }}
                  onClick={prevStep}
                >
                  BACK
                </button>
              )}
              {isManual && !isLast && (
                <button
                  style={{ ...navButtonStyle, backgroundColor: '#1a3a5a', color: '#4a9eff' }}
                  onClick={nextStep}
                >
                  NEXT
                </button>
              )}
              {isLast && (
                <button
                  style={{ ...navButtonStyle, backgroundColor: '#2a4a2a', color: '#44ff44' }}
                  onClick={endTutorial}
                >
                  FINISH
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={progressStyle}>{stepNum}/{totalSteps}</span>
              {!isLast && (
                <button style={skipButtonStyle} onClick={endTutorial}>
                  SKIP TUTORIAL
                </button>
              )}
            </div>
          </div>

          {/* Auto-advance hint */}
          {!isManual && !isLast && (
            <div style={{ marginTop: '8px', color: '#4a9eff', fontSize: '11px', fontStyle: 'italic' }}>
              Perform the action above to continue, or press SKIP TUTORIAL to exit.
            </div>
          )}
        </div>

        {/* Highlight hint */}
        <HighlightHint highlight={currentStep.highlight} />
      </div>
    </>
  )
}

import { useEffect } from 'react'
import { useGameStore } from '../store/game-store'

/**
 * Keyboard shortcuts for tactical combat.
 *
 * Key bindings:
 *   M = Move (no-op; user moves by clicking valid tiles)
 *   A = Attack (no-op; user attacks by clicking valid targets)
 *   I = Aim (gain aim token)
 *   R = Rally (recover strain)
 *   D = Dodge (gain dodge token)
 *   G = Guard / Standby
 *   E = End Activation
 *   N = Next Phase (advance phase)
 *   Tab = Cycle to next friendly figure
 *   Escape = Deselect figure
 *   Ctrl+Z = Undo last action
 */
export function useCombatKeys(enabled: boolean) {
  const store = useGameStore

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const {
        gameState,
        selectedFigureId,
        selectFigure,
        aimFigure,
        rallyFigure,
        dodgeFigure,
        guardedStance,
        endActivation,
        advancePhase,
        undoLastAction,
        gameStateHistory,
        setCameraTarget,
      } = store.getState()

      if (!gameState) return

      // Ctrl+Z = Undo (handle before other keys)
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && gameStateHistory.length > 0) {
        e.preventDefault()
        undoLastAction()
        return
      }

      const selectedFigure = selectedFigureId
        ? gameState.figures.find(f => f.id === selectedFigureId) ?? null
        : null

      const currentActivatingId = gameState.activationOrder[gameState.currentActivationIndex]
      const isActivating = selectedFigure && currentActivatingId === selectedFigureId

      switch (e.key.toLowerCase()) {
        case 'i': // Aim
          if (isActivating && selectedFigure.actionsRemaining > 0 && selectedFigure.aimTokens < 2) {
            e.preventDefault()
            aimFigure()
          }
          break

        case 'r': // Rally
          if (isActivating && selectedFigure.actionsRemaining > 0 && selectedFigure.strainCurrent > 0) {
            e.preventDefault()
            rallyFigure()
          }
          break

        case 'd': // Dodge
          if (isActivating && selectedFigure.actionsRemaining > 0 && selectedFigure.dodgeTokens < 1) {
            e.preventDefault()
            dodgeFigure()
          }
          break

        case 'g': // Guard / Standby
          if (isActivating && selectedFigure.actionsRemaining > 0) {
            e.preventDefault()
            guardedStance()
          }
          break

        case 'c': // Take Cover
          if (isActivating && selectedFigure.maneuversRemaining > 0) {
            e.preventDefault()
            store.getState().takeCover()
          }
          break

        case 's': // Strain for Maneuver
          if (isActivating && !selectedFigure.hasUsedStrainForManeuver) {
            e.preventDefault()
            store.getState().strainForManeuver()
          }
          break

        case 'e': // End Activation
          if (isActivating) {
            e.preventDefault()
            endActivation()
          }
          break

        case 'n': // Next Phase
          e.preventDefault()
          advancePhase()
          break

        case 'tab': { // Cycle through figures
          e.preventDefault()
          const currentPlayer = gameState.players[gameState.currentPlayerIndex]
          const friendlyFigures = gameState.figures.filter(
            f => f.playerId === currentPlayer.id && !f.isDefeated
          )
          if (friendlyFigures.length === 0) break

          const currentIdx = selectedFigureId
            ? friendlyFigures.findIndex(f => f.id === selectedFigureId)
            : -1
          const nextIdx = (currentIdx + 1) % friendlyFigures.length
          const nextFig = friendlyFigures[nextIdx]
          selectFigure(nextFig.id)
          setCameraTarget(nextFig.position)
          break
        }

        case 'escape': // Deselect
          if (selectedFigureId) {
            e.preventDefault()
            selectFigure(null)
          }
          break

        case '`': // Cycle combat speed
          e.preventDefault()
          store.getState().cycleCombatSpeed()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}

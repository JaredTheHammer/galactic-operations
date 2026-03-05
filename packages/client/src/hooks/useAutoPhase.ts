/**
 * useAutoPhase Hook
 *
 * Automatically advances non-interactive combat phases in campaign play:
 * - Setup, Initiative, Status, Reinforcement: auto-advance after a brief delay
 * - Activation (all done): auto-advance to Status when all figures have activated
 * - Defeated player figures: auto-skip (call endActivation)
 *
 * This eliminates tedious "Next Phase" clicking for phases with no player decisions.
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/game-store'

// Base delays (ms)
const BASE_PHASE_ADVANCE = 1200
const BASE_ALL_DONE = 800
const BASE_DEFEATED_SKIP = 200

function getPhaseDelays() {
  const speed = useGameStore.getState().combatSpeed
  if (speed === 'instant') return { phase: 50, allDone: 50, skip: 0 }
  if (speed === 'fast') return { phase: 400, allDone: 250, skip: 50 }
  return { phase: BASE_PHASE_ADVANCE, allDone: BASE_ALL_DONE, skip: BASE_DEFEATED_SKIP }
}

export function useAutoPhase(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const unsub = useGameStore.subscribe((state) => {
      const gs = state.gameState
      if (!gs || gs.winner) return

      // --- Auto-advance non-interactive phases ---
      const nonInteractivePhases = ['Setup', 'Initiative', 'Status', 'Reinforcement']
      if (nonInteractivePhases.includes(gs.turnPhase)) {
        // Clear any existing timer to avoid double-fires
        if (timerRef.current) clearTimeout(timerRef.current)

        timerRef.current = setTimeout(() => {
          // Re-check state is still the same phase (user might have clicked manually)
          const current = useGameStore.getState().gameState
          if (current && current.turnPhase === gs.turnPhase && !current.winner) {
            useGameStore.getState().advancePhase()
          }
          timerRef.current = null
        }, getPhaseDelays().phase)
        return
      }

      // --- Auto-advance when all activations are done ---
      if (gs.turnPhase === 'Activation') {
        const allDone = gs.currentActivationIndex + 1 >= gs.activationOrder.length
        const currentFigureId = gs.activationOrder[gs.currentActivationIndex]
        const currentFigure = gs.figures.find(f => f.id === currentFigureId)

        // Check if current figure is already activated (all done scenario)
        if (allDone && currentFigure?.isActivated) {
          if (timerRef.current) clearTimeout(timerRef.current)

          timerRef.current = setTimeout(() => {
            const current = useGameStore.getState().gameState
            if (current && current.turnPhase === 'Activation' && !current.winner) {
              useGameStore.getState().advancePhase()
            }
            timerRef.current = null
          }, getPhaseDelays().allDone)
          return
        }

        // --- Auto-skip defeated player figures ---
        if (currentFigure && currentFigure.isDefeated) {
          const player = gs.players.find(p => p.id === currentFigure.playerId)
          // Only auto-skip Operative (player) figures here; Imperial is handled by useImperialAI
          if (player && !player.isAI) {
            if (skipTimerRef.current) clearTimeout(skipTimerRef.current)

            skipTimerRef.current = setTimeout(() => {
              const current = useGameStore.getState().gameState
              if (!current) return
              const fig = current.figures.find(f => f.id === currentFigure.id)
              if (fig?.isDefeated && current.turnPhase === 'Activation') {
                useGameStore.getState().endActivation()
              }
              skipTimerRef.current = null
            }, getPhaseDelays().skip)
          }
        }
      }
    })

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current)
    }
  }, [enabled])
}

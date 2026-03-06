/**
 * useCampaignAI Hook
 *
 * Processes AI-controlled figure turns during campaign combat.
 * Unlike useAITurn (which drives full AI-vs-AI games), this hook:
 * - Only processes turns for AI-controlled figures (Imperial side)
 * - Leaves player-controlled figures (Operative heroes) for manual input
 * - Handles end-of-round phase transitions automatically
 * - Skips defeated figures
 *
 * Architecture: A Zustand subscription watches for store changes.
 * When the current figure is AI-controlled, it runs the AI decision
 * engine, executes actions with visual delays, then ends the activation.
 * Using subscribe() instead of useEffect avoids race conditions between
 * async processing and React's render cycle.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useGameStore } from '../store/game-store'
import type { GameState, GameData, GameAction, Figure } from '@engine/types.js'
import type { AIProfilesData } from '@engine/ai/types.js'
import {
  loadAIProfiles,
  getProfileForFigure,
  determineActions,
} from '@engine/ai/index.js'
import {
  executeActionV2,
  resetForActivation,
  getFigureName,
} from '@engine/turn-machine-v2.js'
import { getMoraleChangeForEvent, applyMoraleChange } from '@engine/morale.js'
import aiProfilesRaw from '@data/ai-profiles.json'

// Delays for visual pacing of AI actions (ms)
const AI_THINK_DELAY = 400
const AI_ACTION_DELAY = 350
const AI_POST_ACTIVATION_DELAY = 200

export type CampaignAIPhase = 'idle' | 'thinking' | 'executing' | 'advancing'

export interface CampaignAIState {
  phase: CampaignAIPhase
  activeFigureName: string
  reasoning: string
}

export function useCampaignAI() {
  const [aiState, setAIState] = useState<CampaignAIState>({
    phase: 'idle',
    activeFigureName: '',
    reasoning: '',
  })

  const profilesRef = useRef<AIProfilesData | null>(null)
  const processingRef = useRef(false)
  const cancelRef = useRef(false)
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load AI profiles once. Also reset processingRef on mount/HMR to prevent
  // stale locks from surviving hot module replacement.
  useEffect(() => {
    profilesRef.current = loadAIProfiles(aiProfilesRaw)
    processingRef.current = false
    cancelRef.current = false
  }, [])

  // Async delay helper
  const delay = useCallback((ms: number) => {
    return new Promise<void>(resolve => {
      if (ms <= 0) { resolve(); return }
      setTimeout(resolve, ms)
    })
  }, [])

  // Core logic: check if we should process an AI turn or advance phase.
  // Called from the Zustand subscription whenever the store changes.
  const checkAndProcess = useCallback(() => {
    const { gameState, gameData, isAIBattle } = useGameStore.getState()

    // Only run in campaign combat (not AI battles, which use useAITurn)
    if (isAIBattle) return
    if (!gameState || !gameData || !profilesRef.current) return
    if (processingRef.current) return

    // Handle activation phase
    if (gameState.turnPhase === 'Activation') {
      const figId = gameState.activationOrder[gameState.currentActivationIndex]
      if (!figId) {
        // All activations exhausted -- advance phase
        if (gameState.currentActivationIndex >= gameState.activationOrder.length) {
          processingRef.current = true
          useGameStore.getState().advancePhase()
          setTimeout(() => {
            processingRef.current = false
            checkAndProcess()
          }, 50)
        }
        return
      }

      const fig = gameState.figures.find(f => f.id === figId)
      if (!fig) return

      // Skip defeated figures (guard with processingRef to prevent
      // synchronous re-entry from the Zustand subscription)
      if (fig.isDefeated) {
        processingRef.current = true
        useGameStore.getState().endActivation()
        setTimeout(() => {
          processingRef.current = false
          checkAndProcess()
        }, 50)
        return
      }

      // Check if this figure is AI-controlled
      const player = gameState.players.find(p => p.id === fig.playerId)
      if (!player?.isAI) return // Player's turn -- do nothing

      // Process AI turn
      processingRef.current = true
      cancelRef.current = false

      // Safety timeout: auto-reset processing lock after 15s in case
      // async processing hangs (e.g. HMR mid-flight)
      if (processingTimerRef.current) clearTimeout(processingTimerRef.current)
      processingTimerRef.current = setTimeout(() => {
        if (processingRef.current) {
          console.warn('[CampaignAI] Processing timeout -- resetting lock')
          processingRef.current = false
          checkAndProcess()
        }
      }, 15000)

      processAIActivation(fig, gameState, gameData, profilesRef.current)
        .finally(() => {
          if (processingTimerRef.current) clearTimeout(processingTimerRef.current)
          processingRef.current = false
          // After processing completes, check again on next tick.
          // This ensures the next AI figure gets processed even though
          // the store change from endActivation() already fired while
          // processingRef was still true.
          setTimeout(() => checkAndProcess(), 50)
        })
      return
    }

    // Auto-advance non-interactive phases
    if (gameState.turnPhase === 'Setup' || gameState.turnPhase === 'Status' || gameState.turnPhase === 'Reinforcement') {
      processingRef.current = true
      setTimeout(() => {
        useGameStore.getState().advancePhase()
        processingRef.current = false
        setTimeout(() => checkAndProcess(), 50)
      }, 300)
    }
    if (gameState.turnPhase === 'Initiative') {
      processingRef.current = true
      setTimeout(() => {
        useGameStore.getState().advancePhase()
        processingRef.current = false
        setTimeout(() => checkAndProcess(), 50)
      }, 200)
    }
  }, [])

  // Subscribe to Zustand store changes and trigger AI processing.
  // This runs outside the React render cycle, avoiding the race condition
  // where processingRef is still true when the effect fires.
  useEffect(() => {
    // Initial check on mount
    checkAndProcess()

    // Subscribe to all store changes
    const unsub = useGameStore.subscribe(() => {
      checkAndProcess()
    })

    return () => {
      unsub()
      cancelRef.current = true
    }
  }, [checkAndProcess])

  async function processAIActivation(
    fig: Figure,
    gs: GameState,
    gameData: GameData,
    profiles: AIProfilesData,
  ) {
    const addCombatLog = useGameStore.getState().addCombatLog
    const figureName = getFigureName(fig, gs)
    const profile = getProfileForFigure(fig, gs, profiles)

    // --- Thinking ---
    setAIState({
      phase: 'thinking',
      activeFigureName: figureName,
      reasoning: `${profile.name} evaluating...`,
    })

    await delay(AI_THINK_DELAY)
    if (cancelRef.current) return

    // Ensure figure is reset for activation
    let currentGs = useGameStore.getState().gameState
    if (!currentGs) return

    const activeFig = currentGs.figures.find(f => f.id === fig.id)
    if (!activeFig || activeFig.isDefeated) {
      useGameStore.getState().endActivation()
      setAIState({ phase: 'idle', activeFigureName: '', reasoning: '' })
      return
    }

    // Ensure the figure has actions/maneuvers available
    if (activeFig.actionsRemaining <= 0 && activeFig.maneuversRemaining <= 0) {
      // Reset for activation if needed
      currentGs = {
        ...currentGs,
        figures: currentGs.figures.map(f =>
          f.id === fig.id ? resetForActivation(f) : f
        ),
      }
      useGameStore.setState({ gameState: currentGs })
    }

    // Run AI decision engine
    let decision
    try {
      const latestFig = currentGs.figures.find(f => f.id === fig.id)!
      decision = determineActions(latestFig, currentGs, gameData, profiles)
    } catch (err) {
      console.error(`Campaign AI decision error for ${fig.id}:`, err)
      addCombatLog(`AI [${figureName}]: Decision error - ending turn`)
      useGameStore.getState().endActivation()
      setAIState({ phase: 'idle', activeFigureName: '', reasoning: '' })
      return
    }

    setAIState({
      phase: 'executing',
      activeFigureName: figureName,
      reasoning: decision.reasoning,
    })
    addCombatLog(`AI [${figureName}]: ${decision.reasoning}`)

    // --- Execute actions ---
    const defeatedBefore = new Set(currentGs.figures.filter(f => f.isDefeated).map(f => f.id))

    for (const action of decision.actions) {
      if (cancelRef.current) return

      currentGs = useGameStore.getState().gameState!
      if (!currentGs) break

      // Visualize move path or attack target
      if (action.type === 'Move') {
        useGameStore.setState({ aiMovePath: action.payload.path })
      } else if (action.type === 'Attack') {
        const targetFig = currentGs.figures.find(f => f.id === action.payload.targetId)
        const currentFig = currentGs.figures.find(f => f.id === fig.id)
        if (targetFig && currentFig) {
          useGameStore.setState({
            aiAttackTarget: { from: currentFig.position, to: targetFig.position },
          })
        }
      }

      await delay(AI_ACTION_DELAY)
      if (cancelRef.current) return

      // Clear visual indicators
      useGameStore.setState({ aiMovePath: null, aiAttackTarget: null })

      // Execute the action
      try {
        const newGs = executeActionV2(currentGs, action, gameData)
        // Clear activeCombat immediately for AI turns - no need to show dice modal
        const gsToStore = newGs.activeCombat ? { ...newGs, activeCombat: null } : newGs
        useGameStore.setState({ gameState: gsToStore })
        currentGs = gsToStore

        const actionLabel = describeAction(action, newGs)
        addCombatLog(`  -> ${actionLabel}`)

        // Check for defeats and update morale
        for (const f of newGs.figures) {
          if (f.isDefeated && !defeatedBefore.has(f.id)) {
            defeatedBefore.add(f.id)
            const victimName = getFigureName(f, newGs)
            addCombatLog(`  !! ${victimName} defeated!`)

            const victimSide = newGs.players.find(p => p.id === f.playerId)?.role
            const npcProfile = newGs.npcProfiles[f.entityId]
            const event = npcProfile?.tier === 'Nemesis' ? 'heroDefeated' as const
              : npcProfile?.tier === 'Rival' ? 'eliteDefeated' as const
              : 'figureDefeated' as const

            if (victimSide === 'Imperial') {
              const change = getMoraleChangeForEvent(event, 'Imperial')
              const updated = { ...currentGs, imperialMorale: applyMoraleChange(currentGs.imperialMorale, change) }
              useGameStore.setState({ gameState: updated })
              currentGs = updated
            } else if (victimSide === 'Operative') {
              const change = getMoraleChangeForEvent(event, 'Operative')
              const updated = { ...currentGs, operativeMorale: applyMoraleChange(currentGs.operativeMorale, change) }
              useGameStore.setState({ gameState: updated })
              currentGs = updated
            }
          }
        }
      } catch (err) {
        console.error(`Campaign AI action execution error:`, err)
        addCombatLog(`  !! Action failed: ${err}`)
      }
    }

    // --- End activation ---
    await delay(AI_POST_ACTIVATION_DELAY)
    useGameStore.getState().endActivation()

    setAIState({ phase: 'idle', activeFigureName: '', reasoning: '' })
  }

  return aiState
}

/** Describe an action for the combat log */
function describeAction(action: GameAction, gs: GameState): string {
  switch (action.type) {
    case 'Move': {
      const path = action.payload.path
      const dest = path[path.length - 1]
      return `Move to (${dest.x}, ${dest.y})`
    }
    case 'Attack': {
      const target = gs.figures.find(f => f.id === action.payload.targetId)
      const targetName = target ? getFigureName(target, gs) : action.payload.targetId
      return `Attack ${targetName} [${action.payload.weaponId}]`
    }
    case 'Rally': return 'Rally (recover strain)'
    case 'GuardedStance': return 'Guarded Stance'
    case 'TakeCover': return 'Take Cover'
    case 'Aim': return 'Aim'
    case 'AimManeuver': return 'Aim (maneuver)'
    case 'StandUp': return 'Stand Up'
    case 'StrainForManeuver': return 'Strain for extra Maneuver'
    case 'Interact': return 'Interact'
    case 'InteractTerminal': return `Interact with objective (${action.payload?.terminalId ?? '?'})`
    case 'UseTalent': return `Use talent: ${action.payload.talentId}`
    default: return action.type
  }
}

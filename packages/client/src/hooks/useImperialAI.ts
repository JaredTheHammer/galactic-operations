/**
 * useImperialAI Hook
 *
 * Auto-executes Imperial (AI) figure activations during campaign tactical combat.
 * When the current activating figure belongs to an AI-flagged player, this hook:
 * 1. Runs the v2 AI decision engine (determineActions)
 * 2. Executes actions with visual delays (move path, attack target highlights)
 * 3. Logs all actions to the combat log
 * 4. Auto-ends the activation and advances to the next figure
 *
 * This hook only fires in campaign combat (not AI Battle, which uses useAITurn).
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../store/game-store'
import type { GameState, GameAction } from '@engine/types.js'
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

// Timing delays for AI visualization (campaign feels deliberate, not rushed)
const DELAYS = {
  thinkMs: 600,
  actionMs: 500,
  combatResultMs: 1800,
  postActivationMs: 300,
}

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
    case 'Rally':
      return 'Rally (recover strain)'
    case 'GuardedStance':
      return 'Guarded Stance'
    case 'TakeCover':
      return 'Take Cover'
    case 'Aim':
      return 'Aim'
    case 'AimManeuver':
      return 'Aim (maneuver)'
    case 'StandUp':
      return 'Stand Up'
    case 'StrainForManeuver':
      return 'Strain for extra Maneuver'
    case 'DrawHolster':
      return 'Draw/Holster weapon'
    case 'UseSkill':
      return `Use skill: ${action.payload.skill}`
    default:
      return action.type
  }
}

export function useImperialAI(enabled: boolean): { isImperialTurn: boolean } {
  const profilesRef = useRef<AIProfilesData | null>(null)
  const runningRef = useRef(false)
  const isImperialTurnRef = useRef(false)

  // Load AI profiles once
  useEffect(() => {
    profilesRef.current = loadAIProfiles(aiProfilesRaw)
  }, [])

  // Async delay helper
  const delay = useCallback((ms: number) => {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
  }, [])

  // Subscribe to game state changes and trigger AI when it's an Imperial figure's turn
  useEffect(() => {
    if (!enabled) {
      isImperialTurnRef.current = false
      return
    }

    // Use Zustand subscribe to react to state changes
    const unsub = useGameStore.subscribe((state) => {
      const gs = state.gameState
      if (!gs || !state.gameData || !profilesRef.current) return
      if (gs.turnPhase !== 'Activation') return
      if (runningRef.current) return

      const currentFigureId = gs.activationOrder[gs.currentActivationIndex]
      const currentFigure = gs.figures.find(f => f.id === currentFigureId)
      if (!currentFigure) return

      // Check if this figure belongs to an AI player
      const player = gs.players.find(p => p.id === currentFigure.playerId)
      if (!player?.isAI) {
        isImperialTurnRef.current = false
        return
      }

      // Auto-skip defeated AI figures
      if (currentFigure.isDefeated) {
        runningRef.current = true
        setTimeout(() => {
          useGameStore.getState().endActivation()
          runningRef.current = false
        }, 50)
        return
      }

      // It's an AI figure's turn - run the AI
      isImperialTurnRef.current = true
      runningRef.current = true

      const profiles = profilesRef.current!
      const gameData = state.gameData

      const runImperialTurn = async () => {
        try {
          // Get fresh state
          let gs = useGameStore.getState().gameState
          if (!gs) return
          const addCombatLog = useGameStore.getState().addCombatLog

          const figId = gs.activationOrder[gs.currentActivationIndex]
          let fig = gs.figures.find(f => f.id === figId)
          if (!fig || fig.isDefeated) {
            // Skip defeated figures
            useGameStore.getState().endActivation()
            return
          }

          // Reset figure for activation
          gs = {
            ...gs,
            figures: gs.figures.map(f =>
              f.id === fig!.id ? resetForActivation(f) : f
            ),
          }
          useGameStore.setState({ gameState: gs })
          fig = gs.figures.find(f => f.id === figId)!

          const profile = getProfileForFigure(fig, gs, profiles)
          const figureName = getFigureName(fig, gs)

          // Pan camera to the activating figure
          useGameStore.getState().setCameraTarget(fig.position)

          // Set the imperial AI phase indicator
          useGameStore.setState({ imperialAIPhase: 'thinking' })

          await delay(DELAYS.thinkMs)

          // Run AI decision engine
          let decision
          try {
            decision = determineActions(fig, gs, gameData, profiles)
          } catch (err) {
            console.error(`Imperial AI decision error for ${fig.id}:`, err)
            useGameStore.setState({ imperialAIPhase: null })
            useGameStore.getState().endActivation()
            return
          }

          addCombatLog(`AI [${figureName}]: ${decision.reasoning}`)
          useGameStore.setState({ imperialAIPhase: 'executing' })

          // Execute each action with visualization
          const woundsBefore = new Map(gs.figures.map(f => [f.id, f.woundsCurrent]))
          const defeatedBefore = new Set(gs.figures.filter(f => f.isDefeated).map(f => f.id))

          for (const action of decision.actions) {
            // Visualize move path or attack target
            if (action.type === 'Move') {
              useGameStore.setState({ aiMovePath: action.payload.path })
            } else if (action.type === 'Attack') {
              const targetFig = gs.figures.find(f => f.id === action.payload.targetId)
              const currentFig = gs.figures.find(f => f.id === fig!.id)
              if (targetFig && currentFig) {
                useGameStore.setState({
                  aiAttackTarget: { from: currentFig.position, to: targetFig.position },
                })
              }
            }

            await delay(DELAYS.actionMs)

            // Clear visualization
            useGameStore.setState({ aiMovePath: null, aiAttackTarget: null })

            // Execute the action
            try {
              gs = executeActionV2(gs, action, gameData)
            } catch (err) {
              console.error(`Imperial AI action error:`, err)
              addCombatLog(`  !! Action failed: ${err}`)
              continue
            }

            const actionLabel = describeAction(action, gs)
            addCombatLog(`  -> ${actionLabel}`)

            // Check for combat results (wounds, defeats)
            for (const f of gs.figures) {
              // Detect newly wounded heroes
              const prevFig = useGameStore.getState().gameState?.figures.find(pf => pf.id === f.id)
              if (f.isWounded && prevFig && !prevFig.isWounded) {
                const victimName = getFigureName(f, gs)
                addCombatLog(`  !! ${victimName} is WOUNDED!`)
              }

              if (f.isDefeated && !defeatedBefore.has(f.id)) {
                defeatedBefore.add(f.id)
                const victimSide = gs.players.find(p => p.id === f.playerId)?.role
                const npcProfile = gs.npcProfiles[f.entityId]
                const event = npcProfile?.tier === 'Nemesis' ? 'heroDefeated' as const
                  : npcProfile?.tier === 'Rival' ? 'eliteDefeated' as const
                  : 'figureDefeated' as const

                if (victimSide === 'Imperial') {
                  const change = getMoraleChangeForEvent(event, 'Imperial')
                  gs = { ...gs, imperialMorale: applyMoraleChange(gs.imperialMorale, change) }
                } else if (victimSide === 'Operative') {
                  const change = getMoraleChangeForEvent(event, 'Operative')
                  gs = { ...gs, operativeMorale: applyMoraleChange(gs.operativeMorale, change) }
                }

                const victimName = getFigureName(f, gs)
                addCombatLog(`  !! ${victimName} defeated!`)
              }
            }

            // Show combat results panel briefly for attacks so player sees dice
            if (gs.activeCombat && action.type === 'Attack') {
              useGameStore.setState({ gameState: gs })
              await delay(DELAYS.combatResultMs)
              gs = { ...gs, activeCombat: null }
            } else if (gs.activeCombat) {
              gs = { ...gs, activeCombat: null }
            }
            useGameStore.setState({ gameState: gs })
          }

          // Brief pause before ending activation
          await delay(DELAYS.postActivationMs)

          // End the activation (advances to next figure)
          useGameStore.setState({ imperialAIPhase: null })
          useGameStore.getState().endActivation()

        } finally {
          runningRef.current = false
          isImperialTurnRef.current = false
        }
      }

      runImperialTurn()
    })

    return () => {
      unsub()
      isImperialTurnRef.current = false
    }
  }, [enabled, delay])

  // Also check the current state synchronously for rendering
  const gs = useGameStore(s => s.gameState)
  if (!gs || gs.turnPhase !== 'Activation') {
    return { isImperialTurn: false }
  }
  const currentFigureId = gs.activationOrder[gs.currentActivationIndex]
  const currentFigure = gs.figures.find(f => f.id === currentFigureId)
  if (!currentFigure) return { isImperialTurn: false }
  const player = gs.players.find(p => p.id === currentFigure.playerId)

  return { isImperialTurn: !!player?.isAI }
}

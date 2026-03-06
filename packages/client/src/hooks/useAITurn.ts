/**
 * useAITurn Hook (v2)
 *
 * Drives AI-vs-AI games using v2 engine:
 * - v2 AI decision engine (determineActions, getProfileForFigure)
 * - v2 action execution (executeActionV2)
 * - v2 Figure shape (entityType/entityId, woundsCurrent, conditions)
 * - v2 action economy (1 Action + 1 Maneuver per activation)
 *
 * Architecture: One useEffect starts the master game loop.
 * The loop runs until game over, cancel, or unmount.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useGameStore } from '../store/game-store'
import type {
  GameState,
  GameData,
  GameAction,
  Figure,
  NPCProfile,
} from '@engine/types.js'
import type { AIProfilesData, AIDecisionResult } from '@engine/ai/types.js'
import {
  loadAIProfiles,
  getProfileForFigure,
  determineActions,
} from '@engine/ai/index.js'
import { combatAnimations } from '../canvas/animation-manager'
import {
  advancePhaseV2,
  executeActionV2,
  checkVictoryV2,
  resetForActivation,
  getFigureName,
  getWoundThresholdV2,
  applyReinforcementPhase,
} from '@engine/turn-machine-v2.js'
import { getMoraleChangeForEvent, applyMoraleChange } from '@engine/morale.js'
import { BattleLogger } from '@engine/ai/battle-logger.js'
import type { BattleLog } from '@engine/ai/battle-logger.js'
import aiProfilesRaw from '@data/ai-profiles.json'

// ============================================================================
// TYPES
// ============================================================================

export type AISpeed = 'slow' | 'normal' | 'fast' | 'instant'

const SPEED_DELAYS: Record<AISpeed, { thinkMs: number; actionMs: number; phaseMs: number }> = {
  slow:    { thinkMs: 1500, actionMs: 1200, phaseMs: 800 },
  normal:  { thinkMs: 800,  actionMs: 600,  phaseMs: 400 },
  fast:    { thinkMs: 300,  actionMs: 200,  phaseMs: 150 },
  instant: { thinkMs: 0,    actionMs: 0,    phaseMs: 0 },
}

export interface AITurnState {
  phase: 'idle' | 'thinking' | 'executing' | 'phase-advance'
  activeFigure: Figure | null
  decision: AIDecisionResult | null
  reasoning: string
  archetypeName: string
  decisionLog: Array<{
    figureId: string
    entityId: string
    reasoning: string
    actions: string[]
    timestamp: number
  }>
}

export interface UseAITurnReturn {
  aiState: AITurnState
  isPaused: boolean
  speed: AISpeed
  togglePause: () => void
  setSpeed: (speed: AISpeed) => void
  isAIBattle: boolean
  profiles: AIProfilesData | null
  battleLog: BattleLog | null
  getBattleLogJSON: () => string | null
  getBattleLogSummary: () => string | null
}

// ============================================================================
// HOOK
// ============================================================================

export function useAITurn(): UseAITurnReturn {
  const gameData = useGameStore(s => s.gameData)
  const addCombatLog = useGameStore(s => s.addCombatLog)

  const [aiState, setAIState] = useState<AITurnState>({
    phase: 'idle',
    activeFigure: null,
    decision: null,
    reasoning: '',
    archetypeName: '',
    decisionLog: [],
  })

  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState<AISpeed>('normal')
  const [battleLog, setBattleLog] = useState<BattleLog | null>(null)

  const profilesRef = useRef<AIProfilesData | null>(null)
  const cancelRef = useRef(false)
  const pausedRef = useRef(false)
  const speedRef = useRef<AISpeed>(speed)
  const loopStarted = useRef(false)
  const loggerRef = useRef<BattleLogger | null>(null)

  // Keep refs in sync with state
  useEffect(() => { pausedRef.current = isPaused }, [isPaused])
  useEffect(() => { speedRef.current = speed }, [speed])

  // Load profiles once (v2)
  useEffect(() => {
    profilesRef.current = loadAIProfiles(aiProfilesRaw)
  }, [])

  const isAIBattle = useGameStore(s => s.gameState?.players.every(p => p.isAI) ?? false)

  // Async delay that respects cancel and pause
  const delay = useCallback(async (ms: number) => {
    if (ms <= 0) return
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (cancelRef.current) return
      while (pausedRef.current && !cancelRef.current) {
        await new Promise(r => setTimeout(r, 100))
      }
      if (cancelRef.current) return
      await new Promise(r => setTimeout(r, Math.min(50, ms - (Date.now() - start))))
    }
  }, [])

  const getBattleLogJSON = useCallback((): string | null => {
    return loggerRef.current?.toJSON() ?? null
  }, [])

  const getBattleLogSummary = useCallback((): string | null => {
    return loggerRef.current?.toSummary() ?? null
  }, [])

  // -----------------------------------------------------------------------
  // MASTER GAME LOOP
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isAIBattle || !gameData || !profilesRef.current) return
    if (loopStarted.current) return

    const initialGs = useGameStore.getState().gameState
    if (!initialGs) return

    loopStarted.current = true
    cancelRef.current = false

    const profiles = profilesRef.current

    // Read the mission from the store (set during initGame with correct victory conditions)
    // Falls back to correct IA-style conditions if no stored mission (shouldn't happen in normal flow)
    const storedMission = useGameStore.getState().activeMission
    const mission = storedMission ?? {
      id: initialGs.missionId,
      name: '',
      description: '',
      mapId: '',
      roundLimit: 15,
      imperialThreat: initialGs.threatPool,
      imperialReinforcementPoints: initialGs.reinforcementPoints,
      victoryConditions: [
        { side: 'Imperial' as const, description: 'All heroes wounded', condition: 'allHeroesWounded' },
        { side: 'Operative' as const, description: 'Complete objectives', condition: 'objectivesCompleted', objectiveThreshold: 2 },
      ],
    }
    const ROUND_LIMIT = mission.roundLimit

    // Initialize BattleLogger
    const logger = new BattleLogger()
    loggerRef.current = logger

    // Build archetype map for all figures (v2: uses gameState for NPC lookup)
    const archetypeMap: Record<string, string> = {}
    for (const fig of initialGs.figures) {
      const profile = getProfileForFigure(fig, initialGs, profiles)
      archetypeMap[fig.id] = profile.name
    }

    const boardW = Math.ceil(initialGs.map.width / 12)
    const boardH = Math.ceil(initialGs.map.height / 12)
    const boardLayout = `${boardW}x${boardH} (${initialGs.map.width}x${initialGs.map.height} tiles)`

    logger.startGame(initialGs, gameData, archetypeMap, ROUND_LIMIT, boardLayout)

    const finalizeGame = (winner: string, condition: string, gs: GameState) => {
      logger.endGame(winner, condition, gs)
      const log = logger.getLog()
      setBattleLog(log)

      // Dump full battle log to console for easy capture
      console.log('\n' + '='.repeat(60))
      console.log('GALACTIC OPERATIONS - AI BATTLE LOG')
      console.log('='.repeat(60))
      console.log(logger.toSummary())
      console.log('\n--- FULL JSON LOG ---')
      console.log(logger.toJSON())
      console.log('='.repeat(60) + '\n')
    }

    const runGame = async () => {
      // Advance from Initiative to Activation
      let gs = advancePhaseV2(initialGs)
      useGameStore.setState({ gameState: gs })

      addCombatLog(`--- Round ${gs.roundNumber} ---`)
      logger.startRound(gs.roundNumber)
      await delay(SPEED_DELAYS[speedRef.current].phaseMs)

      // ===== ROUND LOOP =====
      while (gs.roundNumber <= ROUND_LIMIT && gs.turnPhase !== 'GameOver') {
        if (cancelRef.current) return

        // ===== ACTIVATION LOOP =====
        while (
          gs.turnPhase === 'Activation' &&
          gs.currentActivationIndex < gs.activationOrder.length
        ) {
          if (cancelRef.current) return
          const speeds = SPEED_DELAYS[speedRef.current]

          const figId = gs.activationOrder[gs.currentActivationIndex]
          const fig = gs.figures.find(f => f.id === figId)

          // Skip defeated figures
          if (!fig || fig.isDefeated) {
            gs = advancePhaseV2(gs)
            useGameStore.setState({ gameState: gs })
            continue
          }

          // Reset figure for activation (v2: 1 Action + 1 Maneuver)
          gs = {
            ...gs,
            figures: gs.figures.map(f =>
              f.id === fig.id ? resetForActivation(f) : f
            ),
          }
          const activeFig = gs.figures.find(f => f.id === fig.id)!

          // --- THINKING ---
          const profile = getProfileForFigure(activeFig, gs, profiles)
          const figureName = getFigureName(activeFig, gs)

          setAIState(prev => ({
            ...prev,
            phase: 'thinking',
            activeFigure: activeFig,
            reasoning: `Evaluating priority rules for ${profile.name}...`,
            archetypeName: profile.name,
          }))

          await delay(speeds.thinkMs)
          if (cancelRef.current) return

          const gsBefore = gs

          // Run v2 AI decision engine
          let decision: AIDecisionResult
          try {
            decision = determineActions(activeFig, gs, gameData, profiles)
          } catch (err) {
            console.error(`AI decision error for ${fig.id}:`, err)
            decision = { actions: [], matchedRule: profile.priorityRules[0], reasoning: `Error: ${err}` }
          }

          setAIState(prev => ({
            ...prev,
            phase: 'executing',
            decision,
            reasoning: decision.reasoning,
          }))

          addCombatLog(`AI [${figureName}]: ${decision.reasoning}`)

          // --- EXECUTING ---
          const woundsBefore = new Map(gs.figures.map(f => [f.id, f.woundsCurrent]))
          const defeatedBefore = new Set(gs.figures.filter(f => f.isDefeated).map(f => f.id))
          const actionNames: string[] = []
          const executedActions: GameAction[] = []

          for (const action of decision.actions) {
            if (cancelRef.current) return

            // Visualize + auto-pan camera
            if (action.type === 'Move') {
              useGameStore.getState().setAIMovePath(action.payload.path)
            } else if (action.type === 'Attack') {
              const targetFig = gs.figures.find(f => f.id === action.payload.targetId)
              const currentFig = gs.figures.find(f => f.id === activeFig.id)
              if (targetFig && currentFig) {
                useGameStore.getState().setAIAttackTarget({ from: currentFig.position, to: targetFig.position })
              }
            }

            await delay(speeds.actionMs)
            if (cancelRef.current) return

            useGameStore.getState().clearAIVisualization()

            // Capture pre-execution state for animations
            const figBefore = gs.figures.find(f => f.id === activeFig.id)
            const figBeforePos = figBefore ? { x: figBefore.position.x, y: figBefore.position.y } : null

            try {
              gs = executeActionV2(gs, action, gameData)
              executedActions.push(action)
            } catch (err) {
              console.error(`Action execution error:`, err)
              addCombatLog(`  !! Action failed: ${err}`)
              continue
            }

            // Spawn animations based on action type
            const ownerSide = activeFig.owner === 0 ? 'imperial' : 'operative'
            if (action.type === 'Move' && figBeforePos) {
              const dest = action.payload.path[action.payload.path.length - 1]
              combatAnimations.spawnMoveTrail(figBeforePos, dest, ownerSide)
            } else if (action.type === 'Attack') {
              const targetFig = gs.figures.find(f => f.id === action.payload.targetId)
              const attackerFig = gs.figures.find(f => f.id === activeFig.id)
              if (targetFig && attackerFig) {
                const resolution = gs.activeCombat?.resolution
                const isHit = resolution?.isHit ?? false
                const defSide = targetFig.owner === 0 ? 'imperial' : 'operative'
                combatAnimations.spawnProjectile(attackerFig.position, targetFig.position, isHit, ownerSide)
                if (resolution) {
                  combatAnimations.spawnDamageNumber(targetFig.position, resolution.woundsDealt, resolution.isHit)
                  if (resolution.isDefeated) {
                    combatAnimations.spawnDeathParticles(targetFig.position, defSide)
                  }
                }
              }
            }

            const actionLabel = describeActionV2(action, gs)
            actionNames.push(actionLabel)
            addCombatLog(`  -> ${actionLabel}`)

            // Check for wounds and defeats, update morale
            for (const f of gs.figures) {
              // Detect newly wounded heroes (wounded mechanic: first threshold = wounded, second = defeated)
              const wasBefore = woundsBefore.get(f.id) ?? 0
              if (f.isWounded && !f.isDefeated && (wasBefore > 0 || f.woundsCurrent === 0) && !defeatedBefore.has(f.id)) {
                // Check if this is a new wound event (wounds reset to 0 when hero becomes wounded)
                const prevFig = gsBefore.figures.find(pf => pf.id === f.id)
                if (prevFig && !prevFig.isWounded && f.isWounded) {
                  const victimName = getFigureName(f, gs)
                  addCombatLog(`  !! ${victimName} is WOUNDED! (-1 to all stats, defeated on next threshold)`)
                }
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

            // Clear activeCombat overlay after AI actions so it doesn't block the UI
            if (gs.activeCombat) {
              gs = { ...gs, activeCombat: null }
            }
            useGameStore.setState({ gameState: gs })
          }

          // Battle log: record activation
          logger.logActivation(
            activeFig,
            gsBefore,
            gs,
            gameData,
            decision,
            profile,
            executedActions,
            actionNames
          )

          // Update decision log
          setAIState(prev => ({
            ...prev,
            decisionLog: [
              {
                figureId: activeFig.id,
                entityId: activeFig.entityId,
                reasoning: decision.reasoning,
                actions: actionNames,
                timestamp: Date.now(),
              },
              ...prev.decisionLog.slice(0, 49),
            ],
          }))

          // Mark figure as activated
          gs = {
            ...gs,
            figures: gs.figures.map(f =>
              f.id === fig.id ? { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 } : f
            ),
          }

          gs = advancePhaseV2(gs)
          useGameStore.setState({ gameState: gs })

          // Check victory after each activation
          const midVictory = checkVictoryV2(gs, mission)
          if (midVictory.winner) {
            gs = { ...gs, winner: midVictory.winner, victoryCondition: midVictory.condition, turnPhase: 'GameOver' as const }
            useGameStore.setState({ gameState: gs })
            addCombatLog(`GAME OVER: ${midVictory.winner} wins! ${midVictory.condition}`)
            logger.endRound(gs)
            finalizeGame(midVictory.winner, midVictory.condition ?? 'Victory', gs)
            setAIState(prev => ({ ...prev, phase: 'idle', activeFigure: null }))
            loopStarted.current = false
            return
          }

          await delay(speeds.phaseMs)
        }

        // ===== END OF ROUND =====
        logger.endRound(gs)

        setAIState(prev => ({ ...prev, phase: 'phase-advance', activeFigure: null, reasoning: 'Advancing to next round...' }))

        // Force to Status if still in Activation
        if (gs.turnPhase === 'Activation') {
          gs = { ...gs, turnPhase: 'Status' as const }
        }
        gs = advancePhaseV2(gs) // Status -> Reinforcement

        // === REINFORCEMENT: accumulate threat and spawn Imperial units ===
        const reinforcement = applyReinforcementPhase(gs, gameData)
        gs = reinforcement.gameState
        if (reinforcement.events.length > 0) {
          addCombatLog(`--- Reinforcement: +${reinforcement.threatGained} threat, spent ${reinforcement.threatSpent} (pool: ${reinforcement.newThreatPool}) ---`)
          for (const evt of reinforcement.events) {
            addCombatLog(`  DEPLOYED: ${evt.npcName} at (${evt.position.x},${evt.position.y}) [cost: ${evt.threatCost}]`)
          }
          logger.logReinforcement(reinforcement)
        } else if (reinforcement.threatGained > 0) {
          addCombatLog(`--- Reinforcement: +${reinforcement.threatGained} threat (pool: ${reinforcement.newThreatPool}, nothing purchased) ---`)
        }

        gs = advancePhaseV2(gs) // Reinforcement -> Initiative (increments round)
        gs = advancePhaseV2(gs) // Initiative -> Activation (builds new activation order)

        // Reset all figures for new round (v2: 1 Action + 1 Maneuver)
        gs = {
          ...gs,
          figures: gs.figures.map(f =>
            f.isDefeated ? f : resetForActivation(f)
          ),
        }

        // Check victory / round limit
        const endVictory = checkVictoryV2(gs, mission)
        if (endVictory.winner) {
          gs = { ...gs, winner: endVictory.winner, victoryCondition: endVictory.condition, turnPhase: 'GameOver' as const }
          useGameStore.setState({ gameState: gs })
          addCombatLog(`GAME OVER: ${endVictory.winner} wins! ${endVictory.condition}`)
          finalizeGame(endVictory.winner, endVictory.condition ?? 'Victory', gs)
          setAIState(prev => ({ ...prev, phase: 'idle', activeFigure: null }))
          loopStarted.current = false
          return
        }

        if (gs.roundNumber > ROUND_LIMIT) {
          // Tiebreak by remaining wounds
          let impWounds = 0, opWounds = 0
          for (const f of gs.figures) {
            if (f.isDefeated) continue
            const threshold = getWoundThresholdV2(f, gs)
            const remaining = threshold - f.woundsCurrent
            const side = gs.players.find(p => p.id === f.playerId)?.role
            if (side === 'Imperial') impWounds += remaining
            else opWounds += remaining
          }
          const winnerLabel = impWounds > opWounds ? 'Imperial' : opWounds > impWounds ? 'Operative' : 'Draw'
          const winnerSide = winnerLabel === 'Draw' ? null : winnerLabel as 'Imperial' | 'Operative'
          gs = { ...gs, winner: winnerSide, victoryCondition: 'Round limit reached', turnPhase: 'GameOver' as const }
          useGameStore.setState({ gameState: gs })
          addCombatLog(`GAME OVER: ${winnerLabel} wins by remaining health!`)
          finalizeGame(winnerLabel, 'Round limit reached', gs)
          setAIState(prev => ({ ...prev, phase: 'idle', activeFigure: null }))
          loopStarted.current = false
          return
        }

        addCombatLog(`--- Round ${gs.roundNumber} ---`)
        logger.startRound(gs.roundNumber)
        useGameStore.setState({ gameState: gs })
        await delay(SPEED_DELAYS[speedRef.current].phaseMs)
      }

      setAIState(prev => ({ ...prev, phase: 'idle', activeFigure: null }))
      loopStarted.current = false
    }

    runGame().catch(err => {
      console.error('AI game loop error:', err)
      addCombatLog(`AI loop error: ${err}`)
      loopStarted.current = false
    })

    return () => {
      cancelRef.current = true
      loopStarted.current = false
    }
  }, [isAIBattle, gameData])

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  return {
    aiState,
    isPaused,
    speed,
    togglePause,
    setSpeed,
    isAIBattle,
    profiles: profilesRef.current,
    battleLog,
    getBattleLogJSON,
    getBattleLogSummary,
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Describe a v2 action for the combat log.
 */
function describeActionV2(action: GameAction, gs: GameState): string {
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
      return `Draw/Holster weapon`
    case 'UseSkill':
      return `Use skill: ${action.payload.skill}`
    case 'UseTalent':
      return `Use talent: ${action.payload.talentId}`
    case 'Interact':
      return 'Interact'
    case 'InteractTerminal': {
      const objId = action.payload?.terminalId ?? 'unknown'
      return `Interact with objective (${objId})`
    }
    default:
      return (action as any).type
  }
}

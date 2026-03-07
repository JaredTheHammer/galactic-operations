/**
 * Spirit Island Subsystem #2: Dual-Timing Actions
 *
 * Abilities and talents can be tagged as 'fast' (resolve immediately, normal
 * effect) or 'slow' (queue for end-of-round resolution, amplified effect).
 * Inspired by Spirit Island's Fast/Slow power distinction.
 *
 * Slow actions are riskier (figure may die before resolution) but stronger.
 * If a figure is defeated before its slow action resolves, the action is cancelled.
 */

import type {
  DualTimingState,
  QueuedSlowAction,
  SlowBonus,
  GameAction,
  GameState,
  Figure,
} from './types.js';

/** Default slow bonuses by action type */
const DEFAULT_SLOW_BONUSES: Record<string, SlowBonus> = {
  Attack: { bonusDamage: 2, bonusPierce: 1 },
  UseSkill: { upgradePool: 1 },
  UseTalent: { bonusDamage: 1, upgradePool: 1 },
  Rally: { bonusHealing: 2 },
  Aim: { upgradePool: 2 },
};

/**
 * Create initial dual-timing state for a mission.
 */
export function initializeDualTiming(): DualTimingState {
  return {
    slowQueue: [],
    cancelledThisRound: [],
  };
}

/**
 * Get the slow bonus for a given action type.
 * Returns undefined if the action type cannot be slowed.
 */
export function getSlowBonus(actionType: string): SlowBonus | undefined {
  return DEFAULT_SLOW_BONUSES[actionType];
}

/**
 * Queue a slow action for end-of-round resolution.
 */
export function queueSlowAction(
  state: DualTimingState,
  figureId: string,
  action: GameAction,
  roundNumber: number,
  customBonus?: SlowBonus,
): DualTimingState {
  const slowBonus = customBonus ?? getSlowBonus(action.type) ?? { bonusDamage: 1 };

  const queued: QueuedSlowAction = {
    figureId,
    action,
    slowBonus,
    queuedRound: roundNumber,
  };

  return {
    ...state,
    slowQueue: [...state.slowQueue, queued],
  };
}

/**
 * Cancel all slow actions for a defeated figure.
 * Called when a figure is defeated before end-of-round resolution.
 */
export function cancelSlowActionsForFigure(
  state: DualTimingState,
  figureId: string,
): DualTimingState {
  const cancelled = state.slowQueue.filter(q => q.figureId === figureId);
  if (cancelled.length === 0) return state;

  return {
    slowQueue: state.slowQueue.filter(q => q.figureId !== figureId),
    cancelledThisRound: [...state.cancelledThisRound, figureId],
  };
}

/**
 * Get all pending slow actions for resolution.
 * Only returns actions whose figures are still alive.
 */
export function getPendingSlowActions(
  state: DualTimingState,
  figures: Figure[],
): QueuedSlowAction[] {
  const aliveIds = new Set(
    figures.filter(f => !f.isDefeated).map(f => f.id),
  );

  return state.slowQueue.filter(q => aliveIds.has(q.figureId));
}

/**
 * Clear the slow queue after resolution (end of round).
 */
export function clearSlowQueue(state: DualTimingState): DualTimingState {
  return {
    slowQueue: [],
    cancelledThisRound: [],
  };
}

/**
 * Check whether an action can be used as a slow action.
 */
export function canBeSlowed(actionType: string): boolean {
  return actionType in DEFAULT_SLOW_BONUSES;
}

/**
 * Apply dual-timing state updates to a game state.
 * Queues a slow action if the subsystem is active.
 */
export function applySlowAction(
  gameState: GameState,
  figureId: string,
  action: GameAction,
): GameState {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.dualTiming || !si.dualTiming) {
    return gameState;
  }

  const updated = queueSlowAction(
    si.dualTiming,
    figureId,
    action,
    gameState.roundNumber,
  );

  return {
    ...gameState,
    spiritIsland: {
      ...si,
      dualTiming: updated,
    },
  };
}

/**
 * Handle figure defeat: cancel any pending slow actions.
 */
export function onFigureDefeated(
  gameState: GameState,
  figureId: string,
): GameState {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.dualTiming || !si.dualTiming) {
    return gameState;
  }

  const updated = cancelSlowActionsForFigure(si.dualTiming, figureId);

  return {
    ...gameState,
    spiritIsland: {
      ...si,
      dualTiming: updated,
    },
  };
}

/**
 * Resolve all pending slow actions at end of Activation phase.
 * Returns the updated state and the list of actions to execute (with bonuses).
 */
export function resolveSlowPhase(
  gameState: GameState,
): { gameState: GameState; actionsToExecute: QueuedSlowAction[] } {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.dualTiming || !si.dualTiming) {
    return { gameState, actionsToExecute: [] };
  }

  const pending = getPendingSlowActions(si.dualTiming, gameState.figures);
  const cleared = clearSlowQueue(si.dualTiming);

  return {
    gameState: {
      ...gameState,
      spiritIsland: {
        ...si,
        dualTiming: cleared,
      },
    },
    actionsToExecute: pending,
  };
}

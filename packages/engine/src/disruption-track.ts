/**
 * Spirit Island Subsystem #1: Disruption Track
 *
 * Accumulating disruption points shifts the terror level, which softens
 * victory conditions for the Operative side. Inspired by Spirit Island's
 * Fear/Terror system.
 *
 * Default thresholds: TL1=0, TL2=8, TL3=16
 * At higher terror levels, the mission win condition becomes easier
 * (e.g., "eliminate all" downgrades to "reach extraction").
 */

import type {
  DisruptionTrackState,
  DisruptionEvent,
  TerrorLevel,
  TieredVictoryCondition,
  GameState,
  Side,
} from './types.js';

import { DISRUPTION_VALUES } from './types.js';

/** Default disruption thresholds for terror level transitions */
const DEFAULT_THRESHOLDS: [number, number, number] = [0, 8, 16];

/**
 * Create initial disruption track state for a mission.
 *
 * @param tieredConditions Victory conditions at each terror level
 * @param thresholds Optional custom thresholds [TL1, TL2, TL3]
 */
export function initializeDisruptionTrack(
  tieredConditions: TieredVictoryCondition[] = [],
  thresholds: [number, number, number] = DEFAULT_THRESHOLDS,
): DisruptionTrackState {
  return {
    disruption: 0,
    thresholds,
    terrorLevel: 1,
    tieredConditions,
    eventLog: [],
  };
}

/**
 * Compute the terror level from a disruption point total.
 */
export function computeTerrorLevel(
  disruption: number,
  thresholds: [number, number, number],
): TerrorLevel {
  if (disruption >= thresholds[2]) return 3;
  if (disruption >= thresholds[1]) return 2;
  return 1;
}

/**
 * Add disruption points from a game event.
 * Returns the updated state (immutable).
 */
export function addDisruption(
  state: DisruptionTrackState,
  event: DisruptionEvent,
  round: number,
  source: string = event,
): DisruptionTrackState {
  const amount = DISRUPTION_VALUES[event];
  const newDisruption = state.disruption + amount;
  const newTerrorLevel = computeTerrorLevel(newDisruption, state.thresholds);

  return {
    ...state,
    disruption: newDisruption,
    terrorLevel: newTerrorLevel,
    eventLog: [
      ...state.eventLog,
      { round, source, amount },
    ],
  };
}

/**
 * Get the active victory conditions for the current terror level.
 * Falls back to base conditions if no tiered conditions exist for the level.
 */
export function getActiveVictoryConditions(
  state: DisruptionTrackState,
  baseConditions: Array<{ side: Side; description: string; condition: string; objectiveThreshold?: number }>,
): Array<{ side: Side; description: string; condition: string; objectiveThreshold?: number }> {
  // Find tiered conditions at or below current terror level (highest applicable wins)
  const tieredForLevel = state.tieredConditions
    .filter(tc => tc.terrorLevel <= state.terrorLevel)
    .sort((a, b) => b.terrorLevel - a.terrorLevel);

  if (tieredForLevel.length === 0) {
    return baseConditions;
  }

  // Group by side: use highest terror-level condition per side
  const bySide = new Map<Side, TieredVictoryCondition>();
  for (const tc of tieredForLevel) {
    if (!bySide.has(tc.side)) {
      bySide.set(tc.side, tc);
    }
  }

  // Merge: replace base conditions with tiered ones where available
  return baseConditions.map(base => {
    const tiered = bySide.get(base.side);
    if (tiered) {
      return {
        side: tiered.side,
        description: tiered.description,
        condition: tiered.condition,
        objectiveThreshold: tiered.objectiveThreshold,
      };
    }
    return base;
  });
}

/**
 * Check if the terror level just increased (for triggering UI notifications).
 */
export function didTerrorLevelIncrease(
  before: DisruptionTrackState,
  after: DisruptionTrackState,
): boolean {
  return after.terrorLevel > before.terrorLevel;
}

/**
 * Apply disruption track logic to a game state after a game event.
 * Only active when spiritIsland.subsystems.disruptionTrack is enabled.
 */
export function applyDisruptionEvent(
  gameState: GameState,
  event: DisruptionEvent,
  source?: string,
): GameState {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.disruptionTrack || !si.disruption) {
    return gameState;
  }

  const updated = addDisruption(si.disruption, event, gameState.roundNumber, source);

  return {
    ...gameState,
    spiritIsland: {
      ...si,
      disruption: updated,
    },
  };
}

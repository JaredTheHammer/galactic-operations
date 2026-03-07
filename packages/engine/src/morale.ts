/**
 * Morale System
 * Tracks and manages morale state for Imperial and Operative sides
 */

import type {
  MoraleTrack,
  MoraleState,
  Figure,
  ActionType,
} from './types.js';

/**
 * Morale thresholds on a 0-12 scale
 * - 6+: Steady
 * - 4-5: Shaken
 * - 1-3: Wavering
 * - 0: Broken
 */
const MORALE_THRESHOLDS = {
  STEADY: 6,
  SHAKEN: 4,
  WAVERING: 1,
  BROKEN: 0,
};

/**
 * Get the morale state based on the morale value
 * Returns the state category the morale track is in
 *
 * @param morale The morale track
 * @returns The current morale state (Steady, Shaken, Wavering, or Broken)
 */
export function getMoraleState(morale: MoraleTrack): MoraleState {
  const value = morale.value;

  if (value >= MORALE_THRESHOLDS.STEADY) {
    return 'Steady';
  } else if (value >= MORALE_THRESHOLDS.SHAKEN) {
    return 'Shaken';
  } else if (value >= MORALE_THRESHOLDS.WAVERING) {
    return 'Wavering';
  } else {
    return 'Broken';
  }
}

/**
 * Apply a morale change to the track
 * Clamps the value between 0 and max, and updates the state
 *
 * @param morale The current morale track
 * @param change The amount to change (can be negative)
 * @returns New morale track with updated value and state
 */
export function applyMoraleChange(
  morale: MoraleTrack,
  change: number
): MoraleTrack {
  const newValue = Math.max(0, Math.min(morale.max, morale.value + change));
  const newState = getMoraleState({ ...morale, value: newValue });

  return {
    ...morale,
    value: newValue,
    state: newState,
  };
}

/**
 * Check if a figure can perform an action given its team's morale state
 * Broken morale severely restricts actions: only Move and Rest are allowed
 *
 * @param figure The figure attempting the action
 * @param moraleState The morale state of the figure's side
 * @param actionType The type of action being attempted
 * @returns True if the figure can perform this action
 */
export function checkMoraleEffect(
  figure: Figure,
  moraleState: MoraleState,
  actionType: ActionType
): boolean {
  // If morale is Broken, only Move and Rest are allowed
  if (moraleState === 'Broken') {
    return (actionType as string) === 'Move' || (actionType as string) === 'Rest';
  }

  // All other morale states allow all actions
  return true;
}

/**
 * Get the morale change value for a specific game event
 * Different units and events have different impacts
 *
 * @param event The event type
 * @param side The side affected (Imperial or Operative)
 * @returns The morale change value (negative for losses, positive for wins)
 */
export function getMoraleChangeForEvent(
  event:
    | 'figureDefeated'
    | 'eliteDefeated'
    | 'heroDefeated'
    | 'villainDefeated'
    | 'objectiveLost'
    | 'objectiveWon',
  side: 'Imperial' | 'Operative'
): number {
  // Note: These values represent morale hits. Losses are negative.
  const moraleChanges: Record<string, number> = {
    figureDefeated: -1,
    eliteDefeated: -2,
    heroDefeated: -3,
    villainDefeated: 3, // Enemy Villain defeated
    objectiveLost: -2,
    objectiveWon: 2,
  };

  return moraleChanges[event] || 0;
}

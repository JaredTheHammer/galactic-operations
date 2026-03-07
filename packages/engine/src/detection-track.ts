/**
 * Detection Track System (Hunt/Corruption Analog)
 *
 * Inspired by War of the Ring's Hunt for the Ring mechanic.
 * In WotR, the Shadow player commits dice to hunt the Fellowship;
 * each Fellowship move risks corruption damage.
 *
 * In Galactic Operations, stealth missions have a Detection Track.
 * Operative actions within enemy awareness increase Detection.
 * Crossing thresholds triggers escalating consequences:
 * - Suspicious: enemy morale boost
 * - Alerted: bonus reinforcement wave
 * - Hunted: all enemies gain bonus dice, objective difficulty increases
 *
 * Operatives can "lay low" (WotR resting analog) to reduce Detection,
 * but this costs tempo -- just like resting in WotR heals corruption
 * but wastes turns the Fellowship could be moving.
 */

import type {
  DetectionTrack,
  DetectionLevel,
  DetectionThreshold,
  DetectionThresholdEffect,
  GameState,
  Figure,
} from './types.js';

// ============================================================================
// DETECTION TRACK CREATION
// ============================================================================

/** Default detection thresholds for standard stealth missions */
export const DEFAULT_DETECTION_THRESHOLDS: DetectionThreshold[] = [
  {
    level: 'Suspicious',
    threshold: 4,
    effect: { type: 'morale_penalty', value: -2 },
  },
  {
    level: 'Alerted',
    threshold: 8,
    effect: { type: 'reinforcement', count: 2, npcProfileId: 'stormtrooper' },
  },
  {
    level: 'Hunted',
    threshold: 12,
    effect: { type: 'alarm', bonusDifficulty: 1 },
  },
];

/**
 * Create a detection track for a stealth mission.
 * @param max        Maximum detection before mission auto-fails (default 16)
 * @param thresholds Custom thresholds, or use defaults
 */
export function createDetectionTrack(
  max: number = 16,
  thresholds: DetectionThreshold[] = DEFAULT_DETECTION_THRESHOLDS,
): DetectionTrack {
  return {
    current: 0,
    max,
    level: 'Undetected',
    thresholds: [...thresholds],
    isLayingLow: false,
    layLowReduction: 0,
  };
}

// ============================================================================
// DETECTION LEVEL RESOLUTION
// ============================================================================

/**
 * Determine the detection level from the current detection value.
 * Returns the highest threshold that has been crossed.
 */
export function resolveDetectionLevel(
  current: number,
  thresholds: DetectionThreshold[],
): DetectionLevel {
  // Sort thresholds descending by threshold value
  const sorted = [...thresholds].sort((a, b) => b.threshold - a.threshold);

  for (const t of sorted) {
    if (current >= t.threshold) {
      return t.level;
    }
  }

  return 'Undetected';
}

/**
 * Get all newly crossed thresholds when detection increases.
 * Returns thresholds that were just crossed (old < threshold <= new).
 */
export function getNewlyCrossedThresholds(
  oldValue: number,
  newValue: number,
  thresholds: DetectionThreshold[],
): DetectionThreshold[] {
  return thresholds.filter(
    t => oldValue < t.threshold && newValue >= t.threshold,
  );
}

// ============================================================================
// DETECTION CHANGES
// ============================================================================

/** Detection cost table for various operative actions */
export const DETECTION_COSTS: Record<string, number> = {
  /** Moving within enemy LOS */
  move_in_los: 1,
  /** Attacking (ranged -- loud) */
  ranged_attack: 2,
  /** Attacking (melee -- quieter) */
  melee_attack: 1,
  /** Using a skill check on an objective (slicing terminals, etc.) */
  interact_objective: 1,
  /** Collecting loot */
  collect_loot: 0,
  /** Failed skill check (botched hack, tripped alarm) */
  failed_skill_check: 2,
  /** Ally defeated (body discovered) */
  ally_defeated: 3,
  /** Triggering a despair on any roll */
  despair: 2,
};

/**
 * Increase detection on the track and return updated track + any newly crossed thresholds.
 */
export function increaseDetection(
  track: DetectionTrack,
  amount: number,
): { track: DetectionTrack; crossedThresholds: DetectionThreshold[] } {
  const oldValue = track.current;
  const newValue = Math.min(track.max, oldValue + amount);
  const newLevel = resolveDetectionLevel(newValue, track.thresholds);
  const crossedThresholds = getNewlyCrossedThresholds(oldValue, newValue, track.thresholds);

  return {
    track: {
      ...track,
      current: newValue,
      level: newLevel,
      isLayingLow: false, // any action breaks laying low
    },
    crossedThresholds,
  };
}

/**
 * Apply "laying low" for a round (WotR resting analog).
 * Reduces detection by 1 per round of laying low.
 * The operative side must spend their entire round doing nothing aggressive.
 */
export function applyLayLow(track: DetectionTrack): DetectionTrack {
  const newValue = Math.max(0, track.current - 1);
  const newLevel = resolveDetectionLevel(newValue, track.thresholds);

  return {
    ...track,
    current: newValue,
    level: newLevel,
    isLayingLow: true,
    layLowReduction: track.layLowReduction + 1,
  };
}

/**
 * Apply hunt dice from the Imperial command dice pool.
 * In WotR, Shadow allocates action dice to the Hunt Box.
 * Here, each hunt die allocated adds to detection when operatives act.
 *
 * @param track     Current detection track
 * @param huntDice  Number of command dice allocated to hunting
 * @param rollFn    Dice rolling function (hunt succeeds on 5-6, like WotR)
 * @returns Updated track with hunt results
 */
export function resolveHuntDice(
  track: DetectionTrack,
  huntDice: number,
  rollFn: () => number = () => Math.random(),
): { track: DetectionTrack; huntSuccesses: number; crossedThresholds: DetectionThreshold[] } {
  let huntSuccesses = 0;

  for (let i = 0; i < huntDice; i++) {
    const roll = Math.ceil(rollFn() * 6);
    if (roll >= 5) {
      huntSuccesses++;
    }
  }

  if (huntSuccesses === 0) {
    return { track, huntSuccesses: 0, crossedThresholds: [] };
  }

  const result = increaseDetection(track, huntSuccesses);
  return {
    track: result.track,
    huntSuccesses,
    crossedThresholds: result.crossedThresholds,
  };
}

/**
 * Check if detection has reached maximum (mission failure trigger).
 */
export function isFullyDetected(track: DetectionTrack): boolean {
  return track.current >= track.max;
}

/**
 * Determine detection increase for a game action.
 * Returns the detection cost based on action type and context.
 */
export function getDetectionCostForAction(
  actionType: string,
  isInEnemyLOS: boolean = false,
): number {
  // Actions only generate detection if in enemy awareness
  if (!isInEnemyLOS && actionType !== 'ally_defeated' && actionType !== 'despair') {
    return 0;
  }

  return DETECTION_COSTS[actionType] ?? 0;
}

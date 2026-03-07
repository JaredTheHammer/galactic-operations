/**
 * Command Dice System (Action Dice Allocation Analog)
 *
 * Inspired by War of the Ring's Action Dice mechanic. Each round, both sides
 * roll a pool of command dice. The faces rolled determine what types of actions
 * are available that round, forcing adaptation and strategic trade-offs.
 *
 * Key WotR parallels:
 * - Asymmetric pool sizes: Imperial gets more dice, Operatives get a Wild face
 * - Hunt allocation: Imperial can commit dice before rolling to boost detection tracking
 * - Face types gate action categories (Assault, Maneuver, Muster, Scheme, Command, Wild)
 * - Dice increase/decrease over the game as characters are gained/lost
 *
 * Design:
 * - Each die has 6 faces with a distribution biased by side
 * - Imperial dice: heavy on Assault/Muster (military focus)
 * - Operative dice: include Wild faces (flexibility advantage)
 * - Command faces: only usable to activate leader figures (premium)
 * - Scheme faces: play tactic cards for strategic effect (WotR Event cards)
 */

import type {
  CommandDieFace,
  CommandDie,
  CommandDicePool,
  CommandDiceState,
  Side,
  GameState,
} from './types.js';

// ============================================================================
// DICE FACE DISTRIBUTIONS
// ============================================================================

/**
 * Imperial command die: 6 faces
 * Biased toward Assault and Muster (military dominance)
 * No Wild faces (rigid command structure)
 */
export const IMPERIAL_DIE_FACES: CommandDieFace[] = [
  'Assault',    // 1
  'Assault',    // 2
  'Maneuver',   // 3
  'Muster',     // 4
  'Scheme',     // 5
  'Command',    // 6
];

/**
 * Operative command die: 6 faces
 * More balanced with a Wild face (adaptable insurgency)
 * Fewer Muster faces (smaller force, fewer reinforcements)
 */
export const OPERATIVE_DIE_FACES: CommandDieFace[] = [
  'Assault',    // 1
  'Maneuver',   // 2
  'Maneuver',   // 3
  'Scheme',     // 4
  'Command',    // 5
  'Wild',       // 6
];

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Create the starting command dice pool for a side.
 *
 * WotR parallel:
 * - Shadow starts with 7 dice, can grow to 10
 * - Free Peoples starts with 4, can grow to 6
 *
 * Here, Imperial starts with 5 dice, Operative starts with 3.
 * Additional dice can be gained from leaders entering play.
 */
export function createCommandDicePool(
  side: Side,
  bonusDice: number = 0,
): CommandDicePool {
  const baseDice = side === 'Imperial' ? 5 : 3;

  return {
    totalDice: baseDice + bonusDice,
    rolledFaces: [],
    usedIndices: [],
    huntAllocation: 0,
  };
}

/**
 * Create command dice state for both sides.
 */
export function createCommandDiceState(
  imperialBonusDice: number = 0,
  operativeBonusDice: number = 0,
): CommandDiceState {
  return {
    operative: createCommandDicePool('Operative', operativeBonusDice),
    imperial: createCommandDicePool('Imperial', imperialBonusDice),
  };
}

// ============================================================================
// HUNT ALLOCATION (Imperial Only)
// ============================================================================

/**
 * Allocate Imperial dice to the hunt before rolling.
 * These dice are removed from the action pool and used to pursue
 * the operatives on the detection track.
 *
 * WotR parallel: Shadow must commit dice to Hunt Box before rolling.
 * More hunt dice = better chance of catching the Fellowship,
 * but fewer action dice for military operations.
 *
 * @param pool     Imperial command dice pool
 * @param count    Number of dice to allocate to hunting (0 to totalDice)
 * @returns Updated pool with hunt allocation
 */
export function allocateHuntDice(
  pool: CommandDicePool,
  count: number,
): CommandDicePool {
  const clampedCount = Math.max(0, Math.min(count, pool.totalDice));
  return {
    ...pool,
    huntAllocation: clampedCount,
  };
}

// ============================================================================
// ROLLING
// ============================================================================

/**
 * Roll command dice for a side.
 * Dice allocated to hunting are excluded from the roll.
 *
 * @param pool    The side's command dice pool
 * @param side    Which side (determines die face distribution)
 * @param rollFn  RNG function returning [0,1)
 * @returns Updated pool with rolled faces
 */
export function rollCommandDice(
  pool: CommandDicePool,
  side: Side,
  rollFn: () => number = () => Math.random(),
): CommandDicePool {
  const dieFaces = side === 'Imperial' ? IMPERIAL_DIE_FACES : OPERATIVE_DIE_FACES;
  const diceToRoll = pool.totalDice - pool.huntAllocation;

  const rolledFaces: CommandDieFace[] = [];
  for (let i = 0; i < diceToRoll; i++) {
    const faceIndex = Math.floor(rollFn() * 6);
    rolledFaces.push(dieFaces[faceIndex]);
  }

  return {
    ...pool,
    rolledFaces,
    usedIndices: [],
  };
}

/**
 * Roll command dice for both sides at the start of a round.
 */
export function rollAllCommandDice(
  state: CommandDiceState,
  rollFn: () => number = () => Math.random(),
): CommandDiceState {
  return {
    operative: rollCommandDice(state.operative, 'Operative', rollFn),
    imperial: rollCommandDice(state.imperial, 'Imperial', rollFn),
  };
}

// ============================================================================
// DICE USAGE
// ============================================================================

/**
 * Check if a command die face can be used for a given action type.
 * Wild faces can substitute for any action.
 * Command faces can only be used to activate leader figures.
 */
export function canUseDieForAction(
  face: CommandDieFace,
  requiredFace: CommandDieFace,
): boolean {
  if (face === 'Wild') return true;
  if (face === requiredFace) return true;
  return false;
}

/**
 * Get the required command die face for a game action type.
 */
export function getRequiredFaceForAction(
  actionType: string,
  isLeader: boolean = false,
): CommandDieFace {
  // Leader figures can use Command dice for any action
  if (isLeader) return 'Command';

  switch (actionType) {
    case 'Attack':
      return 'Assault';
    case 'Move':
    case 'TakeCover':
    case 'StandUp':
      return 'Maneuver';
    case 'Muster':
    case 'Reinforce':
      return 'Muster';
    case 'PlayStrategicCard':
      return 'Scheme';
    default:
      // Most combat actions require Assault
      return 'Assault';
  }
}

/**
 * Find available (unused) dice indices that match a required face.
 */
export function findAvailableDice(
  pool: CommandDicePool,
  requiredFace: CommandDieFace,
): number[] {
  const available: number[] = [];

  for (let i = 0; i < pool.rolledFaces.length; i++) {
    if (pool.usedIndices.includes(i)) continue;
    if (canUseDieForAction(pool.rolledFaces[i], requiredFace)) {
      available.push(i);
    }
  }

  return available;
}

/**
 * Use a command die (mark it as spent for this round).
 * Returns updated pool, or null if the die index is invalid/already used.
 */
export function useCommandDie(
  pool: CommandDicePool,
  dieIndex: number,
): CommandDicePool | null {
  if (dieIndex < 0 || dieIndex >= pool.rolledFaces.length) return null;
  if (pool.usedIndices.includes(dieIndex)) return null;

  return {
    ...pool,
    usedIndices: [...pool.usedIndices, dieIndex],
  };
}

/**
 * Get remaining (unused) dice for a side.
 */
export function getRemainingDice(pool: CommandDicePool): CommandDieFace[] {
  return pool.rolledFaces.filter((_, i) => !pool.usedIndices.includes(i));
}

/**
 * Count remaining dice of a specific face type (including Wild).
 */
export function countAvailableFaces(
  pool: CommandDicePool,
  face: CommandDieFace,
): number {
  return findAvailableDice(pool, face).length;
}

/**
 * Check if a side has any remaining command dice this round.
 */
export function hasRemainingDice(pool: CommandDicePool): boolean {
  return pool.usedIndices.length < pool.rolledFaces.length;
}

// ============================================================================
// ROUND RESET
// ============================================================================

/**
 * Reset command dice pools for a new round.
 * Clears rolled faces and used indices. Hunt allocation is also reset.
 */
export function resetCommandDiceForRound(
  state: CommandDiceState,
): CommandDiceState {
  return {
    operative: {
      ...state.operative,
      rolledFaces: [],
      usedIndices: [],
      huntAllocation: 0,
    },
    imperial: {
      ...state.imperial,
      rolledFaces: [],
      usedIndices: [],
      huntAllocation: 0,
    },
  };
}

// ============================================================================
// BONUS DICE (from leaders entering play)
// ============================================================================

/**
 * Add bonus command dice for a side (e.g., when a leader character enters play).
 * In WotR, adding Gandalf/Aragorn gives the Free Peoples extra action dice.
 */
export function addBonusDice(
  pool: CommandDicePool,
  count: number,
): CommandDicePool {
  return {
    ...pool,
    totalDice: pool.totalDice + count,
  };
}

/**
 * Remove command dice for a side (e.g., when a leader is defeated).
 */
export function removeDice(
  pool: CommandDicePool,
  count: number,
): CommandDicePool {
  return {
    ...pool,
    totalDice: Math.max(1, pool.totalDice - count), // Always at least 1 die
  };
}

// ============================================================================
// AI HELPERS
// ============================================================================

/**
 * AI heuristic: decide how many dice to allocate to hunting.
 * Simple strategy based on detection track state and military needs.
 *
 * WotR parallel: Shadow must balance hunting the Fellowship vs. military operations.
 */
export function aiDecideHuntAllocation(
  pool: CommandDicePool,
  detectionCurrent: number,
  detectionMax: number,
  hasStealthMission: boolean,
): number {
  if (!hasStealthMission) return 0;

  // Don't allocate if we only have a few dice
  if (pool.totalDice <= 2) return 0;

  // Allocate more dice when detection is low (need to find them)
  const detectionRatio = detectionCurrent / detectionMax;

  if (detectionRatio < 0.25) {
    // Early game: commit 2 dice to hunting
    return Math.min(2, Math.floor(pool.totalDice * 0.4));
  } else if (detectionRatio < 0.5) {
    // Mid game: commit 1 die
    return 1;
  } else {
    // Late game: they're almost found, focus on military
    return 0;
  }
}

/**
 * AI selects which die to use for a desired action.
 * Prefers exact matches over Wild dice (save Wild for flexibility).
 */
export function aiSelectDie(
  pool: CommandDicePool,
  requiredFace: CommandDieFace,
): number | null {
  const available = findAvailableDice(pool, requiredFace);
  if (available.length === 0) return null;

  // Prefer exact match over Wild
  const exactMatch = available.find(i => pool.rolledFaces[i] === requiredFace);
  if (exactMatch !== undefined) return exactMatch;

  // Fall back to Wild
  return available[0];
}

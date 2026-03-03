/**
 * Galactic Operations v2 - Dice Engine
 *
 * Implements the Genesys-style d6 pool system with Yahtzee combo detection.
 *
 * Key concepts:
 * - Pool construction: max(characteristic, skill) dice, min(characteristic, skill) upgrades
 * - Four die types: Ability (green), Proficiency (yellow), Difficulty (purple), Challenge (red)
 * - Opposed resolution: successes cancel failures, advantages cancel threats
 * - Yahtzee combos: sets (pairs/trips/quads/quints) and runs (3/4/5 sequential)
 *   on raw face values of positive dice, with "gilded" bonus when yellow participates
 *
 * RNG is injectable for deterministic testing.
 */

import type {
  AttackPool,
  CoverType,
  D6DieDefinition,
  D6DieType,
  D6FaceDefinition,
  D6RollResult,
  DefensePool,
  OpposedRollResult,
  YahtzeeCombo,
  ComboType,
} from './types.js';

// ============================================================================
// RNG ABSTRACTION
// ============================================================================

/** Returns a random integer in [1, 6]. Injectable for testing. */
export type RollFn = () => number;

/** Default RNG using Math.random */
export const defaultRollFn: RollFn = () => Math.floor(Math.random() * 6) + 1;

// ============================================================================
// DICE DATA (loaded from JSON at runtime, but we also provide a hardcoded
// fallback matching dice-d6.json so the engine is self-contained for tests)
// ============================================================================

const ABILITY_FACES: D6FaceDefinition[] = [
  { face: 1, successes: 0, advantages: 0, triumphs: 0 },
  { face: 2, successes: 0, advantages: 0, triumphs: 0 },
  { face: 3, successes: 0, advantages: 0, triumphs: 0 },
  { face: 4, successes: 1, advantages: 0, triumphs: 0 },
  { face: 5, successes: 1, advantages: 0, triumphs: 0 },
  { face: 6, successes: 1, advantages: 1, triumphs: 0 },
];

const PROFICIENCY_FACES: D6FaceDefinition[] = [
  { face: 1, successes: 0, advantages: 0, triumphs: 0 },
  { face: 2, successes: 0, advantages: 0, triumphs: 0 },
  { face: 3, successes: 1, advantages: 0, triumphs: 0 },
  { face: 4, successes: 1, advantages: 0, triumphs: 0 },
  { face: 5, successes: 1, advantages: 0, triumphs: 0 },
  { face: 6, successes: 2, advantages: 0, triumphs: 1 },
];

const DIFFICULTY_FACES: D6FaceDefinition[] = [
  { face: 1, failures: 0, threats: 0, despairs: 0 },
  { face: 2, failures: 0, threats: 0, despairs: 0 },
  { face: 3, failures: 0, threats: 0, despairs: 0 },
  { face: 4, failures: 1, threats: 0, despairs: 0 },
  { face: 5, failures: 1, threats: 0, despairs: 0 },
  { face: 6, failures: 1, threats: 1, despairs: 0 },
];

const CHALLENGE_FACES: D6FaceDefinition[] = [
  { face: 1, failures: 0, threats: 0, despairs: 0 },
  { face: 2, failures: 0, threats: 0, despairs: 0 },
  { face: 3, failures: 1, threats: 0, despairs: 0 },
  { face: 4, failures: 1, threats: 0, despairs: 0 },
  { face: 5, failures: 1, threats: 0, despairs: 0 },
  { face: 6, failures: 2, threats: 0, despairs: 1 },
];

/** Hardcoded face tables keyed by die type */
export const FACE_TABLES: Record<D6DieType, D6FaceDefinition[]> = {
  ability: ABILITY_FACES,
  proficiency: PROFICIENCY_FACES,
  difficulty: DIFFICULTY_FACES,
  challenge: CHALLENGE_FACES,
};

// ============================================================================
// POOL CONSTRUCTION
// ============================================================================

/**
 * Build an attack pool from a characteristic value and skill rank.
 * Follows the Genesys upgrade mechanic:
 *   poolSize = max(characteristic, skillRank)
 *   upgrades = min(characteristic, skillRank)
 *   Start with poolSize Ability (green), upgrade `upgrades` to Proficiency (yellow).
 */
export function buildAttackPool(characteristic: number, skillRank: number): AttackPool {
  const poolSize = Math.max(characteristic, skillRank);
  const upgrades = Math.min(characteristic, skillRank);
  return {
    ability: poolSize - upgrades,
    proficiency: upgrades,
  };
}

/**
 * Build a defense pool from Agility and Coordination rank.
 * Same upgrade mechanic as attack but with Difficulty (purple) / Challenge (red).
 */
export function buildDefensePool(agility: number, coordinationRank: number): DefensePool {
  const poolSize = Math.max(agility, coordinationRank);
  const upgrades = Math.min(agility, coordinationRank);
  return {
    difficulty: poolSize - upgrades,
    challenge: upgrades,
  };
}

/**
 * Apply armor defense bonus as additional upgrades to a defense pool.
 * Each armor defense point upgrades one purple to red, or adds a purple if none left to upgrade.
 */
export function applyArmorDefense(pool: DefensePool, armorDefense: number): DefensePool {
  let { difficulty, challenge } = pool;
  for (let i = 0; i < armorDefense; i++) {
    if (difficulty > 0) {
      difficulty--;
      challenge++;
    } else {
      // No purple to upgrade; add a new purple
      difficulty++;
    }
  }
  return { difficulty, challenge };
}

/**
 * Apply cover modifier to a defense pool.
 * Light: +1 purple
 * Heavy: upgrade 1 purple to red (or +1 purple if none)
 */
export function applyCoverModifier(pool: DefensePool, cover: CoverType): DefensePool {
  let { difficulty, challenge } = pool;
  switch (cover) {
    case 'None':
      break;
    case 'Light':
      difficulty++;
      break;
    case 'Heavy':
      if (difficulty > 0) {
        difficulty--;
        challenge++;
      } else {
        difficulty++;
      }
      break;
    case 'Full':
      // Full cover blocks LOS; attack should not be permitted.
      // If somehow called, treat as Heavy + 1 purple.
      if (difficulty > 0) {
        difficulty--;
        challenge++;
      } else {
        difficulty++;
      }
      difficulty++;
      break;
  }
  return { difficulty, challenge };
}

/**
 * Apply elevation advantage (attacker is higher).
 * Downgrade 1 red to purple, or remove 1 purple.
 */
export function applyElevationAdvantage(pool: DefensePool): DefensePool {
  let { difficulty, challenge } = pool;
  if (challenge > 0) {
    challenge--;
    difficulty++;
  } else if (difficulty > 0) {
    difficulty--;
  }
  return { difficulty, challenge };
}

// ============================================================================
// ROLLING
// ============================================================================

/**
 * Roll a single d6 of the specified type.
 * Returns a D6RollResult with the raw face value and parsed symbols.
 */
export function rollSingleDie(dieType: D6DieType, rollFn: RollFn = defaultRollFn): D6RollResult {
  const faceValue = rollFn(); // 1-6
  const faceIndex = faceValue - 1;
  const faces = FACE_TABLES[dieType];
  const face = faces[faceIndex];

  return {
    dieType,
    faceValue,
    successes: face.successes ?? 0,
    failures: face.failures ?? 0,
    advantages: face.advantages ?? 0,
    threats: face.threats ?? 0,
    triumphs: face.triumphs ?? 0,
    despairs: face.despairs ?? 0,
  };
}

/**
 * Roll an attack pool (green + yellow dice).
 * Returns an array of D6RollResult.
 */
export function rollAttackPool(pool: AttackPool, rollFn: RollFn = defaultRollFn): D6RollResult[] {
  const results: D6RollResult[] = [];
  for (let i = 0; i < pool.ability; i++) {
    results.push(rollSingleDie('ability', rollFn));
  }
  for (let i = 0; i < pool.proficiency; i++) {
    results.push(rollSingleDie('proficiency', rollFn));
  }
  return results;
}

/**
 * Roll a defense pool (purple + red dice).
 * Returns an array of D6RollResult.
 */
export function rollDefensePool(pool: DefensePool, rollFn: RollFn = defaultRollFn): D6RollResult[] {
  const results: D6RollResult[] = [];
  for (let i = 0; i < pool.difficulty; i++) {
    results.push(rollSingleDie('difficulty', rollFn));
  }
  for (let i = 0; i < pool.challenge; i++) {
    results.push(rollSingleDie('challenge', rollFn));
  }
  return results;
}

// ============================================================================
// YAHTZEE COMBO DETECTION
// ============================================================================

/**
 * Detect all Yahtzee combos from the positive (attack) dice pool.
 *
 * Combos are checked on raw face values (1-6) regardless of whether those
 * faces generated successes. Only the highest-value combo of each category
 * (set or run) is returned to avoid double-counting.
 *
 * @param attackRolls The rolled attack dice results
 * @returns Array of detected combos, sorted by value (highest first)
 */
export function detectCombos(attackRolls: D6RollResult[]): YahtzeeCombo[] {
  if (attackRolls.length < 2) return [];

  const combos: YahtzeeCombo[] = [];

  // Build frequency map of face values
  const freq: Record<number, { count: number; hasYellow: boolean }> = {};
  for (const roll of attackRolls) {
    if (!freq[roll.faceValue]) {
      freq[roll.faceValue] = { count: 0, hasYellow: false };
    }
    freq[roll.faceValue].count++;
    if (roll.dieType === 'proficiency') {
      freq[roll.faceValue].hasYellow = true;
    }
  }

  // --- SETS (matching face values) ---
  // Find the best set (highest count). If there are multiple sets of the same
  // size, take the highest face value.
  const bestSet = detectBestSet(freq);
  if (bestSet) {
    combos.push(bestSet);
  }

  // --- RUNS (sequential face values) ---
  const bestRun = detectBestRun(freq, attackRolls);
  if (bestRun) {
    combos.push(bestRun);
  }

  return combos;
}

/**
 * Find the best set combo from the frequency map.
 * Returns at most one combo (the highest-count set; ties broken by face value).
 */
function detectBestSet(
  freq: Record<number, { count: number; hasYellow: boolean }>
): YahtzeeCombo | null {
  let bestFace = -1;
  let bestCount = 1; // need at least 2 for a pair

  for (const [faceStr, data] of Object.entries(freq)) {
    const face = Number(faceStr);
    if (data.count > bestCount || (data.count === bestCount && face > bestFace)) {
      bestCount = data.count;
      bestFace = face;
    }
  }

  if (bestCount < 2 || bestFace < 0) return null;

  const comboType: ComboType =
    bestCount >= 5 ? 'Quint' :
    bestCount === 4 ? 'Quad' :
    bestCount === 3 ? 'Trips' :
    'Pair';

  const faceValues = Array(bestCount).fill(bestFace);
  const isGilded = freq[bestFace].hasYellow;

  return { type: comboType, faceValues, isGilded };
}

/**
 * Find the best run combo from the frequency map.
 * A run requires consecutive face values each appearing at least once.
 * Returns the longest run; ties broken by highest starting value.
 *
 * Gilded if any die in the run's face values is yellow.
 */
function detectBestRun(
  freq: Record<number, { count: number; hasYellow: boolean }>,
  attackRolls: D6RollResult[]
): YahtzeeCombo | null {
  // Build sorted unique face values present
  const present = new Set<number>();
  for (const fv of Object.keys(freq)) {
    present.add(Number(fv));
  }

  // Find longest consecutive sequence
  let bestStart = -1;
  let bestLen = 0;
  let currentStart = -1;
  let currentLen = 0;

  for (let f = 1; f <= 6; f++) {
    if (present.has(f)) {
      if (currentLen === 0) {
        currentStart = f;
      }
      currentLen++;
      if (currentLen > bestLen) {
        bestLen = currentLen;
        bestStart = currentStart;
      }
    } else {
      currentLen = 0;
    }
  }

  if (bestLen < 3) return null;

  const comboType: ComboType =
    bestLen >= 5 ? 'FullRun' :
    bestLen === 4 ? 'LargeRun' :
    'SmallRun';

  const faceValues: number[] = [];
  const runEnd = comboType === 'SmallRun' ? bestStart + 2 :
                 comboType === 'LargeRun' ? bestStart + 3 :
                 bestStart + 4;

  for (let f = bestStart; f <= runEnd; f++) {
    faceValues.push(f);
  }

  // Check if any yellow die contributed a face value in the run range
  const runFaces = new Set(faceValues);
  const isGilded = attackRolls.some(
    r => r.dieType === 'proficiency' && runFaces.has(r.faceValue)
  );

  return { type: comboType, faceValues, isGilded };
}

// ============================================================================
// OPPOSED RESOLUTION
// ============================================================================

/**
 * Resolve an opposed check: roll attack and defense pools, cancel symbols,
 * detect combos on positive dice.
 */
export function resolveOpposedCheck(
  attackPool: AttackPool,
  defensePool: DefensePool,
  rollFn: RollFn = defaultRollFn
): OpposedRollResult {
  const attackRolls = rollAttackPool(attackPool, rollFn);
  const defenseRolls = rollDefensePool(defensePool, rollFn);

  return resolveFromRolls(attackRolls, defenseRolls);
}

/**
 * Resolve from pre-rolled dice (useful for testing with deterministic rolls).
 */
export function resolveFromRolls(
  attackRolls: D6RollResult[],
  defenseRolls: D6RollResult[]
): OpposedRollResult {
  // Tally attack symbols
  let totalSuccesses = 0;
  let totalAdvantages = 0;
  let totalTriumphs = 0;
  for (const r of attackRolls) {
    totalSuccesses += r.successes;
    totalAdvantages += r.advantages;
    totalTriumphs += r.triumphs;
  }

  // Tally defense symbols
  let totalFailures = 0;
  let totalThreats = 0;
  let totalDespairs = 0;
  for (const r of defenseRolls) {
    totalFailures += r.failures;
    totalThreats += r.threats;
    totalDespairs += r.despairs;
  }

  // Net results (cancel)
  const netSuccesses = totalSuccesses - totalFailures;
  const netAdvantages = totalAdvantages - totalThreats;
  const isHit = netSuccesses >= 1;

  // Yahtzee combos on positive dice only
  const combos = detectCombos(attackRolls);

  return {
    attackRolls,
    defenseRolls,
    totalSuccesses,
    totalFailures,
    totalAdvantages,
    totalThreats,
    totalTriumphs,
    totalDespairs,
    netSuccesses,
    netAdvantages,
    isHit,
    combos,
  };
}

// ============================================================================
// EXPECTED VALUE CALCULATIONS (for AI evaluation)
// ============================================================================

/**
 * Compute expected net successes for an attack pool vs a defense pool.
 * Uses the known expected values from the face tables.
 *
 * E[net] = (ability * 0.5 + proficiency * 0.833) - (difficulty * 0.5 + challenge * 0.833)
 */
export function expectedNetSuccesses(attack: AttackPool, defense: DefensePool): number {
  const eAttack = attack.ability * 0.5 + attack.proficiency * (5 / 6);
  const eDefense = defense.difficulty * 0.5 + defense.challenge * (5 / 6);
  return eAttack - eDefense;
}

/**
 * Compute P(hit) analytically (approximation for large pools using normal CDF).
 * For small pools, we can enumerate, but the normal approximation is sufficient
 * for AI evaluation.
 *
 * Each positive die contributes: E[s] and Var[s].
 * - Ability: E=0.5, Var = E[s^2] - E[s]^2 = 0.5 - 0.25 = 0.25
 * - Proficiency: E=5/6, Var = (1+1+1+4)/6 - (5/6)^2 = 7/6 - 25/36 = (42-25)/36 = 17/36
 *
 * Each negative die contributes: E[f] and Var[f].
 * - Difficulty: E=0.5, Var=0.25
 * - Challenge: E=5/6, Var=17/36
 *
 * Net = sum(positive) - sum(negative), Var(net) = Var(pos) + Var(neg) [independent]
 * P(hit) = P(net >= 1) ~ 1 - normalCDF((1 - E[net]) / sqrt(Var(net)))
 */
export function estimateHitProbability(attack: AttackPool, defense: DefensePool): number {
  const eMean = expectedNetSuccesses(attack, defense);

  const varAbility = 0.25;
  const varProficiency = 17 / 36;
  const varDifficulty = 0.25;
  const varChallenge = 17 / 36;

  const totalVariance =
    attack.ability * varAbility +
    attack.proficiency * varProficiency +
    defense.difficulty * varDifficulty +
    defense.challenge * varChallenge;

  if (totalVariance === 0) {
    // Degenerate: 0-die pools
    return eMean >= 1 ? 1 : 0;
  }

  const stddev = Math.sqrt(totalVariance);
  // P(net >= 1) = 1 - Phi((1 - eMean) / stddev)
  // We need net >= 1, so threshold is 0.5 (continuity correction for discrete)
  const z = (0.5 - eMean) / stddev;
  return 1 - normalCDF(z);
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun 26.2.17).
 * Maximum error: 7.5e-8.
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

// ============================================================================
// COMBO EFFECT LOOKUP
// ============================================================================

export interface ComboEffect {
  bonusDamage: number;
  pierce: number | 'all';
  conditions: string[];
  freeMove: number;
  strainRecovery: number;
  freeActions: number;
  special: string | null;
  /** Extra suppression tokens applied to defender (graduated suppression system) */
  suppressionTokens: number;
}

const EMPTY_EFFECT: ComboEffect = {
  bonusDamage: 0,
  pierce: 0,
  conditions: [],
  freeMove: 0,
  strainRecovery: 0,
  freeActions: 0,
  special: null,
  suppressionTokens: 0,
};

/**
 * Look up the mechanical effect of a Yahtzee combo.
 * Returns separate standard and gilded variants from the spec.
 */
export function getComboEffect(combo: YahtzeeCombo): ComboEffect {
  const { type, isGilded } = combo;

  switch (type) {
    case 'Pair':
      return isGilded
        ? { ...EMPTY_EFFECT, bonusDamage: 2, conditions: ['Bleeding'] }
        : { ...EMPTY_EFFECT, bonusDamage: 1 };

    case 'Trips':
      return isGilded
        ? { ...EMPTY_EFFECT, pierce: 'all' }
        : { ...EMPTY_EFFECT, pierce: 2 };

    case 'Quad':
      return isGilded
        ? { ...EMPTY_EFFECT, conditions: ['Stunned', 'Prone'] }
        : { ...EMPTY_EFFECT, suppressionTokens: 2 }; // +2 extra suppression tokens

    case 'Quint':
      return isGilded
        ? { ...EMPTY_EFFECT, special: 'force_willed_it' }
        : { ...EMPTY_EFFECT, special: 'legendary_refresh' };

    case 'SmallRun':
      return isGilded
        ? { ...EMPTY_EFFECT, freeMove: 4 }  // ignore difficult terrain
        : { ...EMPTY_EFFECT, freeMove: 2 };

    case 'LargeRun':
      return isGilded
        ? { ...EMPTY_EFFECT, strainRecovery: 4, conditions: [] }  // also removes 1 condition
        : { ...EMPTY_EFFECT, strainRecovery: 2 };

    case 'FullRun':
      return isGilded
        ? { ...EMPTY_EFFECT, freeActions: 2 }
        : { ...EMPTY_EFFECT, freeActions: 1 };

    default:
      return { ...EMPTY_EFFECT };
  }
}

/**
 * Aggregate combo effects from all detected combos.
 * Multiple combos stack (e.g. a pair AND a small run can fire simultaneously).
 */
export function aggregateComboEffects(combos: YahtzeeCombo[]): ComboEffect {
  const result: ComboEffect = { ...EMPTY_EFFECT, conditions: [] };

  for (const combo of combos) {
    const fx = getComboEffect(combo);
    result.bonusDamage += fx.bonusDamage;
    result.pierce = fx.pierce === 'all' ? 'all' :
      result.pierce === 'all' ? 'all' :
      (result.pierce as number) + (fx.pierce as number);
    result.conditions.push(...fx.conditions);
    result.freeMove += fx.freeMove;
    result.strainRecovery += fx.strainRecovery;
    result.freeActions += fx.freeActions;
    result.suppressionTokens += fx.suppressionTokens;
    if (fx.special) result.special = fx.special;
  }

  return result;
}

// ============================================================================
// UTILITY: FATE DIE (kept from v1, used for initiative tiebreakers etc.)
// ============================================================================

/** Roll a fate die (1-6) */
export function rollFateDie(rollFn: RollFn = defaultRollFn): number {
  return rollFn();
}

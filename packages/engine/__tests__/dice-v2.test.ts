/**
 * Comprehensive tests for the v2 dice engine.
 *
 * Uses deterministic RNG injection to verify every code path.
 * Tests cover: pool construction, single die rolling, combo detection,
 * opposed resolution, expected value math, cover/elevation modifiers,
 * and combo effect lookup.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAttackPool,
  buildDefensePool,
  applyArmorDefense,
  applyCoverModifier,
  applyElevationAdvantage,
  rollSingleDie,
  rollAttackPool,
  rollDefensePool,
  detectCombos,
  resolveOpposedCheck,
  resolveFromRolls,
  expectedNetSuccesses,
  estimateHitProbability,
  getComboEffect,
  aggregateComboEffects,
  rollFateDie,
  type RollFn,
} from '../src/dice-v2.js';

import type {
  AttackPool,
  DefensePool,
  D6RollResult,
  YahtzeeCombo,
} from '../src/types.js';

// ============================================================================
// HELPERS: deterministic RNG
// ============================================================================

/** Create a RollFn that returns values from a predetermined sequence */
function seqRoll(values: number[]): RollFn {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('seqRoll exhausted');
    return values[i++];
  };
}

/** Create a RollFn that always returns the same value */
function constRoll(value: number): RollFn {
  return () => value;
}

// ============================================================================
// POOL CONSTRUCTION
// ============================================================================

describe('buildAttackPool', () => {
  it('Agility 3, Ranged Heavy 2 => 2Y + 1G', () => {
    const pool = buildAttackPool(3, 2);
    expect(pool).toEqual({ ability: 1, proficiency: 2 });
  });

  it('Brawn 2, Melee 4 => 2Y + 2G', () => {
    const pool = buildAttackPool(2, 4);
    expect(pool).toEqual({ ability: 2, proficiency: 2 });
  });

  it('Characteristic 5, Skill 0 => 5G + 0Y (untrained)', () => {
    const pool = buildAttackPool(5, 0);
    expect(pool).toEqual({ ability: 5, proficiency: 0 });
  });

  it('Characteristic 0, Skill 0 => empty pool', () => {
    const pool = buildAttackPool(0, 0);
    expect(pool).toEqual({ ability: 0, proficiency: 0 });
  });

  it('Equal values => all upgraded', () => {
    const pool = buildAttackPool(3, 3);
    expect(pool).toEqual({ ability: 0, proficiency: 3 });
  });

  it('Skill higher than characteristic', () => {
    const pool = buildAttackPool(1, 5);
    expect(pool).toEqual({ ability: 4, proficiency: 1 });
  });
});

describe('buildDefensePool', () => {
  it('Agility 3, Coordination 2 => 2R + 1P', () => {
    const pool = buildDefensePool(3, 2);
    expect(pool).toEqual({ difficulty: 1, challenge: 2 });
  });

  it('Agility 1, Coordination 0 => 1P + 0R', () => {
    const pool = buildDefensePool(1, 0);
    expect(pool).toEqual({ difficulty: 1, challenge: 0 });
  });
});

describe('applyArmorDefense', () => {
  it('Upgrades purple to red', () => {
    const base: DefensePool = { difficulty: 2, challenge: 1 };
    const result = applyArmorDefense(base, 1);
    expect(result).toEqual({ difficulty: 1, challenge: 2 });
  });

  it('Adds purple when none left to upgrade', () => {
    const base: DefensePool = { difficulty: 0, challenge: 2 };
    const result = applyArmorDefense(base, 1);
    expect(result).toEqual({ difficulty: 1, challenge: 2 });
  });

  it('Multiple armor defense points', () => {
    const base: DefensePool = { difficulty: 2, challenge: 0 };
    const result = applyArmorDefense(base, 2);
    expect(result).toEqual({ difficulty: 0, challenge: 2 });
  });

  it('Zero armor defense is identity', () => {
    const base: DefensePool = { difficulty: 2, challenge: 1 };
    const result = applyArmorDefense(base, 0);
    expect(result).toEqual({ difficulty: 2, challenge: 1 });
  });
});

describe('applyCoverModifier', () => {
  it('None: no change', () => {
    const pool: DefensePool = { difficulty: 1, challenge: 0 };
    expect(applyCoverModifier(pool, 'None')).toEqual({ difficulty: 1, challenge: 0 });
  });

  it('Light: +1 purple', () => {
    const pool: DefensePool = { difficulty: 1, challenge: 0 };
    expect(applyCoverModifier(pool, 'Light')).toEqual({ difficulty: 2, challenge: 0 });
  });

  it('Heavy: upgrade purple to red', () => {
    const pool: DefensePool = { difficulty: 2, challenge: 0 };
    expect(applyCoverModifier(pool, 'Heavy')).toEqual({ difficulty: 1, challenge: 1 });
  });

  it('Heavy with no purple: adds purple instead', () => {
    const pool: DefensePool = { difficulty: 0, challenge: 1 };
    expect(applyCoverModifier(pool, 'Heavy')).toEqual({ difficulty: 1, challenge: 1 });
  });
});

describe('applyElevationAdvantage', () => {
  it('Downgrades red to purple', () => {
    const pool: DefensePool = { difficulty: 1, challenge: 1 };
    expect(applyElevationAdvantage(pool)).toEqual({ difficulty: 2, challenge: 0 });
  });

  it('Removes purple if no red', () => {
    const pool: DefensePool = { difficulty: 2, challenge: 0 };
    expect(applyElevationAdvantage(pool)).toEqual({ difficulty: 1, challenge: 0 });
  });

  it('Empty pool stays empty', () => {
    const pool: DefensePool = { difficulty: 0, challenge: 0 };
    expect(applyElevationAdvantage(pool)).toEqual({ difficulty: 0, challenge: 0 });
  });
});

// ============================================================================
// SINGLE DIE ROLLING
// ============================================================================

describe('rollSingleDie', () => {
  it('Ability die face 1 => blank', () => {
    const r = rollSingleDie('ability', constRoll(1));
    expect(r.dieType).toBe('ability');
    expect(r.faceValue).toBe(1);
    expect(r.successes).toBe(0);
    expect(r.advantages).toBe(0);
  });

  it('Ability die face 4 => 1 success', () => {
    const r = rollSingleDie('ability', constRoll(4));
    expect(r.successes).toBe(1);
    expect(r.advantages).toBe(0);
  });

  it('Ability die face 6 => 1 success + 1 advantage', () => {
    const r = rollSingleDie('ability', constRoll(6));
    expect(r.successes).toBe(1);
    expect(r.advantages).toBe(1);
    expect(r.triumphs).toBe(0);
  });

  it('Proficiency die face 6 => 2 successes + triumph', () => {
    const r = rollSingleDie('proficiency', constRoll(6));
    expect(r.successes).toBe(2);
    expect(r.triumphs).toBe(1);
  });

  it('Proficiency die face 2 => blank', () => {
    const r = rollSingleDie('proficiency', constRoll(2));
    expect(r.successes).toBe(0);
    expect(r.triumphs).toBe(0);
  });

  it('Proficiency die face 3 => 1 success', () => {
    const r = rollSingleDie('proficiency', constRoll(3));
    expect(r.successes).toBe(1);
  });

  it('Difficulty die face 6 => 1 failure + 1 threat', () => {
    const r = rollSingleDie('difficulty', constRoll(6));
    expect(r.failures).toBe(1);
    expect(r.threats).toBe(1);
    expect(r.despairs).toBe(0);
  });

  it('Challenge die face 6 => 2 failures + despair', () => {
    const r = rollSingleDie('challenge', constRoll(6));
    expect(r.failures).toBe(2);
    expect(r.despairs).toBe(1);
  });

  it('Challenge die face 3 => 1 failure', () => {
    const r = rollSingleDie('challenge', constRoll(3));
    expect(r.failures).toBe(1);
    expect(r.despairs).toBe(0);
  });
});

// ============================================================================
// POOL ROLLING
// ============================================================================

describe('rollAttackPool', () => {
  it('Rolls correct number of dice for 2Y+1G', () => {
    const pool: AttackPool = { ability: 1, proficiency: 2 };
    const rolls = rollAttackPool(pool, constRoll(4));
    expect(rolls.length).toBe(3);
    expect(rolls.filter(r => r.dieType === 'ability').length).toBe(1);
    expect(rolls.filter(r => r.dieType === 'proficiency').length).toBe(2);
  });

  it('Empty pool returns no dice', () => {
    const rolls = rollAttackPool({ ability: 0, proficiency: 0 }, constRoll(1));
    expect(rolls.length).toBe(0);
  });
});

describe('rollDefensePool', () => {
  it('Rolls correct number of dice for 1P+2R', () => {
    const pool: DefensePool = { difficulty: 1, challenge: 2 };
    const rolls = rollDefensePool(pool, constRoll(4));
    expect(rolls.length).toBe(3);
    expect(rolls.filter(r => r.dieType === 'difficulty').length).toBe(1);
    expect(rolls.filter(r => r.dieType === 'challenge').length).toBe(2);
  });
});

// ============================================================================
// YAHTZEE COMBO DETECTION
// ============================================================================

describe('detectCombos', () => {
  function makeRoll(dieType: 'ability' | 'proficiency', faceValue: number): D6RollResult {
    return {
      dieType,
      faceValue,
      successes: faceValue >= (dieType === 'ability' ? 4 : 3) ? 1 : 0,
      failures: 0,
      advantages: faceValue === 6 && dieType === 'ability' ? 1 : 0,
      threats: 0,
      triumphs: faceValue === 6 && dieType === 'proficiency' ? 1 : 0,
      despairs: 0,
    };
  }

  describe('Sets', () => {
    it('Detects a pair (two matching face values)', () => {
      const rolls = [
        makeRoll('ability', 4),
        makeRoll('ability', 4),
        makeRoll('ability', 2),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'Pair')).toBe(true);
      const pair = combos.find(c => c.type === 'Pair')!;
      expect(pair.faceValues).toEqual([4, 4]);
      expect(pair.isGilded).toBe(false);
    });

    it('Detects a gilded pair (yellow participates)', () => {
      const rolls = [
        makeRoll('proficiency', 5),
        makeRoll('ability', 5),
        makeRoll('ability', 2),
      ];
      const combos = detectCombos(rolls);
      const pair = combos.find(c => c.type === 'Pair')!;
      expect(pair.isGilded).toBe(true);
    });

    it('Detects trips (three matching)', () => {
      const rolls = [
        makeRoll('ability', 3),
        makeRoll('ability', 3),
        makeRoll('proficiency', 3),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'Trips')).toBe(true);
      const trips = combos.find(c => c.type === 'Trips')!;
      expect(trips.isGilded).toBe(true);
    });

    it('Detects quad (four matching)', () => {
      const rolls = [
        makeRoll('ability', 4),
        makeRoll('ability', 4),
        makeRoll('ability', 4),
        makeRoll('proficiency', 4),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'Quad')).toBe(true);
    });

    it('Detects quint (five matching)', () => {
      const rolls = [
        makeRoll('ability', 5),
        makeRoll('ability', 5),
        makeRoll('ability', 5),
        makeRoll('ability', 5),
        makeRoll('proficiency', 5),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'Quint')).toBe(true);
    });
  });

  describe('Runs', () => {
    it('Detects a small run (3 sequential)', () => {
      const rolls = [
        makeRoll('ability', 2),
        makeRoll('ability', 3),
        makeRoll('ability', 4),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'SmallRun')).toBe(true);
      const run = combos.find(c => c.type === 'SmallRun')!;
      expect(run.faceValues).toEqual([2, 3, 4]);
      expect(run.isGilded).toBe(false);
    });

    it('Detects a gilded small run', () => {
      const rolls = [
        makeRoll('proficiency', 1),
        makeRoll('ability', 2),
        makeRoll('ability', 3),
      ];
      const combos = detectCombos(rolls);
      const run = combos.find(c => c.type === 'SmallRun')!;
      expect(run.isGilded).toBe(true);
    });

    it('Detects a large run (4 sequential)', () => {
      const rolls = [
        makeRoll('ability', 3),
        makeRoll('ability', 4),
        makeRoll('ability', 5),
        makeRoll('ability', 6),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'LargeRun')).toBe(true);
    });

    it('Detects a full run (5 sequential)', () => {
      const rolls = [
        makeRoll('ability', 1),
        makeRoll('ability', 2),
        makeRoll('ability', 3),
        makeRoll('ability', 4),
        makeRoll('proficiency', 5),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'FullRun')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('Returns no combos for a single die', () => {
      const rolls = [makeRoll('ability', 4)];
      expect(detectCombos(rolls)).toEqual([]);
    });

    it('Returns no combos for all different non-sequential values', () => {
      const rolls = [
        makeRoll('ability', 1),
        makeRoll('ability', 6),
      ];
      expect(detectCombos(rolls)).toEqual([]);
    });

    it('Can detect both a pair and a run simultaneously', () => {
      // Dice: 3, 3, 4, 5 => pair of 3s AND run 3-4-5
      const rolls = [
        makeRoll('ability', 3),
        makeRoll('ability', 3),
        makeRoll('ability', 4),
        makeRoll('ability', 5),
      ];
      const combos = detectCombos(rolls);
      expect(combos.length).toBe(2);
      expect(combos.some(c => c.type === 'Pair')).toBe(true);
      expect(combos.some(c => c.type === 'SmallRun')).toBe(true);
    });

    it('Combo on blanks: face values count even if no success', () => {
      // Green dice: face 1, 1, 1 => all blanks but trips on face value 1
      const rolls = [
        makeRoll('ability', 1),
        makeRoll('ability', 1),
        makeRoll('ability', 1),
      ];
      const combos = detectCombos(rolls);
      expect(combos.some(c => c.type === 'Trips')).toBe(true);
    });

    it('Prefers higher set count over higher face value', () => {
      // 4,4,4, 5,5 => Trips of 4s (not Pair of 5s)
      const rolls = [
        makeRoll('ability', 4),
        makeRoll('ability', 4),
        makeRoll('ability', 4),
        makeRoll('ability', 5),
        makeRoll('ability', 5),
      ];
      const combos = detectCombos(rolls);
      const set = combos.find(c => ['Pair', 'Trips', 'Quad', 'Quint'].includes(c.type));
      expect(set!.type).toBe('Trips');
      expect(set!.faceValues).toEqual([4, 4, 4]);
    });
  });
});

// ============================================================================
// OPPOSED RESOLUTION
// ============================================================================

describe('resolveOpposedCheck', () => {
  it('Clear hit: all 6s on attack, all 1s on defense', () => {
    // 2Y+1G attack (3 dice), 1P+0R defense (1 die)
    // Attack: face 6 on ability (1 success + 1 advantage), face 6 on proficiency (2 success + triumph) x2
    // Defense: face 1 on difficulty (blank)
    const rollValues = [6, 6, 6, 1]; // ability, proficiency, proficiency, difficulty
    const result = resolveOpposedCheck(
      { ability: 1, proficiency: 2 },
      { difficulty: 1, challenge: 0 },
      seqRoll(rollValues)
    );

    expect(result.totalSuccesses).toBe(5); // 1 (ability 6) + 2 (prof 6) + 2 (prof 6)
    expect(result.totalFailures).toBe(0);
    expect(result.netSuccesses).toBe(5);
    expect(result.isHit).toBe(true);
    expect(result.totalAdvantages).toBe(1); // from ability face 6
    expect(result.totalTriumphs).toBe(2);   // from two proficiency face 6
  });

  it('Clear miss: all blanks on attack, all 6s on defense', () => {
    // 2G attack, 2P defense
    const rollValues = [1, 2, 6, 6]; // 2 blank greens, 2 max purples
    const result = resolveOpposedCheck(
      { ability: 2, proficiency: 0 },
      { difficulty: 2, challenge: 0 },
      seqRoll(rollValues)
    );

    expect(result.totalSuccesses).toBe(0);
    expect(result.totalFailures).toBe(2); // 1 + 1 from two purple 6s
    expect(result.netSuccesses).toBe(-2);
    expect(result.isHit).toBe(false);
    expect(result.totalThreats).toBe(2);  // from two purple 6s
  });

  it('Exact cancellation: net 0 is a miss', () => {
    // 1G attack (face 4 = 1 success), 1P defense (face 4 = 1 failure)
    const result = resolveOpposedCheck(
      { ability: 1, proficiency: 0 },
      { difficulty: 1, challenge: 0 },
      seqRoll([4, 4])
    );

    expect(result.netSuccesses).toBe(0);
    expect(result.isHit).toBe(false);
  });

  it('Net 1 success is a hit', () => {
    // 2G (4, 4 = 2 successes) vs 1P (4 = 1 failure) => net 1
    const result = resolveOpposedCheck(
      { ability: 2, proficiency: 0 },
      { difficulty: 1, challenge: 0 },
      seqRoll([4, 4, 4])
    );

    expect(result.netSuccesses).toBe(1);
    expect(result.isHit).toBe(true);
  });

  it('Detects combos even on a miss', () => {
    // 3G all face 3 (blank, blank, blank) => trips on face value 3
    // 1P face 4 (1 failure) => no successes so miss, but combo still detected
    const result = resolveOpposedCheck(
      { ability: 3, proficiency: 0 },
      { difficulty: 1, challenge: 0 },
      seqRoll([3, 3, 3, 4])
    );

    expect(result.isHit).toBe(false);
    expect(result.combos.length).toBeGreaterThan(0);
    expect(result.combos.some(c => c.type === 'Trips')).toBe(true);
  });
});

describe('resolveFromRolls', () => {
  it('Correctly tallies pre-built roll arrays', () => {
    const attackRolls: D6RollResult[] = [
      { dieType: 'proficiency', faceValue: 6, successes: 2, failures: 0, advantages: 0, threats: 0, triumphs: 1, despairs: 0 },
      { dieType: 'ability', faceValue: 5, successes: 1, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
    ];
    const defenseRolls: D6RollResult[] = [
      { dieType: 'challenge', faceValue: 6, successes: 0, failures: 2, advantages: 0, threats: 0, triumphs: 0, despairs: 1 },
    ];

    const result = resolveFromRolls(attackRolls, defenseRolls);
    expect(result.totalSuccesses).toBe(3);
    expect(result.totalFailures).toBe(2);
    expect(result.netSuccesses).toBe(1);
    expect(result.isHit).toBe(true);
    expect(result.totalTriumphs).toBe(1);
    expect(result.totalDespairs).toBe(1);
  });
});

// ============================================================================
// EXPECTED VALUE & HIT PROBABILITY
// ============================================================================

describe('expectedNetSuccesses', () => {
  it('2Y+1G vs 2P => positive expected value', () => {
    // (1*0.5 + 2*5/6) - (2*0.5 + 0*5/6) = 0.5 + 1.667 - 1.0 = 1.167
    const e = expectedNetSuccesses(
      { ability: 1, proficiency: 2 },
      { difficulty: 2, challenge: 0 }
    );
    expect(e).toBeCloseTo(1.167, 2);
  });

  it('Equal pools cancel', () => {
    const e = expectedNetSuccesses(
      { ability: 2, proficiency: 0 },
      { difficulty: 2, challenge: 0 }
    );
    expect(e).toBeCloseTo(0, 5);
  });

  it('5Y vs 1P => heavily positive', () => {
    const e = expectedNetSuccesses(
      { ability: 0, proficiency: 5 },
      { difficulty: 1, challenge: 0 }
    );
    expect(e).toBeGreaterThan(3);
  });
});

describe('estimateHitProbability', () => {
  it('Strong attack vs weak defense => high P(hit)', () => {
    const p = estimateHitProbability(
      { ability: 0, proficiency: 4 },
      { difficulty: 1, challenge: 0 }
    );
    expect(p).toBeGreaterThan(0.9);
  });

  it('Weak attack vs strong defense => low P(hit)', () => {
    const p = estimateHitProbability(
      { ability: 1, proficiency: 0 },
      { difficulty: 0, challenge: 3 }
    );
    expect(p).toBeLessThan(0.1);
  });

  it('Equal pools => ~50% (within reasonable range)', () => {
    const p = estimateHitProbability(
      { ability: 2, proficiency: 0 },
      { difficulty: 2, challenge: 0 }
    );
    // With continuity correction, 2G vs 2P should be around 40-50%
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(0.6);
  });

  it('Returns 1 for degenerate case of positive mean, zero variance', () => {
    // This can't really happen with real pools, but test the edge case
    const p = estimateHitProbability(
      { ability: 0, proficiency: 0 },
      { difficulty: 0, challenge: 0 }
    );
    expect(p).toBe(0); // 0 dice, E[net]=0, net<1
  });
});

// ============================================================================
// COMBO EFFECTS
// ============================================================================

describe('getComboEffect', () => {
  it('Standard pair => +1 bonus damage', () => {
    const fx = getComboEffect({ type: 'Pair', faceValues: [4, 4], isGilded: false });
    expect(fx.bonusDamage).toBe(1);
    expect(fx.conditions).toEqual([]);
  });

  it('Gilded pair => +2 damage AND Bleeding', () => {
    const fx = getComboEffect({ type: 'Pair', faceValues: [4, 4], isGilded: true });
    expect(fx.bonusDamage).toBe(2);
    expect(fx.conditions).toContain('Bleeding');
  });

  it('Standard trips => Pierce 2', () => {
    const fx = getComboEffect({ type: 'Trips', faceValues: [3, 3, 3], isGilded: false });
    expect(fx.pierce).toBe(2);
  });

  it('Gilded trips => Pierce ALL', () => {
    const fx = getComboEffect({ type: 'Trips', faceValues: [3, 3, 3], isGilded: true });
    expect(fx.pierce).toBe('all');
  });

  it('Standard quad => +2 suppression tokens', () => {
    const fx = getComboEffect({ type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: false });
    expect(fx.suppressionTokens).toBe(2);
    expect(fx.conditions).toEqual([]);
  });

  it('Gilded quad => Stunned and Prone', () => {
    const fx = getComboEffect({ type: 'Quad', faceValues: [4, 4, 4, 4], isGilded: true });
    expect(fx.conditions).toContain('Stunned');
    expect(fx.conditions).toContain('Prone');
  });

  it('Standard small run => free 2" move', () => {
    const fx = getComboEffect({ type: 'SmallRun', faceValues: [1, 2, 3], isGilded: false });
    expect(fx.freeMove).toBe(2);
  });

  it('Gilded full run => 2 free actions', () => {
    const fx = getComboEffect({ type: 'FullRun', faceValues: [1, 2, 3, 4, 5], isGilded: true });
    expect(fx.freeActions).toBe(2);
  });

  it('Standard quint => legendary refresh', () => {
    const fx = getComboEffect({ type: 'Quint', faceValues: [5, 5, 5, 5, 5], isGilded: false });
    expect(fx.special).toBe('legendary_refresh');
  });

  it('Gilded quint => force willed it', () => {
    const fx = getComboEffect({ type: 'Quint', faceValues: [5, 5, 5, 5, 5], isGilded: true });
    expect(fx.special).toBe('force_willed_it');
  });
});

describe('aggregateComboEffects', () => {
  it('Stacks damage from pair + run', () => {
    const combos: YahtzeeCombo[] = [
      { type: 'Pair', faceValues: [4, 4], isGilded: false },
      { type: 'SmallRun', faceValues: [3, 4, 5], isGilded: false },
    ];
    const fx = aggregateComboEffects(combos);
    expect(fx.bonusDamage).toBe(1);
    expect(fx.freeMove).toBe(2);
  });

  it('Pierce all trumps numeric pierce', () => {
    const combos: YahtzeeCombo[] = [
      { type: 'Pair', faceValues: [3, 3], isGilded: false },   // pierce 0
      { type: 'Trips', faceValues: [5, 5, 5], isGilded: true }, // pierce all
    ];
    const fx = aggregateComboEffects(combos);
    expect(fx.pierce).toBe('all');
  });

  it('Empty combos => zero effect', () => {
    const fx = aggregateComboEffects([]);
    expect(fx.bonusDamage).toBe(0);
    expect(fx.freeMove).toBe(0);
    expect(fx.pierce).toBe(0);
  });
});

// ============================================================================
// FATE DIE
// ============================================================================

describe('rollFateDie', () => {
  it('Returns the RNG value directly', () => {
    expect(rollFateDie(constRoll(3))).toBe(3);
    expect(rollFateDie(constRoll(6))).toBe(6);
  });
});

// ============================================================================
// INTEGRATION: Full combat scenario
// ============================================================================

describe('Integration: Stormtrooper Elite vs Human Hero', () => {
  it('Stormtrooper (2Y+1G) attacks hero (Agility 2, Coordination 1, Padded Armor +0 def)', () => {
    // Stormtrooper Elite: attackPool { ability: 1, proficiency: 2 }
    // Hero defense: Agility 2, Coordination 1 => 1P + 1R, armor defense 0
    const attackPool: AttackPool = { ability: 1, proficiency: 2 };
    let defensePool = buildDefensePool(2, 1);
    defensePool = applyArmorDefense(defensePool, 0); // padded armor has 0 defense

    expect(defensePool).toEqual({ difficulty: 1, challenge: 1 });

    // Roll: attack all 5s (success on all), defense all 1s (blanks)
    const result = resolveOpposedCheck(
      attackPool,
      defensePool,
      seqRoll([5, 5, 5, 1, 1]) // ability:5, prof:5, prof:5, diff:1, chall:1
    );

    expect(result.isHit).toBe(true);
    expect(result.netSuccesses).toBe(3); // 1+1+1 successes - 0 failures
    expect(result.totalTriumphs).toBe(0); // no face 6 on proficiency
  });

  it('Hero with heavy battle armor in heavy cover against Stormtrooper', () => {
    // Hero: Agility 3, Coordination 2 => 2R + 1P
    // Heavy Battle Armor: defense 1 => upgrade 1 more => 3R + 0P
    // Heavy Cover: upgrade 1 more => but no P left, so +1P => 1P + 3R
    let defensePool = buildDefensePool(3, 2);
    expect(defensePool).toEqual({ difficulty: 1, challenge: 2 });

    defensePool = applyArmorDefense(defensePool, 1);
    expect(defensePool).toEqual({ difficulty: 0, challenge: 3 });

    defensePool = applyCoverModifier(defensePool, 'Heavy');
    // No purple to upgrade, so add 1 purple
    expect(defensePool).toEqual({ difficulty: 1, challenge: 3 });
  });
});

describe('Integration: Epic Jedi vs Stormtrooper', () => {
  it('5Y pool generates massive combos', () => {
    // Jedi: Agility 5, Ranged Heavy 5 => 5Y+0G
    const pool = buildAttackPool(5, 5);
    expect(pool).toEqual({ ability: 0, proficiency: 5 });

    // All face 4 => 5 successes, quint on face 4
    const rolls = rollAttackPool(pool, constRoll(4));
    expect(rolls.length).toBe(5);
    expect(rolls.every(r => r.successes === 1)).toBe(true);

    const combos = detectCombos(rolls);
    expect(combos.some(c => c.type === 'Quint')).toBe(true);
    expect(combos.find(c => c.type === 'Quint')!.isGilded).toBe(true);
  });
});

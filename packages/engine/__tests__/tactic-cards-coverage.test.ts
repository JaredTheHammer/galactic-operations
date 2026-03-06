/**
 * tactic-cards-coverage.test.ts
 *
 * Additional coverage for tactic-cards.ts uncovered branches:
 * - Attacker Counter effect (cancels defender cards)
 * - ConvertMiss effect (converts failures to successes)
 * - Suppress effect (adds suppression tokens)
 * - Recover effect on defender cards
 * - AI card selection: attacker with Pierce when hit, defender with Block/Counter
 * - AI card selection: cost > 2 cards skipped, free cards always played
 * - AI selection limits to 2 cards max
 */

import { describe, it, expect } from 'vitest';
import {
  applyTacticCards,
  aiSelectTacticCards,
} from '../src/tactic-cards.js';
import type {
  GameData,
  TacticCard,
  TacticDeckState,
  OpposedRollResult,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeCard(overrides: Partial<TacticCard> & { id: string }): TacticCard {
  return {
    name: overrides.id,
    timing: 'Attack',
    side: 'Universal',
    effects: [],
    text: 'Test card',
    cost: 0,
    ...overrides,
  };
}

function makeRollResult(overrides: Partial<OpposedRollResult> = {}): OpposedRollResult {
  return {
    totalSuccesses: 3,
    totalFailures: 2,
    netSuccesses: 1,
    successes: 3,
    failures: 2,
    advantages: 0,
    threats: 0,
    triumphs: 0,
    despairs: 0,
    netAdvantages: 0,
    isHit: true,
    attackRolls: [],
    defenseRolls: [],
    combos: [],
    ...overrides,
  };
}

function makeGameData(cards: TacticCard[]): GameData {
  const tacticCards: Record<string, TacticCard> = {};
  for (const c of cards) {
    tacticCards[c.id] = c;
  }
  return {
    dice: {},
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: {},
    consumables: {},
    tacticCards,
  } as GameData;
}

function makeDeck(
  operativeHand: string[],
  imperialHand: string[],
): TacticDeckState {
  return {
    drawPile: [],
    discardPile: [],
    operativeHand,
    imperialHand,
  };
}

// ============================================================================
// applyTacticCards - Attacker Counter effect
// ============================================================================

describe('applyTacticCards - Attacker Counter cancels defender cards', () => {
  it('attacker Counter effect removes defender cards', () => {
    const attackerCard = makeCard({
      id: 'atk-counter',
      effects: [{ type: 'Counter', value: 1 }],
    });
    const defenderCard = makeCard({
      id: 'def-block',
      timing: 'Defense',
      effects: [{ type: 'AddBlock', value: 2 }],
    });

    const roll = makeRollResult({ netSuccesses: 3 });
    const result = applyTacticCards(roll, [attackerCard], [defenderCard]);

    // Defender card should be countered
    expect(result.counteredCardIds).toContain('def-block');
    // netSuccesses should NOT be reduced by the block since it was countered
    expect(result.rollResult.netSuccesses).toBe(3);
  });

  it('attacker Counter cancels multiple defender cards', () => {
    const attackerCard = makeCard({
      id: 'atk-counter-2',
      effects: [{ type: 'Counter', value: 2 }],
    });
    const defCard1 = makeCard({
      id: 'def-1',
      timing: 'Defense',
      effects: [{ type: 'AddBlock', value: 1 }],
    });
    const defCard2 = makeCard({
      id: 'def-2',
      timing: 'Defense',
      effects: [{ type: 'AddBlock', value: 1 }],
    });

    const roll = makeRollResult({ netSuccesses: 3 });
    const result = applyTacticCards(roll, [attackerCard], [defCard1, defCard2]);

    expect(result.counteredCardIds).toContain('def-1');
    expect(result.counteredCardIds).toContain('def-2');
    expect(result.rollResult.netSuccesses).toBe(3); // no blocks applied
  });
});

// ============================================================================
// applyTacticCards - ConvertMiss and Suppress effects
// ============================================================================

describe('applyTacticCards - ConvertMiss effect', () => {
  it('converts failures to successes (bounded by available failures)', () => {
    const card = makeCard({
      id: 'convert-miss',
      effects: [{ type: 'ConvertMiss', value: 2 }],
    });

    const roll = makeRollResult({
      totalSuccesses: 2,
      totalFailures: 3,
      netSuccesses: -1,
    });

    const result = applyTacticCards(roll, [card], []);

    // 2 failures converted: totalFailures 3->1, totalSuccesses 2->4, netSuccesses -1 + 2*2 = 3
    expect(result.rollResult.totalFailures).toBe(1);
    expect(result.rollResult.totalSuccesses).toBe(4);
    expect(result.rollResult.netSuccesses).toBe(3);
  });

  it('ConvertMiss bounded by available failures', () => {
    const card = makeCard({
      id: 'convert-miss',
      effects: [{ type: 'ConvertMiss', value: 5 }],
    });

    const roll = makeRollResult({
      totalSuccesses: 1,
      totalFailures: 2,
      netSuccesses: -1,
    });

    const result = applyTacticCards(roll, [card], []);

    // Only 2 failures available to convert
    expect(result.rollResult.totalFailures).toBe(0);
    expect(result.rollResult.totalSuccesses).toBe(3);
    expect(result.rollResult.netSuccesses).toBe(3); // -1 + 2*2 = 3
  });
});

describe('applyTacticCards - Suppress effect', () => {
  it('accumulates suppression from tactic cards', () => {
    const card = makeCard({
      id: 'suppress',
      effects: [{ type: 'Suppress', value: 2 }],
    });

    const roll = makeRollResult();
    const result = applyTacticCards(roll, [card], []);
    expect(result.tacticSuppression).toBe(2);
  });
});

describe('applyTacticCards - Recover effect on defender', () => {
  it('accumulates recovery from defender cards', () => {
    const card = makeCard({
      id: 'recover',
      timing: 'Defense',
      effects: [{ type: 'Recover', value: 3 }],
    });

    const roll = makeRollResult();
    const result = applyTacticCards(roll, [], [card]);
    expect(result.tacticRecover).toBe(3);
  });
});

// ============================================================================
// aiSelectTacticCards - Various selection branches
// ============================================================================

describe('aiSelectTacticCards', () => {
  it('always plays free (cost 0) cards', () => {
    const freeCard = makeCard({
      id: 'free-card',
      cost: 0,
      timing: 'Attack',
      side: 'Universal',
      effects: [{ type: 'AddHit', value: 1 }],
    });
    const gd = makeGameData([freeCard]);
    const deck = makeDeck([], ['free-card']);

    const roll = makeRollResult({ netSuccesses: 5, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'attacker', roll);

    expect(selected).toContain('free-card');
  });

  it('plays cost attack cards when netSuccesses <= 2 and card has AddHit', () => {
    const costCard = makeCard({
      id: 'cost-addhit',
      cost: 1,
      timing: 'Attack',
      side: 'Universal',
      effects: [{ type: 'AddHit', value: 2 }],
    });
    const gd = makeGameData([costCard]);
    const deck = makeDeck(['cost-addhit'], []);

    const roll = makeRollResult({ netSuccesses: 1, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Operative', 'attacker', roll);

    expect(selected).toContain('cost-addhit');
  });

  it('plays Pierce cards when hit and cost <= 2', () => {
    const pierceCard = makeCard({
      id: 'pierce-card',
      cost: 2,
      timing: 'Attack',
      side: 'Universal',
      effects: [{ type: 'Pierce', value: 2 }],
    });
    const gd = makeGameData([pierceCard]);
    const deck = makeDeck([], ['pierce-card']);

    const roll = makeRollResult({ netSuccesses: 3, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'attacker', roll);

    expect(selected).toContain('pierce-card');
  });

  it('skips cost > 2 attack cards', () => {
    const expensiveCard = makeCard({
      id: 'expensive',
      cost: 3,
      timing: 'Attack',
      side: 'Universal',
      effects: [{ type: 'AddHit', value: 5 }],
    });
    const gd = makeGameData([expensiveCard]);
    const deck = makeDeck([], ['expensive']);

    const roll = makeRollResult({ netSuccesses: 0, isHit: false });
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'attacker', roll);

    expect(selected).not.toContain('expensive');
  });

  it('plays defender Block cards when in danger (netSuccesses >= 2)', () => {
    const blockCard = makeCard({
      id: 'block-card',
      cost: 1,
      timing: 'Defense',
      side: 'Universal',
      effects: [{ type: 'AddBlock', value: 2 }],
    });
    const gd = makeGameData([blockCard]);
    const deck = makeDeck(['block-card'], []);

    const roll = makeRollResult({ netSuccesses: 3, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Operative', 'defender', roll);

    expect(selected).toContain('block-card');
  });

  it('plays defender Counter cards when in danger', () => {
    const counterCard = makeCard({
      id: 'counter-card',
      cost: 1,
      timing: 'Any',
      side: 'Universal',
      effects: [{ type: 'Counter', value: 1 }],
    });
    const gd = makeGameData([counterCard]);
    const deck = makeDeck([], ['counter-card']);

    const roll = makeRollResult({ netSuccesses: 4, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'defender', roll);

    expect(selected).toContain('counter-card');
  });

  it('does not play defender cards when not in danger (netSuccesses < 2)', () => {
    const blockCard = makeCard({
      id: 'block-safe',
      cost: 1,
      timing: 'Defense',
      side: 'Universal',
      effects: [{ type: 'AddBlock', value: 1 }],
    });
    const gd = makeGameData([blockCard]);
    const deck = makeDeck([], ['block-safe']);

    const roll = makeRollResult({ netSuccesses: 1, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'defender', roll);

    expect(selected).not.toContain('block-safe');
  });

  it('limits selection to 2 cards maximum', () => {
    const cards = [
      makeCard({ id: 'free-1', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
      makeCard({ id: 'free-2', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
      makeCard({ id: 'free-3', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
    ];
    const gd = makeGameData(cards);
    const deck = makeDeck(['free-1', 'free-2', 'free-3'], []);

    const roll = makeRollResult({ netSuccesses: 1, isHit: true });
    const selected = aiSelectTacticCards(deck, gd, 'Operative', 'attacker', roll);

    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array when no playable cards', () => {
    const gd = makeGameData([]);
    const deck = makeDeck([], []);

    const roll = makeRollResult();
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'attacker', roll);

    expect(selected).toEqual([]);
  });

  it('plays ConvertMiss cards when netSuccesses <= 0', () => {
    const convertCard = makeCard({
      id: 'convert',
      cost: 1,
      timing: 'Attack',
      side: 'Universal',
      effects: [{ type: 'ConvertMiss', value: 2 }],
    });
    const gd = makeGameData([convertCard]);
    const deck = makeDeck([], ['convert']);

    const roll = makeRollResult({ netSuccesses: 0, isHit: false });
    const selected = aiSelectTacticCards(deck, gd, 'Imperial', 'attacker', roll);

    expect(selected).toContain('convert');
  });
});

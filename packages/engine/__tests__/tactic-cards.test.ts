/**
 * Tests for the Tactic Card Engine (Phase 19)
 *
 * Covers deck management, combat effect application, and AI card selection.
 */

import { describe, it, expect } from 'vitest';
import {
  initializeTacticDeck,
  drawCards,
  drawCardsForBothSides,
  playCard,
  canPlayCard,
  getPlayableCards,
  applyTacticCards,
  aiSelectTacticCards,
} from '../src/tactic-cards.js';
import type {
  GameData,
  TacticCard,
  TacticDeckState,
  OpposedRollResult,
  Side,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

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

// Deterministic RNG for shuffling
function fixedRng(): () => number {
  let i = 0;
  return () => {
    i = (i + 1) % 100;
    return i / 100;
  };
}

// ============================================================================
// DECK MANAGEMENT
// ============================================================================

describe('Tactic Card Deck Management', () => {
  const cards = [
    makeCard({ id: 'c1' }),
    makeCard({ id: 'c2' }),
    makeCard({ id: 'c3' }),
    makeCard({ id: 'c4' }),
    makeCard({ id: 'c5' }),
    makeCard({ id: 'c6' }),
    makeCard({ id: 'c7' }),
    makeCard({ id: 'c8' }),
    makeCard({ id: 'c9' }),
    makeCard({ id: 'c10' }),
  ];

  it('initializes deck with 3 cards per side', () => {
    const gameData = makeGameData(cards);
    const deck = initializeTacticDeck(gameData, fixedRng());

    expect(deck.operativeHand.length).toBe(3);
    expect(deck.imperialHand.length).toBe(3);
    expect(deck.discardPile.length).toBe(0);
    // 10 cards total - 6 dealt = 4 remaining
    expect(deck.drawPile.length).toBe(4);
  });

  it('draws cards for a side', () => {
    const gameData = makeGameData(cards);
    const deck = initializeTacticDeck(gameData, fixedRng());
    const initialHandSize = deck.operativeHand.length;

    const updated = drawCards(deck, 'Operative', 1, fixedRng());
    expect(updated.operativeHand.length).toBe(initialHandSize + 1);
    expect(updated.drawPile.length).toBe(deck.drawPile.length - 1);
    // Imperial hand unchanged
    expect(updated.imperialHand.length).toBe(deck.imperialHand.length);
  });

  it('respects max hand size of 6', () => {
    const gameData = makeGameData(cards);
    const deck = initializeTacticDeck(gameData, fixedRng());

    // Draw until max
    let updated = drawCards(deck, 'Operative', 10, fixedRng());
    expect(updated.operativeHand.length).toBeLessThanOrEqual(6);
  });

  it('reshuffles discard pile when draw pile is empty', () => {
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: ['c1', 'c2', 'c3'],
      operativeHand: ['c4'],
      imperialHand: ['c5'],
    };

    const updated = drawCards(deck, 'Operative', 1, fixedRng());
    expect(updated.operativeHand.length).toBe(2);
    // Discard pile should be empty after reshuffle
    expect(updated.discardPile.length).toBe(0);
    // Draw pile should have remaining reshuffled cards
    expect(updated.drawPile.length).toBe(2);
  });

  it('draws for both sides', () => {
    const gameData = makeGameData(cards);
    const deck = initializeTacticDeck(gameData, fixedRng());

    const updated = drawCardsForBothSides(deck, 1, fixedRng());
    expect(updated.operativeHand.length).toBe(deck.operativeHand.length + 1);
    expect(updated.imperialHand.length).toBe(deck.imperialHand.length + 1);
  });

  it('plays a card from hand to discard', () => {
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['c1', 'c2', 'c3'],
      imperialHand: ['c4', 'c5'],
    };

    const updated = playCard(deck, 'Operative', 'c2');
    expect(updated).not.toBeNull();
    expect(updated!.operativeHand).toEqual(['c1', 'c3']);
    expect(updated!.discardPile).toEqual(['c2']);
    expect(updated!.imperialHand).toEqual(['c4', 'c5']);
  });

  it('returns null when playing a card not in hand', () => {
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['c1'],
      imperialHand: [],
    };

    expect(playCard(deck, 'Operative', 'c99')).toBeNull();
  });
});

// ============================================================================
// CARD PLAYABILITY
// ============================================================================

describe('Card Playability', () => {
  it('allows Attack cards for attackers', () => {
    const card = makeCard({ id: 'atk', timing: 'Attack', side: 'Universal' });
    expect(canPlayCard(card, 'Operative', 'attacker')).toBe(true);
    expect(canPlayCard(card, 'Operative', 'defender')).toBe(false);
  });

  it('allows Defense cards for defenders', () => {
    const card = makeCard({ id: 'def', timing: 'Defense', side: 'Universal' });
    expect(canPlayCard(card, 'Imperial', 'defender')).toBe(true);
    expect(canPlayCard(card, 'Imperial', 'attacker')).toBe(false);
  });

  it('allows Any timing for both roles', () => {
    const card = makeCard({ id: 'any', timing: 'Any', side: 'Universal' });
    expect(canPlayCard(card, 'Operative', 'attacker')).toBe(true);
    expect(canPlayCard(card, 'Operative', 'defender')).toBe(true);
  });

  it('restricts side-specific cards', () => {
    const opCard = makeCard({ id: 'op', timing: 'Attack', side: 'Operative' });
    expect(canPlayCard(opCard, 'Operative', 'attacker')).toBe(true);
    expect(canPlayCard(opCard, 'Imperial', 'attacker')).toBe(false);

    const impCard = makeCard({ id: 'imp', timing: 'Defense', side: 'Imperial' });
    expect(canPlayCard(impCard, 'Imperial', 'defender')).toBe(true);
    expect(canPlayCard(impCard, 'Operative', 'defender')).toBe(false);
  });

  it('getPlayableCards filters correctly', () => {
    const cards = [
      makeCard({ id: 'atk1', timing: 'Attack', side: 'Universal' }),
      makeCard({ id: 'def1', timing: 'Defense', side: 'Universal' }),
      makeCard({ id: 'any1', timing: 'Any', side: 'Universal' }),
      makeCard({ id: 'imp-only', timing: 'Attack', side: 'Imperial' }),
    ];
    const gameData = makeGameData(cards);
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['atk1', 'def1', 'any1', 'imp-only'],
      imperialHand: [],
    };

    const playable = getPlayableCards(deck, gameData, 'Operative', 'attacker');
    expect(playable.map(c => c.id)).toEqual(['atk1', 'any1']);
  });
});

// ============================================================================
// COMBAT EFFECT APPLICATION
// ============================================================================

describe('Tactic Card Combat Effects', () => {
  it('AddHit increases netSuccesses', () => {
    const roll = makeRollResult({ netSuccesses: 1, totalSuccesses: 3 });
    const attackerCards = [makeCard({
      id: 'hit1',
      effects: [{ type: 'AddHit', value: 2 }],
    })];

    const result = applyTacticCards(roll, attackerCards, []);
    expect(result.rollResult.netSuccesses).toBe(3);
    expect(result.rollResult.totalSuccesses).toBe(5);
  });

  it('AddBlock reduces netSuccesses', () => {
    const roll = makeRollResult({ netSuccesses: 3, totalFailures: 2 });
    const defenderCards = [makeCard({
      id: 'block1',
      timing: 'Defense',
      effects: [{ type: 'AddBlock', value: 2 }],
    })];

    const result = applyTacticCards(roll, [], defenderCards);
    expect(result.rollResult.netSuccesses).toBe(1);
    expect(result.rollResult.totalFailures).toBe(4);
  });

  it('Pierce is tracked separately', () => {
    const roll = makeRollResult();
    const attackerCards = [makeCard({
      id: 'pierce1',
      effects: [{ type: 'Pierce', value: 3 }],
    })];

    const result = applyTacticCards(roll, attackerCards, []);
    expect(result.tacticPierce).toBe(3);
  });

  it('ConvertMiss converts failures to successes', () => {
    const roll = makeRollResult({ netSuccesses: 0, totalSuccesses: 2, totalFailures: 3 });
    const attackerCards = [makeCard({
      id: 'convert1',
      effects: [{ type: 'ConvertMiss', value: 2 }],
    })];

    const result = applyTacticCards(roll, attackerCards, []);
    expect(result.rollResult.totalFailures).toBe(1);
    expect(result.rollResult.totalSuccesses).toBe(4);
    expect(result.rollResult.netSuccesses).toBe(4); // 0 + 2*2
  });

  it('Suppress adds suppression tokens', () => {
    const roll = makeRollResult();
    const attackerCards = [makeCard({
      id: 'sup1',
      effects: [{ type: 'Suppress', value: 1 }],
    })];

    const result = applyTacticCards(roll, attackerCards, []);
    expect(result.tacticSuppression).toBe(1);
  });

  it('Recover tracks healing', () => {
    const roll = makeRollResult();
    const defenderCards = [makeCard({
      id: 'heal1',
      timing: 'Defense',
      effects: [{ type: 'Recover', value: 2 }],
    })];

    const result = applyTacticCards(roll, [], defenderCards);
    expect(result.tacticRecover).toBe(2);
  });

  it('Counter cancels opponent cards', () => {
    const roll = makeRollResult({ netSuccesses: 1 });
    const attackerCards = [
      makeCard({ id: 'atk-hit', effects: [{ type: 'AddHit', value: 3 }] }),
    ];
    const defenderCards = [
      makeCard({ id: 'counter1', timing: 'Defense', effects: [{ type: 'Counter', value: 1 }] }),
    ];

    const result = applyTacticCards(roll, attackerCards, defenderCards);
    // Counter should cancel the attacker card, so no AddHit effect
    expect(result.rollResult.netSuccesses).toBe(1);
    expect(result.counteredCardIds).toContain('atk-hit');
  });

  it('updates isHit based on modified netSuccesses', () => {
    const roll = makeRollResult({ netSuccesses: 1, isHit: true, totalFailures: 0 });
    const defenderCards = [makeCard({
      id: 'big-block',
      timing: 'Defense',
      effects: [{ type: 'AddBlock', value: 3 }],
    })];

    const result = applyTacticCards(roll, [], defenderCards);
    expect(result.rollResult.netSuccesses).toBe(-2);
    expect(result.rollResult.isHit).toBe(false);
  });
});

// ============================================================================
// AI CARD SELECTION
// ============================================================================

describe('AI Tactic Card Selection', () => {
  it('selects free attack cards when attacking', () => {
    const cards = [
      makeCard({ id: 'free-hit', timing: 'Attack', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
      makeCard({ id: 'def-card', timing: 'Defense', cost: 0, effects: [{ type: 'AddBlock', value: 1 }] }),
    ];
    const gameData = makeGameData(cards);
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['free-hit', 'def-card'],
      imperialHand: [],
    };
    const roll = makeRollResult({ netSuccesses: 1 });

    const selected = aiSelectTacticCards(deck, gameData, 'Operative', 'attacker', roll);
    expect(selected).toContain('free-hit');
    expect(selected).not.toContain('def-card');
  });

  it('limits selection to 2 cards', () => {
    const cards = [
      makeCard({ id: 'c1', timing: 'Attack', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
      makeCard({ id: 'c2', timing: 'Attack', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
      makeCard({ id: 'c3', timing: 'Attack', cost: 0, effects: [{ type: 'AddHit', value: 1 }] }),
    ];
    const gameData = makeGameData(cards);
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['c1', 'c2', 'c3'],
      imperialHand: [],
    };
    const roll = makeRollResult();

    const selected = aiSelectTacticCards(deck, gameData, 'Operative', 'attacker', roll);
    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it('returns empty when no playable cards', () => {
    const gameData = makeGameData([]);
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: [],
      imperialHand: [],
    };
    const roll = makeRollResult();

    const selected = aiSelectTacticCards(deck, gameData, 'Operative', 'attacker', roll);
    expect(selected).toEqual([]);
  });
});

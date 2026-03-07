/**
 * Tests for the Dual-Use Tactic Card system (Brass: Birmingham-inspired)
 *
 * Covers alt mode detection, playing cards in alt mode, AI heuristics,
 * and integration with the deck management system.
 */

import { describe, it, expect } from 'vitest';
import {
  hasAltMode,
  getAltModeCards,
  playCardAltMode,
  aiShouldUseAltMode,
  initializeTacticDeck,
  playCard,
} from '../src/tactic-cards.js';
import type {
  GameData,
  TacticCard,
  TacticDeckState,
  TacticCardAltMode,
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
    effects: [{ type: 'AddHit', value: 1 }],
    text: 'Test card',
    cost: 0,
    ...overrides,
  };
}

function makeAltMode(overrides: Partial<TacticCardAltMode> = {}): TacticCardAltMode {
  return {
    type: 'movement',
    value: 2,
    text: 'Gain +2 movement.',
    ...overrides,
  };
}

function makeDeck(
  operativeHand: string[],
  imperialHand: string[] = [],
): TacticDeckState {
  return {
    drawPile: [],
    discardPile: [],
    operativeHand,
    imperialHand,
  };
}

// ============================================================================
// ALT MODE DETECTION
// ============================================================================

describe('Dual-Use Cards - Alt Mode Detection', () => {
  it('hasAltMode returns true for cards with altMode', () => {
    const card = makeCard({ id: 'c1', altMode: makeAltMode() });
    expect(hasAltMode(card)).toBe(true);
  });

  it('hasAltMode returns false for cards without altMode', () => {
    const card = makeCard({ id: 'c1' });
    expect(hasAltMode(card)).toBe(false);
  });

  it('getAltModeCards returns only cards with alt modes from hand', () => {
    const cardWithAlt = makeCard({ id: 'dual-1', altMode: makeAltMode() });
    const cardWithoutAlt = makeCard({ id: 'normal-1' });
    const cardWithAlt2 = makeCard({ id: 'dual-2', altMode: makeAltMode({ type: 'defense_stance' }) });

    const gameData = makeGameData([cardWithAlt, cardWithoutAlt, cardWithAlt2]);
    const deck = makeDeck(['dual-1', 'normal-1', 'dual-2']);

    const altCards = getAltModeCards(deck, gameData, 'Operative');
    expect(altCards).toHaveLength(2);
    expect(altCards.map(c => c.id)).toEqual(['dual-1', 'dual-2']);
  });

  it('getAltModeCards returns empty for Imperial hand when queried for Operative', () => {
    const card = makeCard({ id: 'dual-1', altMode: makeAltMode() });
    const gameData = makeGameData([card]);
    const deck = makeDeck([], ['dual-1']); // Only in Imperial hand

    const altCards = getAltModeCards(deck, gameData, 'Operative');
    expect(altCards).toHaveLength(0);
  });
});

// ============================================================================
// PLAYING ALT MODE
// ============================================================================

describe('Dual-Use Cards - Playing Alt Mode', () => {
  it('playCardAltMode discards the card and returns movement result', () => {
    const card = makeCard({
      id: 'move-card',
      altMode: makeAltMode({ type: 'movement', value: 3, text: '+3 movement' }),
    });
    const gameData = makeGameData([card]);
    const deck = makeDeck(['move-card']);

    const result = playCardAltMode(deck, gameData, 'Operative', 'move-card');

    expect(result).not.toBeNull();
    expect(result!.result.movementBonus).toBe(3);
    expect(result!.result.actionPointBonus).toBe(0);
    expect(result!.result.defenseBonus).toBe(0);
    expect(result!.result.strainRecovery).toBe(0);
    expect(result!.result.cardsDrawn).toBe(0);

    // Card should be discarded
    expect(result!.deck.operativeHand).not.toContain('move-card');
    expect(result!.deck.discardPile).toContain('move-card');
  });

  it('playCardAltMode resolves action_point type', () => {
    const card = makeCard({
      id: 'ap-card',
      altMode: makeAltMode({ type: 'action_point', value: 1, text: '+1 action' }),
    });
    const gameData = makeGameData([card]);
    const deck = makeDeck(['ap-card']);

    const result = playCardAltMode(deck, gameData, 'Operative', 'ap-card');
    expect(result!.result.actionPointBonus).toBe(1);
    expect(result!.result.movementBonus).toBe(0);
  });

  it('playCardAltMode resolves defense_stance type', () => {
    const card = makeCard({
      id: 'def-card',
      altMode: makeAltMode({ type: 'defense_stance', value: 2, text: '+2 Block' }),
    });
    const gameData = makeGameData([card]);
    const deck = makeDeck(['def-card']);

    const result = playCardAltMode(deck, gameData, 'Operative', 'def-card');
    expect(result!.result.defenseBonus).toBe(2);
  });

  it('playCardAltMode resolves strain_recovery type', () => {
    const card = makeCard({
      id: 'strain-card',
      altMode: makeAltMode({ type: 'strain_recovery', value: 3, text: 'Recover 3 strain' }),
    });
    const gameData = makeGameData([card]);
    const deck = makeDeck(['strain-card']);

    const result = playCardAltMode(deck, gameData, 'Operative', 'strain-card');
    expect(result!.result.strainRecovery).toBe(3);
  });

  it('playCardAltMode resolves draw_card type and draws cards', () => {
    const drawCard = makeCard({
      id: 'draw-card',
      altMode: makeAltMode({ type: 'draw_card', value: 2, text: 'Draw 2 cards' }),
    });
    const otherCard1 = makeCard({ id: 'other-1' });
    const otherCard2 = makeCard({ id: 'other-2' });
    const gameData = makeGameData([drawCard, otherCard1, otherCard2]);

    const deck: TacticDeckState = {
      drawPile: ['other-1', 'other-2'],
      discardPile: [],
      operativeHand: ['draw-card'],
      imperialHand: [],
    };

    const result = playCardAltMode(deck, gameData, 'Operative', 'draw-card');
    expect(result!.result.cardsDrawn).toBe(2);
    // Should have drawn 2 cards into Operative hand
    expect(result!.deck.operativeHand).toHaveLength(2);
    expect(result!.deck.drawPile).toHaveLength(0);
  });

  it('playCardAltMode returns null for card without alt mode', () => {
    const card = makeCard({ id: 'normal' });
    const gameData = makeGameData([card]);
    const deck = makeDeck(['normal']);

    const result = playCardAltMode(deck, gameData, 'Operative', 'normal');
    expect(result).toBeNull();
  });

  it('playCardAltMode returns null for card not in hand', () => {
    const card = makeCard({ id: 'dual', altMode: makeAltMode() });
    const gameData = makeGameData([card]);
    const deck = makeDeck([]); // Empty hand

    const result = playCardAltMode(deck, gameData, 'Operative', 'dual');
    expect(result).toBeNull();
  });

  it('playCardAltMode works for Imperial side', () => {
    const card = makeCard({
      id: 'imp-move',
      side: 'Imperial',
      altMode: makeAltMode({ type: 'movement', value: 2 }),
    });
    const gameData = makeGameData([card]);
    const deck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: [],
      imperialHand: ['imp-move'],
    };

    const result = playCardAltMode(deck, gameData, 'Imperial', 'imp-move');
    expect(result).not.toBeNull();
    expect(result!.result.movementBonus).toBe(2);
    expect(result!.deck.imperialHand).not.toContain('imp-move');
  });
});

// ============================================================================
// AI HEURISTICS
// ============================================================================

describe('Dual-Use Cards - AI Decision Heuristics', () => {
  it('AI uses movement alt mode when far from enemies', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'movement', value: 2 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.8,
      figureStrainPercent: 0.2,
      distanceToNearestEnemy: 8,
      handSize: 4,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(true);
  });

  it('AI does NOT use movement alt mode when close to enemies', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'movement', value: 2 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.8,
      figureStrainPercent: 0.2,
      distanceToNearestEnemy: 2,
      handSize: 4,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(false);
  });

  it('AI uses defense_stance when wounded', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'defense_stance', value: 1 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.2,
      figureStrainPercent: 0.2,
      distanceToNearestEnemy: 3,
      handSize: 4,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(true);
  });

  it('AI does NOT use defense_stance when healthy', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'defense_stance', value: 1 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.9,
      figureStrainPercent: 0.2,
      distanceToNearestEnemy: 3,
      handSize: 4,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(false);
  });

  it('AI uses strain_recovery when strained', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'strain_recovery', value: 3 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.8,
      figureStrainPercent: 0.8,
      distanceToNearestEnemy: 3,
      handSize: 4,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(true);
  });

  it('AI uses draw_card when hand is low', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'draw_card', value: 2 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.8,
      figureStrainPercent: 0.2,
      distanceToNearestEnemy: 3,
      handSize: 1,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(true);
  });

  it('AI uses action_point when healthy and in range', () => {
    const card = makeCard({ id: 'c', altMode: makeAltMode({ type: 'action_point', value: 1 }) });
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.7,
      figureStrainPercent: 0.2,
      distanceToNearestEnemy: 4,
      handSize: 4,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(true);
  });

  it('AI does NOT use alt mode for cards without one', () => {
    const card = makeCard({ id: 'c' }); // No altMode
    const shouldUse = aiShouldUseAltMode(card, {
      figureHealthPercent: 0.2,
      figureStrainPercent: 0.9,
      distanceToNearestEnemy: 10,
      handSize: 1,
      hasAttackedThisActivation: false,
    });
    expect(shouldUse).toBe(false);
  });
});

// ============================================================================
// INTEGRATION WITH DECK MANAGEMENT
// ============================================================================

describe('Dual-Use Cards - Deck Integration', () => {
  it('alt mode cards work with standard initializeTacticDeck', () => {
    const cards = [
      makeCard({ id: 'dual-1', altMode: makeAltMode() }),
      makeCard({ id: 'dual-2', altMode: makeAltMode({ type: 'defense_stance', value: 1 }) }),
      makeCard({ id: 'normal-1' }),
      makeCard({ id: 'normal-2' }),
      makeCard({ id: 'normal-3' }),
      makeCard({ id: 'normal-4' }),
      makeCard({ id: 'normal-5' }),
      makeCard({ id: 'normal-6' }),
    ];
    const gameData = makeGameData(cards);

    // Use deterministic RNG
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const deck = initializeTacticDeck(gameData, rng);

    // Deck should be set up correctly
    const allCardIds = [
      ...deck.drawPile,
      ...deck.operativeHand,
      ...deck.imperialHand,
    ];
    expect(allCardIds).toHaveLength(8);
  });

  it('playing alt mode and combat mode both discard correctly', () => {
    const card = makeCard({
      id: 'versatile',
      altMode: makeAltMode({ type: 'movement', value: 2 }),
    });
    const gameData = makeGameData([card]);

    // Test combat mode (standard play)
    const deck1 = makeDeck(['versatile']);
    const combatResult = playCard(deck1, 'Operative', 'versatile');
    expect(combatResult!.operativeHand).not.toContain('versatile');
    expect(combatResult!.discardPile).toContain('versatile');

    // Test alt mode
    const deck2 = makeDeck(['versatile']);
    const altResult = playCardAltMode(deck2, gameData, 'Operative', 'versatile');
    expect(altResult!.deck.operativeHand).not.toContain('versatile');
    expect(altResult!.deck.discardPile).toContain('versatile');
  });
});

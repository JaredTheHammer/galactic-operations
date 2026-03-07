/**
 * Tactic Card Engine
 *
 * Manages the tactic card deck, hand management, and combat effect resolution.
 * Cards are drawn at mission start and each round, played during combat to
 * modify attack/defense results, and discarded after use.
 *
 * Deck management:
 * - Shared deck, separate hands for Operative and Imperial
 * - Draw 3 cards at mission start, 1 per round
 * - Hand limit: 6 cards per side
 * - Discard pile reshuffles when draw pile is empty
 *
 * Combat integration:
 * - Attack-timing cards modify attacker's result (AddHit, Pierce, ConvertMiss, Suppress)
 * - Defense-timing cards modify defender's result (AddBlock, Reroll)
 * - Any-timing cards can be played by either side (Recover, Counter)
 * - Effects are applied post-roll, pre-damage to the OpposedRollResult
 */

import type {
  TacticCard,
  TacticCardEffect,
  TacticCardAltMode,
  TacticCardAltModeType,
  TacticDeckState,
  GameState,
  GameData,
  CombatResolution,
  OpposedRollResult,
  Side,
} from './types.js';

// ============================================================================
// DECK MANAGEMENT
// ============================================================================

const INITIAL_HAND_SIZE = 3;
const CARDS_PER_ROUND = 1;
const MAX_HAND_SIZE = 6;

/**
 * Create a shuffled tactic card deck from game data.
 * Deals initial hands to both sides.
 */
export function initializeTacticDeck(
  gameData: GameData,
  rollFn?: () => number,
): TacticDeckState {
  const allCards = gameData.tacticCards
    ? Object.keys(gameData.tacticCards)
    : [];

  const shuffled = shuffleArray([...allCards], rollFn);

  const operativeHand: string[] = [];
  const imperialHand: string[] = [];

  // Deal initial hands
  for (let i = 0; i < INITIAL_HAND_SIZE && shuffled.length > 0; i++) {
    operativeHand.push(shuffled.pop()!);
  }
  for (let i = 0; i < INITIAL_HAND_SIZE && shuffled.length > 0; i++) {
    imperialHand.push(shuffled.pop()!);
  }

  return {
    drawPile: shuffled,
    discardPile: [],
    operativeHand,
    imperialHand,
  };
}

/**
 * Draw cards for a side at the start of a new round.
 * Reshuffles discard pile into draw pile if needed.
 */
export function drawCards(
  deck: TacticDeckState,
  side: Side,
  count: number = CARDS_PER_ROUND,
  rollFn?: () => number,
): TacticDeckState {
  const hand = side === 'Operative'
    ? [...deck.operativeHand]
    : [...deck.imperialHand];

  let drawPile = [...deck.drawPile];
  let discardPile = [...deck.discardPile];

  for (let i = 0; i < count; i++) {
    if (hand.length >= MAX_HAND_SIZE) break;

    // Reshuffle discard into draw pile if empty
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      drawPile = shuffleArray([...discardPile], rollFn);
      discardPile = [];
    }

    hand.push(drawPile.pop()!);
  }

  return {
    drawPile,
    discardPile,
    operativeHand: side === 'Operative' ? hand : [...deck.operativeHand],
    imperialHand: side === 'Imperial' ? hand : [...deck.imperialHand],
  };
}

/**
 * Draw cards for both sides (typically at round start).
 */
export function drawCardsForBothSides(
  deck: TacticDeckState,
  count: number = CARDS_PER_ROUND,
  rollFn?: () => number,
): TacticDeckState {
  let updated = drawCards(deck, 'Operative', count, rollFn);
  updated = drawCards(updated, 'Imperial', count, rollFn);
  return updated;
}

/**
 * Play a tactic card from a side's hand (move to discard).
 * Returns updated deck state, or null if the card isn't in hand.
 */
export function playCard(
  deck: TacticDeckState,
  side: Side,
  cardId: string,
): TacticDeckState | null {
  const hand = side === 'Operative'
    ? [...deck.operativeHand]
    : [...deck.imperialHand];

  const idx = hand.indexOf(cardId);
  if (idx < 0) return null;

  hand.splice(idx, 1);

  return {
    drawPile: [...deck.drawPile],
    discardPile: [...deck.discardPile, cardId],
    operativeHand: side === 'Operative' ? hand : [...deck.operativeHand],
    imperialHand: side === 'Imperial' ? hand : [...deck.imperialHand],
  };
}

/**
 * Check if a card can be played given the combat context.
 */
export function canPlayCard(
  card: TacticCard,
  side: Side,
  role: 'attacker' | 'defender',
): boolean {
  // Check side restriction
  if (card.side !== 'Universal') {
    if (card.side === 'Operative' && side !== 'Operative') return false;
    if (card.side === 'Imperial' && side !== 'Imperial') return false;
  }

  // Check timing
  if (card.timing === 'Any') return true;
  if (card.timing === 'Attack' && role === 'attacker') return true;
  if (card.timing === 'Defense' && role === 'defender') return true;

  return false;
}

/**
 * Get playable cards from a side's hand for the given combat role.
 */
export function getPlayableCards(
  deck: TacticDeckState,
  gameData: GameData,
  side: Side,
  role: 'attacker' | 'defender',
): TacticCard[] {
  if (!gameData.tacticCards) return [];

  const hand = side === 'Operative'
    ? deck.operativeHand
    : deck.imperialHand;

  return hand
    .map(id => gameData.tacticCards![id])
    .filter((card): card is TacticCard => !!card && canPlayCard(card, side, role));
}

// ============================================================================
// COMBAT EFFECT APPLICATION
// ============================================================================

/**
 * Apply tactic card effects to a combat result.
 * Called after dice rolling and cancellation, before damage calculation.
 *
 * Effects:
 * - AddHit: +N to netSuccesses
 * - AddBlock: +N to totalFailures (reduces netSuccesses)
 * - Pierce: stored for damage calc (reduces soak)
 * - ConvertMiss: convert N totalFailures to totalSuccesses
 * - Suppress: add suppression tokens to result
 * - Reroll: not handled here (would require re-rolling dice)
 * - Recover: not handled here (post-combat heal)
 * - Counter: cancels opponent cards (handled before this)
 */
export interface TacticCardCombatResult {
  /** Modified roll result */
  rollResult: OpposedRollResult;
  /** Additional pierce from tactic cards */
  tacticPierce: number;
  /** Additional suppression tokens from tactic cards */
  tacticSuppression: number;
  /** Health recovered (from Recover cards) */
  tacticRecover: number;
  /** Cards that were countered (cancelled) */
  counteredCardIds: string[];
}

export function applyTacticCards(
  rollResult: OpposedRollResult,
  attackerCards: TacticCard[],
  defenderCards: TacticCard[],
): TacticCardCombatResult {
  // Check for Counter effects first
  const counteredCardIds: string[] = [];

  // Defender counters cancel attacker cards
  for (const card of defenderCards) {
    for (const effect of card.effects) {
      if (effect.type === 'Counter') {
        // Cancel up to N attacker cards (remove from list)
        for (let i = 0; i < effect.value && attackerCards.length > 0; i++) {
          const cancelled = attackerCards.shift()!;
          counteredCardIds.push(cancelled.id);
        }
      }
    }
  }

  // Attacker counters cancel defender cards
  for (const card of attackerCards) {
    for (const effect of card.effects) {
      if (effect.type === 'Counter') {
        for (let i = 0; i < effect.value && defenderCards.length > 0; i++) {
          const cancelled = defenderCards.shift()!;
          counteredCardIds.push(cancelled.id);
        }
      }
    }
  }

  // Now apply remaining card effects
  let netSuccesses = rollResult.netSuccesses;
  let totalSuccesses = rollResult.totalSuccesses;
  let totalFailures = rollResult.totalFailures;
  let tacticPierce = 0;
  let tacticSuppression = 0;
  let tacticRecover = 0;

  // Apply attacker cards
  for (const card of attackerCards) {
    for (const effect of card.effects) {
      switch (effect.type) {
        case 'AddHit':
          netSuccesses += effect.value;
          totalSuccesses += effect.value;
          break;
        case 'Pierce':
          tacticPierce += effect.value;
          break;
        case 'ConvertMiss':
          // Convert failures to successes (bounded by available failures)
          const converted = Math.min(effect.value, totalFailures);
          totalFailures -= converted;
          totalSuccesses += converted;
          netSuccesses += converted * 2; // removing failure + adding success
          break;
        case 'Suppress':
          tacticSuppression += effect.value;
          break;
      }
    }
  }

  // Apply defender cards
  for (const card of defenderCards) {
    for (const effect of card.effects) {
      switch (effect.type) {
        case 'AddBlock':
          netSuccesses -= effect.value;
          totalFailures += effect.value;
          break;
        case 'Recover':
          tacticRecover += effect.value;
          break;
      }
    }
  }

  const isHit = netSuccesses >= 1;

  return {
    rollResult: {
      ...rollResult,
      totalSuccesses,
      totalFailures,
      netSuccesses,
      isHit,
    },
    tacticPierce,
    tacticSuppression,
    tacticRecover,
    counteredCardIds,
  };
}

// ============================================================================
// AI CARD SELECTION
// ============================================================================

/**
 * AI chooses which tactic cards to play in combat.
 * Simple heuristic: play all valid free cards, then pay-cost cards if damage is close.
 */
export function aiSelectTacticCards(
  deck: TacticDeckState,
  gameData: GameData,
  side: Side,
  role: 'attacker' | 'defender',
  rollResult: OpposedRollResult,
): string[] {
  const playable = getPlayableCards(deck, gameData, side, role);
  if (playable.length === 0) return [];

  const selected: string[] = [];

  // Strategy: play free cards always, cost cards selectively
  for (const card of playable) {
    if (card.cost === 0) {
      selected.push(card.id);
      continue;
    }

    // Play cost cards based on combat situation
    if (role === 'attacker') {
      // Play attack cards if we're close to hitting or want more damage
      const needsMoreHits = rollResult.netSuccesses <= 0 || rollResult.netSuccesses <= 2;
      const hasAddHit = card.effects.some(e => e.type === 'AddHit' || e.type === 'ConvertMiss');
      if (needsMoreHits && hasAddHit && card.cost <= 2) {
        selected.push(card.id);
        continue;
      }
      // Play pierce cards if we hit
      if (rollResult.isHit && card.effects.some(e => e.type === 'Pierce') && card.cost <= 2) {
        selected.push(card.id);
      }
    } else {
      // Play defense cards if we're about to take significant damage
      const inDanger = rollResult.netSuccesses >= 2;
      const hasBlock = card.effects.some(e => e.type === 'AddBlock' || e.type === 'Counter');
      if (inDanger && hasBlock && card.cost <= 2) {
        selected.push(card.id);
      }
    }
  }

  // Limit to 2 cards per combat to prevent dumping entire hand
  return selected.slice(0, 2);
}

// ============================================================================
// STRATEGIC CARD PLAY (War of the Ring Event Card Dual-Use)
// ============================================================================

/**
 * Result of playing a tactic card for its strategic effect.
 */
export interface StrategicCardResult {
  cardId: string;
  effect: import('./types.js').StrategicEffect;
  /** Updated game state delta */
  reinforcementPointsAdded: number;
  moraleRecovered: number;
  cardsDrawn: number;
  repositionFigureId: string | null;
}

/**
 * Check if a tactic card has a strategic (non-combat) effect.
 */
export function hasStrategicEffect(card: TacticCard): boolean {
  return !!card.strategicEffect;
}

/**
 * Get cards from a side's hand that have strategic effects.
 */
export function getStrategicCards(
  deck: TacticDeckState,
  gameData: GameData,
  side: Side,
): TacticCard[] {
  if (!gameData.tacticCards) return [];

  const hand = side === 'Operative'
    ? deck.operativeHand
    : deck.imperialHand;

  return hand
    .map(id => gameData.tacticCards![id])
    .filter((card): card is TacticCard => !!card && hasStrategicEffect(card));
}

// DUAL-USE CARD SYSTEM (Brass: Birmingham-inspired)
// ============================================================================

/**
 * Result of playing a card in its alternative (non-combat) mode.
 * Applied during the activation phase instead of combat.
 */
export interface AltModeResult {
  cardId: string;
  cardName: string;
  altMode: TacticCardAltMode;
  /** Movement bonus applied to the figure */
  movementBonus: number;
  /** Extra actions granted this activation */
  actionPointBonus: number;
  /** Temporary defense boost (additional Block on next incoming attack) */
  defenseBonus: number;
  /** Strain recovered */
  strainRecovery: number;
  /** Number of additional cards drawn */
  cardsDrawn: number;
}

/**
 * Check if a tactic card has an alternative (non-combat) mode.
 */
export function hasAltMode(card: TacticCard): boolean {
  return !!card.altMode;
}

/**
 * Get cards from a side's hand that have an alt mode available.
 */
export function getAltModeCards(
  deck: TacticDeckState,
  gameData: GameData,
  side: Side,
): TacticCard[] {
  if (!gameData.tacticCards) return [];

  const hand = side === 'Operative'
    ? deck.operativeHand
    : deck.imperialHand;

  return hand
    .map(id => gameData.tacticCards![id])
    .filter((card): card is TacticCard => !!card && hasAltMode(card));
}

/**
 * Play a tactic card for its strategic effect (instead of its combat effect).
 * The card is discarded after use.
 */
export function playStrategicCard(
  deck: TacticDeckState,
  gameData: GameData,
  side: Side,
  cardId: string,
): { result: StrategicCardResult; deck: TacticDeckState } | null {
  if (!gameData.tacticCards) return null;

  const card = gameData.tacticCards[cardId];
  if (!card || !card.strategicEffect) return null;

  // Remove from hand
  const updatedDeck = playCard(deck, side, cardId);
  if (!updatedDeck) return null;

  const effect = card.strategicEffect;
  const result: StrategicCardResult = {
    cardId,
    effect,
    reinforcementPointsAdded: 0,
    moraleRecovered: 0,
    cardsDrawn: 0,
    repositionFigureId: null,
  };

  switch (effect.type) {
    case 'Reinforce':
      result.reinforcementPointsAdded = effect.value;
      break;
    case 'Rally':
      result.moraleRecovered = effect.value;
      break;
    case 'Resupply':
      result.cardsDrawn = effect.value;
      break;
    case 'Reposition':
    case 'Intel':
      // These require additional context (figure selection, objective info)
      // which is handled by the caller
      break;
  }

  return { result, deck: updatedDeck };
}

/**
 * AI decides whether to play a card for strategic vs. tactical effect.
 * Simple heuristic: play for strategic effect if no combat is imminent
 * and the strategic value exceeds a threshold.
 *
 * WotR parallel: AI must decide if an Event card is worth more as a
 * combat modifier or as a strategic play.
 */
export function aiShouldPlayStrategic(
  card: TacticCard,
  side: Side,
  hasActiveCombat: boolean,
  currentMorale: number,
  maxMorale: number,
): boolean {
  if (!card.strategicEffect) return false;

  // Never use strategically if in active combat and card has good combat effects
  if (hasActiveCombat) {
    const hasCombatValue = card.effects.some(
      e => e.type === 'AddHit' || e.type === 'AddBlock' || e.type === 'Pierce',
    );
    if (hasCombatValue) return false;
  }

  // Play Rally cards strategically when morale is low
  if (card.strategicEffect.type === 'Rally') {
    return currentMorale < maxMorale * 0.5;
  }

  // Play Reinforce cards strategically when not in combat
  if (card.strategicEffect.type === 'Reinforce') {
    return !hasActiveCombat;
  }

  // Play Resupply when hand is small (< 3 cards)
  if (card.strategicEffect.type === 'Resupply') {
    return !hasActiveCombat;
  }

  return false;
}

/**
 * Play a tactic card in its alternative (non-combat) mode.
 * Returns the alt mode result and updated deck, or null if invalid.
 */
export function playCardAltMode(
  deck: TacticDeckState,
  gameData: GameData,
  side: Side,
  cardId: string,
): { deck: TacticDeckState; result: AltModeResult } | null {
  if (!gameData.tacticCards) return null;

  const card = gameData.tacticCards[cardId];
  if (!card || !card.altMode) return null;

  // Check card is in hand
  const hand = side === 'Operative'
    ? deck.operativeHand
    : deck.imperialHand;

  if (!hand.includes(cardId)) return null;

  // Discard the card
  const updatedDeck = playCard(deck, side, cardId);
  if (!updatedDeck) return null;

  // Resolve the alt mode effect
  const result = resolveAltMode(card);

  // If the alt mode draws cards, do that now
  let finalDeck = updatedDeck;
  if (result.cardsDrawn > 0) {
    finalDeck = drawCards(updatedDeck, side, result.cardsDrawn);
  }

  return { deck: finalDeck, result };
}

/**
 * Resolve an alt mode into concrete bonuses.
 */
function resolveAltMode(card: TacticCard): AltModeResult {
  const altMode = card.altMode!;
  const result: AltModeResult = {
    cardId: card.id,
    cardName: card.name,
    altMode,
    movementBonus: 0,
    actionPointBonus: 0,
    defenseBonus: 0,
    strainRecovery: 0,
    cardsDrawn: 0,
  };

  switch (altMode.type) {
    case 'movement':
      result.movementBonus = altMode.value;
      break;
    case 'action_point':
      result.actionPointBonus = altMode.value;
      break;
    case 'defense_stance':
      result.defenseBonus = altMode.value;
      break;
    case 'strain_recovery':
      result.strainRecovery = altMode.value;
      break;
    case 'draw_card':
      result.cardsDrawn = altMode.value;
      break;
  }

  return result;
}

/**
 * AI decides whether to play a card in alt mode vs saving for combat.
 * Heuristic: use alt mode when the non-combat benefit is more immediately useful.
 */
export function aiShouldUseAltMode(
  card: TacticCard,
  context: {
    figureHealthPercent: number;
    figureStrainPercent: number;
    distanceToNearestEnemy: number;
    handSize: number;
    hasAttackedThisActivation: boolean;
  },
): boolean {
  if (!card.altMode) return false;

  switch (card.altMode.type) {
    case 'movement':
      // Use movement bonus if far from enemies and haven't attacked yet
      return context.distanceToNearestEnemy > 4 && !context.hasAttackedThisActivation;

    case 'action_point':
      // Use extra action if healthy and in good position
      return context.figureHealthPercent > 0.5 && context.distanceToNearestEnemy <= 6;

    case 'defense_stance':
      // Use defense if wounded
      return context.figureHealthPercent < 0.4;

    case 'strain_recovery':
      // Use strain recovery if high strain
      return context.figureStrainPercent > 0.6;

    case 'draw_card':
      // Draw more cards if hand is low
      return context.handSize <= 2;

    default:
      return false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Fisher-Yates shuffle.
 */
function shuffleArray<T>(arr: T[], rollFn?: () => number): T[] {
  const rng = rollFn ?? (() => Math.random());
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

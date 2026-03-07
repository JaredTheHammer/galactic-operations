/**
 * Tactic Card Deck-Building System (Dune: Imperium Core Deck-Building)
 *
 * Replaces the shared tactic deck with per-side customizable decks.
 * Players buy cards at shops, thin weak cards, and build synergistic combos.
 */

import type {
  TacticCard,
  TacticCardMarketEntry,
  CustomTacticDeck,
  DeckBuildingState,
  TacticDeckState,
  CampaignState,
  DuneMechanicsState,
  Side,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Starting deck size per side */
export const STARTER_DECK_SIZE = 10;
/** Maximum deck size */
export const MAX_DECK_SIZE = 20;
/** Minimum deck size (cannot thin below this) */
export const MIN_DECK_SIZE = 6;
/** Cost to permanently remove (trash) a card from your deck */
export const TRASH_COST = 15;
/** Number of market cards available at a time */
export const MARKET_DISPLAY_SIZE = 5;

// ============================================================================
// Deck-Building Initialization
// ============================================================================

/** Default starter card IDs for Operative side */
export const OPERATIVE_STARTER_CARDS = [
  'focused-shot', 'take-cover', 'field-medic', 'quick-reflexes', 'covering-fire',
  'last-resort', 'determination', 'flanking-move', 'dig-in', 'second-wind',
];

/** Default starter card IDs for Imperial side */
export const IMPERIAL_STARTER_CARDS = [
  'suppressive-barrage', 'reinforce', 'precision-strike', 'hold-the-line', 'overwhelming-force',
  'iron-discipline', 'tactical-withdrawal', 'area-denial', 'concentrated-fire', 'fortify',
];

/** Enable deck-building for a campaign */
export function enableDeckBuilding(
  campaign: CampaignState,
  allCards: Record<string, TacticCard>,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);

  // Build starter decks from available tactic cards
  const availableCardIds = Object.keys(allCards);
  const operativeCards = OPERATIVE_STARTER_CARDS.filter((id) => availableCardIds.includes(id));
  const imperialCards = IMPERIAL_STARTER_CARDS.filter((id) => availableCardIds.includes(id));

  // If starter cards aren't all available, fill from universal cards
  if (operativeCards.length < STARTER_DECK_SIZE) {
    const universals = availableCardIds.filter(
      (id) => allCards[id].side === 'Universal' && !operativeCards.includes(id),
    );
    while (operativeCards.length < STARTER_DECK_SIZE && universals.length > 0) {
      operativeCards.push(universals.shift()!);
    }
  }
  if (imperialCards.length < STARTER_DECK_SIZE) {
    const universals = availableCardIds.filter(
      (id) => allCards[id].side === 'Universal' && !imperialCards.includes(id),
    );
    while (imperialCards.length < STARTER_DECK_SIZE && universals.length > 0) {
      imperialCards.push(universals.shift()!);
    }
  }

  const deckBuilding: DeckBuildingState = {
    enabled: true,
    operativeDeck: { cardIds: operativeCards, removedCardIds: [] },
    imperialDeck: { cardIds: imperialCards, removedCardIds: [] },
    marketPool: buildMarketPool(allCards, [...operativeCards, ...imperialCards], campaign.currentAct),
    trashedCardIds: [],
  };

  return {
    ...campaign,
    duneMechanics: { ...dm, deckBuilding },
  };
}

/** Disable deck-building, reverting to shared deck */
export function disableDeckBuilding(campaign: CampaignState): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      deckBuilding: { ...dm.deckBuilding, enabled: false },
    },
  };
}

// ============================================================================
// Market Operations
// ============================================================================

/** Get cards currently available in the market */
export function getMarketCards(
  campaign: CampaignState,
  allCards: Record<string, TacticCard>,
): Array<TacticCardMarketEntry & { card: TacticCard }> {
  const db = campaign.duneMechanics?.deckBuilding;
  if (!db?.enabled) return [];

  return db.marketPool
    .filter((e) => !e.purchased && e.minAct <= campaign.currentAct)
    .slice(0, MARKET_DISPLAY_SIZE)
    .map((entry) => ({ ...entry, card: allCards[entry.cardId] }))
    .filter((e) => e.card != null);
}

/** Purchase a card from the market and add it to a side's deck */
export function purchaseMarketCard(
  campaign: CampaignState,
  cardId: string,
  side: Side,
): CampaignState | null {
  const dm = ensureDuneMechanics(campaign);
  const db = dm.deckBuilding;
  if (!db.enabled) return null;

  const deck = side === 'Operative' ? db.operativeDeck : db.imperialDeck;
  if (deck.cardIds.length >= MAX_DECK_SIZE) return null;

  const entryIndex = db.marketPool.findIndex(
    (e) => e.cardId === cardId && !e.purchased,
  );
  if (entryIndex === -1) return null;

  const entry = db.marketPool[entryIndex];
  if (campaign.credits < entry.creditCost) return null;

  const updatedMarket = [...db.marketPool];
  updatedMarket[entryIndex] = { ...entry, purchased: true };

  const updatedDeck: CustomTacticDeck = {
    ...deck,
    cardIds: [...deck.cardIds, cardId],
  };

  const updatedDb: DeckBuildingState = {
    ...db,
    marketPool: updatedMarket,
    operativeDeck: side === 'Operative' ? updatedDeck : db.operativeDeck,
    imperialDeck: side === 'Imperial' ? updatedDeck : db.imperialDeck,
  };

  return {
    ...campaign,
    credits: campaign.credits - entry.creditCost,
    duneMechanics: { ...dm, deckBuilding: updatedDb },
  };
}

// ============================================================================
// Deck Thinning
// ============================================================================

/** Remove a card from a side's deck permanently (costs credits) */
export function trashCard(
  campaign: CampaignState,
  cardId: string,
  side: Side,
): CampaignState | null {
  const dm = ensureDuneMechanics(campaign);
  const db = dm.deckBuilding;
  if (!db.enabled) return null;

  const deck = side === 'Operative' ? db.operativeDeck : db.imperialDeck;

  // Cannot thin below minimum
  if (deck.cardIds.length <= MIN_DECK_SIZE) return null;

  const cardIndex = deck.cardIds.indexOf(cardId);
  if (cardIndex === -1) return null;

  if (campaign.credits < TRASH_COST) return null;

  const updatedCardIds = [...deck.cardIds];
  updatedCardIds.splice(cardIndex, 1);

  const updatedDeck: CustomTacticDeck = {
    ...deck,
    cardIds: updatedCardIds,
    removedCardIds: [...deck.removedCardIds, cardId],
  };

  const updatedDb: DeckBuildingState = {
    ...db,
    operativeDeck: side === 'Operative' ? updatedDeck : db.operativeDeck,
    imperialDeck: side === 'Imperial' ? updatedDeck : db.imperialDeck,
    trashedCardIds: [...db.trashedCardIds, cardId],
  };

  return {
    ...campaign,
    credits: campaign.credits - TRASH_COST,
    duneMechanics: { ...dm, deckBuilding: updatedDb },
  };
}

// ============================================================================
// Deck -> TacticDeckState Conversion (for runtime use)
// ============================================================================

/** Build a TacticDeckState from custom decks for mission start */
export function buildCustomTacticDeck(
  campaign: CampaignState,
  allCards: Record<string, TacticCard>,
  rollFn?: () => number,
): TacticDeckState | null {
  const db = campaign.duneMechanics?.deckBuilding;
  if (!db?.enabled) return null;

  const rng = rollFn ?? Math.random;

  // Build separate draw piles per side, then merge for compatibility
  // with the existing TacticDeckState interface
  const operativeCards = db.operativeDeck.cardIds
    .map((id) => allCards[id])
    .filter(Boolean);
  const imperialCards = db.imperialDeck.cardIds
    .map((id) => allCards[id])
    .filter(Boolean);

  // Shuffle both decks
  const shuffledOp = shuffle([...operativeCards], rng);
  const shuffledImp = shuffle([...imperialCards], rng);

  // Deal initial hands (3 cards each)
  const opHand = shuffledOp.splice(0, 3);
  const impHand = shuffledImp.splice(0, 3);

  return {
    drawPile: [...shuffledOp, ...shuffledImp], // Combined for draw compatibility
    discardPile: [],
    operativeHand: opHand,
    imperialHand: impHand,
  };
}

/** Get the current deck contents for a side */
export function getDeckContents(
  campaign: CampaignState,
  side: Side,
): string[] {
  const db = campaign.duneMechanics?.deckBuilding;
  if (!db?.enabled) return [];
  return side === 'Operative' ? db.operativeDeck.cardIds : db.imperialDeck.cardIds;
}

/** Get the number of cards in a side's deck */
export function getDeckSize(campaign: CampaignState, side: Side): number {
  return getDeckContents(campaign, side).length;
}

// ============================================================================
// Market Refresh (between acts)
// ============================================================================

/** Refresh the market pool for a new act */
export function refreshMarket(
  campaign: CampaignState,
  allCards: Record<string, TacticCard>,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  const db = dm.deckBuilding;
  if (!db.enabled) return campaign;

  const allOwnedCards = [
    ...db.operativeDeck.cardIds,
    ...db.imperialDeck.cardIds,
    ...db.trashedCardIds,
  ];

  const newMarket = buildMarketPool(allCards, allOwnedCards, campaign.currentAct);

  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      deckBuilding: { ...db, marketPool: newMarket },
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function buildMarketPool(
  allCards: Record<string, TacticCard>,
  excludeCardIds: string[],
  currentAct: number,
): TacticCardMarketEntry[] {
  const excludeSet = new Set(excludeCardIds);
  return Object.values(allCards)
    .filter((card) => !excludeSet.has(card.id))
    .map((card) => ({
      cardId: card.id,
      creditCost: computeCardCost(card),
      minAct: computeMinAct(card),
      purchased: false,
    }));
}

function computeCardCost(card: TacticCard): number {
  // Base cost derived from effect power
  let cost = 10;
  for (const effect of card.effects) {
    cost += effect.value * 5;
  }
  // Side-specific cards cost slightly more
  if (card.side !== 'Universal') cost += 5;
  return cost;
}

function computeMinAct(card: TacticCard): number {
  // Higher-value cards available in later acts
  const totalValue = card.effects.reduce((sum, e) => sum + e.value, 0);
  if (totalValue >= 4) return 3;
  if (totalValue >= 3) return 2;
  return 1;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ensureDuneMechanics(campaign: CampaignState): DuneMechanicsState {
  if (campaign.duneMechanics) return campaign.duneMechanics;
  return {
    activeContracts: [],
    completedContractIds: [],
    spyNetwork: {
      assets: [],
      maxAssets: 2,
      intelGathered: {},
      networkLevel: 1,
    },
    deckBuilding: {
      enabled: false,
      operativeDeck: { cardIds: [], removedCardIds: [] },
      imperialDeck: { cardIds: [], removedCardIds: [] },
      marketPool: [],
      trashedCardIds: [],
    },
    researchTrack: {
      unlockedNodes: [],
      totalAPSpent: 0,
    },
    mercenaryRoster: {
      hired: [],
      maxActive: 2,
      killedInAction: [],
    },
  };
}

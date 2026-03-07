/**
 * Intel Draft Engine (Terraforming Mars Card Drafting)
 *
 * Before each mission, a pool of intel cards is revealed (2x hero count).
 * Heroes draft cards one at a time, gaining pre-mission advantages like
 * enemy intel, equipment upgrades, cover placement, or tactical bonuses.
 *
 * Integration points:
 * - Pre-mission phase: generateIntelDraftPool -> draftIntelCard (repeat) -> finalizeDraft
 * - Mission setup: applyIntelEffects applies drafted card effects to GameState
 * - AI: aiDraftIntelCard selects the best available card
 */

import type {
  IntelCard,
  IntelDraftState,
  CampaignState,
  GameState,
  StatusEffect,
} from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cards per hero in the draft pool */
const CARDS_PER_HERO = 2;

/** Max cards each hero can draft */
const MAX_DRAFT_PER_HERO = 1;

/** Rarity weights for pool generation */
const RARITY_WEIGHTS: Record<string, number> = {
  common: 6,
  uncommon: 3,
  rare: 1,
};

// ============================================================================
// DRAFT POOL GENERATION
// ============================================================================

/**
 * Generate a draft pool of intel cards for the pre-mission phase.
 * Pool size = heroCount * CARDS_PER_HERO.
 * Cards are weighted by rarity.
 */
export function generateIntelDraftPool(
  allCards: Record<string, IntelCard>,
  heroCount: number,
  rollFn: () => number = Math.random,
): IntelDraftState {
  const poolSize = heroCount * CARDS_PER_HERO;
  const cardList = Object.values(allCards);

  if (cardList.length === 0) {
    return {
      availableCards: [],
      draftedCards: {},
      maxPerHero: MAX_DRAFT_PER_HERO,
      remainingPicks: 0,
    };
  }

  // Build weighted pool
  const weighted: IntelCard[] = [];
  for (const card of cardList) {
    const weight = RARITY_WEIGHTS[card.rarity] ?? 1;
    for (let i = 0; i < weight; i++) {
      weighted.push(card);
    }
  }

  // Sample without replacement (by card ID)
  const selected: string[] = [];
  const usedIds = new Set<string>();
  let attempts = 0;
  const maxAttempts = poolSize * 10;

  while (selected.length < poolSize && attempts < maxAttempts) {
    const idx = Math.floor(rollFn() * weighted.length);
    const card = weighted[idx];
    if (!usedIds.has(card.id)) {
      selected.push(card.id);
      usedIds.add(card.id);
    }
    attempts++;

    // If we've exhausted unique cards, stop
    if (usedIds.size >= cardList.length) break;
  }

  return {
    availableCards: selected,
    draftedCards: {},
    maxPerHero: MAX_DRAFT_PER_HERO,
    remainingPicks: heroCount * MAX_DRAFT_PER_HERO,
  };
}

// ============================================================================
// DRAFTING
// ============================================================================

/**
 * Draft an intel card for a hero.
 * Returns updated draft state, or null if the draft is invalid.
 */
export function draftIntelCard(
  state: IntelDraftState,
  heroId: string,
  cardId: string,
): IntelDraftState | null {
  // Card must be available
  if (!state.availableCards.includes(cardId)) return null;

  // Hero hasn't exceeded their draft limit
  const heroDrafted = state.draftedCards[heroId] ?? [];
  if (heroDrafted.length >= state.maxPerHero) return null;

  // No remaining picks
  if (state.remainingPicks <= 0) return null;

  return {
    availableCards: state.availableCards.filter(id => id !== cardId),
    draftedCards: {
      ...state.draftedCards,
      [heroId]: [...heroDrafted, cardId],
    },
    maxPerHero: state.maxPerHero,
    remainingPicks: state.remainingPicks - 1,
  };
}

/**
 * Check if a hero can still draft a card.
 */
export function canDraft(state: IntelDraftState, heroId: string): boolean {
  if (state.remainingPicks <= 0) return false;
  if (state.availableCards.length === 0) return false;
  const heroDrafted = state.draftedCards[heroId] ?? [];
  return heroDrafted.length < state.maxPerHero;
}

/**
 * Get all cards drafted across all heroes as a flat list.
 */
export function getAllDraftedCardIds(state: IntelDraftState): string[] {
  return Object.values(state.draftedCards).flat();
}

/**
 * Finalize the draft and store drafted card IDs in campaign state.
 */
export function finalizeDraft(
  campaign: CampaignState,
  state: IntelDraftState,
): CampaignState {
  const allDrafted = getAllDraftedCardIds(state);
  return {
    ...campaign,
    pendingIntelCards: allDrafted,
  };
}

// ============================================================================
// EFFECT APPLICATION
// ============================================================================

/** Result of applying intel card effects to a mission setup */
export interface IntelEffectResult {
  /** Threat reduction to apply */
  threatReduction: number;
  /** Extra tactic cards to draw at start */
  bonusTacticCards: number;
  /** Free consumable IDs to add to hero inventory */
  bonusConsumables: string[];
  /** Conditions to apply to enemy groups */
  enemyConditions: Array<{ targetId: string; condition: StatusEffect }>;
  /** Whether operatives get a free activation before round 1 */
  ambush: boolean;
  /** Whether enemy positions should be revealed */
  revealEnemies: boolean;
  /** Light cover tiles to place (value = count) */
  coverTilesToPlace: number;
  /** Deployment zone expansion (value = tiles) */
  deploymentExpansion: number;
  /** Whether objective locations are revealed */
  revealObjectives: boolean;
  /** Temporary equipment upgrades */
  bonusEquipment: string[];
}

/**
 * Calculate the aggregate effects of all drafted intel cards.
 */
export function calculateIntelEffects(
  cardIds: string[],
  allCards: Record<string, IntelCard>,
): IntelEffectResult {
  const result: IntelEffectResult = {
    threatReduction: 0,
    bonusTacticCards: 0,
    bonusConsumables: [],
    enemyConditions: [],
    ambush: false,
    revealEnemies: false,
    coverTilesToPlace: 0,
    deploymentExpansion: 0,
    revealObjectives: false,
    bonusEquipment: [],
  };

  for (const cardId of cardIds) {
    const card = allCards[cardId];
    if (!card) continue;

    const { type, value, targetId } = card.effect;

    switch (type) {
      case 'threat_reduction':
        result.threatReduction += value;
        break;
      case 'bonus_tactic_cards':
        result.bonusTacticCards += value;
        break;
      case 'bonus_consumable':
        if (targetId) result.bonusConsumables.push(targetId);
        break;
      case 'enemy_condition':
        if (targetId) {
          result.enemyConditions.push({
            targetId,
            condition: { name: targetId, duration: value } as StatusEffect,
          });
        }
        break;
      case 'ambush':
        result.ambush = true;
        break;
      case 'reveal_enemies':
        result.revealEnemies = true;
        break;
      case 'place_cover':
        result.coverTilesToPlace += value;
        break;
      case 'deployment_flexibility':
        result.deploymentExpansion += value;
        break;
      case 'recon_objective':
        result.revealObjectives = true;
        break;
      case 'bonus_equipment':
        if (targetId) result.bonusEquipment.push(targetId);
        break;
    }
  }

  return result;
}

/**
 * Clear pending intel cards from campaign state after they've been applied.
 */
export function clearPendingIntel(campaign: CampaignState): CampaignState {
  return {
    ...campaign,
    pendingIntelCards: undefined,
  };
}

// ============================================================================
// AI DRAFTING
// ============================================================================

/** Priority order for AI drafting (higher = better) */
const AI_EFFECT_PRIORITY: Record<string, number> = {
  ambush: 10,
  threat_reduction: 8,
  reveal_enemies: 7,
  bonus_tactic_cards: 6,
  enemy_condition: 5,
  bonus_consumable: 4,
  bonus_equipment: 4,
  place_cover: 3,
  deployment_flexibility: 3,
  recon_objective: 2,
};

/**
 * AI selects the best available intel card to draft.
 * Simple heuristic: pick the highest-priority effect, with rarity as tiebreaker.
 */
export function aiDraftIntelCard(
  state: IntelDraftState,
  allCards: Record<string, IntelCard>,
): string | null {
  if (state.availableCards.length === 0) return null;

  const rarityScore: Record<string, number> = { rare: 3, uncommon: 2, common: 1 };

  let bestId: string | null = null;
  let bestScore = -1;

  for (const cardId of state.availableCards) {
    const card = allCards[cardId];
    if (!card) continue;

    const effectPriority = AI_EFFECT_PRIORITY[card.effect.type] ?? 1;
    const rScore = rarityScore[card.rarity] ?? 1;
    const totalScore = effectPriority * 10 + rScore + card.effect.value;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestId = cardId;
    }
  }

  return bestId;
}

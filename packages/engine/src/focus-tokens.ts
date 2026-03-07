/**
 * Focus Token System (Ark Nova X-Token inspired)
 *
 * Focus tokens are a universal boost currency earned from Yahtzee combos,
 * critical hits, and objective completion. Heroes spend them to enhance
 * any action: +1 attack die, +2 movement, +1 defense die, +1 skill die,
 * or recover strain.
 *
 * Design rationale:
 * - Rewards skilled/lucky play with a persistent, flexible resource
 * - Creates "save or spend" decisions without overlapping with strain
 *   (strain is a risk/reward pushable limit; focus is a pure bonus)
 * - Cap of 5 prevents hoarding; costs of 1-2 encourage frequent use
 */

import type {
  Figure,
  CampaignState,
  FocusSpendType,
  FocusSpendOption,
  YahtzeeCombo,
  CombatResolution,
} from './types.js';

import {
  FOCUS_TOKEN_COSTS,
  MAX_FOCUS_TOKENS,
  FOCUS_TOKEN_EARN,
} from './types.js';

// ============================================================================
// TOKEN QUERIES
// ============================================================================

/**
 * Get current focus token count for a figure.
 */
export function getFocusTokens(figure: Figure): number {
  return figure.focusTokens ?? 0;
}

/**
 * Get focus tokens for a hero from campaign state (between missions).
 */
export function getCampaignFocusTokens(
  campaign: CampaignState,
  heroId: string,
): number {
  return (campaign.focusTokens ?? {})[heroId] ?? 0;
}

/**
 * Get available spend options for a figure's current focus token count.
 */
export function getAvailableFocusSpends(figure: Figure): FocusSpendOption[] {
  const tokens = getFocusTokens(figure);
  if (tokens <= 0) return [];

  const allOptions: FocusSpendOption[] = [
    { type: 'attack-boost', cost: FOCUS_TOKEN_COSTS['attack-boost'], description: '+1 Ability die to next attack' },
    { type: 'move-boost', cost: FOCUS_TOKEN_COSTS['move-boost'], description: '+2 movement this activation' },
    { type: 'defense-boost', cost: FOCUS_TOKEN_COSTS['defense-boost'], description: '+1 Difficulty die vs next attack on you' },
    { type: 'skill-boost', cost: FOCUS_TOKEN_COSTS['skill-boost'], description: '+1 Ability die to next skill check' },
    { type: 'recover-strain', cost: FOCUS_TOKEN_COSTS['recover-strain'], description: 'Recover 2 strain immediately' },
  ];

  return allOptions.filter(opt => opt.cost <= tokens);
}

// ============================================================================
// TOKEN EARNING
// ============================================================================

/**
 * Calculate focus tokens earned from combat combos.
 * Called after combat resolution to award tokens to the attacker.
 */
export function calculateComboFocusTokens(combos: YahtzeeCombo[]): number {
  if (combos.length === 0) return 0;

  let tokens = 0;
  for (const combo of combos) {
    tokens += FOCUS_TOKEN_EARN.perCombo;
    if (combo.isGilded) {
      tokens += FOCUS_TOKEN_EARN.gildedBonus;
    }
  }
  return tokens;
}

/**
 * Calculate focus tokens earned from a full combat resolution.
 * Includes combo tokens + critical hit bonus.
 */
export function calculateCombatFocusTokens(resolution: CombatResolution): number {
  let tokens = calculateComboFocusTokens(resolution.rollResult.combos);
  if (resolution.criticalTriggered) {
    tokens += FOCUS_TOKEN_EARN.perCritical;
  }
  return tokens;
}

/**
 * Award focus tokens to a figure, clamped to MAX_FOCUS_TOKENS.
 * Returns updated figure.
 */
export function awardFocusTokens(figure: Figure, amount: number): Figure {
  const current = getFocusTokens(figure);
  const newTokens = Math.min(current + amount, MAX_FOCUS_TOKENS);
  return { ...figure, focusTokens: newTokens };
}

/**
 * Award focus tokens to a hero in campaign state (between missions, e.g., from objectives).
 */
export function awardCampaignFocusTokens(
  campaign: CampaignState,
  heroId: string,
  amount: number,
): CampaignState {
  const current = getCampaignFocusTokens(campaign, heroId);
  const newTokens = Math.min(current + amount, MAX_FOCUS_TOKENS);
  return {
    ...campaign,
    focusTokens: {
      ...(campaign.focusTokens ?? {}),
      [heroId]: newTokens,
    },
  };
}

// ============================================================================
// TOKEN SPENDING
// ============================================================================

/**
 * Spend focus tokens for a specific effect.
 * Returns updated figure and the effect details, or null if insufficient tokens.
 */
export function spendFocusTokens(
  figure: Figure,
  spendType: FocusSpendType,
): { figure: Figure; effect: FocusSpendEffect } | null {
  const cost = FOCUS_TOKEN_COSTS[spendType];
  const current = getFocusTokens(figure);

  if (current < cost) return null;

  const newFigure: Figure = {
    ...figure,
    focusTokens: current - cost,
  };

  const effect = getFocusSpendEffect(spendType);

  // Apply strain recovery directly to the figure if applicable
  if (spendType === 'recover-strain') {
    newFigure.strainCurrent = Math.max(0, newFigure.strainCurrent - effect.strainRecovery);
  }

  return { figure: newFigure, effect };
}

/** The mechanical result of spending focus tokens */
export interface FocusSpendEffect {
  type: FocusSpendType;
  /** Extra ability dice for attack/skill checks */
  bonusAbilityDice: number;
  /** Extra movement tiles */
  bonusMovement: number;
  /** Extra difficulty dice added to enemy's attack against this figure */
  bonusDefenseDice: number;
  /** Strain recovered */
  strainRecovery: number;
}

/**
 * Get the mechanical effect for a focus token spend type.
 */
export function getFocusSpendEffect(spendType: FocusSpendType): FocusSpendEffect {
  const base: FocusSpendEffect = {
    type: spendType,
    bonusAbilityDice: 0,
    bonusMovement: 0,
    bonusDefenseDice: 0,
    strainRecovery: 0,
  };

  switch (spendType) {
    case 'attack-boost':
      return { ...base, bonusAbilityDice: 1 };
    case 'move-boost':
      return { ...base, bonusMovement: 2 };
    case 'defense-boost':
      return { ...base, bonusDefenseDice: 1 };
    case 'skill-boost':
      return { ...base, bonusAbilityDice: 1 };
    case 'recover-strain':
      return { ...base, strainRecovery: 2 };
  }
}

// ============================================================================
// MISSION LIFECYCLE
// ============================================================================

/**
 * Initialize focus tokens on figures at mission start from campaign state.
 * Heroes carry over their campaign focus tokens; NPCs start at 0.
 */
export function initializeFocusTokens(
  figures: Figure[],
  campaign?: CampaignState,
): Figure[] {
  return figures.map(fig => {
    if (fig.entityType === 'hero' && campaign) {
      return {
        ...fig,
        focusTokens: getCampaignFocusTokens(campaign, fig.entityId),
      };
    }
    return { ...fig, focusTokens: 0 };
  });
}

/**
 * Save focus tokens back to campaign state after a mission.
 * Only hero tokens are persisted.
 */
export function saveFocusTokensToCampaign(
  campaign: CampaignState,
  figures: Figure[],
): CampaignState {
  const focusTokens = { ...(campaign.focusTokens ?? {}) };

  for (const fig of figures) {
    if (fig.entityType === 'hero') {
      focusTokens[fig.entityId] = getFocusTokens(fig);
    }
  }

  return { ...campaign, focusTokens };
}

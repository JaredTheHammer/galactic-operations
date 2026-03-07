/**
 * Galactic Operations - Momentum System
 * Pandemic Legacy-inspired win/loss rubber-banding that adjusts difficulty
 * based on the player's recent performance.
 *
 * Momentum ranges from -3 (losing streak) to +3 (winning streak).
 * Negative momentum grants bonuses (extra tactic cards, credits, threat reduction).
 * Positive momentum increases difficulty (fewer resources, more threat).
 *
 * This creates a self-correcting difficulty curve without being patronizing --
 * bonuses are framed narratively as "allied support" or "Imperial response"
 * rather than artificial difficulty adjustment.
 */

import type { CampaignState } from './types';
import { MOMENTUM_EFFECTS, MOMENTUM_MIN, MOMENTUM_MAX } from './types';

// ============================================================================
// MOMENTUM CALCULATION
// ============================================================================

/**
 * Update momentum after a mission completes.
 *
 * Rules:
 * - Victory: +1 momentum
 * - Defeat: -1 momentum
 * - Draw: no change
 * - Perfect victory (all objectives, no wounds): +2
 * - Total defeat (all heroes incapacitated): -2
 * - Clamped to [-3, +3]
 */
export function updateMomentum(
  campaign: CampaignState,
  outcome: 'victory' | 'defeat' | 'draw',
  allObjectivesCompleted: boolean,
  noHeroesWounded: boolean,
  allHeroesIncapacitated: boolean,
): CampaignState {
  const current = campaign.momentum ?? 0;
  let delta = 0;

  if (outcome === 'victory') {
    delta = (allObjectivesCompleted && noHeroesWounded) ? 2 : 1;
  } else if (outcome === 'defeat') {
    delta = allHeroesIncapacitated ? -2 : -1;
  }

  const newMomentum = Math.max(MOMENTUM_MIN, Math.min(MOMENTUM_MAX, current + delta));

  return {
    ...campaign,
    momentum: newMomentum,
  };
}

/**
 * Get the current momentum effects for the campaign.
 * Returns the bonuses/penalties that should be applied to the next mission.
 */
export function getMomentumEffects(campaign: CampaignState): {
  label: string;
  bonusTacticCards: number;
  bonusCredits: number;
  bonusDeployPoints: number;
  threatReduction: number;
  description: string;
  momentum: number;
} {
  const momentum = campaign.momentum ?? 0;
  const clamped = Math.max(MOMENTUM_MIN, Math.min(MOMENTUM_MAX, momentum));
  const effects = MOMENTUM_EFFECTS[clamped];

  return {
    ...effects,
    momentum: clamped,
  };
}

/**
 * Apply momentum credit bonus/penalty to campaign after a mission.
 * Positive bonusCredits = player gets credits, negative = loses credits.
 */
export function applyMomentumCredits(campaign: CampaignState): CampaignState {
  const { bonusCredits } = getMomentumEffects(campaign);
  if (bonusCredits === 0) return campaign;

  return {
    ...campaign,
    credits: Math.max(0, campaign.credits + bonusCredits),
  };
}

/**
 * Get the threat reduction/increase from momentum for mission setup.
 */
export function getMomentumThreatAdjustment(campaign: CampaignState): number {
  return getMomentumEffects(campaign).threatReduction;
}

/**
 * Get the number of bonus (or fewer) tactic cards from momentum.
 */
export function getMomentumTacticCardBonus(campaign: CampaignState): number {
  return getMomentumEffects(campaign).bonusTacticCards;
}

/**
 * Get a narrative description of the current momentum state.
 * Used in the between-mission briefing screen.
 */
export function getMomentumNarrative(campaign: CampaignState): string {
  const momentum = campaign.momentum ?? 0;
  const { label, description } = getMomentumEffects(campaign);

  if (momentum === 0) return description;

  const direction = momentum < 0 ? 'behind' : 'ahead';
  return `Campaign momentum: ${label} (${Math.abs(momentum)} ${direction}). ${description}`;
}

/**
 * Reset momentum to neutral (0). Used for act transitions or special events.
 */
export function resetMomentum(campaign: CampaignState): CampaignState {
  return { ...campaign, momentum: 0 };
}

/**
 * Faction Reputation System (Ark Nova Association Board inspired)
 *
 * Multiple faction tracks with threshold-based rewards. Reputation is earned
 * through social encounters, mission choices, and combat outcomes. Threshold
 * rewards unlock gear, allies, intel, cards, and tag bonuses.
 *
 * Design:
 * - 4 factions: Rebel Alliance, Underworld Syndicate, Local Resistance, Mandalorian Clans
 * - Reputation can go negative (hostile) or positive (allied)
 * - Threshold rewards are one-time unlocks (tracked in campaign.claimedFactionRewards)
 * - Faction choices create meaningful campaign divergence without requiring new missions
 */

import type {
  CampaignState,
  FactionDefinition,
  FactionThreshold,
  FactionReward,
  FactionRewardType,
  TacticCardTag,
} from './types.js';

// ============================================================================
// REPUTATION QUERIES
// ============================================================================

/**
 * Get current reputation with a faction. Returns 0 if no reputation exists.
 */
export function getFactionReputation(
  campaign: CampaignState,
  factionId: string,
): number {
  return (campaign.factionReputation ?? {})[factionId] ?? 0;
}

/**
 * Get all faction reputations as a sorted array.
 */
export function getAllFactionReputations(
  campaign: CampaignState,
  factions: Record<string, FactionDefinition>,
): Array<{ factionId: string; name: string; reputation: number; currentTier: number; nextThreshold: number | null }> {
  return Object.values(factions).map(faction => {
    const rep = getFactionReputation(campaign, faction.id);
    const claimed = (campaign.claimedFactionRewards ?? {})[faction.id] ?? [];
    const currentTier = claimed.length;
    const nextThreshold = faction.thresholds.find(t => !claimed.includes(t.reputation));
    return {
      factionId: faction.id,
      name: faction.name,
      reputation: rep,
      currentTier,
      nextThreshold: nextThreshold?.reputation ?? null,
    };
  });
}

/**
 * Get the highest claimed threshold for a faction.
 */
export function getHighestClaimedThreshold(
  campaign: CampaignState,
  factionId: string,
): number {
  const claimed = (campaign.claimedFactionRewards ?? {})[factionId] ?? [];
  return claimed.length > 0 ? Math.max(...claimed) : 0;
}

// ============================================================================
// REPUTATION MODIFICATION
// ============================================================================

/**
 * Modify reputation with a faction. Clamps to min/max bounds.
 * Returns updated campaign state.
 */
export function modifyFactionReputation(
  campaign: CampaignState,
  factionId: string,
  delta: number,
  faction?: FactionDefinition,
): CampaignState {
  const current = getFactionReputation(campaign, factionId);
  let newRep = current + delta;

  if (faction) {
    const min = faction.minReputation ?? -10;
    const max = faction.maxReputation ?? 20;
    newRep = Math.max(min, Math.min(max, newRep));
  }

  return {
    ...campaign,
    factionReputation: {
      ...(campaign.factionReputation ?? {}),
      [factionId]: newRep,
    },
  };
}

// ============================================================================
// THRESHOLD CHECKING & REWARDS
// ============================================================================

/**
 * Check if any new thresholds have been crossed and return unclaimed rewards.
 * Does NOT mutate campaign state -- caller must apply rewards and mark as claimed.
 */
export function getUnclaimedThresholdRewards(
  campaign: CampaignState,
  factionId: string,
  faction: FactionDefinition,
): FactionThreshold[] {
  const rep = getFactionReputation(campaign, factionId);
  const claimed = new Set((campaign.claimedFactionRewards ?? {})[factionId] ?? []);

  return faction.thresholds.filter(t =>
    rep >= t.reputation && !claimed.has(t.reputation),
  );
}

/**
 * Mark a threshold as claimed in the campaign state.
 */
export function claimThresholdReward(
  campaign: CampaignState,
  factionId: string,
  thresholdReputation: number,
): CampaignState {
  const existing = (campaign.claimedFactionRewards ?? {})[factionId] ?? [];
  if (existing.includes(thresholdReputation)) return campaign;

  return {
    ...campaign,
    claimedFactionRewards: {
      ...(campaign.claimedFactionRewards ?? {}),
      [factionId]: [...existing, thresholdReputation],
    },
  };
}

/**
 * Apply faction threshold rewards to campaign state.
 * Handles credits, equipment (to inventory), discounts, intel, and tag bonuses.
 * Returns updated campaign with rewards applied and thresholds claimed.
 */
export function applyFactionRewards(
  campaign: CampaignState,
  factionId: string,
  threshold: FactionThreshold,
): CampaignState {
  let state = claimThresholdReward(campaign, factionId, threshold.reputation);

  for (const reward of threshold.rewards) {
    switch (reward.type) {
      case 'credits':
        if (reward.credits) {
          state = { ...state, credits: state.credits + reward.credits };
        }
        break;

      case 'equipment':
        if (reward.itemId) {
          state = {
            ...state,
            inventory: [...(state.inventory ?? []), reward.itemId],
          };
        }
        break;

      case 'discount':
        if (reward.discountPercent) {
          const discounts = { ...(state.activeDiscounts ?? {}) };
          discounts[factionId] = Math.min(
            (discounts[factionId] ?? 0) + reward.discountPercent,
            50,
          );
          state = { ...state, activeDiscounts: discounts };
        }
        break;

      case 'intel':
        if (reward.missionId) {
          const intelKey = `intel:${reward.missionId}`;
          if (!state.narrativeItems.includes(intelKey)) {
            state = {
              ...state,
              narrativeItems: [...state.narrativeItems, intelKey],
            };
          }
        }
        break;

      case 'reinforcement':
        if (reward.npcProfileId) {
          const companions = state.companions ?? [];
          if (!companions.includes(reward.npcProfileId)) {
            state = {
              ...state,
              companions: [...companions, reward.npcProfileId],
            };
          }
        }
        break;

      case 'tag-bonus':
        // Tag bonuses are tracked as narrative items: "faction-tag:<factionId>:<tag>"
        if (reward.tag) {
          const tagKey = `faction-tag:${factionId}:${reward.tag}`;
          if (!state.narrativeItems.includes(tagKey)) {
            state = {
              ...state,
              narrativeItems: [...state.narrativeItems, tagKey],
            };
          }
        }
        break;

      case 'tactic-card':
        // Tactic card rewards are tracked as narrative items for deck building
        if (reward.cardId) {
          const cardKey = `faction-card:${reward.cardId}`;
          if (!state.narrativeItems.includes(cardKey)) {
            state = {
              ...state,
              narrativeItems: [...state.narrativeItems, cardKey],
            };
          }
        }
        break;
    }
  }

  return state;
}

/**
 * Process all unclaimed rewards for all factions after a reputation change.
 * Convenience function that checks every faction and applies any newly crossed thresholds.
 */
export function processAllFactionRewards(
  campaign: CampaignState,
  factions: Record<string, FactionDefinition>,
): { campaign: CampaignState; newRewards: Array<{ factionId: string; threshold: FactionThreshold }> } {
  let state = campaign;
  const newRewards: Array<{ factionId: string; threshold: FactionThreshold }> = [];

  for (const faction of Object.values(factions)) {
    const unclaimed = getUnclaimedThresholdRewards(state, faction.id, faction);
    for (const threshold of unclaimed) {
      state = applyFactionRewards(state, faction.id, threshold);
      newRewards.push({ factionId: faction.id, threshold });
    }
  }

  return { campaign: state, newRewards };
}

// ============================================================================
// TAG SOURCE HELPERS
// ============================================================================

/**
 * Get all tag sources from faction rewards for a campaign.
 * Used by the card synergy system to count tag sources.
 */
export function getFactionTagSources(campaign: CampaignState): TacticCardTag[] {
  return (campaign.narrativeItems ?? [])
    .filter(item => item.startsWith('faction-tag:'))
    .map(item => item.split(':')[2] as TacticCardTag);
}

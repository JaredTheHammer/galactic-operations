/**
 * Contract/Bounty System (Dune: Imperium - Uprising Contract Tiles)
 *
 * Side objectives available at social hubs or mission start.
 * Completing conditions during a mission yields bonus rewards.
 */

import type {
  Contract,
  ContractCondition,
  ContractConditionType,
  ActiveContract,
  ContractReward,
  ContractTier,
  CampaignState,
  GameState,
  MissionResult,
  DuneMechanicsState,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

export const MAX_ACTIVE_CONTRACTS = 3;

export const TIER_REWARD_MULTIPLIERS: Record<ContractTier, number> = {
  bronze: 1.0,
  silver: 1.5,
  gold: 2.0,
};

// ============================================================================
// Contract Availability
// ============================================================================

/** Get contracts available for the current campaign state */
export function getAvailableContracts(
  allContracts: Contract[],
  campaign: CampaignState,
): Contract[] {
  const completedIds = campaign.duneMechanics?.completedContractIds ?? [];
  return allContracts.filter((c) => {
    if (!c.availableInActs.includes(campaign.currentAct)) return false;
    if (!c.repeatable && completedIds.includes(c.id)) return false;
    return true;
  });
}

/** Check if the player can accept another contract */
export function canAcceptContract(campaign: CampaignState): boolean {
  const active = campaign.duneMechanics?.activeContracts ?? [];
  return active.filter((c) => !c.completed).length < MAX_ACTIVE_CONTRACTS;
}

// ============================================================================
// Contract Activation
// ============================================================================

/** Accept a contract, adding it to the active list */
export function acceptContract(
  campaign: CampaignState,
  contract: Contract,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  if (!canAcceptContract(campaign)) return campaign;

  const activeContract: ActiveContract = {
    contractId: contract.id,
    progress: {},
    completed: false,
  };

  // Initialize progress counters for count-based conditions
  for (const cond of contract.conditions) {
    const key = conditionKey(cond);
    activeContract.progress[key] = 0;
  }

  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      activeContracts: [...dm.activeContracts, activeContract],
    },
  };
}

/** Abandon an active contract */
export function abandonContract(
  campaign: CampaignState,
  contractId: string,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      activeContracts: dm.activeContracts.filter(
        (c) => c.contractId !== contractId,
      ),
    },
  };
}

// ============================================================================
// Contract Progress Tracking (called during mission)
// ============================================================================

/** Update contract progress based on a game event */
export function updateContractProgress(
  activeContracts: ActiveContract[],
  allContracts: Contract[],
  eventType: ContractConditionType,
  eventValue: number,
  eventMeta?: string,
): ActiveContract[] {
  return activeContracts.map((ac) => {
    if (ac.completed) return ac;
    const contract = allContracts.find((c) => c.id === ac.contractId);
    if (!contract) return ac;

    const newProgress = { ...ac.progress };
    let anyUpdate = false;

    for (const cond of contract.conditions) {
      if (cond.type !== eventType) continue;

      // Type-based matching (e.g., combo type, NPC tier)
      if (cond.targetValue && eventMeta !== cond.targetValue) continue;

      const key = conditionKey(cond);
      newProgress[key] = (newProgress[key] ?? 0) + eventValue;
      anyUpdate = true;
    }

    if (!anyUpdate) return ac;
    return { ...ac, progress: newProgress };
  });
}

/** Check if all conditions of a contract are met */
export function isContractComplete(
  active: ActiveContract,
  contract: Contract,
  missionState: { roundsPlayed: number; morale: number },
): boolean {
  return contract.conditions.every((cond) =>
    isConditionMet(cond, active.progress, missionState),
  );
}

/** Evaluate all active contracts after mission completion */
export function evaluateContracts(
  activeContracts: ActiveContract[],
  allContracts: Contract[],
  missionState: { roundsPlayed: number; morale: number },
): ActiveContract[] {
  return activeContracts.map((ac) => {
    if (ac.completed) return ac;
    const contract = allContracts.find((c) => c.id === ac.contractId);
    if (!contract) return ac;
    if (isContractComplete(ac, contract, missionState)) {
      return { ...ac, completed: true };
    }
    return ac;
  });
}

// ============================================================================
// Reward Collection
// ============================================================================

/** Apply rewards from completed contracts to campaign state */
export function collectContractRewards(
  campaign: CampaignState,
  allContracts: Contract[],
  bonusRewardPercent: number = 0,
): { campaign: CampaignState; rewardsCollected: Array<{ contractId: string; reward: ContractReward }> } {
  const dm = ensureDuneMechanics(campaign);
  const rewardsCollected: Array<{ contractId: string; reward: ContractReward }> = [];
  let updatedCampaign = { ...campaign };
  const newCompletedIds = [...dm.completedContractIds];

  for (const ac of dm.activeContracts) {
    if (!ac.completed) continue;
    const contract = allContracts.find((c) => c.id === ac.contractId);
    if (!contract) continue;

    const multiplier = 1 + bonusRewardPercent / 100;
    const reward = contract.reward;

    if (reward.credits) {
      updatedCampaign = {
        ...updatedCampaign,
        credits: updatedCampaign.credits + Math.floor(reward.credits * multiplier),
      };
    }
    if (reward.xp) {
      // XP distributed evenly to all heroes
      const heroes = { ...updatedCampaign.heroes };
      const heroIds = Object.keys(heroes);
      const xpPer = Math.floor((reward.xp * multiplier) / heroIds.length);
      for (const hid of heroIds) {
        heroes[hid] = {
          ...heroes[hid],
          xp: {
            ...heroes[hid].xp,
            total: heroes[hid].xp.total + xpPer,
            available: heroes[hid].xp.available + xpPer,
          },
        };
      }
      updatedCampaign = { ...updatedCampaign, heroes };
    }
    if (reward.narrativeItemId) {
      updatedCampaign = {
        ...updatedCampaign,
        narrativeItems: [...updatedCampaign.narrativeItems, reward.narrativeItemId],
      };
    }
    if (reward.consumableId && reward.consumableQty) {
      const inv = { ...updatedCampaign.consumableInventory };
      inv[reward.consumableId] = (inv[reward.consumableId] ?? 0) + reward.consumableQty;
      updatedCampaign = { ...updatedCampaign, consumableInventory: inv };
    }

    rewardsCollected.push({ contractId: contract.id, reward });
    if (!newCompletedIds.includes(contract.id)) {
      newCompletedIds.push(contract.id);
    }
  }

  // Remove completed contracts from active list, keep incomplete ones
  const remainingActive = dm.activeContracts.filter((ac) => !ac.completed);

  updatedCampaign = {
    ...updatedCampaign,
    duneMechanics: {
      ...dm,
      activeContracts: remainingActive,
      completedContractIds: newCompletedIds,
    },
  };

  return { campaign: updatedCampaign, rewardsCollected };
}

// ============================================================================
// Helpers
// ============================================================================

function conditionKey(cond: ContractCondition): string {
  return `${cond.type}${cond.targetValue ? ':' + cond.targetValue : ''}`;
}

function isConditionMet(
  cond: ContractCondition,
  progress: Record<string, number>,
  missionState: { roundsPlayed: number; morale: number },
): boolean {
  const key = conditionKey(cond);
  const current = progress[key] ?? 0;

  switch (cond.type) {
    case 'eliminate_count':
    case 'eliminate_type':
    case 'collect_loot':
    case 'use_combo':
    case 'interact_objectives':
    case 'hero_kills':
      return current >= (cond.targetCount ?? 1);

    case 'no_wounds':
    case 'no_incapacitation':
      // These are "negative" conditions -- progress tracks failures.
      // If any wound/incap happened, current > 0 means failure.
      return current === 0;

    case 'complete_in_rounds':
      return missionState.roundsPlayed <= (cond.threshold ?? 99);

    case 'maintain_morale':
      return missionState.morale >= (cond.threshold ?? 6);

    default:
      return false;
  }
}

function ensureDuneMechanics(campaign: CampaignState): DuneMechanicsState {
  return campaign.duneMechanics ?? createDefaultDuneMechanics();
}

export function createDefaultDuneMechanics(): DuneMechanicsState {
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

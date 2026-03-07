/**
 * Galactic Operations v2 - Social Phase Engine
 * Manages the between-mission social phase: NPC encounters, skill checks,
 * shopping, companion recruitment, and narrative interactions.
 *
 * Phase 9: Social Check Phase
 *
 * Expansion: Time Slots, Rival NPC, Threat Clock, Bounty System
 * The social phase is a resource-constrained preparation round (~25% of gameplay).
 * Players spend limited slots on activities while a rival NPC competes and a
 * threat clock ticks toward enemy preparedness.
 */

import type {
  CampaignState,
  HeroCharacter,
  SocialPhaseLocation,
  SocialEncounter,
  SocialDialogueOption,
  SocialNPC,
  SocialOutcome,
  SocialCheckResult,
  SocialPhaseResult,
  Shop,
  ShopItem,
  SocialSkillId,
  Disposition,
  RivalNPC,
  RivalAction,
  RivalActionType,
  RivalState,
  BountyContract,
  BountyPrepResult,
  SocialPhaseState,
  SocialActivityType,
  SocialActivity,
  ThreatClockLevel,
  ThreatClockEffects,
  ExpandedSocialPhaseResult,
  ActProgress,
} from './types';

import {
  DISPOSITION_DIFFICULTY,
  SOCIAL_SKILLS,
  RIVAL_PRIORITIES,
  RIVAL_SLOTS_BY_ACT,
  ACTIVITY_CLOCK_TICKS,
  SLOTS_PER_ACT,
  createActProgress,
} from './types';

import {
  resolveSkillCheck,
  resolveOpposedSkillCheck,
  type SkillCheckResult,
} from './character-v2';

import { type RollFn, defaultRollFn } from './dice-v2';

// ============================================================================
// SOCIAL ENCOUNTER AVAILABILITY
// ============================================================================

/**
 * Filter encounters at a location to only those available given campaign state.
 * Checks mission prerequisites and narrative item requirements.
 */
export function getAvailableEncounters(
  location: SocialPhaseLocation,
  campaign: CampaignState,
  completedEncounterIds: Set<string> = new Set(),
): SocialEncounter[] {
  const completedMissionIds = new Set(campaign.completedMissions.map(r => r.missionId));

  return location.encounters.filter(enc => {
    // Skip non-repeatable encounters already completed
    if (!enc.repeatable && completedEncounterIds.has(enc.id)) return false;

    // Check act requirement
    if (enc.availableInAct !== undefined && enc.availableInAct !== campaign.currentAct) return false;

    // Check mission prerequisites
    if (enc.requiresMissions) {
      if (!enc.requiresMissions.every(mId => completedMissionIds.has(mId))) return false;
    }

    // Check narrative item prerequisites
    if (enc.requiresNarrativeItems) {
      if (!enc.requiresNarrativeItems.every(item => campaign.narrativeItems.includes(item))) return false;
    }

    return true;
  });
}

/**
 * Filter dialogue options within an encounter to those the hero qualifies for.
 * Checks narrative item requirements and minimum skill ranks.
 */
export function getAvailableDialogueOptions(
  encounter: SocialEncounter,
  hero: HeroCharacter,
  campaign: CampaignState,
): SocialDialogueOption[] {
  return encounter.dialogueOptions.filter(opt => {
    // Check narrative item prerequisite
    if (opt.requiresNarrativeItem && !campaign.narrativeItems.includes(opt.requiresNarrativeItem)) {
      return false;
    }

    // Check minimum skill rank
    if (opt.requiresSkillRank !== undefined) {
      const heroRank = hero.skills[opt.skillId] ?? 0;
      if (heroRank < opt.requiresSkillRank) return false;
    }

    return true;
  });
}

// ============================================================================
// SOCIAL CHECK RESOLUTION
// ============================================================================

/**
 * Compute the effective difficulty for a social check, factoring in NPC disposition.
 * Difficulty cannot go below 1 (even friendly NPCs require at least a simple check).
 */
export function computeSocialDifficulty(
  baseDifficulty: number,
  disposition: Disposition,
): number {
  const modifier = DISPOSITION_DIFFICULTY[disposition];
  return Math.max(1, baseDifficulty + modifier);
}

/**
 * Resolve a social dialogue option as a skill check.
 * Returns the check result plus the outcomes that should be applied.
 */
export function resolveSocialCheck(
  hero: HeroCharacter,
  dialogueOption: SocialDialogueOption,
  npc: SocialNPC,
  rollFn: RollFn = defaultRollFn,
): { checkResult: SkillCheckResult; outcomes: SocialOutcome[]; narrativeText: string } {
  let checkResult: SkillCheckResult;
  const isWounded = hero.isWounded ?? false;

  if (dialogueOption.isOpposed && dialogueOption.opposedSkillId) {
    // Opposed check: hero's social skill vs NPC's opposing skill
    const opposedSkillId = dialogueOption.opposedSkillId;

    // Determine the NPC's characteristic for the opposed skill
    const npcCharacteristic = getNPCOpposedCharacteristic(npc, opposedSkillId);
    const npcSkillRank = npc.skills[opposedSkillId as keyof typeof npc.skills] ?? 0;

    checkResult = resolveOpposedSkillCheck(
      hero,
      dialogueOption.skillId,
      npcCharacteristic,
      npcSkillRank,
      rollFn,
      isWounded,
    );
  } else {
    // Standard check with disposition-modified difficulty
    const effectiveDifficulty = computeSocialDifficulty(
      dialogueOption.difficulty,
      npc.disposition,
    );

    checkResult = resolveSkillCheck(
      hero,
      dialogueOption.skillId,
      effectiveDifficulty,
      rollFn,
      isWounded,
    );
  }

  // Determine outcomes
  const outcomes: SocialOutcome[] = [];
  const narrativeParts: string[] = [];

  if (checkResult.isSuccess) {
    outcomes.push(...dialogueOption.successOutcomes);
    narrativeParts.push('Success.');

    // Triumph bonuses
    if (checkResult.triumphs > 0 && dialogueOption.triumphOutcomes) {
      for (let i = 0; i < checkResult.triumphs; i++) {
        outcomes.push(...dialogueOption.triumphOutcomes);
      }
      narrativeParts.push(`Triumph x${checkResult.triumphs}!`);
    }

    // Advantage spending
    if (checkResult.netAdvantages > 0 && dialogueOption.advantageSpend) {
      let remainingAdvantages = checkResult.netAdvantages;
      // Spend advantages greedily from most expensive to least
      const sortedSpends = [...dialogueOption.advantageSpend].sort((a, b) => b.cost - a.cost);
      for (const spend of sortedSpends) {
        while (remainingAdvantages >= spend.cost) {
          outcomes.push(spend.outcome);
          remainingAdvantages -= spend.cost;
          narrativeParts.push(spend.outcome.description);
        }
      }
    }
  } else {
    outcomes.push(...dialogueOption.failureOutcomes);
    narrativeParts.push('Failure.');

    // Despair consequences
    if (checkResult.despairs > 0 && dialogueOption.despairOutcomes) {
      for (let i = 0; i < checkResult.despairs; i++) {
        outcomes.push(...dialogueOption.despairOutcomes);
      }
      narrativeParts.push(`Despair x${checkResult.despairs}!`);
    }

    // Threat consequences (net negative advantages = threats)
    if (checkResult.netAdvantages < 0 && dialogueOption.threatConsequence) {
      let remainingThreats = Math.abs(checkResult.netAdvantages);
      const sortedConsequences = [...dialogueOption.threatConsequence].sort((a, b) => b.cost - a.cost);
      for (const consequence of sortedConsequences) {
        while (remainingThreats >= consequence.cost) {
          outcomes.push(consequence.outcome);
          remainingThreats -= consequence.cost;
          narrativeParts.push(consequence.outcome.description);
        }
      }
    }
  }

  return {
    checkResult,
    outcomes,
    narrativeText: narrativeParts.join(' '),
  };
}

/**
 * Get the NPC's characteristic value for an opposed skill check.
 * Maps skill IDs to the appropriate NPC characteristic.
 */
function getNPCOpposedCharacteristic(npc: SocialNPC, skillId: string): number {
  // Genesys skill-to-characteristic mapping for social/mental skills
  const skillCharacteristicMap: Record<string, keyof SocialNPC['characteristics']> = {
    'charm': 'presence',
    'negotiation': 'presence',
    'leadership': 'presence',
    'coercion': 'willpower',
    'deception': 'cunning',
    'cool': 'presence',
    'discipline': 'willpower',
    'vigilance': 'willpower',
    'skulduggery': 'cunning',
    'streetwise': 'cunning',
    'perception': 'cunning',
  };

  const charKey = skillCharacteristicMap[skillId];
  if (charKey && charKey in npc.characteristics) {
    return npc.characteristics[charKey];
  }
  // Fallback: use willpower as default opposition
  return npc.characteristics.willpower;
}

// ============================================================================
// OUTCOME APPLICATION
// ============================================================================

/**
 * Apply social outcomes to campaign state.
 * Returns the updated campaign state.
 */
export function applySocialOutcomes(
  campaign: CampaignState,
  outcomes: SocialOutcome[],
  heroId?: string,
): CampaignState {
  let state = { ...campaign };

  for (const outcome of outcomes) {
    switch (outcome.type) {
      case 'credits': {
        state = {
          ...state,
          credits: Math.max(0, state.credits + (outcome.credits ?? 0)),
        };
        break;
      }

      case 'narrative': {
        if (outcome.narrativeItemId && !state.narrativeItems.includes(outcome.narrativeItemId)) {
          state = {
            ...state,
            narrativeItems: [...state.narrativeItems, outcome.narrativeItemId],
          };
        }
        break;
      }

      case 'xp': {
        if (heroId && outcome.xpAmount && state.heroes[heroId]) {
          const hero = state.heroes[heroId];
          state = {
            ...state,
            heroes: {
              ...state.heroes,
              [heroId]: {
                ...hero,
                xp: {
                  total: hero.xp.total + outcome.xpAmount,
                  available: hero.xp.available + outcome.xpAmount,
                },
              },
            },
          };
        }
        break;
      }

      case 'companion': {
        if (outcome.companionId) {
          const companions = state.companions ?? [];
          if (!companions.includes(outcome.companionId)) {
            state = {
              ...state,
              companions: [...companions, outcome.companionId],
            };
          }
        }
        break;
      }

      case 'discount': {
        if (outcome.discountPercent !== undefined) {
          const discounts = { ...(state.activeDiscounts ?? {}) };
          // Key by a generic "social" key or factionId if provided
          const key = outcome.factionId ?? 'general';
          discounts[key] = Math.min(
            (discounts[key] ?? 0) + outcome.discountPercent,
            50, // Cap at 50%
          );
          state = { ...state, activeDiscounts: discounts };
        }
        break;
      }

      case 'reputation': {
        if (outcome.factionId && outcome.reputationDelta !== undefined) {
          const reputation = { ...(state.factionReputation ?? {}) };
          reputation[outcome.factionId] = (reputation[outcome.factionId] ?? 0) + outcome.reputationDelta;
          state = { ...state, factionReputation: reputation };
        }
        break;
      }

      case 'healing': {
        const targetId = outcome.healTargetId;
        if (targetId && targetId !== 'any' && state.heroes[targetId]) {
          const hero = state.heroes[targetId];
          if (hero.isWounded) {
            state = {
              ...state,
              heroes: {
                ...state.heroes,
                [targetId]: { ...hero, isWounded: false, missionsRested: 0 },
              },
            };
          }
        }
        break;
      }

      case 'information': {
        // Information outcomes add mission hints to narrative items
        if (outcome.missionId) {
          const intelKey = `intel:${outcome.missionId}`;
          if (!state.narrativeItems.includes(intelKey)) {
            state = {
              ...state,
              narrativeItems: [...state.narrativeItems, intelKey],
            };
          }
        }
        break;
      }

      case 'item': {
        // Item outcomes: add to first hero's gear (or specified hero)
        // Equipment management is simplified: items go to campaign-level inventory
        // (hero equipment assignment is handled by the client)
        if (outcome.itemId) {
          const itemKey = `item:${outcome.itemId}`;
          if (!state.narrativeItems.includes(itemKey)) {
            state = {
              ...state,
              narrativeItems: [...state.narrativeItems, itemKey],
            };
          }
        }
        break;
      }

      case 'cover_tracks': {
        // Reduce exposure via act progress
        if (outcome.exposureDelta && state.actProgress) {
          const newExposure = Math.max(0, state.actProgress.exposure + outcome.exposureDelta);
          state = {
            ...state,
            actProgress: {
              ...state.actProgress,
              exposure: newExposure,
            },
          };
        }
        break;
      }
    }
  }

  return state;
}

/**
 * Update campaign act progress based on a social check result.
 * - Success: influence +1
 * - Triumph: influence +2 (instead of +1)
 * - Failed coercion/deception: exposure +1
 * - Despair: exposure +2
 * - Reputation gain outcomes: influence +1
 * - Companion recruited outcomes: influence +2
 */
export function updateActProgressFromSocialCheck(
  campaign: CampaignState,
  checkResult: SocialCheckResult,
): CampaignState {
  let actProgress = campaign.actProgress ?? createActProgress(campaign.currentAct);

  let exposureDelta = 0;
  let influenceDelta = 0;

  if (checkResult.isSuccess) {
    // Triumph gives +2, regular success gives +1
    influenceDelta += checkResult.triumphs > 0 ? 2 : 1;
  } else {
    // Failed coercion/deception: +1 exposure
    if (checkResult.skillUsed === 'coercion' || checkResult.skillUsed === 'deception') {
      exposureDelta += 1;
    }
  }

  // Despair: +2 exposure
  if (checkResult.despairs > 0) {
    exposureDelta += checkResult.despairs * 2;
  }

  // Check outcomes for reputation and companion gains
  for (const outcome of checkResult.outcomesApplied) {
    if (outcome.type === 'reputation' && outcome.reputationDelta && outcome.reputationDelta > 0) {
      influenceDelta += 1;
    }
    if (outcome.type === 'companion') {
      influenceDelta += 2;
    }
  }

  if (exposureDelta === 0 && influenceDelta === 0) return campaign;

  const newExposure = Math.max(0, Math.min(10, actProgress.exposure + exposureDelta));
  const newInfluence = actProgress.influence + influenceDelta;

  return {
    ...campaign,
    actProgress: {
      ...actProgress,
      exposure: newExposure,
      influence: newInfluence,
    },
  };
}

// ============================================================================
// SHOPPING
// ============================================================================

/**
 * Calculate the effective price of an item, applying any active discounts.
 */
export function getEffectivePrice(
  item: ShopItem,
  campaign: CampaignState,
): number {
  const discounts = campaign.activeDiscounts ?? {};
  // Apply the highest applicable discount
  const maxDiscount = Math.max(0, ...Object.values(discounts));
  const discountMultiplier = 1 - (maxDiscount / 100);
  return Math.ceil(item.basePrice * discountMultiplier);
}

/**
 * Attempt to purchase an item from a shop.
 * Returns updated campaign state, or null if purchase failed.
 */
export function purchaseItem(
  campaign: CampaignState,
  shop: Shop,
  itemId: string,
): { campaign: CampaignState; price: number } | null {
  const shopItem = shop.inventory.find(i => i.itemId === itemId);
  if (!shopItem) return null;

  // Check stock
  if (shopItem.stock === 0) return null;

  // Check narrative prerequisites
  if (shopItem.requiresNarrativeItems) {
    if (!shopItem.requiresNarrativeItems.every(item => campaign.narrativeItems.includes(item))) {
      return null;
    }
  }

  const price = getEffectivePrice(shopItem, campaign);
  if (campaign.credits < price) return null;

  // Deduct credits and add item to narrative items (as item:id)
  const itemKey = `item:${itemId}`;
  const narrativeItems = campaign.narrativeItems.includes(itemKey)
    ? campaign.narrativeItems
    : [...campaign.narrativeItems, itemKey];

  // Reduce stock (if not unlimited)
  const updatedInventory = shop.inventory.map(i => {
    if (i.itemId === itemId && i.stock > 0) {
      return { ...i, stock: i.stock - 1 };
    }
    return i;
  });

  // Track consumable inventory (stackable quantities)
  const isConsumable = shopItem.category === 'consumable';
  const consumableInventory = isConsumable
    ? {
        ...(campaign.consumableInventory ?? {}),
        [itemId]: ((campaign.consumableInventory ?? {})[itemId] ?? 0) + 1,
      }
    : (campaign.consumableInventory ?? {});
  // Add weapon/armor items to equipment inventory for equipping on heroes
  const isEquipment = shopItem.category === 'weapon' || shopItem.category === 'armor';
  const equipmentInventory = isEquipment
    ? [...(campaign.inventory ?? []), itemId]
    : (campaign.inventory ?? []);

  return {
    campaign: {
      ...campaign,
      credits: campaign.credits - price,
      narrativeItems,
      consumableInventory,
      inventory: equipmentInventory,
    },
    price,
  };
}

/**
 * Sell an item back to a shop.
 * Returns updated campaign state and revenue, or null if sell failed.
 */
export function sellItem(
  campaign: CampaignState,
  shop: Shop,
  itemId: string,
  basePrice: number,
): { campaign: CampaignState; revenue: number } | null {
  // Check the item key exists
  const itemKey = `item:${itemId}`;
  if (!campaign.narrativeItems.includes(itemKey)) return null;

  // Check shop buys this category (simplified: all items are sellable if buyCategories is non-empty)
  if (shop.buyCategories.length === 0) return null;

  const revenue = Math.floor(basePrice * shop.sellRate);

  // Decrement consumable inventory if applicable
  const inv = campaign.consumableInventory ?? {};
  const isConsumable = (inv[itemId] ?? 0) > 0;
  const consumableInventory = isConsumable
    ? { ...inv, [itemId]: inv[itemId] - 1 }
    : inv;
  // Also remove from equipment inventory if present
  const inventory = [...(campaign.inventory ?? [])];
  const invIdx = inventory.indexOf(itemId);
  if (invIdx !== -1) inventory.splice(invIdx, 1);

  return {
    campaign: {
      ...campaign,
      credits: campaign.credits + revenue,
      consumableInventory,
      narrativeItems: campaign.narrativeItems.filter(item => item !== itemKey),
      inventory,
    },
    revenue,
  };
}

// ============================================================================
// SOCIAL PHASE ORCHESTRATION
// ============================================================================

/**
 * Execute a full social encounter: hero picks a dialogue option, resolve the check,
 * apply outcomes to campaign state.
 */
export function executeSocialEncounter(
  campaign: CampaignState,
  encounter: SocialEncounter,
  dialogueOptionId: string,
  heroId: string,
  npcs: Record<string, SocialNPC>,
  rollFn: RollFn = defaultRollFn,
): { campaign: CampaignState; result: SocialCheckResult } {
  const hero = campaign.heroes[heroId];
  if (!hero) throw new Error(`Hero ${heroId} not found in campaign`);

  const option = encounter.dialogueOptions.find(d => d.id === dialogueOptionId);
  if (!option) throw new Error(`Dialogue option ${dialogueOptionId} not found`);

  const npc = npcs[encounter.npcId];
  if (!npc) throw new Error(`NPC ${encounter.npcId} not found`);

  // Resolve the check
  const { checkResult, outcomes, narrativeText } = resolveSocialCheck(hero, option, npc, rollFn);

  // Apply outcomes
  let updatedCampaign = applySocialOutcomes(campaign, outcomes, heroId);

  const result: SocialCheckResult = {
    encounterId: encounter.id,
    dialogueOptionId,
    heroId,
    skillUsed: option.skillId,
    isSuccess: checkResult.isSuccess,
    netSuccesses: checkResult.netSuccesses,
    netAdvantages: checkResult.netAdvantages,
    triumphs: checkResult.triumphs,
    despairs: checkResult.despairs,
    outcomesApplied: outcomes,
    narrativeText,
  };

  // Update act progress (exposure/influence) based on check result
  updatedCampaign = updateActProgressFromSocialCheck(updatedCampaign, result);

  return { campaign: updatedCampaign, result };
}

/**
 * Finalize the social phase: record the results in campaign state.
 */
export function completeSocialPhase(
  campaign: CampaignState,
  locationId: string,
  encounterResults: SocialCheckResult[],
  purchases: Array<{ itemId: string; price: number }>,
  sales: Array<{ itemId: string; revenue: number }>,
  healingCreditsSpent: number,
): CampaignState {
  const phaseResult: SocialPhaseResult = {
    locationId,
    encounterResults,
    itemsPurchased: purchases,
    itemsSold: sales,
    creditsSpentOnHealing: healingCreditsSpent,
    completedAt: new Date().toISOString(),
  };

  const history = campaign.socialPhaseResults ?? [];

  return {
    ...campaign,
    socialPhaseResults: [...history, phaseResult],
  };
}

/**
 * Get a summary of social encounter options for a hero at a location.
 * Used by the client to display available interactions.
 */
export function getSocialPhaseSummary(
  location: SocialPhaseLocation,
  campaign: CampaignState,
  npcs: Record<string, SocialNPC>,
  completedEncounterIds: Set<string> = new Set(),
): {
  availableEncounters: Array<{
    encounter: SocialEncounter;
    npc: SocialNPC;
    heroOptions: Record<string, SocialDialogueOption[]>;
  }>;
  shops: Shop[];
} {
  const encounters = getAvailableEncounters(location, campaign, completedEncounterIds);

  const availableEncounters = encounters.map(enc => {
    const npc = npcs[enc.npcId];
    const heroOptions: Record<string, SocialDialogueOption[]> = {};

    for (const hero of Object.values(campaign.heroes)) {
      const options = getAvailableDialogueOptions(enc, hero, campaign);
      if (options.length > 0) {
        heroOptions[hero.id] = options;
      }
    }

    return { encounter: enc, npc, heroOptions };
  });

  return {
    availableEncounters,
    shops: location.shops,
  };
}

// ============================================================================
// SOCIAL PHASE EXPANSION: Time Slots, Rival, Threat Clock, Bounties
// ============================================================================

/**
 * Disposition ordering for stepping negative/positive.
 */
const DISPOSITION_ORDER: Disposition[] = ['friendly', 'neutral', 'unfriendly', 'hostile'];

/**
 * Step a disposition toward hostile by `steps`.
 */
export function shiftDisposition(current: Disposition, steps: number): Disposition {
  const idx = DISPOSITION_ORDER.indexOf(current);
  const newIdx = Math.min(DISPOSITION_ORDER.length - 1, Math.max(0, idx + steps));
  return DISPOSITION_ORDER[newIdx];
}

/**
 * Initialize the social phase state with slots, clock, rival, and bounties.
 */
export function initializeSocialPhase(
  campaign: CampaignState,
  act: number,
  bounties: BountyContract[],
  bonusSlots: number = 0,
): SocialPhaseState {
  const slotsTotal = (SLOTS_PER_ACT[act] ?? 4) + bonusSlots;
  const rivalSlots = RIVAL_SLOTS_BY_ACT[act] ?? 2;

  // Filter out bounties already completed
  const completedBountyIds = new Set(campaign.completedBounties ?? []);
  const availableBounties = bounties.filter(b => !completedBountyIds.has(b.id));

  return {
    slotsRemaining: slotsTotal,
    slotsTotal,
    threatClock: 0,
    rivalSlotsRemaining: rivalSlots,
    rivalActionsThisPhase: [],
    availableBounties,
    acceptedBounties: [],
    preppedBounties: [],
    rivalClaimedBounties: [],
    activities: [],
    dispositionOverrides: {},
    rivalBoughtItems: [],
    deployedEarly: false,
    act,
  };
}

/**
 * Accept a bounty (free action, no slot cost).
 * Returns updated state or null if bounty not available.
 */
export function acceptBounty(
  state: SocialPhaseState,
  bountyId: string,
): SocialPhaseState | null {
  const bounty = state.availableBounties.find(b => b.id === bountyId);
  if (!bounty) return null;
  if (state.acceptedBounties.includes(bountyId)) return null;
  if (state.rivalClaimedBounties.includes(bountyId)) return null;
  // Max 2 active bounties
  if (state.acceptedBounties.length >= 2) return null;

  return {
    ...state,
    acceptedBounties: [...state.acceptedBounties, bountyId],
  };
}

/**
 * Resolve a rival action based on archetype priorities and available targets.
 */
export function resolveRivalAction(
  state: SocialPhaseState,
  rival: RivalNPC,
  location: SocialPhaseLocation,
): RivalAction {
  const priorities = RIVAL_PRIORITIES[rival.archetype];

  for (const actionType of priorities) {
    switch (actionType) {
      case 'claim_bounty': {
        // Find an unclaimed, un-accepted bounty sorted by rival priority
        const targets = state.availableBounties
          .filter(b =>
            !state.acceptedBounties.includes(b.id) &&
            !state.rivalClaimedBounties.includes(b.id),
          )
          .sort((a, b) => b.rivalPriority - a.rivalPriority);

        if (targets.length > 0) {
          return {
            type: 'claim_bounty',
            targetId: targets[0].id,
            description: `${rival.name} claimed the bounty on ${targets[0].targetName}.`,
          };
        }
        break;
      }

      case 'poison_contact': {
        // Find an NPC whose disposition isn't already hostile
        const poisonSteps = state.act >= 2 ? 2 : 1;
        for (const enc of location.encounters) {
          const npcId = enc.npcId;
          const currentDisp = state.dispositionOverrides[npcId];
          // Only poison if not already hostile
          if (currentDisp !== 'hostile' && !state.rivalActionsThisPhase.some(
            a => a.type === 'poison_contact' && a.targetId === npcId,
          )) {
            // Find the NPC's name from encounter for description
            return {
              type: 'poison_contact',
              targetId: npcId,
              description: `${rival.name} undermined your contact -- an NPC's disposition has shifted.`,
            };
          }
        }
        break;
      }

      case 'buy_stock': {
        // Buy the most expensive item from a shop that still has stock
        for (const shop of location.shops) {
          const buyable = shop.inventory
            .filter(item => item.stock > 0 && !state.rivalBoughtItems.includes(item.itemId))
            .sort((a, b) => b.basePrice - a.basePrice);

          if (buyable.length > 0) {
            return {
              type: 'buy_stock',
              targetId: buyable[0].itemId,
              description: `${rival.name} bought out ${buyable[0].itemId} from ${shop.name}.`,
            };
          }
        }
        break;
      }

      case 'gather_intel': {
        return {
          type: 'gather_intel',
          description: `${rival.name} gathered intelligence -- the enemy is better prepared.`,
        };
      }
    }
  }

  // Fallback: no valid targets
  return {
    type: 'lay_low',
    description: `${rival.name} kept a low profile.`,
  };
}

/**
 * Apply a rival action to the social phase state.
 */
export function applyRivalAction(
  state: SocialPhaseState,
  action: RivalAction,
  npcs: Record<string, SocialNPC>,
): SocialPhaseState {
  let updated = {
    ...state,
    rivalSlotsRemaining: state.rivalSlotsRemaining - 1,
    rivalActionsThisPhase: [...state.rivalActionsThisPhase, action],
  };

  switch (action.type) {
    case 'claim_bounty': {
      if (action.targetId) {
        updated = {
          ...updated,
          rivalClaimedBounties: [...updated.rivalClaimedBounties, action.targetId],
        };
      }
      break;
    }

    case 'poison_contact': {
      if (action.targetId) {
        const npc = npcs[action.targetId];
        const currentDisp = updated.dispositionOverrides[action.targetId]
          ?? npc?.disposition
          ?? 'neutral';
        const steps = updated.act >= 2 ? 2 : 1;
        updated = {
          ...updated,
          dispositionOverrides: {
            ...updated.dispositionOverrides,
            [action.targetId]: shiftDisposition(currentDisp, steps),
          },
        };
      }
      break;
    }

    case 'buy_stock': {
      if (action.targetId) {
        updated = {
          ...updated,
          rivalBoughtItems: [...updated.rivalBoughtItems, action.targetId],
        };
      }
      break;
    }

    case 'gather_intel': {
      // Extra clock tick from rival intelligence gathering
      updated = {
        ...updated,
        threatClock: Math.min(10, updated.threatClock + 1),
      };
      break;
    }
  }

  return updated;
}

/**
 * Spend a slot on an activity. Advances the threat clock and triggers rival action.
 * Returns updated state.
 */
export function spendSlot(
  state: SocialPhaseState,
  activity: SocialActivityType,
  targetId: string | undefined,
  heroId: string | undefined,
  rival: RivalNPC | undefined,
  location: SocialPhaseLocation,
  npcs: Record<string, SocialNPC>,
  resultText: string = '',
): SocialPhaseState {
  if (state.slotsRemaining <= 0) {
    throw new Error('No slots remaining');
  }
  if (state.deployedEarly) {
    throw new Error('Already deployed early');
  }

  const clockTicks = ACTIVITY_CLOCK_TICKS[activity];
  const activityRecord: SocialActivity = {
    type: activity,
    targetId,
    heroId,
    clockTicks,
    result: resultText,
  };

  let updated: SocialPhaseState = {
    ...state,
    slotsRemaining: state.slotsRemaining - 1,
    threatClock: Math.min(10, state.threatClock + clockTicks),
    activities: [...state.activities, activityRecord],
  };

  // Trigger rival action if rival has slots remaining
  if (rival && updated.rivalSlotsRemaining > 0) {
    const rivalAction = resolveRivalAction(updated, rival, location);
    updated = applyRivalAction(updated, rivalAction, npcs);
  }

  return updated;
}

/**
 * Prep a bounty target (costs 1 slot). Skill check determines intel quality.
 */
export function prepBounty(
  state: SocialPhaseState,
  bountyId: string,
  hero: HeroCharacter,
  rival: RivalNPC | undefined,
  location: SocialPhaseLocation,
  npcs: Record<string, SocialNPC>,
  rollFn: RollFn = defaultRollFn,
): { state: SocialPhaseState; prepResult: BountyPrepResult } {
  if (!state.acceptedBounties.includes(bountyId)) {
    throw new Error(`Bounty ${bountyId} not accepted`);
  }

  const bounty = state.availableBounties.find(b => b.id === bountyId);
  if (!bounty) {
    throw new Error(`Bounty ${bountyId} not found`);
  }

  // Use Streetwise for bounty prep
  const isWounded = hero.isWounded ?? false;
  const checkResult = resolveSkillCheck(hero, 'streetwise' as SocialSkillId, 2, rollFn, isWounded);

  const prepResult: BountyPrepResult = {
    bountyId,
    success: checkResult.isSuccess,
    intelRevealed: checkResult.isSuccess
      ? `Target ${bounty.targetName} located. Condition: ${bounty.condition}.`
      : undefined,
    targetWeakened: checkResult.triumphs > 0,
  };

  let updated = {
    ...state,
    preppedBounties: [...state.preppedBounties, prepResult],
  };

  // Spend the slot
  const resultText = checkResult.isSuccess
    ? `Gathered intel on ${bounty.targetName}.`
    : `Failed to track ${bounty.targetName}.`;

  updated = spendSlot(
    updated,
    'bounty_prep',
    bountyId,
    hero.id,
    rival,
    location,
    npcs,
    resultText,
  );

  return { state: updated, prepResult };
}

/**
 * Scout the next mission (costs 1 slot). Success reduces clock, failure increases it.
 */
export function scoutMission(
  state: SocialPhaseState,
  hero: HeroCharacter,
  rival: RivalNPC | undefined,
  location: SocialPhaseLocation,
  npcs: Record<string, SocialNPC>,
  rollFn: RollFn = defaultRollFn,
): { state: SocialPhaseState; success: boolean; clockDelta: number } {
  const isWounded = hero.isWounded ?? false;
  // Perception check, difficulty 2
  const checkResult = resolveSkillCheck(
    hero,
    'streetwise' as SocialSkillId,
    2,
    rollFn,
    isWounded,
  );

  // On success: reduce clock by 2. On failure: +1 additional tick (on top of the slot's +1).
  const clockDelta = checkResult.isSuccess ? -2 : 1;

  let updated = {
    ...state,
    threatClock: Math.max(0, Math.min(10, state.threatClock + clockDelta)),
  };

  const resultText = checkResult.isSuccess
    ? 'Scouting successful -- threat clock reduced.'
    : 'Scouting failed -- the enemy noticed your recon.';

  updated = spendSlot(
    updated,
    'scout_mission',
    undefined,
    hero.id,
    rival,
    location,
    npcs,
    resultText,
  );

  return {
    state: updated,
    success: checkResult.isSuccess,
    clockDelta,
  };
}

/**
 * Confront the rival (costs 1 slot, 2 clock ticks).
 * Opposed social check. Success blocks rival's next action.
 */
export function confrontRival(
  state: SocialPhaseState,
  hero: HeroCharacter,
  rival: RivalNPC,
  location: SocialPhaseLocation,
  npcs: Record<string, SocialNPC>,
  rollFn: RollFn = defaultRollFn,
): { state: SocialPhaseState; success: boolean; triumph: boolean; despair: boolean } {
  const isWounded = hero.isWounded ?? false;

  // Opposed check: hero's coercion vs rival's discipline
  const rivalCharacteristic = rival.characteristics.willpower;
  const rivalSkillRank = rival.skills.discipline ?? 0;
  const checkResult = resolveOpposedSkillCheck(
    hero,
    'coercion',
    rivalCharacteristic,
    rivalSkillRank,
    rollFn,
    isWounded,
  );

  let updated = { ...state };
  let resultText: string;

  if (checkResult.isSuccess) {
    // Block rival's next action (remove a rival slot)
    updated = {
      ...updated,
      rivalSlotsRemaining: Math.max(0, updated.rivalSlotsRemaining - 1),
    };
    resultText = `Confronted ${rival.name} successfully -- their operations are disrupted.`;

    // Triumph: also reveal rival plans + reduce clock
    if (checkResult.triumphs > 0) {
      updated = {
        ...updated,
        threatClock: Math.max(0, updated.threatClock - 1),
      };
      resultText += ' Triumph! Disrupted their intel network.';
    }

    // Restore one poisoned contact disposition
    const poisonedNpcIds = Object.keys(updated.dispositionOverrides);
    if (poisonedNpcIds.length > 0) {
      const restored = { ...updated.dispositionOverrides };
      const npcId = poisonedNpcIds[0];
      const npc = npcs[npcId];
      if (npc) {
        restored[npcId] = npc.disposition; // reset to original
        updated = { ...updated, dispositionOverrides: restored };
      }
    }
  } else {
    // Failure: rival gets a bonus action
    resultText = `Failed to confront ${rival.name} -- they seized the initiative.`;

    if (updated.rivalSlotsRemaining <= 0) {
      // Give the rival a bonus slot
      updated = { ...updated, rivalSlotsRemaining: 1 };
    }
    const bonusAction = resolveRivalAction(updated, rival, location);
    updated = applyRivalAction(updated, bonusAction, npcs);

    // Despair: additional poison + bonus action
    if (checkResult.despairs > 0) {
      resultText += ' Despair! They turned your contacts against you.';
      if (updated.rivalSlotsRemaining <= 0) {
        updated = { ...updated, rivalSlotsRemaining: 1 };
      }
      const extraAction = resolveRivalAction(updated, rival, location);
      updated = applyRivalAction(updated, extraAction, npcs);
    }
  }

  // Spend the slot (confront_rival costs 2 clock ticks via ACTIVITY_CLOCK_TICKS)
  updated = spendSlot(
    updated,
    'confront_rival',
    rival.id,
    hero.id,
    undefined, // Don't trigger another rival action from this slot
    location,
    npcs,
    resultText,
  );

  return {
    state: updated,
    success: checkResult.isSuccess,
    triumph: checkResult.triumphs > 0,
    despair: checkResult.despairs > 0,
  };
}

/**
 * Deploy early: forfeit remaining slots to freeze the threat clock.
 */
export function deployEarly(state: SocialPhaseState): SocialPhaseState {
  return {
    ...state,
    slotsRemaining: 0,
    deployedEarly: true,
  };
}

/**
 * Convert a threat clock value to its level name.
 */
export function getThreatClockLevel(clockValue: number): ThreatClockLevel {
  if (clockValue <= 2) return 'caught_off_guard';
  if (clockValue <= 4) return 'normal';
  if (clockValue <= 6) return 'prepared';
  if (clockValue <= 8) return 'fortified';
  return 'ambush';
}

/**
 * Get the tactical effects of the current threat clock value.
 */
export function getThreatClockEffects(clockValue: number): ThreatClockEffects {
  const level = getThreatClockLevel(clockValue);
  const clamped = Math.max(0, Math.min(10, clockValue));

  switch (level) {
    case 'caught_off_guard':
      return {
        level, clockValue: clamped,
        bonusReinforcements: 0,
        enemySurpriseRound: false,
        operativeSurpriseRound: true,
        enemiesStartInCover: false,
      };
    case 'normal':
      return {
        level, clockValue: clamped,
        bonusReinforcements: 0,
        enemySurpriseRound: false,
        operativeSurpriseRound: false,
        enemiesStartInCover: false,
      };
    case 'prepared':
      return {
        level, clockValue: clamped,
        bonusReinforcements: 1,
        enemySurpriseRound: false,
        operativeSurpriseRound: false,
        enemiesStartInCover: false,
      };
    case 'fortified':
      return {
        level, clockValue: clamped,
        bonusReinforcements: 1,
        enemySurpriseRound: false,
        operativeSurpriseRound: false,
        enemiesStartInCover: true,
      };
    case 'ambush':
      return {
        level, clockValue: clamped,
        bonusReinforcements: 2,
        enemySurpriseRound: true,
        operativeSurpriseRound: false,
        enemiesStartInCover: true,
      };
  }
}

/**
 * Finalize the expanded social phase, producing the result record
 * and updating campaign state with rival/bounty data.
 */
export function finalizeExpandedSocialPhase(
  state: SocialPhaseState,
  campaign: CampaignState,
  locationId: string,
  encounterResults: SocialCheckResult[],
  purchases: Array<{ itemId: string; price: number }>,
  sales: Array<{ itemId: string; revenue: number }>,
  healingCreditsSpent: number,
): { campaign: CampaignState; result: ExpandedSocialPhaseResult } {
  const clockEffects = getThreatClockEffects(state.threatClock);

  const result: ExpandedSocialPhaseResult = {
    locationId,
    encounterResults,
    itemsPurchased: purchases,
    itemsSold: sales,
    creditsSpentOnHealing: healingCreditsSpent,
    completedAt: new Date().toISOString(),
    slotsUsed: state.slotsTotal - state.slotsRemaining,
    slotsTotal: state.slotsTotal,
    deployedEarly: state.deployedEarly,
    rivalActions: state.rivalActionsThisPhase,
    threatClockFinal: state.threatClock,
    threatClockEffects: clockEffects,
    bountiesAccepted: state.acceptedBounties,
    bountiesPrepped: state.preppedBounties,
    bountiesClaimedByRival: state.rivalClaimedBounties,
  };

  // Update campaign with bounty/rival data
  const activeBounties = state.availableBounties.filter(
    b => state.acceptedBounties.includes(b.id),
  );

  // Update rival state
  const existingRivalState = campaign.rivalState;
  const updatedRivalState: RivalState | undefined = existingRivalState
    ? {
        ...existingRivalState,
        claimedBounties: [
          ...existingRivalState.claimedBounties,
          ...state.rivalClaimedBounties,
        ],
        poisonedContacts: [
          ...existingRivalState.poisonedContacts,
          ...Object.keys(state.dispositionOverrides),
        ],
        intelGathered: [
          ...existingRivalState.intelGathered,
          ...state.rivalActionsThisPhase
            .filter(a => a.type === 'gather_intel')
            .map(() => locationId),
        ],
      }
    : undefined;

  const history = campaign.socialPhaseResults ?? [];

  const updatedCampaign: CampaignState = {
    ...campaign,
    socialPhaseResults: [...history, result],
    activeBounties,
    bountyPrepResults: state.preppedBounties,
    rivalState: updatedRivalState ?? campaign.rivalState,
  };

  return { campaign: updatedCampaign, result };
}

/**
 * Get the effective disposition of an NPC, accounting for rival poisoning.
 */
export function getEffectiveDisposition(
  npc: SocialNPC,
  state: SocialPhaseState,
): Disposition {
  return state.dispositionOverrides[npc.id] ?? npc.disposition;
}

/**
 * Check if a shop item is available (not bought out by rival).
 */
export function isItemAvailable(
  item: ShopItem,
  state: SocialPhaseState,
): boolean {
  if (item.stock === 0) return false;
  if (state.rivalBoughtItems.includes(item.itemId)) return false;
  return true;
}

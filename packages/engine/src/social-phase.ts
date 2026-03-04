/**
 * Galactic Operations v2 - Social Phase Engine
 * Manages the between-mission social phase: NPC encounters, skill checks,
 * shopping, companion recruitment, and narrative interactions.
 *
 * Phase 9: Social Check Phase
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
} from './types';

import { DISPOSITION_DIFFICULTY, SOCIAL_SKILLS } from './types';

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
    }
  }

  return state;
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

  return {
    campaign: {
      ...campaign,
      credits: campaign.credits - price,
      narrativeItems,
      consumableInventory,
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

  return {
    campaign: {
      ...campaign,
      credits: campaign.credits + revenue,
      consumableInventory,
      narrativeItems: campaign.narrativeItems.filter(item => item !== itemKey),
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
  const updatedCampaign = applySocialOutcomes(campaign, outcomes, heroId);

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

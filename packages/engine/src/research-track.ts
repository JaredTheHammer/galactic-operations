/**
 * Research/Tech Track System (Dune: Imperium - Immortality Research)
 *
 * Branching progression track where AP unlocks persistent faction-level
 * bonuses. Each tier offers a binary A/B choice, creating divergent campaigns.
 */

import type {
  ResearchNode,
  ResearchEffect,
  ResearchEffectType,
  ResearchTrackState,
  CampaignState,
  DuneMechanicsState,
  HeroCharacter,
} from './types.js';

// ============================================================================
// Default Research Track (5 tiers, 2 branches each = 10 nodes)
// ============================================================================

export const DEFAULT_RESEARCH_TRACK: ResearchNode[] = [
  // Tier 1 - Foundation (no prerequisites)
  {
    id: 'r1a-field-ops',
    name: 'Field Operations',
    description: 'Establishes forward operating bases. +1 intel asset slot.',
    effect: { type: 'max_intel_assets', value: 1 },
    tier: 1,
    branch: 'A',
    apCost: 1,
    prerequisites: [],
  },
  {
    id: 'r1b-supply-lines',
    name: 'Supply Lines',
    description: 'Secures reliable supply chains. +20 credits per mission.',
    effect: { type: 'bonus_credits', value: 20 },
    tier: 1,
    branch: 'B',
    apCost: 1,
    prerequisites: [],
  },

  // Tier 2 - Expansion (requires any tier 1)
  {
    id: 'r2a-combat-training',
    name: 'Combat Training',
    description: 'Advanced tactical drills. +1 starting tactic cards per mission.',
    effect: { type: 'bonus_tactic_cards', value: 1 },
    tier: 2,
    branch: 'A',
    apCost: 2,
    prerequisites: ['r1a-field-ops', 'r1b-supply-lines'],
  },
  {
    id: 'r2b-medical-bay',
    name: 'Medical Bay',
    description: 'Field hospital reduces recovery time. Heal 3 wounds between missions for free.',
    effect: { type: 'heal_between_missions', value: 3 },
    tier: 2,
    branch: 'B',
    apCost: 2,
    prerequisites: ['r1a-field-ops', 'r1b-supply-lines'],
  },

  // Tier 3 - Specialization (requires any tier 2)
  {
    id: 'r3a-counter-intel',
    name: 'Counter-Intelligence',
    description: 'Disrupts imperial communications. Reduce threat by 3 per mission.',
    effect: { type: 'threat_reduction', value: 3 },
    tier: 3,
    branch: 'A',
    apCost: 3,
    prerequisites: ['r2a-combat-training', 'r2b-medical-bay'],
  },
  {
    id: 'r3b-black-market',
    name: 'Black Market Access',
    description: 'Underworld connections yield discounts. 15% off all shops.',
    effect: { type: 'shop_discount', value: 15 },
    tier: 3,
    branch: 'B',
    apCost: 3,
    prerequisites: ['r2a-combat-training', 'r2b-medical-bay'],
  },

  // Tier 4 - Advanced (requires any tier 3)
  {
    id: 'r4a-ally-network',
    name: 'Allied Network',
    description: 'Expanded contacts. +1 companion slot and +1 mercenary slot.',
    effect: { type: 'companion_slot', value: 1 },
    tier: 4,
    branch: 'A',
    apCost: 4,
    prerequisites: ['r3a-counter-intel', 'r3b-black-market'],
  },
  {
    id: 'r4b-bounty-board',
    name: 'Bounty Board',
    description: 'Professional bounty network. +25% contract rewards.',
    effect: { type: 'bonus_contract_reward', value: 25 },
    tier: 4,
    branch: 'B',
    apCost: 4,
    prerequisites: ['r3a-counter-intel', 'r3b-black-market'],
  },

  // Tier 5 - Capstone (requires any tier 4)
  {
    id: 'r5a-rally-cry',
    name: 'Rally Cry',
    description: 'Inspirational leadership. +2 starting morale for all missions.',
    effect: { type: 'morale_bonus', value: 2 },
    tier: 5,
    branch: 'A',
    apCost: 5,
    prerequisites: ['r4a-ally-network', 'r4b-bounty-board'],
  },
  {
    id: 'r5b-elite-training',
    name: 'Elite Training',
    description: 'Rigorous XP program. +3 bonus XP per mission for all heroes.',
    effect: { type: 'bonus_xp', value: 3 },
    tier: 5,
    branch: 'B',
    apCost: 5,
    prerequisites: ['r4a-ally-network', 'r4b-bounty-board'],
  },
];

// ============================================================================
// Research Node Management
// ============================================================================

/** Get all nodes available to unlock given current state */
export function getAvailableResearchNodes(
  campaign: CampaignState,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): ResearchNode[] {
  const state = campaign.duneMechanics?.researchTrack ?? { unlockedNodes: [], totalAPSpent: 0 };
  const unlocked = new Set(state.unlockedNodes);

  return track.filter((node) => {
    // Already unlocked
    if (unlocked.has(node.id)) return false;
    // Must have at least one prerequisite unlocked (OR logic)
    if (node.prerequisites.length > 0) {
      return node.prerequisites.some((prereq) => unlocked.has(prereq));
    }
    // No prerequisites = always available
    return true;
  });
}

/** Check if a hero has enough AP to unlock a node */
export function canUnlockNode(
  campaign: CampaignState,
  nodeId: string,
  heroId: string,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): boolean {
  const node = track.find((n) => n.id === nodeId);
  if (!node) return false;

  const hero = campaign.heroes[heroId];
  if (!hero) return false;

  // Check AP
  if (hero.abilityPoints.available < node.apCost) return false;

  // Check availability
  const available = getAvailableResearchNodes(campaign, track);
  return available.some((n) => n.id === nodeId);
}

/** Unlock a research node, spending a hero's AP */
export function unlockResearchNode(
  campaign: CampaignState,
  nodeId: string,
  heroId: string,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): CampaignState | null {
  if (!canUnlockNode(campaign, nodeId, heroId, track)) return null;

  const node = track.find((n) => n.id === nodeId)!;
  const dm = ensureDuneMechanics(campaign);
  const hero = campaign.heroes[heroId];

  const updatedHero: HeroCharacter = {
    ...hero,
    abilityPoints: {
      ...hero.abilityPoints,
      available: hero.abilityPoints.available - node.apCost,
    },
  };

  const updatedResearch: ResearchTrackState = {
    unlockedNodes: [...dm.researchTrack.unlockedNodes, nodeId],
    totalAPSpent: dm.researchTrack.totalAPSpent + node.apCost,
  };

  return {
    ...campaign,
    heroes: { ...campaign.heroes, [heroId]: updatedHero },
    duneMechanics: { ...dm, researchTrack: updatedResearch },
  };
}

// ============================================================================
// Effect Aggregation
// ============================================================================

/** Get all active research effects from unlocked nodes */
export function getActiveResearchEffects(
  campaign: CampaignState,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): ResearchEffect[] {
  const unlocked = campaign.duneMechanics?.researchTrack.unlockedNodes ?? [];
  const unlockedSet = new Set(unlocked);
  return track
    .filter((node) => unlockedSet.has(node.id))
    .map((node) => node.effect);
}

/** Sum all effects of a specific type */
export function getResearchBonus(
  campaign: CampaignState,
  effectType: ResearchEffectType,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): number {
  const effects = getActiveResearchEffects(campaign, track);
  return effects
    .filter((e) => e.type === effectType)
    .reduce((sum, e) => sum + e.value, 0);
}

/** Get the current research tier (highest unlocked) */
export function getCurrentResearchTier(
  campaign: CampaignState,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): number {
  const unlocked = campaign.duneMechanics?.researchTrack.unlockedNodes ?? [];
  const unlockedSet = new Set(unlocked);
  let maxTier = 0;
  for (const node of track) {
    if (unlockedSet.has(node.id) && node.tier > maxTier) {
      maxTier = node.tier;
    }
  }
  return maxTier;
}

/** Get unlocked node details */
export function getUnlockedNodes(
  campaign: CampaignState,
  track: ResearchNode[] = DEFAULT_RESEARCH_TRACK,
): ResearchNode[] {
  const unlocked = campaign.duneMechanics?.researchTrack.unlockedNodes ?? [];
  const unlockedSet = new Set(unlocked);
  return track.filter((node) => unlockedSet.has(node.id));
}

// ============================================================================
// Helpers
// ============================================================================

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

/**
 * Faction Readiness System (Political Track Analog)
 *
 * Inspired by War of the Ring's Political Track where Free Peoples nations
 * start non-belligerent and must be activated before they'll fight.
 *
 * In Galactic Operations, various Rebel/underworld factions start Dormant
 * and must be pushed toward readiness through:
 * - Completing missions in their territory
 * - Social phase encounters with faction contacts
 * - Companion heroes visiting faction hubs (WotR Companion activation)
 * - Imperial attacks on faction territory (auto-advances, like WotR)
 *
 * Readiness levels:
 * - Dormant:     Faction is unaware or unwilling. No benefits.
 * - Sympathetic:  Faction is friendly. Shop discounts available.
 * - Active:       Faction is contributing. Companion NPCs and bonus card draws.
 * - Mobilized:    Faction is fully committed. Reinforcements and threat reduction.
 */

import type {
  FactionStatus,
  FactionReadiness,
  FactionBenefits,
  FactionActivationTrigger,
  CampaignState,
} from './types.js';

// ============================================================================
// READINESS LEVEL PROGRESSION
// ============================================================================

/** Progress thresholds for each readiness level */
const READINESS_THRESHOLDS: Record<FactionReadiness, number> = {
  Dormant: 0,
  Sympathetic: 25,
  Active: 50,
  Mobilized: 75,
};

/** Ordered readiness levels from lowest to highest */
const READINESS_ORDER: FactionReadiness[] = [
  'Dormant',
  'Sympathetic',
  'Active',
  'Mobilized',
];

/**
 * Determine the readiness level from a progress value (0-100).
 */
export function resolveReadinessLevel(progress: number): FactionReadiness {
  if (progress >= READINESS_THRESHOLDS.Mobilized) return 'Mobilized';
  if (progress >= READINESS_THRESHOLDS.Active) return 'Active';
  if (progress >= READINESS_THRESHOLDS.Sympathetic) return 'Sympathetic';
  return 'Dormant';
}

/**
 * Check if a readiness level meets a minimum requirement.
 */
export function meetsReadiness(
  current: FactionReadiness,
  required: FactionReadiness,
): boolean {
  return READINESS_ORDER.indexOf(current) >= READINESS_ORDER.indexOf(required);
}

// ============================================================================
// FACTION CREATION
// ============================================================================

/**
 * Create a new faction status entry.
 */
export function createFactionStatus(
  id: string,
  name: string,
  benefits: FactionBenefits,
  activationTriggers: FactionActivationTrigger[],
  availableInActs: number[] = [1, 2, 3],
  initialProgress: number = 0,
): FactionStatus {
  return {
    id,
    name,
    readiness: resolveReadinessLevel(initialProgress),
    progress: initialProgress,
    benefits,
    activationTriggers,
    availableInActs,
  };
}

// ============================================================================
// FACTION ADVANCEMENT
// ============================================================================

/**
 * Advance a faction's readiness by a given amount.
 * Returns the updated faction status and whether the readiness level changed.
 */
export function advanceFaction(
  faction: FactionStatus,
  progressGain: number,
): { faction: FactionStatus; levelChanged: boolean; newLevel: FactionReadiness } {
  const oldLevel = faction.readiness;
  const newProgress = Math.min(100, Math.max(0, faction.progress + progressGain));
  const newLevel = resolveReadinessLevel(newProgress);
  const levelChanged = oldLevel !== newLevel;

  return {
    faction: {
      ...faction,
      progress: newProgress,
      readiness: newLevel,
    },
    levelChanged,
    newLevel,
  };
}

/**
 * Process an activation trigger for all factions.
 * Checks which factions have matching triggers and advances them.
 *
 * Returns updated faction map and list of factions that changed level.
 */
export function processTrigger(
  factions: Record<string, FactionStatus>,
  triggerType: FactionActivationTrigger['type'],
  triggerId: string,
  currentAct: number,
): {
  factions: Record<string, FactionStatus>;
  advancedFactions: Array<{ factionId: string; oldLevel: FactionReadiness; newLevel: FactionReadiness }>;
} {
  const updatedFactions = { ...factions };
  const advancedFactions: Array<{ factionId: string; oldLevel: FactionReadiness; newLevel: FactionReadiness }> = [];

  for (const [factionId, faction] of Object.entries(factions)) {
    // Skip factions not available in current act
    if (!faction.availableInActs.includes(currentAct)) continue;

    for (const trigger of faction.activationTriggers) {
      if (trigger.type !== triggerType) continue;

      // Match trigger-specific ID
      let matches = false;
      switch (trigger.type) {
        case 'mission_complete':
          matches = trigger.missionId === triggerId;
          break;
        case 'social_encounter':
          matches = trigger.encounterId === triggerId;
          break;
        case 'companion_visit':
          matches = trigger.companionId === triggerId;
          break;
        case 'imperial_attack':
          matches = true; // Always matches
          break;
        case 'narrative_item':
          matches = trigger.itemId === triggerId;
          break;
      }

      if (matches) {
        const oldLevel = faction.readiness;
        const result = advanceFaction(faction, trigger.progressGain);
        updatedFactions[factionId] = result.faction;

        if (result.levelChanged) {
          advancedFactions.push({
            factionId,
            oldLevel,
            newLevel: result.newLevel,
          });
        }
      }
    }
  }

  return { factions: updatedFactions, advancedFactions };
}

// ============================================================================
// BENEFIT QUERIES
// ============================================================================

/**
 * Get the total shop discount from all active factions.
 */
export function getTotalShopDiscount(
  factions: Record<string, FactionStatus>,
): number {
  let totalDiscount = 0;

  for (const faction of Object.values(factions)) {
    if (meetsReadiness(faction.readiness, 'Sympathetic') && faction.benefits.shopDiscount) {
      totalDiscount += faction.benefits.shopDiscount;
    }
  }

  // Cap at 50% discount
  return Math.min(50, totalDiscount);
}

/**
 * Get all available companion IDs from active factions.
 */
export function getAvailableCompanions(
  factions: Record<string, FactionStatus>,
  currentAct: number,
): string[] {
  const companions: string[] = [];

  for (const faction of Object.values(factions)) {
    if (!faction.availableInActs.includes(currentAct)) continue;
    if (meetsReadiness(faction.readiness, 'Active') && faction.benefits.companionIds) {
      companions.push(...faction.benefits.companionIds);
    }
  }

  return companions;
}

/**
 * Get all available reinforcement NPC profiles from mobilized factions.
 */
export function getAvailableReinforcements(
  factions: Record<string, FactionStatus>,
  currentAct: number,
): string[] {
  const profiles: string[] = [];

  for (const faction of Object.values(factions)) {
    if (!faction.availableInActs.includes(currentAct)) continue;
    if (meetsReadiness(faction.readiness, 'Mobilized') && faction.benefits.reinforcementProfiles) {
      profiles.push(...faction.benefits.reinforcementProfiles);
    }
  }

  return profiles;
}

/**
 * Get total bonus card draws per round from active factions.
 */
export function getBonusCardDraw(
  factions: Record<string, FactionStatus>,
  currentAct: number,
): number {
  let bonus = 0;

  for (const faction of Object.values(factions)) {
    if (!faction.availableInActs.includes(currentAct)) continue;
    if (meetsReadiness(faction.readiness, 'Active') && faction.benefits.bonusCardDraw) {
      bonus += faction.benefits.bonusCardDraw;
    }
  }

  return bonus;
}

/**
 * Get total threat reduction per round from mobilized factions.
 */
export function getThreatReduction(
  factions: Record<string, FactionStatus>,
  currentAct: number,
): number {
  let reduction = 0;

  for (const faction of Object.values(factions)) {
    if (!faction.availableInActs.includes(currentAct)) continue;
    if (meetsReadiness(faction.readiness, 'Mobilized') && faction.benefits.threatReduction) {
      reduction += faction.benefits.threatReduction;
    }
  }

  return reduction;
}

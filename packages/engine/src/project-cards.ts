/**
 * Project Cards Engine (Terraforming Mars-inspired Engine Building)
 *
 * Players spend credits between missions to purchase persistent project cards
 * that provide compounding benefits across the campaign. Projects have
 * prerequisites, act-gating, and categorized effects.
 *
 * Integration points:
 * - completeMission: apply credit_income, xp_bonus effects
 * - prepareHeroesForMission: apply consumable_slot, starting_supply, tactic_card_draw
 * - computeEffectiveThreat: apply threat_reduction
 * - shop pricing: apply shop_discount
 * - medical recovery: apply healing_discount
 */

import type {
  CampaignState,
  ProjectCard,
  ProjectCardState,
  ProjectCardEffect,
  ProjectCardCategory,
} from './types';

// ============================================================================
// PROJECT AVAILABILITY
// ============================================================================

/**
 * Get project cards available for purchase given campaign state.
 * Filters by act availability, prerequisites, and already-purchased.
 */
export function getAvailableProjects(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): ProjectCard[] {
  const purchased = new Set(
    campaign.projectCardState?.purchasedProjectIds ?? [],
  );

  return Object.values(allProjects).filter(project => {
    // Already purchased
    if (purchased.has(project.id)) return false;

    // Act-gated
    if (campaign.currentAct < project.availableFromAct) return false;

    // Prerequisites
    if (project.prerequisites.length > 0) {
      if (!project.prerequisites.every(prereq => purchased.has(prereq))) return false;
    }

    return true;
  });
}

/**
 * Check if a specific project can be purchased.
 */
export function canPurchaseProject(
  project: ProjectCard,
  campaign: CampaignState,
): { canPurchase: boolean; reason?: string } {
  const purchased = new Set(
    campaign.projectCardState?.purchasedProjectIds ?? [],
  );

  if (purchased.has(project.id)) {
    return { canPurchase: false, reason: 'Already purchased' };
  }

  if (campaign.currentAct < project.availableFromAct) {
    return { canPurchase: false, reason: `Available from Act ${project.availableFromAct}` };
  }

  if (campaign.credits < project.cost) {
    return { canPurchase: false, reason: `Insufficient credits: need ${project.cost}, have ${campaign.credits}` };
  }

  const unmetPrereqs = project.prerequisites.filter(p => !purchased.has(p));
  if (unmetPrereqs.length > 0) {
    return { canPurchase: false, reason: `Requires: ${unmetPrereqs.join(', ')}` };
  }

  return { canPurchase: true };
}

// ============================================================================
// PURCHASE
// ============================================================================

/**
 * Purchase a project card. Deducts credits and adds to campaign state.
 * Throws if the project cannot be purchased.
 */
export function purchaseProject(
  campaign: CampaignState,
  project: ProjectCard,
): CampaignState {
  const check = canPurchaseProject(project, campaign);
  if (!check.canPurchase) {
    throw new Error(`Cannot purchase project "${project.name}": ${check.reason}`);
  }

  const existing = campaign.projectCardState ?? {
    purchasedProjectIds: [],
    purchaseHistory: [],
  };

  return {
    ...campaign,
    credits: campaign.credits - project.cost,
    projectCardState: {
      purchasedProjectIds: [...existing.purchasedProjectIds, project.id],
      purchaseHistory: [
        ...existing.purchaseHistory,
        { projectId: project.id, purchasedAtMission: campaign.missionsPlayed },
      ],
    },
  };
}

// ============================================================================
// EFFECT AGGREGATION
// ============================================================================

/**
 * Get all active effects from purchased project cards.
 * Returns effects aggregated by type.
 */
export function getActiveProjectEffects(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): ProjectCardEffect[] {
  const purchased = campaign.projectCardState?.purchasedProjectIds ?? [];
  const effects: ProjectCardEffect[] = [];

  for (const projectId of purchased) {
    const project = allProjects[projectId];
    if (project) {
      effects.push(...project.effects);
    }
  }

  return effects;
}

/**
 * Sum up all effects of a given type from active projects.
 */
export function getAggregatedEffect(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
  effectType: ProjectCardEffect['type'],
): number {
  const effects = getActiveProjectEffects(allProjects, campaign);
  return effects
    .filter(e => e.type === effectType)
    .reduce((sum, e) => sum + e.value, 0);
}

/**
 * Get the effective shop discount percentage from projects.
 */
export function getProjectShopDiscount(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'shop_discount');
}

/**
 * Get the effective threat reduction from projects.
 */
export function getProjectThreatReduction(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'threat_reduction');
}

/**
 * Get credit income earned after each mission from projects.
 */
export function getProjectCreditIncome(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'credit_income');
}

/**
 * Get XP bonus per mission from projects.
 */
export function getProjectXPBonus(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'xp_bonus');
}

/**
 * Get extra tactic cards to draw at mission start from projects.
 */
export function getProjectTacticCardBonus(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'tactic_card_draw');
}

/**
 * Get the medical recovery discount from projects.
 */
export function getProjectHealingDiscount(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'healing_discount');
}

/**
 * Get the reinforcement delay (in rounds) from projects.
 */
export function getProjectReinforcementDelay(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): number {
  return getAggregatedEffect(allProjects, campaign, 'reinforcement_delay');
}

/**
 * Check if any project provides intel reveal (enemy deployment visibility).
 */
export function hasIntelReveal(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): boolean {
  return getAggregatedEffect(allProjects, campaign, 'intel_reveal') > 0;
}

/**
 * Get starting supplies (free consumables) from projects.
 */
export function getStartingSupplies(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): string[] {
  const effects = getActiveProjectEffects(allProjects, campaign);
  return effects
    .filter(e => e.type === 'starting_supply' && e.consumableId)
    .map(e => e.consumableId!);
}

/**
 * Get purchased projects grouped by category for UI display.
 */
export function getProjectsByCategory(
  allProjects: Record<string, ProjectCard>,
  campaign: CampaignState,
): Record<ProjectCardCategory, ProjectCard[]> {
  const purchased = new Set(
    campaign.projectCardState?.purchasedProjectIds ?? [],
  );

  const grouped: Record<ProjectCardCategory, ProjectCard[]> = {
    infrastructure: [],
    intelligence: [],
    military: [],
    diplomacy: [],
  };

  for (const projectId of purchased) {
    const project = allProjects[projectId];
    if (project) {
      grouped[project.category].push(project);
    }
  }

  return grouped;
}

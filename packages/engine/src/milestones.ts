/**
 * Milestones & Awards Engine (Terraforming Mars-inspired)
 *
 * Milestones: Claimable achievements when a condition is met. First-come basis
 * in competitive, always available in solo/co-op. Grant XP + credits.
 *
 * Awards: End-of-act scoring based on cumulative hero performance.
 * The hero with the best stat in each category earns bonus XP + credits.
 *
 * Stat tracking is updated after each mission via updateHeroStats().
 */

import type {
  CampaignState,
  CampaignMilestone,
  CampaignAward,
  MilestoneAwardState,
  MissionResult,
  HeroCharacter,
  LiberationTrackId,
} from './types';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Create initial milestone/award state with empty stats for all heroes.
 */
export function initializeMilestoneState(
  heroIds: string[],
): MilestoneAwardState {
  const heroStats: MilestoneAwardState['heroStats'] = {};
  for (const id of heroIds) {
    heroStats[id] = {
      kills: 0,
      xpEarned: 0,
      damageDealt: 0,
      socialSuccesses: 0,
      objectivesCompleted: 0,
      incapacitations: 0,
      lootCollected: 0,
      missionsWithoutIncap: 0,
    };
  }

  return {
    claimedMilestones: [],
    evaluatedAwards: [],
    heroStats,
  };
}

// ============================================================================
// STAT TRACKING
// ============================================================================

/**
 * Update hero stats after a completed mission.
 * Should be called from completeMission integration.
 */
export function updateHeroStats(
  state: MilestoneAwardState,
  result: MissionResult,
  heroIds: string[],
): MilestoneAwardState {
  const newStats = { ...state.heroStats };

  for (const heroId of heroIds) {
    const existing = newStats[heroId] ?? {
      kills: 0,
      xpEarned: 0,
      damageDealt: 0,
      socialSuccesses: 0,
      objectivesCompleted: 0,
      incapacitations: 0,
      lootCollected: 0,
      missionsWithoutIncap: 0,
    };

    const heroKills = result.heroKills[heroId] ?? 0;
    const wasIncapacitated = result.heroesIncapacitated.includes(heroId);

    newStats[heroId] = {
      ...existing,
      kills: existing.kills + heroKills,
      xpEarned: existing.xpEarned + result.xpBreakdown.total,
      // damageDealt is tracked separately (needs combat integration)
      damageDealt: existing.damageDealt,
      objectivesCompleted: existing.objectivesCompleted + result.completedObjectiveIds.length,
      incapacitations: existing.incapacitations + (wasIncapacitated ? 1 : 0),
      lootCollected: existing.lootCollected + result.lootCollected.length,
      missionsWithoutIncap: wasIncapacitated
        ? 0
        : existing.missionsWithoutIncap + 1,
    };
  }

  return {
    ...state,
    heroStats: newStats,
  };
}

/**
 * Update social success count for a hero.
 * Call after social phase resolution.
 */
export function updateSocialStats(
  state: MilestoneAwardState,
  heroId: string,
  successCount: number,
): MilestoneAwardState {
  const existing = state.heroStats[heroId];
  if (!existing) return state;

  return {
    ...state,
    heroStats: {
      ...state.heroStats,
      [heroId]: {
        ...existing,
        socialSuccesses: existing.socialSuccesses + successCount,
      },
    },
  };
}

/**
 * Track damage dealt by a hero (call during combat resolution).
 */
export function trackDamageDealt(
  state: MilestoneAwardState,
  heroId: string,
  damage: number,
): MilestoneAwardState {
  const existing = state.heroStats[heroId];
  if (!existing) return state;

  return {
    ...state,
    heroStats: {
      ...state.heroStats,
      [heroId]: {
        ...existing,
        damageDealt: existing.damageDealt + damage,
      },
    },
  };
}

// ============================================================================
// MILESTONE CHECKING & CLAIMING
// ============================================================================

/**
 * Check which milestones are currently claimable by any hero.
 */
export function getClaimableMilestones(
  allMilestones: CampaignMilestone[],
  campaign: CampaignState,
): Array<{ milestone: CampaignMilestone; eligibleHeroIds: string[] }> {
  const state = campaign.milestoneAwardState;
  if (!state) return [];

  const claimedIds = new Set(state.claimedMilestones.map(m => m.milestoneId));
  const results: Array<{ milestone: CampaignMilestone; eligibleHeroIds: string[] }> = [];

  for (const milestone of allMilestones) {
    if (claimedIds.has(milestone.id)) continue;

    const eligible = Object.keys(state.heroStats).filter(heroId =>
      checkMilestoneCondition(milestone, state, heroId, campaign),
    );

    if (eligible.length > 0) {
      results.push({ milestone, eligibleHeroIds: eligible });
    }
  }

  return results;
}

/**
 * Check if a specific hero meets a milestone's condition.
 */
export function checkMilestoneCondition(
  milestone: CampaignMilestone,
  state: MilestoneAwardState,
  heroId: string,
  campaign: CampaignState,
): boolean {
  const stats = state.heroStats[heroId];
  if (!stats) return false;

  const cond = milestone.condition;
  switch (cond.type) {
    case 'hero_xp_threshold': {
      const hero = campaign.heroes[heroId];
      return hero ? hero.xp.total >= cond.threshold : false;
    }
    case 'total_kills':
      return stats.kills >= cond.threshold;
    case 'missions_without_incapacitation':
      return stats.missionsWithoutIncap >= cond.threshold;
    case 'credits_accumulated':
      return campaign.credits >= cond.threshold;
    case 'projects_purchased':
      return (campaign.projectCardState?.purchasedProjectIds.length ?? 0) >= cond.threshold;
    case 'liberation_track': {
      const trackValue = campaign.liberationTracks?.values[cond.trackId] ?? 0;
      return trackValue >= cond.threshold;
    }
    case 'companions_recruited':
      return (campaign.companions?.length ?? 0) >= cond.threshold;
    case 'social_checks_passed':
      return stats.socialSuccesses >= cond.threshold;
    case 'loot_collected':
      return stats.lootCollected >= cond.threshold;
    case 'missions_completed':
      return campaign.missionsPlayed >= cond.threshold;
    default:
      return false;
  }
}

/**
 * Claim a milestone for a hero. Grants rewards to the hero.
 * Returns updated campaign state.
 */
export function claimMilestone(
  campaign: CampaignState,
  milestoneId: string,
  heroId: string,
  allMilestones: CampaignMilestone[],
): CampaignState {
  const milestone = allMilestones.find(m => m.id === milestoneId);
  if (!milestone) {
    throw new Error(`Milestone ${milestoneId} not found`);
  }

  const state = campaign.milestoneAwardState;
  if (!state) {
    throw new Error('Milestone state not initialized');
  }

  const alreadyClaimed = state.claimedMilestones.some(m => m.milestoneId === milestoneId);
  if (alreadyClaimed) {
    throw new Error(`Milestone ${milestoneId} already claimed`);
  }

  if (!checkMilestoneCondition(milestone, state, heroId, campaign)) {
    throw new Error(`Hero ${heroId} does not meet milestone condition`);
  }

  // Apply rewards
  const hero = campaign.heroes[heroId];
  if (!hero) {
    throw new Error(`Hero ${heroId} not found`);
  }

  const updatedHero: HeroCharacter = {
    ...hero,
    xp: {
      total: hero.xp.total + milestone.xpReward,
      available: hero.xp.available + milestone.xpReward,
    },
  };

  const narrativeItems = [...campaign.narrativeItems];
  if (milestone.narrativeReward && !narrativeItems.includes(milestone.narrativeReward)) {
    narrativeItems.push(milestone.narrativeReward);
  }

  return {
    ...campaign,
    credits: campaign.credits + milestone.creditReward,
    narrativeItems,
    heroes: {
      ...campaign.heroes,
      [heroId]: updatedHero,
    },
    milestoneAwardState: {
      ...state,
      claimedMilestones: [
        ...state.claimedMilestones,
        { milestoneId, heroId, claimedAtMission: campaign.missionsPlayed },
      ],
    },
  };
}

// ============================================================================
// AWARD EVALUATION
// ============================================================================

/**
 * Evaluate awards for a given act.
 * Finds the hero with the best stat for each award and grants rewards.
 */
export function evaluateAwards(
  campaign: CampaignState,
  awards: CampaignAward[],
  forAct: number,
): CampaignState {
  const state = campaign.milestoneAwardState;
  if (!state) return campaign;

  const evaluatedIds = new Set(state.evaluatedAwards.map(a => a.awardId));
  let updatedCampaign = { ...campaign };
  const newEvaluated = [...state.evaluatedAwards];

  const applicableAwards = awards.filter(
    a => a.evaluateAfterAct === forAct && !evaluatedIds.has(a.id),
  );

  for (const award of applicableAwards) {
    const { winnerId, winnerScore } = findAwardWinner(state, award);
    if (!winnerId) continue;

    // Grant rewards to winner
    const hero = updatedCampaign.heroes[winnerId];
    if (hero) {
      updatedCampaign = {
        ...updatedCampaign,
        credits: updatedCampaign.credits + award.creditReward,
        heroes: {
          ...updatedCampaign.heroes,
          [winnerId]: {
            ...hero,
            xp: {
              total: hero.xp.total + award.xpReward,
              available: hero.xp.available + award.xpReward,
            },
          },
        },
      };
    }

    newEvaluated.push({
      awardId: award.id,
      winnerHeroId: winnerId,
      score: winnerScore,
    });
  }

  return {
    ...updatedCampaign,
    milestoneAwardState: {
      ...state,
      evaluatedAwards: newEvaluated,
    },
  };
}

/**
 * Find the hero who wins a specific award.
 */
function findAwardWinner(
  state: MilestoneAwardState,
  award: CampaignAward,
): { winnerId: string | null; winnerScore: number } {
  let bestId: string | null = null;
  let bestScore = -1;

  for (const [heroId, stats] of Object.entries(state.heroStats)) {
    let score: number;
    const criteria = award.scoringCriteria;

    switch (criteria.type) {
      case 'most_kills':
        score = stats.kills;
        break;
      case 'most_xp':
        score = stats.xpEarned;
        break;
      case 'most_damage_dealt':
        score = stats.damageDealt;
        break;
      case 'most_social_successes':
        score = stats.socialSuccesses;
        break;
      case 'most_objectives_completed':
        score = stats.objectivesCompleted;
        break;
      case 'fewest_incapacitations':
        // Invert: fewer incapacitations = higher score
        score = -stats.incapacitations;
        break;
      default:
        score = 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = heroId;
    }
  }

  return { winnerId: bestId, winnerScore: Math.abs(bestScore) };
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a summary of all milestones with their claim status.
 */
export function getMilestoneSummary(
  allMilestones: CampaignMilestone[],
  campaign: CampaignState,
): Array<{
  milestone: CampaignMilestone;
  claimed: boolean;
  claimedBy?: string;
  claimable: boolean;
  eligibleHeroes: string[];
}> {
  const state = campaign.milestoneAwardState;
  if (!state) {
    return allMilestones.map(m => ({
      milestone: m,
      claimed: false,
      claimable: false,
      eligibleHeroes: [],
    }));
  }

  const claimedMap = new Map(
    state.claimedMilestones.map(c => [c.milestoneId, c.heroId]),
  );

  return allMilestones.map(milestone => {
    const claimedBy = claimedMap.get(milestone.id);
    const eligible = claimedBy
      ? []
      : Object.keys(state.heroStats).filter(heroId =>
          checkMilestoneCondition(milestone, state, heroId, campaign),
        );

    return {
      milestone,
      claimed: claimedBy !== undefined,
      claimedBy,
      claimable: eligible.length > 0,
      eligibleHeroes: eligible,
    };
  });
}

/**
 * Get a summary of all awards with their evaluation status.
 */
export function getAwardSummary(
  allAwards: CampaignAward[],
  campaign: CampaignState,
): Array<{
  award: CampaignAward;
  evaluated: boolean;
  winner?: string;
  score?: number;
  currentLeader?: { heroId: string; score: number };
}> {
  const state = campaign.milestoneAwardState;
  if (!state) {
    return allAwards.map(a => ({
      award: a,
      evaluated: false,
    }));
  }

  const evaluatedMap = new Map(
    state.evaluatedAwards.map(e => [e.awardId, e]),
  );

  return allAwards.map(award => {
    const evaluated = evaluatedMap.get(award.id);
    if (evaluated) {
      return {
        award,
        evaluated: true,
        winner: evaluated.winnerHeroId,
        score: evaluated.score,
      };
    }

    // Show current leader
    const { winnerId, winnerScore } = findAwardWinner(state, award);
    return {
      award,
      evaluated: false,
      currentLeader: winnerId ? { heroId: winnerId, score: Math.abs(winnerScore) } : undefined,
    };
  });
}

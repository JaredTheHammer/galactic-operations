import { describe, it, expect } from 'vitest';
import type {
  CampaignState,
  CampaignMilestone,
  CampaignAward,
  MissionResult,
  HeroCharacter,
} from '../src/types';
import {
  initializeMilestoneState,
  updateHeroStats,
  updateSocialStats,
  trackDamageDealt,
  getClaimableMilestones,
  checkMilestoneCondition,
  claimMilestone,
  evaluateAwards,
  getMilestoneSummary,
  getAwardSummary,
} from '../src/milestones';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHero(id: string, xp: number = 0): HeroCharacter {
  return {
    id, name: `Hero ${id}`, species: 'human', career: 'soldier',
    specializations: [], characteristics: { Brawn: 3, Agility: 3, Intellect: 2, Cunning: 2, Willpower: 2, Presence: 2 },
    skills: {}, talents: [],
    wounds: { current: 0, threshold: 12 }, strain: { current: 0, threshold: 12 },
    soak: 3, equipment: { primaryWeapon: 'blaster', secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: xp, available: xp }, abilityPoints: { total: 0, available: 0 },
  };
}

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'c1', name: 'Test', difficulty: 'standard', createdAt: '', lastPlayedAt: '',
    heroes: { h1: makeHero('h1', 25), h2: makeHero('h2', 10) },
    currentAct: 1, completedMissions: [], availableMissionIds: [],
    credits: 50, narrativeItems: [], consumableInventory: {},
    threatLevel: 0, threatMultiplier: 1.0, missionsPlayed: 3,
    ...overrides,
  };
}

const MILESTONES: CampaignMilestone[] = [
  {
    id: 'ms-kills', name: 'Sharpshooter', description: '10 kills',
    condition: { type: 'total_kills', threshold: 10 },
    xpReward: 5, creditReward: 15,
  },
  {
    id: 'ms-xp', name: 'Battle Hardened', description: '30 XP',
    condition: { type: 'hero_xp_threshold', threshold: 30 },
    xpReward: 5, creditReward: 10,
  },
  {
    id: 'ms-credits', name: 'War Chest', description: '100 credits',
    condition: { type: 'credits_accumulated', threshold: 100 },
    xpReward: 3, creditReward: 20,
  },
  {
    id: 'ms-untouchable', name: 'Untouchable', description: '3 missions no incap',
    condition: { type: 'missions_without_incapacitation', threshold: 3 },
    xpReward: 5, creditReward: 10,
  },
];

const AWARDS: CampaignAward[] = [
  {
    id: 'aw-kills', name: 'Deadliest', description: 'Most kills',
    scoringCriteria: { type: 'most_kills', heroStat: 'kills' },
    xpReward: 5, creditReward: 15, evaluateAfterAct: 1,
  },
  {
    id: 'aw-survivor', name: 'Survivor', description: 'Fewest incaps',
    scoringCriteria: { type: 'fewest_incapacitations', heroStat: 'incapacitations' },
    xpReward: 5, creditReward: 10, evaluateAfterAct: 1,
  },
];

function makeResult(overrides: Partial<MissionResult> = {}): MissionResult {
  return {
    missionId: 'm1', outcome: 'victory', roundsPlayed: 5,
    completedObjectiveIds: ['obj1'],
    xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 0, enemyKills: 3, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 13 },
    heroKills: { h1: 4, h2: 2 },
    lootCollected: ['loot1'],
    heroesIncapacitated: [],
    completedAt: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initializeMilestoneState', () => {
  it('creates empty stats for all heroes', () => {
    const state = initializeMilestoneState(['h1', 'h2']);
    expect(Object.keys(state.heroStats)).toHaveLength(2);
    expect(state.heroStats.h1.kills).toBe(0);
    expect(state.heroStats.h2.kills).toBe(0);
    expect(state.claimedMilestones).toHaveLength(0);
    expect(state.evaluatedAwards).toHaveLength(0);
  });
});

describe('updateHeroStats', () => {
  it('accumulates kills and loot from mission results', () => {
    const state = initializeMilestoneState(['h1', 'h2']);
    const updated = updateHeroStats(state, makeResult(), ['h1', 'h2']);
    expect(updated.heroStats.h1.kills).toBe(4);
    expect(updated.heroStats.h2.kills).toBe(2);
    expect(updated.heroStats.h1.lootCollected).toBe(1);
    expect(updated.heroStats.h1.objectivesCompleted).toBe(1);
  });

  it('tracks incapacitations and resets missionsWithoutIncap', () => {
    const state = initializeMilestoneState(['h1', 'h2']);
    const result = makeResult({ heroesIncapacitated: ['h1'] });
    const updated = updateHeroStats(state, result, ['h1', 'h2']);
    expect(updated.heroStats.h1.incapacitations).toBe(1);
    expect(updated.heroStats.h1.missionsWithoutIncap).toBe(0);
    expect(updated.heroStats.h2.missionsWithoutIncap).toBe(1);
  });

  it('accumulates across multiple missions', () => {
    let state = initializeMilestoneState(['h1']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 5 } }), ['h1']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 6 } }), ['h1']);
    expect(state.heroStats.h1.kills).toBe(11);
    expect(state.heroStats.h1.missionsWithoutIncap).toBe(2);
  });
});

describe('updateSocialStats', () => {
  it('increments social successes for a hero', () => {
    const state = initializeMilestoneState(['h1']);
    const updated = updateSocialStats(state, 'h1', 3);
    expect(updated.heroStats.h1.socialSuccesses).toBe(3);
  });
});

describe('trackDamageDealt', () => {
  it('accumulates damage dealt', () => {
    let state = initializeMilestoneState(['h1']);
    state = trackDamageDealt(state, 'h1', 10);
    state = trackDamageDealt(state, 'h1', 5);
    expect(state.heroStats.h1.damageDealt).toBe(15);
  });
});

describe('milestone checking and claiming', () => {
  it('identifies claimable milestones', () => {
    let state = initializeMilestoneState(['h1', 'h2']);
    // Give h1 enough kills
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 6 } }), ['h1', 'h2']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 5 } }), ['h1', 'h2']);

    const campaign = makeCampaign({ milestoneAwardState: state });
    const claimable = getClaimableMilestones(MILESTONES, campaign);
    // h1 has 11 kills -> ms-kills claimable
    const killMilestone = claimable.find(c => c.milestone.id === 'ms-kills');
    expect(killMilestone).toBeDefined();
    expect(killMilestone!.eligibleHeroIds).toContain('h1');
    expect(killMilestone!.eligibleHeroIds).not.toContain('h2');
  });

  it('claims a milestone and grants rewards', () => {
    let state = initializeMilestoneState(['h1', 'h2']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 12 } }), ['h1', 'h2']);

    const campaign = makeCampaign({ milestoneAwardState: state, credits: 50 });
    const updated = claimMilestone(campaign, 'ms-kills', 'h1', MILESTONES);

    expect(updated.credits).toBe(65); // 50 + 15
    expect(updated.heroes.h1.xp.total).toBe(30); // 25 + 5
    expect(updated.milestoneAwardState!.claimedMilestones).toHaveLength(1);
    expect(updated.milestoneAwardState!.claimedMilestones[0].heroId).toBe('h1');
  });

  it('throws when milestone already claimed', () => {
    let state = initializeMilestoneState(['h1']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 12 } }), ['h1']);
    state = {
      ...state,
      claimedMilestones: [{ milestoneId: 'ms-kills', heroId: 'h1', claimedAtMission: 1 }],
    };

    const campaign = makeCampaign({ milestoneAwardState: state });
    expect(() => claimMilestone(campaign, 'ms-kills', 'h1', MILESTONES)).toThrow('already claimed');
  });

  it('throws when condition not met', () => {
    const state = initializeMilestoneState(['h1']);
    const campaign = makeCampaign({ milestoneAwardState: state });
    expect(() => claimMilestone(campaign, 'ms-kills', 'h1', MILESTONES)).toThrow('does not meet');
  });
});

describe('evaluateAwards', () => {
  it('finds the winner and grants rewards', () => {
    let state = initializeMilestoneState(['h1', 'h2']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 8, h2: 3 } }), ['h1', 'h2']);

    const campaign = makeCampaign({ milestoneAwardState: state, credits: 50 });
    const updated = evaluateAwards(campaign, AWARDS, 1);

    // h1 should win most kills
    const evaluated = updated.milestoneAwardState!.evaluatedAwards;
    const killAward = evaluated.find(e => e.awardId === 'aw-kills');
    expect(killAward).toBeDefined();
    expect(killAward!.winnerHeroId).toBe('h1');
    expect(killAward!.score).toBe(8);

    // h1 and h2 both have 0 incaps, but h1 wins on lexicographic ordering
    // Either winner is acceptable since they tie
    const survivorAward = evaluated.find(e => e.awardId === 'aw-survivor');
    expect(survivorAward).toBeDefined();
  });

  it('skips already evaluated awards', () => {
    let state = initializeMilestoneState(['h1']);
    state = {
      ...state,
      evaluatedAwards: [{ awardId: 'aw-kills', winnerHeroId: 'h1', score: 5 }],
    };

    const campaign = makeCampaign({ milestoneAwardState: state, credits: 50 });
    const updated = evaluateAwards(campaign, AWARDS, 1);
    // Should only add aw-survivor, not re-evaluate aw-kills
    expect(updated.milestoneAwardState!.evaluatedAwards).toHaveLength(2);
  });

  it('skips awards for different acts', () => {
    const state = initializeMilestoneState(['h1']);
    const campaign = makeCampaign({ milestoneAwardState: state });
    const updated = evaluateAwards(campaign, AWARDS, 2);
    // Awards are for act 1, requesting act 2 -> no evaluations
    expect(updated.milestoneAwardState!.evaluatedAwards).toHaveLength(0);
  });
});

describe('getMilestoneSummary', () => {
  it('returns summary with claim status', () => {
    let state = initializeMilestoneState(['h1']);
    state = {
      ...state,
      claimedMilestones: [{ milestoneId: 'ms-kills', heroId: 'h1', claimedAtMission: 2 }],
    };

    const campaign = makeCampaign({ milestoneAwardState: state });
    const summary = getMilestoneSummary(MILESTONES, campaign);

    const killEntry = summary.find(s => s.milestone.id === 'ms-kills')!;
    expect(killEntry.claimed).toBe(true);
    expect(killEntry.claimedBy).toBe('h1');
  });
});

describe('getAwardSummary', () => {
  it('shows current leader for unevaluated awards', () => {
    let state = initializeMilestoneState(['h1', 'h2']);
    state = updateHeroStats(state, makeResult({ heroKills: { h1: 5, h2: 2 } }), ['h1', 'h2']);

    const campaign = makeCampaign({ milestoneAwardState: state });
    const summary = getAwardSummary(AWARDS, campaign);

    const killEntry = summary.find(s => s.award.id === 'aw-kills')!;
    expect(killEntry.evaluated).toBe(false);
    expect(killEntry.currentLeader?.heroId).toBe('h1');
    expect(killEntry.currentLeader?.score).toBe(5);
  });
});

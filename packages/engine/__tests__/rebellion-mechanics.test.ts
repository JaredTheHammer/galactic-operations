/**
 * Rebellion Mechanics Tests
 * Exposure tracker and Influence/Control system
 */

import { describe, it, expect } from 'vitest';
import {
  createCampaign,
  completeMission,
  calculateMissionExposure,
  calculateMissionInfluence,
  calculateMissionControl,
  updateActProgress,
  freezeActOutcome,
  getActOutcomeConsequences,
  applyActOutcomeConsequences,
  getFinaleExposureModifiers,
  campaignToJSON,
  campaignFromJSON,
  getCampaignEpilogue,
} from '../src/campaign-v2';

import type {
  CampaignState,
  HeroCharacter,
  MissionDefinition,
  ActProgress,
  ActOutcome,
} from '../src/types';

import {
  getExposureStatus,
  getActOutcomeTier,
  createActProgress,
} from '../src/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, 'athletics': 1 },
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'e-11', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 50, available: 20 },
    ...overrides,
  };
}

function makeTestMission(overrides: Partial<MissionDefinition> = {}): MissionDefinition {
  return {
    id: 'test-mission-1',
    name: 'Test Mission',
    description: 'A test mission',
    narrativeIntro: 'Intro text',
    narrativeSuccess: 'Success text',
    narrativeFailure: 'Failure text',
    mapId: 'test-map',
    mapPreset: 'skirmish',
    boardsWide: 3,
    boardsTall: 3,
    difficulty: 'moderate',
    roundLimit: 8,
    recommendedHeroCount: 2,
    imperialThreat: 10,
    threatPerRound: 2,
    operativeDeployZone: [{ x: 0, y: 0 }],
    initialEnemies: [
      { npcProfileId: 'stormtrooper', count: 4, asMinGroup: true },
    ],
    reinforcements: [],
    objectives: [
      {
        id: 'obj-eliminate',
        type: 'eliminate_all',
        side: 'Operative',
        description: 'Eliminate all enemies',
        priority: 'primary',
        xpReward: 0,
      },
      {
        id: 'obj-loot',
        type: 'collect_loot',
        side: 'Operative',
        description: 'Collect 2 loot tokens',
        targetCount: 2,
        priority: 'secondary',
        xpReward: 4,
      },
    ],
    victoryConditions: [
      { side: 'Operative', description: 'Eliminate all', requiredObjectiveIds: ['obj-eliminate'] },
      { side: 'Imperial', description: 'Kill all heroes', requiredObjectiveIds: [] },
    ],
    lootTokens: [
      { id: 'loot-1', position: { x: 10, y: 10 }, reward: { type: 'xp', value: 2 } },
      { id: 'loot-2', position: { x: 20, y: 10 }, reward: { type: 'credits', value: 100 } },
    ],
    campaignAct: 1,
    missionIndex: 1,
    prerequisites: [],
    unlocksNext: ['test-mission-2'],
    baseXP: 5,
    bonusXPPerLoot: 2,
    bonusXPPerKill: 1,
    maxKillXP: 5,
    leaderKillXP: 5,
    ...overrides,
  };
}

function makeCampaignWithProgress(overrides: Partial<CampaignState> = {}): CampaignState {
  const hero = makeTestHero();
  return {
    ...createCampaign({
      name: 'Test Campaign',
      difficulty: 'standard',
      heroes: [hero],
      startingMissionId: 'test-mission-1',
    }),
    ...overrides,
  };
}

// ============================================================================
// EXPOSURE STATUS
// ============================================================================

describe('getExposureStatus', () => {
  it('returns ghost for 0-3', () => {
    expect(getExposureStatus(0)).toBe('ghost');
    expect(getExposureStatus(3)).toBe('ghost');
  });

  it('returns detected for 4-6', () => {
    expect(getExposureStatus(4)).toBe('detected');
    expect(getExposureStatus(6)).toBe('detected');
  });

  it('returns hunted for 7+', () => {
    expect(getExposureStatus(7)).toBe('hunted');
    expect(getExposureStatus(10)).toBe('hunted');
  });
});

// ============================================================================
// ACT OUTCOME TIER
// ============================================================================

describe('getActOutcomeTier', () => {
  it('returns dominant for delta >= 5', () => {
    expect(getActOutcomeTier(5)).toBe('dominant');
    expect(getActOutcomeTier(10)).toBe('dominant');
  });

  it('returns favorable for delta 2-4', () => {
    expect(getActOutcomeTier(2)).toBe('favorable');
    expect(getActOutcomeTier(4)).toBe('favorable');
  });

  it('returns contested for delta -1 to 1', () => {
    expect(getActOutcomeTier(-1)).toBe('contested');
    expect(getActOutcomeTier(0)).toBe('contested');
    expect(getActOutcomeTier(1)).toBe('contested');
  });

  it('returns unfavorable for delta -4 to -2', () => {
    expect(getActOutcomeTier(-2)).toBe('unfavorable');
    expect(getActOutcomeTier(-4)).toBe('unfavorable');
  });

  it('returns dire for delta <= -5', () => {
    expect(getActOutcomeTier(-5)).toBe('dire');
    expect(getActOutcomeTier(-10)).toBe('dire');
  });
});

// ============================================================================
// MISSION EXPOSURE CALCULATION
// ============================================================================

describe('calculateMissionExposure', () => {
  const mission = makeTestMission();

  it('adds +2 for defeat', () => {
    const delta = calculateMissionExposure(mission, 'defeat', [], [], 0, 4);
    // defeat +2, 2 incomplete objectives +2 = 4
    expect(delta).toBe(4);
  });

  it('adds +1 per incapacitated hero', () => {
    const delta = calculateMissionExposure(mission, 'victory', ['hero-1', 'hero-2'], ['obj-eliminate', 'obj-loot'], 3, 4);
    // 2 incap = +2, all objectives complete, victory, no high kills, no round limit
    // perfect mission check fails (incap > 0), so no -1
    expect(delta).toBe(2);
  });

  it('adds +1 per incomplete objective', () => {
    const delta = calculateMissionExposure(mission, 'victory', [], ['obj-eliminate'], 3, 4);
    // 1 incomplete objective = +1
    // not a perfect mission (1 incomplete), so no -1
    expect(delta).toBe(1);
  });

  it('adds +1 for high body count (>8 kills)', () => {
    const delta = calculateMissionExposure(mission, 'victory', [], ['obj-eliminate', 'obj-loot'], 9, 4);
    // high kills +1, but also perfect mission -1 (all objectives, victory, no incap)
    expect(delta).toBe(0); // +1 -1 = 0
  });

  it('adds +1 when round limit reached', () => {
    const delta = calculateMissionExposure(mission, 'victory', [], ['obj-eliminate', 'obj-loot'], 3, 8);
    // round limit reached +1, perfect mission -1
    expect(delta).toBe(0);
  });

  it('gives -1 for perfect mission', () => {
    const delta = calculateMissionExposure(mission, 'victory', [], ['obj-eliminate', 'obj-loot'], 3, 4);
    // perfect: victory, all objectives, no incap = -1
    expect(delta).toBe(-1);
  });

  it('accumulates multiple sources', () => {
    // defeat (+2), 2 incap (+2), 0 objectives completed (+2), high kills (+1), round limit (+1)
    const delta = calculateMissionExposure(mission, 'defeat', ['hero-1', 'hero-2'], [], 10, 8);
    expect(delta).toBe(8);
  });
});

// ============================================================================
// MISSION INFLUENCE CALCULATION
// ============================================================================

describe('calculateMissionInfluence', () => {
  it('adds +2 for victory', () => {
    expect(calculateMissionInfluence('victory', [])).toBe(2);
  });

  it('adds nothing for defeat', () => {
    expect(calculateMissionInfluence('defeat', [])).toBe(0);
  });

  it('adds +1 per completed objective', () => {
    expect(calculateMissionInfluence('victory', ['obj-1', 'obj-2'])).toBe(4); // 2 + 2
  });
});

// ============================================================================
// MISSION CONTROL CALCULATION
// ============================================================================

describe('calculateMissionControl', () => {
  it('always adds +1 passive', () => {
    expect(calculateMissionControl('victory', [])).toBe(1);
  });

  it('adds +3 for defeat', () => {
    expect(calculateMissionControl('defeat', [])).toBe(4); // 1 passive + 3
  });

  it('adds +1 for draw', () => {
    expect(calculateMissionControl('draw', [])).toBe(2); // 1 passive + 1
  });

  it('adds +1 per incapacitated hero', () => {
    expect(calculateMissionControl('victory', ['hero-1', 'hero-2'])).toBe(3); // 1 + 2
  });
});

// ============================================================================
// UPDATE ACT PROGRESS
// ============================================================================

describe('updateActProgress', () => {
  it('updates exposure, influence, and control', () => {
    const progress = createActProgress(1);
    const updated = updateActProgress(progress, 3, 2, 1);
    expect(updated.exposure).toBe(3);
    expect(updated.influence).toBe(2);
    expect(updated.control).toBe(1);
  });

  it('clamps exposure to [0, 10]', () => {
    const progress = createActProgress(1);
    const high = updateActProgress(progress, 15, 0, 0);
    expect(high.exposure).toBe(10);

    const low = updateActProgress(progress, -5, 0, 0);
    expect(low.exposure).toBe(0);
  });

  it('grants one-time control bonus at exposure threshold 4 (detected)', () => {
    const progress = createActProgress(1);
    const updated = updateActProgress(progress, 4, 0, 0);
    expect(updated.control).toBe(1); // +1 control from threshold crossing
    expect(updated.exposureThresholdsTriggered).toContain(4);
  });

  it('grants one-time control bonus at exposure threshold 7 (hunted)', () => {
    const progress: ActProgress = {
      act: 1,
      exposure: 5,
      influence: 0,
      control: 0,
      exposureThresholdsTriggered: [4], // already triggered 4
    };
    const updated = updateActProgress(progress, 2, 0, 0);
    expect(updated.exposure).toBe(7);
    expect(updated.control).toBe(2); // +2 control from threshold 7
    expect(updated.exposureThresholdsTriggered).toContain(7);
  });

  it('does not re-trigger already triggered thresholds', () => {
    const progress: ActProgress = {
      act: 1,
      exposure: 5,
      influence: 0,
      control: 3,
      exposureThresholdsTriggered: [4, 7],
    };
    const updated = updateActProgress(progress, 2, 0, 0);
    expect(updated.control).toBe(3); // no additional bonus
  });
});

// ============================================================================
// FREEZE ACT OUTCOME
// ============================================================================

describe('freezeActOutcome', () => {
  it('creates outcome with correct delta and tier', () => {
    const progress: ActProgress = {
      act: 1,
      exposure: 5,
      influence: 8,
      control: 3,
      exposureThresholdsTriggered: [4],
    };
    const outcome = freezeActOutcome(progress);
    expect(outcome.act).toBe(1);
    expect(outcome.delta).toBe(5); // 8 - 3
    expect(outcome.tier).toBe('dominant');
    expect(outcome.exposure).toBe(5);
  });

  it('calculates dire tier for negative delta', () => {
    const progress: ActProgress = {
      act: 2,
      exposure: 8,
      influence: 2,
      control: 10,
      exposureThresholdsTriggered: [4, 7],
    };
    const outcome = freezeActOutcome(progress);
    expect(outcome.delta).toBe(-8);
    expect(outcome.tier).toBe('dire');
  });
});

// ============================================================================
// ACT OUTCOME CONSEQUENCES
// ============================================================================

describe('getActOutcomeConsequences', () => {
  it('dominant: +100 credits, -2 threat', () => {
    const c = getActOutcomeConsequences('dominant');
    expect(c.creditsDelta).toBe(100);
    expect(c.threatModifier).toBe(-2);
    expect(c.loseCompanion).toBe(false);
  });

  it('favorable: +50 credits, -1 threat', () => {
    const c = getActOutcomeConsequences('favorable');
    expect(c.creditsDelta).toBe(50);
    expect(c.threatModifier).toBe(-1);
  });

  it('contested: no changes', () => {
    const c = getActOutcomeConsequences('contested');
    expect(c.creditsDelta).toBe(0);
    expect(c.threatModifier).toBe(0);
  });

  it('unfavorable: -25 credits, +1 threat', () => {
    const c = getActOutcomeConsequences('unfavorable');
    expect(c.creditsDelta).toBe(-25);
    expect(c.threatModifier).toBe(1);
  });

  it('dire: -50 credits, +2 threat, lose companion', () => {
    const c = getActOutcomeConsequences('dire');
    expect(c.creditsDelta).toBe(-50);
    expect(c.threatModifier).toBe(2);
    expect(c.loseCompanion).toBe(true);
  });
});

describe('applyActOutcomeConsequences', () => {
  it('applies dominant consequences: credits and threat', () => {
    const campaign = makeCampaignWithProgress({
      credits: 200,
      threatLevel: 6,
      factionReputation: { rebel: 3, underworld: 1 },
    });
    const outcome: ActOutcome = {
      act: 1, exposure: 2, influence: 10, control: 3, delta: 7, tier: 'dominant',
    };
    const result = applyActOutcomeConsequences(campaign, outcome);
    expect(result.credits).toBe(300); // +100
    expect(result.threatLevel).toBe(4); // -2
    // dominant gives +2 rep to highest faction
    expect(result.factionReputation?.rebel).toBe(5);
  });

  it('applies dire consequences: credits, threat, companion loss', () => {
    const campaign = makeCampaignWithProgress({
      credits: 30,
      threatLevel: 6,
      companions: ['drez-venn', 'krrssk'],
      factionReputation: { rebel: 3, underworld: 2 },
    });
    const outcome: ActOutcome = {
      act: 1, exposure: 9, influence: 1, control: 8, delta: -7, tier: 'dire',
    };
    const result = applyActOutcomeConsequences(campaign, outcome);
    expect(result.credits).toBe(0); // 30 - 50, floored at 0
    expect(result.threatLevel).toBe(8); // +2
    expect(result.companions).toEqual(['drez-venn']); // lost last companion
    // dire: -1 to top two factions
    expect(result.factionReputation?.rebel).toBe(2);
    expect(result.factionReputation?.underworld).toBe(1);
  });

  it('floors credits at 0', () => {
    const campaign = makeCampaignWithProgress({ credits: 10 });
    const outcome: ActOutcome = {
      act: 1, exposure: 5, influence: 1, control: 6, delta: -5, tier: 'dire',
    };
    const result = applyActOutcomeConsequences(campaign, outcome);
    expect(result.credits).toBe(0);
  });
});

// ============================================================================
// FINALE EXPOSURE MODIFIERS
// ============================================================================

describe('getFinaleExposureModifiers', () => {
  it('ghost (0-3): no modifiers', () => {
    const mods = getFinaleExposureModifiers(2);
    expect(mods.threatBonus).toBe(0);
    expect(mods.roundLimitModifier).toBe(0);
    expect(mods.extraReinforcements).toHaveLength(0);
  });

  it('detected (4-6): +3 threat, -1 round, 1 extra wave', () => {
    const mods = getFinaleExposureModifiers(5);
    expect(mods.threatBonus).toBe(3);
    expect(mods.roundLimitModifier).toBe(-1);
    expect(mods.extraReinforcements).toHaveLength(1);
    expect(mods.extraReinforcements[0].triggerRound).toBe(3);
  });

  it('hunted (7+): +5 threat, -2 rounds, 2 extra waves', () => {
    const mods = getFinaleExposureModifiers(8);
    expect(mods.threatBonus).toBe(5);
    expect(mods.roundLimitModifier).toBe(-2);
    expect(mods.extraReinforcements).toHaveLength(2);
  });
});

// ============================================================================
// INTEGRATION: completeMission updates actProgress
// ============================================================================

describe('completeMission rebellion mechanics integration', () => {
  const allMissions: Record<string, MissionDefinition> = {
    'test-mission-1': makeTestMission(),
    'test-mission-2': makeTestMission({ id: 'test-mission-2', missionIndex: 2, prerequisites: ['test-mission-1'], unlocksNext: [] }),
  };

  it('updates actProgress after mission completion', () => {
    const campaign = makeCampaignWithProgress();
    const { campaign: updated } = completeMission(campaign, {
      mission: allMissions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: ['obj-eliminate', 'obj-loot'],
      heroKills: { 'hero-1': 4 },
      lootCollected: ['loot-1'],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    expect(updated.actProgress).toBeDefined();
    expect(updated.actProgress!.act).toBe(1);
    // Victory with all objectives, no incap = perfect mission (-1 exposure)
    expect(updated.actProgress!.exposure).toBe(0); // clamped at 0
    // Influence: +2 victory + 2 objectives = +4
    expect(updated.actProgress!.influence).toBe(4);
    // Control: +1 passive
    expect(updated.actProgress!.control).toBe(1);
  });

  it('accumulates actProgress across multiple missions', () => {
    const campaign = makeCampaignWithProgress();

    // First mission: sloppy victory
    const { campaign: after1 } = completeMission(campaign, {
      mission: allMissions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 8, // hit round limit
      completedObjectiveIds: ['obj-eliminate'], // missed one objective
      heroKills: { 'hero-1': 10 }, // high kills
      lootCollected: [],
      heroesIncapacitated: ['hero-1'],
      leaderKilled: false,
    }, allMissions);

    // exposure: +1 incap, +1 missed obj, +1 high kills, +1 round limit = +4
    expect(after1.actProgress!.exposure).toBe(4);
    // Control should have gotten +1 from threshold crossing at 4
    expect(after1.actProgress!.exposureThresholdsTriggered).toContain(4);

    // Second mission
    const { campaign: after2 } = completeMission(after1, {
      mission: allMissions['test-mission-2'],
      outcome: 'defeat',
      roundsPlayed: 8,
      completedObjectiveIds: [],
      heroKills: { 'hero-1': 2 },
      lootCollected: [],
      heroesIncapacitated: ['hero-1'],
      leaderKilled: false,
    }, allMissions);

    // Additional exposure: +2 defeat, +1 incap, +2 missed objectives, +1 round limit = +6
    // total exposure: 4 + 6 = 10
    expect(after2.actProgress!.exposure).toBe(10);
  });

  it('freezes act outcome and resets progress on act transition', () => {
    const finaleMission = makeTestMission({
      id: 'test-finale',
      missionIndex: 4, // act finale
      campaignAct: 1,
      unlocksNext: ['act2-mission-1'],
    });
    const act2Mission = makeTestMission({
      id: 'act2-mission-1',
      campaignAct: 2,
      missionIndex: 1,
      prerequisites: ['test-finale'],
      unlocksNext: [],
    });

    const missions: Record<string, MissionDefinition> = {
      'test-finale': finaleMission,
      'act2-mission-1': act2Mission,
    };

    const campaign = makeCampaignWithProgress({
      actProgress: {
        act: 1,
        exposure: 5,
        influence: 8,
        control: 3,
        exposureThresholdsTriggered: [4],
      },
      availableMissionIds: ['test-finale'],
    });

    const { campaign: updated } = completeMission(campaign, {
      mission: finaleMission,
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-eliminate', 'obj-loot'],
      heroKills: { 'hero-1': 4 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, missions);

    expect(updated.availableMissionIds).toContain('act2-mission-1');

    // Act should have advanced
    expect(updated.currentAct).toBe(2);

    // ActOutcome should be recorded
    expect(updated.actOutcomes).toHaveLength(1);
    expect(updated.actOutcomes![0].act).toBe(1);
    expect(updated.actOutcomes![0].tier).toBeDefined();

    // ActProgress should be reset for act 2
    expect(updated.actProgress!.act).toBe(2);
    expect(updated.actProgress!.exposure).toBe(0);
    expect(updated.actProgress!.influence).toBe(0);
    expect(updated.actProgress!.control).toBe(0);
  });

  it('initializes actProgress if campaign lacks it (backward compat)', () => {
    const campaign = makeCampaignWithProgress();
    delete (campaign as any).actProgress;

    const { campaign: updated } = completeMission(campaign, {
      mission: allMissions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: ['obj-eliminate', 'obj-loot'],
      heroKills: { 'hero-1': 3 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    expect(updated.actProgress).toBeDefined();
    expect(updated.actProgress!.act).toBe(1);
  });
});

// ============================================================================
// CREATE ACT PROGRESS
// ============================================================================

describe('createActProgress', () => {
  it('creates fresh progress for given act', () => {
    const progress = createActProgress(2);
    expect(progress.act).toBe(2);
    expect(progress.exposure).toBe(0);
    expect(progress.influence).toBe(0);
    expect(progress.control).toBe(0);
    expect(progress.exposureThresholdsTriggered).toEqual([]);
  });
});

// ============================================================================
// SERIALIZATION
// ============================================================================

describe('serialization', () => {
  it('preserves actProgress and actOutcomes through JSON round-trip', () => {
    const campaign = makeCampaignWithProgress({
      actProgress: {
        act: 2,
        exposure: 5,
        influence: 7,
        control: 3,
        exposureThresholdsTriggered: [4],
      },
      actOutcomes: [
        { act: 1, exposure: 4, influence: 6, control: 4, delta: 2, tier: 'favorable' },
      ],
    });

    const json = campaignToJSON(campaign);
    const restored = campaignFromJSON(json);

    expect(restored.actProgress).toEqual(campaign.actProgress);
    expect(restored.actOutcomes).toEqual(campaign.actOutcomes);
  });

  it('loads older saves without actProgress gracefully', () => {
    const campaign = makeCampaignWithProgress();
    delete campaign.actProgress;
    delete campaign.actOutcomes;

    const json = campaignToJSON(campaign);
    const restored = campaignFromJSON(json);

    expect(restored.actProgress).toBeUndefined();
    expect(restored.actOutcomes).toBeUndefined();
  });
});

// ============================================================================
// CAMPAIGN EPILOGUE
// ============================================================================

describe('getCampaignEpilogue', () => {
  it('returns null when no act outcomes exist', () => {
    const campaign = makeCampaignWithProgress({ actOutcomes: [] });
    expect(getCampaignEpilogue(campaign)).toBeNull();
  });

  it('returns null when actOutcomes is undefined', () => {
    const campaign = makeCampaignWithProgress();
    delete campaign.actOutcomes;
    expect(getCampaignEpilogue(campaign)).toBeNull();
  });

  it('returns legendary for all dominant acts (score 6)', () => {
    const campaign = makeCampaignWithProgress({
      actOutcomes: [
        { act: 1, exposure: 1, influence: 8, control: 2, delta: 6, tier: 'dominant' },
        { act: 2, exposure: 2, influence: 7, control: 1, delta: 6, tier: 'dominant' },
        { act: 3, exposure: 0, influence: 9, control: 3, delta: 6, tier: 'dominant' },
      ],
    });
    const epilogue = getCampaignEpilogue(campaign)!;
    expect(epilogue.tier).toBe('legendary');
    expect(epilogue.cumulativeScore).toBe(6);
    expect(epilogue.actSummaries).toHaveLength(3);
    expect(epilogue.title).toBe('A New Dawn');
  });

  it('returns heroic for mostly favorable acts (score 2-3)', () => {
    const campaign = makeCampaignWithProgress({
      actOutcomes: [
        { act: 1, exposure: 3, influence: 5, control: 2, delta: 3, tier: 'favorable' },
        { act: 2, exposure: 4, influence: 4, control: 4, delta: 0, tier: 'contested' },
        { act: 3, exposure: 2, influence: 6, control: 3, delta: 3, tier: 'favorable' },
      ],
    });
    const epilogue = getCampaignEpilogue(campaign)!;
    expect(epilogue.tier).toBe('heroic');
    expect(epilogue.cumulativeScore).toBe(2);
  });

  it('returns pyrrhic for mixed results (score -1 to 1)', () => {
    const campaign = makeCampaignWithProgress({
      actOutcomes: [
        { act: 1, exposure: 5, influence: 4, control: 4, delta: 0, tier: 'contested' },
        { act: 2, exposure: 6, influence: 3, control: 4, delta: -1, tier: 'contested' },
        { act: 3, exposure: 3, influence: 5, control: 5, delta: 0, tier: 'contested' },
      ],
    });
    const epilogue = getCampaignEpilogue(campaign)!;
    expect(epilogue.tier).toBe('pyrrhic');
    expect(epilogue.cumulativeScore).toBe(0);
  });

  it('returns bittersweet for mostly unfavorable (score -2 to -3)', () => {
    const campaign = makeCampaignWithProgress({
      actOutcomes: [
        { act: 1, exposure: 7, influence: 2, control: 5, delta: -3, tier: 'unfavorable' },
        { act: 2, exposure: 5, influence: 4, control: 4, delta: 0, tier: 'contested' },
        { act: 3, exposure: 6, influence: 2, control: 4, delta: -2, tier: 'unfavorable' },
      ],
    });
    const epilogue = getCampaignEpilogue(campaign)!;
    expect(epilogue.tier).toBe('bittersweet');
    expect(epilogue.cumulativeScore).toBe(-2);
  });

  it('returns fallen for all dire acts (score -6)', () => {
    const campaign = makeCampaignWithProgress({
      actOutcomes: [
        { act: 1, exposure: 10, influence: 1, control: 7, delta: -6, tier: 'dire' },
        { act: 2, exposure: 9, influence: 0, control: 8, delta: -8, tier: 'dire' },
        { act: 3, exposure: 10, influence: 1, control: 9, delta: -8, tier: 'dire' },
      ],
    });
    const epilogue = getCampaignEpilogue(campaign)!;
    expect(epilogue.tier).toBe('fallen');
    expect(epilogue.cumulativeScore).toBe(-6);
    expect(epilogue.title).toBe('Imperial Dominion');
  });

  it('works with partial act outcomes (mid-campaign)', () => {
    const campaign = makeCampaignWithProgress({
      actOutcomes: [
        { act: 1, exposure: 3, influence: 6, control: 2, delta: 4, tier: 'favorable' },
      ],
    });
    const epilogue = getCampaignEpilogue(campaign)!;
    expect(epilogue.tier).toBe('pyrrhic'); // score 1 -> pyrrhic
    expect(epilogue.actSummaries).toHaveLength(1);
  });
});

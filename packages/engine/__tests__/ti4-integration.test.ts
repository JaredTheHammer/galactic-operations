/**
 * TI4 Systems Integration Tests
 *
 * Tests that relic fragments, secret objectives, agenda directives,
 * and command tokens integrate correctly through completeMission
 * and the campaign lifecycle.
 */

import { describe, it, expect } from 'vitest';
import { completeMission, createCampaign } from '../src/campaign-v2';
import { addFragment } from '../src/relic-fragments';
import { decrementDirectiveDurations, getDirectiveXPBonus } from '../src/agenda-phase';
import type {
  CampaignState,
  HeroCharacter,
  MissionDefinition,
  GameData,
  MissionSecretObjectiveState,
  AgendaDirective,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2 },
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'e-11', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 50, available: 20 },
    ...overrides,
  };
}

function makeMission(overrides: Partial<MissionDefinition> = {}): MissionDefinition {
  return {
    id: 'test-mission-1',
    name: 'Test Mission',
    description: 'A test mission',
    narrativeIntro: 'Intro',
    narrativeSuccess: 'Success',
    narrativeFailure: 'Failure',
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
    initialEnemies: [{ npcProfileId: 'stormtrooper', count: 4, asMinGroup: true }],
    reinforcements: [],
    objectives: [
      { id: 'obj-1', type: 'eliminate_all', side: 'Operative', description: 'Eliminate all', priority: 'primary', xpReward: 0 },
    ],
    victoryConditions: [
      { side: 'Operative', description: 'Eliminate all', requiredObjectiveIds: ['obj-1'] },
    ],
    lootTokens: [],
    campaignAct: 1,
    missionIndex: 1,
    prerequisites: [],
    unlocksNext: ['test-mission-2'],
    baseXP: 10,
    bonusXPPerLoot: 2,
    bonusXPPerKill: 1,
    maxKillXP: 5,
    leaderKillXP: 5,
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  const hero = makeHero();
  return {
    id: 'test-campaign',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: new Date().toISOString(),
    lastPlayedAt: new Date().toISOString(),
    heroes: { [hero.id]: hero },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['test-mission-1'],
    credits: 0,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1,
    missionsPlayed: 0,
    ...overrides,
  };
}

const allMissions: Record<string, MissionDefinition> = {
  'test-mission-1': makeMission(),
  'test-mission-2': makeMission({ id: 'test-mission-2', name: 'Test Mission 2', prerequisites: ['test-mission-1'], unlocksNext: [] }),
};

// ============================================================================
// EXPLORATION REWARDS -> RELIC FRAGMENTS
// ============================================================================

describe('completeMission with exploration rewards', () => {
  it('adds relic fragments from exploration rewards', () => {
    const campaign = makeCampaign();
    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: { 'hero-1': 3 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      explorationRewards: [
        { type: 'relic_fragment', fragmentType: 'combat' },
        { type: 'relic_fragment', fragmentType: 'combat' },
        { type: 'relic_fragment', fragmentType: 'tech' },
      ],
    }, allMissions);

    expect(updated.relicFragments).toBeDefined();
    expect(updated.relicFragments!.combat).toBe(2);
    expect(updated.relicFragments!.tech).toBe(1);
    expect(updated.relicFragments!.force).toBe(0);
    expect(updated.relicFragments!.intel).toBe(0);
  });

  it('adds credits from exploration rewards', () => {
    const campaign = makeCampaign({ credits: 100 });
    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      explorationRewards: [
        { type: 'credits', value: 50 },
        { type: 'credits', value: 25 },
      ],
    }, allMissions);

    expect(updated.credits).toBe(175);
  });

  it('accumulates fragments across missions', () => {
    const campaign = makeCampaign({
      relicFragments: { combat: 1, tech: 0, force: 2, intel: 0 },
    });
    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      explorationRewards: [
        { type: 'relic_fragment', fragmentType: 'combat' },
        { type: 'relic_fragment', fragmentType: 'force' },
      ],
    }, allMissions);

    expect(updated.relicFragments!.combat).toBe(2);
    expect(updated.relicFragments!.force).toBe(3);
  });
});

// ============================================================================
// SECRET OBJECTIVES
// ============================================================================

describe('completeMission with secret objectives', () => {
  const gameData: GameData = {
    secretObjectives: {
      'so-kill-3': {
        id: 'so-kill-3',
        name: 'Kill 3 Enemies',
        description: 'Kill 3 enemies in this mission',
        category: 'combat',
        condition: 'enemy_killed',
        threshold: 3,
        xpReward: 5,
        apReward: 1,
        creditsReward: 50,
      },
    },
  } as GameData;

  it('resolves completed secret objectives and awards rewards', () => {
    const campaign = makeCampaign();
    const secretState: MissionSecretObjectiveState = {
      assignments: [
        { objectiveId: 'so-kill-3', heroId: 'hero-1', progress: 3, isCompleted: true },
      ],
      availableDeck: [],
    };

    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: { 'hero-1': 3 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      secretObjectiveState: secretState,
    }, allMissions, gameData);

    // Secret objective should be in completed list
    expect(updated.completedSecretObjectives).toBeDefined();
    expect(updated.completedSecretObjectives!.length).toBe(1);
    expect(updated.completedSecretObjectives![0].objectiveId).toBe('so-kill-3');
    expect(updated.completedSecretObjectives![0].heroId).toBe('hero-1');

    // Hero should have received bonus XP and credits
    const hero = updated.heroes['hero-1'];
    expect(hero).toBeDefined();
    expect(updated.credits).toBeGreaterThanOrEqual(50);
  });

  it('does not resolve incomplete secret objectives', () => {
    const campaign = makeCampaign();
    const secretState: MissionSecretObjectiveState = {
      assignments: [
        { objectiveId: 'so-kill-3', heroId: 'hero-1', progress: 1, isCompleted: false },
      ],
      availableDeck: [],
    };

    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: { 'hero-1': 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      secretObjectiveState: secretState,
    }, allMissions, gameData);

    expect(updated.completedSecretObjectives ?? []).toHaveLength(0);
  });

  it('preserves previously completed secret objectives', () => {
    const campaign = makeCampaign({
      completedSecretObjectives: [
        {
          objectiveId: 'so-old',
          heroId: 'hero-1',
          missionId: 'old-mission',
          xpAwarded: 3,
          apAwarded: 1,
          creditsAwarded: 25,
          completedAt: new Date().toISOString(),
        },
      ],
    });

    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    // Without new secret objective state, existing completed objectives should persist
    expect(updated.completedSecretObjectives!.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// AGENDA DIRECTIVES
// ============================================================================

describe('completeMission with agenda directives', () => {
  it('decrements directive durations on mission completion', () => {
    const directives: AgendaDirective[] = [
      { directiveId: 'dir-1', missionsRemaining: 2, effects: [{ type: 'xp_bonus', value: 2 }] },
      { directiveId: 'dir-2', missionsRemaining: 1, effects: [{ type: 'threat_modifier', value: 1 }] },
    ];
    const campaign = makeCampaign({ activeDirectives: directives });

    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    // dir-1 should go from 2 -> 1, dir-2 should expire (1 -> 0)
    expect(updated.activeDirectives).toBeDefined();
    expect(updated.activeDirectives!.length).toBe(1);
    expect(updated.activeDirectives![0].directiveId).toBe('dir-1');
    expect(updated.activeDirectives![0].missionsRemaining).toBe(1);
  });

  it('applies XP bonus from active directives', () => {
    const directives: AgendaDirective[] = [
      { directiveId: 'dir-xp', missionsRemaining: 2, effects: [{ type: 'xp_bonus', value: 3 }] },
    ];
    const campaign = makeCampaign({ activeDirectives: directives });

    const { campaign: withDirective, result: resultWith } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    // Also complete without directive for comparison
    const campaignNoDir = makeCampaign();
    const { result: resultWithout } = completeMission(campaignNoDir, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    // The directive XP bonus goes through narrativeBonus which is clamped
    // The bonus should result in more total XP
    expect(resultWith.xpBreakdown.total).toBeGreaterThan(resultWithout.xpBreakdown.total);
  });

  it('removes expired directives', () => {
    const directives: AgendaDirective[] = [
      { directiveId: 'dir-expiring', missionsRemaining: 1, effects: [{ type: 'threat_modifier', value: 2 }] },
    ];
    const campaign = makeCampaign({ activeDirectives: directives });

    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    expect(updated.activeDirectives ?? []).toHaveLength(0);
  });
});

// ============================================================================
// COMBINED TI4 SYSTEMS
// ============================================================================

describe('completeMission with all TI4 systems combined', () => {
  const gameData: GameData = {
    secretObjectives: {
      'so-kill-3': {
        id: 'so-kill-3',
        name: 'Kill 3 Enemies',
        description: 'Kill 3 enemies in this mission',
        category: 'combat',
        condition: 'enemy_killed',
        threshold: 3,
        xpReward: 5,
        apReward: 1,
        creditsReward: 50,
      },
    },
  } as GameData;

  it('processes exploration rewards, secret objectives, and directives together', () => {
    const directives: AgendaDirective[] = [
      { directiveId: 'dir-1', missionsRemaining: 3, effects: [{ type: 'xp_bonus', value: 2 }] },
    ];
    const campaign = makeCampaign({
      activeDirectives: directives,
      relicFragments: { combat: 1, tech: 0, force: 0, intel: 0 },
      completedSecretObjectives: [],
    });

    const secretState: MissionSecretObjectiveState = {
      assignments: [
        { objectiveId: 'so-kill-3', heroId: 'hero-1', progress: 3, isCompleted: true },
      ],
      availableDeck: [],
    };

    const { campaign: updated } = completeMission(campaign, {
      mission: makeMission(),
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-1'],
      heroKills: { 'hero-1': 3 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      explorationRewards: [
        { type: 'relic_fragment', fragmentType: 'combat' },
        { type: 'relic_fragment', fragmentType: 'intel' },
        { type: 'credits', value: 75 },
      ],
      secretObjectiveState: secretState,
    }, allMissions, gameData);

    // Relic fragments accumulated
    expect(updated.relicFragments!.combat).toBe(2);
    expect(updated.relicFragments!.intel).toBe(1);

    // Credits include secret objective rewards (50 credits from so-kill-3)
    expect(updated.credits).toBeGreaterThanOrEqual(50);

    // Secret objective completed
    expect(updated.completedSecretObjectives!.length).toBe(1);

    // Directive decremented
    expect(updated.activeDirectives![0].missionsRemaining).toBe(2);
  });
});

// ============================================================================
// STANDALONE SYSTEM HELPERS
// ============================================================================

describe('agenda directive helpers', () => {
  it('getDirectiveXPBonus sums multiple XP bonus effects', () => {
    const campaign = makeCampaign({
      activeDirectives: [
        { directiveId: 'd1', missionsRemaining: 2, effects: [{ type: 'xp_bonus', value: 2 }] },
        { directiveId: 'd2', missionsRemaining: 1, effects: [{ type: 'xp_bonus', value: 3 }, { type: 'threat_modifier', value: 1 }] },
      ],
    });
    expect(getDirectiveXPBonus(campaign)).toBe(5);
  });

  it('getDirectiveXPBonus returns 0 with no directives', () => {
    const campaign = makeCampaign();
    expect(getDirectiveXPBonus(campaign)).toBe(0);
  });

  it('decrementDirectiveDurations removes expired and keeps active', () => {
    const campaign = makeCampaign({
      activeDirectives: [
        { directiveId: 'd1', missionsRemaining: 1, effects: [] },
        { directiveId: 'd2', missionsRemaining: 3, effects: [] },
        { directiveId: 'd3', missionsRemaining: 1, effects: [] },
      ],
    });
    const result = decrementDirectiveDurations(campaign);
    expect(result.activeDirectives!.length).toBe(1);
    expect(result.activeDirectives![0].directiveId).toBe('d2');
    expect(result.activeDirectives![0].missionsRemaining).toBe(2);
  });
});

describe('relic fragment accumulation', () => {
  it('addFragment creates fragments record when missing', () => {
    const campaign = makeCampaign();
    const updated = addFragment(campaign, 'tech', 2);
    expect(updated.relicFragments!.tech).toBe(2);
    expect(updated.relicFragments!.combat).toBe(0);
  });

  it('addFragment accumulates across multiple calls', () => {
    let campaign = makeCampaign();
    campaign = addFragment(campaign, 'combat', 1);
    campaign = addFragment(campaign, 'combat', 2);
    campaign = addFragment(campaign, 'force', 1);
    expect(campaign.relicFragments!.combat).toBe(3);
    expect(campaign.relicFragments!.force).toBe(1);
  });
});

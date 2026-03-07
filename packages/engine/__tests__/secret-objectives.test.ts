/**
 * Secret Objectives Engine Tests
 * Tests for TI4-inspired per-hero secret objective system.
 */

import { describe, it, expect } from 'vitest';
import {
  initializeSecretObjectives,
  updateSecretObjectiveProgress,
  resolveSecretObjectives,
  applySecretObjectiveRewards,
  getHeroSecretObjective,
  getObjectiveDefinition,
} from '../src/secret-objectives';
import type {
  SecretObjectiveDefinition,
  GameData,
  CampaignState,
  HeroCharacter,
  MissionSecretObjectiveState,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTestGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    dice: {} as any,
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: {},
    secretObjectives: {
      'obj-kill-nemesis': {
        id: 'obj-kill-nemesis',
        name: 'Bounty Claimed',
        description: 'Kill a Nemesis',
        category: 'combat',
        condition: 'kill_nemesis',
        threshold: 1,
        xpReward: 5,
        apReward: 1,
        creditsReward: 50,
      },
      'obj-kill-count': {
        id: 'obj-kill-count',
        name: 'Body Count',
        description: 'Kill 4 enemies',
        category: 'combat',
        condition: 'kill_count',
        threshold: 4,
        xpReward: 3,
        apReward: 1,
      },
      'obj-zero-strain': {
        id: 'obj-zero-strain',
        name: 'Cool Under Fire',
        description: 'End with 0 strain',
        category: 'survival',
        condition: 'zero_strain_finish',
        threshold: 1,
        xpReward: 3,
        apReward: 1,
      },
      'obj-first-kill': {
        id: 'obj-first-kill',
        name: 'First Blood',
        description: 'Score first kill',
        category: 'combat',
        condition: 'first_kill',
        threshold: 1,
        xpReward: 2,
        apReward: 1,
      },
      'obj-high-combo': {
        id: 'obj-high-combo',
        name: 'Sabacc Master',
        description: 'Roll Trips or better',
        category: 'combat',
        condition: 'high_combo',
        threshold: 1,
        xpReward: 3,
        apReward: 1,
      },
    },
    ...overrides,
  };
}

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeTestCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01',
    lastPlayedAt: '2026-01-01',
    heroes: {
      'hero-1': makeTestHero({ id: 'hero-1', name: 'Hero One' }),
      'hero-2': makeTestHero({ id: 'hero-2', name: 'Hero Two' }),
    },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: [],
    credits: 100,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    ...overrides,
  };
}

function constRoll(value: number) {
  return () => value;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Secret Objectives - Initialization', () => {
  it('draws one objective per hero', () => {
    const gameData = makeTestGameData();
    const state = initializeSecretObjectives(gameData, ['hero-1', 'hero-2'], [], constRoll(0.5));

    expect(state.assignments).toHaveLength(2);
    expect(state.assignments[0].heroId).toBe('hero-1');
    expect(state.assignments[1].heroId).toBe('hero-2');
    expect(state.assignments[0].objectiveId).not.toBe(state.assignments[1].objectiveId);
  });

  it('excludes previously completed objectives', () => {
    const gameData = makeTestGameData();
    const state = initializeSecretObjectives(
      gameData,
      ['hero-1'],
      ['obj-kill-nemesis', 'obj-kill-count', 'obj-zero-strain', 'obj-first-kill'],
      constRoll(0.5),
    );

    expect(state.assignments).toHaveLength(1);
    expect(state.assignments[0].objectiveId).toBe('obj-high-combo');
  });

  it('handles more heroes than available objectives', () => {
    const gameData = makeTestGameData({
      secretObjectives: {
        'obj-only': {
          id: 'obj-only',
          name: 'Only One',
          description: 'The only objective',
          category: 'combat',
          condition: 'first_kill',
          threshold: 1,
          xpReward: 2,
          apReward: 1,
        },
      },
    });
    const state = initializeSecretObjectives(gameData, ['hero-1', 'hero-2'], [], constRoll(0.5));
    expect(state.assignments).toHaveLength(1);
  });

  it('initializes with zero progress and not completed', () => {
    const gameData = makeTestGameData();
    const state = initializeSecretObjectives(gameData, ['hero-1'], [], constRoll(0.5));

    expect(state.assignments[0].progress).toBe(0);
    expect(state.assignments[0].isCompleted).toBe(false);
  });
});

describe('Secret Objectives - Progress Tracking', () => {
  it('tracks kill count progress', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-kill-count',
        heroId: 'hero-1',
        progress: 0,
        isCompleted: false,
      }],
      availableDeck: [],
    };

    // Kill 3 enemies (threshold is 4)
    for (let i = 0; i < 3; i++) {
      state = updateSecretObjectiveProgress(state, { type: 'enemy_killed', heroId: 'hero-1', enemyTier: 'Minion' }, gameData);
    }
    expect(state.assignments[0].progress).toBe(3);
    expect(state.assignments[0].isCompleted).toBe(false);

    // Kill the 4th
    state = updateSecretObjectiveProgress(state, { type: 'enemy_killed', heroId: 'hero-1', enemyTier: 'Minion' }, gameData);
    expect(state.assignments[0].progress).toBe(4);
    expect(state.assignments[0].isCompleted).toBe(true);
  });

  it('tracks nemesis kill', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-kill-nemesis',
        heroId: 'hero-1',
        progress: 0,
        isCompleted: false,
      }],
      availableDeck: [],
    };

    state = updateSecretObjectiveProgress(state, { type: 'nemesis_killed', heroId: 'hero-1' }, gameData);
    expect(state.assignments[0].isCompleted).toBe(true);
  });

  it('ignores events for wrong hero', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-kill-count',
        heroId: 'hero-1',
        progress: 0,
        isCompleted: false,
      }],
      availableDeck: [],
    };

    state = updateSecretObjectiveProgress(state, { type: 'enemy_killed', heroId: 'hero-2', enemyTier: 'Minion' }, gameData);
    expect(state.assignments[0].progress).toBe(0);
  });

  it('does not update already completed objectives', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-kill-count',
        heroId: 'hero-1',
        progress: 4,
        isCompleted: true,
      }],
      availableDeck: [],
    };

    state = updateSecretObjectiveProgress(state, { type: 'enemy_killed', heroId: 'hero-1', enemyTier: 'Minion' }, gameData);
    expect(state.assignments[0].progress).toBe(4); // Unchanged
  });

  it('tracks zero strain finish at mission end', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-zero-strain',
        heroId: 'hero-1',
        progress: 0,
        isCompleted: false,
      }],
      availableDeck: [],
    };

    state = updateSecretObjectiveProgress(state, {
      type: 'mission_end', heroId: 'hero-1', wounds: 3, strain: 0, anyIncapacitated: false,
    }, gameData);
    expect(state.assignments[0].isCompleted).toBe(true);
  });

  it('fails zero strain if hero has strain', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-zero-strain',
        heroId: 'hero-1',
        progress: 0,
        isCompleted: false,
      }],
      availableDeck: [],
    };

    state = updateSecretObjectiveProgress(state, {
      type: 'mission_end', heroId: 'hero-1', wounds: 0, strain: 2, anyIncapacitated: false,
    }, gameData);
    expect(state.assignments[0].isCompleted).toBe(false);
  });

  it('tracks high combo', () => {
    const gameData = makeTestGameData();
    let state: MissionSecretObjectiveState = {
      assignments: [{
        objectiveId: 'obj-high-combo',
        heroId: 'hero-1',
        progress: 0,
        isCompleted: false,
      }],
      availableDeck: [],
    };

    // Pair doesn't count
    state = updateSecretObjectiveProgress(state, { type: 'combo_rolled', heroId: 'hero-1', comboType: 'Pair' }, gameData);
    expect(state.assignments[0].progress).toBe(0);

    // Trips counts
    state = updateSecretObjectiveProgress(state, { type: 'combo_rolled', heroId: 'hero-1', comboType: 'Trips' }, gameData);
    expect(state.assignments[0].isCompleted).toBe(true);
  });
});

describe('Secret Objectives - Resolution', () => {
  it('resolves completed objectives with rewards', () => {
    const gameData = makeTestGameData();
    const state: MissionSecretObjectiveState = {
      assignments: [
        { objectiveId: 'obj-kill-nemesis', heroId: 'hero-1', progress: 1, isCompleted: true },
        { objectiveId: 'obj-kill-count', heroId: 'hero-2', progress: 2, isCompleted: false },
      ],
      availableDeck: [],
    };

    const completed = resolveSecretObjectives(state, 'mission-1', gameData);
    expect(completed).toHaveLength(1);
    expect(completed[0].heroId).toBe('hero-1');
    expect(completed[0].xpAwarded).toBe(5);
    expect(completed[0].apAwarded).toBe(1);
    expect(completed[0].creditsAwarded).toBe(50);
  });

  it('returns empty array when nothing completed', () => {
    const gameData = makeTestGameData();
    const state: MissionSecretObjectiveState = {
      assignments: [
        { objectiveId: 'obj-kill-count', heroId: 'hero-1', progress: 1, isCompleted: false },
      ],
      availableDeck: [],
    };

    const completed = resolveSecretObjectives(state, 'mission-1', gameData);
    expect(completed).toHaveLength(0);
  });
});

describe('Secret Objectives - Campaign Reward Application', () => {
  it('applies XP, AP, and credits to campaign', () => {
    const campaign = makeTestCampaign();
    const completed = [{
      objectiveId: 'obj-kill-nemesis',
      heroId: 'hero-1',
      missionId: 'mission-1',
      xpAwarded: 5,
      apAwarded: 1,
      creditsAwarded: 50,
      completedAt: '2026-01-01',
    }];

    const updated = applySecretObjectiveRewards(campaign, completed);
    expect(updated.credits).toBe(150);
    expect(updated.heroes['hero-1'].xp.available).toBe(5);
    expect(updated.heroes['hero-1'].abilityPoints.available).toBe(1);
    expect(updated.completedSecretObjectives).toHaveLength(1);
  });
});

describe('Secret Objectives - Utility Functions', () => {
  it('getHeroSecretObjective finds the right assignment', () => {
    const state: MissionSecretObjectiveState = {
      assignments: [
        { objectiveId: 'obj-1', heroId: 'hero-1', progress: 0, isCompleted: false },
        { objectiveId: 'obj-2', heroId: 'hero-2', progress: 0, isCompleted: false },
      ],
      availableDeck: [],
    };

    const result = getHeroSecretObjective(state, 'hero-2');
    expect(result).toBeDefined();
    expect(result!.objectiveId).toBe('obj-2');
  });

  it('getObjectiveDefinition retrieves definition', () => {
    const gameData = makeTestGameData();
    const def = getObjectiveDefinition('obj-kill-nemesis', gameData);
    expect(def).toBeDefined();
    expect(def!.name).toBe('Bounty Claimed');
  });
});

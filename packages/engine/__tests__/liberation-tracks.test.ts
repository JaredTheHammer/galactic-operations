import { describe, it, expect } from 'vitest';
import type {
  CampaignState,
  LiberationTrackId,
  LiberationTrackDefinition,
  LiberationTrackDelta,
  MissionResult,
} from '../src/types';
import {
  initializeLiberationTracks,
  advanceLiberationTracks,
  calculateMissionTrackDeltas,
  calculateSocialTrackDeltas,
  getTrackValue,
  getTrackProgress,
  getActiveLiberationBonuses,
  applyTrackDeltas,
} from '../src/liberation-tracks';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRACK_DEFS: Record<LiberationTrackId, LiberationTrackDefinition> = {
  rebel_influence: {
    id: 'rebel_influence',
    name: 'Rebel Influence',
    description: 'Political progress',
    maxValue: 20,
    thresholds: [
      { value: 5, reward: { type: 'stat_bonus', effect: { type: 'xp_bonus', value: 1 } }, description: '+1 XP' },
      { value: 10, reward: { type: 'narrative', narrativeItemId: 'network', description: 'Network' }, description: 'Network' },
    ],
  },
  imperial_destabilization: {
    id: 'imperial_destabilization',
    name: 'Imperial Destabilization',
    description: 'Military weakening',
    maxValue: 20,
    thresholds: [
      { value: 3, reward: { type: 'stat_bonus', effect: { type: 'threat_reduction', value: 1 } }, description: '-1 threat' },
    ],
  },
  resource_control: {
    id: 'resource_control',
    name: 'Resource Control',
    description: 'Economic dominance',
    maxValue: 20,
    thresholds: [
      { value: 6, reward: { type: 'unlock_equipment', equipmentId: 'heavy-blaster' }, description: 'Heavy blaster' },
    ],
  },
};

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'c1', name: 'Test', difficulty: 'standard', createdAt: '', lastPlayedAt: '',
    heroes: {}, currentAct: 1, completedMissions: [], availableMissionIds: [],
    credits: 50, narrativeItems: [], consumableInventory: {},
    threatLevel: 0, threatMultiplier: 1.0, missionsPlayed: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initializeLiberationTracks', () => {
  it('creates tracks at 0 with no claimed thresholds', () => {
    const state = initializeLiberationTracks();
    expect(state.values.rebel_influence).toBe(0);
    expect(state.values.imperial_destabilization).toBe(0);
    expect(state.values.resource_control).toBe(0);
    expect(state.claimedThresholds).toHaveLength(0);
  });
});

describe('advanceLiberationTracks', () => {
  it('advances a track by the delta amount', () => {
    const state = initializeLiberationTracks();
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'rebel_influence', delta: 3, reason: 'test' },
    ];
    const result = advanceLiberationTracks(state, deltas, TRACK_DEFS);
    expect(result.state.values.rebel_influence).toBe(3);
  });

  it('clamps to maxValue', () => {
    const state = initializeLiberationTracks();
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'rebel_influence', delta: 25, reason: 'test' },
    ];
    const result = advanceLiberationTracks(state, deltas, TRACK_DEFS);
    expect(result.state.values.rebel_influence).toBe(20);
  });

  it('clamps to 0 on negative', () => {
    const state = initializeLiberationTracks();
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'rebel_influence', delta: -5, reason: 'test' },
    ];
    const result = advanceLiberationTracks(state, deltas, TRACK_DEFS);
    expect(result.state.values.rebel_influence).toBe(0);
  });

  it('detects newly crossed thresholds', () => {
    const state = initializeLiberationTracks();
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'rebel_influence', delta: 6, reason: 'test' },
    ];
    const result = advanceLiberationTracks(state, deltas, TRACK_DEFS);
    expect(result.newThresholds).toHaveLength(1);
    expect(result.newThresholds[0].threshold.value).toBe(5);
  });

  it('does not re-trigger already claimed thresholds', () => {
    const state = {
      values: { rebel_influence: 6, imperial_destabilization: 0, resource_control: 0 },
      claimedThresholds: ['rebel_influence:5'],
    };
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'rebel_influence', delta: 5, reason: 'test' },
    ];
    const result = advanceLiberationTracks(state, deltas, TRACK_DEFS);
    // Should trigger the 10 threshold but not re-trigger 5
    expect(result.newThresholds).toHaveLength(1);
    expect(result.newThresholds[0].threshold.value).toBe(10);
  });

  it('applies multiple deltas to different tracks', () => {
    const state = initializeLiberationTracks();
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'rebel_influence', delta: 2, reason: 'a' },
      { trackId: 'imperial_destabilization', delta: 4, reason: 'b' },
      { trackId: 'resource_control', delta: 7, reason: 'c' },
    ];
    const result = advanceLiberationTracks(state, deltas, TRACK_DEFS);
    expect(result.state.values.rebel_influence).toBe(2);
    expect(result.state.values.imperial_destabilization).toBe(4);
    expect(result.state.values.resource_control).toBe(7);
    // imperial_destabilization crossed 3, resource_control crossed 6
    expect(result.newThresholds).toHaveLength(2);
  });
});

describe('calculateMissionTrackDeltas', () => {
  it('generates destabilization deltas from kills and victory', () => {
    const result: MissionResult = {
      missionId: 'm1', outcome: 'victory', roundsPlayed: 5,
      completedObjectiveIds: ['obj1'],
      xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 0, enemyKills: 3, leaderKill: 5, objectiveBonus: 0, narrativeBonus: 0, total: 18 },
      heroKills: { hero1: 4, hero2: 2 },
      lootCollected: [],
      heroesIncapacitated: [],
      completedAt: '',
    };
    const deltas = calculateMissionTrackDeltas(result);
    // 6 kills = +2 destabilization, victory = +2, leader = +1
    const destab = deltas.filter(d => d.trackId === 'imperial_destabilization');
    expect(destab.reduce((s, d) => s + d.delta, 0)).toBe(5);
  });

  it('generates rebel influence from objectives', () => {
    const result: MissionResult = {
      missionId: 'm1', outcome: 'victory', roundsPlayed: 3,
      completedObjectiveIds: ['obj1', 'obj2'],
      xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 0, enemyKills: 0, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 10 },
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      completedAt: '',
    };
    const deltas = calculateMissionTrackDeltas(result);
    const influence = deltas.filter(d => d.trackId === 'rebel_influence');
    expect(influence.length).toBeGreaterThan(0);
  });

  it('applies rebel influence setback on defeat', () => {
    const result: MissionResult = {
      missionId: 'm1', outcome: 'defeat', roundsPlayed: 8,
      completedObjectiveIds: [],
      xpBreakdown: { participation: 5, missionSuccess: 0, lootTokens: 0, enemyKills: 0, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 5 },
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: ['hero1'],
      completedAt: '',
    };
    const deltas = calculateMissionTrackDeltas(result);
    const influence = deltas.filter(d => d.trackId === 'rebel_influence');
    expect(influence.some(d => d.delta < 0)).toBe(true);
  });

  it('generates resource control from loot', () => {
    const result: MissionResult = {
      missionId: 'm1', outcome: 'victory', roundsPlayed: 3,
      completedObjectiveIds: [],
      xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 4, enemyKills: 0, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 14 },
      heroKills: {},
      lootCollected: ['loot1', 'loot2', 'loot3', 'loot4'],
      heroesIncapacitated: [],
      completedAt: '',
    };
    const deltas = calculateMissionTrackDeltas(result);
    const resource = deltas.filter(d => d.trackId === 'resource_control');
    expect(resource.reduce((s, d) => s + d.delta, 0)).toBe(2); // 4/2 = 2
  });
});

describe('calculateSocialTrackDeltas', () => {
  it('generates rebel influence from social successes', () => {
    const deltas = calculateSocialTrackDeltas(4, false, 10);
    const influence = deltas.filter(d => d.trackId === 'rebel_influence');
    expect(influence.reduce((s, d) => s + d.delta, 0)).toBe(2); // 4/2 = 2
  });

  it('generates rebel influence from companion recruitment', () => {
    const deltas = calculateSocialTrackDeltas(0, true, 0);
    const influence = deltas.filter(d => d.trackId === 'rebel_influence');
    expect(influence.some(d => d.delta === 2)).toBe(true);
  });

  it('generates resource control from spending', () => {
    const deltas = calculateSocialTrackDeltas(0, false, 60);
    const resource = deltas.filter(d => d.trackId === 'resource_control');
    expect(resource.length).toBeGreaterThan(0);
  });
});

describe('getTrackProgress', () => {
  it('returns progress for all tracks', () => {
    const campaign = makeCampaign({
      liberationTracks: {
        values: { rebel_influence: 7, imperial_destabilization: 3, resource_control: 0 },
        claimedThresholds: ['rebel_influence:5', 'imperial_destabilization:3'],
      },
    });
    const progress = getTrackProgress(campaign, TRACK_DEFS);
    expect(progress).toHaveLength(3);

    const rebel = progress.find(p => p.trackId === 'rebel_influence')!;
    expect(rebel.current).toBe(7);
    expect(rebel.max).toBe(20);
    expect(rebel.percentage).toBe(35);
    // Next unclaimed threshold for rebel is 10
    expect(rebel.nextThreshold?.value).toBe(10);
  });
});

describe('getActiveLiberationBonuses', () => {
  it('returns stat_bonus effects from claimed thresholds', () => {
    const campaign = makeCampaign({
      liberationTracks: {
        values: { rebel_influence: 6, imperial_destabilization: 4, resource_control: 0 },
        claimedThresholds: ['rebel_influence:5', 'imperial_destabilization:3'],
      },
    });
    const bonuses = getActiveLiberationBonuses(campaign, TRACK_DEFS);
    expect(bonuses).toHaveLength(2);
    expect(bonuses.some(b => b.type === 'xp_bonus')).toBe(true);
    expect(bonuses.some(b => b.type === 'threat_reduction')).toBe(true);
  });
});

describe('applyTrackDeltas', () => {
  it('updates campaign liberation tracks state', () => {
    const campaign = makeCampaign();
    const deltas: LiberationTrackDelta[] = [
      { trackId: 'imperial_destabilization', delta: 5, reason: 'test' },
    ];
    const { campaign: updated, newThresholds } = applyTrackDeltas(campaign, deltas, TRACK_DEFS);
    expect(updated.liberationTracks?.values.imperial_destabilization).toBe(5);
    expect(newThresholds).toHaveLength(1);
  });
});

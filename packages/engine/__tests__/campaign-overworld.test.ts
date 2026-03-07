/**
 * Tests for the Campaign Overworld System
 */
import { describe, it, expect } from 'vitest';
import {
  initializeCampaignOverworld,
  processOverworldPostMission,
  getAvailableMissionsInSector,
  computeEffectiveThreatWithSector,
  getAccessibleSectors,
  travelToSector,
  getCampaignOverworldSummary,
} from '../src/campaign-overworld';
import type {
  CampaignState,
  CampaignOverworldDefinition,
  MissionDefinition,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeOverworldDef(): CampaignOverworldDefinition {
  return {
    id: 'test-overworld',
    name: 'Test System',
    description: 'Test',
    sectors: [
      {
        id: 'sector-a',
        name: 'Alpha',
        description: 'Start',
        controlLevel: 2,
        missionIds: ['m1', 'm2'],
        adjacentSectorIds: ['sector-b'],
        visited: false,
        mutations: [],
      },
      {
        id: 'sector-b',
        name: 'Beta',
        description: 'Adjacent',
        controlLevel: 3,
        missionIds: ['m3', 'm4'],
        adjacentSectorIds: ['sector-a', 'sector-c'],
        visited: false,
        mutations: [],
      },
      {
        id: 'sector-c',
        name: 'Gamma',
        description: 'Far',
        controlLevel: 4,
        missionIds: ['m5'],
        adjacentSectorIds: ['sector-b'],
        visited: false,
        mutations: [],
      },
    ],
    sectorPositions: {
      'sector-a': { x: 0, y: 0 },
      'sector-b': { x: 100, y: 0 },
      'sector-c': { x: 200, y: 0 },
    },
    connections: [
      { from: 'sector-a', to: 'sector-b' },
      { from: 'sector-b', to: 'sector-c' },
    ],
  };
}

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-1',
    name: 'Test',
    difficulty: 'standard',
    createdAt: '2024-01-01',
    lastPlayedAt: '2024-01-01',
    heroes: {},
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['m1', 'm2', 'm3'],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    momentum: 0,
    ...overrides,
  };
}

function makeMission(overrides: Partial<MissionDefinition> = {}): MissionDefinition {
  return {
    id: 'm1',
    name: 'Test Mission',
    description: 'Test',
    narrativeIntro: '',
    narrativeSuccess: '',
    narrativeFailure: '',
    mapId: 'test',
    mapPreset: 'skirmish',
    boardsWide: 3,
    boardsTall: 3,
    difficulty: 'moderate',
    roundLimit: 8,
    recommendedHeroCount: 3,
    imperialThreat: 5,
    threatPerRound: 3,
    operativeDeployZone: [],
    initialEnemies: [],
    reinforcements: [],
    objectives: [],
    victoryConditions: [],
    lootTokens: [],
    campaignAct: 1,
    missionIndex: 1,
    prerequisites: [],
    unlocksNext: [],
    baseXP: 5,
    bonusXPPerLoot: 2,
    bonusXPPerKill: 1,
    maxKillXP: 5,
    leaderKillXP: 5,
    ...overrides,
  } as MissionDefinition;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Campaign Overworld System', () => {
  describe('initializeCampaignOverworld', () => {
    it('initializes overworld on campaign state', () => {
      const campaign = makeCampaign();
      const result = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      expect(result.overworld).toBeDefined();
      expect(result.overworld!.currentSectorId).toBe('sector-a');
      expect(Object.keys(result.overworld!.sectors)).toHaveLength(3);
    });
  });

  describe('processOverworldPostMission', () => {
    it('decreases sector control on victory', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const result = processOverworldPostMission(
        campaign, 'm1', 'victory', false, false, false, false,
      );
      expect(result.overworld!.sectors['sector-a'].controlLevel).toBe(1);
    });

    it('increases sector control on defeat', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const result = processOverworldPostMission(
        campaign, 'm1', 'defeat', false, false, false, false,
      );
      expect(result.overworld!.sectors['sector-a'].controlLevel).toBe(3);
    });

    it('adds secured mutation on victory', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const result = processOverworldPostMission(
        campaign, 'm1', 'victory', false, false, false, false,
      );
      const mutations = result.overworld!.sectors['sector-a'].mutations;
      expect(mutations.some(m => m.type === 'secured')).toBe(true);
    });

    it('adds fortified mutation with bonus enemies on defeat', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const result = processOverworldPostMission(
        campaign, 'm1', 'defeat', false, false, false, false,
      );
      const mutations = result.overworld!.sectors['sector-a'].mutations;
      const fortified = mutations.find(m => m.type === 'fortified');
      expect(fortified).toBeDefined();
      expect(fortified!.effect?.bonusEnemies).toHaveLength(1);
    });

    it('applies escalation at act boundaries', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      // sector-c is at level 4, adjacent to sector-b (level 3)
      const result = processOverworldPostMission(
        campaign, 'm5', 'victory', false, false, false, true, // actJustEnded=true
      );
      // escalation should spread from sector-c (4) to sector-b if < 3
      // sector-b is at 3, so no spread from level 4 (only spreads to < 3)
      expect(result.overworld!.sectors['sector-b'].controlLevel).toBe(3);
    });
  });

  describe('getAvailableMissionsInSector', () => {
    it('filters missions to current sector', () => {
      let campaign = makeCampaign({ availableMissionIds: ['m1', 'm2', 'm3', 'm4'] });
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const available = getAvailableMissionsInSector(campaign);
      expect(available).toContain('m1');
      expect(available).toContain('m2');
      expect(available).not.toContain('m3'); // sector-b
    });

    it('returns all missions without overworld', () => {
      const campaign = makeCampaign({ availableMissionIds: ['m1', 'm2', 'm3'] });
      const available = getAvailableMissionsInSector(campaign);
      expect(available).toHaveLength(3);
    });
  });

  describe('computeEffectiveThreatWithSector', () => {
    it('adds sector control threat bonus', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const mission = makeMission({ id: 'm1', imperialThreat: 5 });
      const result = computeEffectiveThreatWithSector(mission, campaign);
      // sector-a control=2 -> threatBonus=1
      expect(result.sectorBonus).toBe(1);
      expect(result.total).toBe(6); // 5 + 1
    });

    it('accounts for momentum', () => {
      let campaign = makeCampaign({ momentum: -2 });
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const mission = makeMission({ id: 'm1', imperialThreat: 5 });
      const result = computeEffectiveThreatWithSector(mission, campaign);
      // momentum -2: adjustment = -(-2) = +2 (reduces threat for losing player)
      expect(result.momentumAdjustment).toBe(2);
    });
  });

  describe('getAccessibleSectors', () => {
    it('returns adjacent sectors', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const accessible = getAccessibleSectors(campaign);
      expect(accessible).toHaveLength(1);
      expect(accessible[0].id).toBe('sector-b');
    });
  });

  describe('travelToSector', () => {
    it('moves to adjacent sector', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const result = travelToSector(campaign, 'sector-b');
      expect(result.overworld!.currentSectorId).toBe('sector-b');
      expect(result.overworld!.sectors['sector-b'].visited).toBe(true);
    });

    it('throws for non-adjacent sector', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      expect(() => travelToSector(campaign, 'sector-c')).toThrow('not adjacent');
    });

    it('throws without overworld', () => {
      const campaign = makeCampaign();
      expect(() => travelToSector(campaign, 'sector-b')).toThrow('no overworld');
    });
  });

  describe('getCampaignOverworldSummary', () => {
    it('returns summary with all sectors', () => {
      let campaign = makeCampaign();
      campaign = initializeCampaignOverworld(campaign, makeOverworldDef(), 'sector-a');
      const summary = getCampaignOverworldSummary(campaign);
      expect(summary).not.toBeNull();
      expect(summary!.sectors).toHaveLength(3);
      expect(summary!.currentSectorId).toBe('sector-a');
    });

    it('returns null without overworld', () => {
      const campaign = makeCampaign();
      expect(getCampaignOverworldSummary(campaign)).toBeNull();
    });
  });
});

/**
 * Tests for the Sector Control System
 */
import { describe, it, expect } from 'vitest';
import {
  initializeOverworld,
  modifySectorControl,
  computePostMissionControlChanges,
  applyControlEscalation,
  addSectorMutation,
  getSectorMissionEffects,
  getSectorThreatBonus,
  getSectorShopMultiplier,
  getSectorSocialDifficultyMod,
  findSectorForMission,
  moveToSector,
  getOverworldSummary,
} from '../src/sector-control';
import type {
  CampaignOverworldDefinition,
  CampaignOverworldState,
  CampaignSector,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeOverworldDef(): CampaignOverworldDefinition {
  return {
    id: 'test-overworld',
    name: 'Test System',
    description: 'Test overworld',
    sectors: [
      {
        id: 'sector-a',
        name: 'Sector Alpha',
        description: 'Starting sector',
        controlLevel: 2,
        missionIds: ['m1', 'm2'],
        adjacentSectorIds: ['sector-b', 'sector-c'],
        visited: false,
        mutations: [],
      },
      {
        id: 'sector-b',
        name: 'Sector Beta',
        description: 'Adjacent sector',
        controlLevel: 1,
        missionIds: ['m3'],
        adjacentSectorIds: ['sector-a', 'sector-c'],
        visited: false,
        mutations: [],
      },
      {
        id: 'sector-c',
        name: 'Sector Gamma',
        description: 'High control sector',
        controlLevel: 4,
        missionIds: ['m4'],
        adjacentSectorIds: ['sector-a', 'sector-b'],
        visited: false,
        mutations: [],
      },
    ],
    sectorPositions: {
      'sector-a': { x: 0, y: 0 },
      'sector-b': { x: 100, y: 0 },
      'sector-c': { x: 50, y: 100 },
    },
    connections: [
      { from: 'sector-a', to: 'sector-b' },
      { from: 'sector-a', to: 'sector-c' },
      { from: 'sector-b', to: 'sector-c' },
    ],
  };
}

function makeOverworld(): CampaignOverworldState {
  return initializeOverworld(makeOverworldDef(), 'sector-a');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Sector Control System', () => {
  describe('initializeOverworld', () => {
    it('creates overworld state from definition', () => {
      const overworld = makeOverworld();
      expect(Object.keys(overworld.sectors)).toHaveLength(3);
      expect(overworld.currentSectorId).toBe('sector-a');
      expect(overworld.sectors['sector-a'].visited).toBe(true);
      expect(overworld.sectors['sector-b'].visited).toBe(false);
    });
  });

  describe('modifySectorControl', () => {
    it('increases control level', () => {
      const overworld = makeOverworld();
      const result = modifySectorControl(overworld, 'sector-a', 1, 'm1');
      expect(result.sectors['sector-a'].controlLevel).toBe(3);
    });

    it('decreases control level', () => {
      const overworld = makeOverworld();
      const result = modifySectorControl(overworld, 'sector-a', -1, 'm1');
      expect(result.sectors['sector-a'].controlLevel).toBe(1);
    });

    it('clamps to 0', () => {
      const overworld = makeOverworld();
      const result = modifySectorControl(overworld, 'sector-b', -5, 'm1');
      expect(result.sectors['sector-b'].controlLevel).toBe(0);
    });

    it('clamps to 5', () => {
      const overworld = makeOverworld();
      const result = modifySectorControl(overworld, 'sector-c', 5, 'm1');
      expect(result.sectors['sector-c'].controlLevel).toBe(5);
    });

    it('records control change in history', () => {
      const overworld = makeOverworld();
      const result = modifySectorControl(overworld, 'sector-a', 1, 'm1');
      expect(result.controlHistory).toHaveLength(1);
      expect(result.controlHistory[0].sectorId).toBe('sector-a');
      expect(result.controlHistory[0].previousLevel).toBe(2);
      expect(result.controlHistory[0].newLevel).toBe(3);
    });

    it('does nothing when delta results in same level', () => {
      const overworld = makeOverworld();
      const result = modifySectorControl(overworld, 'sector-b', 0, 'm1');
      expect(result).toBe(overworld); // No change, same reference
    });
  });

  describe('computePostMissionControlChanges', () => {
    it('decreases control on victory', () => {
      const overworld = makeOverworld();
      const changes = computePostMissionControlChanges(
        overworld, 'm1', 'victory', false, false, false,
      );
      expect(changes).toHaveLength(1);
      expect(changes[0].sectorId).toBe('sector-a');
      expect(changes[0].delta).toBe(-1);
    });

    it('decreases control by 2 on perfect victory', () => {
      const overworld = makeOverworld();
      const changes = computePostMissionControlChanges(
        overworld, 'm1', 'victory', true, true, false,
      );
      expect(changes[0].delta).toBe(-2);
    });

    it('increases control on defeat', () => {
      const overworld = makeOverworld();
      const changes = computePostMissionControlChanges(
        overworld, 'm1', 'defeat', false, false, false,
      );
      expect(changes[0].delta).toBe(1);
    });

    it('increases control by 2 on crushing defeat', () => {
      const overworld = makeOverworld();
      const changes = computePostMissionControlChanges(
        overworld, 'm1', 'defeat', false, false, true,
      );
      expect(changes[0].delta).toBe(2);
    });

    it('no change on draw', () => {
      const overworld = makeOverworld();
      const changes = computePostMissionControlChanges(
        overworld, 'm1', 'draw', false, false, false,
      );
      expect(changes).toHaveLength(0);
    });
  });

  describe('applyControlEscalation', () => {
    it('spreads control from level 4+ to low-control neighbors', () => {
      const overworld = makeOverworld();
      // sector-c is at level 4, adjacent to sector-a (2) and sector-b (1)
      const result = applyControlEscalation(overworld, 'm1');
      // sector-b is below 3, should get +1
      expect(result.sectors['sector-b'].controlLevel).toBe(2);
    });

    it('spreads to all neighbors at level 5', () => {
      let overworld = makeOverworld();
      overworld = modifySectorControl(overworld, 'sector-c', 1, 'm1'); // now 5
      const result = applyControlEscalation(overworld, 'm2');
      // sector-a (was 2) should get +1 from level 5 spread
      expect(result.sectors['sector-a'].controlLevel).toBe(3);
    });
  });

  describe('sector mutations', () => {
    it('adds a mutation to a sector', () => {
      const overworld = makeOverworld();
      const result = addSectorMutation(overworld, 'sector-a', {
        id: 'mut-1',
        type: 'fortified',
        description: 'Imperial fortification',
        causedByMission: 'm1',
        effect: {
          bonusEnemies: [{ npcProfileId: 'stormtrooper', count: 2, asMinGroup: true }],
        },
      });
      expect(result.sectors['sector-a'].mutations).toHaveLength(1);
    });

    it('returns mission effects from mutations', () => {
      let overworld = makeOverworld();
      overworld = addSectorMutation(overworld, 'sector-a', {
        id: 'mut-1',
        type: 'fortified',
        description: 'Fortified',
        causedByMission: 'm1',
        effect: {
          bonusEnemies: [{ npcProfileId: 'stormtrooper', count: 2, asMinGroup: true }],
        },
      });
      const effects = getSectorMissionEffects(overworld, 'sector-a');
      expect(effects.bonusEnemies).toHaveLength(1);
      expect(effects.bonusEnemies[0].count).toBe(2);
    });
  });

  describe('sector queries', () => {
    it('returns threat bonus for sector', () => {
      const overworld = makeOverworld();
      // sector-a is control level 2 -> threatBonus = 1
      expect(getSectorThreatBonus(overworld, 'sector-a')).toBe(1);
    });

    it('returns shop multiplier for sector', () => {
      const overworld = makeOverworld();
      // sector-c is control level 4 -> shopPriceMultiplier = 1.5
      expect(getSectorShopMultiplier(overworld, 'sector-c')).toBe(1.5);
    });

    it('returns social difficulty mod for sector', () => {
      const overworld = makeOverworld();
      // sector-c is control level 4 -> socialDifficultyMod = 1
      expect(getSectorSocialDifficultyMod(overworld, 'sector-c')).toBe(1);
    });

    it('finds sector for mission', () => {
      const overworld = makeOverworld();
      expect(findSectorForMission(overworld, 'm1')).toBe('sector-a');
      expect(findSectorForMission(overworld, 'm4')).toBe('sector-c');
      expect(findSectorForMission(overworld, 'nonexistent')).toBeNull();
    });
  });

  describe('movement', () => {
    it('moves party to a new sector', () => {
      const overworld = makeOverworld();
      const result = moveToSector(overworld, 'sector-b');
      expect(result.currentSectorId).toBe('sector-b');
      expect(result.sectors['sector-b'].visited).toBe(true);
    });
  });

  describe('getOverworldSummary', () => {
    it('returns summary for all sectors', () => {
      const overworld = makeOverworld();
      const summary = getOverworldSummary(overworld);
      expect(summary).toHaveLength(3);
      const alpha = summary.find(s => s.sectorId === 'sector-a');
      expect(alpha?.controlLabel).toBe('Occupied');
      expect(alpha?.visited).toBe(true);
    });
  });
});

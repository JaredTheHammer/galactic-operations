/**
 * Galactic Operations - Sector Control System
 * Pandemic Legacy-inspired escalating threat based on regional Imperial control.
 *
 * Each sector has a control level (0-5) that affects:
 * - Threat bonuses for missions in that sector
 * - Reinforcement waves
 * - Shop prices
 * - Social check difficulty
 *
 * Control levels change based on mission outcomes and legacy events.
 * High control can spread to adjacent sectors (escalation mechanic).
 */

import type {
  CampaignState,
  CampaignSector,
  CampaignOverworldState,
  CampaignOverworldDefinition,
  SectorControlLevel,
  SectorMutation,
  MissionDefinition,
  GridCoordinate,
  TerrainType,
  NPCSpawnGroup,
} from './types';
import { SECTOR_CONTROL_EFFECTS, SECTOR_CONTROL_LABELS } from './types';

// ============================================================================
// OVERWORLD INITIALIZATION
// ============================================================================

/**
 * Initialize a campaign overworld from a definition.
 */
export function initializeOverworld(
  definition: CampaignOverworldDefinition,
  startingSectorId: string,
): CampaignOverworldState {
  const sectors: Record<string, CampaignSector> = {};
  for (const sector of definition.sectors) {
    sectors[sector.id] = {
      ...sector,
      visited: sector.id === startingSectorId,
    };
  }

  return {
    sectors,
    currentSectorId: startingSectorId,
    controlHistory: [],
  };
}

// ============================================================================
// SECTOR CONTROL CHANGES
// ============================================================================

/**
 * Modify a sector's control level by a delta amount.
 * Clamps to valid range [0, 5].
 */
export function modifySectorControl(
  overworld: CampaignOverworldState,
  sectorId: string,
  delta: number,
  causedByMission: string,
): CampaignOverworldState {
  const sector = overworld.sectors[sectorId];
  if (!sector) return overworld;

  const previousLevel = sector.controlLevel;
  const newLevel = Math.max(0, Math.min(5, previousLevel + delta)) as SectorControlLevel;

  if (newLevel === previousLevel) return overworld;

  return {
    ...overworld,
    sectors: {
      ...overworld.sectors,
      [sectorId]: {
        ...sector,
        controlLevel: newLevel,
      },
    },
    controlHistory: [
      ...overworld.controlHistory,
      {
        sectorId,
        previousLevel,
        newLevel,
        causedByMission: causedByMission,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Determine control level changes after a mission completes.
 *
 * Rules:
 * - Victory in a sector: -1 control (rebels gain ground)
 * - Defeat in a sector: +1 control (Empire tightens grip)
 * - Perfect victory (all objectives, no heroes wounded): -2 control
 * - Crushing defeat (all heroes incapacitated): +2 control
 */
export function computePostMissionControlChanges(
  overworld: CampaignOverworldState,
  missionId: string,
  outcome: 'victory' | 'defeat' | 'draw',
  allObjectivesCompleted: boolean,
  noHeroesWounded: boolean,
  allHeroesIncapacitated: boolean,
): Array<{ sectorId: string; delta: number }> {
  const changes: Array<{ sectorId: string; delta: number }> = [];

  // Find which sector this mission belongs to
  const sectorId = findSectorForMission(overworld, missionId);
  if (!sectorId) return changes;

  let delta = 0;
  if (outcome === 'victory') {
    delta = -1;
    if (allObjectivesCompleted && noHeroesWounded) {
      delta = -2; // Perfect victory
    }
  } else if (outcome === 'defeat') {
    delta = 1;
    if (allHeroesIncapacitated) {
      delta = 2; // Crushing defeat
    }
  }
  // Draw = no change

  if (delta !== 0) {
    changes.push({ sectorId, delta });
  }

  return changes;
}

/**
 * Apply control escalation: sectors at high control can spread to neighbors.
 * Called at the end of each act or after N missions.
 *
 * Rules:
 * - Sectors at level 4+ spread +1 to adjacent sectors at level < 3
 * - Sectors at level 5 spread +1 to ALL adjacent sectors
 */
export function applyControlEscalation(
  overworld: CampaignOverworldState,
  causedByMission: string,
): CampaignOverworldState {
  const spreadChanges: Array<{ sectorId: string; delta: number }> = [];

  for (const sector of Object.values(overworld.sectors)) {
    if (sector.controlLevel >= 4) {
      for (const adjId of sector.adjacentSectorIds) {
        const adj = overworld.sectors[adjId];
        if (!adj) continue;

        if (sector.controlLevel >= 5) {
          // Level 5: spread to all adjacent
          spreadChanges.push({ sectorId: adjId, delta: 1 });
        } else if (adj.controlLevel < 3) {
          // Level 4: spread only to low-control sectors
          spreadChanges.push({ sectorId: adjId, delta: 1 });
        }
      }
    }
  }

  let result = overworld;
  for (const change of spreadChanges) {
    result = modifySectorControl(result, change.sectorId, change.delta, causedByMission);
  }
  return result;
}

// ============================================================================
// SECTOR MUTATIONS
// ============================================================================

/**
 * Add a persistent mutation to a sector.
 */
export function addSectorMutation(
  overworld: CampaignOverworldState,
  sectorId: string,
  mutation: SectorMutation,
): CampaignOverworldState {
  const sector = overworld.sectors[sectorId];
  if (!sector) return overworld;

  return {
    ...overworld,
    sectors: {
      ...overworld.sectors,
      [sectorId]: {
        ...sector,
        mutations: [...sector.mutations, mutation],
      },
    },
  };
}

/**
 * Get all active mutations for a sector that affect mission setup.
 */
export function getSectorMissionEffects(
  overworld: CampaignOverworldState,
  sectorId: string,
): {
  bonusEnemies: NPCSpawnGroup[];
  terrainOverrides: Array<{ position: GridCoordinate; terrain: TerrainType }>;
  deployZoneRestrictions: GridCoordinate[];
} {
  const sector = overworld.sectors[sectorId];
  const result = {
    bonusEnemies: [] as NPCSpawnGroup[],
    terrainOverrides: [] as Array<{ position: GridCoordinate; terrain: TerrainType }>,
    deployZoneRestrictions: [] as GridCoordinate[],
  };

  if (!sector) return result;

  for (const mutation of sector.mutations) {
    if (mutation.effect) {
      if (mutation.effect.bonusEnemies) {
        result.bonusEnemies.push(...mutation.effect.bonusEnemies);
      }
      if (mutation.effect.terrainOverrides) {
        result.terrainOverrides.push(...mutation.effect.terrainOverrides);
      }
      if (mutation.effect.deployZoneRestrictions) {
        result.deployZoneRestrictions.push(...mutation.effect.deployZoneRestrictions);
      }
    }
  }

  return result;
}

// ============================================================================
// SECTOR QUERIES
// ============================================================================

/**
 * Get the effective threat modifier for a sector based on its control level.
 */
export function getSectorThreatBonus(
  overworld: CampaignOverworldState,
  sectorId: string,
): number {
  const sector = overworld.sectors[sectorId];
  if (!sector) return 0;
  return SECTOR_CONTROL_EFFECTS[sector.controlLevel].threatBonus;
}

/**
 * Get the shop price multiplier for a sector.
 */
export function getSectorShopMultiplier(
  overworld: CampaignOverworldState,
  sectorId: string,
): number {
  const sector = overworld.sectors[sectorId];
  if (!sector) return 1.0;
  return SECTOR_CONTROL_EFFECTS[sector.controlLevel].shopPriceMultiplier;
}

/**
 * Get the social difficulty modifier for a sector.
 */
export function getSectorSocialDifficultyMod(
  overworld: CampaignOverworldState,
  sectorId: string,
): number {
  const sector = overworld.sectors[sectorId];
  if (!sector) return 0;
  return SECTOR_CONTROL_EFFECTS[sector.controlLevel].socialDifficultyMod;
}

/**
 * Find which sector contains a given mission ID.
 */
export function findSectorForMission(
  overworld: CampaignOverworldState,
  missionId: string,
): string | null {
  for (const sector of Object.values(overworld.sectors)) {
    if (sector.missionIds.includes(missionId)) {
      return sector.id;
    }
  }
  return null;
}

/**
 * Move the party to a new sector. Marks it as visited.
 */
export function moveToSector(
  overworld: CampaignOverworldState,
  sectorId: string,
): CampaignOverworldState {
  const sector = overworld.sectors[sectorId];
  if (!sector) return overworld;

  return {
    ...overworld,
    currentSectorId: sectorId,
    sectors: {
      ...overworld.sectors,
      [sectorId]: {
        ...sector,
        visited: true,
      },
    },
  };
}

/**
 * Get a summary of the overworld state for display.
 */
export function getOverworldSummary(
  overworld: CampaignOverworldState,
): Array<{
  sectorId: string;
  name: string;
  controlLevel: SectorControlLevel;
  controlLabel: string;
  visited: boolean;
  mutationCount: number;
}> {
  return Object.values(overworld.sectors).map(sector => ({
    sectorId: sector.id,
    name: sector.name,
    controlLevel: sector.controlLevel,
    controlLabel: SECTOR_CONTROL_LABELS[sector.controlLevel],
    visited: sector.visited,
    mutationCount: sector.mutations.length,
  }));
}

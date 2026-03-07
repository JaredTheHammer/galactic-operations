/**
 * Galactic Operations - Campaign Overworld System
 * Pandemic Legacy-inspired persistent world map with sectors that track
 * Imperial control, mutations from prior missions, and strategic movement.
 *
 * The campaign overworld provides a strategic layer above individual missions:
 * - Players choose which sector to operate in
 * - Sector control affects mission difficulty and social phase
 * - Mutations from mission outcomes persist on the overworld
 * - Control escalation creates pressure to address multiple fronts
 *
 * Skirmish/testing modes continue to use procedural maps.
 * Campaign mode uses the overworld for sector selection, then generates
 * tactical maps for each mission within the selected sector.
 */

import type {
  CampaignState,
  CampaignOverworldState,
  CampaignOverworldDefinition,
  CampaignSector,
  SectorControlLevel,
  SectorMutation,
  MissionDefinition,
} from './types';
import { SECTOR_CONTROL_EFFECTS } from './types';
import {
  initializeOverworld,
  modifySectorControl,
  computePostMissionControlChanges,
  applyControlEscalation,
  addSectorMutation,
  getSectorThreatBonus,
  findSectorForMission,
  moveToSector,
  getOverworldSummary,
} from './sector-control';

// ============================================================================
// CAMPAIGN OVERWORLD INTEGRATION
// ============================================================================

/**
 * Initialize overworld state on a campaign.
 */
export function initializeCampaignOverworld(
  campaign: CampaignState,
  definition: CampaignOverworldDefinition,
  startingSectorId: string,
): CampaignState {
  return {
    ...campaign,
    overworld: initializeOverworld(definition, startingSectorId),
  };
}

/**
 * Process overworld state after a mission completes.
 * Updates sector control, applies escalation if needed, generates mutations.
 */
export function processOverworldPostMission(
  campaign: CampaignState,
  missionId: string,
  outcome: 'victory' | 'defeat' | 'draw',
  allObjectivesCompleted: boolean,
  noHeroesWounded: boolean,
  allHeroesIncapacitated: boolean,
  actJustEnded: boolean,
): CampaignState {
  if (!campaign.overworld) return campaign;

  let overworld = campaign.overworld;

  // 1. Compute control changes from mission outcome
  const changes = computePostMissionControlChanges(
    overworld, missionId, outcome,
    allObjectivesCompleted, noHeroesWounded, allHeroesIncapacitated,
  );

  // 2. Apply control changes
  for (const change of changes) {
    overworld = modifySectorControl(overworld, change.sectorId, change.delta, missionId);
  }

  // 3. Generate mutations based on outcome
  const sectorId = findSectorForMission(overworld, missionId);
  if (sectorId) {
    if (outcome === 'victory') {
      overworld = addSectorMutation(overworld, sectorId, {
        id: `mutation-${missionId}-secured`,
        type: 'secured',
        description: `Area secured after successful operation in mission ${missionId}.`,
        causedByMission: missionId,
      });
    } else if (outcome === 'defeat') {
      overworld = addSectorMutation(overworld, sectorId, {
        id: `mutation-${missionId}-fortified`,
        type: 'fortified',
        description: `Imperial forces fortified position after failed rebel operation.`,
        causedByMission: missionId,
        effect: {
          bonusEnemies: [{
            npcProfileId: 'stormtrooper',
            count: 2,
            asMinGroup: true,
          }],
        },
      });
    }
  }

  // 4. Apply escalation at act boundaries
  if (actJustEnded) {
    overworld = applyControlEscalation(overworld, missionId);
  }

  return { ...campaign, overworld };
}

/**
 * Get available missions filtered by the current sector.
 * In campaign overworld mode, only missions in the current sector are available.
 */
export function getAvailableMissionsInSector(
  campaign: CampaignState,
): string[] {
  if (!campaign.overworld) return campaign.availableMissionIds;

  const currentSector = campaign.overworld.sectors[campaign.overworld.currentSectorId];
  if (!currentSector) return campaign.availableMissionIds;

  const sectorMissions = new Set(currentSector.missionIds);
  return campaign.availableMissionIds.filter(id => sectorMissions.has(id));
}

/**
 * Get the effective threat for a mission accounting for sector control.
 */
export function computeEffectiveThreatWithSector(
  mission: MissionDefinition,
  campaign: CampaignState,
): { baseThreat: number; sectorBonus: number; momentumAdjustment: number; total: number } {
  const baseThreat = mission.imperialThreat;
  let sectorBonus = 0;

  if (campaign.overworld) {
    const sectorId = findSectorForMission(campaign.overworld, mission.id);
    if (sectorId) {
      sectorBonus = getSectorThreatBonus(campaign.overworld, sectorId);
    }
  }

  // Import momentum adjustment
  let momentumAdjustment = 0;
  const momentum = campaign.momentum ?? 0;
  if (momentum !== 0) {
    // Negative momentum = threat reduction (help player), positive = increase
    momentumAdjustment = -momentum; // reversed: losing streak reduces threat
  }

  const total = Math.max(0, Math.round(
    (baseThreat + sectorBonus + momentumAdjustment) * campaign.threatMultiplier
  ));

  return { baseThreat, sectorBonus, momentumAdjustment, total };
}

/**
 * Get sectors the player can travel to from their current position.
 */
export function getAccessibleSectors(
  campaign: CampaignState,
): CampaignSector[] {
  if (!campaign.overworld) return [];

  const current = campaign.overworld.sectors[campaign.overworld.currentSectorId];
  if (!current) return [];

  return current.adjacentSectorIds
    .map(id => campaign.overworld!.sectors[id])
    .filter((s): s is CampaignSector => s !== undefined);
}

/**
 * Travel to a new sector. Validates adjacency.
 */
export function travelToSector(
  campaign: CampaignState,
  targetSectorId: string,
): CampaignState {
  if (!campaign.overworld) {
    throw new Error('Campaign has no overworld');
  }

  const current = campaign.overworld.sectors[campaign.overworld.currentSectorId];
  if (!current) {
    throw new Error(`Current sector ${campaign.overworld.currentSectorId} not found`);
  }

  if (!current.adjacentSectorIds.includes(targetSectorId)) {
    throw new Error(`Sector ${targetSectorId} is not adjacent to ${current.id}`);
  }

  return {
    ...campaign,
    overworld: moveToSector(campaign.overworld, targetSectorId),
  };
}

/**
 * Get a display-ready summary of the campaign overworld.
 */
export function getCampaignOverworldSummary(campaign: CampaignState) {
  if (!campaign.overworld) return null;

  return {
    currentSectorId: campaign.overworld.currentSectorId,
    sectors: getOverworldSummary(campaign.overworld),
    controlHistory: campaign.overworld.controlHistory.slice(-10), // last 10 changes
  };
}

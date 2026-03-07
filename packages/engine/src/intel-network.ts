/**
 * Intelligence/Spy Network System (Dune: Imperium - Uprising Spies)
 *
 * Deploy intelligence assets to scout upcoming missions, reveal enemy
 * positions, gain tactic cards, or sabotage imperial preparations.
 */

import type {
  IntelAsset,
  IntelAssetType,
  MissionIntel,
  IntelRecallResult,
  SpyNetworkState,
  CampaignState,
  MissionDefinition,
  DuneMechanicsState,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Credits earned per turn deployed when recalling an asset */
export const RECALL_CREDITS_PER_TURN = 10;
/** Tactic cards drawn when recalling a deployed asset */
export const RECALL_TACTIC_CARDS = 1;
/** Base cost to recruit a new intel asset */
export const RECRUIT_ASSET_COST = 30;
/** Cost increase per existing asset */
export const RECRUIT_COST_SCALING = 15;

/** How many turns deployed before each asset type produces intel */
const INTEL_GENERATION_TURNS: Record<IntelAssetType, number> = {
  informant: 1,  // Fast but shallow intel
  scout: 1,      // Reveals map/positions quickly
  slicer: 2,     // Takes time but reveals more
  saboteur: 2,   // Takes time but actively disrupts
};

// ============================================================================
// Asset Management
// ============================================================================

/** Recruit a new intel asset (costs credits) */
export function recruitAsset(
  campaign: CampaignState,
  assetType: IntelAssetType,
): CampaignState | null {
  const dm = ensureDuneMechanics(campaign);
  const network = dm.spyNetwork;

  if (network.assets.length >= network.maxAssets) return null;

  const cost = getRecruitCost(network);
  if (campaign.credits < cost) return null;

  const newAsset: IntelAsset = {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: assetType,
    deployedTo: 'reserve',
    turnsDeployed: 0,
  };

  return {
    ...campaign,
    credits: campaign.credits - cost,
    duneMechanics: {
      ...dm,
      spyNetwork: {
        ...network,
        assets: [...network.assets, newAsset],
      },
    },
  };
}

/** Get the cost to recruit another asset */
export function getRecruitCost(network: SpyNetworkState): number {
  return RECRUIT_ASSET_COST + network.assets.length * RECRUIT_COST_SCALING;
}

/** Deploy an asset to scout a specific mission */
export function deployAsset(
  campaign: CampaignState,
  assetId: string,
  missionId: string,
): CampaignState | null {
  const dm = ensureDuneMechanics(campaign);
  const network = dm.spyNetwork;
  const assetIndex = network.assets.findIndex((a) => a.id === assetId);
  if (assetIndex === -1) return null;

  const asset = network.assets[assetIndex];
  if (asset.deployedTo !== 'reserve') return null;

  const updatedAssets = [...network.assets];
  updatedAssets[assetIndex] = { ...asset, deployedTo: missionId, turnsDeployed: 0 };

  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      spyNetwork: { ...network, assets: updatedAssets },
    },
  };
}

/** Recall an asset to reserve, gaining tactic cards and credits */
export function recallAsset(
  campaign: CampaignState,
  assetId: string,
): { campaign: CampaignState; result: IntelRecallResult } | null {
  const dm = ensureDuneMechanics(campaign);
  const network = dm.spyNetwork;
  const assetIndex = network.assets.findIndex((a) => a.id === assetId);
  if (assetIndex === -1) return null;

  const asset = network.assets[assetIndex];
  if (asset.deployedTo === 'reserve') return null;

  const creditsGained = asset.turnsDeployed * RECALL_CREDITS_PER_TURN;
  const tacticCardsDrawn = RECALL_TACTIC_CARDS;

  const updatedAssets = [...network.assets];
  updatedAssets[assetIndex] = { ...asset, deployedTo: 'reserve', turnsDeployed: 0 };

  const result: IntelRecallResult = {
    assetId,
    tacticCardsDrawn,
    creditsGained,
  };

  return {
    campaign: {
      ...campaign,
      credits: campaign.credits + creditsGained,
      duneMechanics: {
        ...dm,
        spyNetwork: { ...network, assets: updatedAssets },
      },
    },
    result,
  };
}

/** Dismiss (permanently remove) an intel asset */
export function dismissAsset(
  campaign: CampaignState,
  assetId: string,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      spyNetwork: {
        ...dm.spyNetwork,
        assets: dm.spyNetwork.assets.filter((a) => a.id !== assetId),
      },
    },
  };
}

// ============================================================================
// Intel Generation
// ============================================================================

/** Advance all deployed assets by one mission cycle and generate intel */
export function advanceIntelNetwork(
  campaign: CampaignState,
  availableMissions: Record<string, MissionDefinition>,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  const network = dm.spyNetwork;

  const updatedAssets: IntelAsset[] = [];
  const updatedIntel = { ...network.intelGathered };

  for (const asset of network.assets) {
    if (asset.deployedTo === 'reserve') {
      updatedAssets.push(asset);
      continue;
    }

    const advanced = { ...asset, turnsDeployed: asset.turnsDeployed + 1 };
    updatedAssets.push(advanced);

    const mission = availableMissions[asset.deployedTo];
    if (!mission) continue;

    const requiredTurns = INTEL_GENERATION_TURNS[asset.type];
    if (advanced.turnsDeployed >= requiredTurns) {
      const existing = updatedIntel[asset.deployedTo] ?? createEmptyIntel(asset.deployedTo);
      updatedIntel[asset.deployedTo] = applyAssetIntel(existing, asset, mission);
    }
  }

  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      spyNetwork: {
        ...network,
        assets: updatedAssets,
        intelGathered: updatedIntel,
      },
    },
  };
}

/** Get intel for a specific mission */
export function getMissionIntel(
  campaign: CampaignState,
  missionId: string,
): MissionIntel | null {
  return campaign.duneMechanics?.spyNetwork.intelGathered[missionId] ?? null;
}

/** Get all assets currently in reserve */
export function getReserveAssets(campaign: CampaignState): IntelAsset[] {
  const assets = campaign.duneMechanics?.spyNetwork.assets ?? [];
  return assets.filter((a) => a.deployedTo === 'reserve');
}

/** Get all assets currently deployed */
export function getDeployedAssets(campaign: CampaignState): IntelAsset[] {
  const assets = campaign.duneMechanics?.spyNetwork.assets ?? [];
  return assets.filter((a) => a.deployedTo !== 'reserve');
}

// ============================================================================
// Helpers
// ============================================================================

function createEmptyIntel(missionId: string): MissionIntel {
  return {
    missionId,
    enemyCountRevealed: false,
    revealedEnemyIds: [],
    reinforcementTimingRevealed: false,
    lootPositionsRevealed: false,
    bonusTacticCards: 0,
    threatReduction: 0,
  };
}

function applyAssetIntel(
  existing: MissionIntel,
  asset: IntelAsset,
  mission: MissionDefinition,
): MissionIntel {
  const updated = { ...existing };

  switch (asset.type) {
    case 'informant':
      // Reveals enemy count and one random enemy type
      updated.enemyCountRevealed = true;
      if (mission.initialEnemies.length > 0) {
        const firstEnemy = mission.initialEnemies[0];
        if (!updated.revealedEnemyIds.includes(firstEnemy.npcProfileId)) {
          updated.revealedEnemyIds = [...updated.revealedEnemyIds, firstEnemy.npcProfileId];
        }
      }
      break;

    case 'scout':
      // Reveals loot positions and reinforcement timing
      updated.lootPositionsRevealed = true;
      updated.reinforcementTimingRevealed = true;
      break;

    case 'slicer':
      // Grants bonus tactic cards at mission start
      updated.bonusTacticCards += 1;
      // Reveals all enemy profiles
      updated.enemyCountRevealed = true;
      for (const enemy of mission.initialEnemies) {
        if (!updated.revealedEnemyIds.includes(enemy.npcProfileId)) {
          updated.revealedEnemyIds = [...updated.revealedEnemyIds, enemy.npcProfileId];
        }
      }
      break;

    case 'saboteur':
      // Reduces initial imperial threat
      updated.threatReduction += Math.floor(mission.imperialThreat * 0.15);
      updated.reinforcementTimingRevealed = true;
      break;
  }

  return updated;
}

function ensureDuneMechanics(campaign: CampaignState): DuneMechanicsState {
  if (campaign.duneMechanics) return campaign.duneMechanics;
  // Lazy import to avoid circular dependency
  return {
    activeContracts: [],
    completedContractIds: [],
    spyNetwork: {
      assets: [],
      maxAssets: 2,
      intelGathered: {},
      networkLevel: 1,
    },
    deckBuilding: {
      enabled: false,
      operativeDeck: { cardIds: [], removedCardIds: [] },
      imperialDeck: { cardIds: [], removedCardIds: [] },
      marketPool: [],
      trashedCardIds: [],
    },
    researchTrack: {
      unlockedNodes: [],
      totalAPSpent: 0,
    },
    mercenaryRoster: {
      hired: [],
      maxActive: 2,
      killedInAction: [],
    },
  };
}

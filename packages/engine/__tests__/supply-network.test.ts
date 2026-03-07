/**
 * Tests for the Supply Network system (Brass: Birmingham-inspired)
 *
 * Covers network initialization, node building, route management,
 * mission gating, upkeep, severing, and repair.
 */

import { describe, it, expect } from 'vitest';
import {
  createSupplyNetwork,
  initializeNetwork,
  canBuildNode,
  buildNode,
  getActiveNodes,
  getConnectedLocations,
  getNetworkUnlockedMissions,
  getNetworkAvailableGear,
  getNetworkThreatReduction,
  getNetworkReinforcementBonus,
  applyNetworkUpkeep,
  severNodesAtLocation,
  repairNode,
  getNetworkFilteredMissions,
  getNetworkSummary,
  NODE_BUILD_COSTS,
  NODE_UPKEEP_COSTS,
  NODE_INCOME,
} from '../src/supply-network.js';
import type {
  CampaignState,
  SectorMapDefinition,
  SupplyNetwork,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeSectorMap(): SectorMapDefinition {
  return {
    id: 'test-sector',
    name: 'Test Sector',
    locations: [
      {
        id: 'loc-a',
        name: 'Location A',
        description: 'Starting location',
        availableInAct: 1,
        connectedLocations: ['loc-b', 'loc-c'],
        bonuses: [{ type: 'credit_income', value: 10, description: 'Income' }],
        unlocksMissions: [],
        unlocksGear: ['blaster-a'],
      },
      {
        id: 'loc-b',
        name: 'Location B',
        description: 'Adjacent to A',
        availableInAct: 1,
        connectedLocations: ['loc-a', 'loc-d'],
        bonuses: [{ type: 'threat_reduction', value: 1, description: 'Reduce threat' }],
        unlocksMissions: ['mission-secret'],
        unlocksGear: ['blaster-b'],
      },
      {
        id: 'loc-c',
        name: 'Location C',
        description: 'Adjacent to A',
        availableInAct: 1,
        connectedLocations: ['loc-a'],
        bonuses: [],
        unlocksMissions: [],
        unlocksGear: [],
      },
      {
        id: 'loc-d',
        name: 'Location D',
        description: 'Only adjacent to B',
        availableInAct: 2,
        connectedLocations: ['loc-b'],
        bonuses: [{ type: 'reinforcement', value: 1, description: 'Reinforcement bonus' }],
        unlocksMissions: ['mission-act2-gate'],
        unlocksGear: [],
      },
    ],
    startingLocationId: 'loc-a',
  };
}

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'test-campaign',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01',
    lastPlayedAt: '2026-01-01',
    heroes: {},
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['mission-1'],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    ...overrides,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

describe('Supply Network - Initialization', () => {
  it('creates an empty supply network', () => {
    const network = createSupplyNetwork();
    expect(network.nodes).toHaveLength(0);
    expect(network.routes).toHaveLength(0);
    expect(network.networkIncome).toBe(0);
  });

  it('initializes network with starting location contact (free)', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);

    expect(network.nodes).toHaveLength(1);
    expect(network.nodes[0].locationId).toBe('loc-a');
    expect(network.nodes[0].type).toBe('contact');
    expect(network.nodes[0].buildCost).toBe(0);
    expect(network.nodes[0].upkeepCost).toBe(0);
    expect(network.nodes[0].severed).toBe(false);
    expect(network.networkIncome).toBe(NODE_INCOME.contact);
  });

  it('handles missing starting location gracefully', () => {
    const sectorMap = { ...makeSectorMap(), startingLocationId: 'nonexistent' };
    const network = initializeNetwork(sectorMap);
    expect(network.nodes).toHaveLength(0);
  });
});

// ============================================================================
// NODE BUILDING
// ============================================================================

describe('Supply Network - Building Nodes', () => {
  it('can build a node at an adjacent location', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network });

    const check = canBuildNode(network, sectorMap, 'loc-b', 'contact', campaign);
    expect(check.allowed).toBe(true);
  });

  it('rejects building at a non-adjacent location', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    // Build at loc-c (adjacent to loc-a), then try loc-d which is only adjacent to loc-b
    let campaign = makeCampaign({ supplyNetwork: network, credits: 500, currentAct: 2 });
    campaign = buildNode(campaign, sectorMap, 'loc-c', 'contact');

    // loc-d is only adjacent to loc-b. We have nodes at loc-a and loc-c, not loc-b.
    const check = canBuildNode(campaign.supplyNetwork!, sectorMap, 'loc-d', 'contact', campaign);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('adjacent');
  });

  it('rejects duplicate node type at same location', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network });

    // Already have a contact at loc-a from init
    const check = canBuildNode(network, sectorMap, 'loc-a', 'contact', campaign);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Already have');
  });

  it('allows different node types at same location', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network });

    const check = canBuildNode(network, sectorMap, 'loc-a', 'safehouse', campaign);
    expect(check.allowed).toBe(true);
  });

  it('rejects building at location not yet available in current act', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    // loc-d requires act 2, we're in act 1
    // But first we need a node at loc-b to be adjacent
    let campaign = makeCampaign({ supplyNetwork: network });
    campaign = buildNode(campaign, sectorMap, 'loc-b', 'contact');

    const check = canBuildNode(campaign.supplyNetwork!, sectorMap, 'loc-d', 'contact', campaign);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Act 2');
  });

  it('rejects building with insufficient credits', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network, credits: 5 });

    const check = canBuildNode(network, sectorMap, 'loc-b', 'safehouse', campaign);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Insufficient credits');
  });

  it('buildNode deducts credits and creates node', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network, credits: 200 });

    const updated = buildNode(campaign, sectorMap, 'loc-b', 'contact');

    expect(updated.credits).toBe(200 - NODE_BUILD_COSTS.contact);
    expect(updated.supplyNetwork!.nodes).toHaveLength(2);
    expect(updated.supplyNetwork!.nodes[1].locationId).toBe('loc-b');
    expect(updated.supplyNetwork!.nodes[1].type).toBe('contact');
  });

  it('buildNode creates routes to adjacent nodes', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network, credits: 200 });

    const updated = buildNode(campaign, sectorMap, 'loc-b', 'contact');

    // Route from loc-b node to loc-a node
    expect(updated.supplyNetwork!.routes).toHaveLength(1);
    const route = updated.supplyNetwork!.routes[0];
    expect(route.fromNodeId).toContain('loc-b');
    expect(route.toNodeId).toContain('loc-a');
  });

  it('buildNode creates routes to nodes at the same location', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network, credits: 200 });

    // Build a safehouse at loc-a (already has a contact)
    const updated = buildNode(campaign, sectorMap, 'loc-a', 'safehouse');

    // Should have an intra-location route
    const localRoutes = updated.supplyNetwork!.routes.filter(
      r => r.fromNodeId.includes('loc-a') && r.toNodeId.includes('loc-a'),
    );
    expect(localRoutes.length).toBeGreaterThan(0);
  });

  it('updates network income after building', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network, credits: 200 });

    const updated = buildNode(campaign, sectorMap, 'loc-b', 'supply_route');
    expect(updated.supplyNetwork!.networkIncome).toBe(
      NODE_INCOME.contact + NODE_INCOME.supply_route,
    );
  });
});

// ============================================================================
// NETWORK QUERIES
// ============================================================================

describe('Supply Network - Queries', () => {
  it('getActiveNodes excludes severed nodes', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'contact', name: 'N1', description: '', locationId: 'a', buildCost: 25, upkeepCost: 5, severed: false, builtInAct: 1 },
        { id: 'n2', type: 'safehouse', name: 'N2', description: '', locationId: 'b', buildCost: 75, upkeepCost: 15, severed: true, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 10,
    };

    expect(getActiveNodes(network)).toHaveLength(1);
    expect(getActiveNodes(network)[0].id).toBe('n1');
  });

  it('getConnectedLocations returns unique location IDs', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'contact', name: '', description: '', locationId: 'a', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
        { id: 'n2', type: 'safehouse', name: '', description: '', locationId: 'a', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
        { id: 'n3', type: 'contact', name: '', description: '', locationId: 'b', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 0,
    };

    const locs = getConnectedLocations(network);
    expect(locs).toHaveLength(2);
    expect(locs).toContain('a');
    expect(locs).toContain('b');
  });

  it('getNetworkUnlockedMissions returns gated missions', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);

    // Only loc-a is connected, which has no gated missions
    expect(getNetworkUnlockedMissions(network, sectorMap)).toHaveLength(0);

    // Build at loc-b which gates 'mission-secret'
    const campaign = makeCampaign({ supplyNetwork: network, credits: 200 });
    const updated = buildNode(campaign, sectorMap, 'loc-b', 'contact');
    const unlocked = getNetworkUnlockedMissions(updated.supplyNetwork!, sectorMap);
    expect(unlocked).toContain('mission-secret');
  });

  it('getNetworkAvailableGear returns gear from connected locations', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);

    const gear = getNetworkAvailableGear(network, sectorMap);
    expect(gear).toContain('blaster-a');
    expect(gear).not.toContain('blaster-b');
  });

  it('getNetworkThreatReduction counts safehouses', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'safehouse', name: '', description: '', locationId: 'a', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
        { id: 'n2', type: 'safehouse', name: '', description: '', locationId: 'b', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
        { id: 'n3', type: 'contact', name: '', description: '', locationId: 'c', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 0,
    };

    expect(getNetworkThreatReduction(network)).toBe(2);
  });

  it('getNetworkReinforcementBonus counts supply routes with cap', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'supply_route', name: '', description: '', locationId: 'a', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
        { id: 'n2', type: 'supply_route', name: '', description: '', locationId: 'b', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
        { id: 'n3', type: 'supply_route', name: '', description: '', locationId: 'c', buildCost: 0, upkeepCost: 0, severed: false, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 0,
    };

    // Capped at MAX_REINFORCEMENT_BONUS (2)
    expect(getNetworkReinforcementBonus(network)).toBe(2);
  });
});

// ============================================================================
// UPKEEP AND MAINTENANCE
// ============================================================================

describe('Supply Network - Upkeep', () => {
  it('collects income and deducts upkeep', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    const campaign = makeCampaign({ supplyNetwork: network, credits: 100 });

    // Build a safehouse (costs upkeep 15)
    let updated = buildNode(campaign, sectorMap, 'loc-a', 'safehouse');
    const creditsAfterBuild = updated.credits;

    updated = applyNetworkUpkeep(updated);

    // Should gain networkIncome, lose upkeep
    const income = updated.supplyNetwork!.networkIncome;
    const totalUpkeep = updated.supplyNetwork!.nodes
      .filter(n => !n.severed)
      .reduce((sum, n) => sum + n.upkeepCost, 0);

    // Starting node has 0 upkeep, safehouse has 15
    // Income: contact(10) + safehouse(5) = 15
    // Upkeep: 0 (starting free) + 15 = 15
    expect(updated.credits).toBe(creditsAfterBuild + income - totalUpkeep);
  });

  it('severs nodes when upkeep cannot be paid', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'safehouse', name: '', description: '', locationId: 'a', buildCost: 75, upkeepCost: 15, severed: false, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 5,
    };
    const campaign = makeCampaign({ supplyNetwork: network, credits: 0 });

    const updated = applyNetworkUpkeep(campaign);

    // Income of 5 not enough for upkeep of 15
    expect(updated.supplyNetwork!.nodes[0].severed).toBe(true);
  });
});

// ============================================================================
// SEVERING AND REPAIR
// ============================================================================

describe('Supply Network - Severing and Repair', () => {
  it('severNodesAtLocation marks nodes as severed', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    let campaign = makeCampaign({ supplyNetwork: network, credits: 200 });
    campaign = buildNode(campaign, sectorMap, 'loc-b', 'contact');

    const severed = severNodesAtLocation(campaign, 'loc-b');
    const locBNodes = severed.supplyNetwork!.nodes.filter(n => n.locationId === 'loc-b');
    expect(locBNodes.every(n => n.severed)).toBe(true);

    // loc-a nodes should be unaffected
    const locANodes = severed.supplyNetwork!.nodes.filter(n => n.locationId === 'loc-a');
    expect(locANodes.every(n => !n.severed)).toBe(true);
  });

  it('severNodesAtLocation removes connected routes', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    let campaign = makeCampaign({ supplyNetwork: network, credits: 200 });
    campaign = buildNode(campaign, sectorMap, 'loc-b', 'contact');
    expect(campaign.supplyNetwork!.routes.length).toBeGreaterThan(0);

    const severed = severNodesAtLocation(campaign, 'loc-b');
    expect(severed.supplyNetwork!.routes).toHaveLength(0);
  });

  it('repairNode restores a severed node', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'contact', name: '', description: '', locationId: 'a', buildCost: 25, upkeepCost: 5, severed: true, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 0,
    };
    const campaign = makeCampaign({ supplyNetwork: network, credits: 100 });

    const repaired = repairNode(campaign, 'n1');
    expect(repaired.supplyNetwork!.nodes[0].severed).toBe(false);
    expect(repaired.credits).toBe(100 - NODE_BUILD_COSTS.contact);
  });

  it('repairNode fails with insufficient credits', () => {
    const network: SupplyNetwork = {
      nodes: [
        { id: 'n1', type: 'safehouse', name: '', description: '', locationId: 'a', buildCost: 75, upkeepCost: 15, severed: true, builtInAct: 1 },
      ],
      routes: [],
      networkIncome: 0,
    };
    const campaign = makeCampaign({ supplyNetwork: network, credits: 10 });

    const result = repairNode(campaign, 'n1');
    expect(result.supplyNetwork!.nodes[0].severed).toBe(true); // Unchanged
    expect(result.credits).toBe(10); // No deduction
  });
});

// ============================================================================
// MISSION FILTERING
// ============================================================================

describe('Supply Network - Mission Filtering', () => {
  it('allows non-gated missions through', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);

    const filtered = getNetworkFilteredMissions(
      ['mission-1', 'mission-2'],
      network,
      sectorMap,
    );
    expect(filtered).toContain('mission-1');
    expect(filtered).toContain('mission-2');
  });

  it('blocks gated missions without network access', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);

    // 'mission-secret' is gated behind loc-b
    const filtered = getNetworkFilteredMissions(
      ['mission-1', 'mission-secret'],
      network,
      sectorMap,
    );
    expect(filtered).toContain('mission-1');
    expect(filtered).not.toContain('mission-secret');
  });

  it('allows gated missions with network access', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);
    let campaign = makeCampaign({ supplyNetwork: network, credits: 200 });
    campaign = buildNode(campaign, sectorMap, 'loc-b', 'contact');

    const filtered = getNetworkFilteredMissions(
      ['mission-1', 'mission-secret'],
      campaign.supplyNetwork!,
      sectorMap,
    );
    expect(filtered).toContain('mission-1');
    expect(filtered).toContain('mission-secret');
  });

  it('handles undefined network gracefully', () => {
    const filtered = getNetworkFilteredMissions(
      ['mission-1', 'mission-2'],
      undefined,
      undefined,
    );
    expect(filtered).toEqual(['mission-1', 'mission-2']);
  });
});

// ============================================================================
// SUMMARY
// ============================================================================

describe('Supply Network - Summary', () => {
  it('returns correct summary for initialized network', () => {
    const sectorMap = makeSectorMap();
    const network = initializeNetwork(sectorMap);

    const summary = getNetworkSummary(network, sectorMap);
    expect(summary.totalNodes).toBe(1);
    expect(summary.activeNodes).toBe(1);
    expect(summary.severedNodes).toBe(0);
    expect(summary.connectedLocations).toContain('loc-a');
    expect(summary.networkIncome).toBe(NODE_INCOME.contact);
  });

  it('returns zeroes for undefined network', () => {
    const summary = getNetworkSummary(undefined, undefined);
    expect(summary.totalNodes).toBe(0);
    expect(summary.activeNodes).toBe(0);
    expect(summary.networkIncome).toBe(0);
  });
});

/**
 * Supply Network Engine (Brass: Birmingham-inspired)
 *
 * Players build a network of contacts, safe houses, and supply routes across
 * a sector map between missions. The network determines:
 * - Which missions are available (nodes unlock gated missions)
 * - What gear can be purchased (connected locations grant shop access)
 * - Whether reinforcements arrive during combat (safehouse proximity)
 * - Passive credit income per mission
 *
 * Losing a mission can sever supply lines, cutting off connected nodes
 * until the route is rebuilt.
 */

import type {
  CampaignState,
  SupplyNetwork,
  SupplyNode,
  SupplyNodeType,
  SupplyRoute,
  SectorLocation,
  SectorMapDefinition,
  SupplyNodeBonus,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cost multipliers by node type */
export const NODE_BUILD_COSTS: Record<SupplyNodeType, number> = {
  contact: 25,
  safehouse: 75,
  supply_route: 50,
};

/** Upkeep costs per mission by node type */
export const NODE_UPKEEP_COSTS: Record<SupplyNodeType, number> = {
  contact: 5,
  safehouse: 15,
  supply_route: 10,
};

/** Credit income per mission by node type */
export const NODE_INCOME: Record<SupplyNodeType, number> = {
  contact: 10,
  safehouse: 5,
  supply_route: 15,
};

/** Threat reduction per connected safehouse */
export const SAFEHOUSE_THREAT_REDUCTION = 1;

/** Max reinforcement bonus from supply routes */
export const MAX_REINFORCEMENT_BONUS = 2;

// ============================================================================
// NETWORK INITIALIZATION
// ============================================================================

/**
 * Create an empty supply network for a new campaign.
 */
export function createSupplyNetwork(): SupplyNetwork {
  return {
    nodes: [],
    routes: [],
    networkIncome: 0,
  };
}

/**
 * Initialize a supply network with the starting location node (free).
 */
export function initializeNetwork(
  sectorMap: SectorMapDefinition,
): SupplyNetwork {
  const startLoc = sectorMap.locations.find(
    l => l.id === sectorMap.startingLocationId,
  );
  if (!startLoc) return createSupplyNetwork();

  const startNode: SupplyNode = {
    id: `node-${startLoc.id}-contact`,
    type: 'contact',
    name: `${startLoc.name} Contact`,
    description: `Initial contact at ${startLoc.name}`,
    locationId: startLoc.id,
    buildCost: 0,
    upkeepCost: 0,
    severed: false,
    builtInAct: 1,
  };

  return {
    nodes: [startNode],
    routes: [],
    networkIncome: NODE_INCOME.contact,
  };
}

// ============================================================================
// NODE BUILDING
// ============================================================================

/**
 * Check if a node can be built at a location.
 * Requires: location available in current act, adjacent to existing node,
 * no duplicate node type at same location, sufficient credits.
 */
export function canBuildNode(
  network: SupplyNetwork,
  sectorMap: SectorMapDefinition,
  locationId: string,
  nodeType: SupplyNodeType,
  campaign: CampaignState,
): { allowed: boolean; reason?: string } {
  const location = sectorMap.locations.find(l => l.id === locationId);
  if (!location) {
    return { allowed: false, reason: 'Location not found' };
  }

  if (location.availableInAct > campaign.currentAct) {
    return { allowed: false, reason: `Location not available until Act ${location.availableInAct}` };
  }

  // Check for duplicate node type at same location
  const existingAtLocation = network.nodes.filter(
    n => n.locationId === locationId && !n.severed,
  );
  if (existingAtLocation.some(n => n.type === nodeType)) {
    return { allowed: false, reason: `Already have a ${nodeType} at ${location.name}` };
  }

  // Must be adjacent to an existing active node (or at a location with one)
  const activeNodeLocations = new Set(
    network.nodes.filter(n => !n.severed).map(n => n.locationId),
  );

  const isConnected =
    activeNodeLocations.has(locationId) ||
    location.connectedLocations.some(adj => activeNodeLocations.has(adj));

  if (!isConnected) {
    return { allowed: false, reason: 'Location must be adjacent to an existing network node' };
  }

  const cost = NODE_BUILD_COSTS[nodeType];
  if (campaign.credits < cost) {
    return { allowed: false, reason: `Insufficient credits (need ${cost}, have ${campaign.credits})` };
  }

  return { allowed: true };
}

/**
 * Build a new node at a location. Returns updated campaign state.
 * Automatically creates routes to adjacent nodes.
 */
export function buildNode(
  campaign: CampaignState,
  sectorMap: SectorMapDefinition,
  locationId: string,
  nodeType: SupplyNodeType,
): CampaignState {
  const network = campaign.supplyNetwork ?? createSupplyNetwork();
  const location = sectorMap.locations.find(l => l.id === locationId);
  if (!location) return campaign;

  const check = canBuildNode(network, sectorMap, locationId, nodeType, campaign);
  if (!check.allowed) return campaign;

  const cost = NODE_BUILD_COSTS[nodeType];
  const upkeep = NODE_UPKEEP_COSTS[nodeType];

  const newNode: SupplyNode = {
    id: `node-${locationId}-${nodeType}`,
    type: nodeType,
    name: `${location.name} ${capitalize(nodeType)}`,
    description: `${capitalize(nodeType)} established at ${location.name}`,
    locationId,
    buildCost: cost,
    upkeepCost: upkeep,
    severed: false,
    builtInAct: campaign.currentAct,
  };

  // Auto-create routes to adjacent active nodes
  const newRoutes: SupplyRoute[] = [];
  for (const adjLocId of location.connectedLocations) {
    const adjNodes = network.nodes.filter(
      n => n.locationId === adjLocId && !n.severed,
    );
    for (const adjNode of adjNodes) {
      // Avoid duplicate routes
      const exists = network.routes.some(
        r =>
          (r.fromNodeId === newNode.id && r.toNodeId === adjNode.id) ||
          (r.fromNodeId === adjNode.id && r.toNodeId === newNode.id),
      );
      if (!exists) {
        newRoutes.push({ fromNodeId: newNode.id, toNodeId: adjNode.id });
      }
    }
  }

  // Also connect to nodes at the same location
  for (const localNode of network.nodes.filter(
    n => n.locationId === locationId && !n.severed,
  )) {
    newRoutes.push({ fromNodeId: newNode.id, toNodeId: localNode.id });
  }

  const updatedNodes = [...network.nodes, newNode];
  const updatedRoutes = [...network.routes, ...newRoutes];
  const networkIncome = computeNetworkIncome(updatedNodes);

  return {
    ...campaign,
    credits: campaign.credits - cost,
    supplyNetwork: {
      nodes: updatedNodes,
      routes: updatedRoutes,
      networkIncome,
    },
  };
}

// ============================================================================
// NETWORK QUERIES
// ============================================================================

/**
 * Get all active (non-severed) nodes in the network.
 */
export function getActiveNodes(network: SupplyNetwork): SupplyNode[] {
  return network.nodes.filter(n => !n.severed);
}

/**
 * Get locations where the player has active nodes.
 */
export function getConnectedLocations(network: SupplyNetwork): string[] {
  return [...new Set(getActiveNodes(network).map(n => n.locationId))];
}

/**
 * Get missions unlocked by the current supply network.
 * Returns mission IDs that are gated behind network nodes.
 */
export function getNetworkUnlockedMissions(
  network: SupplyNetwork,
  sectorMap: SectorMapDefinition,
): string[] {
  const connectedLocIds = new Set(getConnectedLocations(network));
  const unlocked: string[] = [];

  for (const location of sectorMap.locations) {
    if (connectedLocIds.has(location.id) && location.unlocksMissions) {
      unlocked.push(...location.unlocksMissions);
    }
  }

  return unlocked;
}

/**
 * Get gear IDs available through the supply network.
 */
export function getNetworkAvailableGear(
  network: SupplyNetwork,
  sectorMap: SectorMapDefinition,
): string[] {
  const connectedLocIds = new Set(getConnectedLocations(network));
  const gear: string[] = [];

  for (const location of sectorMap.locations) {
    if (connectedLocIds.has(location.id) && location.unlocksGear) {
      gear.push(...location.unlocksGear);
    }
  }

  return gear;
}

/**
 * Calculate threat reduction from safehouses in the network.
 * Each active safehouse reduces mission threat by SAFEHOUSE_THREAT_REDUCTION.
 */
export function getNetworkThreatReduction(network: SupplyNetwork): number {
  const safehouses = getActiveNodes(network).filter(n => n.type === 'safehouse');
  return safehouses.length * SAFEHOUSE_THREAT_REDUCTION;
}

/**
 * Calculate reinforcement bonus from supply routes.
 * Active supply_route nodes grant bonus reinforcement deployment options.
 * Capped at MAX_REINFORCEMENT_BONUS.
 */
export function getNetworkReinforcementBonus(network: SupplyNetwork): number {
  const supplyRoutes = getActiveNodes(network).filter(n => n.type === 'supply_route');
  return Math.min(supplyRoutes.length, MAX_REINFORCEMENT_BONUS);
}

/**
 * Get all bonuses from the network's connected locations.
 */
export function getNetworkBonuses(
  network: SupplyNetwork,
  sectorMap: SectorMapDefinition,
): SupplyNodeBonus[] {
  const connectedLocIds = new Set(getConnectedLocations(network));
  const bonuses: SupplyNodeBonus[] = [];

  for (const location of sectorMap.locations) {
    if (connectedLocIds.has(location.id)) {
      bonuses.push(...location.bonuses);
    }
  }

  return bonuses;
}

// ============================================================================
// NETWORK MAINTENANCE
// ============================================================================

/**
 * Apply upkeep costs at the start of a mission.
 * Returns updated campaign with credits deducted.
 * Nodes whose upkeep can't be paid are severed.
 */
export function applyNetworkUpkeep(campaign: CampaignState): CampaignState {
  const network = campaign.supplyNetwork;
  if (!network) return campaign;

  let credits = campaign.credits;

  // Collect network income first
  credits += network.networkIncome;

  // Then deduct upkeep
  const updatedNodes = network.nodes.map(node => {
    if (node.severed) return node;
    if (credits >= node.upkeepCost) {
      credits -= node.upkeepCost;
      return node;
    }
    // Can't pay upkeep: sever the node
    return { ...node, severed: true };
  });

  const networkIncome = computeNetworkIncome(updatedNodes);

  return {
    ...campaign,
    credits,
    supplyNetwork: {
      ...network,
      nodes: updatedNodes,
      networkIncome,
    },
  };
}

/**
 * Sever all nodes at a location (triggered by mission failure).
 * Routes connected to severed nodes are also removed.
 */
export function severNodesAtLocation(
  campaign: CampaignState,
  locationId: string,
): CampaignState {
  const network = campaign.supplyNetwork;
  if (!network) return campaign;

  const severedNodeIds = new Set<string>();
  const updatedNodes = network.nodes.map(node => {
    if (node.locationId === locationId && !node.severed) {
      severedNodeIds.add(node.id);
      return { ...node, severed: true };
    }
    return node;
  });

  // Remove routes connected to severed nodes
  const updatedRoutes = network.routes.filter(
    r => !severedNodeIds.has(r.fromNodeId) && !severedNodeIds.has(r.toNodeId),
  );

  const networkIncome = computeNetworkIncome(updatedNodes);

  return {
    ...campaign,
    supplyNetwork: {
      nodes: updatedNodes,
      routes: updatedRoutes,
      networkIncome,
    },
  };
}

/**
 * Repair a severed node (costs same as building).
 */
export function repairNode(
  campaign: CampaignState,
  nodeId: string,
): CampaignState {
  const network = campaign.supplyNetwork;
  if (!network) return campaign;

  const node = network.nodes.find(n => n.id === nodeId);
  if (!node || !node.severed) return campaign;

  const repairCost = NODE_BUILD_COSTS[node.type];
  if (campaign.credits < repairCost) return campaign;

  const updatedNodes = network.nodes.map(n =>
    n.id === nodeId ? { ...n, severed: false } : n,
  );

  const networkIncome = computeNetworkIncome(updatedNodes);

  return {
    ...campaign,
    credits: campaign.credits - repairCost,
    supplyNetwork: {
      ...network,
      nodes: updatedNodes,
      networkIncome,
    },
  };
}

// ============================================================================
// NETWORK-ENHANCED MISSION AVAILABILITY
// ============================================================================

/**
 * Filter available missions to include network-gated missions.
 * Missions with a `requiresNetworkNode` field need an active node
 * at the specified location. Standard prerequisite logic still applies.
 */
export function getNetworkFilteredMissions(
  availableMissionIds: string[],
  network: SupplyNetwork | undefined,
  sectorMap: SectorMapDefinition | undefined,
): string[] {
  if (!network || !sectorMap) return availableMissionIds;

  const networkUnlocked = new Set(getNetworkUnlockedMissions(network, sectorMap));

  // All missions that are available via prerequisites AND either don't need
  // network access or have network access
  return availableMissionIds.filter(missionId => {
    // Check if this mission is in any location's unlocksMissions
    const needsNetworkUnlock = sectorMap.locations.some(
      loc => loc.unlocksMissions?.includes(missionId),
    );

    if (!needsNetworkUnlock) return true; // Standard mission, no network gate
    return networkUnlocked.has(missionId); // Network-gated: check access
  });
}

// ============================================================================
// SUMMARY FOR UI
// ============================================================================

/**
 * Get a summary of the supply network for display.
 */
export function getNetworkSummary(
  network: SupplyNetwork | undefined,
  sectorMap: SectorMapDefinition | undefined,
) {
  if (!network || !sectorMap) {
    return {
      totalNodes: 0,
      activeNodes: 0,
      severedNodes: 0,
      connectedLocations: [] as string[],
      networkIncome: 0,
      totalUpkeep: 0,
      threatReduction: 0,
      reinforcementBonus: 0,
      unlockedMissions: [] as string[],
      availableGear: [] as string[],
    };
  }

  const active = getActiveNodes(network);
  const severed = network.nodes.filter(n => n.severed);

  return {
    totalNodes: network.nodes.length,
    activeNodes: active.length,
    severedNodes: severed.length,
    connectedLocations: getConnectedLocations(network),
    networkIncome: network.networkIncome,
    totalUpkeep: active.reduce((sum, n) => sum + n.upkeepCost, 0),
    threatReduction: getNetworkThreatReduction(network),
    reinforcementBonus: getNetworkReinforcementBonus(network),
    unlockedMissions: getNetworkUnlockedMissions(network, sectorMap),
    availableGear: getNetworkAvailableGear(network, sectorMap),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function computeNetworkIncome(nodes: SupplyNode[]): number {
  return nodes
    .filter(n => !n.severed)
    .reduce((sum, n) => sum + NODE_INCOME[n.type], 0);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

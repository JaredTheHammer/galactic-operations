/**
 * Turn Machine v2 -- Game Flow for Galactic Operations v2
 *
 * Manages turn phases and game progression using v2 types:
 * - v2 GameState with heroes/npcProfiles registries
 * - v2 Figure (entityType/entityId, woundsCurrent, actionsRemaining 0-1, conditions)
 * - v2 GameAction union (Move, Attack, Aim, Rally, GuardedStance, etc.)
 * - v2 combat pipeline via combat-v2.ts
 *
 * Changes from v1 (turn-machine.ts):
 * - GameState includes heroes, npcProfiles, playMode fields
 * - Figures use v2 shape (entityType/entityId, woundsCurrent/strainCurrent, conditions)
 * - executeAction handles v2 action types (Rally, GuardedStance, TakeCover, StrainForManeuver, etc.)
 * - Action/Maneuver economy: actions decrement actionsRemaining, maneuvers decrement maneuversRemaining
 * - No Rest or Overwatch action types
 * - Combat uses resolveCombatV2 + applyCombatResult from combat-v2.ts
 */

import type {
  GameState,
  GameData,
  GameMap,
  Mission,
  Player,
  TurnPhase,
  GameAction,
  Figure,
  Side,
  NPCProfile,
  HeroCharacter,
  Condition,
  CoverType,
  RangeBand,
  ObjectivePoint,
  ObjectivePointTemplate,
  ConsumableItem,
} from './types.js';

import { RANGE_BAND_TILES, computeDiminishedHealing } from './types.js';

import { getValidMoves, getDistance } from './movement.js';
import { moveFigure } from './movement.js';
import { hasLineOfSight, getCover } from './los.js';
import { getMoraleState } from './morale.js';
import {
  createCombatScenarioV2,
  resolveCombatV2,
  applyCombatResult,
  buildCombatPools,
} from './combat-v2.js';
import {
  buildAttackPool,
  buildDefensePool,
  rollAttackPool,
  rollDefensePool,
  resolveFromRolls,
} from './dice-v2.js';
import { executeActiveTalent } from './talent-v2.js';
import { resolveSkillCheck } from './character-v2.js';
import { hasKeyword, getKeywordValue } from './keywords.js';
import {
  getSpeciesRegeneration,
  getSpeciesBonusStrainRecovery,
  isImmuneToCondition,
} from './species-abilities.js';

// ============================================================================
// OBJECTIVE POINT UTILITIES
// ============================================================================

/**
 * Convert objective point templates (from mission JSON) to runtime ObjectivePoints.
 * Sets isCompleted = false for all points.
 */
export function objectivePointsFromTemplates(templates: ObjectivePointTemplate[]): ObjectivePoint[] {
  return templates.map(t => ({ ...t, isCompleted: false }));
}

// ============================================================================
// GAME STATE CREATION
// ============================================================================

/**
 * Create a v2 initial game state from mission data, players, and entity registries.
 *
 * Unlike v1, this requires heroes and npcProfiles to be passed in
 * (they come from the loaded game data and scenario configuration).
 */
export function createInitialGameStateV2(
  mission: Mission,
  players: Player[],
  gameData: GameData,
  prebuiltMap?: GameMap,
  options?: {
    heroes?: Record<string, HeroCharacter>;
    npcProfiles?: Record<string, NPCProfile>;
    /** Objective point templates from mission definition. Converted to runtime ObjectivePoint[] */
    objectivePointTemplates?: ObjectivePointTemplate[];
    /** Loot tokens from mission definition. Placed on the map for collection. */
    lootTokens?: LootToken[];
    /** Consumable inventory from campaign state. Maps item ID to quantity. */
    consumableInventory?: Record<string, number>;
  },
): GameState {
  let map: GameMap;

  if (prebuiltMap) {
    map = prebuiltMap;
  } else {
    // Legacy fallback: minimal 10x10 empty map
    const width = 10;
    const height = 10;
    map = {
      id: mission.mapId,
      name: 'Test Map',
      width,
      height,
      tiles: Array(height)
        .fill(null)
        .map(() =>
          Array(width)
            .fill(null)
            .map(() => ({
              terrain: 'Open' as const,
              elevation: 0,
              cover: 'None' as const,
              occupied: null,
              objective: null,
            }))
        ),
      deploymentZones: {
        imperial: [],
        operative: [],
      },
    };
  }

  return {
    missionId: mission.id,
    roundNumber: 1,
    turnPhase: 'Setup',
    playMode: 'grid',
    map,
    players,
    currentPlayerIndex: 0,
    figures: [],
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: options?.heroes ?? {},
    npcProfiles: options?.npcProfiles ?? {},
    imperialMorale: {
      value: 12,
      max: 12,
      state: 'Steady',
    },
    operativeMorale: {
      value: 12,
      max: 12,
      state: 'Steady',
    },
    activeCombat: null,
    threatPool: mission.imperialThreat,
    reinforcementPoints: mission.imperialReinforcementPoints,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,

    // Mission tracking
    activeMissionId: mission.id,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: options?.objectivePointTemplates
      ? objectivePointsFromTemplates(options.objectivePointTemplates)
      : [],

    // Loot tokens from mission definition (placed on map for collection)
    lootTokens: options?.lootTokens ?? [],

    // Consumable inventory (initialized from campaign state or empty for standalone)
    consumableInventory: options?.consumableInventory ?? {},
  };
}

// ============================================================================
// FIGURE DEPLOYMENT (v2)
// ============================================================================

export interface ArmyCompositionV2 {
  imperial: Array<{ npcId: string; count: number }>;
  operative: Array<{ entityType: 'hero' | 'npc'; entityId: string; count: number }>;
}

/**
 * Deploy v2 figures onto the game state.
 * Imperial side: all NPCs from npcProfiles registry.
 * Operative side: heroes from heroes registry or NPCs.
 */
export function deployFiguresV2(
  gameState: GameState,
  army: ArmyCompositionV2,
  gameData: GameData,
): GameState {
  const figures: Figure[] = [];

  const imperialPlayer = gameState.players.find(p => p.role === 'Imperial');
  const operativePlayer = gameState.players.find(p => p.role === 'Operative');
  if (!imperialPlayer || !operativePlayer) return gameState;

  const hasZones =
    gameState.map.deploymentZones.imperial.length > 0 &&
    gameState.map.deploymentZones.operative.length > 0;

  const usedPositions = new Set<string>();
  const posKey = (c: { x: number; y: number }) => `${c.x},${c.y}`;

  function getAvailablePositions(zones: { x: number; y: number }[]): { x: number; y: number }[] {
    return zones.filter(z => {
      const tile = gameState.map.tiles[z.y]?.[z.x];
      return tile && tile.terrain !== 'Wall' && tile.terrain !== 'Impassable' && !usedPositions.has(posKey(z));
    });
  }

  function pickPosition(available: { x: number; y: number }[], fallbackX: number, index: number): { x: number; y: number } {
    if (available.length > 0) {
      const pos = available.splice(0, 1)[0];
      usedPositions.add(posKey(pos));
      return pos;
    }
    const pos = { x: fallbackX, y: index };
    usedPositions.add(posKey(pos));
    return pos;
  }

  // Deploy Imperial NPCs
  const impZones = hasZones
    ? getAvailablePositions(gameState.map.deploymentZones.imperial)
    : getAvailablePositions(
      Array.from({ length: gameState.map.height }, (_, y) =>
        [0, 1, 2].map(x => ({ x, y }))
      ).flat()
    );

  let impIdx = 0;
  for (const entry of army.imperial) {
    const npc = gameState.npcProfiles[entry.npcId] ?? gameData.npcProfiles[entry.npcId];
    if (!npc) continue;

    for (let i = 0; i < entry.count; i++) {
      const pos = pickPosition(impZones, 0, impIdx);
      figures.push(createNPCFigure(
        `imp-${impIdx}`,
        entry.npcId,
        imperialPlayer.id,
        pos,
        npc,
      ));
      impIdx++;
    }
  }

  // Deploy Operative units (heroes or NPCs)
  const opZones = hasZones
    ? getAvailablePositions(gameState.map.deploymentZones.operative)
    : getAvailablePositions(
      Array.from({ length: gameState.map.height }, (_, y) =>
        [gameState.map.width - 3, gameState.map.width - 2, gameState.map.width - 1].map(x => ({ x, y }))
      ).flat()
    );

  let opIdx = 0;
  for (const entry of army.operative) {
    for (let i = 0; i < entry.count; i++) {
      const pos = pickPosition(opZones, gameState.map.width - 1, opIdx);

      if (entry.entityType === 'hero') {
        const hero = gameState.heroes[entry.entityId];
        if (!hero) continue;
        figures.push(createHeroFigure(
          `op-${opIdx}`,
          entry.entityId,
          operativePlayer.id,
          pos,
          hero,
        ));
      } else {
        const npc = gameState.npcProfiles[entry.entityId] ?? gameData.npcProfiles[entry.entityId];
        if (!npc) continue;
        figures.push(createNPCFigure(
          `op-${opIdx}`,
          entry.entityId,
          operativePlayer.id,
          pos,
          npc,
        ));
      }
      opIdx++;
    }
  }

  return { ...gameState, figures };
}

/**
 * Derive courage value for an NPC from explicit profile value or tier default.
 * Minion=1, Rival=2, Nemesis=3.
 */
export function getNPCCourage(npc: NPCProfile): number {
  if (npc.courage !== undefined) return npc.courage;
  switch (npc.tier) {
    case 'Minion': return 1;
    case 'Rival': return 2;
    case 'Nemesis': return 3;
    default: return 1;
  }
}

/**
 * Derive courage value for a hero from Willpower characteristic.
 * Heroes get willpower + 2 (floor 3) to prevent the suppression death spiral
 * where low-willpower heroes get permanently locked out of attacking by
 * sustained imperial fire (6+ enemies each adding +1 token per hit).
 */
export function getHeroCourage(hero: HeroCharacter): number {
  return Math.max((hero.characteristics?.willpower ?? 2) + 2, 3);
}

function createNPCFigure(
  id: string,
  entityId: string,
  playerId: number,
  position: { x: number; y: number },
  npc: NPCProfile,
): Figure {
  return {
    id,
    entityType: 'npc',
    entityId,
    playerId,
    position,
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: { ...npc.attackPool },
    cachedDefensePool: { ...npc.defensePool },
    baseSize: npc.baseSize ?? 'standard',
    minionGroupSize: npc.tier === 'Minion' ? 1 : undefined,
    minionGroupMax: npc.tier === 'Minion' ? 1 : undefined,
    suppressionTokens: 0,
    courage: getNPCCourage(npc),
  };
}

function createHeroFigure(
  id: string,
  entityId: string,
  playerId: number,
  position: { x: number; y: number },
  hero: HeroCharacter,
): Figure {
  return {
    id,
    entityType: 'hero',
    entityId,
    playerId,
    position,
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    isActivated: false,
    isDefeated: false,
    // Carry persistent wounded status from campaign (hero starts mission wounded)
    isWounded: hero.isWounded ?? false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    baseSize: 'standard',
    cachedAttackPool: null, // computed at activation
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: getHeroCourage(hero),
  };
}

// ============================================================================
// PHASE MANAGEMENT
// ============================================================================

/**
 * Advance the game to the next turn phase (same as v1, reexported for v2).
 */
export function advancePhaseV2(gameState: GameState): GameState {
  let newPhase: TurnPhase;

  switch (gameState.turnPhase) {
    case 'Setup':
      newPhase = 'Initiative';
      return { ...gameState, turnPhase: newPhase };

    case 'Initiative': {
      const activationOrder = buildActivationOrderV2(gameState);
      return {
        ...gameState,
        turnPhase: 'Activation',
        activationOrder,
        currentActivationIndex: 0,
      };
    }

    case 'Activation':
      if (gameState.currentActivationIndex >= gameState.activationOrder.length) {
        return { ...gameState, turnPhase: 'Status' };
      }
      return {
        ...gameState,
        currentActivationIndex: gameState.currentActivationIndex + 1,
      };

    case 'Status':
      return { ...gameState, turnPhase: 'Reinforcement' };

    case 'Reinforcement':
      return {
        ...gameState,
        turnPhase: 'Initiative',
        roundNumber: gameState.roundNumber + 1,
        activationOrder: [],
        currentActivationIndex: 0,
      };

    case 'GameOver':
    default:
      return gameState;
  }
}

// ============================================================================
// REINFORCEMENT PHASE (threat spending + unit spawning)
// ============================================================================

/**
 * Describes a single reinforcement deployment event.
 */
export interface ReinforcementEvent {
  npcId: string;
  npcName: string;
  figureId: string;
  position: { x: number; y: number };
  threatCost: number;
}

/**
 * Result of applying the reinforcement phase.
 */
export interface ReinforcementResult {
  gameState: GameState;
  events: ReinforcementEvent[];
  threatSpent: number;
  threatGained: number;
  newThreatPool: number;
}

/**
 * Default threat costs by tier (fallback if NPC profile has no threatCost).
 */
const DEFAULT_THREAT_COSTS: Record<string, number> = {
  Minion: 2,
  Rival: 4,
  Nemesis: 8,
};

/**
 * Imperial AI threat spending priority list.
 * The AI evaluates these options in order and buys what it can afford,
 * preferring to maintain a mixed force composition.
 *
 * Strategy: escalating pressure curve with threat banking.
 * Phase thresholds scale proportionally to roundLimit so the same
 * early/mid/late cadence works on skirmish (12 rounds) and epic (18 rounds).
 * - Early (first 30%): cheap units (stormtroopers) to establish presence
 * - Mid (30-55%): elites + banking toward boss unit when close to affording one
 * - Late (55%+): boss deployment (Inquisitor), elites, aggressive spending
 *
 * Key improvement: AI banks threat in mid-game to afford boss (Nemesis)
 * units. Without banking, the per-round income never accumulates
 * to the 9-threat Inquisitor cost.
 */
function getReinforcementPurchases(
  threatPool: number,
  round: number,
  npcProfiles: Record<string, NPCProfile>,
  currentFigures: Figure[],
  imperialPlayerId: number,
  roundLimit: number = 12,
): Array<{ npcId: string; cost: number }> {
  const purchases: Array<{ npcId: string; cost: number }> = [];
  let budget = threatPool;

  // Proportional phase boundaries (scale with game length)
  const earlyEnd = Math.max(2, Math.floor(roundLimit * 0.30));
  const midEnd = Math.max(earlyEnd + 1, Math.floor(roundLimit * 0.55));

  // Count current living imperial units
  const livingImperials = currentFigures.filter(
    f => f.playerId === imperialPlayerId && !f.isDefeated
  );
  const livingCount = livingImperials.length;
  const livingElites = livingImperials.filter(f => {
    const npc = npcProfiles[f.entityId];
    return npc && npc.tier !== 'Minion';
  }).length;
  const hasBoss = livingImperials.some(f => {
    const npc = npcProfiles[f.entityId];
    return npc && npc.tier === 'Nemesis';
  });

  // Build purchasable lists by tier
  const allUnits = Object.values(npcProfiles)
    .filter(npc => npc.side === 'imperial')
    .map(npc => ({
      npcId: npc.id,
      cost: npc.threatCost ?? DEFAULT_THREAT_COSTS[npc.tier] ?? 3,
      tier: npc.tier,
      name: npc.name,
      speed: npc.speed ?? 4,
    }))
    .sort((a, b) => a.cost - b.cost);

  const minions = allUnits.filter(p => p.tier === 'Minion');
  // Prefer mobile elites (speed >= 3) for reinforcements; emplaced units (speed <= 2) are poor reinforcements
  const mobileElites = allUnits.filter(p => p.tier === 'Rival' && p.speed >= 3).sort((a, b) => b.cost - a.cost);
  const bosses = allUnits.filter(p => p.tier === 'Nemesis');

  // Determine boss banking strategy: if a boss is affordable within
  // 1 round of income, reserve threat for it.
  const incomePerRound = Math.max(4, Math.floor(budget / Math.max(1, round)));
  const cheapestBoss = bosses[0];
  const bossAffordableRounds = cheapestBoss
    ? Math.ceil((cheapestBoss.cost - budget) / Math.max(1, incomePerRound))
    : Infinity;
  // Only bank when boss is affordable within 1 round of saved income.
  // Banking too early (2+ rounds) creates a pressure gap heroes exploit.
  const shouldBankForBoss = !hasBoss && cheapestBoss && round >= midEnd - 1 && bossAffordableRounds <= 1;

  // Escalation phases (proportional to game length)
  if (round <= earlyEnd) {
    // Early game: moderate minion deployment to slow heroes during approach
    const trooper = minions[0];
    if (trooper && budget >= trooper.cost) {
      const count = Math.min(2, Math.floor(budget / trooper.cost));
      for (let i = 0; i < count; i++) {
        purchases.push({ npcId: trooper.npcId, cost: trooper.cost });
        budget -= trooper.cost;
      }
    }
  } else if (shouldBankForBoss && budget < (cheapestBoss?.cost ?? Infinity)) {
    // Mid/late game banking: save for boss unit
    // Only buy a single cheap minion to maintain field presence (if field is thin)
    if (livingCount < 4 && minions[0] && budget >= minions[0].cost) {
      purchases.push({ npcId: minions[0].npcId, cost: minions[0].cost });
      budget -= minions[0].cost;
    }
    // Otherwise: save everything for the big deploy next round
  } else if (round <= midEnd) {
    // Mid game: invest in combat-effective mobile elites
    // Prefer stormtrooper-elite (cost 4, better attack pool) over officer (cost 3)
    if (livingElites < 3 && mobileElites.length > 0) {
      const bestElite = mobileElites.find(e => e.cost <= budget);
      if (bestElite) {
        purchases.push({ npcId: bestElite.npcId, cost: bestElite.cost });
        budget -= bestElite.cost;
      }
    }
    // Fill with minions
    const trooper = minions[0];
    if (trooper) {
      while (budget >= trooper.cost) {
        purchases.push({ npcId: trooper.npcId, cost: trooper.cost });
        budget -= trooper.cost;
      }
    }
  } else {
    // Late game: deploy boss if affordable, then mobile elites, then minions
    if (!hasBoss && cheapestBoss && budget >= cheapestBoss.cost) {
      purchases.push({ npcId: cheapestBoss.npcId, cost: cheapestBoss.cost });
      budget -= cheapestBoss.cost;
    }
    // Fill with best available mobile elites
    for (const elite of mobileElites) {
      while (budget >= elite.cost) {
        purchases.push({ npcId: elite.npcId, cost: elite.cost });
        budget -= elite.cost;
      }
    }
    // Fill remaining with minions
    const trooper = minions[0];
    if (trooper) {
      while (budget >= trooper.cost) {
        purchases.push({ npcId: trooper.npcId, cost: trooper.cost });
        budget -= trooper.cost;
      }
    }
  }

  // Cap: don't let Imperial field count exceed 8 active at once
  const maxNew = Math.max(0, 8 - livingCount);
  return purchases.slice(0, maxNew);
}

/**
 * Find available deployment positions for reinforcements.
 *
 * Forward deployment system: instead of always spawning at the Imperial
 * deployment zone edge (which can be 30+ tiles from the combat front),
 * reinforcements deploy behind the current Imperial front line.
 *
 * Logic:
 * 1. Find the most forward (highest x) living Imperial unit
 * 2. Compute forward deploy column = midpoint between front line and deploy zone edge
 * 3. Clamp: never past the front line (always behind existing units)
 * 4. Clamp: never behind the deploy zone edge (minimum forward position)
 * 5. Search for passable unoccupied tiles around forward deploy x,
 *    within the y-range of existing Imperial units (+/- 3 rows)
 * 6. Fallback: original deploy zone if no forward positions found
 */
function getReinforcementPositions(
  gameState: GameState,
  count: number,
): Array<{ x: number; y: number }> {
  const usedPositions = new Set(
    gameState.figures.filter(f => !f.isDefeated).map(f => `${f.position.x},${f.position.y}`)
  );

  const livingImperials = gameState.figures.filter(
    f => !f.isDefeated && f.id.startsWith('imp-')
  );

  // Determine the imperial deploy zone edge (max x in deploy zone)
  const deployZone = gameState.map.deploymentZones.imperial;
  const deployZoneMaxX = deployZone.length > 0
    ? Math.max(...deployZone.map(p => p.x))
    : 2;

  // Try forward deployment first (only if imperials are on the field)
  if (livingImperials.length > 0) {
    const imperialXs = livingImperials.map(f => f.position.x);
    const imperialYs = livingImperials.map(f => f.position.y);
    const maxImperialX = Math.max(...imperialXs);
    const minImperialY = Math.min(...imperialYs);
    const maxImperialY = Math.max(...imperialYs);

    // Forward deploy column: 1/3 of the way from deploy zone edge to front line.
    // This gives reinforcements a 1-2 round head start over pure edge spawning
    // while still requiring meaningful travel time to reach combat.
    const distToFront = maxImperialX - deployZoneMaxX;
    const forwardX = Math.min(
      maxImperialX - 4,                                                    // always well behind front line
      Math.floor(deployZoneMaxX + distToFront * 0.33),                     // 1/3 of the way forward
    );
    const clampedForwardX = Math.max(forwardX, deployZoneMaxX);  // never behind deploy zone

    // Search range: +/- 3 columns around forward X, within Imperial y-range +/- 3
    const yMin = Math.max(0, minImperialY - 3);
    const yMax = Math.min(gameState.map.height - 1, maxImperialY + 3);
    const xMin = Math.max(0, clampedForwardX - 3);
    const xMax = Math.min(gameState.map.width - 1, clampedForwardX + 3);

    const forwardCandidates: Array<{ x: number; y: number }> = [];

    // Collect candidates sorted by proximity to forward X (closest first)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const key = `${x},${y}`;
        const tile = gameState.map.tiles[y]?.[x];
        if (tile && tile.terrain !== 'Wall' && tile.terrain !== 'Impassable' && !usedPositions.has(key)) {
          forwardCandidates.push({ x, y });
        }
      }
    }

    // Sort by distance to forward deploy point (prefer center of formation)
    const centerY = Math.floor((minImperialY + maxImperialY) / 2);
    forwardCandidates.sort((a, b) => {
      const distA = Math.abs(a.x - clampedForwardX) + Math.abs(a.y - centerY);
      const distB = Math.abs(b.x - clampedForwardX) + Math.abs(b.y - centerY);
      return distA - distB;
    });

    if (forwardCandidates.length >= count) {
      return forwardCandidates.slice(0, count);
    }
  }

  // Fallback: original deploy zone logic
  const candidates: Array<{ x: number; y: number }> = [];

  if (deployZone.length > 0) {
    for (const pos of deployZone) {
      const key = `${pos.x},${pos.y}`;
      const tile = gameState.map.tiles[pos.y]?.[pos.x];
      if (tile && tile.terrain !== 'Wall' && tile.terrain !== 'Impassable' && !usedPositions.has(key)) {
        candidates.push(pos);
      }
    }
  }

  // Fallback: imperial edge (left 3 columns)
  if (candidates.length < count) {
    for (let y = 0; y < gameState.map.height && candidates.length < count * 2; y++) {
      for (let x = 0; x < 3 && candidates.length < count * 2; x++) {
        const key = `${x},${y}`;
        const tile = gameState.map.tiles[y]?.[x];
        if (tile && tile.terrain !== 'Wall' && tile.terrain !== 'Impassable' && !usedPositions.has(key)) {
          if (!candidates.some(c => c.x === x && c.y === y)) {
            candidates.push({ x, y });
          }
        }
      }
    }
  }

  return candidates.slice(0, count);
}

/**
 * Apply the reinforcement phase: accumulate threat, then spend it to deploy new units.
 * This is the core function that makes the Imperial side escalate over time.
 *
 * Called between Status and Initiative phases each round.
 */
export function applyReinforcementPhase(
  gameState: GameState,
  gameData: GameData,
  roundLimit: number = 12,
): ReinforcementResult {
  const imperialPlayer = gameState.players.find(p => p.role === 'Imperial');
  if (!imperialPlayer) {
    return { gameState, events: [], threatSpent: 0, threatGained: 0, newThreatPool: gameState.threatPool };
  }

  // Step 1: Accumulate threat (per-round income)
  const threatGained = gameState.reinforcementPoints;
  let threatPool = gameState.threatPool + threatGained;

  // Step 2: Imperial AI decides what to buy (phase thresholds scale with roundLimit)
  const purchases = getReinforcementPurchases(
    threatPool,
    gameState.roundNumber,
    { ...gameData.npcProfiles, ...gameState.npcProfiles },
    gameState.figures,
    imperialPlayer.id,
    roundLimit,
  );

  if (purchases.length === 0) {
    return {
      gameState: { ...gameState, threatPool },
      events: [],
      threatSpent: 0,
      threatGained,
      newThreatPool: threatPool,
    };
  }

  // Step 3: Deploy purchased units
  const positions = getReinforcementPositions(gameState, purchases.length);
  const events: ReinforcementEvent[] = [];
  let newFigures = [...gameState.figures];
  let npcProfiles = { ...gameState.npcProfiles };
  let totalSpent = 0;

  // Generate unique figure IDs
  const existingImpIds = gameState.figures
    .filter(f => f.id.startsWith('imp-'))
    .map(f => parseInt(f.id.replace('imp-', ''), 10))
    .filter(n => !isNaN(n));
  let nextImpIdx = existingImpIds.length > 0 ? Math.max(...existingImpIds) + 1 : 100;

  for (let i = 0; i < purchases.length && i < positions.length; i++) {
    const purchase = purchases[i];
    const pos = positions[i];
    const npc = gameData.npcProfiles[purchase.npcId] ?? gameState.npcProfiles[purchase.npcId];
    if (!npc) continue;

    const figureId = `imp-${nextImpIdx++}`;

    // Ensure NPC profile is in gameState registry
    if (!npcProfiles[purchase.npcId]) {
      npcProfiles[purchase.npcId] = npc;
    }

    // Create the figure
    const figure = createNPCFigure(figureId, purchase.npcId, imperialPlayer.id, pos, npc);
    newFigures.push(figure);

    threatPool -= purchase.cost;
    totalSpent += purchase.cost;

    events.push({
      npcId: purchase.npcId,
      npcName: npc.name,
      figureId,
      position: pos,
      threatCost: purchase.cost,
    });
  }

  const newGameState: GameState = {
    ...gameState,
    figures: newFigures,
    npcProfiles,
    threatPool,
  };

  return {
    gameState: newGameState,
    events,
    threatSpent: totalSpent,
    threatGained,
    newThreatPool: threatPool,
  };
}

// ============================================================================
// MISSION-SCRIPTED REINFORCEMENTS
// ============================================================================

/**
 * Result from applying mission-scripted reinforcement waves.
 */
export interface MissionReinforcementResult {
  gameState: GameState;
  events: ReinforcementEvent[];
  wavesTriggered: string[];
  narrativeTexts: string[];
}

/**
 * Apply mission-scripted reinforcement waves for the current round.
 *
 * These are pre-defined in the MissionDefinition JSON and trigger at specific
 * rounds, separate from the threat-based AI reinforcement system.
 *
 * @param gameState Current game state
 * @param gameData Global game data (NPC profiles)
 * @param waves Reinforcement waves from MissionDefinition
 * @param alreadyTriggeredWaveIds Wave IDs that have already been deployed
 */
export function applyMissionReinforcements(
  gameState: GameState,
  gameData: GameData,
  waves: Array<{
    id: string;
    triggerRound: number;
    triggerEvent?: string;
    groups: Array<{
      npcProfileId: string;
      count: number;
      asMinGroup: boolean;
      deployZone?: Array<{ x: number; y: number }>;
    }>;
    threatCost: number;
    narrativeText?: string;
  }>,
  alreadyTriggeredWaveIds: string[] = [],
): MissionReinforcementResult {
  const imperialPlayer = gameState.players.find(p => p.role === 'Imperial');
  if (!imperialPlayer) {
    return { gameState, events: [], wavesTriggered: [], narrativeTexts: [] };
  }

  const round = gameState.roundNumber;
  const triggeredWaves = waves.filter(w =>
    w.triggerRound === round && !alreadyTriggeredWaveIds.includes(w.id)
  );

  if (triggeredWaves.length === 0) {
    return { gameState, events: [], wavesTriggered: [], narrativeTexts: [] };
  }

  let newFigures = [...gameState.figures];
  let npcProfiles = { ...gameState.npcProfiles };
  const events: ReinforcementEvent[] = [];
  const wavesTriggered: string[] = [];
  const narrativeTexts: string[] = [];

  // Generate unique figure IDs continuing from existing max
  const existingImpIds = gameState.figures
    .filter(f => f.id.startsWith('imp-'))
    .map(f => parseInt(f.id.replace('imp-', ''), 10))
    .filter(n => !isNaN(n));
  let nextImpIdx = existingImpIds.length > 0 ? Math.max(...existingImpIds) + 1 : 100;

  for (const wave of triggeredWaves) {
    wavesTriggered.push(wave.id);
    if (wave.narrativeText) {
      narrativeTexts.push(wave.narrativeText);
    }

    for (const group of wave.groups) {
      const npc = gameData.npcProfiles[group.npcProfileId] ?? gameState.npcProfiles[group.npcProfileId];
      if (!npc) continue;

      // Ensure NPC profile is in registry
      if (!npcProfiles[group.npcProfileId]) {
        npcProfiles[group.npcProfileId] = npc;
      }

      for (let i = 0; i < group.count; i++) {
        const figureId = `imp-${nextImpIdx++}`;

        // Use the spawn group's deploy zone if specified, otherwise fall back to map edge
        let position: { x: number; y: number };
        if (group.deployZone && group.deployZone[i]) {
          position = group.deployZone[i];
        } else if (group.deployZone && group.deployZone.length > 0) {
          // Wrap around deploy zone if more units than positions
          position = group.deployZone[i % group.deployZone.length];
        } else {
          // Fallback: use map edge positions
          const fallbackPositions = getReinforcementPositions(gameState, 1);
          position = fallbackPositions[0] ?? { x: 0, y: 0 };
        }

        // Clamp to map bounds
        const map = gameState.map;
        position = {
          x: Math.max(0, Math.min(map.width - 1, position.x)),
          y: Math.max(0, Math.min(map.height - 1, position.y)),
        };

        const figure = createNPCFigure(figureId, group.npcProfileId, imperialPlayer.id, position, npc);
        newFigures.push(figure);

        events.push({
          npcId: group.npcProfileId,
          npcName: npc.name,
          figureId,
          position,
          threatCost: 0, // Scripted waves don't cost from the threat pool
        });
      }
    }
  }

  return {
    gameState: {
      ...gameState,
      figures: newFigures,
      npcProfiles,
    },
    events,
    wavesTriggered,
    narrativeTexts,
  };
}

/**
 * Build activation order using alternating activations between sides.
 * This mirrors the tabletop game: Imperial activates one figure, then
 * Operative activates one, alternating until all figures have gone.
 * Within each side, figures are sorted by speed (fastest first).
 * If one side has more figures, their extras go at the end.
 */
export function buildActivationOrderV2(gameState: GameState): string[] {
  const alive = gameState.figures.filter(f => !f.isDefeated);

  const imperials = alive
    .filter(f => gameState.players.find(p => p.id === f.playerId)?.role === 'Imperial')
    .sort((a, b) => getFigureSpeed(b, gameState) - getFigureSpeed(a, gameState));

  const operatives = alive
    .filter(f => gameState.players.find(p => p.id === f.playerId)?.role === 'Operative')
    .sort((a, b) => getFigureSpeed(b, gameState) - getFigureSpeed(a, gameState));

  // Interleave: Imperial first (they won initiative in canon), then alternate
  const order: string[] = [];
  const maxLen = Math.max(imperials.length, operatives.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < imperials.length) order.push(imperials[i].id);
    if (i < operatives.length) order.push(operatives[i].id);
  }
  return order;
}

function getFigureSpeed(figure: Figure, gameState: GameState): number {
  if (figure.entityType === 'npc') {
    const npc = gameState.npcProfiles[figure.entityId];
    return npc?.speed ?? 4;
  }
  return 4;
}

// ============================================================================
// SUPPRESSION STATE
// ============================================================================

export type SuppressionState = 'Normal' | 'Suppressed' | 'Panicked';

/**
 * Determine suppression state based on tokens vs courage.
 * - Normal: tokens < courage (no penalty)
 * - Suppressed: tokens >= courage (lose Action, maneuver only)
 * - Panicked: tokens >= 2 * courage (must flee, no actions)
 */
export function getSuppressionState(figure: Figure): SuppressionState {
  if (figure.courage <= 0) return 'Normal'; // immune (e.g., droids with courage 0)
  if (figure.suppressionTokens >= figure.courage * 2) return 'Panicked';
  if (figure.suppressionTokens >= figure.courage) return 'Suppressed';
  return 'Normal';
}

// ============================================================================
// ACTIVATION RESET
// ============================================================================

/**
 * Reset a figure's action economy for a new activation.
 * v2: 1 Action + 1 Maneuver, reset strain-for-maneuver flag.
 * Also clears transient conditions and runs suppression rally step.
 *
 * Suppression flow:
 * 1. Rally: roll 1d6 per suppression token; each 4+ removes one
 * 2. Check thresholds: >= courage = suppressed (no Action); >= 2*courage = panicked (flee)
 */
export function resetForActivation(
  figure: Figure,
  rollFn?: () => number,
  gameState?: GameState,
  gameData?: GameData,
): Figure {
  const newConditions = figure.conditions.filter(c =>
    // Remove transient conditions that expire at activation start
    c !== 'Disoriented'
  );

  // Graduated suppression rally step: roll 1d6 per suppression token.
  // Each roll of 4+ (success on Ability die) removes 1 token.
  let suppressionTokens = figure.suppressionTokens;
  if (suppressionTokens > 0) {
    const roll = rollFn ?? (() => Math.ceil(Math.random() * 6));
    let removed = 0;
    for (let i = 0; i < figure.suppressionTokens; i++) {
      if (roll() >= 4) {
        removed++;
      }
    }

    // Disciplined X: remove X additional suppression tokens during rally
    if (gameState) {
      const disciplinedValue = getKeywordValue(figure, 'Disciplined', gameState);
      if (disciplinedValue > 0) {
        removed += disciplinedValue;
      }
    }

    suppressionTokens = Math.max(0, figure.suppressionTokens - removed);
  }

  // Dauntless: may suffer 1 strain to remove 1 suppression token at activation start
  let strainCurrent = figure.strainCurrent;
  if (gameState && suppressionTokens > 0) {
    const hasDauntless = hasKeyword(figure, 'Dauntless', gameState);
    if (hasDauntless) {
      // Only use Dauntless if the figure has strain capacity (not a Minion)
      // and won't be incapacitated by the strain
      const entity = figure.entityType === 'npc'
        ? gameState.npcProfiles[figure.entityId]
        : null;
      const strainThreshold = entity && 'strainThreshold' in entity
        ? (entity as NPCProfile).strainThreshold
        : null;
      // Heroes always have strain threshold
      const heroEntity = figure.entityType === 'hero'
        ? gameState.heroes[figure.entityId]
        : null;
      const effectiveThreshold = strainThreshold ?? (heroEntity?.strain?.threshold ?? null);

      if (effectiveThreshold !== null && strainCurrent < effectiveThreshold) {
        strainCurrent += 1;
        suppressionTokens = Math.max(0, suppressionTokens - 1);
      }
    }
  }

  // Determine suppression state after rally
  let actionsRemaining = 1;
  let maneuversRemaining = 1;

  const courage = figure.courage;
  if (courage > 0 && suppressionTokens >= courage * 2) {
    // Panicked: no actions, only forced flee (maneuver granted for retreat)
    actionsRemaining = 0;
    maneuversRemaining = 1; // can still flee
  } else if (courage > 0 && suppressionTokens >= courage) {
    // Suppressed: lose Action, maneuver only
    actionsRemaining = 0;
    maneuversRemaining = 1;
  }

  // Species regeneration (e.g., Trandoshan: recover 1 wound at activation start)
  let woundsCurrent = figure.woundsCurrent;
  if (gameState && gameData && figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    if (hero) {
      const regenAmount = getSpeciesRegeneration(figure, hero, gameData);
      if (regenAmount > 0) {
        woundsCurrent = Math.max(0, woundsCurrent - regenAmount);
      }
    }
  }

  return {
    ...figure,
    actionsRemaining,
    maneuversRemaining,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,       // standby consumed/cleared at new activation
    standbyWeaponId: null,
    dodgeTokens: 0,          // dodge tokens cleared at new activation (aim persists)
    isActivated: false,
    conditions: newConditions,
    suppressionTokens,
    strainCurrent,
    woundsCurrent,
  };
}

// ============================================================================
// STANDBY / OVERWATCH TRIGGER RESOLUTION
// ============================================================================

/**
 * After a figure moves, check if any enemy figures with standby tokens can
 * interrupt with an attack. Each standby figure gets one free attack if:
 * - The mover is within their standby weapon's max range
 * - They have line of sight to the mover's final position
 * - They are not defeated
 * - Their standby has not been cancelled by suppression
 *
 * After triggering, the standby token is consumed (hasStandby = false).
 * Only the first eligible standby figure triggers (to prevent chain-stacking).
 */
export function resolveStandbyTriggers(
  mover: Figure,
  gameState: GameState,
  gameData: GameData,
): GameState {
  let state = { ...gameState, figures: [...gameState.figures] };

  for (let i = 0; i < state.figures.length; i++) {
    const watcher = state.figures[i];

    // Skip non-standby figures, allies, defeated, or self
    if (!watcher.hasStandby) continue;
    if (watcher.isDefeated) continue;
    if (watcher.playerId === mover.playerId) continue;
    if (!watcher.standbyWeaponId) continue;

    // Suppression cancels standby
    if (watcher.courage > 0 && watcher.suppressionTokens >= watcher.courage) {
      state.figures[i] = { ...watcher, hasStandby: false, standbyWeaponId: null };
      continue;
    }

    // Resolve the weapon to check range
    const weaponRange = getStandbyWeaponRange(watcher, state);
    if (weaponRange === null) continue;

    const maxTiles = RANGE_BAND_TILES[weaponRange]?.max ?? 4;
    const dist = getDistance(watcher.position, mover.position);
    if (dist > maxTiles) continue;

    // Check LOS
    if (!hasLineOfSight(watcher.position, mover.position, state.map)) continue;

    // Trigger standby attack
    const cover = getCoverBetween(watcher.position, mover.position, state);
    const elevationDiff = getElevationDiff(watcher.position, mover.position, state);

    const scenario = createCombatScenarioV2(
      watcher,
      mover,
      watcher.standbyWeaponId,
      cover,
      elevationDiff,
      true, // LOS already verified
    );

    const resolution = resolveCombatV2(scenario, state, gameData);
    state = applyCombatResult(state, scenario, resolution);

    // Consume the standby token
    const watcherIdx = state.figures.findIndex(f => f.id === watcher.id);
    if (watcherIdx !== -1) {
      state.figures[watcherIdx] = {
        ...state.figures[watcherIdx],
        hasStandby: false,
        standbyWeaponId: null,
      };
    }

    // Only allow one standby trigger per move (prevent overwhelming the mover)
    break;
  }

  return state;
}

/**
 * Get the range band of a standby figure's weapon.
 */
function getStandbyWeaponRange(
  figure: Figure,
  gameState: GameState,
): RangeBand | null {
  if (!figure.standbyWeaponId) return null;

  if (figure.entityType === 'npc') {
    const npc = gameState.npcProfiles[figure.entityId];
    const wpn = npc?.weapons?.find(w => w.weaponId === figure.standbyWeaponId);
    return wpn?.range ?? null;
  }

  // Hero: look up from gameData weapons registry (not available here)
  // For heroes, default to Medium range as fallback
  return 'Medium';
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

/**
 * Execute a v2 game action and return updated state.
 * Handles all v2 action types from the GameAction discriminated union.
 *
 * Action economy:
 * - Actions (Attack, Aim, Rally, GuardedStance, UseSkill, UseTalent) consume actionsRemaining
 * - Maneuvers (Move, TakeCover, StandUp, DrawHolster, Interact, AimManeuver) consume maneuversRemaining
 * - StrainForManeuver: special, consumes 2 strain to grant +1 maneuver
 */
export function executeActionV2(
  gameState: GameState,
  action: GameAction,
  gameData: GameData,
): GameState {
  const figure = gameState.figures.find(f => f.id === action.figureId);
  if (!figure) return gameState;

  let newState = { ...gameState, figures: [...gameState.figures] };
  const figIdx = newState.figures.findIndex(f => f.id === action.figureId);

  switch (action.type) {
    // ---- MANEUVERS (consume maneuversRemaining) ----
    case 'Move': {
      const { path } = action.payload;
      newState = moveFigure(figure, path, newState);
      // Decrement maneuversRemaining and set move tracking flag
      const movedFigIdx = newState.figures.findIndex(f => f.id === figure.id);
      if (movedFigIdx !== -1) {
        newState.figures[movedFigIdx] = {
          ...newState.figures[movedFigIdx],
          maneuversRemaining: Math.max(0, newState.figures[movedFigIdx].maneuversRemaining - 1),
          hasMovedThisActivation: true,
        };
      }

      // Standby trigger: check if any enemy figures with standby can see the mover
      const mover = newState.figures.find(f => f.id === figure.id);
      if (mover && !mover.isDefeated) {
        newState = resolveStandbyTriggers(mover, newState, gameData);
      }
      break;
    }

    case 'TakeCover': {
      // Add cover benefit -- mechanical implementation depends on terrain
      // For now, just consume the maneuver
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
      };
      break;
    }

    case 'StandUp': {
      // Remove Prone condition
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        conditions: figure.conditions.filter(c => c !== 'Prone'),
        maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
      };
      break;
    }

    case 'DrawHolster': {
      // Weapon swap -- tracked by caller, just consume maneuver
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
      };
      break;
    }

    case 'Interact': {
      // Generic interact -- consume maneuver
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
      };
      break;
    }

    case 'CollectLoot': {
      // Collect a loot token at the figure's position -- consume maneuver
      const { lootTokenId } = action.payload;
      if (!newState.lootCollected.includes(lootTokenId)) {
        newState.lootCollected = [...newState.lootCollected, lootTokenId];
      }
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
      };
      break;
    }

    case 'InteractTerminal': {
      // Interact with an objective point on the map.
      // If an ObjectivePoint exists, requires a skill check (consumes Action).
      // Legacy behavior (no ObjectivePoint): auto-succeed, consume Maneuver.
      const { terminalId } = action.payload;
      const objPoint = newState.objectivePoints.find(op => op.id === terminalId);

      if (objPoint && !objPoint.isCompleted && figure.entityType === 'hero') {
        // Skill-check path: resolve check, consume Action
        const hero = newState.heroes[figure.entityId];
        if (hero) {
          // Pick best skill: primary or alternate (whichever hero has higher rank)
          let skillToUse = objPoint.skillRequired;
          if (objPoint.alternateSkill) {
            const primaryRank = hero.skills[objPoint.skillRequired] ?? 0;
            const altRank = hero.skills[objPoint.alternateSkill] ?? 0;
            if (altRank > primaryRank) {
              skillToUse = objPoint.alternateSkill;
            }
          }

          const checkResult = resolveSkillCheck(hero, skillToUse, objPoint.difficulty, undefined, figure.isWounded);

          if (checkResult.isSuccess) {
            newState.objectivePoints = newState.objectivePoints.map(op =>
              op.id === terminalId ? { ...op, isCompleted: true } : op
            );
            if (!newState.interactedTerminals.includes(terminalId)) {
              newState.interactedTerminals = [...newState.interactedTerminals, terminalId];
            }
          }
          // Failure: action consumed but objective not completed
        }

        // Skill checks consume an Action
        newState.figures[figIdx] = {
          ...newState.figures[figIdx],
          actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
        };
      } else if (!objPoint) {
        // Legacy path: no objective point, auto-succeed, consume Maneuver
        if (!newState.interactedTerminals.includes(terminalId)) {
          newState.interactedTerminals = [...newState.interactedTerminals, terminalId];
        }
        newState.figures[figIdx] = {
          ...newState.figures[figIdx],
          maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
        };
      } else {
        // Already completed or non-hero: consume maneuver, no effect
        newState.figures[figIdx] = {
          ...newState.figures[figIdx],
          maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
        };
      }
      break;
    }

    case 'AimManeuver': {
      // Aim as maneuver: gain 1 aim token (max 2), costs maneuver instead of action
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        maneuversRemaining: Math.max(0, figure.maneuversRemaining - 1),
        aimTokens: Math.min(2, figure.aimTokens + 1),
      };
      break;
    }

    // ---- ACTIONS (consume actionsRemaining) ----
    case 'Attack': {
      const { targetId, weaponId } = action.payload;

      // Cumbersome keyword: cannot attack if a Move maneuver was performed this activation
      const currentFig = newState.figures[figIdx];
      if (currentFig.hasMovedThisActivation && hasKeyword(currentFig, 'Cumbersome', newState)) {
        // Cumbersome blocks the attack -- consume action but no combat
        newState.figures[figIdx] = {
          ...currentFig,
          actionsRemaining: Math.max(0, currentFig.actionsRemaining - 1),
          hasAttackedThisActivation: true,
        };
        break;
      }

      const defender = newState.figures.find(f => f.id === targetId);

      if (defender && !defender.isDefeated) {
        // Determine cover and elevation
        const cover = getCoverBetween(figure.position, defender.position, newState);
        const elevationDiff = getElevationDiff(figure.position, defender.position, newState);

        const scenario = createCombatScenarioV2(
          figure,
          defender,
          weaponId,
          cover,
          elevationDiff,
          true, // LOS already verified by AI or caller
        );

        const resolution = resolveCombatV2(scenario, newState, gameData);
        newState = applyCombatResult(newState, scenario, resolution);
      } else if (defender && defender.isDefeated) {
        // Target already dead; attempt retarget
        const retarget = newState.figures.find(f =>
          !f.isDefeated && f.playerId !== figure.playerId
        );
        if (retarget) {
          const dist = getDistance(figure.position, retarget.position);
          if (dist <= 8 && hasLineOfSight(figure.position, retarget.position, newState.map)) {
            const cover = getCoverBetween(figure.position, retarget.position, newState);
            const elevationDiff = getElevationDiff(figure.position, retarget.position, newState);
            const scenario = createCombatScenarioV2(
              figure, retarget, weaponId, cover, elevationDiff, true,
            );
            const resolution = resolveCombatV2(scenario, newState, gameData);
            newState = applyCombatResult(newState, scenario, resolution);
          }
        }
      }

      // Decrement actionsRemaining and set attack tracking flag
      const atkFigIdx = newState.figures.findIndex(f => f.id === figure.id);
      if (atkFigIdx !== -1) {
        const atkFig = newState.figures[atkFigIdx];
        newState.figures[atkFigIdx] = {
          ...atkFig,
          actionsRemaining: Math.max(0, atkFig.actionsRemaining - 1),
          hasAttackedThisActivation: true,
        };

        // Relentless keyword: gain a free Move maneuver after attacking
        // (only if the figure hasn't already moved this activation)
        if (!atkFig.hasMovedThisActivation && hasKeyword(atkFig, 'Relentless', newState)) {
          newState.figures[atkFigIdx] = {
            ...newState.figures[atkFigIdx],
            maneuversRemaining: newState.figures[atkFigIdx].maneuversRemaining + 1,
          };
        }
      }
      break;
    }

    case 'Aim': {
      // Aim action: gain 1 aim token (max 2). Each token adds +1 Ability die to next attack.
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
        aimTokens: Math.min(2, figure.aimTokens + 1),
      };
      break;
    }

    case 'Dodge': {
      // Dodge action: gain 1 dodge token (max 1). Cancels 1 net success when hit.
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
        dodgeTokens: Math.min(1, figure.dodgeTokens + 1),
      };
      break;
    }

    case 'Rally': {
      // Rally: recover strain equal to Presence (or 1 for NPCs)
      let strainRecovery = getStrainRecovery(figure, newState);
      // Species bonus strain recovery (e.g., Human Adaptable: +1)
      if (figure.entityType === 'hero') {
        const hero = newState.heroes[figure.entityId];
        if (hero) {
          strainRecovery += getSpeciesBonusStrainRecovery(hero, gameData);
        }
      }
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        strainCurrent: Math.max(0, figure.strainCurrent - strainRecovery),
        actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
      };
      break;
    }

    case 'GuardedStance': {
      // Standby/Overwatch: set standby token. When an enemy moves within LOS+range,
      // this figure can interrupt with a free attack. Token consumed after trigger
      // or cleared at next activation. Suppression >= courage cancels standby.
      const isSuppressed = figure.courage > 0 && figure.suppressionTokens >= figure.courage;

      // Resolve standby weapon: pick first ranged weapon for NPC, or first weapon for hero
      let standbyWpnId: string | null = null;
      if (figure.entityType === 'npc') {
        const npcEntity = newState.npcProfiles[figure.entityId];
        if (npcEntity?.weapons?.length) {
          const rangedWpn = npcEntity.weapons.find(w => w.range !== 'Engaged');
          standbyWpnId = (rangedWpn ?? npcEntity.weapons[0]).weaponId;
        }
      } else {
        const heroEntity = newState.heroes[figure.entityId];
        if (heroEntity?.equipment?.weapons?.length) {
          standbyWpnId = heroEntity.equipment.weapons[0];
        }
      }

      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
        hasStandby: !isSuppressed && standbyWpnId !== null,
        standbyWeaponId: !isSuppressed ? standbyWpnId : null,
      };
      break;
    }

    case 'UseSkill': {
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
      };
      break;
    }

    case 'UseTalent': {
      const talentResult = executeActiveTalent(
        figure,
        action.payload.talentId,
        newState,
        gameData,
        action.payload.targetId,
      );
      if (talentResult.success) {
        newState = talentResult.gameState;

        // Post-execution: handle combat-resolving talents
        const effectType = talentResult.talentCard?.mechanicalEffect.type;

        if (effectType === 'area_attack') {
          newState = resolveAreaAttack(
            talentResult.figure,
            talentResult.talentCard!,
            newState,
            gameData,
            action.payload.weaponId,
            action.payload.areaTargetIds,
          );
        } else if (effectType === 'impose_condition') {
          newState = resolveSuppressingFire(
            talentResult.figure,
            talentResult.talentCard!,
            newState,
            gameData,
            action.payload.weaponId,
            action.payload.areaTargetIds,
          );
        }
      } else {
        // Fallback: just consume action slot (preserves v1 behavior)
        newState.figures[figIdx] = {
          ...newState.figures[figIdx],
          actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
        };
      }
      break;
    }

    case 'UseConsumable': {
      // Use a consumable item (stim pack, repair patch, etc.) on self or adjacent ally.
      // Costs 1 Action. Healing consumables have diminishing returns per figure per encounter.
      const { itemId, targetId } = action.payload as { itemId: string; targetId?: string };
      const consumable: ConsumableItem | undefined = gameData?.consumables?.[itemId];

      if (!consumable) break;

      // Validate inventory (Operative side only -- Imperial NPCs have unlimited consumables)
      const consumePlayer = newState.players.find(p => p.id === figure.playerId);
      if (consumePlayer?.role === 'Operative' && newState.consumableInventory) {
        const available = newState.consumableInventory[itemId] ?? 0;
        if (available <= 0) break;
      }

      // Determine target (self if no targetId)
      const targetFigureId = targetId ?? figure.id;
      const targetIdx = newState.figures.findIndex(f => f.id === targetFigureId);
      if (targetIdx < 0) break;
      const targetFigure = newState.figures[targetIdx];

      // Validate creature type compatibility
      if (consumable.targetType !== 'any') {
        const targetCreatureType = getCreatureType(targetFigure, newState);
        if (targetCreatureType !== consumable.targetType) break;
      }

      // Validate adjacency for non-self targets
      if (targetFigureId !== figure.id) {
        const dist = Math.abs(figure.position.x - targetFigure.position.x)
                   + Math.abs(figure.position.y - targetFigure.position.y);
        if (dist > 1) break; // must be adjacent
      }

      // Calculate effect with diminishing returns
      const priorUses = targetFigure.consumableUsesThisEncounter?.[itemId] ?? 0;
      const effectValue = consumable.diminishingReturns
        ? computeDiminishedHealing(consumable.baseValue, priorUses)
        : consumable.baseValue;

      // Apply effect
      const updatedTarget = { ...newState.figures[targetIdx] };

      if (consumable.effect === 'heal_wounds') {
        // Heal wounds (cannot exceed wound threshold)
        const hero = newState.heroes[updatedTarget.entityId];
        const maxWounds = hero?.wounds?.threshold ?? 10;
        updatedTarget.woundsCurrent = Math.max(0, updatedTarget.woundsCurrent - effectValue);
        // Track diminishing returns
        updatedTarget.consumableUsesThisEncounter = {
          ...updatedTarget.consumableUsesThisEncounter,
          [itemId]: priorUses + 1,
        };
      } else if (consumable.effect === 'recover_strain') {
        updatedTarget.strainCurrent = Math.max(0, updatedTarget.strainCurrent - effectValue);
        if (consumable.diminishingReturns) {
          updatedTarget.consumableUsesThisEncounter = {
            ...updatedTarget.consumableUsesThisEncounter,
            [itemId]: priorUses + 1,
          };
        }
      }

      newState.figures[targetIdx] = updatedTarget;

      // Deplete from inventory (Operative side)
      if (consumePlayer?.role === 'Operative' && newState.consumableInventory) {
        const currentCount = newState.consumableInventory[itemId] ?? 0;
        newState = {
          ...newState,
          consumableInventory: {
            ...newState.consumableInventory,
            [itemId]: Math.max(0, currentCount - 1),
          },
        };
      }

      // Consume action
      newState.figures[figIdx] = {
        ...newState.figures[figIdx],
        actionsRemaining: Math.max(0, figure.actionsRemaining - 1),
      };
      break;
    }

    // ---- SPECIAL ----
    case 'StrainForManeuver': {
      // Suffer 2 strain, gain +1 maneuver (once per activation)
      if (!figure.hasUsedStrainForManeuver) {
        newState.figures[figIdx] = {
          ...newState.figures[figIdx],
          strainCurrent: figure.strainCurrent + 2,
          maneuversRemaining: figure.maneuversRemaining + 1,
          hasUsedStrainForManeuver: true,
        };
      }
      break;
    }

    default:
      break;
  }

  return newState;
}

// ============================================================================
// AREA TALENT RESOLUTION
// ============================================================================

/**
 * Resolve a Rain of Fire (area_attack) talent.
 *
 * Mechanic: The attacker performs a single ranged attack against all enemies
 * within `areaRange` of the attacker (or of a chosen target point, simplified
 * to figures near the attacker for grid mode). Each target gets a separate
 * combat resolution using the attacker's weapon.
 *
 * If `areaTargetIds` is provided, those figures are targeted.
 * Otherwise, auto-detect all enemies within areaRange tiles of the attacker.
 */
function resolveAreaAttack(
  attackerFig: Figure,
  talentCard: import('./types.js').TalentCard,
  gameState: GameState,
  gameData: GameData,
  weaponId?: string,
  areaTargetIds?: string[],
): GameState {
  const eff = talentCard.mechanicalEffect;
  const areaRange = (eff.areaRange as RangeBand) ?? 'Short';
  const maxTileRange = RANGE_BAND_TILES[areaRange]?.max ?? 4;

  // Determine weapon
  const resolvedWeaponId = weaponId ?? resolveWeaponIdForFigure(attackerFig, gameState, gameData);
  if (!resolvedWeaponId) return gameState;

  // Find target figures
  let targets: Figure[];
  if (areaTargetIds && areaTargetIds.length > 0) {
    targets = gameState.figures.filter(f =>
      areaTargetIds.includes(f.id) && !f.isDefeated,
    );
  } else {
    // Auto-detect: all enemies within areaRange of attacker
    targets = gameState.figures.filter(f =>
      !f.isDefeated &&
      f.playerId !== attackerFig.playerId &&
      getDistance(attackerFig.position, f.position) <= maxTileRange &&
      hasLineOfSight(attackerFig.position, f.position, gameState.map),
    );
  }

  // Resolve combat against each target separately
  let state = gameState;
  for (const target of targets) {
    // Re-fetch the attacker from current state (may have gained conditions from threats)
    const currentAttacker = state.figures.find(f => f.id === attackerFig.id);
    if (!currentAttacker || currentAttacker.isDefeated) break;

    const cover = getCoverBetween(currentAttacker.position, target.position, state);
    const elevationDiff = getElevationDiff(currentAttacker.position, target.position, state);

    const scenario = createCombatScenarioV2(
      currentAttacker,
      target,
      resolvedWeaponId,
      cover,
      elevationDiff,
      true,
    );

    const resolution = resolveCombatV2(scenario, state, gameData);
    state = applyCombatResult(state, scenario, resolution);
  }

  return state;
}

/**
 * Resolve a Suppressing Fire (impose_condition) talent.
 *
 * Mechanic: The attacker makes a Ranged (Heavy) check against a base difficulty.
 * If the check succeeds, all targets within areaRange gain the specified condition
 * (Suppressed). No damage is dealt.
 *
 * Simplified resist check: each target's Discipline rank reduces the chance,
 * but for v2 we apply the condition to all targets in range when the initial
 * check succeeds (individual Discipline resist is deferred to Phase 7c AI awareness).
 */
function resolveSuppressingFire(
  attackerFig: Figure,
  talentCard: import('./types.js').TalentCard,
  gameState: GameState,
  gameData: GameData,
  weaponId?: string,
  areaTargetIds?: string[],
): GameState {
  const eff = talentCard.mechanicalEffect;
  const areaRange = (eff.areaRange as RangeBand) ?? 'Short';
  const maxTileRange = RANGE_BAND_TILES[areaRange]?.max ?? 4;

  // Find target figures
  let targets: Figure[];
  if (areaTargetIds && areaTargetIds.length > 0) {
    targets = gameState.figures.filter(f =>
      areaTargetIds.includes(f.id) && !f.isDefeated,
    );
  } else {
    targets = gameState.figures.filter(f =>
      !f.isDefeated &&
      f.playerId !== attackerFig.playerId &&
      getDistance(attackerFig.position, f.position) <= maxTileRange &&
      hasLineOfSight(attackerFig.position, f.position, gameState.map),
    );
  }

  if (targets.length === 0) return gameState;

  // Attacker makes a ranged check against base difficulty (2 purple dice)
  const attackerEntity = getAttackerEntity(attackerFig, gameState);
  if (!attackerEntity) return gameState;

  let attackPool;
  if ('attackPool' in attackerEntity) {
    // NPC
    attackPool = { ...attackerEntity.attackPool };
  } else {
    // Hero: use Ranged (Heavy) or weapon skill
    const agility = attackerEntity.characteristics.agility;
    const skillRank = attackerEntity.skills['Ranged (Heavy)']
      ?? attackerEntity.skills['ranged-heavy']
      ?? 0;
    attackPool = buildAttackPool(agility, skillRank);
  }

  const defensePool = buildDefensePool(2, 0); // base difficulty of Average (2 purple)

  const attackRolls = rollAttackPool(attackPool);
  const defenseRolls = rollDefensePool(defensePool);
  const rollResult = resolveFromRolls(attackRolls, defenseRolls);

  if (!rollResult.isHit) {
    // Check failed; no conditions applied
    return gameState;
  }

  // Apply suppression tokens to all targets (graduated suppression)
  const newFigures = gameState.figures.map(f => {
    if (targets.some(t => t.id === f.id)) {
      return {
        ...f,
        suppressionTokens: f.suppressionTokens + 1,
      };
    }
    return f;
  });

  return { ...gameState, figures: newFigures };
}

/**
 * Resolve the weapon ID for a figure.
 * Hero: uses primary weapon. NPC: uses first weapon from profile.
 */
function resolveWeaponIdForFigure(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): string | null {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    return hero?.equipment.primaryWeapon ?? null;
  }
  const npc = gameState.npcProfiles[figure.entityId]
    ?? gameData.npcProfiles[figure.entityId];
  if (npc && npc.weapons.length > 0) {
    return npc.weapons[0].weaponId;
  }
  return null;
}

/**
 * Get the entity backing a figure (hero or NPC).
 */
function getAttackerEntity(
  figure: Figure,
  gameState: GameState,
): HeroCharacter | NPCProfile | null {
  if (figure.entityType === 'hero') {
    return gameState.heroes[figure.entityId] ?? null;
  }
  return gameState.npcProfiles[figure.entityId] ?? null;
}

// ============================================================================
// HELPERS
// ============================================================================

function getCoverBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gameState: GameState,
): CoverType {
  try {
    return getCover(from, to, gameState.map);
  } catch {
    return 'None';
  }
}

function getElevationDiff(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gameState: GameState,
): number {
  const fromTile = gameState.map.tiles[from.y]?.[from.x];
  const toTile = gameState.map.tiles[to.y]?.[to.x];
  if (!fromTile || !toTile) return 0;
  return fromTile.elevation - toTile.elevation;
}

function getStrainRecovery(figure: Figure, gameState: GameState): number {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    if (hero) return hero.characteristics.presence;
  }
  return 1; // NPCs recover 1 strain
}

/**
 * Determine creature type for a figure.
 * Heroes: look up species creatureType from gameData.
 * NPCs: default to 'organic' unless profile specifies otherwise.
 */
function getCreatureType(figure: Figure, gameState: GameState): 'organic' | 'droid' {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    if (hero?.species === 'droid') return 'droid';
  }
  // NPCs: check if the entityId contains 'droid' as a simple heuristic
  if (figure.entityId.includes('droid')) return 'droid';
  return 'organic';
}

// ============================================================================
// VICTORY CHECK (same logic as v1 but using v2 types)
// ============================================================================

export function checkVictoryV2(
  gameState: GameState,
  mission: Mission,
): { winner: Side | null; condition: string | null } {
  for (const vc of mission.victoryConditions) {
    if (vc.condition === 'allEnemiesDefeated') {
      const imperialFigures = gameState.figures.filter(
        f =>
          !f.isDefeated &&
          gameState.players.find(p => p.id === f.playerId)?.role === 'Imperial'
      );
      const operativeFigures = gameState.figures.filter(
        f =>
          !f.isDefeated &&
          gameState.players.find(p => p.id === f.playerId)?.role === 'Operative'
      );

      if (imperialFigures.length === 0) {
        return { winner: 'Operative', condition: 'All Imperial units defeated' };
      }
      if (operativeFigures.length === 0) {
        return { winner: 'Imperial', condition: 'All Operative units defeated' };
      }
    }

    // Operative victory: win by completing enough objectives
    if (vc.condition === 'objectivesCompleted') {
      const totalObjectives = gameState.objectivePoints.length;
      if (totalObjectives > 0) {
        const completedCount = gameState.objectivePoints.filter(op => op.isCompleted).length;
        const threshold = vc.objectiveThreshold ?? totalObjectives; // default: all
        if (completedCount >= threshold) {
          return {
            winner: vc.side,
            condition: `Objectives completed (${completedCount}/${totalObjectives})`,
          };
        }
      }
    }

    // Imperial Assault victory: Imperial wins when all heroes are wounded
    if (vc.condition === 'allHeroesWounded') {
      const heroFigures = gameState.figures.filter(
        f => f.entityType === 'hero' && !f.isDefeated
      );
      if (heroFigures.length > 0 && heroFigures.every(f => f.isWounded)) {
        return { winner: vc.side, condition: 'All heroes wounded' };
      }
      // Also check if all heroes are fully defeated (stronger condition)
      const anyHeroAlive = gameState.figures.some(
        f => f.entityType === 'hero' && !f.isDefeated
      );
      if (!anyHeroAlive) {
        return { winner: vc.side, condition: 'All heroes defeated' };
      }
    }
  }

  // Round limit: Imperial wins if operatives haven't achieved their objective
  // This is core Imperial Assault design: heroes are on a clock
  if (gameState.roundNumber > mission.roundLimit) {
    return { winner: 'Imperial', condition: 'Round limit reached - mission failed' };
  }

  return { winner: null, condition: null };
}

// ============================================================================
// UTILITY: GET CURRENT FIGURE
// ============================================================================

export function getCurrentFigureV2(gameState: GameState): Figure | null {
  if (
    gameState.turnPhase !== 'Activation' ||
    gameState.currentActivationIndex >= gameState.activationOrder.length
  ) {
    return null;
  }
  const figureId = gameState.activationOrder[gameState.currentActivationIndex];
  return gameState.figures.find(f => f.id === figureId) ?? null;
}

/**
 * Get the name of a figure from its entity backing.
 */
export function getFigureName(figure: Figure, gameState: GameState): string {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    return hero?.name ?? figure.entityId;
  }
  const npc = gameState.npcProfiles[figure.entityId];
  return npc?.name ?? figure.entityId;
}

/**
 * Get the wound threshold for a figure.
 */
export function getWoundThresholdV2(figure: Figure, gameState: GameState): number {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    return hero?.wounds.threshold ?? 10;
  }
  const npc = gameState.npcProfiles[figure.entityId];
  return npc?.woundThreshold ?? 4;
}

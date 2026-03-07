/**
 * Exploration Token Engine
 *
 * TI4 Prophecy of Kings-inspired exploration system. Face-down tokens
 * are scattered across the map. When an Operative figure moves adjacent
 * to or onto a token, it is revealed for rewards, hazards, or narrative items.
 *
 * Token types include: supply caches, booby traps, intel fragments,
 * relic fragments, ambushes, abandoned gear, and medical caches.
 */

import type {
  ExplorationToken,
  ExplorationTokenType,
  ExplorationResultType,
  ExplorationRevealResult,
  ExplorationReward,
  RelicFragmentType,
  GridCoordinate,
  GameState,
  GameData,
  Figure,
  GameMap,
  Tile,
  Side,
  Player,
} from './types.js';

import type { RollFn } from './dice-v2.js';
import { defaultRollFn, buildAttackPool, rollAttackPool, rollDefensePool, buildDefensePool, resolveFromRolls } from './dice-v2.js';

// ============================================================================
// TOKEN PLACEMENT
// ============================================================================

/**
 * Generate exploration tokens for a map.
 * Places tokens on valid tiles (not walls, not occupied, not in deployment zones).
 * Token count scales with map size.
 */
export function generateExplorationTokens(
  map: GameMap,
  gameData: GameData,
  tokenCount?: number,
  rollFn: RollFn = defaultRollFn,
): ExplorationToken[] {
  const tokenTypes = gameData.explorationTokenTypes ?? {};
  const typeEntries = Object.values(tokenTypes);
  if (typeEntries.length === 0) return [];

  // Default token count: ~1 per 50 tiles, minimum 3
  const totalTiles = map.width * map.height;
  const count = tokenCount ?? Math.max(3, Math.floor(totalTiles / 50));

  // Find valid placement positions (open terrain, not deployment zones)
  const validPositions = getValidTokenPositions(map);
  if (validPositions.length === 0) return [];

  // Shuffle valid positions
  const shuffledPositions = shuffleArray([...validPositions], rollFn);

  // Build weighted pool for token type selection
  const weightedPool = buildWeightedPool(typeEntries);

  const tokens: ExplorationToken[] = [];
  for (let i = 0; i < count && i < shuffledPositions.length; i++) {
    const pos = shuffledPositions[i];
    const tokenType = selectFromWeightedPool(weightedPool, rollFn);

    tokens.push({
      id: `exploration-${i}`,
      position: pos,
      tokenTypeId: tokenType.id,
      isRevealed: false,
    });
  }

  return tokens;
}

/**
 * Get valid positions for token placement.
 * Excludes walls, impassable terrain, and the outer deployment rows.
 */
function getValidTokenPositions(map: GameMap): GridCoordinate[] {
  const positions: GridCoordinate[] = [];
  const deployDepth = Math.ceil(map.height * 0.15); // Avoid deployment zone edges

  for (let y = deployDepth; y < map.height - deployDepth; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y]?.[x];
      if (!tile) continue;
      if (tile.terrain === 'Wall' || tile.terrain === 'Impassable') continue;
      if (tile.occupied) continue;
      positions.push({ x, y });
    }
  }

  return positions;
}

/**
 * Build a weighted pool from token type definitions.
 */
function buildWeightedPool(types: ExplorationTokenType[]): { type: ExplorationTokenType; cumWeight: number }[] {
  let cumulative = 0;
  return types.map(type => {
    cumulative += type.weight;
    return { type, cumWeight: cumulative };
  });
}

/**
 * Select a token type from a weighted pool.
 */
function selectFromWeightedPool(
  pool: { type: ExplorationTokenType; cumWeight: number }[],
  rollFn: RollFn,
): ExplorationTokenType {
  if (pool.length === 0) throw new Error('Empty weighted pool');
  const totalWeight = pool[pool.length - 1].cumWeight;
  const roll = rollFn() * totalWeight;
  for (const entry of pool) {
    if (roll <= entry.cumWeight) return entry.type;
  }
  return pool[pool.length - 1].type;
}

function shuffleArray<T>(arr: T[], rollFn: RollFn): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rollFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// TOKEN DISCOVERY
// ============================================================================

/**
 * Check if a figure is adjacent to or on an unrevealed exploration token.
 * Returns the token IDs that can be revealed.
 */
export function getRevealableTokens(
  gameState: GameState,
  figureId: string,
): ExplorationToken[] {
  const figure = gameState.figures.find(f => f.id === figureId);
  if (!figure) return [];
  const figureSide = getSideForFigure(figure, gameState);
  if (figureSide !== 'Operative') return []; // Only Operatives explore

  const tokens = gameState.explorationTokens ?? [];
  return tokens.filter(token => {
    if (token.isRevealed) return false;
    const dx = Math.abs(token.position.x - figure.position.x);
    const dy = Math.abs(token.position.y - figure.position.y);
    return dx <= 1 && dy <= 1; // Adjacent or same tile (8-directional)
  });
}

/**
 * Reveal an exploration token and resolve its effects.
 * Returns the updated token with reveal result.
 */
export function revealExplorationToken(
  token: ExplorationToken,
  figure: Figure,
  gameData: GameData,
  rollFn: RollFn = defaultRollFn,
): ExplorationRevealResult {
  const tokenTypes = gameData.explorationTokenTypes ?? {};
  const tokenType = tokenTypes[token.tokenTypeId];

  if (!tokenType) {
    return {
      tokenTypeId: token.tokenTypeId,
      resultType: 'nothing',
      narrativeText: 'The token crumbles to dust. Nothing of value.',
      rewards: [],
    };
  }

  return resolveTokenType(tokenType, figure, rollFn);
}

/**
 * Resolve a specific token type into rewards.
 */
function resolveTokenType(
  tokenType: ExplorationTokenType,
  figure: Figure,
  rollFn: RollFn,
): ExplorationRevealResult {
  const rewards: ExplorationReward[] = [];
  let narrativeText = tokenType.description;
  let skillCheckResult: ExplorationRevealResult['skillCheckResult'];

  switch (tokenType.resultType) {
    case 'supply_cache':
      if (tokenType.consumableId) {
        rewards.push({ type: 'consumable', itemId: tokenType.consumableId, quantity: 1 });
        narrativeText = `Found a supply cache containing ${tokenType.name}.`;
      }
      break;

    case 'credits_stash':
      if (tokenType.creditsValue) {
        rewards.push({ type: 'credits', value: tokenType.creditsValue });
        narrativeText = `Discovered ${tokenType.creditsValue} credits hidden in a stash.`;
      }
      break;

    case 'booby_trap': {
      // Simple skill check: roll 2 green vs N purple
      const difficulty = tokenType.trapDifficulty ?? 2;
      const attackRolls = rollAttackPool({ ability: 2, proficiency: 0 }, rollFn);
      const defenseRolls = rollDefensePool({ difficulty, challenge: 0 }, rollFn);
      const result = resolveFromRolls(attackRolls, defenseRolls);

      skillCheckResult = {
        skill: tokenType.trapSkill ?? 'perception',
        isSuccess: result.isHit,
        netSuccesses: result.netSuccesses,
      };

      if (result.isHit) {
        narrativeText = `Detected and avoided a booby trap! (${tokenType.trapSkill ?? 'Perception'} check succeeded)`;
      } else {
        const damage = tokenType.trapDamage ?? 3;
        rewards.push({ type: 'damage', value: damage, avoidable: false });
        narrativeText = `Triggered a booby trap! Suffered ${damage} damage. (${tokenType.trapSkill ?? 'Perception'} check failed)`;
      }
      break;
    }

    case 'intel_fragment':
      if (tokenType.narrativeItemId) {
        rewards.push({ type: 'narrative_item', itemId: tokenType.narrativeItemId });
        narrativeText = `Discovered valuable intel: ${tokenType.name}.`;
      }
      break;

    case 'relic_fragment':
      if (tokenType.fragmentType) {
        rewards.push({ type: 'relic_fragment', fragmentType: tokenType.fragmentType });
        narrativeText = `Found a ${tokenType.fragmentType} relic fragment!`;
      }
      break;

    case 'ambush':
      // Ambush doesn't produce rewards -- it triggers NPC spawns handled by the turn machine
      narrativeText = `Ambush! Enemy forces emerge from hiding!`;
      break;

    case 'abandoned_gear':
      if (tokenType.gearItemId) {
        rewards.push({ type: 'equipment', itemId: tokenType.gearItemId });
        narrativeText = `Found abandoned equipment: ${tokenType.name}.`;
      }
      break;

    case 'medical_cache':
      if (tokenType.healValue) {
        rewards.push({ type: 'healing', value: tokenType.healValue });
        narrativeText = `Found a medical cache. Healed ${tokenType.healValue} wounds.`;
      }
      break;

    case 'nothing':
      narrativeText = 'Nothing of interest here.';
      break;
  }

  return {
    tokenTypeId: tokenType.id,
    resultType: tokenType.resultType,
    narrativeText,
    skillCheckResult,
    rewards,
  };
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Apply exploration token reveal to game state.
 * Marks the token as revealed and applies rewards.
 */
export function applyExplorationReveal(
  gameState: GameState,
  tokenId: string,
  result: ExplorationRevealResult,
): GameState {
  const tokens = (gameState.explorationTokens ?? []).map(t =>
    t.id === tokenId
      ? { ...t, isRevealed: true, revealResult: result }
      : t
  );

  let state: GameState = { ...gameState, explorationTokens: tokens };

  // Apply immediate rewards
  for (const reward of result.rewards) {
    switch (reward.type) {
      case 'credits':
        // Credits are tracked at campaign level, logged here
        break;
      case 'consumable':
        if (state.consumableInventory) {
          const inv = { ...state.consumableInventory };
          inv[reward.itemId] = (inv[reward.itemId] ?? 0) + reward.quantity;
          state = { ...state, consumableInventory: inv };
        }
        break;
      case 'healing': {
        // Find the figure that revealed this token and heal them
        const token = tokens.find(t => t.id === tokenId);
        if (token) {
          state = applyHealingReward(state, token, reward.value);
        }
        break;
      }
      case 'damage': {
        // Apply damage to the revealing figure
        const dmgToken = tokens.find(t => t.id === tokenId);
        if (dmgToken) {
          state = applyDamageReward(state, dmgToken, reward.value);
        }
        break;
      }
    }
  }

  return state;
}

/**
 * Apply healing from an exploration token to the nearest operative figure.
 */
function applyHealingReward(gameState: GameState, token: ExplorationToken, healValue: number): GameState {
  // Find the closest operative figure to the token
  const operatives = gameState.figures.filter(f => getSideForFigure(f, gameState) === 'Operative' && !f.isDefeated);
  if (operatives.length === 0) return gameState;

  let closest = operatives[0];
  let minDist = Infinity;
  for (const fig of operatives) {
    const dx = fig.position.x - token.position.x;
    const dy = fig.position.y - token.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      closest = fig;
    }
  }

  const figures = gameState.figures.map(f => {
    if (f.id !== closest.id) return f;
    const newWounds = Math.max(0, f.woundsCurrent - healValue);
    return { ...f, woundsCurrent: newWounds };
  });

  return { ...gameState, figures };
}

/**
 * Apply damage from a booby trap to the nearest operative figure.
 */
function applyDamageReward(gameState: GameState, token: ExplorationToken, damage: number): GameState {
  const operatives = gameState.figures.filter(f => getSideForFigure(f, gameState) === 'Operative' && !f.isDefeated);
  if (operatives.length === 0) return gameState;

  let closest = operatives[0];
  let minDist = Infinity;
  for (const fig of operatives) {
    const dx = fig.position.x - token.position.x;
    const dy = fig.position.y - token.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      closest = fig;
    }
  }

  const figures = gameState.figures.map(f => {
    if (f.id !== closest.id) return f;
    return { ...f, woundsCurrent: f.woundsCurrent + damage };
  });

  return { ...gameState, figures };
}

/**
 * Count unrevealed tokens remaining on the map.
 */
export function getUnrevealedTokenCount(gameState: GameState): number {
  return (gameState.explorationTokens ?? []).filter(t => !t.isRevealed).length;
}

/**
 * Get all exploration rewards collected during a mission (for post-mission summary).
 */
export function getCollectedRewards(gameState: GameState): ExplorationReward[] {
  const tokens = gameState.explorationTokens ?? [];
  return tokens
    .filter(t => t.isRevealed && t.revealResult)
    .flatMap(t => t.revealResult!.rewards);
}

/**
 * Derive the Side for a figure by looking up its player.
 */
function getSideForFigure(figure: Figure, gameState: GameState): Side | null {
  const player = gameState.players.find((p: Player) => p.id === figure.playerId);
  return player ? (player.role as Side) : null;
}

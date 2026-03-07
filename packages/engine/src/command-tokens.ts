/**
 * Command Token Engine
 *
 * TI4-inspired command token economy. Each round, the Operative side
 * receives a pool of command tokens that can be spent on enhanced
 * activations: coordinating heroes, granting bonus maneuvers, focus fire,
 * or defensive stances. The Commander career grants additional tokens.
 *
 * The Imperial AI also receives tokens scaled by threat level.
 */

import type {
  CommandTokenState,
  CommandTokenUsage,
  SpendCommandTokenPayload,
  GameState,
  HeroCharacter,
  Figure,
  Side,
  Player,
} from './types.js';

import { COMMAND_TOKEN_CONFIG } from './types.js';

// ============================================================================
// TOKEN POOL INITIALIZATION
// ============================================================================

/**
 * Initialize command token state for a mission.
 * Token count is based on hero count, Commander career bonuses, and threat level.
 */
export function initializeCommandTokens(
  heroes: Record<string, HeroCharacter>,
  threatLevel: number,
): CommandTokenState {
  const operativeMax = calculateOperativeTokens(heroes);
  const imperialMax = calculateImperialTokens(threatLevel);

  return {
    operativeTokens: operativeMax,
    imperialTokens: imperialMax,
    operativeMaxPerRound: operativeMax,
    imperialMaxPerRound: imperialMax,
    operativeSpentThisRound: 0,
    imperialSpentThisRound: 0,
  };
}

/**
 * Calculate operative tokens per round.
 */
export function calculateOperativeTokens(heroes: Record<string, HeroCharacter>): number {
  const config = COMMAND_TOKEN_CONFIG;
  const heroCount = Object.keys(heroes).length;

  let tokens = config.baseOperativeTokens;

  // Extra token per hero beyond first
  if (heroCount > 1) {
    tokens += (heroCount - 1) * config.tokensPerExtraHero;
  }

  // Commander career bonus
  for (const hero of Object.values(heroes)) {
    if (hero.career === 'commander') {
      tokens += config.commanderBonus;
    }
  }

  return tokens;
}

/**
 * Calculate imperial tokens per round based on threat level.
 */
export function calculateImperialTokens(threatLevel: number): number {
  const config = COMMAND_TOKEN_CONFIG;
  return config.baseImperialTokens + Math.floor(threatLevel / config.imperialTokensPerThreat);
}

// ============================================================================
// ROUND MANAGEMENT
// ============================================================================

/**
 * Refresh command tokens at the start of a new round.
 * Resets spent counters and restores to max.
 */
export function refreshCommandTokens(state: CommandTokenState): CommandTokenState {
  return {
    ...state,
    operativeTokens: state.operativeMaxPerRound,
    imperialTokens: state.imperialMaxPerRound,
    operativeSpentThisRound: 0,
    imperialSpentThisRound: 0,
  };
}

// ============================================================================
// TOKEN SPENDING
// ============================================================================

/**
 * Check if a side can spend a command token.
 */
export function canSpendToken(state: CommandTokenState, side: Side): boolean {
  return side === 'Operative'
    ? state.operativeTokens > 0
    : state.imperialTokens > 0;
}

/**
 * Spend a command token for a side.
 * Returns null if no tokens available.
 */
export function spendCommandToken(
  state: CommandTokenState,
  side: Side,
): CommandTokenState | null {
  if (!canSpendToken(state, side)) return null;

  if (side === 'Operative') {
    return {
      ...state,
      operativeTokens: state.operativeTokens - 1,
      operativeSpentThisRound: state.operativeSpentThisRound + 1,
    };
  } else {
    return {
      ...state,
      imperialTokens: state.imperialTokens - 1,
      imperialSpentThisRound: state.imperialSpentThisRound + 1,
    };
  }
}

/**
 * Validate whether a specific command token usage is allowed.
 */
export function validateTokenUsage(
  usage: CommandTokenUsage,
  payload: SpendCommandTokenPayload,
  gameState: GameState,
  figureId: string,
): { valid: boolean; reason?: string } {
  const tokens = gameState.commandTokens;
  if (!tokens) return { valid: false, reason: 'Command tokens not initialized' };

  const figure = gameState.figures.find(f => f.id === figureId);
  if (!figure) return { valid: false, reason: 'Figure not found' };

  const side = getSideForFigure(figure, gameState);
  if (!side) return { valid: false, reason: 'Cannot determine figure side' };
  if (!canSpendToken(tokens, side)) {
    return { valid: false, reason: 'No command tokens available' };
  }

  switch (usage) {
    case 'coordinate': {
      if (!payload.coordinateTargetId) {
        return { valid: false, reason: 'Coordinate requires a target hero ID' };
      }
      const target = gameState.figures.find(f => f.id === payload.coordinateTargetId);
      if (!target) return { valid: false, reason: 'Coordinate target not found' };
      const targetSide = getSideForFigure(target, gameState);
      if (targetSide !== side) return { valid: false, reason: 'Cannot coordinate with enemy' };
      return { valid: true };
    }
    case 'bonus_maneuver':
    case 'focus_fire':
    case 'defensive_stance':
      return { valid: true };
    case 'tactical_order':
      return { valid: true };
    default:
      return { valid: false, reason: `Unknown token usage: ${usage}` };
  }
}

/**
 * Apply the effect of a command token usage.
 * Returns a description of what happened for the action log.
 */
export function applyTokenEffect(
  gameState: GameState,
  side: Side,
  usage: CommandTokenUsage,
  payload: SpendCommandTokenPayload,
): { gameState: GameState; description: string } {
  const tokens = gameState.commandTokens;
  if (!tokens) return { gameState, description: 'No command tokens available' };

  const newTokens = spendCommandToken(tokens, side);
  if (!newTokens) return { gameState, description: 'No tokens to spend' };

  let description = '';
  let updatedState = { ...gameState, commandTokens: newTokens };

  switch (usage) {
    case 'coordinate':
      description = `Spent command token: coordinated activation with ${payload.coordinateTargetId}`;
      break;
    case 'bonus_maneuver':
      description = 'Spent command token: granted bonus maneuver';
      // The actual maneuver grant is handled by the turn machine
      break;
    case 'focus_fire':
      description = 'Spent command token: focus fire (+1 attack die on next attack)';
      break;
    case 'defensive_stance':
      description = 'Spent command token: defensive stance (+1 defense die to nearby allies)';
      break;
    case 'tactical_order':
      description = `Spent command token: tactical order ${payload.orderId ?? ''}`;
      break;
  }

  return { gameState: updatedState, description };
}

/**
 * Get the number of tokens remaining for a side.
 */
export function getTokensRemaining(state: CommandTokenState, side: Side): number {
  return side === 'Operative' ? state.operativeTokens : state.imperialTokens;
}

/**
 * Apply directive bonuses to command token maximums.
 */
export function applyDirectiveBonus(
  state: CommandTokenState,
  bonusTokens: number,
  side: Side,
): CommandTokenState {
  if (side === 'Operative') {
    return {
      ...state,
      operativeMaxPerRound: state.operativeMaxPerRound + bonusTokens,
      operativeTokens: state.operativeTokens + bonusTokens,
    };
  } else {
    return {
      ...state,
      imperialMaxPerRound: state.imperialMaxPerRound + bonusTokens,
      imperialTokens: state.imperialTokens + bonusTokens,
    };
  }
}

/**
 * Derive the Side for a figure by looking up its player.
 */
function getSideForFigure(figure: Figure, gameState: GameState): Side | null {
  const player = gameState.players.find((p: Player) => p.id === figure.playerId);
  return player ? (player.role as Side) : null;
}

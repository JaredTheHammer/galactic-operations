/**
 * AI System v2 - Action Builders
 *
 * Converts AI decisions (condition context) into concrete v2 GameAction objects
 * that the engine's executeAction() can process.
 *
 * Changes from v1 (actions.ts):
 * - v2 action economy: 1 Action + 1 Maneuver (Move is a Maneuver, Attack is an Action)
 * - Real weapon IDs instead of 'basic'
 * - getValidTargetsV2 replaces v1 getValidTargets
 * - No more Overwatch/Rest types; uses GuardedStance/Rally
 * - StrainForManeuver available for extra movement
 * - Imports from evaluate-v2 instead of evaluate
 */

import type {
  Figure,
  GameState,
  GameData,
  GameAction,
  GridCoordinate,
  BossHitLocationState,
} from '../types.js';

import { getPath, getValidMoves, getDistance } from '../movement.js';
import { hasLineOfSight } from '../los.js';

import type {
  ConditionContext,
  AIActionId,
  AIWeights,
} from './types.js';

import {
  scoreTargets,
  scoreMoveDestinations,
  findAttackPositions,
  findMeleePositions,
  getEnemies,
  getValidTargetsV2,
  getAttackPoolForFigure,
} from './evaluate-v2.js';

// ============================================================================
// WEAPON ID RESOLUTION
// ============================================================================

/**
 * Resolve the primary weapon ID for a figure.
 * NPCs: first weapon in their weapons array.
 * Heroes: primary weapon from equipment loadout.
 */
function getPrimaryWeaponId(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): string {
  if (figure.entityType === 'npc') {
    const npc = gameState.npcProfiles[figure.entityId];
    if (npc && npc.weapons.length > 0) {
      return npc.weapons[0].weaponId;
    }
  } else {
    const hero = gameState.heroes[figure.entityId];
    if (hero?.equipment.primaryWeapon) {
      return hero.equipment.primaryWeapon;
    }
  }
  return 'unarmed'; // fallback
}

/**
 * Build an AttackPayload with automatic boss hit location targeting.
 */
function buildAttackPayload(
  figure: Figure,
  targetId: string,
  gameState: GameState,
  gameData: GameData,
): { targetId: string; weaponId: string; targetLocationId?: string } {
  const weaponId = getPrimaryWeaponId(figure, gameState, gameData);
  const target = gameState.figures.find(f => f.id === targetId);
  const targetLocationId = target ? chooseBossHitLocation(target) : undefined;
  return { targetId, weaponId, ...(targetLocationId ? { targetLocationId } : {}) };
}

// ============================================================================
// ACTION ECONOMY HELPERS
// ============================================================================

/**
 * Check whether a figure can perform a Move (maneuver) + Attack (action) combo.
 * Requires at least 1 action remaining AND at least 1 maneuver remaining.
 */
function canMoveAndAttack(figure: Figure): boolean {
  return figure.actionsRemaining >= 1 && figure.maneuversRemaining >= 1;
}

/**
 * Check whether a figure can perform a Move + Move (two maneuvers).
 * The first move is free (maneuver slot); the second requires strain-for-maneuver
 * if not already used, and if the figure has enough strain headroom.
 */
function canDoubleMove(figure: Figure, gameState: GameState): boolean {
  if (figure.maneuversRemaining < 1) return false;
  // Second maneuver requires strain-for-maneuver (costs 2 strain)
  if (figure.hasUsedStrainForManeuver) return false;
  // Check strain headroom: need at least 2 strain capacity remaining
  // For simplicity, allow if figure isn't at strain limit
  return true;
}

/**
 * Check whether a figure can attack from current position (has action).
 */
function canAttack(figure: Figure): boolean {
  return figure.actionsRemaining >= 1;
}

// ============================================================================
// BASIC ACTION BUILDERS
// ============================================================================

/**
 * Build a Move GameAction (maneuver) to a destination.
 * Computes the path via A* and packages it into the engine's expected format.
 */
export function buildMoveAction(
  figure: Figure,
  destination: GridCoordinate,
  gameState: GameState,
): GameAction | null {
  const path = getPath(figure.position, destination, gameState.map, gameState.figures);
  if (path.length === 0) return null;

  return {
    type: 'Move',
    figureId: figure.id,
    payload: { path },
  };
}

/**
 * Build an Attack GameAction against a target using a real weapon ID.
 * Validates the target is in range and has LOS.
 */
export function buildAttackAction(
  figure: Figure,
  targetId: string,
  gameState: GameState,
  gameData: GameData,
  fromPosition?: GridCoordinate,
): GameAction | null {
  const pos = fromPosition ?? figure.position;
  const validTargets = getValidTargetsV2(figure, pos, gameState, gameData);
  if (!validTargets.includes(targetId)) return null;

  const weaponId = getPrimaryWeaponId(figure, gameState, gameData);

  // Boss hit location targeting: pick the best location to target
  const target = gameState.figures.find(f => f.id === targetId);
  const targetLocationId = target ? chooseBossHitLocation(target) : undefined;

  return {
    type: 'Attack',
    figureId: figure.id,
    payload: { targetId, weaponId, ...(targetLocationId ? { targetLocationId } : {}) },
  };
}

/**
 * Choose the best boss hit location to target.
 *
 * Priority:
 * 1. Locations with weapon-disabling effects (highest impact)
 * 2. Locations with attack reduction effects
 * 3. Locations closest to being disabled (fewest remaining wounds)
 * 4. Skip if all locations are already disabled
 *
 * Returns undefined for non-boss targets or if no locations are available.
 */
export function chooseBossHitLocation(target: Figure): string | undefined {
  if (!target.hitLocations || target.hitLocations.length === 0) return undefined;

  const active = target.hitLocations.filter(loc => !loc.isDisabled);
  if (active.length === 0) return undefined;

  // Score each active location
  const scored = active.map(loc => {
    let score = 0;
    const remaining = loc.woundCapacity - loc.woundsCurrent;

    // Bonus for locations close to being disabled (fewer remaining wounds = higher value)
    score += 10 / Math.max(1, remaining);

    // Bonus for high-impact disabled effects
    if (loc.disabledEffects) {
      if (loc.disabledEffects.disableWeapons?.length) score += 8;
      if (loc.disabledEffects.attackPoolPenalty) score += 5;
      if (loc.disabledEffects.soakReduction) score += 4;
      if (loc.disabledEffects.defensePoolPenalty) score += 3;
      if (loc.disabledEffects.speedReduction) score += 2;
      if (loc.disabledEffects.applyConditions?.length) score += 3;
    }

    return { id: loc.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}

/**
 * Build a Rally GameAction (recover strain, v2 replacement for v1 Rest).
 */
export function buildRallyAction(figureId: string): GameAction {
  return {
    type: 'Rally',
    figureId,
    payload: {},
  };
}

/**
 * Build a GuardedStance GameAction (v2 replacement for v1 Overwatch).
 * Provides defensive bonus until next activation.
 */
export function buildGuardedStanceAction(figureId: string): GameAction {
  return {
    type: 'GuardedStance',
    figureId,
    payload: {},
  };
}

/**
 * Build a TakeCover maneuver action.
 */
export function buildTakeCoverAction(figureId: string): GameAction {
  return {
    type: 'TakeCover',
    figureId,
    payload: {},
  };
}

/**
 * Build a StrainForManeuver action (spend 2 strain for an extra maneuver).
 */
export function buildStrainForManeuverAction(figureId: string): GameAction {
  return {
    type: 'StrainForManeuver',
    figureId,
    payload: {},
  };
}

/**
 * Build an Aim action (spend Action slot, gain +1 ability die on next attack).
 * Max 2 aim tokens per figure.
 */
export function buildAimAction(figureId: string): GameAction {
  return {
    type: 'Aim',
    figureId,
    payload: {},
  };
}

/**
 * Build a Dodge action (spend Action slot, gain dodge token to cancel 1 hit).
 * Max 1 dodge token per figure.
 */
export function buildDodgeAction(figureId: string): GameAction {
  return {
    type: 'Dodge',
    figureId,
    payload: {},
  };
}

// ============================================================================
// COMPOSITE ACTION BUILDER (dispatches by AIActionId)
// ============================================================================

/**
 * Build the complete set of GameActions for an AI action ID.
 * Returns an ordered sequence respecting v2 action economy:
 *   - Move consumes Maneuver slot
 *   - Attack/Rally/GuardedStance consumes Action slot
 *   - StrainForManeuver enables a second maneuver
 *
 * @returns Array of GameActions to execute in order, or empty if action cannot be built.
 */
export function buildActionsForAIAction(
  actionId: AIActionId,
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): GameAction[] {
  switch (actionId) {
    case 'attack-kill-target':
      return buildAttackKillTarget(figure, context, gameState, gameData, weights);

    case 'move-to-cover-then-attack':
      return buildMoveToCoverThenAttack(figure, context, gameState, gameData, weights);

    case 'attack-best-target':
      return buildAttackBestTarget(figure, context, gameState, gameData, weights);

    case 'advance-with-cover':
      return buildAdvanceWithCover(figure, context, gameState, gameData, weights);

    case 'retreat-to-cover':
      return buildRetreatToCover(figure, context, gameState, gameData, weights);

    case 'set-overwatch':
      return buildSetOverwatch(figure);

    case 'melee-charge':
      return buildMeleeCharge(figure, context, gameState, gameData, weights);

    case 'move-toward-enemy':
      return buildMoveTowardEnemy(figure, context, gameState, gameData, weights);

    case 'rest':
      return [buildRallyAction(figure.id)];

    case 'hold-position':
      return []; // Do nothing intentionally

    case 'use-second-wind':
      return buildUseSecondWind(figure, context, gameState, gameData, weights);

    case 'use-bought-time-advance':
      return buildUseBoughtTimeAdvance(figure, context, gameState, gameData, weights);

    case 'move-to-objective-interact':
      return buildMoveToObjectiveInteract(figure, context, gameState, gameData, weights);

    case 'aim-then-attack':
      return buildAimThenAttack(figure, context, gameState, gameData, weights);

    case 'dodge-and-hold':
      return buildDodgeAndHold(figure, context, gameState, gameData, weights);

    case 'use-consumable':
      return buildUseConsumable(figure, context);

    default:
      return [];
  }
}

// ============================================================================
// MOVEMENT HELPERS
// ============================================================================

/**
 * Create a hypothetical game state after a figure moves to a new position.
 * Used to compute valid second moves or attacks from the destination.
 *
 * v2: Move consumes maneuver slot, not action slot.
 */
function simulateMove(
  figure: Figure,
  newPosition: GridCoordinate,
  gameState: GameState,
): { figure: Figure; gameState: GameState } {
  const movedFigure: Figure = {
    ...figure,
    position: newPosition,
    maneuversRemaining: figure.maneuversRemaining - 1,
  };
  const updatedFigures = gameState.figures.map(f =>
    f.id === figure.id ? movedFigure : f,
  );
  return {
    figure: movedFigure,
    gameState: { ...gameState, figures: updatedFigures },
  };
}

/**
 * Simulate a strain-for-maneuver: spend 2 strain, regain a maneuver.
 */
function simulateStrainForManeuver(
  figure: Figure,
): Figure {
  return {
    ...figure,
    strainCurrent: figure.strainCurrent + 2,
    maneuversRemaining: figure.maneuversRemaining + 1,
    hasUsedStrainForManeuver: true,
  };
}

// ============================================================================
// SPECIFIC ACTION IMPLEMENTATIONS
// ============================================================================

/**
 * Attack a specific target we believe we can kill.
 * v2 economy: if target is in range, use Action to attack.
 * If not in range, use Maneuver to move, then Action to attack.
 */
function buildAttackKillTarget(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  const targetId = context.targetId;
  if (!targetId) return [];

  const validTargets = getValidTargetsV2(figure, figure.position, gameState, gameData);

  if (validTargets.includes(targetId)) {
    // Target already in range: just attack (Action)
    if (!canAttack(figure)) return [];
    const atk = buildAttackAction(figure, targetId, gameState, gameData);
    return atk ? [atk] : [];
  }

  // Need to move first: Maneuver (move) + Action (attack)
  if (!canMoveAndAttack(figure)) return [];

  if (context.attackPosition) {
    const move = buildMoveAction(figure, context.attackPosition, gameState);
    if (move) {
      const atk: GameAction = {
        type: 'Attack',
        figureId: figure.id,
        payload: buildAttackPayload(figure, targetId, gameState, gameData),
      };
      return [move, atk];
    }
  }

  return [];
}

/**
 * Move to a cover position (Maneuver) then attack the best available target (Action).
 * v2: requires 1 Maneuver + 1 Action.
 */
function buildMoveToCoverThenAttack(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  if (!context.attackPosition || !context.targetId) return [];
  if (!canMoveAndAttack(figure)) return [];

  const move = buildMoveAction(figure, context.attackPosition, gameState);
  if (!move) return [];

  const atk: GameAction = {
    type: 'Attack',
    figureId: figure.id,
    payload: buildAttackPayload(figure, context.targetId, gameState, gameData),
  };

  return [move, atk];
}

/**
 * Attack the best scoring target from current position.
 * v2: single Attack action. No double-attack (v2 has only 1 Action slot).
 */
function buildAttackBestTarget(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  const targetId = context.targetId;
  if (!targetId) return [];
  if (!canAttack(figure)) return [];

  const atk = buildAttackAction(figure, targetId, gameState, gameData);
  return atk ? [atk] : [];
}

/**
 * Move toward the nearest enemy, preferring cover tiles along the way.
 * For heroes with uncompleted objectives, biases toward objectives when far from enemies.
 *
 * v2 action economy: Use Maneuver to move. If we end up in range of an enemy
 * after moving, use Action to attack. Otherwise, consider strain-for-maneuver
 * for a second move, or use TakeCover if already near combat range.
 *
 * Anti-oscillation rules preserved from v1:
 * 1. When far from enemies (> 2x attack range), prioritize closing distance
 * 2. Second move MUST close distance relative to start
 */
function buildAdvanceWithCover(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): GameAction[] {
  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) return [];

  // For heroes: check if there are uncompleted objectives to bias toward
  let advanceTarget: { position: { x: number; y: number } } | null = null;
  if (figure.entityType === 'hero') {
    const incompleteObj = gameState.objectivePoints.filter(op => !op.isCompleted);
    if (incompleteObj.length > 0) {
      // Find nearest uncompleted objective
      let nearestObj = incompleteObj[0];
      let nearestObjDist = getDistance(figure.position, incompleteObj[0].position);
      for (const obj of incompleteObj) {
        const d = getDistance(figure.position, obj.position);
        if (d < nearestObjDist) {
          nearestObjDist = d;
          nearestObj = obj;
        }
      }
      // If nearer to an objective than to nearest enemy, bias toward objective
      const nearestEnemyDist = enemies.reduce(
        (min, e) => Math.min(min, getDistance(figure.position, e.position)), Infinity
      );
      if (nearestObjDist <= nearestEnemyDist || nearestEnemyDist > 8) {
        advanceTarget = { position: nearestObj.position };
      }
    }
  }

  // Find nearest enemy
  let nearestEnemy = enemies[0];
  let nearestDist = getDistance(figure.position, enemies[0].position);
  for (const e of enemies) {
    const d = getDistance(figure.position, e.position);
    if (d < nearestDist) {
      nearestDist = d;
      nearestEnemy = e;
    }
  }

  // Use objective as primary target if set, otherwise nearest enemy
  const primaryTarget = advanceTarget ?? nearestEnemy;

  // Use primary target for distance calculations (objective or enemy)
  const targetPos = primaryTarget.position;
  const startingDistToTarget = getDistance(figure.position, targetPos);
  const startingDist = nearestDist;
  const COMBAT_APPROACH_RANGE = 16; // 2x max attack range of 8

  if (figure.maneuversRemaining < 1) return [];

  const validMoves = getValidMoves(figure, gameState);
  if (validMoves.length === 0) return [];

  // When far from target, use approach-mode weights that heavily favor proximity
  const effectiveWeights = startingDistToTarget > COMBAT_APPROACH_RANGE
    ? { ...weights, coverValue: 1, proximity: 10 }
    : weights;

  const scored = scoreMoveDestinations(
    figure,
    validMoves,
    gameState,
    gameData,
    effectiveWeights,
    targetPos,
  );

  if (scored.length === 0) return [];

  // Pick the best destination that actually closes distance to target
  let dest = scored[0].coord;
  const destDist = getDistance(dest, targetPos);

  if (destDist >= startingDistToTarget) {
    const closerOptions = validMoves
      .map(c => ({ coord: c, dist: getDistance(c, targetPos) }))
      .filter(o => o.dist < startingDistToTarget)
      .sort((a, b) => a.dist - b.dist);

    if (closerOptions.length > 0) {
      dest = closerOptions[0].coord;
    }
  }

  const move = buildMoveAction(figure, dest, gameState);
  if (!move) return [];

  const actions: GameAction[] = [move];

  // After moving (Maneuver used), try to use the Action slot
  if (figure.actionsRemaining >= 1) {
    // Check if any enemy is now in range from the new position
    const validTargetsAfterMove = getValidTargetsV2(
      figure, dest, gameState, gameData,
    );

    if (validTargetsAfterMove.length > 0) {
      // Score targets and attack the best one
      actions.push({
        type: 'Attack',
        figureId: figure.id,
        payload: buildAttackPayload(figure, validTargetsAfterMove[0], gameState, gameData),
      });
    } else {
      // No enemy in range after move. Use action for something useful.
      // If we can strain-for-maneuver, do a second move to close distance faster
      if (!figure.hasUsedStrainForManeuver) {
        const afterStrainFig = simulateStrainForManeuver(figure);
        const { figure: movedFig, gameState: movedState } = simulateMove(
          { ...afterStrainFig, position: dest },
          dest,
          gameState,
        );
        // simulateMove consumed a maneuver, but we need the second maneuver
        // from strain. Just compute valid moves from dest with movedState.
        const fakeFigAtDest: Figure = {
          ...figure,
          position: dest,
          maneuversRemaining: 1, // gained from strain-for-maneuver
          hasUsedStrainForManeuver: true,
        };
        const validMoves2 = getValidMoves(fakeFigAtDest, movedState);

        if (validMoves2.length > 0) {
          // Second move must close distance (anti-oscillation)
          const forwardMoves = validMoves2.filter(c =>
            getDistance(c, nearestEnemy.position) < startingDist,
          );

          const candidates = forwardMoves.length > 0 ? forwardMoves : validMoves2;

          if (nearestDist > COMBAT_APPROACH_RANGE) {
            // Far: pure proximity pick
            const sorted = candidates
              .map(c => ({ coord: c, dist: getDistance(c, nearestEnemy.position) }))
              .sort((a, b) => a.dist - b.dist);

            if (sorted.length > 0 && sorted[0].dist < startingDist) {
              const move2 = buildMoveAction(fakeFigAtDest, sorted[0].coord, movedState);
              if (move2) {
                actions.push(buildStrainForManeuverAction(figure.id));
                actions.push(move2);
              }
            }
          } else {
            // Near: use full scoring on forward candidates
            const scored2 = scoreMoveDestinations(
              fakeFigAtDest, candidates, movedState, gameData, weights, nearestEnemy.position,
            );
            if (scored2.length > 0 && getDistance(scored2[0].coord, nearestEnemy.position) < startingDist) {
              const move2 = buildMoveAction(fakeFigAtDest, scored2[0].coord, movedState);
              if (move2) {
                actions.push(buildStrainForManeuverAction(figure.id));
                actions.push(move2);
              }
            }
          }
        }
      }
    }
  }

  return actions;
}

/**
 * Retreat to the best cover position (farthest from enemies).
 * v2: Move (Maneuver) + Rally (Action) to recover strain.
 */
function buildRetreatToCover(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  _gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  if (!context.destination) return [];
  if (figure.maneuversRemaining < 1) return [];

  const move = buildMoveAction(figure, context.destination, gameState);
  if (!move) return [];

  const actions: GameAction[] = [move];

  // Use Action to Rally (recover strain) if possible
  if (figure.actionsRemaining >= 1) {
    actions.push(buildRallyAction(figure.id));
  }

  return actions;
}

/**
 * Set overwatch / defensive stance in current position.
 * v2: GuardedStance (Action) - provides defensive bonus.
 */
function buildSetOverwatch(figure: Figure): GameAction[] {
  if (figure.actionsRemaining < 1) return [];
  return [buildGuardedStanceAction(figure.id)];
}

/**
 * Melee charge: Move adjacent to enemy (Maneuver) and attack (Action).
 * v2: requires 1 Maneuver + 1 Action if not already adjacent.
 */
function buildMeleeCharge(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  const targetId = context.targetId;
  if (!targetId) return [];

  const target = gameState.figures.find(f => f.id === targetId);
  if (!target) return [];

  // Already adjacent: just attack
  if (getDistance(figure.position, target.position) <= 1) {
    if (!canAttack(figure)) return [];
    const atk = buildAttackAction(figure, targetId, gameState, gameData);
    return atk ? [atk] : [];
  }

  // Need to move adjacent: Maneuver + Action
  if (!canMoveAndAttack(figure)) return [];

  const meleePositions = findMeleePositions(figure, target.position, gameState);
  if (meleePositions.length === 0) return [];

  // Pick closest melee position
  meleePositions.sort((a, b) =>
    getDistance(figure.position, a) - getDistance(figure.position, b),
  );

  const move = buildMoveAction(figure, meleePositions[0], gameState);
  if (!move) return [];

  return [
    move,
    {
      type: 'Attack',
      figureId: figure.id,
      payload: buildAttackPayload(figure, targetId, gameState, gameData),
    },
  ];
}

/**
 * Move as close as possible to the nearest enemy.
 * v2: Use Maneuver to move. If no attack possible, consider
 * strain-for-maneuver for a second move.
 */
function buildMoveTowardEnemy(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) return [];
  if (figure.maneuversRemaining < 1) return [];

  // Find nearest enemy
  let nearestEnemy = enemies[0];
  let nearestDist = Infinity;
  for (const e of enemies) {
    const d = getDistance(figure.position, e.position);
    if (d < nearestDist) {
      nearestDist = d;
      nearestEnemy = e;
    }
  }

  const validMoves = getValidMoves(figure, gameState);
  if (validMoves.length === 0) return [];

  // Pick the valid move closest to the enemy
  let bestMove = validMoves[0];
  let bestDist = getDistance(validMoves[0], nearestEnemy.position);
  for (const m of validMoves) {
    const d = getDistance(m, nearestEnemy.position);
    if (d < bestDist) {
      bestDist = d;
      bestMove = m;
    }
  }

  const move = buildMoveAction(figure, bestMove, gameState);
  if (!move) return [];

  const actions: GameAction[] = [move];

  // After first move, check if enemy is now in attack range
  const targetsAfterMove = getValidTargetsV2(figure, bestMove, gameState, gameData);
  if (targetsAfterMove.length > 0 && figure.actionsRemaining >= 1) {
    actions.push({
      type: 'Attack',
      figureId: figure.id,
      payload: buildAttackPayload(figure, targetsAfterMove[0], gameState, gameData),
    });
  } else if (!figure.hasUsedStrainForManeuver) {
    // No attack available: strain-for-maneuver for second move
    const { figure: movedFig, gameState: movedState } = simulateMove(figure, bestMove, gameState);
    const fakeFigAtDest: Figure = {
      ...figure,
      position: bestMove,
      maneuversRemaining: 1,
      hasUsedStrainForManeuver: true,
    };
    const validMoves2 = getValidMoves(fakeFigAtDest, movedState);

    if (validMoves2.length > 0) {
      let bestMove2 = validMoves2[0];
      let bestDist2 = getDistance(validMoves2[0], nearestEnemy.position);
      for (const m of validMoves2) {
        const d = getDistance(m, nearestEnemy.position);
        if (d < bestDist2) {
          bestDist2 = d;
          bestMove2 = m;
        }
      }
      const move2 = buildMoveAction(fakeFigAtDest, bestMove2, movedState);
      if (move2) {
        actions.push(buildStrainForManeuverAction(figure.id));
        actions.push(move2);
      }
    }
  }

  return actions;
}

// ============================================================================
// TALENT ACTION BUILDERS
// ============================================================================

/**
 * Build a UseTalent action for Second Wind (recover strain as incidental).
 * Second Wind is free (incidental), so the figure can still use its normal turn.
 * We emit the UseTalent action first, then the AI's normal best action.
 */
function buildUseSecondWind(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): GameAction[] {
  if (!context.talentId) return [];

  const useTalent: GameAction = {
    type: 'UseTalent',
    figureId: figure.id,
    payload: { talentId: context.talentId },
  };

  // Second Wind is an incidental, so the figure still has its Action + Maneuver.
  // Find the best follow-up: try attacking, then advancing.
  const actions: GameAction[] = [useTalent];

  const validTargets = getValidTargetsV2(figure, figure.position, gameState, gameData);
  if (validTargets.length > 0 && figure.actionsRemaining >= 1) {
    // Attack best target
    const scored = scoreTargets(figure, figure.position, gameState, gameData, weights);
    if (scored.length > 0) {
      const atk = buildAttackAction(figure, scored[0].figureId, gameState, gameData);
      if (atk) actions.push(atk);
    }
  } else if (figure.maneuversRemaining >= 1) {
    // No targets in range: move toward enemies
    const enemies = getEnemies(figure, gameState);
    if (enemies.length > 0) {
      let nearest = enemies[0];
      let nearestDist = Infinity;
      for (const e of enemies) {
        const d = getDistance(figure.position, e.position);
        if (d < nearestDist) { nearestDist = d; nearest = e; }
      }
      const validMoves = getValidMoves(figure, gameState);
      const sorted = validMoves
        .map(c => ({ coord: c, dist: getDistance(c, nearest.position) }))
        .sort((a, b) => a.dist - b.dist);
      if (sorted.length > 0) {
        const move = buildMoveAction(figure, sorted[0].coord, gameState);
        if (move) actions.push(move);
      }
    }
  }

  return actions;
}

/**
 * Build a UseTalent action for Bought Time (extra maneuver) + advance.
 * The figure uses Bought Time (incidental), then moves twice + attacks if possible.
 */
function buildUseBoughtTimeAdvance(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  if (!context.talentId) return [];

  const useTalent: GameAction = {
    type: 'UseTalent',
    figureId: figure.id,
    payload: { talentId: context.talentId },
  };

  const actions: GameAction[] = [useTalent];

  // After Bought Time, figure has an extra maneuver.
  // Strategy: Move (maneuver 1) + Move (maneuver 2 from Bought Time) + Attack if in range.
  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) return actions;

  let nearest = enemies[0];
  let nearestDist = Infinity;
  for (const e of enemies) {
    const d = getDistance(figure.position, e.position);
    if (d < nearestDist) { nearestDist = d; nearest = e; }
  }

  // First move (use normal maneuver)
  if (figure.maneuversRemaining >= 1) {
    const validMoves = getValidMoves(figure, gameState);
    const sorted = validMoves
      .map(c => ({ coord: c, dist: getDistance(c, nearest.position) }))
      .sort((a, b) => a.dist - b.dist);
    if (sorted.length > 0 && sorted[0].dist < nearestDist) {
      const move = buildMoveAction(figure, sorted[0].coord, gameState);
      if (move) {
        actions.push(move);

        // Second move (from Bought Time extra maneuver)
        const { figure: _movedFig, gameState: movedState } = simulateMove(
          figure, sorted[0].coord, gameState,
        );
        const fakeFig: Figure = {
          ...figure,
          position: sorted[0].coord,
          maneuversRemaining: 1, // extra maneuver from Bought Time
        };
        const validMoves2 = getValidMoves(fakeFig, movedState);
        const sorted2 = validMoves2
          .map(c => ({ coord: c, dist: getDistance(c, nearest.position) }))
          .sort((a, b) => a.dist - b.dist);
        if (sorted2.length > 0) {
          const move2 = buildMoveAction(fakeFig, sorted2[0].coord, movedState);
          if (move2) {
            actions.push(move2);

            // Check if enemy in range after second move
            if (figure.actionsRemaining >= 1) {
              const targetsAfterMove2 = getValidTargetsV2(
                figure, sorted2[0].coord, movedState, gameData,
              );
              if (targetsAfterMove2.length > 0) {
                actions.push({
                  type: 'Attack',
                  figureId: figure.id,
                  payload: buildAttackPayload(figure, targetsAfterMove2[0], gameState, gameData),
                });
              }
            }
          }
        }
      }
    }
  }

  return actions;
}

// ============================================================================
// OBJECTIVE INTERACTION BUILDER
// ============================================================================

/**
 * Build an InteractTerminal action for objective points.
 *
 * If the hero is already adjacent to the objective: just InteractTerminal (Action).
 * If the hero needs to move first: Move (Maneuver) + InteractTerminal (Action).
 *
 * The InteractTerminal action consumes the Action slot and triggers a skill check
 * in executeActionV2 (turn-machine-v2.ts).
 */
function buildMoveToObjectiveInteract(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  _gameData: GameData,
  _weights: AIWeights,
): GameAction[] {
  const objectiveId = context.objectivePointId;
  if (!objectiveId) return [];

  const objective = gameState.objectivePoints.find(op => op.id === objectiveId);
  if (!objective || objective.isCompleted) return [];

  const actions: GameAction[] = [];

  // Check if hero needs to move first
  const dist = getDistance(figure.position, objective.position);
  if (dist > 1 && context.destination) {
    // Need to move adjacent: Maneuver slot
    if (figure.maneuversRemaining < 1) return [];
    const move = buildMoveAction(figure, context.destination, gameState);
    if (!move) return [];
    actions.push(move);
  }

  // InteractTerminal: Action slot
  if (figure.actionsRemaining < 1) return [];
  actions.push({
    type: 'InteractTerminal',
    figureId: figure.id,
    payload: { terminalId: objectiveId },
  });

  return actions;
}

// ============================================================================
// AIM / DODGE COMPOSITE BUILDERS
// ============================================================================

/**
 * Aim then attack (or reposition).
 * Uses Action slot for Aim. Uses Maneuver to either:
 *   - Move toward nearest enemy if no targets in range
 *   - Reposition to better cover if targets already in range
 *
 * The aim token persists and will boost the next attack (this activation
 * or a future one if the figure ends turn after aiming).
 */
function buildAimThenAttack(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): GameAction[] {
  if (figure.actionsRemaining < 1) return [];
  if (figure.aimTokens >= 2) return [];

  const actions: GameAction[] = [buildAimAction(figure.id)];

  // Use maneuver slot for positioning
  if (figure.maneuversRemaining >= 1) {
    const validTargets = getValidTargetsV2(figure, figure.position, gameState, gameData);

    if (validTargets.length === 0) {
      // No targets in range: move toward nearest enemy
      const enemies = getEnemies(figure, gameState);
      if (enemies.length > 0) {
        let nearest = enemies[0];
        let nearestDist = Infinity;
        for (const e of enemies) {
          const d = getDistance(figure.position, e.position);
          if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        const validMoves = getValidMoves(figure, gameState);
        if (validMoves.length > 0) {
          // Pick move that closes distance, preferring cover
          const scored = scoreMoveDestinations(
            figure, validMoves, gameState, gameData, weights, nearest.position,
          );
          if (scored.length > 0) {
            const move = buildMoveAction(figure, scored[0].coord, gameState);
            if (move) actions.push(move);
          }
        }
      }
    } else {
      // Targets in range: optionally reposition to better cover
      const validMoves = getValidMoves(figure, gameState);
      if (validMoves.length > 0) {
        // Only move if it improves cover and maintains target access
        const coverWeights = { ...weights, coverValue: 10, proximity: 1 };
        const scored = scoreMoveDestinations(
          figure, validMoves, gameState, gameData, coverWeights,
          gameState.figures.find(f => f.id === validTargets[0])?.position,
        );
        if (scored.length > 0) {
          // Only reposition if the new spot still has targets in range
          const newTargets = getValidTargetsV2(figure, scored[0].coord, gameState, gameData);
          if (newTargets.length > 0 && scored[0].score > 0) {
            const move = buildMoveAction(figure, scored[0].coord, gameState);
            if (move) actions.push(move);
          }
        }
      }
    }
  }

  return actions;
}

/**
 * Dodge and hold position (or retreat to cover).
 * Uses Action slot for Dodge. Uses Maneuver to:
 *   - Move to cover position if context.destination is provided
 *   - Otherwise hold position (rely on dodge token for defense)
 */
function buildDodgeAndHold(
  figure: Figure,
  context: ConditionContext,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): GameAction[] {
  if (figure.actionsRemaining < 1) return [];
  if (figure.dodgeTokens >= 1) return [];

  const actions: GameAction[] = [buildDodgeAction(figure.id)];

  // Use maneuver slot for repositioning
  if (figure.maneuversRemaining >= 1) {
    if (context.destination) {
      // Retreat to the specified cover destination
      const move = buildMoveAction(figure, context.destination, gameState);
      if (move) actions.push(move);
    } else {
      // No explicit destination: try to find nearby cover
      const validMoves = getValidMoves(figure, gameState);
      if (validMoves.length > 0) {
        // Find nearby enemies to retreat from
        const enemies = getEnemies(figure, gameState);
        if (enemies.length > 0) {
          let nearest = enemies[0];
          let nearestDist = Infinity;
          for (const e of enemies) {
            const d = getDistance(figure.position, e.position);
            if (d < nearestDist) { nearestDist = d; nearest = e; }
          }
          // Score destinations favoring cover and distance from enemy
          const defenseWeights = {
            ...weights,
            coverValue: 10,
            selfPreservation: 8,
            proximity: -2, // negative = prefer distance from enemy
          };
          const scored = scoreMoveDestinations(
            figure, validMoves, gameState, gameData, defenseWeights, nearest.position,
          );
          if (scored.length > 0 && scored[0].score > 0) {
            const move = buildMoveAction(figure, scored[0].coord, gameState);
            if (move) actions.push(move);
          }
        }
      }
    }
  }

  return actions;
}

/**
 * Build a UseConsumable action from condition context.
 */
function buildUseConsumable(
  figure: Figure,
  context: ConditionContext,
): GameAction[] {
  if (!context.consumableId) return [];

  return [{
    type: 'UseConsumable' as const,
    figureId: figure.id,
    payload: {
      itemId: context.consumableId,
      targetId: context.consumableTargetId,
    },
  }];
}

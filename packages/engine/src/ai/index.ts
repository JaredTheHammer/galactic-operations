/**
 * AI System - Barrel Export
 *
 * All exports point to v2 modules. Legacy v1 modules have been removed.
 */

// Types
export type {
  AIPriorityRule,
  AIArchetypeProfile,
  AIProfilesData,
  AIConditionId,
  AIActionId,
  AIWeights,
  ConditionResult,
  ConditionContext,
  AIDecisionResult,
  AIScoreCard,
  RoundStats,
  GameSimulationResult,
  BatchSimulationResult,
  UnitPerformanceStats,
  SeededRng,
} from './types.js';

// ============================================================================
// Decision engine
// ============================================================================
export {
  loadAIProfiles,
  getProfileForFigure,
  determineActions,
  generateCardText,
} from './decide-v2.js';

// ============================================================================
// Evaluation
// ============================================================================
export {
  estimateExpectedDamageV2,
  estimateKillProbabilityV2,
  scoreTargets,
  scoreMoveDestinations,
  calculateThreatLevel,
  evaluateCondition,
  getEnemies,
  getAllies,
  getFigureSide,
  getValidTargetsV2,
  getAttackPoolForFigure,
  getDefensePoolForFigure,
  getSoakForFigure,
  getWoundThreshold,
  getRemainingHealth,
  findAttackPositions,
  findMeleePositions,
  getAttackRangeInTiles,
} from './evaluate-v2.js';

// ============================================================================
// Action builders
// ============================================================================
export {
  buildMoveAction,
  buildAttackAction,
  buildRallyAction,
  buildGuardedStanceAction,
  buildTakeCoverAction,
  buildStrainForManeuverAction,
  buildAimAction,
  buildDodgeAction,
  buildActionsForAIAction,
} from './actions-v2.js';

// ============================================================================
// Battle Logger
// ============================================================================
export { BattleLogger } from './battle-logger.js';
export type {
  BattleLog,
  RoundLog,
  ActivationLog,
  ActionLog,
  ArmyEntry,
  FigureSnapshot,
  EnemyDistance,
  DamageEntry,
} from './battle-logger.js';

// ============================================================================
// Simulator
// ============================================================================
export {
  simulateGameV2,
  runBatchV2,
  createSeededRng,
  installSeededRandom,
} from './simulator-v2.js';

// ============================================================================
// Combat Simulator
// ============================================================================
export {
  buildQuickHero,
  buildArenaMap,
  runCombatSim,
  runCombatBatch,
} from './combat-simulator.js';
export type {
  CombatScenarioConfig,
} from './combat-simulator.js';

/**
 * Galactic Operations Engine - Main Export
 * Barrel export file that re-exports all modules and types.
 * All exports reference v2 modules.
 */

// Re-export all types
export type {
  // Grid and Map
  GridCoordinate,
  TerrainType,
  CoverType,
  Tile,
  DeploymentZone,
  GameMap,
  // Dice (v2 Genesys-style d6)
  D6DieType,
  D6FaceDefinition,
  D6RollResult,
  AttackPool,
  DefensePool,
  YahtzeeCombo,
  // Units and Figures
  Side,
  Figure,
  // Weapons and Equipment
  WeaponType,
  // Tactic Cards
  TacticCardTiming,
  TacticCardEffectType,
  TacticCardEffect,
  TacticCard,
  // Combat
  CombatState,
  CombatResolution,
  CombatScenario,
  // Turn and Actions
  TurnPhase,
  ActionType,
  AttackPayload,
  GameAction,
  ActionLog,
  // Players
  PlayerRole,
  Player,
  // Morale
  MoraleState,
  MoraleTrack,
  // Game State
  GameState,
  GameData,
  // Mission
  VictoryCondition,
  Mission,
  // Board Templates
  BoardTemplate,
  // Unit Keywords
  UnitKeyword,
  UnitKeywordName,
  // Species Abilities
  SpeciesAbilityEffect,
  SpeciesAbility,
  // Boss Hit Location Types
  BossHitLocationDef,
  BossHitLocationState,
  BossPhaseTransition,
  // Focus Resource Types
  FocusConfig,
  FocusEffect,
  SpendFocusPayload,
} from './types.js';

// Re-export data loader functions
export {
  loadGameData,
  loadGameDataFromObjects,
  loadGameDataV2,
  loadBoardTemplates,
} from './data-loader.js';

// Re-export dice functions (v2 Genesys-style)
export {
  buildAttackPool,
  buildDefensePool,
  applyArmorDefense,
  applyCoverModifier,
  applyElevationAdvantage,
  rollSingleDie,
  rollAttackPool,
  rollDefensePool,
  detectCombos,
  resolveOpposedCheck,
  resolveFromRolls,
  expectedNetSuccesses,
  estimateHitProbability,
  getComboEffect,
  aggregateComboEffects,
  rollFateDie,
  defaultRollFn,
  FACE_TABLES,
} from './dice-v2.js';

// Re-export LOS functions
export {
  hasLineOfSight,
  getCover,
  getLineOfSightTiles,
} from './los.js';

// Re-export movement functions
export {
  getDistance,
  getMovementCost,
  getValidMoves,
  getPath,
  moveFigure,
} from './movement.js';

// Re-export morale functions
export {
  getMoraleState,
  applyMoraleChange,
  checkMoraleEffect,
  getMoraleChangeForEvent,
} from './morale.js';

// Re-export combat functions (v2)
export {
  buildCombatPools,
  calculateDamage,
  autoSpendAdvantagesThreats,
  rollCriticalInjury,
  resolveCombatV2,
  applyCombatResult,
  createCombatScenarioV2,
  quickResolveCombat,
} from './combat-v2.js';

// Re-export turn machine functions (v2)
export {
  createInitialGameStateV2,
  deployFiguresV2,
  advancePhaseV2,
  getCurrentFigureV2,
  executeActionV2,
  checkVictoryV2,
  resetForActivation,
  resolveStandbyTriggers,
  getFigureName,
  getWoundThresholdV2,
  applyReinforcementPhase,
  applyMissionReinforcements,
  objectivePointsFromTemplates,
  getSuppressionState,
  getNPCCourage,
  getHeroCourage,
  getFigureSpeed,
} from './turn-machine-v2.js';
export type { ArmyCompositionV2, SuppressionState } from './turn-machine-v2.js';

// Re-export species ability system
export {
  getHeroSpecies,
  getSpeciesAbilities,
  hasSpeciesAbility,
  getSpeciesAttackBonus,
  getSpeciesWoundedMeleeBonus,
  getSpeciesSoakBonus,
  getSpeciesRegeneration,
  getSpeciesBonusStrainRecovery,
  isImmuneToCondition,
  filterImmuneConditions,
  getSpeciesSkillBonus,
} from './species-abilities.js';

// Re-export keyword system (Legion-inspired mechanical keywords)
export {
  hasKeyword,
  getKeywordValue,
  getMechanicalKeywords,
  npcHasKeyword,
  getNPCKeywordValue,
  applyArmorKeyword,
  applyDisciplinedBonus,
  findGuardians,
  applyGuardianTransfer,
} from './keywords.js';

// Re-export AI system
export {
  loadAIProfiles,
  getProfileForFigure,
  determineActions,
  generateCardText,
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
  getAttackRangeInTiles,
  getThreateningEnemies,
  findAttackPositions,
  findMeleePositions,
  buildMoveAction,
  buildAttackAction,
  buildRallyAction,
  buildGuardedStanceAction,
  buildTakeCoverAction,
  buildStrainForManeuverAction,
  buildActionsForAIAction,
  simulateGameV2,
  runBatchV2,
  createSeededRng,
  installSeededRandom,
  BattleLogger,
  buildQuickHero,
  buildArenaMap,
  runCombatSim,
  runCombatBatch,
} from './ai/index.js';

// Re-export power ranking system
export {
  computeAnalyticalRating,
  runDuelTournament,
  runFullPowerRanking,
  generatePowerRankingReport,
} from './power-ranking.js';

export type {
  AnalyticalRating,
  DuelResult,
  DuelGameDetail,
  DuelRanking,
  CombinedRanking,
  PowerRankingResult,
  NPCCombatStats,
  BalanceFlag,
} from './power-ranking.js';

// Re-export boss mechanics (Oathsworn-inspired hit location system)
export {
  initBossHitLocations,
  routeWoundsToHitLocations,
  getBossAttackPoolPenalty,
  getBossDefensePoolPenalty,
  getBossSoakPenalty,
  getBossSpeedPenalty,
  getDisabledBossWeapons,
  getDisabledLocationConditions,
  applyTargetedShotPenalty,
  applyBossAttackPenalties,
  applyBossDefensePenalties,
  checkBossPhaseTransition,
  applyBossPhaseTransition,
  isBossWeaponAvailable,
  getBossLocationSummary,
} from './boss-mechanics.js';

// Re-export Focus resource system (Oathsworn Animus-inspired)
export {
  getFocusConfigForHero,
  initFocusResource,
  recoverFocus,
  canSpendFocus,
  getAvailableFocusEffects,
  spendFocus,
  hasFocusResource,
  getFocusPercent,
  getFocusEffectLabel,
} from './focus-resource.js';

export type {
  AIProfilesData,
  AIArchetypeProfile,
  AIDecisionResult,
  AIWeights,
  GameSimulationResult,
  BatchSimulationResult,
  UnitPerformanceStats,
  RoundStats,
  SeededRng,
  CombatScenarioConfig,
  BattleLog,
  RoundLog,
  ActivationLog,
  ArmyEntry,
  FigureSnapshot,
  EnemyDistance,
  DamageEntry,
} from './ai/index.js';

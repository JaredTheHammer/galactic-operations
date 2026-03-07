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
  RollFn,
  // Units and Figures
  Side,
  UnitTier,
  SurgeAbility,
  UnitDefinition,
  StatusEffect,
  Figure,
  // Weapons and Equipment
  WeaponType,
  Weapon,
  Equipment,
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
  MoveActionPayload,
  AttackActionPayload,
  RestActionPayload,
  OverwatchActionPayload,
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
  // Rebellion Mechanics
  ActProgress,
  ActOutcome,
  ActOutcomeTier,
  ExposureStatus,
  CampaignEpilogue,
  CampaignEpilogueTier,
} from './types.js';

// Re-export rebellion mechanics helpers from types
export {
  getExposureStatus,
  getActOutcomeTier,
  createActProgress,
  // Dune-inspired mechanics types
  ContractTier,
  ContractConditionType,
  ContractCondition,
  ContractReward,
  Contract,
  ActiveContract,
  IntelAssetType,
  IntelAsset,
  MissionIntel,
  IntelRecallResult,
  SpyNetworkState,
  TacticCardMarketEntry,
  CustomTacticDeck,
  DeckBuildingState,
  ResearchNode,
  ResearchEffect,
  ResearchEffectType,
  ResearchTrackState,
  MercenarySpecialization,
  MercenaryProfile,
  MercenaryPassiveEffect,
  HiredMercenary,
  MercenaryRosterState,
  DuneMechanicsState,
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

// Re-export Dune-inspired mechanics

// Contracts system
export {
  MAX_ACTIVE_CONTRACTS,
  TIER_REWARD_MULTIPLIERS,
  getAvailableContracts,
  canAcceptContract,
  acceptContract,
  abandonContract,
  updateContractProgress,
  isContractComplete,
  evaluateContracts,
  collectContractRewards,
  createDefaultDuneMechanics,
} from './contracts.js';

// Intelligence/Spy Network system
export {
  RECALL_CREDITS_PER_TURN,
  RECALL_TACTIC_CARDS,
  RECRUIT_ASSET_COST,
  RECRUIT_COST_SCALING,
  recruitAsset,
  getRecruitCost,
  deployAsset,
  recallAsset,
  dismissAsset,
  advanceIntelNetwork,
  getMissionIntel,
  getReserveAssets,
  getDeployedAssets,
} from './intel-network.js';

// Deck-building system
export {
  STARTER_DECK_SIZE,
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  TRASH_COST,
  MARKET_DISPLAY_SIZE,
  OPERATIVE_STARTER_CARDS,
  IMPERIAL_STARTER_CARDS,
  enableDeckBuilding,
  disableDeckBuilding,
  getMarketCards,
  purchaseMarketCard,
  trashCard,
  buildCustomTacticDeck,
  getDeckContents,
  getDeckSize,
  refreshMarket,
} from './deck-building.js';

// Research track system
export {
  DEFAULT_RESEARCH_TRACK,
  getAvailableResearchNodes,
  canUnlockNode,
  unlockResearchNode,
  getActiveResearchEffects,
  getResearchBonus,
  getCurrentResearchTier,
  getUnlockedNodes,
} from './research-track.js';

// Mercenaries system
export {
  DEFAULT_MERCENARY_PROFILES,
  getAvailableMercenaries,
  canHireMercenary,
  hireMercenary,
  dismissMercenary,
  payMercenaryUpkeep,
  markMercenaryKIA,
  updateMercenaryWounds,
  healMercenary,
  getActiveMercenaries,
  getMercenaryProfile,
  getTotalUpkeepCost,
} from './mercenaries.js';

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

// Re-export critical injury system
export {
  MAX_CRITICAL_INJURIES,
  FORCED_REST_THRESHOLD,
  SEVERITY_ROLL_RANGES,
  rollCriticalInjuryD66,
  getCriticalInjuryForRoll,
  applyCriticalInjury,
  removeCriticalInjury,
  removeCriticalInjuryById,
  getCriticalInjuryCharacteristicPenalties,
  getCriticalInjuryWoundPenalty,
  getCriticalInjuryStrainPenalty,
  getCriticalInjurySpeedPenalty,
  getCriticalInjurySoakPenalty,
  getCriticalInjurySkillPenalties,
  isHeroForcedToRest,
  getHeroCriticalInjuryStatus,
  attemptTreatment,
  professionalTreatment,
  processNaturalRecovery,
} from './critical-injuries.js';

// Re-export sector control system
export {
  initializeOverworld,
  modifySectorControl,
  computePostMissionControlChanges,
  applyControlEscalation,
  addSectorMutation,
  getSectorMissionEffects,
  getSectorThreatBonus,
  getSectorShopMultiplier,
  getSectorSocialDifficultyMod,
  findSectorForMission,
  moveToSector,
  getOverworldSummary,
} from './sector-control.js';

// Re-export legacy event system
export {
  initializeLegacyDeck,
  evaluateTrigger,
  evaluateAllTriggers,
  checkForTriggeredEvents,
  applyLegacyEffect,
  resolveEvent,
  processLegacyEvents,
  acknowledgePendingEvents,
  isRuleChangeActive,
} from './legacy-events.js';
export type { LegacyEventContext } from './legacy-events.js';

// Re-export momentum system
export {
  updateMomentum,
  getMomentumEffects,
  applyMomentumCredits,
  getMomentumThreatAdjustment,
  getMomentumTacticCardBonus,
  getMomentumNarrative,
  resetMomentum,
} from './momentum.js';

// Re-export campaign overworld system
export {
  initializeCampaignOverworld,
  processOverworldPostMission,
  getAvailableMissionsInSector,
  computeEffectiveThreatWithSector,
  getAccessibleSectors,
  travelToSector,
  getCampaignOverworldSummary,
} from './campaign-overworld.js';

// Re-export new types from types.ts
export type {
  CriticalInjurySeverity,
  CriticalInjuryEffectType,
  CriticalInjuryEffect,
  CriticalInjuryDefinition,
  ActiveCriticalInjury,
  SectorControlLevel,
  CampaignSector,
  SectorMutation,
  LegacyEventTrigger,
  LegacyEventEffect,
  LegacyEventDefinition,
  LegacyDeckState,
  CampaignOverworldDefinition,
  CampaignOverworldState,
} from './types.js';

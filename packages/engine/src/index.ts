/**
 * Galactic Operations Engine - Main Export
 * Barrel export file that re-exports all modules and types.
 * All exports reference v2 modules.
 */

// Re-export Terraforming Mars-inspired mechanics
export type {
  ProjectCardCategory,
  ProjectCardEffect,
  ProjectCard,
  ProjectCardState,
  LiberationTrackId,
  LiberationThreshold,
  LiberationTrackDefinition,
  LiberationTrackDelta,
  LiberationTrackState,
  CampaignMilestone,
  CampaignAward,
  MilestoneAwardState,
  IntelCardEffectType,
  IntelCard,
  IntelDraftState,
} from './types.js';

// Re-export project cards engine
export {
  getAvailableProjects,
  canPurchaseProject,
  purchaseProject,
  getActiveProjectEffects,
  getAggregatedEffect,
  getProjectShopDiscount,
  getProjectThreatReduction,
  getProjectCreditIncome,
  getProjectXPBonus,
  getProjectTacticCardBonus,
  getProjectHealingDiscount,
  getProjectReinforcementDelay,
  hasIntelReveal,
  getStartingSupplies,
  getProjectsByCategory,
} from './project-cards.js';

// Re-export liberation tracks engine
export {
  initializeLiberationTracks,
  advanceLiberationTracks,
  calculateMissionTrackDeltas,
  calculateSocialTrackDeltas,
  getTrackValue,
  getTrackProgress,
  getActiveLiberationBonuses,
  applyTrackDeltas,
} from './liberation-tracks.js';

// Re-export milestones & awards engine
export {
  initializeMilestoneState,
  updateHeroStats,
  updateSocialStats,
  trackDamageDealt,
  getClaimableMilestones,
  checkMilestoneCondition,
  claimMilestone,
  evaluateAwards,
  getMilestoneSummary,
  getAwardSummary,
} from './milestones.js';

// Re-export intel draft engine
export {
  generateIntelDraftPool,
  draftIntelCard,
  canDraft,
  getAllDraftedCardIds,
  finalizeDraft,
  calculateIntelEffects,
  clearPendingIntel,
  aiDraftIntelCard,
} from './intel-draft.js';

export type { IntelEffectResult } from './intel-draft.js';

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
  TacticCardTag,
  TacticCardTagSynergy,
  // Faction Reputation
  FactionDefinition,
  FactionThreshold,
  FactionReward,
  FactionRewardType,
  // Focus Tokens
  FocusSpendType,
  FocusSpendOption,
  TacticCardAltMode,
  TacticCardAltModeType,
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
  // TI4-Inspired Mechanics
  SecretObjectiveCategory,
  SecretObjectiveConditionType,
  SecretObjectiveDefinition,
  AssignedSecretObjective,
  MissionSecretObjectiveState,
  CompletedSecretObjective,
  CommandTokenUsage,
  SpendCommandTokenPayload,
  CommandTokenState,
  ExplorationResultType,
  ExplorationTokenType,
  ExplorationToken,
  ExplorationRevealResult,
  ExplorationReward,
  RelicFragmentType,
  RelicDefinition,
  RelicEffect,
  ForgedRelic,
  DirectiveTarget,
  AgendaDirectiveDefinition,
  AgendaDirective,
  DirectiveEffect,
  AgendaVoteResult,
  // Fog of War
  TileVisibility,
  FogOfWarState,
  // Boss Hit Location Types
  BossHitLocationDef,
  BossHitLocationState,
  BossPhaseTransition,
  // Focus Resource Types
  FocusConfig,
  FocusEffect,
  SpendFocusPayload,
  // Supply Network
  SupplyNodeType,
  SupplyNode,
  SupplyRoute,
  SupplyNetwork,
  SectorLocation,
  SectorMapDefinition,
  SupplyNodeBonus,
  // Rebellion Mechanics
  ActProgress,
  ActOutcome,
  ActOutcomeTier,
  ExposureStatus,
  CampaignEpilogue,
  CampaignEpilogueTier,
  // v1 Legacy types
  V1_UnitDefinition,
} from './types.js';

// Re-export rebellion mechanics helpers from types
export {
  getExposureStatus,
  getActOutcomeTier,
  createActProgress,
} from './types.js';

// Dune-inspired mechanics types
export type {
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
  getSpeciesNaturalWeaponDamage,
  hasSpeciesDarkVision,
  getSpeciesSilhouetteDefense,
} from './species-abilities.js';

// Re-export keyword system (Legion-inspired mechanical keywords)
export {
  hasKeyword,
  getKeywordValue,
  getMechanicalKeywords,
  npcHasKeyword,
  getNPCKeywordValue,
  applyArmorKeyword,
  applyRetaliateKeyword,
  applyDisciplinedBonus,
  findGuardians,
  applyGuardianTransfer,
} from './keywords.js';

// Re-export fog of war system
export {
  createFogOfWarState,
  getTileVisibility,
  isFigureVisible,
  computeVisibleTiles,
  computeVisibleTilesWithRoomReveal,
  updateFogOfWar,
  updateFogAfterMove,
  serializeFogOfWar,
  deserializeFogOfWar,
} from './fog-of-war.js';

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
  getVisibleEnemies,
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

// Re-export faction reputation system (Ark Nova-inspired)
export {
  getFactionReputation,
  getAllFactionReputations,
  getHighestClaimedThreshold,
  modifyFactionReputation,
  getUnclaimedThresholdRewards,
  claimThresholdReward,
  applyFactionRewards,
  processAllFactionRewards,
  getFactionTagSources,
} from './faction-reputation.js';

// Re-export focus token system (Ark Nova X-token inspired)
export {
  getFocusTokens,
  getCampaignFocusTokens,
  getAvailableFocusSpends,
  calculateComboFocusTokens,
  calculateCombatFocusTokens,
  awardFocusTokens,
  awardCampaignFocusTokens,
  spendFocusTokens,
  getFocusSpendEffect,
  initializeFocusTokens,
  saveFocusTokensToCampaign,
} from './focus-tokens.js';
export type { FocusSpendEffect } from './focus-tokens.js';

// Re-export card tag synergy system (Ark Nova-inspired)
export {
  countTagSources,
  getAllTagSources,
  calculateTagSynergyEffects,
  getEffectiveCardEffects,
  getTagSynergySummary,
  getCardsByTag,
  getUniqueTags,
} from './card-tags.js';
export type { TagSource } from './card-tags.js';
// Re-export secret objectives system (TI4-inspired)
export {
  initializeSecretObjectives,
  updateSecretObjectiveProgress,
  resolveSecretObjectives,
  applySecretObjectiveRewards,
  getHeroSecretObjective,
  getObjectiveDefinition,
} from './secret-objectives.js';
export type { SecretObjectiveEvent } from './secret-objectives.js';

// Re-export command token system (TI4-inspired)
export {
  initializeCommandTokens,
  calculateOperativeTokens,
  calculateImperialTokens,
  refreshCommandTokens,
  canSpendToken,
  spendCommandToken,
  validateTokenUsage,
  applyTokenEffect,
  getTokensRemaining,
  applyDirectiveBonus,
} from './command-tokens.js';

// Re-export exploration token system (TI4 PoK-inspired)
export {
  generateExplorationTokens,
  getRevealableTokens,
  revealExplorationToken,
  applyExplorationReveal,
  getUnrevealedTokenCount,
  getCollectedRewards,
} from './exploration-tokens.js';

// Re-export relic fragment system (TI4 PoK-inspired)
export {
  addFragment,
  getFragmentCounts,
  getForgeableTypes,
  canForge,
  getAvailableRelics,
  forgeRelic,
  assignRelic,
  unassignRelic,
  getHeroRelics,
  useRelic,
  getActiveRelicEffects,
  getRelicAttackBonus,
  getRelicDefenseBonus,
  getRelicSoakBonus,
  getTotalFragments,
} from './relic-fragments.js';

// Re-export agenda phase system (TI4-inspired)
export {
  calculateHeroInfluence,
  calculateOperativeInfluence,
  calculateOperativeInfluenceBreakdown,
  calculateImperialInfluence,
  drawAgendaDirectives,
  resolveAgendaVote,
  applyAgendaDirective,
  decrementDirectiveDurations,
  getActiveDirectiveEffects,
  getDirectiveThreatModifier,
  getDirectiveReinforcementModifier,
  getDirectiveStartingConsumables,
  getDirectiveShopDiscount,
  getDirectiveMoraleModifier,
  getDirectiveExplorationBonus,
  getDirectiveCommandTokenBonus,
  getDirectiveXPBonus,
} from './agenda-phase.js';
// Re-export supply network system (Brass: Birmingham-inspired)
export {
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
  getNetworkBonuses,
  applyNetworkUpkeep,
  severNodesAtLocation,
  repairNode,
  getNetworkFilteredMissions,
  getNetworkSummary,
  NODE_BUILD_COSTS,
  NODE_UPKEEP_COSTS,
  NODE_INCOME,
  SAFEHOUSE_THREAT_REDUCTION,
  MAX_REINFORCEMENT_BONUS,
} from './supply-network.js';

// Re-export dual-use tactic card functions
export {
  hasAltMode,
  getAltModeCards,
  playCardAltMode,
  aiShouldUseAltMode,
} from './tactic-cards.js';

export type {
  AltModeResult,
} from './tactic-cards.js';

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

// Re-export War of the Ring inspired mechanics
export type {
  LeadershipAura,
  StrategicEffectType,
  StrategicEffect,
  DetectionLevel,
  DetectionThreshold,
  DetectionThresholdEffect,
  DetectionTrack,
  FactionReadiness,
  FactionStatus,
  FactionBenefits,
  FactionActivationTrigger,
  CommandDieFace,
  CommandDie,
  CommandDicePool,
  CommandDiceState,
} from './types.js';

// Re-export leadership system
export {
  getLeadershipValue,
  findLeadershipAura,
  applyLeadershipRerolls,
} from './leadership.js';

// Re-export detection track system
export {
  createDetectionTrack,
  resolveDetectionLevel,
  getNewlyCrossedThresholds,
  increaseDetection,
  applyLayLow,
  resolveHuntDice,
  isFullyDetected,
  getDetectionCostForAction,
  DETECTION_COSTS,
  DEFAULT_DETECTION_THRESHOLDS,
} from './detection-track.js';

// Re-export faction readiness system
export {
  resolveReadinessLevel,
  meetsReadiness,
  createFactionStatus,
  advanceFaction,
  processTrigger,
  getTotalShopDiscount,
  getAvailableCompanions,
  getAvailableReinforcements,
  getBonusCardDraw,
  getThreatReduction,
} from './faction-readiness.js';

// Re-export command dice system
export {
  IMPERIAL_DIE_FACES,
  OPERATIVE_DIE_FACES,
  createCommandDicePool,
  createCommandDiceState,
  allocateHuntDice,
  rollCommandDice,
  rollAllCommandDice,
  canUseDieForAction,
  getRequiredFaceForAction,
  findAvailableDice,
  useCommandDie,
  getRemainingDice,
  countAvailableFaces,
  hasRemainingDice,
  resetCommandDiceForRound,
  addBonusDice,
  removeDice,
  aiDecideHuntAllocation,
  aiSelectDie,
} from './command-dice.js';

// Re-export strategic card play
export {
  hasStrategicEffect,
  getStrategicCards,
  playStrategicCard,
  aiShouldPlayStrategic,
} from './tactic-cards.js';

export type {
  StrategicCardResult,
} from './tactic-cards.js';
// Re-export Spirit Island subsystems
export {
  initializeSpiritIsland,
  hasAnySubsystem,
  getEnabledSubsystems,
} from './spirit-island.js';

export {
  initializeDisruptionTrack,
  computeTerrorLevel,
  addDisruption,
  getActiveVictoryConditions,
  didTerrorLevelIncrease,
  applyDisruptionEvent,
} from './disruption-track.js';

export {
  initializeDualTiming,
  getSlowBonus,
  queueSlowAction,
  cancelSlowActionsForFigure,
  getPendingSlowActions,
  clearSlowQueue,
  canBeSlowed,
  applySlowAction,
  resolveSlowPhase,
} from './dual-timing.js';

export {
  initializeThreatCadence,
  getPhaseForRound,
  getCycleCount,
  advanceThreatCadence,
  disruptCurrentPhase,
  getActiveEffects as getThreatCadenceEffects,
  addScoutedZones,
  addFortification,
  getNextPhase,
  getThreatIncomeMultiplier,
  applyThreatCadenceRound,
  getFortificationBonus,
} from './threat-cadence.js';

export {
  initializeElementTracker,
  addElementForAction,
  addElement,
  meetsThresholds,
  checkInnatePowers,
  getActiveEffects as getElementSynergyEffects,
  mergeEffects,
  getHeroElementCounts,
  applyElementGeneration,
  ALL_ELEMENTS,
  DEFAULT_INNATE_POWERS,
} from './element-synergy.js';

export {
  initializeCollateralDamage,
  getTileCollateral,
  applyCollateralToTile,
  getCollateralForQuality,
  applyWeaponCollateral,
  getTilesAtLevel,
  getTerrainModification,
  applyCollateralToGameState,
  getXPMultiplier,
  getCollateralSummary,
} from './collateral-damage.js';

export type {
  OptionalSubsystems,
  SpiritIslandState,
  TerrorLevel,
  TieredVictoryCondition,
  DisruptionTrackState,
  DisruptionEvent,
  ActionTiming,
  QueuedSlowAction,
  SlowBonus,
  DualTimingState,
  ThreatCadencePhase,
  ThreatCadenceState,
  ThreatCadenceEffect,
  SynergyElement,
  ElementThreshold,
  InnatePower,
  InnatePowerEffect,
  ElementTracker,
  CollateralLevel,
  DamagedTile,
  CollateralDamageState,
  CollateralSource,
} from './types.js';
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

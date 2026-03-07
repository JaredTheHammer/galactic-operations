/**
 * Game Store (v2)
 *
 * Zustand store managing v2 GameState with:
 * - v2 Figure (entityType/entityId, woundsCurrent/strainCurrent, conditions)
 * - v2 action economy (1 Action + 1 Maneuver)
 * - v2 combat pipeline (combat-v2.ts)
 * - Hero + NPC registries on GameState
 * - Hero creation pipeline (Phase 7d)
 * - Active talent usage (UseTalent action)
 */

import { create } from 'zustand'
import type {
  GameState,
  GameData,
  GridCoordinate,
  Player,
  Figure,
  NPCProfile,
  HeroCharacter,
  MapConfig,
  BoardTemplate,
  TalentCard,
  SpecializationDefinition,
  WeaponDefinition,
  ArmorDefinition,
  CampaignState,
  CampaignDifficulty,
  MissionDefinition,
  Mission,
  MissionResult,
  ObjectivePointTemplate,
  ConsumableItem,
  TacticCard,
} from '@engine/types.js'
import { MAP_PRESETS, computeGameScale } from '@engine/types.js'
import {
  createInitialGameStateV2,
  deployFiguresV2,
  executeActionV2,
  resetForActivation,
  getWoundThresholdV2,
  applyReinforcementPhase,
  applyMissionReinforcements,
  objectivePointsFromTemplates,
  buildActivationOrderV2,
} from '@engine/turn-machine-v2.js'
import type { ArmyCompositionV2, ReinforcementResult, MissionReinforcementResult } from '@engine/turn-machine-v2.js'
import { generateMap } from '@engine/map-generator.js'
import {
  getValidMoves,
  moveFigure,
  getPath,
  getMovementCost,
} from '@engine/movement.js'
import {
  getValidTargetsV2,
  getAttackRangeInTiles,
  getThreateningEnemies,
} from '@engine/ai/evaluate-v2.js'
import { createHero, purchaseSkillRank, purchaseTalent, unlockSpecialization, equipItem, unequipItem } from '@engine/character-v2.js'
import type { HeroCreationInput, EquipmentSlot } from '@engine/character-v2.js'
import { getEquippedTalents, canActivateTalent } from '@engine/talent-v2.js'
import { initializeTacticDeck, drawCardsForBothSides, playCard } from '@engine/tactic-cards.js'
import {
  createCampaign,
  getAvailableMissions,
  completeMission,
  prepareHeroesForMission,
  saveCampaign,
  loadCampaign,
  campaignToJSON,
  campaignFromJSON,
  checkVictoryConditions,
  evaluateObjective,
  getInventory,
  addToInventory,
  removeFromInventory,
  getFinaleExposureModifiers,
} from '@engine/campaign-v2.js'
import type { MissionCompletionInput } from '@engine/campaign-v2.js'
import { combatAnimations } from '../canvas/animation-manager'
import { saveToSlot, loadFromSlot, deleteSlot, AUTO_SAVE_SLOT, findEmptySlot, migrateLegacySave } from '../services/save-slots'

// v2 data imports
import diceD6Data from '@data/dice-d6.json'
import imperialsNpcData from '@data/npcs/imperials.json'
import bountyHuntersNpcData from '@data/npcs/bounty-hunters.json'
import warlordForcesNpcData from '@data/npcs/warlord-forces.json'
import weaponsV2Data from '@data/weapons-v2.json'
import armorData from '@data/armor.json'
import speciesData from '@data/species.json'
import careersData from '@data/careers.json'
import aiProfilesRaw from '@data/ai-profiles.json'
import consumablesData from '@data/consumables.json'
import tacticsData from '@data/cards/tactics.json'
import companionsNpcData from '@data/npcs/companions.json'
import mercenarySpecData from '@data/specializations/mercenary.json'
import smugglerSpecData from '@data/specializations/smuggler.json'
import droidTechSpecData from '@data/specializations/droid-tech.json'
import forceAdeptSpecData from '@data/specializations/force-adept.json'
import tacticianSpecData from '@data/specializations/tactician.json'
import assassinSpecData from '@data/specializations/assassin.json'

// Dune mechanics data
import contractsData from '@data/contracts.json'
import researchTrackData from '@data/research-track.json'
import mercenariesNpcData from '@data/npcs/mercenaries.json'

// Campaign mission data - Act 1
import mission1Data from '@data/missions/act1-mission1-arrival.json'
import mission2Data from '@data/missions/act1-mission2-intel.json'
import mission3aData from '@data/missions/act1-mission3a-cache.json'
import mission3bData from '@data/missions/act1-mission3b-ambush.json'
import mission4Data from '@data/missions/act1-mission4-finale.json'
// Campaign mission data - Act 2
import act2Mission1Data from '@data/missions/act2-mission1-crossroads.json'
import act2Mission2Data from '@data/missions/act2-mission2-bounty.json'
import act2Mission3aData from '@data/missions/act2-mission3a-warehouse.json'
import act2Mission3bData from '@data/missions/act2-mission3b-hunting-grounds.json'
import act2Mission4Data from '@data/missions/act2-mission4-throne.json'
// Campaign mission data - Act 3
import act3Mission1Data from '@data/missions/act3-mission1-defection.json'
import act3Mission2Data from '@data/missions/act3-mission2-prototype.json'
import act3Mission3aData from '@data/missions/act3-mission3a-stronghold.json'
import act3Mission3bData from '@data/missions/act3-mission3b-betrayal.json'
import act3Mission4Data from '@data/missions/act3-mission4-endgame.json'
import campaignData from '@data/campaigns/tangrene-liberation.json'

// v1 data still used for board templates
import openGround from '@data/boards/open-ground.json'
import corridorComplex from '@data/boards/corridor-complex.json'
import commandCenter from '@data/boards/command-center.json'
import storageBay from '@data/boards/storage-bay.json'
import landingPad from '@data/boards/landing-pad.json'
import barracks from '@data/boards/barracks.json'

const BOARD_TEMPLATES: BoardTemplate[] = [
  openGround,
  corridorComplex,
  commandCenter,
  storageBay,
  landingPad,
  barracks,
] as BoardTemplate[]

// ============================================================================
// DATA LOADING (v2)
// ============================================================================

/**
 * Build v2 GameData from JSON imports.
 * Now loads specialization data for hero creation.
 */
function loadGameDataV2(): GameData {
  // NPC profiles (merge all faction files)
  const npcProfiles: Record<string, NPCProfile> = {}
  const npcDataFiles = [imperialsNpcData, bountyHuntersNpcData, warlordForcesNpcData, companionsNpcData, mercenariesNpcData]
  for (const npcFile of npcDataFiles) {
    const npcsRaw = (npcFile as any).npcs ?? npcFile
    for (const [id, npc] of Object.entries(npcsRaw)) {
      npcProfiles[id] = npc as NPCProfile
    }
  }

  // Companion profiles: map social companion IDs to their combat NPC profile IDs
  const companionProfiles: Record<string, string> = {}
  const companionNpcsRaw = (companionsNpcData as any).npcs ?? {}
  for (const [id, npc] of Object.entries(companionNpcsRaw)) {
    // Convention: combat profile 'companion-drez-venn' maps to social ID 'drez-venn'
    const socialId = id.replace(/^companion-/, '')
    companionProfiles[socialId] = id
  }

  // Weapons
  const weapons: Record<string, any> = {}
  const weaponsRaw = (weaponsV2Data as any).weapons ?? weaponsV2Data
  for (const [id, weapon] of Object.entries(weaponsRaw)) {
    weapons[id] = weapon
  }

  // Armor
  const armor: Record<string, any> = {}
  const armorRaw = (armorData as any).armor ?? armorData
  for (const [id, a] of Object.entries(armorRaw)) {
    armor[id] = a
  }

  // Species
  const species: Record<string, any> = {}
  const speciesRaw = (speciesData as any).species ?? speciesData
  for (const [id, sp] of Object.entries(speciesRaw)) {
    species[id] = sp
  }

  // Careers
  const careers: Record<string, any> = {}
  const careersRaw = (careersData as any).careers ?? careersData
  for (const [id, c] of Object.entries(careersRaw)) {
    careers[id] = c
  }

  // Specializations (load all available)
  const specializations: Record<string, SpecializationDefinition & { talents: TalentCard[] }> = {}
  const specDataFiles = [
    mercenarySpecData,
    smugglerSpecData,
    droidTechSpecData,
    forceAdeptSpecData,
    tacticianSpecData,
    assassinSpecData,
  ]
  for (const specRaw of specDataFiles) {
    const raw = specRaw as any
    if (raw.specialization) {
      const specDef = raw.specialization
      specializations[specDef.id] = {
        ...specDef,
        talents: raw.talents ?? [],
      }
    }
  }

  // Dice (d6 system)
  const dice = (diceD6Data as any).dieTypes ?? diceD6Data

  // Consumables
  const consumables: Record<string, any> = {}
  const consumablesRaw = Array.isArray(consumablesData) ? consumablesData : (consumablesData as any).consumables ?? []
  for (const item of consumablesRaw) {
    consumables[item.id] = item
  }

  // Tactic cards
  const tacticCards: Record<string, TacticCard> = {}
  const tacticsRaw = Array.isArray(tacticsData) ? tacticsData : (tacticsData as any).cards ?? []
  for (const card of tacticsRaw) {
    tacticCards[card.id] = card as TacticCard
  }

  return {
    dice,
    species,
    careers,
    specializations,
    weapons,
    armor,
    npcProfiles,
    consumables,
    tacticCards,
    companionProfiles,
  }
}

/**
 * Build campaign mission definitions from JSON data.
 */
function loadCampaignMissions(): Record<string, MissionDefinition> {
  const missions: Record<string, MissionDefinition> = {}
  const missionFiles = [
    mission1Data, mission2Data, mission3aData, mission3bData, mission4Data,
    act2Mission1Data, act2Mission2Data, act2Mission3aData, act2Mission3bData, act2Mission4Data,
    act3Mission1Data, act3Mission2Data, act3Mission3aData, act3Mission3bData, act3Mission4Data,
  ]
  for (const raw of missionFiles) {
    const m = raw as unknown as MissionDefinition
    missions[m.id] = m
  }
  return missions
}

const CAMPAIGN_STORAGE_KEY = 'galactic-ops-campaign-save'

/**
 * Build default v2 army for AI battles.
 *
 * Asymmetric design (Imperial Assault-style):
 * - Imperial starts with a small patrol force; reinforcements arrive each round
 *   via the threat system (see applyReinforcementPhase in turn-machine-v2)
 * - Operative has their full hero squad from the start
 *
 * Tension arc:
 *   R1-3: Heroes outgun the initial patrol, focus on objectives
 *   R4-6: Elite reinforcements create the balance point
 *   R7+:  Imperial pressure mounts, heroes must finish or be overwhelmed
 */
function defaultArmyV2(heroes?: HeroCharacter[]): ArmyCompositionV2 {
  return {
    imperial: [
      // Initial patrol matches simulator-v2.ts defaultArmyV2 (synced Session 30).
      // Previous client had only 2 stormtroopers + 1 officer (3 units), while the
      // simulator used 3 stormtroopers + 1 elite + 1 officer (5 units). The weaker
      // client patrol meant balance was significantly different from simulator tuning.
      { npcId: 'stormtrooper', count: 3 },
      { npcId: 'stormtrooper-elite', count: 1 },
      { npcId: 'imperial-officer', count: 1 },
    ],
    operative: heroes
      ? heroes.map(h => ({ entityType: 'hero' as const, entityId: h.id, count: 1 }))
      : [
          { entityType: 'npc' as const, entityId: 'stormtrooper', count: 2 },
          { entityType: 'npc' as const, entityId: 'stormtrooper-elite', count: 1 },
          { entityType: 'npc' as const, entityId: 'imperial-officer', count: 1 },
        ],
  }
}

/**
 * Generate 4 pre-built test heroes for AI vs AI playtesting.
 * Each covers a different combat archetype with proper weapons and skills.
 */
function generateTestHeroes(gameData: GameData): HeroCharacter[] {
  const heroes: HeroCharacter[] = []

  // Hero 1: Wookiee Hired Gun / Mercenary -- tank/heavy weapons
  const korrga = createHero({
    name: 'Korrga',
    speciesId: 'wookiee',
    careerId: 'hired-gun',
    specializationId: 'mercenary',
    initialSkills: { 'ranged-heavy': 2, 'resilience': 1, 'athletics': 1, 'mechanics': 1 },
    characteristicIncreases: { brawn: 1 },
  }, gameData)
  // Stable ID for deterministic AI profile lookup (matches simulator-v2)
  korrga.id = 'hero-korrga'
  korrga.equipment.primaryWeapon = 'a280'
  korrga.equipment.armor = 'heavy-battle-armor'
  heroes.push(korrga)

  // Hero 2: Human Scoundrel / Smuggler -- mobile DPS
  const vex = createHero({
    name: 'Vex Dorin',
    speciesId: 'human',
    careerId: 'scoundrel',
    specializationId: 'smuggler',
    initialSkills: { 'ranged-light': 2, 'cool': 1, 'coordination': 1, 'computers': 1 },
    characteristicIncreases: { agility: 1 },
  }, gameData)
  vex.id = 'hero-vex-dorin'
  vex.equipment.primaryWeapon = 'dl-44'
  vex.equipment.armor = 'blast-vest'
  heroes.push(vex)

  // Hero 3: Twi'lek Commander / Tactician -- support/leader
  const ashara = createHero({
    name: 'Ashara Nev',
    speciesId: 'twilek',
    careerId: 'commander',
    specializationId: 'tactician',
    initialSkills: { 'ranged-light': 1, 'leadership': 2, 'cool': 1, 'perception': 1, 'computers': 1 },
    characteristicIncreases: { presence: 1 },
  }, gameData)
  ashara.id = 'hero-ashara-nev'
  ashara.equipment.primaryWeapon = 'westar-35'
  ashara.equipment.armor = 'padded-armor'
  heroes.push(ashara)

  // Hero 4: Trandoshan Bounty Hunter / Assassin -- sniper/finisher
  const ssorku = createHero({
    name: 'Ssorku',
    speciesId: 'trandoshan',
    careerId: 'bounty-hunter',
    specializationId: 'assassin',
    initialSkills: { 'ranged-heavy': 2, 'stealth': 1, 'perception': 1, 'skulduggery': 1 },
    characteristicIncreases: { agility: 1 },
  }, gameData)
  ssorku.id = 'hero-ssorku'
  ssorku.equipment.primaryWeapon = 'e-11'
  ssorku.equipment.armor = 'padded-armor'
  heroes.push(ssorku)

  return heroes
}

/**
 * Build army composition that includes created heroes.
 */
function heroArmyV2(heroes: HeroCharacter[]): ArmyCompositionV2 {
  return {
    imperial: [
      { npcId: 'stormtrooper', count: 3 },
      { npcId: 'stormtrooper-elite', count: 1 },
      { npcId: 'imperial-officer', count: 1 },
    ],
    operative: heroes.map(h => ({
      entityType: 'hero' as const,
      entityId: h.id,
      count: 1,
    })),
  }
}

// ============================================================================
// STORE TYPES
// ============================================================================

/** Notification for UI display (reinforcement popups, narrative events) */
export interface GameNotification {
  id: string
  type: 'reinforcement' | 'narrative' | 'objective' | 'info'
  title: string
  message: string
  duration: number  // ms, 0 = manual dismiss only
  createdAt: number
  isNarrative?: boolean  // cinematic center-screen display
}

/** Active talent info for UI display */
export interface ActivatableTalent {
  talentId: string
  name: string
  description: string
  activation: string
  strainCost?: number
}

/** Floating combat text displayed on the tactical canvas */
export interface FloatingCombatText {
  id: string
  gridX: number
  gridY: number
  text: string
  color: string
  type: 'damage' | 'heal' | 'miss' | 'defeat' | 'critical' | 'token' | 'status'
  createdAt: number
}

let fctCounter = 0

export interface GameStore {
  // State
  gameState: GameState | null
  gameData: GameData | null
  selectedFigureId: string | null
  validMoves: GridCoordinate[]
  validTargets: string[]
  highlightedTile: GridCoordinate | null
  combatLog: string[]
  isInitialized: boolean
  showSetup: boolean
  isAIBattle: boolean
  showCombatArena: boolean

  // Hero creation state
  showHeroCreation: boolean
  createdHeroes: HeroCharacter[]
  pendingPlayers: Player[] | null
  pendingMapConfig: MapConfig | null

  // Campaign state
  campaignState: CampaignState | null
  campaignMissions: Record<string, MissionDefinition>
  lastMissionResult: MissionResult | null
  showMissionSelect: boolean
  showMissionBriefing: boolean
  pendingMissionId: string | null
  showPostMission: boolean
  showCampaignJournal: boolean
  showSocialPhase: boolean
  showActTransition: boolean
  actTransitionData: { fromAct: number; toAct: number } | null
  showHeroProgression: boolean
  showPortraitManager: boolean
  showCampaignStats: boolean
  showStrategicCommand: boolean
  showMapEditor: boolean
  campaignHeroCreation: boolean // true when creating heroes for a new campaign
  activeSaveSlot: number | null // which save slot this campaign is using
  activeMissionDef: MissionDefinition | null // current mission definition for reinforcement waves
  triggeredWaveIds: string[] // mission reinforcement waves already deployed
  activeMission: Mission | null // lightweight mission object for victory checking (useAITurn reads this)

  // AI visualization state
  aiMovePath: GridCoordinate[] | null
  aiAttackTarget: { from: GridCoordinate; to: GridCoordinate } | null

  // Attack range overlay for selected figure
  attackRange: { center: GridCoordinate; radius: number } | null

  // Player move path preview (computed on hover)
  playerMovePath: GridCoordinate[] | null
  playerMovePathCost: number | null

  // Targets reachable from hovered move destination (LOS preview)
  movePreviewTargets: string[] | null

  // Enemies that can attack the selected figure (threat assessment)
  threateningEnemies: string[]

  // Undo history (stores previous game states for undo)
  gameStateHistory: GameState[]

  // Autosave state
  lastAutosaveTime: number | null

  // UI overlay state
  notifications: GameNotification[]
  threatFlash: boolean
  hoveredObjectiveId: string | null
  tooltipScreenPos: { x: number; y: number } | null
  hoveredFigureId: string | null
  figureTooltipPos: { x: number; y: number } | null
  hoveredTileCoord: { x: number; y: number } | null
  tileTooltipPos: { x: number; y: number } | null

  // Floating combat text
  floatingTexts: FloatingCombatText[]
  addFloatingText: (text: Omit<FloatingCombatText, 'id' | 'createdAt'>) => void

  // Cinematic banners
  roundBanner: { round: number; roundLimit?: number; roundsLeft?: number } | null
  gameOverBanner: { outcome: 'victory' | 'defeat'; condition?: string; rounds?: number } | null

  // Combat speed: 'normal' = 1x, 'fast' = 3x, 'instant' = skip delays
  combatSpeed: 'normal' | 'fast' | 'instant'
  cycleCombatSpeed: () => void

  // Imperial AI state (campaign combat)
  imperialAIPhase: 'thinking' | 'executing' | null

  // Camera control: set to pan the tactical grid camera to a grid position
  cameraTarget: GridCoordinate | null

  // Actions
  initGame: (players: Player[], mapConfig?: MapConfig) => void
  startHeroCreation: (players: Player[], mapConfig?: MapConfig) => void
  addCreatedHero: (hero: HeroCharacter) => void
  finishHeroCreation: () => void
  cancelHeroCreation: () => void
  selectFigure: (figureId: string | null) => void
  moveFigure: (destination: GridCoordinate) => void
  startAttack: (targetId: string) => void
  rallyFigure: () => void
  aimFigure: () => void
  dodgeFigure: () => void
  takeCover: () => void
  standUp: () => void
  strainForManeuver: () => void
  drawHolster: () => void
  guardedStance: () => void
  useTalent: (talentId: string) => void
  useConsumable: (itemId: string, targetId?: string) => void
  getAvailableConsumables: (figure: Figure) => Array<{ item: ConsumableItem; count: number }>
  playTacticCard: (cardId: string, role: 'attacker' | 'defender') => void
  dismissCombat: () => void
  endActivation: () => void
  advancePhase: () => void
  setHighlightedTile: (coord: GridCoordinate | null) => void
  setAIMovePath: (path: GridCoordinate[] | null) => void
  setAIAttackTarget: (target: { from: GridCoordinate; to: GridCoordinate } | null) => void
  clearAIVisualization: () => void
  setCameraTarget: (target: GridCoordinate | null) => void
  addCombatLog: (message: string) => void
  undoLastAction: () => void

  // Combat Arena actions
  openCombatArena: () => void
  closeCombatArena: () => void

  // Campaign actions
  startCampaign: (difficulty: CampaignDifficulty) => void
  finishCampaignHeroCreation: () => void
  showMissionBriefingScreen: (missionId: string) => void
  dismissMissionBriefing: () => void
  startCampaignMission: (missionId: string) => void
  completeCampaignMission: (input: MissionCompletionInput) => void
  returnToMissionSelect: () => void
  dismissActTransition: () => void
  saveCampaignToStorage: () => void
  saveCampaignToSlot: (slotId: number) => void
  loadCampaignFromStorage: () => boolean
  loadCampaignFromSlot: (slotId: number) => boolean
  deleteSaveSlot: (slotId: number) => void
  loadImportedCampaign: (campaign: CampaignState) => void
  exitCampaign: () => void

  // Social phase actions
  openSocialPhase: () => void
  closeSocialPhase: () => void
  updateCampaignState: (cs: CampaignState) => void

  // Hero progression actions
  openHeroProgression: () => void
  closeHeroProgression: () => void

  // Mission briefing actions
  openMissionBriefing: (missionId: string) => void
  closeMissionBriefing: () => void
  deployFromBriefing: () => void

  // Campaign journal actions
  openCampaignJournal: () => void
  closeCampaignJournal: () => void

  // Campaign stats actions
  openCampaignStats: () => void
  closeCampaignStats: () => void

  // Strategic command actions
  openStrategicCommand: () => void
  closeStrategicCommand: () => void

  // Map editor actions
  openMapEditor: () => void
  closeMapEditor: () => void

  // Portrait manager actions
  openPortraitManager: () => void
  closePortraitManager: () => void
  purchaseHeroTalent: (heroId: string, talentId: string, tier: 1 | 2 | 3 | 4 | 5, position: number) => void
  purchaseHeroSkillRank: (heroId: string, skillId: string) => void
  unlockHeroSpecialization: (heroId: string, specializationId: string) => void
  equipHeroItem: (heroId: string, slot: EquipmentSlot, itemId: string) => void
  unequipHeroItem: (heroId: string, slot: EquipmentSlot) => void

  // UI overlay actions
  addNotification: (notif: Omit<GameNotification, 'id' | 'createdAt'>) => void
  removeNotification: (id: string) => void
  setHoveredObjective: (id: string | null, screenPos?: { x: number; y: number }) => void
  setHoveredFigure: (id: string | null, screenPos?: { x: number; y: number }) => void
  setHoveredTile: (coord: { x: number; y: number } | null, screenPos?: { x: number; y: number }) => void
  clearRoundBanner: () => void
  clearGameOverBanner: () => void

  // Helpers
  getGameData: () => GameData | null
  getActivatableTalents: (figure: Figure) => ActivatableTalent[]
}

// ============================================================================
// STORE
// ============================================================================

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  gameState: null,
  gameData: null,
  selectedFigureId: null,
  validMoves: [],
  validTargets: [],
  highlightedTile: null,
  combatLog: [],
  isInitialized: false,
  showSetup: true,
  isAIBattle: false,
  showCombatArena: false,

  // Hero creation state
  showHeroCreation: false,
  createdHeroes: [],
  pendingPlayers: null,
  pendingMapConfig: null,

  // Campaign state
  campaignState: null,
  campaignMissions: {},
  lastMissionResult: null,
  showMissionSelect: false,
  showMissionBriefing: false,
  pendingMissionId: null,
  showPostMission: false,
  showCampaignJournal: false,
  showSocialPhase: false,
  showActTransition: false,
  actTransitionData: null,
  showHeroProgression: false,
  showPortraitManager: false,
  showCampaignStats: false,
  showStrategicCommand: false,
  showMapEditor: false,
  campaignHeroCreation: false,
  activeSaveSlot: null,
  activeMissionDef: null,
  triggeredWaveIds: [],
  activeMission: null,

  // AI visualization state
  aiMovePath: null,
  aiAttackTarget: null,
  attackRange: null,
  playerMovePath: null,
  playerMovePathCost: null,
  movePreviewTargets: null,
  threateningEnemies: [],

  // Imperial AI state (campaign combat)
  imperialAIPhase: null,

  // Camera control
  cameraTarget: null,

  // Undo history
  gameStateHistory: [],

  // Autosave state
  lastAutosaveTime: null,

  // UI overlay state
  notifications: [],
  floatingTexts: [],
  threatFlash: false,
  roundBanner: null,
  gameOverBanner: null,
  hoveredObjectiveId: null,
  tooltipScreenPos: null,
  hoveredFigureId: null,
  figureTooltipPos: null,
  hoveredTileCoord: null,
  tileTooltipPos: null,
  combatSpeed: 'normal',

  cycleCombatSpeed: () => {
    set(state => {
      const next = state.combatSpeed === 'normal' ? 'fast'
        : state.combatSpeed === 'fast' ? 'instant'
        : 'normal'
      return { combatSpeed: next }
    })
  },

  // Combat Arena
  openCombatArena: () => {
    const gameData = loadGameDataV2()
    set({
      showSetup: false,
      showCombatArena: true,
      gameData,
    })
  },

  closeCombatArena: () => {
    set({
      showCombatArena: false,
      showSetup: true,
    })
  },

  // Start hero creation flow (Solo/HotSeat modes)
  startHeroCreation: (players: Player[], mapConfig?: MapConfig) => {
    const gameData = loadGameDataV2()
    set({
      showSetup: false,
      showHeroCreation: true,
      gameData,
      createdHeroes: [],
      pendingPlayers: players,
      pendingMapConfig: mapConfig ?? MAP_PRESETS.skirmish,
    })
  },

  addCreatedHero: (hero: HeroCharacter) => {
    set(state => ({
      createdHeroes: [...state.createdHeroes, hero],
    }))
  },

  finishHeroCreation: () => {
    const { pendingPlayers, pendingMapConfig, createdHeroes } = get()
    if (!pendingPlayers) return

    const gameData = loadGameDataV2()
    const config = pendingMapConfig ?? MAP_PRESETS.skirmish
    const generatedMap = generateMap(config, BOARD_TEMPLATES)

    const mission = {
      id: 'tutorial-1',
      name: 'Imperial Outpost Raid',
      description: 'Raid the Imperial outpost',
      mapId: 'generated',
      roundLimit: 10,
      imperialThreat: 20,
      imperialReinforcementPoints: 5,
      victoryConditions: [
        { side: 'Imperial' as const, description: 'Defeat all operatives', condition: 'allEnemiesDefeated' },
        { side: 'Operative' as const, description: 'Defeat all imperials', condition: 'allEnemiesDefeated' },
      ],
    }

    // Build heroes registry
    const heroesRegistry: Record<string, HeroCharacter> = {}
    for (const hero of createdHeroes) {
      heroesRegistry[hero.id] = hero
    }

    // Create game state with hero registry
    let gameState = createInitialGameStateV2(
      mission,
      pendingPlayers,
      gameData,
      generatedMap,
      {
        heroes: heroesRegistry,
        npcProfiles: gameData.npcProfiles,
      },
    )

    // Deploy with heroes
    const army = createdHeroes.length > 0
      ? heroArmyV2(createdHeroes)
      : defaultArmyV2()
    gameState = deployFiguresV2(gameState, army, gameData)

    // Initialize tactic card deck
    if (gameData.tacticCards && Object.keys(gameData.tacticCards).length > 0) {
      gameState.tacticDeck = initializeTacticDeck(gameData)
    }

    // Build activation order
    gameState.activationOrder = buildActivationOrderV2(gameState)
    gameState.currentActivationIndex = 0
    gameState.turnPhase = 'Activation'

    set({
      gameState,
      gameData,
      isInitialized: true,
      showSetup: false,
      showHeroCreation: false,
      isAIBattle: false,
      createdHeroes: [],
      pendingPlayers: null,
      pendingMapConfig: null,
      combatLog: ['Mission started! Heroes deployed.'],
      gameStateHistory: [],
    })
  },

  cancelHeroCreation: () => {
    set({
      showHeroCreation: false,
      showSetup: true,
      createdHeroes: [],
      pendingPlayers: null,
      pendingMapConfig: null,
    })
  },

  // Initialize game with v2 pipeline
  initGame: (players: Player[], mapConfig?: MapConfig) => {
    const gameData = loadGameDataV2()
    const isAIBattle = players.every(p => p.isAI)
    const config = mapConfig ?? MAP_PRESETS.skirmish
    const generatedMap = generateMap(config, BOARD_TEMPLATES)

    // Scale game parameters to map dimensions: larger maps get more rounds,
    // higher threat income, and deeper deployment zones.
    const scale = computeGameScale(config)

    const mission = {
      id: 'tutorial-1',
      name: 'Imperial Outpost Raid',
      description: 'Raid the Imperial outpost',
      mapId: 'generated',
      roundLimit: isAIBattle ? scale.roundLimit : 5,
      imperialThreat: scale.imperialThreat,
      imperialReinforcementPoints: scale.threatPerRound,
      victoryConditions: isAIBattle ? [
        { side: 'Imperial' as const, description: 'All heroes wounded', condition: 'allHeroesWounded' },
        { side: 'Operative' as const, description: 'Complete 2 of 3 objectives', condition: 'objectivesCompleted', objectiveThreshold: 2 },
      ] : [],
    }

    // Create v2 game state with NPC profiles
    let gameState = createInitialGameStateV2(
      mission,
      players,
      gameData,
      generatedMap,
      { npcProfiles: gameData.npcProfiles },
    )

    if (isAIBattle) {
      // Auto-generate test heroes for the operative side
      const testHeroes = generateTestHeroes(gameData)
      const heroesRegistry: Record<string, HeroCharacter> = {}
      for (const hero of testHeroes) {
        heroesRegistry[hero.id] = hero
      }
      gameState.heroes = heroesRegistry

      // Deploy with auto-generated heroes as operatives
      gameState = deployFiguresV2(gameState, defaultArmyV2(testHeroes), gameData)

      // Place mission objective points along the combat corridor between the
      // two deployment zones. Both armies deploy at y~0 on opposite x-edges,
      // so objectives must be at low y-values (y=1-5) with x between the two
      // deploy zones. This ensures heroes pass through objective positions
      // as they advance toward enemies, making objective interaction viable.
      // Previous bug: objectives were placed at the geometric map center
      // (y=midY~18) which was 18 tiles south of the y~0 combat corridor,
      // resulting in 0 objective interactions across all live game battles.
      const mapW = generatedMap.width
      const midX = Math.floor(mapW / 2)
      gameState.objectivePoints = [
        {
          id: 'obj-terminal-1',
          position: { x: midX - 5, y: 3 },
          type: 'terminal' as const,
          skillRequired: 'computers',
          alternateSkill: 'mechanics',
          difficulty: 2,    // Average (2 purple)
          description: 'Security terminal -- slice to disable base alarms',
          isCompleted: false,
          objectiveId: 'interact-terminals',
        },
        {
          id: 'obj-lock-1',
          position: { x: midX + 3, y: 1 },
          type: 'lock' as const,
          skillRequired: 'skulduggery',
          alternateSkill: 'mechanics',
          difficulty: 2,
          description: 'Reinforced blast door -- bypass the lock mechanism',
          isCompleted: false,
          objectiveId: 'interact-terminals',
        },
        {
          id: 'obj-datapad-1',
          position: { x: midX, y: 5 },
          type: 'datapad' as const,
          skillRequired: 'computers',
          alternateSkill: 'perception',
          difficulty: 2,    // Average (2 purple) -- was 3, synced with simulator Session 28e fix
          description: 'Encrypted datapad -- extract Imperial troop movements',
          isCompleted: false,
          objectiveId: 'interact-terminals',
        },
      ]

      // Build activation order (interleaved Imperial/Operative)
      gameState.activationOrder = buildActivationOrderV2(gameState)
      gameState.currentActivationIndex = 0
      gameState.turnPhase = 'Initiative'
    } else {
      // Manual deployment: create v2 NPC figures for tutorial
      const impPlayer = players.find(p => p.role === 'Imperial')
      const opPlayer = players.find(p => p.role === 'Operative')
      if (impPlayer && opPlayer) {
        const stormtrooperNpc = gameData.npcProfiles['stormtrooper']
        const officerNpc = gameData.npcProfiles['imperial-officer']

        const deployedFigures: Figure[] = [
          {
            id: 'imp-1',
            entityType: 'npc',
            entityId: 'stormtrooper',
            playerId: impPlayer.id,
            position: { x: 2, y: 2 },
            woundsCurrent: 0,
            strainCurrent: 0,
            actionsRemaining: 1,
            maneuversRemaining: 1,
            hasUsedStrainForManeuver: false,
            isActivated: false,
            isDefeated: false,
            isWounded: false,
            conditions: [],
            talentUsesThisEncounter: {},
            talentUsesThisSession: {},
            cachedAttackPool: stormtrooperNpc ? { ...stormtrooperNpc.attackPool } : null,
            cachedDefensePool: stormtrooperNpc ? { ...stormtrooperNpc.defensePool } : null,
          },
          {
            id: 'imp-2',
            entityType: 'npc',
            entityId: 'stormtrooper',
            playerId: impPlayer.id,
            position: { x: 3, y: 2 },
            woundsCurrent: 0,
            strainCurrent: 0,
            actionsRemaining: 1,
            maneuversRemaining: 1,
            hasUsedStrainForManeuver: false,
            isActivated: false,
            isDefeated: false,
            isWounded: false,
            conditions: [],
            talentUsesThisEncounter: {},
            talentUsesThisSession: {},
            cachedAttackPool: stormtrooperNpc ? { ...stormtrooperNpc.attackPool } : null,
            cachedDefensePool: stormtrooperNpc ? { ...stormtrooperNpc.defensePool } : null,
          },
          {
            id: 'op-1',
            entityType: 'npc',
            entityId: 'imperial-officer',
            playerId: opPlayer.id,
            position: { x: 7, y: 7 },
            woundsCurrent: 0,
            strainCurrent: 0,
            actionsRemaining: 1,
            maneuversRemaining: 1,
            hasUsedStrainForManeuver: false,
            isActivated: false,
            isDefeated: false,
            isWounded: false,
            conditions: [],
            talentUsesThisEncounter: {},
            talentUsesThisSession: {},
            cachedAttackPool: officerNpc ? { ...officerNpc.attackPool } : null,
            cachedDefensePool: officerNpc ? { ...officerNpc.defensePool } : null,
          },
        ]

        gameState.figures = deployedFigures
        gameState.activationOrder = ['imp-1', 'imp-2', 'op-1']
        gameState.currentActivationIndex = 0
        gameState.turnPhase = 'Activation'
      }
    }

    // Initialize tactic card deck
    if (gameData.tacticCards && Object.keys(gameData.tacticCards).length > 0) {
      gameState.tacticDeck = initializeTacticDeck(gameData)
    }

    set({
      gameState,
      gameData,
      isInitialized: true,
      showSetup: false,
      isAIBattle,
      activeMission: mission as Mission,
      combatLog: [isAIBattle ? 'AI Battle started!' : 'Game started!'],
      gameStateHistory: [],
    })
  },

  selectFigure: (figureId: string | null) => {
    const { gameState, gameData } = get()
    if (!gameState || !gameData) return

    set({ selectedFigureId: figureId, validMoves: [], validTargets: [], attackRange: null, playerMovePath: null, playerMovePathCost: null, movePreviewTargets: null, threateningEnemies: [] })

    if (figureId) {
      const figure = gameState.figures.find(f => f.id === figureId)
      if (figure) {
        const moves = getValidMoves(figure, gameState)
        set({ validMoves: moves })

        // v2 valid targets using evaluate-v2
        const targets = getValidTargetsV2(figure, figure.position, gameState, gameData)
        set({ validTargets: targets })

        // Attack range overlay
        const range = getAttackRangeInTiles(figure, gameState, gameData)
        set({ attackRange: { center: figure.position, radius: range } })

        // Threat assessment: which enemies can hit this figure
        const threats = getThreateningEnemies(figure, gameState, gameData)
        set({ threateningEnemies: threats })
      }
    }
  },

  moveFigure: (destination: GridCoordinate) => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure) return

    try {
      // Execute Move via v2 turn machine
      const moveAction = {
        type: 'Move' as const,
        figureId: selectedFigureId,
        payload: { path: [destination] },
      }
      const fromPos = { x: figure.position.x, y: figure.position.y }
      const newGameState = executeActionV2(gameState, moveAction, gameData)
      set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
      addCombatLog(`${figure.id} moved to (${destination.x}, ${destination.y})`)

      // Re-select to update valid moves/targets + range overlay
      // Spawn movement trail animation
      const side = figure.owner === 0 ? 'imperial' : 'operative'
      combatAnimations.spawnMoveTrail(fromPos, destination, side)

      // Re-select to update valid moves/targets
      const updatedFigure = newGameState.figures.find(f => f.id === selectedFigureId)
      if (updatedFigure && (updatedFigure.actionsRemaining > 0 || updatedFigure.maneuversRemaining > 0)) {
        const moves = getValidMoves(updatedFigure, newGameState)
        const targets = getValidTargetsV2(updatedFigure, updatedFigure.position, newGameState, gameData)
        const range = getAttackRangeInTiles(updatedFigure, newGameState, gameData)
        set({ validMoves: moves, validTargets: targets, attackRange: { center: updatedFigure.position, radius: range } })
      } else {
        set({ validMoves: [], validTargets: [] })
      }
    } catch (error) {
      addCombatLog(`Invalid move: ${error}`)
    }
  },

  startAttack: (targetId: string) => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const attacker = gameState.figures.find(f => f.id === selectedFigureId)
    const defender = gameState.figures.find(f => f.id === targetId)
    if (!attacker || !defender) return

    try {
      // Resolve weapon ID from entity
      const weaponId = resolveWeaponId(attacker, gameState, gameData)

      const attackAction = {
        type: 'Attack' as const,
        figureId: selectedFigureId,
        payload: { targetId, weaponId },
      }
      const newGameState = executeActionV2(gameState, attackAction, gameData)
      set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })

      const resolution = newGameState.activeCombat?.resolution
      const attackerSide = attacker.owner === 0 ? 'imperial' : 'operative'
      const defenderSide = defender.owner === 0 ? 'imperial' : 'operative'

      // Spawn combat animations
      const isHit = resolution?.isHit ?? false
      combatAnimations.spawnProjectile(attacker.position, defender.position, isHit, attackerSide)

      if (resolution) {
        // Delayed damage number (appears when bolt arrives)
        setTimeout(() => {
          combatAnimations.spawnDamageNumber(defender.position, resolution.woundsDealt, resolution.isHit)
          if (resolution.isDefeated) {
            combatAnimations.spawnDeathParticles(defender.position, defenderSide)
          }
        }, 280) // Synced with 70% of 400ms projectile travel

        addCombatLog(
          `${attacker.id} attacks ${defender.id}: ` +
          (resolution.isHit
            ? `Hit! ${resolution.woundsDealt} wounds dealt`
            : 'Miss!')
        )

        // Floating combat text
        const { addFloatingText } = get()
        if (resolution.isHit && resolution.woundsDealt > 0) {
          addFloatingText({
            gridX: defender.position.x, gridY: defender.position.y,
            text: `-${resolution.woundsDealt}`,
            color: '#ff4444',
            type: resolution.criticalTriggered ? 'critical' : 'damage',
          })
        } else if (!resolution.isHit) {
          addFloatingText({
            gridX: defender.position.x, gridY: defender.position.y,
            text: 'MISS',
            color: '#888888',
            type: 'miss',
          })
        }
        if (resolution.isDefeated) {
          setTimeout(() => get().addFloatingText({
            gridX: defender.position.x, gridY: defender.position.y,
            text: 'DEFEATED',
            color: '#ff2222',
            type: 'defeat',
          }), 300)
          addCombatLog(`  !! ${defender.id} defeated!`)
        }
        if (resolution.tacticCardsPlayed && resolution.tacticCardsPlayed.length > 0 && gameData.tacticCards) {
          const names = resolution.tacticCardsPlayed
            .map(id => gameData.tacticCards?.[id]?.name ?? id)
            .join(', ')
          addCombatLog(`  Tactic cards: ${names}`)
        }
      } else {
        addCombatLog(`Combat: ${attacker.id} vs ${defender.id}`)
      }
    } catch (error) {
      addCombatLog(`Combat error: ${error}`)
    }
  },

  rallyFigure: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure) return

    const rallyAction = {
      type: 'Rally' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, rallyAction, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })

    const updated = newGameState.figures.find(f => f.id === selectedFigureId)
    const recovered = figure.strainCurrent - (updated?.strainCurrent ?? 0)
    const suppressionRemoved = figure.suppressionTokens - (updated?.suppressionTokens ?? 0)
    const parts = [`${selectedFigureId} rallied, recovered ${recovered} strain`]
    if (suppressionRemoved > 0) parts.push(`removed ${suppressionRemoved} suppression`)
    addCombatLog(parts.join(', '))
  },

  aimFigure: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.aimTokens >= 2 || figure.actionsRemaining <= 0) return

    const aimAction = {
      type: 'Aim' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, aimAction, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })

    const updatedFig = newGameState.figures.find(f => f.id === selectedFigureId)
    addCombatLog(`${selectedFigureId} aimed (${updatedFig?.aimTokens ?? 0} aim tokens)`)
  },

  dodgeFigure: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.dodgeTokens >= 1 || figure.actionsRemaining <= 0) return

    const dodgeAction = {
      type: 'Dodge' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, dodgeAction, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
    addCombatLog(`${selectedFigureId} braced for dodge (1 dodge token)`)
  },

  takeCover: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.maneuversRemaining <= 0) return

    const action = {
      type: 'TakeCover' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, action, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
    addCombatLog(`${selectedFigureId} took cover (+1 defense)`)
  },

  standUp: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.maneuversRemaining <= 0) return
    if (!figure.conditions?.includes('Prone')) return

    const action = {
      type: 'StandUp' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, action, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
    addCombatLog(`${selectedFigureId} stood up`)
  },

  strainForManeuver: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.hasUsedStrainForManeuver) return

    const action = {
      type: 'StrainForManeuver' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, action, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
    addCombatLog(`${selectedFigureId} suffered 2 strain for extra maneuver`)
  },

  drawHolster: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.entityType !== 'hero' || figure.maneuversRemaining <= 0) return

    const hero = gameState.heroes[figure.entityId]
    if (!hero?.equipment.secondaryWeapon) return

    // Swap primary and secondary weapons
    const newPrimary = hero.equipment.secondaryWeapon
    const newSecondary = hero.equipment.primaryWeapon

    const action = {
      type: 'DrawHolster' as const,
      figureId: selectedFigureId,
      payload: { weaponId: newPrimary },
    }
    const newGameState = executeActionV2(gameState, action, gameData)

    // Update hero equipment in the new state
    const updatedHeroes = { ...newGameState.heroes }
    updatedHeroes[figure.entityId] = {
      ...updatedHeroes[figure.entityId],
      equipment: {
        ...updatedHeroes[figure.entityId].equipment,
        primaryWeapon: newPrimary,
        secondaryWeapon: newSecondary,
      },
    }

    set({
      gameState: { ...newGameState, heroes: updatedHeroes },
      gameStateHistory: [...gameStateHistory.slice(-19), gameState],
    })

    const weaponName = gameData.weapons?.[newPrimary]?.name ?? newPrimary
    addCombatLog(`${selectedFigureId} drew ${weaponName}`)
  },

  guardedStance: () => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const guardAction = {
      type: 'GuardedStance' as const,
      figureId: selectedFigureId,
      payload: {},
    }
    const newGameState = executeActionV2(gameState, guardAction, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
    addCombatLog(`${selectedFigureId} took guarded stance`)
  },

  useTalent: (talentId: string) => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure) return

    try {
      // Resolve weapon for combat-capable talents
      const weaponId = resolveWeaponId(figure, gameState, gameData)

      const talentAction = {
        type: 'UseTalent' as const,
        figureId: selectedFigureId,
        payload: { talentId, weaponId },
      }
      const newGameState = executeActionV2(gameState, talentAction, gameData)
      set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })

      // Find talent name for log
      const hero = gameState.heroes[figure.entityId]
      let talentName = talentId
      if (hero && gameData.specializations) {
        for (const specId of hero.specializations) {
          const spec = gameData.specializations[specId]
          if (spec) {
            const card = spec.talents.find(t => t.id === talentId)
            if (card) { talentName = card.name; break }
          }
        }
      }

      addCombatLog(`${selectedFigureId} used talent: ${talentName}`)

      // Re-select to update valid moves/targets after talent use
      const updatedFigure = newGameState.figures.find(f => f.id === selectedFigureId)
      if (updatedFigure && (updatedFigure.actionsRemaining > 0 || updatedFigure.maneuversRemaining > 0)) {
        const moves = getValidMoves(updatedFigure, newGameState)
        const targets = getValidTargetsV2(updatedFigure, updatedFigure.position, newGameState, gameData)
        set({ validMoves: moves, validTargets: targets })
      } else {
        set({ validMoves: [], validTargets: [] })
      }
    } catch (error) {
      addCombatLog(`Talent error: ${error}`)
    }
  },

  useConsumable: (itemId: string, targetId?: string) => {
    const { gameState, gameData, selectedFigureId, addCombatLog, gameStateHistory } = get()
    if (!gameState || !gameData || !selectedFigureId) return

    const figure = gameState.figures.find(f => f.id === selectedFigureId)
    if (!figure || figure.actionsRemaining <= 0) return

    const consumable = gameData.consumables?.[itemId]
    if (!consumable) return

    const consumeAction = {
      type: 'UseConsumable' as const,
      figureId: selectedFigureId,
      payload: { itemId, targetId },
    }
    const newGameState = executeActionV2(gameState, consumeAction, gameData)
    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })

    const targetName = targetId ?? selectedFigureId
    addCombatLog(`${selectedFigureId} used ${consumable.name} on ${targetName}`)

    // Re-select to update valid moves/targets
    const updatedFigure = newGameState.figures.find(f => f.id === selectedFigureId)
    if (updatedFigure && (updatedFigure.actionsRemaining > 0 || updatedFigure.maneuversRemaining > 0)) {
      const moves = getValidMoves(updatedFigure, newGameState)
      const targets = getValidTargetsV2(updatedFigure, updatedFigure.position, newGameState, gameData)
      set({ validMoves: moves, validTargets: targets })
    } else {
      set({ validMoves: [], validTargets: [] })
    }
  },

  getAvailableConsumables: (figure: Figure) => {
    const { gameState, gameData } = get()
    if (!gameState || !gameData?.consumables) return []

    const inv = gameState.consumableInventory ?? {}
    const results: Array<{ item: ConsumableItem; count: number }> = []

    for (const [id, item] of Object.entries(gameData.consumables)) {
      const count = inv[id] ?? 0
      // In campaign mode (inventory tracked), must have items; in standalone, always show
      const hasItem = gameState.consumableInventory ? count > 0 : true
      if (!hasItem) continue
      results.push({ item: item as ConsumableItem, count })
    }
    return results
  },

  playTacticCard: (cardId: string, role: 'attacker' | 'defender') => {
    const { gameState, addCombatLog } = get()
    if (!gameState?.tacticDeck) return

    // The player (Operative) always plays from the Operative hand
    const side: 'Operative' | 'Imperial' = 'Operative'
    const updatedDeck = playCard(gameState.tacticDeck, side, cardId)
    if (!updatedDeck) {
      addCombatLog(`Card ${cardId} not found in hand`)
      return
    }

    set({
      gameState: {
        ...gameState,
        tacticDeck: updatedDeck,
      },
    })
    addCombatLog(`Played tactic card: ${cardId}`)
  },

  dismissCombat: () => {
    const { gameState } = get()
    if (!gameState) return
    set({ gameState: { ...gameState, activeCombat: null } })
  },

  endActivation: () => {
    const { gameState, addCombatLog, gameStateHistory } = get()
    if (!gameState) return

    const currentFigureId = gameState.activationOrder[gameState.currentActivationIndex]
    const currentFigure = gameState.figures.find(f => f.id === currentFigureId)

    if (currentFigure) {
      // Mark current figure as activated
      const newFigures = gameState.figures.map(f => {
        if (f.id === currentFigure.id) {
          return { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 }
        }
        return f
      })

      const nextIndex = gameState.currentActivationIndex + 1
      const allDone = nextIndex >= gameState.activationOrder.length

      const newGameState: GameState = {
        ...gameState,
        figures: newFigures,
        // Always advance the index so the campaign AI's exhaustion check works
        currentActivationIndex: nextIndex,
      }

      // Reset next figure for activation
      if (!allDone) {
        const nextFigureId = gameState.activationOrder[nextIndex]
        newGameState.figures = newGameState.figures.map(f => {
          if (f.id === nextFigureId) {
            return resetForActivation(f)
          }
          return f
        })
      }

      set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState], selectedFigureId: null, validMoves: [], validTargets: [] })
      addCombatLog(`${currentFigure.id} activation ended`)

      // Build activation summary for player-controlled figures
      if (currentFigure.playerId === 0) {
        const parts: string[] = []
        if (currentFigure.hasMovedThisActivation) parts.push('Moved')
        if (currentFigure.hasAttackedThisActivation) parts.push('Attacked')
        if (currentFigure.aimTokens > 0) parts.push(`Aim x${currentFigure.aimTokens}`)
        if (currentFigure.hasStandby) parts.push('Standby')
        if (currentFigure.hasUsedStrainForManeuver) parts.push('+Maneuver')
        const summary = parts.length > 0 ? parts.join(', ') : 'No actions taken'
        get().addNotification({
          type: 'info',
          title: `${currentFigure.id} Done`,
          message: summary,
          duration: 2000,
        })
      }

      if (allDone) {
        addCombatLog('All units activated. Advance phase to continue.')
      }
    }
  },

  advancePhase: () => {
    const { gameState, gameData, campaignState, campaignMissions, activeMissionDef, activeMission, triggeredWaveIds, addCombatLog, gameStateHistory } = get()
    if (!gameState) return

    const phases: Array<typeof gameState.turnPhase> = [
      'Setup',
      'Initiative',
      'Activation',
      'Status',
      'Reinforcement',
    ]

    const currentIndex = phases.indexOf(gameState.turnPhase)
    const nextIndex = (currentIndex + 1) % phases.length
    const newPhase = phases[nextIndex]
    let newRound = gameState.roundNumber

    if (newPhase === 'Setup') {
      newRound += 1
    }

    // Draw tactic cards at the start of each new round (Setup phase = new round)
    let newTacticDeck = gameState.tacticDeck
    if (newPhase === 'Setup' && newTacticDeck && gameData?.tacticCards) {
      newTacticDeck = drawCardsForBothSides(newTacticDeck)
      addCombatLog(`Tactic cards drawn for Round ${newRound}`)
    }

    // Reset figures for new activation phase (v2: 1 Action + 1 Maneuver)
    let newFigures = gameState.figures
    if (newPhase === 'Activation') {
      newFigures = gameState.figures.map(f => resetForActivation(f))
    }

    let newGameState: GameState = {
      ...gameState,
      turnPhase: newPhase,
      roundNumber: newRound,
      currentActivationIndex: 0,
      figures: newFigures,
      ...(newTacticDeck ? { tacticDeck: newTacticDeck } : {}),
    }

    // ===== REINFORCEMENT PHASE: spawn new Imperial units =====
    if (newPhase === 'Reinforcement' && gameData) {
      // 1) Threat-based AI reinforcements (accumulate threat, buy units)
      const missionRoundLimit = activeMission?.roundLimit ?? 12
      const threatResult = applyReinforcementPhase(newGameState, gameData, missionRoundLimit)
      newGameState = threatResult.gameState
      if (threatResult.events.length > 0) {
        addCombatLog(`--- Reinforcement: +${threatResult.threatGained} threat, spent ${threatResult.threatSpent} (pool: ${threatResult.newThreatPool}) ---`)
        const deployedNames: string[] = []
        for (const evt of threatResult.events) {
          addCombatLog(`  DEPLOYED: ${evt.npcName} at (${evt.position.x},${evt.position.y}) [cost: ${evt.threatCost}]`)
          deployedNames.push(evt.npcName)
        }
        // UI notification for threat-based reinforcements
        get().addNotification({
          type: 'reinforcement',
          title: 'Imperial Reinforcements',
          message: `Deployed: ${deployedNames.join(', ')} (+${threatResult.threatGained} threat, spent ${threatResult.threatSpent})`,
          duration: 4500,
        })
        // Flash the threat tracker
        set({ threatFlash: true })
        setTimeout(() => set({ threatFlash: false }), 600)
      } else if (threatResult.threatGained > 0) {
        addCombatLog(`--- Reinforcement: +${threatResult.threatGained} threat (pool: ${threatResult.newThreatPool}, nothing purchased) ---`)
      }

      // 2) Mission-scripted reinforcement waves (trigger by round number)
      if (activeMissionDef && activeMissionDef.reinforcements.length > 0) {
        const missionResult = applyMissionReinforcements(
          newGameState,
          gameData,
          activeMissionDef.reinforcements,
          triggeredWaveIds,
        )
        newGameState = missionResult.gameState

        if (missionResult.events.length > 0) {
          // Log narrative text for triggered waves
          for (const narrative of missionResult.narrativeTexts) {
            addCombatLog(`** ${narrative} **`)
            // Cinematic narrative popup for mission-scripted waves
            get().addNotification({
              type: 'narrative',
              title: 'REINFORCEMENTS INCOMING',
              message: narrative,
              duration: 7000,
              isNarrative: true,
            })
          }
          for (const evt of missionResult.events) {
            addCombatLog(`  REINFORCEMENT: ${evt.npcName} at (${evt.position.x},${evt.position.y})`)
          }
          // Track which waves have been triggered
          set(state => ({
            triggeredWaveIds: [...state.triggeredWaveIds, ...missionResult.wavesTriggered],
          }))
          // Flash the threat tracker for scripted waves too
          set({ threatFlash: true })
          setTimeout(() => set({ threatFlash: false }), 600)
        }
      }
    }

    // Check victory conditions during Status phase (campaign mode)
    if (newPhase === 'Status' && campaignState && gameState.activeMissionId) {
      const mission = campaignMissions[gameState.activeMissionId]
      if (mission) {
        // Update completed objectives
        const completedObjectiveIds: string[] = []
        for (const obj of mission.objectives) {
          if (evaluateObjective(obj, newGameState, newGameState.lootCollected, newGameState.interactedTerminals)) {
            completedObjectiveIds.push(obj.id)
          }
        }
        newGameState.completedObjectiveIds = completedObjectiveIds

        // Check victory
        const winningSide = checkVictoryConditions(
          mission,
          newGameState,
          newGameState.lootCollected,
          newGameState.interactedTerminals,
        )

        // Round limit defeat: if we've exceeded the mission's round limit, Imperial wins
        const roundLimitWinner = !winningSide && activeMission?.roundLimit && newRound > activeMission.roundLimit
          ? 'Imperial' as const
          : winningSide

        if (roundLimitWinner) {
          newGameState.winner = roundLimitWinner
          const isRoundLimit = !winningSide && roundLimitWinner === 'Imperial'
          newGameState.victoryCondition = isRoundLimit
            ? `Time ran out! Imperial wins after ${activeMission!.roundLimit} rounds.`
            : `${roundLimitWinner} wins!`

          const outcome = roundLimitWinner === 'Operative' ? 'victory' : 'defeat'
          if (isRoundLimit) {
            addCombatLog(`** MISSION FAILED: Round limit (${activeMission!.roundLimit}) exceeded! **`)
          } else {
            addCombatLog(`** MISSION ${outcome.toUpperCase()}: ${roundLimitWinner} wins! **`)
          }

          // Calculate kill counts
          const heroKills: Record<string, number> = {}
          for (const fig of newGameState.figures) {
            if (fig.entityType === 'hero') {
              heroKills[fig.entityId] = 0
            }
          }
          // Count defeated enemies as kills (simplified attribution)
          const imperialPlayer = newGameState.players.find(p => p.role === 'Imperial')
          if (imperialPlayer) {
            const deadEnemies = newGameState.figures.filter(
              f => f.playerId === imperialPlayer.id && f.isDefeated,
            ).length
            // Distribute kills evenly among living heroes
            const livingHeroes = Object.keys(heroKills)
            if (livingHeroes.length > 0) {
              const perHero = Math.floor(deadEnemies / livingHeroes.length)
              const remainder = deadEnemies % livingHeroes.length
              livingHeroes.forEach((hId, idx) => {
                heroKills[hId] = perHero + (idx < remainder ? 1 : 0)
              })
            }
          }

          // Check if leader killed (Act 1: imperial-officer, inquisitor; Act 2: the-broker)
          const leaderNpcIds = ['imperial-officer', 'the-broker']
          const leaderKilled = newGameState.figures.some(
            f => f.entityType === 'npc' &&
              (leaderNpcIds.includes(f.entityId) || f.entityId.includes('inquisitor')) &&
              f.isDefeated,
          )

          // Heroes incapacitated
          const heroesIncapacitated = newGameState.figures
            .filter(f => f.entityType === 'hero' && f.isDefeated)
            .map(f => f.entityId)

          // Show the victory/defeat state on the tactical grid briefly before transitioning
          set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })

          // Delayed transition to PostMission (gives player time to see the result)
          setTimeout(() => {
            get().completeCampaignMission({
              mission,
              outcome: outcome as 'victory' | 'defeat',
              roundsPlayed: newGameState.roundNumber,
              completedObjectiveIds,
              heroKills,
              lootCollected: newGameState.lootCollected,
              heroesIncapacitated,
              leaderKilled,
              narrativeBonus: outcome === 'victory' ? 2 : 0,
            })
          }, 3000)
          return
        }
      }
    }

    // Also check simple skirmish victory (all enemies of one side defeated)
    if (newPhase === 'Status' && !campaignState) {
      const imperialPlayer = newGameState.players.find(p => p.role === 'Imperial')
      const operativePlayer = newGameState.players.find(p => p.role === 'Operative')
      if (imperialPlayer && operativePlayer) {
        const allImperialsDown = newGameState.figures
          .filter(f => f.playerId === imperialPlayer.id)
          .every(f => f.isDefeated)
        const allOperativesDown = newGameState.figures
          .filter(f => f.playerId === operativePlayer.id)
          .every(f => f.isDefeated)

        if (allImperialsDown) {
          newGameState.winner = 'Operative'
          newGameState.victoryCondition = 'All Imperial forces eliminated!'
          addCombatLog('** VICTORY: Operative forces win! **')
        } else if (allOperativesDown) {
          newGameState.winner = 'Imperial'
          newGameState.victoryCondition = 'All Operative forces eliminated!'
          addCombatLog('** VICTORY: Imperial forces win! **')
        }
      }
    }

    set({ gameState: newGameState, gameStateHistory: [...gameStateHistory.slice(-19), gameState] })
    addCombatLog(`Phase advanced to ${newPhase} (Round ${newRound})`)

    // Trigger round banner on new round
    if (newPhase === 'Setup' && newRound > 1) {
      const roundLimit = activeMission?.roundLimit
      const roundsLeft = roundLimit ? roundLimit - newRound : undefined
      set({
        roundBanner: { round: newRound, roundLimit: roundLimit ?? undefined, roundsLeft },
      })
    }

    // Trigger game over banner on victory/defeat
    if (newGameState.winner) {
      const isVictory = newGameState.winner === 'Operative'
      set({
        gameOverBanner: {
          outcome: isVictory ? 'victory' : 'defeat',
          condition: newGameState.victoryCondition ?? undefined,
          rounds: newGameState.roundNumber,
        },
      })
    }
  },

  setHighlightedTile: (coord: GridCoordinate | null) => {
    const { gameState, gameData, selectedFigureId, validMoves } = get()

    // Compute player move path + targets from destination when hovering a valid move tile
    if (coord && gameState && gameData && selectedFigureId) {
      const isValidMove = validMoves.some(m => m.x === coord.x && m.y === coord.y)
      if (isValidMove) {
        const figure = gameState.figures.find(f => f.id === selectedFigureId)
        if (figure) {
          const path = getPath(figure.position, coord, gameState.map, gameState.figures)
          if (path.length > 0) {
            // Calculate total movement cost along the path
            let totalCost = 0
            for (let i = 0; i < path.length - 1; i++) {
              totalCost += getMovementCost(path[i], path[i + 1], gameState.map)
            }
            // Compute which enemies would be targetable from this position
            const previewTargets = getValidTargetsV2(figure, coord, gameState, gameData)
            set({
              highlightedTile: coord,
              playerMovePath: path,
              playerMovePathCost: totalCost,
              movePreviewTargets: previewTargets.length > 0 ? previewTargets : null,
            })
            return
          }
        }
      }
    }

    set({ highlightedTile: coord, playerMovePath: null, playerMovePathCost: null, movePreviewTargets: null })
  },

  setAIMovePath: (path: GridCoordinate[] | null) => {
    set({ aiMovePath: path })
    // Auto-pan camera to AI move destination
    if (path && path.length > 0) {
      set({ cameraTarget: path[path.length - 1] })
    }
  },

  setAIAttackTarget: (target: { from: GridCoordinate; to: GridCoordinate } | null) => {
    set({ aiAttackTarget: target })
    // Auto-pan camera to AI attack origin
    if (target) {
      set({ cameraTarget: target.from })
    }
  },

  clearAIVisualization: () => {
    set({ aiMovePath: null, aiAttackTarget: null })
  },

  setCameraTarget: (target: GridCoordinate | null) => {
    set({ cameraTarget: target })
  },

  addCombatLog: (message: string) => {
    set(state => ({
      combatLog: [
        ...state.combatLog.slice(-49),
        `[R${state.gameState?.roundNumber ?? 0}] ${message}`,
      ],
    }))
  },

  addFloatingText: (fct) => {
    const entry: FloatingCombatText = {
      ...fct,
      id: `fct-${++fctCounter}`,
      createdAt: Date.now(),
    }
    set(state => ({
      floatingTexts: [...state.floatingTexts.slice(-19), entry],
    }))
  },

  undoLastAction: () => {
    const { gameStateHistory, gameData, addCombatLog } = get()
    if (gameStateHistory.length === 0) {
      addCombatLog('Nothing to undo')
      return
    }
    const previous = gameStateHistory[gameStateHistory.length - 1]
    const newHistory = gameStateHistory.slice(0, -1)

    // Recompute valid moves/targets for restored state
    const currentActivatingId = previous.activationOrder[previous.currentActivationIndex]
    const activatingFigure = previous.figures.find(f => f.id === currentActivatingId)
    let validMoves: GridCoordinate[] = []
    let validTargets: string[] = []
    if (activatingFigure && gameData) {
      if (activatingFigure.maneuversRemaining > 0) {
        validMoves = getValidMoves(activatingFigure, previous)
      }
      if (activatingFigure.actionsRemaining > 0) {
        validTargets = getValidTargetsV2(activatingFigure, activatingFigure.position, previous, gameData).map(t => t.id)
      }
    }

    set({
      gameState: previous,
      gameStateHistory: newHistory,
      selectedFigureId: currentActivatingId ?? null,
      validMoves,
      validTargets,
    })
    addCombatLog('Action undone')
  },

  // ========================================================================
  // UI OVERLAY ACTIONS
  // ========================================================================

  addNotification: (notif) => {
    const id = `notif-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const notification: GameNotification = {
      ...notif,
      id,
      createdAt: Date.now(),
    }
    set(state => ({
      notifications: [...state.notifications, notification],
    }))
    if (notif.duration > 0) {
      setTimeout(() => {
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        }))
      }, notif.duration)
    }
  },

  removeNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }))
  },

  setHoveredObjective: (id, screenPos) => {
    set({
      hoveredObjectiveId: id,
      tooltipScreenPos: screenPos ?? null,
    })
  },

  setHoveredFigure: (id: string | null, screenPos?: { x: number; y: number }) => {
    set({
      hoveredFigureId: id,
      figureTooltipPos: screenPos ?? null,
    })
  },

  setHoveredTile: (coord: { x: number; y: number } | null, screenPos?: { x: number; y: number }) => {
    set({
      hoveredTileCoord: coord,
      tileTooltipPos: screenPos ?? null,
    })
  },

  clearRoundBanner: () => set({ roundBanner: null }),
  clearGameOverBanner: () => set({ gameOverBanner: null }),

  // ========================================================================
  // CAMPAIGN ACTIONS
  // ========================================================================

  /**
   * Start a new campaign: load mission data, enter hero creation for campaign.
   */
  startCampaign: (difficulty: CampaignDifficulty) => {
    const gameData = loadGameDataV2()
    const missions = loadCampaignMissions()

    set({
      showSetup: false,
      showHeroCreation: true,
      campaignHeroCreation: true,
      gameData,
      campaignMissions: missions,
      createdHeroes: [],
      pendingPlayers: [
        { id: 0, name: 'Imperial AI', role: 'Imperial' as const, isLocal: true, isAI: true },
        { id: 1, name: 'Player', role: 'Operative' as const, isLocal: true, isAI: false },
      ],
      pendingMapConfig: null,
      // Store difficulty for campaign creation after heroes are made
      campaignState: {
        id: '',
        name: '',
        difficulty,
        createdAt: '',
        lastPlayedAt: '',
        heroes: {},
        currentAct: 1,
        completedMissions: [],
        availableMissionIds: [],
        credits: 0,
        narrativeItems: [],
        consumableInventory: {},
        threatLevel: 0,
        threatMultiplier: 1,
        missionsPlayed: 0,
      },
    })
  },

  /**
   * Called when hero creation is done in campaign mode.
   * Creates the actual campaign state and shows mission select.
   */
  finishCampaignHeroCreation: () => {
    const { createdHeroes, campaignState, campaignMissions } = get()
    if (!campaignState || createdHeroes.length === 0) return

    const campaign = createCampaign({
      name: (campaignData as any).name ?? 'Campaign',
      difficulty: campaignState.difficulty,
      heroes: createdHeroes,
      startingMissionId: (campaignData as any).startingMissionId ?? 'act1-m1-arrival',
      startingCredits: (campaignData as any).startingCredits ?? 0,
    })

    // Find an empty slot for the new campaign
    const newSlot = findEmptySlot() ?? 1

    set({
      campaignState: campaign,
      activeSaveSlot: newSlot,
      showHeroCreation: false,
      showMissionSelect: true,
      campaignHeroCreation: false,
      createdHeroes: [],
      pendingPlayers: null,
      combatLog: ['Campaign started! Select your first mission.'],
    })

    // Auto-save new campaign
    try {
      saveToSlot(newSlot, campaign)
      saveToSlot(AUTO_SAVE_SLOT, campaign)
    } catch (e) {
      console.error('Failed to auto-save new campaign:', e)
    }
    get().saveCampaignToStorage()
  },

  showMissionBriefingScreen: (missionId: string) => {
    set({
      showMissionSelect: false,
      showMissionBriefing: true,
      pendingMissionId: missionId,
    })
  },

  dismissMissionBriefing: () => {
    const { pendingMissionId } = get()
    if (!pendingMissionId) return
    set({ showMissionBriefing: false, pendingMissionId: null })
    get().startCampaignMission(pendingMissionId)
  },

  /**
   * Launch a campaign mission: set up game state and start playing.
   */
  startCampaignMission: (missionId: string) => {
    // Show mission briefing first, then deploy on confirmation
    get().openMissionBriefing(missionId)
    const { campaignState, campaignMissions } = get()
    if (!campaignState) return

    const mission = campaignMissions[missionId]
    if (!mission) return

    const gameData = loadGameDataV2()
    const mapConfig: MapConfig = {
      preset: mission.mapPreset as any,
      boardsWide: mission.boardsWide,
      boardsTall: mission.boardsTall,
    }
    const generatedMap = generateMap(mapConfig, BOARD_TEMPLATES)

    // Prepare heroes from campaign roster
    const heroes = prepareHeroesForMission(campaignState)
    const heroesRegistry: Record<string, HeroCharacter> = {}
    for (const hero of heroes) {
      heroesRegistry[hero.id] = hero
    }

    // Imperial side is AI-controlled; Operative side is player-controlled
    const players: Player[] = [
      { id: 0, name: 'Imperial AI', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Player', role: 'Operative', isLocal: true, isAI: false },
    ]

    // Apply exposure modifiers for act finales (missionIndex 4)
    const isActFinale = mission.missionIndex === 4
    const exposureModifiers = isActFinale && campaignState.actProgress
      ? getFinaleExposureModifiers(campaignState.actProgress.exposure)
      : { threatBonus: 0, roundLimitModifier: 0, extraReinforcements: [] }

    // Build a mission object compatible with createInitialGameStateV2
    const gameMission = {
      id: mission.id,
      name: mission.name,
      description: mission.description,
      mapId: mission.mapId,
      roundLimit: Math.max(4, mission.roundLimit + exposureModifiers.roundLimitModifier),
      imperialThreat: mission.imperialThreat + exposureModifiers.threatBonus,
      imperialReinforcementPoints: mission.threatPerRound,
      victoryConditions: mission.victoryConditions.map(vc => ({
        side: vc.side,
        description: vc.description,
        condition: vc.requiredObjectiveIds.join(','),
      })),
    }

    // Create game state with objective point templates from mission definition
    let gameState = createInitialGameStateV2(
      gameMission,
      players,
      gameData,
      generatedMap,
      {
        heroes: heroesRegistry,
        npcProfiles: gameData.npcProfiles,
        objectivePointTemplates: mission.objectivePoints,
        lootTokens: mission.lootTokens,
        consumableInventory: { ...(campaignState.consumableInventory ?? {}) },
      },
    )

    // Store the active mission ID for victory condition checks
    gameState.activeMissionId = mission.id

    // Override operative deploy zone with mission-specific positions if provided
    if (mission.operativeDeployZone && mission.operativeDeployZone.length > 0) {
      gameState.map.deploymentZones.operative = mission.operativeDeployZone
    }

    // Deploy heroes + companions as operative army
    const operativeUnits: ArmyCompositionV2['operative'] = heroes.map(h => ({
      entityType: 'hero' as const,
      entityId: h.id,
      count: 1,
    }))

    // Add recruited companions as NPC allies on the operative side
    const companions = campaignState.companions ?? []
    for (const companionId of companions) {
      const combatProfileId = gameData.companionProfiles?.[companionId]
      if (combatProfileId && gameData.npcProfiles[combatProfileId]) {
        operativeUnits.push({
          entityType: 'npc' as const,
          entityId: combatProfileId,
          count: 1,
        })
      }
    }

    const army: ArmyCompositionV2 = {
      imperial: mission.initialEnemies.map(g => ({
        npcId: g.npcProfileId,
        count: g.count,
      })),
      operative: operativeUnits,
    }
    gameState = deployFiguresV2(gameState, army, gameData)

    // Initialize tactic card deck
    if (gameData.tacticCards && Object.keys(gameData.tacticCards).length > 0) {
      gameState.tacticDeck = initializeTacticDeck(gameData)
    }

    // Build activation order
    gameState.activationOrder = buildActivationOrderV2(gameState)
    gameState.currentActivationIndex = 0
    gameState.turnPhase = 'Activation'

    // Merge exposure-driven extra reinforcements into the mission definition
    const effectiveMissionDef = exposureModifiers.extraReinforcements.length > 0
      ? {
          ...mission,
          reinforcements: [
            ...mission.reinforcements,
            ...exposureModifiers.extraReinforcements,
          ],
        }
      : mission

    set({
      gameState,
      gameData,
      isInitialized: true,
      showMissionSelect: false,
      showPostMission: false,
      isAIBattle: false,
      activeMissionDef: effectiveMissionDef,
      triggeredWaveIds: [],
      combatLog: isActFinale && exposureModifiers.threatBonus > 0
        ? [
            `Mission started: ${mission.name}`,
            `** IMPERIAL ALERT: Exposure level has drawn additional forces! **`,
          ]
        : [`Mission started: ${mission.name}`],
      gameStateHistory: [],
    })
  },

  /**
   * Process a completed campaign mission and show the post-mission screen.
   */
  completeCampaignMission: (input: MissionCompletionInput) => {
    const { campaignState, campaignMissions, gameState, activeSaveSlot } = get()
    if (!campaignState) return

    // Sync depleted consumable inventory from mission back to campaign
    const updatedCampaign = gameState?.consumableInventory
      ? { ...campaignState, consumableInventory: { ...gameState.consumableInventory } }
      : campaignState

    const previousAct = updatedCampaign.currentAct
    const { campaign: newCampaign, result } = completeMission(
      updatedCampaign,
      input,
      campaignMissions,
    )

    set({
      campaignState: newCampaign,
      lastMissionResult: result,
      showPostMission: true,
      isInitialized: false,
      gameState: null,
      // Flag act transition if act advanced
      actTransitionData: newCampaign.currentAct > previousAct
        ? { fromAct: previousAct, toAct: newCampaign.currentAct }
        : null,
    })

    // Autosave after mission completion
    try {
      const json = campaignToJSON(newCampaign)
      localStorage.setItem(CAMPAIGN_STORAGE_KEY, json)
    } catch (e) {
      console.error('Autosave after mission failed:', e)
    }
    // Auto-save after mission completion
    try {
      saveToSlot(AUTO_SAVE_SLOT, newCampaign)
      if (activeSaveSlot != null && activeSaveSlot !== AUTO_SAVE_SLOT) {
        saveToSlot(activeSaveSlot, newCampaign)
      }
    } catch (e) {
      console.error('Auto-save after mission failed:', e)
    }
    get().saveCampaignToStorage()
  },

  /**
   * Return from post-mission screen to mission select.
   */
  returnToMissionSelect: () => {
    const { actTransitionData } = get()
    if (actTransitionData) {
      // Show act transition screen before returning to mission select
      set({
        showPostMission: false,
        showActTransition: true,
        lastMissionResult: null,
        activeMissionDef: null,
        activeMission: null,
        triggeredWaveIds: [],
        gameState: null,
        isInitialized: false,
      })
    } else {
      set({
        showPostMission: false,
        showMissionSelect: true,
        lastMissionResult: null,
        activeMissionDef: null,
        activeMission: null,
        triggeredWaveIds: [],
        gameState: null,
        isInitialized: false,
      })
    }
    get().saveCampaignToStorage()
  },

  dismissActTransition: () => {
    set({
      showActTransition: false,
      actTransitionData: null,
      showMissionSelect: true,
    })
  },

  /**
   * Save campaign to the active slot (or legacy key as fallback).
   */
  saveCampaignToStorage: () => {
    const { campaignState, activeSaveSlot } = get()
    if (!campaignState) return

    try {
      const slot = activeSaveSlot ?? AUTO_SAVE_SLOT
      saveToSlot(slot, campaignState)
      // Also keep legacy key updated for backward compat
      const json = campaignToJSON(campaignState)
      localStorage.setItem(CAMPAIGN_STORAGE_KEY, json)
      set({ lastAutosaveTime: Date.now() })
    } catch (e) {
      console.error('Failed to save campaign:', e)
    }
  },

  /**
   * Save campaign to a specific slot.
   */
  saveCampaignToSlot: (slotId: number) => {
    const { campaignState } = get()
    if (!campaignState) return

    try {
      saveToSlot(slotId, campaignState)
      set({ activeSaveSlot: slotId })
      // Also keep legacy key updated
      const json = campaignToJSON(campaignState)
      localStorage.setItem(CAMPAIGN_STORAGE_KEY, json)
    } catch (e) {
      console.error('Failed to save campaign to slot:', e)
    }
  },

  /**
   * Load campaign from localStorage (legacy single-key).
   * Migrates to slot system if needed.
   */
  loadCampaignFromStorage: (): boolean => {
    // Try migration first
    migrateLegacySave()

    try {
      const json = localStorage.getItem(CAMPAIGN_STORAGE_KEY)
      if (!json) return false

      const campaign = campaignFromJSON(json)
      const missions = loadCampaignMissions()
      const gameData = loadGameDataV2()

      set({
        campaignState: campaign,
        campaignMissions: missions,
        gameData,
        activeSaveSlot: null,
        showSetup: false,
        showMissionSelect: true,
      })
      return true
    } catch (e) {
      console.error('Failed to load campaign:', e)
      return false
    }
  },

  /**
   * Load campaign from a specific save slot.
   */
  loadCampaignFromSlot: (slotId: number): boolean => {
    try {
      const campaign = loadFromSlot(slotId)
      if (!campaign) return false

      const missions = loadCampaignMissions()
      const gameData = loadGameDataV2()

      set({
        campaignState: campaign,
        campaignMissions: missions,
        gameData,
        activeSaveSlot: slotId,
        showSetup: false,
        showMissionSelect: true,
      })
      return true
    } catch (e) {
      console.error(`Failed to load save slot ${slotId}:`, e)
      return false
    }
  },

  /**
   * Delete a save slot.
   */
  deleteSaveSlot: (slotId: number) => {
    deleteSlot(slotId)
  },

  /**
   * Load an imported campaign state directly (from export bundle).
   * Persists to a new save slot.
   */
  loadImportedCampaign: (campaign: CampaignState) => {
    const missions = loadCampaignMissions()
    const gameData = loadGameDataV2()

    // Find an empty slot for the import, or use slot 1
    const slot = findEmptySlot() ?? 1

    set({
      campaignState: campaign,
      campaignMissions: missions,
      gameData,
      activeSaveSlot: slot,
      showSetup: false,
      showMissionSelect: true,
      showMissionBriefing: false,
      pendingMissionId: null,
      showPostMission: false,
      showCampaignJournal: false,
      showSocialPhase: false,
      showActTransition: false,
      actTransitionData: null,
      showHeroProgression: false,
      showPortraitManager: false,
      showCampaignStats: false,
      showStrategicCommand: false,
      showMapEditor: false,
      // Clear stale combat state from previous campaign
      gameState: null,
      selectedFigureId: null,
      validMoves: [],
      validTargets: [],
      highlightedTile: null,
      gameStateHistory: [],
      floatingTexts: [],
      combatLog: [],
    })

    // Persist to slot and legacy key
    saveToSlot(slot, campaign)
    const json = campaignToJSON(campaign)
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, json)
  },

  /**
   * Exit campaign mode and return to setup.
   * Auto-saves before exiting.
   */
  exitCampaign: () => {
    // Auto-save before exiting
    const { campaignState, activeSaveSlot } = get()
    if (campaignState) {
      try {
        const slot = activeSaveSlot ?? AUTO_SAVE_SLOT
        saveToSlot(slot, campaignState)
        const json = campaignToJSON(campaignState)
        localStorage.setItem(CAMPAIGN_STORAGE_KEY, json)
      } catch (e) {
        console.error('Failed to auto-save on exit:', e)
      }
    }

    set({
      campaignState: null,
      campaignMissions: {},
      lastMissionResult: null,
      activeSaveSlot: null,
      showMissionSelect: false,
      showMissionBriefing: false,
      pendingMissionId: null,
      showPostMission: false,
      showCampaignJournal: false,
      showSocialPhase: false,
      showActTransition: false,
      actTransitionData: null,
      showHeroProgression: false,
      showPortraitManager: false,
      showCampaignStats: false,
      showStrategicCommand: false,
      showMapEditor: false,
      campaignHeroCreation: false,
      activeMissionDef: null,
      activeMission: null,
      triggeredWaveIds: [],
      imperialAIPhase: null,
      cameraTarget: null,
      showSetup: true,
      gameState: null,
      isInitialized: false,
      // Clear combat/UI state
      selectedFigureId: null,
      validMoves: [],
      validTargets: [],
      highlightedTile: null,
      gameStateHistory: [],
      floatingTexts: [],
      combatLog: [],
    })
  },

  /**
   * Open the social phase screen (between missions).
   */
  openSocialPhase: () => {
    set({
      showPostMission: false,
      showMissionSelect: false,
      showSocialPhase: true,
    })
  },

  /**
   * Close social phase and return to mission select.
   */
  closeSocialPhase: () => {
    const { campaignState, activeSaveSlot } = get()
    set({
      showSocialPhase: false,
      showMissionSelect: true,
      lastMissionResult: null,
    })

    // Autosave after social phase completion
    if (campaignState) {
      try {
        const json = campaignToJSON(campaignState)
        localStorage.setItem(CAMPAIGN_STORAGE_KEY, json)
      } catch (e) {
        console.error('Autosave after social phase failed:', e)
      }
    }
    // Auto-save after social phase
    if (campaignState) {
      try {
        saveToSlot(AUTO_SAVE_SLOT, campaignState)
        if (activeSaveSlot != null && activeSaveSlot !== AUTO_SAVE_SLOT) {
          saveToSlot(activeSaveSlot, campaignState)
        }
      } catch (e) {
        console.error('Auto-save after social phase failed:', e)
      }
    }
    get().saveCampaignToStorage()
  },

  /**
   * Generic campaign state setter for social phase mutations.
   */
  updateCampaignState: (cs: CampaignState) => {
    set({ campaignState: cs })
    get().saveCampaignToStorage()
  },

  // ---- Hero Progression ----

  openHeroProgression: () => {
    set({
      showMissionSelect: false,
      showHeroProgression: true,
    })
  },

  closeHeroProgression: () => {
    const { campaignState, activeSaveSlot } = get()
    set({
      showHeroProgression: false,
      showMissionSelect: true,
    })
    // Auto-save after hero progression
    if (campaignState) {
      try {
        saveToSlot(AUTO_SAVE_SLOT, campaignState)
        if (activeSaveSlot != null && activeSaveSlot !== AUTO_SAVE_SLOT) {
          saveToSlot(activeSaveSlot, campaignState)
        }
      } catch (e) {
        console.error('Auto-save after hero progression failed:', e)
      }
    }
    get().saveCampaignToStorage()
  },

  // ---- Portrait Manager ----

  openPortraitManager: () => {
    set({
      showMissionSelect: false,
      showPortraitManager: true,
    })
  },

  closePortraitManager: () => {
    set({
      showPortraitManager: false,
      showMissionSelect: true,
    })
  },

  // ---- Campaign Stats ----

  openCampaignStats: () => {
    set({
      showMissionSelect: false,
      showCampaignStats: true,
    })
  },

  closeCampaignStats: () => {
    set({
      showCampaignStats: false,
      showMissionSelect: true,
    })
  },

  // ---- Strategic Command ----

  openStrategicCommand: () => {
    set({
      showMissionSelect: false,
      showStrategicCommand: true,
    })
  },

  closeStrategicCommand: () => {
    set({
      showStrategicCommand: false,
      showMissionSelect: true,
    })
  },

  // ---- Mission Briefing ----

  openMissionBriefing: (missionId: string) => {
    const { campaignState, campaignMissions } = get()
    if (!campaignState) return

    const mission = campaignMissions[missionId]
    if (!mission) return

    const gameData = loadGameDataV2()
    const mapConfig: MapConfig = {
      preset: mission.mapPreset as any,
      boardsWide: mission.boardsWide,
      boardsTall: mission.boardsTall,
    }
    const generatedMap = generateMap(mapConfig, BOARD_TEMPLATES)

    const heroes = prepareHeroesForMission(campaignState)
    const heroesRegistry: Record<string, HeroCharacter> = {}
    for (const hero of heroes) {
      heroesRegistry[hero.id] = hero
    }

    const players: Player[] = [
      { id: 0, name: 'Imperial AI', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
    ]

    const gameMission = {
      id: mission.id,
      name: mission.name,
      description: mission.description,
      mapId: mission.mapId,
      roundLimit: mission.roundLimit,
      imperialThreat: mission.imperialThreat,
      imperialReinforcementPoints: mission.threatPerRound,
      victoryConditions: mission.victoryConditions.map(vc => ({
        side: vc.side,
        description: vc.description,
        condition: vc.requiredObjectiveIds.join(','),
      })),
    }

    let gameState = createInitialGameStateV2(
      gameMission,
      players,
      gameData,
      generatedMap,
      {
        heroes: heroesRegistry,
        npcProfiles: gameData.npcProfiles,
        objectivePointTemplates: mission.objectivePoints,
        lootTokens: mission.lootTokens,
      },
    )

    gameState.activeMissionId = mission.id

    if (mission.operativeDeployZone && mission.operativeDeployZone.length > 0) {
      gameState.map.deploymentZones.operative = mission.operativeDeployZone
    }

    const army: ArmyCompositionV2 = {
      imperial: mission.initialEnemies.map(g => ({
        npcId: g.npcProfileId,
        count: g.count,
      })),
      operative: heroes.map(h => ({
        entityType: 'hero' as const,
        entityId: h.id,
        count: 1,
      })),
    }
    gameState = deployFiguresV2(gameState, army, gameData)

    gameState.activationOrder = gameState.figures
      .filter(f => !f.isDefeated)
      .map(f => f.id)
    gameState.currentActivationIndex = 0
    gameState.turnPhase = 'Activation'

    // Store prepared game state but show briefing first
    set({
      gameState,
      gameData,
      isInitialized: false, // Don't start combat yet
      showMissionSelect: false,
      showMissionBriefing: true,
      showPostMission: false,
      isAIBattle: false,
      activeMissionDef: mission,
      triggeredWaveIds: [],
      combatLog: [],
    })
  },

  closeMissionBriefing: () => {
    // Cancel briefing, return to mission select
    set({
      showMissionBriefing: false,
      showMissionSelect: true,
      gameState: null,
      isInitialized: false,
      activeMissionDef: null,
    })
  },

  deployFromBriefing: () => {
    const { activeMissionDef } = get()
    if (!activeMissionDef) return
    set({
      showMissionBriefing: false,
      isInitialized: true,
      combatLog: [`Mission started: ${activeMissionDef.name}`],
    })
  },

  // ---- Campaign Journal ----

  openCampaignJournal: () => {
    set({
      showMissionSelect: false,
      showCampaignJournal: true,
    })
  },

  closeCampaignJournal: () => {
    set({
      showCampaignJournal: false,
      showMissionSelect: true,
    })
  },

  // ---- Map Editor ----

  openMapEditor: () => {
    set({
      showSetup: false,
      showMapEditor: true,
    })
  },

  closeMapEditor: () => {
    set({
      showMapEditor: false,
      showSetup: true,
    })
  },

  purchaseHeroTalent: (heroId: string, talentId: string, tier: 1 | 2 | 3 | 4 | 5, position: number) => {
    const { campaignState } = get()
    if (!campaignState) return
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const gameData = loadGameDataV2()
    const updatedHero = purchaseTalent(hero, talentId, tier, position, gameData)
    set({
      campaignState: {
        ...campaignState,
        heroes: { ...campaignState.heroes, [heroId]: updatedHero },
      },
    })
    get().saveCampaignToStorage()
  },

  purchaseHeroSkillRank: (heroId: string, skillId: string) => {
    const { campaignState } = get()
    if (!campaignState) return
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const gameData = loadGameDataV2()
    const updatedHero = purchaseSkillRank(hero, skillId, gameData)
    set({
      campaignState: {
        ...campaignState,
        heroes: { ...campaignState.heroes, [heroId]: updatedHero },
      },
    })
    get().saveCampaignToStorage()
  },

  unlockHeroSpecialization: (heroId: string, specializationId: string) => {
    const { campaignState } = get()
    if (!campaignState) return
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const gameData = loadGameDataV2()
    const updatedHero = unlockSpecialization(hero, specializationId, gameData)
    set({
      campaignState: {
        ...campaignState,
        heroes: { ...campaignState.heroes, [heroId]: updatedHero },
      },
    })
    get().saveCampaignToStorage()
  },

  equipHeroItem: (heroId: string, slot: EquipmentSlot, itemId: string) => {
    const { campaignState } = get()
    if (!campaignState) return
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const gameData = loadGameDataV2()

    // Remove item from inventory
    let updatedCampaign = removeFromInventory(campaignState, itemId)

    // Equip the item (may return a previously equipped item)
    const { hero: updatedHero, previousItemId } = equipItem(hero, slot, itemId, gameData)

    // Return previous item to inventory
    if (previousItemId) {
      updatedCampaign = addToInventory(updatedCampaign, previousItemId)
    }

    set({
      campaignState: {
        ...updatedCampaign,
        heroes: { ...updatedCampaign.heroes, [heroId]: updatedHero },
      },
    })
  },

  unequipHeroItem: (heroId: string, slot: EquipmentSlot) => {
    const { campaignState } = get()
    if (!campaignState) return
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const gameData = loadGameDataV2()

    const { hero: updatedHero, removedItemId } = unequipItem(hero, slot, gameData)

    // Add removed item back to inventory
    let updatedCampaign: CampaignState = campaignState
    if (removedItemId) {
      updatedCampaign = addToInventory(campaignState, removedItemId)
    }

    set({
      campaignState: {
        ...updatedCampaign,
        heroes: { ...updatedCampaign.heroes, [heroId]: updatedHero },
      },
    })
  },

  getGameData: () => {
    let { gameData } = get()
    if (!gameData) {
      gameData = loadGameDataV2()
      set({ gameData })
    }
    return gameData
  },

  getActivatableTalents: (figure: Figure): ActivatableTalent[] => {
    const { gameState, gameData } = get()
    if (!gameState || !gameData || figure.entityType !== 'hero') return []

    const hero = gameState.heroes[figure.entityId]
    if (!hero) return []

    const equipped = getEquippedTalents(hero, gameData)
    const activatable: ActivatableTalent[] = []

    for (const card of equipped) {
      if (card.type !== 'active') continue

      // Check if the talent can be activated right now
      const result = canActivateTalent(card.id, hero, figure, gameData)
      if (!result.canActivate) continue

      // Determine strain cost from mechanical effect
      let strainCost: number | undefined
      const effect = card.mechanicalEffect
      if (effect.strainCost != null) {
        strainCost = effect.strainCost as number
      }

      activatable.push({
        talentId: card.id,
        name: card.name,
        description: card.description,
        activation: card.activation,
        strainCost,
      })
    }

    return activatable
  },
}))

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the primary weapon ID for a figure.
 */
function resolveWeaponId(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): string {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId]
    if (hero?.equipment.primaryWeapon) return hero.equipment.primaryWeapon
    return 'fists'
  }

  const npc = gameState.npcProfiles[figure.entityId]
  if (npc && npc.weapons.length > 0) {
    return npc.weapons[0].weaponId
  }

  return 'fists'
}

// Debug: expose store + helpers on window for dev tooling (dev only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as any).__store = useGameStore
  ;(window as any).__createHero = createHero
}

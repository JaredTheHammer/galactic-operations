/**
 * Galactic Operations v2 - Campaign Engine
 * Manages persistent campaign state between missions: hero roster, XP awards,
 * mission progression, save/load, and threat scaling.
 *
 * Phase 8: Campaign Layer
 */

import type {
  CampaignState,
  CampaignSaveFile,
  CampaignDifficulty,
  MissionDefinition,
  MissionResult,
  MissionObjective,
  HeroCharacter,
  XPAwardConfig,
  LootReward,
  Side,
  Figure,
  GameState,
  CriticalInjuryDefinition,
  LegacyEventDefinition,
} from './types';

import { DEFAULT_XP_AWARDS, THREAT_SCALING } from './types';
import { processNaturalRecovery } from './critical-injuries';
import { updateMomentum, applyMomentumCredits } from './momentum';
import { processOverworldPostMission } from './campaign-overworld';
import { processLegacyEvents } from './legacy-events';
import type { LegacyEventContext } from './legacy-events';

// ============================================================================
// CAMPAIGN CREATION
// ============================================================================

export interface CampaignCreationInput {
  name: string;
  difficulty: CampaignDifficulty;
  heroes: HeroCharacter[];
  startingMissionId: string;
  startingCredits?: number;
}

/**
 * Create a new campaign state from scratch.
 * Heroes are cloned into the campaign roster with full wounds/strain reset.
 */
export function createCampaign(input: CampaignCreationInput): CampaignState {
  const now = new Date().toISOString();
  const scaling = THREAT_SCALING[input.difficulty];

  const heroes: Record<string, HeroCharacter> = {};
  for (const hero of input.heroes) {
    heroes[hero.id] = {
      ...hero,
      wounds: { current: 0, threshold: hero.wounds.threshold },
      strain: { current: 0, threshold: hero.strain.threshold },
    };
  }

  return {
    id: `campaign-${Date.now()}`,
    name: input.name,
    difficulty: input.difficulty,
    createdAt: now,
    lastPlayedAt: now,
    heroes,
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: [input.startingMissionId],
    credits: input.startingCredits ?? 0,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: scaling.baseMultiplier,
    missionsPlayed: 0,
  };
}

// ============================================================================
// MISSION AVAILABILITY
// ============================================================================

/**
 * Given a set of mission definitions and the current campaign state,
 * return mission IDs that are currently available (prerequisites met).
 */
export function getAvailableMissions(
  allMissions: Record<string, MissionDefinition>,
  campaign: CampaignState,
): string[] {
  const completedIds = new Set(campaign.completedMissions.map(r => r.missionId));

  return Object.values(allMissions)
    .filter(m => {
      // Already completed? Skip.
      if (completedIds.has(m.id)) return false;
      // All prerequisites must be completed
      // Note: prerequisites use OR logic for branching paths (any one prerequisite suffices)
      if (m.prerequisites.length === 0) return true;
      return m.prerequisites.some(prereqId => completedIds.has(prereqId));
    })
    .map(m => m.id);
}

/**
 * Check if a specific mission is available given campaign state.
 */
export function isMissionAvailable(
  missionId: string,
  allMissions: Record<string, MissionDefinition>,
  campaign: CampaignState,
): boolean {
  const mission = allMissions[missionId];
  if (!mission) return false;
  const completedIds = new Set(campaign.completedMissions.map(r => r.missionId));
  if (completedIds.has(missionId)) return false;
  if (mission.prerequisites.length === 0) return true;
  return mission.prerequisites.some(prereqId => completedIds.has(prereqId));
}

// ============================================================================
// THREAT SCALING
// ============================================================================

/**
 * Compute effective threat for a mission, accounting for campaign difficulty
 * and escalation from completed missions.
 */
export function computeEffectiveThreat(
  mission: MissionDefinition,
  campaign: CampaignState,
): number {
  const scaling = THREAT_SCALING[campaign.difficulty];
  const escalation = campaign.missionsPlayed * scaling.perMission;
  const baseThreat = mission.imperialThreat + escalation;
  return Math.round(baseThreat * campaign.threatMultiplier);
}

/**
 * Compute effective threat-per-round, scaled by campaign difficulty.
 */
export function computeEffectiveThreatPerRound(
  mission: MissionDefinition,
  campaign: CampaignState,
): number {
  return Math.round(mission.threatPerRound * campaign.threatMultiplier);
}

// ============================================================================
// XP CALCULATION
// ============================================================================

/**
 * Calculate XP earned from a completed mission.
 * Returns the breakdown and total.
 */
export function calculateMissionXP(
  mission: MissionDefinition,
  outcome: 'victory' | 'defeat' | 'draw',
  completedObjectiveIds: string[],
  lootCollected: string[],
  totalKills: number,
  leaderKilled: boolean,
  narrativeBonus: number,
  config: XPAwardConfig = DEFAULT_XP_AWARDS,
): MissionResult['xpBreakdown'] {
  const participation = config.participation;
  const missionSuccess = outcome === 'victory' ? config.missionSuccess : 0;
  const lootTokens = lootCollected.length * config.perLootToken;
  const enemyKills = Math.min(totalKills * config.perEnemyKill, config.maxKillXP);
  const leaderKill = leaderKilled ? config.leaderKill : 0;

  // Objective bonus: sum xpReward for completed objectives
  const objectiveBonus = mission.objectives
    .filter(obj => completedObjectiveIds.includes(obj.id))
    .reduce((sum, obj) => sum + obj.xpReward, 0);

  // Narrative bonus clamped to allowed range
  const clampedNarrative = Math.max(
    config.narrativeBonusMin,
    Math.min(narrativeBonus, config.narrativeBonusMax),
  );
  // Only award narrative bonus if > 0 was specified
  const finalNarrative = narrativeBonus > 0 ? clampedNarrative : 0;

  const total =
    participation + missionSuccess + lootTokens + enemyKills +
    leaderKill + objectiveBonus + finalNarrative;

  return {
    participation,
    missionSuccess,
    lootTokens,
    enemyKills,
    leaderKill,
    objectiveBonus,
    narrativeBonus: finalNarrative,
    total,
  };
}

/**
 * Calculate Ability Points earned from a mission.
 *
 * Base: 1 AP per mission completed (victory or draw).
 * Bonus: +1 if all objectives completed, +1 if no heroes incapacitated.
 * Act finales: +2 bonus.
 */
export function calculateMissionAP(
  outcome: 'victory' | 'defeat' | 'draw',
  completedObjectiveIds: string[],
  totalObjectives: number,
  heroesIncapacitated: string[],
  isActFinale: boolean = false,
): number {
  if (outcome === 'defeat') return 0;

  let ap = 1; // Base award for mission completion
  if (completedObjectiveIds.length >= totalObjectives) ap += 1; // All objectives
  if (heroesIncapacitated.length === 0) ap += 1; // Flawless
  if (isActFinale) ap += 2; // Act finale bonus
  return ap;
}

// ============================================================================
// MISSION COMPLETION
// ============================================================================

export interface MissionCompletionInput {
  mission: MissionDefinition;
  outcome: 'victory' | 'defeat' | 'draw';
  roundsPlayed: number;
  completedObjectiveIds: string[];
  heroKills: Record<string, number>;
  lootCollected: string[];
  heroesIncapacitated: string[];
  /** Heroes who reached wound threshold at least once (isWounded=true at mission end) */
  heroesWounded?: string[];
  leaderKilled: boolean;
  narrativeBonus?: number;
  /** New critical injuries sustained during this mission: heroId -> injuryId[] */
  newCriticalInjuries?: Record<string, string[]>;
  /** Critical injury definitions for natural recovery processing */
  criticalInjuryDefs?: Record<string, CriticalInjuryDefinition>;
  /** Legacy event definitions for post-mission event checking */
  legacyEventDefs?: Record<string, LegacyEventDefinition>;
  /** Whether an act just ended (triggers escalation) */
  actJustEnded?: boolean;
}

/**
 * Process a completed mission: award XP, update hero roster, advance campaign.
 * Returns the updated campaign state and the mission result.
 */
export function completeMission(
  campaign: CampaignState,
  input: MissionCompletionInput,
  allMissions: Record<string, MissionDefinition>,
): { campaign: CampaignState; result: MissionResult } {
  const { mission, outcome, roundsPlayed, completedObjectiveIds, heroKills, lootCollected, heroesIncapacitated, leaderKilled } = input;
  const heroesWounded = input.heroesWounded ?? [];
  const narrativeBonus = input.narrativeBonus ?? 0;

  // Calculate total kills
  const totalKills = Object.values(heroKills).reduce((sum, k) => sum + k, 0);

  // Calculate XP
  const xpBreakdown = calculateMissionXP(
    mission, outcome, completedObjectiveIds,
    lootCollected, totalKills, leaderKilled, narrativeBonus,
  );

  // Calculate AP
  const isActFinale = mission.missionIndex === 4;
  const apAwarded = calculateMissionAP(
    outcome, completedObjectiveIds, mission.objectives.length,
    heroesIncapacitated, isActFinale,
  );

  // Build mission result
  const result: MissionResult = {
    missionId: mission.id,
    outcome,
    roundsPlayed,
    completedObjectiveIds,
    xpBreakdown,
    apAwarded,
    heroKills,
    lootCollected,
    heroesIncapacitated,
    completedAt: new Date().toISOString(),
  };

  // Clone campaign state with persistent wound tracking
  const deployedHeroIds = new Set([
    ...heroesIncapacitated,
    ...heroesWounded,
    ...Object.keys(heroKills),
  ]);

  const newHeroes: Record<string, HeroCharacter> = {};
  for (const [id, hero] of Object.entries(campaign.heroes)) {
    const wasIncapacitated = heroesIncapacitated.includes(id);
    const wasWoundedInMission = heroesWounded.includes(id);
    const wasDeployed = deployedHeroIds.has(id);

    // Determine persistent wounded status:
    // - Incapacitated heroes are always wounded going forward
    // - Heroes who were wounded (but not incapacitated) carry the wound
    // - Previously wounded heroes who rested this mission (not deployed) recover
    // - Previously wounded heroes who deployed and survived unwounded still carry the wound
    let persistentWounded: boolean;
    if (wasIncapacitated || wasWoundedInMission) {
      persistentWounded = true;
    } else if (!wasDeployed && (hero.isWounded ?? false)) {
      // Hero sat out this mission -- natural recovery
      persistentWounded = false;
    } else {
      // Deployed and not wounded this mission, or not previously wounded
      persistentWounded = hero.isWounded ?? false;
    }

    // Track missions rested (for heroes who weren't deployed)
    const missionsRested = wasDeployed ? 0 : (hero.missionsRested ?? 0) + 1;

    // Backward-compat: heroes from older saves may lack abilityPoints
    const heroAP = hero.abilityPoints ?? { total: 0, available: 0 };

    newHeroes[id] = {
      ...hero,
      // Award XP to each hero
      xp: {
        total: hero.xp.total + xpBreakdown.total,
        available: hero.xp.available + xpBreakdown.total,
      },
      // Award AP to each hero
      abilityPoints: {
        total: heroAP.total + apAwarded,
        available: heroAP.available + apAwarded,
      },
      // Reset wounds and strain between missions (combat damage doesn't carry)
      wounds: { current: 0, threshold: hero.wounds.threshold },
      strain: { current: 0, threshold: hero.strain.threshold },
      // Persistent wounded status
      isWounded: persistentWounded,
      // Reset rest counter: when deployed (back to 0), when just recovered (back to 0),
      // otherwise increment if not deployed
      missionsRested: wasDeployed || (hero.isWounded && !persistentWounded) ? 0 : missionsRested,
    };
  }

  // Process loot rewards
  let credits = campaign.credits;
  const narrativeItems = [...campaign.narrativeItems];
  const inventory = [...(campaign.inventory ?? [])];
  for (const lootId of lootCollected) {
    const lootToken = mission.lootTokens.find(l => l.id === lootId);
    if (!lootToken) continue;
    const reward = lootToken.reward;
    switch (reward.type) {
      case 'credits':
        credits += reward.value;
        break;
      case 'narrative':
        if (!narrativeItems.includes(reward.itemId)) {
          narrativeItems.push(reward.itemId);
        }
        break;
      case 'equipment':
        inventory.push(reward.itemId);
        break;
      // XP loot is already counted in lootCollected -> lootTokens XP
    }
  }

  // Determine newly available missions
  const completedMissions = [...campaign.completedMissions, result];
  const completedIds = new Set(completedMissions.map(r => r.missionId));
  const alreadyAvailable = new Set(campaign.availableMissionIds);

  const newAvailable: string[] = [];

  // First check missions explicitly listed in unlocksNext
  for (const nextId of mission.unlocksNext) {
    const nextMission = allMissions[nextId];
    if (!nextMission) continue;
    if (completedIds.has(nextId)) continue;
    if (nextMission.prerequisites.length === 0 || nextMission.prerequisites.some(p => completedIds.has(p))) {
      newAvailable.push(nextId);
    }
  }

  // Also scan ALL missions for newly-satisfied prerequisites (handles cross-act transitions
  // where Act N+1 M1 lists Act N finale as a prerequisite but isn't in unlocksNext)
  const newAvailableSet = new Set(newAvailable);
  for (const [mId, mDef] of Object.entries(allMissions)) {
    if (completedIds.has(mId)) continue;
    if (alreadyAvailable.has(mId)) continue;
    if (newAvailableSet.has(mId)) continue;
    if (mDef.prerequisites.length === 0) continue;
    if (mDef.prerequisites.every(p => completedIds.has(p))) {
      newAvailable.push(mId);
      newAvailableSet.add(mId);
    }
  }

  // Merge with existing available, remove completed
  const availableMissionIds = [
    ...campaign.availableMissionIds.filter(id => !completedIds.has(id)),
    ...newAvailable.filter(id => !campaign.availableMissionIds.includes(id)),
  ];

  // Advance threat level
  const scaling = THREAT_SCALING[campaign.difficulty];

  // Advance act if newly available missions belong to a higher act
  let currentAct = campaign.currentAct;
  for (const nextId of newAvailable) {
    const nextMission = allMissions[nextId];
    if (nextMission?.campaignAct && nextMission.campaignAct > currentAct) {
      currentAct = nextMission.campaignAct;
    }
  }

  // --- Pandemic Legacy: Critical Injuries ---
  // Apply new critical injuries from this mission and process natural recovery
  const criticalInjuryDefs = input.criticalInjuryDefs ?? {};
  const newCriticalInjuries = input.newCriticalInjuries ?? {};
  for (const [heroId, heroRef] of Object.entries(newHeroes)) {
    // Add new critical injuries sustained this mission
    const injuryIds = newCriticalInjuries[heroId] ?? [];
    let updatedHero = heroRef;
    for (const injuryId of injuryIds) {
      const existing = updatedHero.criticalInjuries ?? [];
      updatedHero = {
        ...updatedHero,
        criticalInjuries: [
          ...existing,
          {
            injuryId,
            sustainedInMission: mission.id,
            missionsRested: 0,
            treatmentAttempted: false,
          },
        ],
      };
    }

    // Process natural recovery for existing injuries
    const wasDeployed = deployedHeroIds.has(heroId);
    if (Object.keys(criticalInjuryDefs).length > 0) {
      updatedHero = processNaturalRecovery(updatedHero, wasDeployed, criticalInjuryDefs);
    }

    newHeroes[heroId] = updatedHero;
  }

  let newCampaign: CampaignState = {
    ...campaign,
    lastPlayedAt: new Date().toISOString(),
    heroes: newHeroes,
    completedMissions,
    availableMissionIds,
    credits,
    narrativeItems,
    inventory,
    currentAct,
    threatLevel: campaign.threatLevel + scaling.perMission,
    missionsPlayed: campaign.missionsPlayed + 1,
  };

  // --- Pandemic Legacy: Momentum System ---
  // Only active when the campaign has momentum initialized (opted in)
  const allObjectivesCompleted = completedObjectiveIds.length >= mission.objectives.length;
  const noHeroesWounded = heroesWounded.length === 0 && heroesIncapacitated.length === 0;
  const allHeroesIncap = Object.keys(campaign.heroes).length > 0 &&
    heroesIncapacitated.length >= Object.keys(campaign.heroes).length;
  if (campaign.momentum !== undefined) {
    newCampaign = updateMomentum(
      newCampaign, outcome, allObjectivesCompleted, noHeroesWounded, allHeroesIncap,
    );
    newCampaign = applyMomentumCredits(newCampaign);
  }

  // --- Pandemic Legacy: Campaign Overworld ---
  if (newCampaign.overworld) {
    newCampaign = processOverworldPostMission(
      newCampaign, mission.id, outcome,
      allObjectivesCompleted, noHeroesWounded, allHeroesIncap,
      input.actJustEnded ?? false,
    );
  }

  // --- Pandemic Legacy: Legacy Event Deck ---
  if (input.legacyEventDefs && Object.keys(input.legacyEventDefs).length > 0) {
    const eventContext: LegacyEventContext = {
      campaign: newCampaign,
      completedMissionId: mission.id,
      missionOutcome: outcome,
      actStarted: currentAct > campaign.currentAct ? currentAct : undefined,
      actEnded: input.actJustEnded ? campaign.currentAct : undefined,
      heroesWounded,
      newCriticalInjuries: Object.entries(newCriticalInjuries).flatMap(([heroId, ids]) =>
        ids.map(id => {
          const def = criticalInjuryDefs[id];
          return { heroId, severity: def?.severity ?? 'minor' as const };
        })
      ),
    };

    const { campaign: postEventCampaign } = processLegacyEvents(
      newCampaign, input.legacyEventDefs, eventContext,
    );
    newCampaign = postEventCampaign;
  }

  return { campaign: newCampaign, result };
}

// ============================================================================
// HERO ROSTER MANAGEMENT
// ============================================================================

/**
 * Add a new hero to the campaign roster.
 */
export function addHeroToCampaign(
  campaign: CampaignState,
  hero: HeroCharacter,
): CampaignState {
  if (campaign.heroes[hero.id]) {
    throw new Error(`Hero ${hero.id} already exists in campaign`);
  }
  return {
    ...campaign,
    heroes: {
      ...campaign.heroes,
      [hero.id]: {
        ...hero,
        wounds: { current: 0, threshold: hero.wounds.threshold },
        strain: { current: 0, threshold: hero.strain.threshold },
      },
    },
  };
}

/**
 * Update a hero in the campaign roster (e.g., after XP spending).
 */
export function updateHeroInCampaign(
  campaign: CampaignState,
  hero: HeroCharacter,
): CampaignState {
  if (!campaign.heroes[hero.id]) {
    throw new Error(`Hero ${hero.id} not found in campaign`);
  }
  return {
    ...campaign,
    heroes: {
      ...campaign.heroes,
      [hero.id]: hero,
    },
  };
}

/**
 * Remove a hero from the campaign roster (e.g., permanent death).
 */
export function removeHeroFromCampaign(
  campaign: CampaignState,
  heroId: string,
): CampaignState {
  if (!campaign.heroes[heroId]) {
    throw new Error(`Hero ${heroId} not found in campaign`);
  }
  const newHeroes = { ...campaign.heroes };
  delete newHeroes[heroId];
  return {
    ...campaign,
    heroes: newHeroes,
  };
}

// ============================================================================
// HERO RECOVERY
// ============================================================================

/** Cost in credits to medically recover a wounded hero */
export const MEDICAL_RECOVERY_COST = 50;

/**
 * Pay credits to immediately recover a wounded hero.
 * Returns the updated campaign state, or throws if hero is not wounded or credits insufficient.
 */
export function recoverHero(
  campaign: CampaignState,
  heroId: string,
): CampaignState {
  const hero = campaign.heroes[heroId];
  if (!hero) throw new Error(`Hero ${heroId} not found in campaign`);
  if (!hero.isWounded) throw new Error(`Hero ${heroId} is not wounded`);
  if (campaign.credits < MEDICAL_RECOVERY_COST) {
    throw new Error(`Insufficient credits: need ${MEDICAL_RECOVERY_COST}, have ${campaign.credits}`);
  }

  return {
    ...campaign,
    credits: campaign.credits - MEDICAL_RECOVERY_COST,
    heroes: {
      ...campaign.heroes,
      [heroId]: {
        ...hero,
        isWounded: false,
        missionsRested: 0,
      },
    },
  };
}

/**
 * Get a summary of each hero's recovery status for the between-mission screen.
 */
export function getHeroRecoveryStatus(campaign: CampaignState): Array<{
  heroId: string;
  heroName: string;
  isWounded: boolean;
  canAffordRecovery: boolean;
  recoveryCost: number;
}> {
  return Object.values(campaign.heroes).map(hero => ({
    heroId: hero.id,
    heroName: hero.name,
    isWounded: hero.isWounded ?? false,
    canAffordRecovery: campaign.credits >= MEDICAL_RECOVERY_COST,
    recoveryCost: MEDICAL_RECOVERY_COST,
  }));
}

// ============================================================================
// SAVE / LOAD
// ============================================================================

const SAVE_VERSION = '1.0.0';

/**
 * Serialize campaign state to a save file format (JSON-stringifiable).
 */
export function saveCampaign(campaign: CampaignState): CampaignSaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    campaign: {
      ...campaign,
      lastPlayedAt: new Date().toISOString(),
    },
  };
}

/**
 * Deserialize a save file back to campaign state.
 * Validates the version and basic structure.
 */
export function loadCampaign(saveFile: CampaignSaveFile): CampaignState {
  if (!saveFile.version) {
    throw new Error('Invalid save file: missing version');
  }
  if (!saveFile.campaign) {
    throw new Error('Invalid save file: missing campaign data');
  }
  const c = saveFile.campaign;

  // Validate required fields
  if (!c.id || typeof c.id !== 'string') {
    throw new Error('Invalid save file: campaign.id missing or invalid');
  }
  if (!c.heroes || typeof c.heroes !== 'object') {
    throw new Error('Invalid save file: campaign.heroes missing or invalid');
  }
  if (!Array.isArray(c.completedMissions)) {
    throw new Error('Invalid save file: campaign.completedMissions missing or invalid');
  }
  if (!Array.isArray(c.availableMissionIds)) {
    throw new Error('Invalid save file: campaign.availableMissionIds missing or invalid');
  }

  return c;
}

/**
 * Serialize campaign state to a JSON string.
 */
export function campaignToJSON(campaign: CampaignState): string {
  const saveFile = saveCampaign(campaign);
  return JSON.stringify(saveFile, null, 2);
}

/**
 * Deserialize a JSON string to campaign state.
 */
export function campaignFromJSON(json: string): CampaignState {
  const saveFile: CampaignSaveFile = JSON.parse(json);
  return loadCampaign(saveFile);
}

// ============================================================================
// MISSION SETUP HELPERS
// ============================================================================

/**
 * Prepare heroes for a mission: reset wounds/strain, clear talent usage.
 * Returns cloned heroes ready for deployment.
 */
export function prepareHeroesForMission(
  campaign: CampaignState,
  heroIds?: string[],
): HeroCharacter[] {
  const ids = heroIds ?? Object.keys(campaign.heroes);
  return ids.map(id => {
    const hero = campaign.heroes[id];
    if (!hero) throw new Error(`Hero ${id} not found in campaign`);
    return {
      ...hero,
      wounds: { current: 0, threshold: hero.wounds.threshold },
      strain: { current: 0, threshold: hero.strain.threshold },
    };
  });
}

/**
 * Build the initial NPC deployment for a mission, accounting for threat scaling.
 * Returns NPC profile IDs and counts.
 */
export function buildMissionDeployment(
  mission: MissionDefinition,
  campaign: CampaignState,
): { npcProfileId: string; count: number; asMinGroup: boolean }[] {
  // For now, return initial enemies as-is. Threat scaling affects reinforcements.
  // Future: add bonus NPCs if effectiveThreat > mission.imperialThreat
  return mission.initialEnemies.map(g => ({
    npcProfileId: g.npcProfileId,
    count: g.count,
    asMinGroup: g.asMinGroup,
  }));
}

/**
 * Check which reinforcement waves should trigger for a given round.
 */
export function getReinforcementsForRound(
  mission: MissionDefinition,
  round: number,
  campaign: CampaignState,
): typeof mission.reinforcements {
  return mission.reinforcements.filter(wave => {
    if (wave.triggerRound !== round) return false;
    // Check threat budget
    const effectiveThreat = computeEffectiveThreat(mission, campaign);
    return wave.threatCost <= effectiveThreat;
  });
}

// ============================================================================
// OBJECTIVE EVALUATION
// ============================================================================

/**
 * Evaluate whether a specific objective is complete based on game state.
 * This is a helper for the turn machine to check objectives each round.
 */
export function evaluateObjective(
  objective: MissionObjective,
  gameState: GameState,
  lootCollected: string[],
  interactedTerminals: string[],
): boolean {
  switch (objective.type) {
    case 'eliminate_all': {
      // All enemy figures on the opposing side must be defeated
      const targetSide: Side = objective.side === 'Operative' ? 'Imperial' : 'Operative';
      const enemyPlayer = gameState.players.find(p => p.role === targetSide);
      if (!enemyPlayer) return true;
      return gameState.figures
        .filter(f => f.playerId === enemyPlayer.id)
        .every(f => f.isDefeated);
    }

    case 'eliminate_target': {
      if (!objective.targetId) return false;
      // Find all figures matching the target NPC profile ID
      return gameState.figures
        .filter(f => f.entityType === 'npc' && f.entityId === objective.targetId)
        .every(f => f.isDefeated);
    }

    case 'survive_rounds': {
      if (!objective.roundCount) return false;
      // At least one hero must be alive AND we've reached the round count
      const heroesAlive = gameState.figures
        .filter(f => f.entityType === 'hero' && !f.isDefeated);
      return gameState.roundNumber >= objective.roundCount && heroesAlive.length > 0;
    }

    case 'extract': {
      if (!objective.zoneCoordinates || objective.zoneCoordinates.length === 0) return false;
      // All non-defeated heroes must be in the extraction zone
      const zone = new Set(objective.zoneCoordinates.map(c => `${c.x},${c.y}`));
      const heroes = gameState.figures.filter(f => f.entityType === 'hero' && !f.isDefeated);
      if (heroes.length === 0) return false;
      return heroes.every(h => zone.has(`${h.position.x},${h.position.y}`));
    }

    case 'defend_point': {
      if (!objective.zoneCoordinates || !objective.roundCount) return false;
      // No enemy figures in the zone AND we've reached the round count
      const zone = new Set(objective.zoneCoordinates.map(c => `${c.x},${c.y}`));
      const targetSide: Side = objective.side === 'Operative' ? 'Imperial' : 'Operative';
      const enemyPlayer = gameState.players.find(p => p.role === targetSide);
      if (!enemyPlayer) return gameState.roundNumber >= objective.roundCount;
      const enemiesInZone = gameState.figures
        .filter(f => f.playerId === enemyPlayer.id && !f.isDefeated)
        .filter(f => zone.has(`${f.position.x},${f.position.y}`));
      return enemiesInZone.length === 0 && gameState.roundNumber >= objective.roundCount;
    }

    case 'interact_terminal': {
      if (!objective.targetCount) return false;
      return interactedTerminals.length >= objective.targetCount;
    }

    case 'collect_loot': {
      if (!objective.targetCount) return false;
      return lootCollected.length >= objective.targetCount;
    }

    case 'escort': {
      // Escort objective: allied NPC (identified by targetId) must reach extraction zone alive
      if (!objective.zoneCoordinates || objective.zoneCoordinates.length === 0) return false;
      if (!objective.targetId) return false;
      const escortZone = new Set(objective.zoneCoordinates.map(c => `${c.x},${c.y}`));
      const escortTargets = gameState.figures.filter(
        f => f.entityId === objective.targetId && !f.isDefeated,
      );
      if (escortTargets.length === 0) return false; // target is dead or not on board
      return escortTargets.every(f => escortZone.has(`${f.position.x},${f.position.y}`));
    }

    default:
      return false;
  }
}

/**
 * Check all victory conditions and determine if the mission is over.
 * Returns the winning side if any condition is met, null otherwise.
 */
export function checkVictoryConditions(
  mission: MissionDefinition,
  gameState: GameState,
  lootCollected: string[],
  interactedTerminals: string[],
): Side | null {
  for (const vc of mission.victoryConditions) {
    if (vc.requiredObjectiveIds.length === 0) {
      // Legacy/simple condition: check if all heroes or all enemies are defeated
      if (vc.side === 'Imperial') {
        const heroes = gameState.figures.filter(f => f.entityType === 'hero');
        if (heroes.length > 0 && heroes.every(f => f.isDefeated)) {
          return 'Imperial';
        }
      }
      continue;
    }

    // Check if all required objectives are complete
    const allComplete = vc.requiredObjectiveIds.every(objId => {
      const obj = mission.objectives.find(o => o.id === objId);
      if (!obj) return false;
      return evaluateObjective(obj, gameState, lootCollected, interactedTerminals);
    });

    if (allComplete) return vc.side;
  }

  // Check round limit
  if (gameState.roundNumber > mission.roundLimit) {
    // If round limit exceeded, Imperial wins by default (defense)
    return 'Imperial';
  }

  return null;
}

// ============================================================================
// CAMPAIGN STATISTICS
// ============================================================================

/**
 * Get aggregate statistics for a campaign.
 */
export function getCampaignStats(campaign: CampaignState): {
  missionsPlayed: number;
  victories: number;
  defeats: number;
  totalXPEarned: number;
  totalKills: number;
  totalCredits: number;
  heroCount: number;
  averageMissionXP: number;
} {
  const victories = campaign.completedMissions.filter(r => r.outcome === 'victory').length;
  const defeats = campaign.completedMissions.filter(r => r.outcome === 'defeat').length;
  const totalXPEarned = campaign.completedMissions.reduce(
    (sum, r) => sum + r.xpBreakdown.total, 0,
  );
  const totalKills = campaign.completedMissions.reduce(
    (sum, r) => sum + Object.values(r.heroKills).reduce((s, k) => s + k, 0), 0,
  );

  return {
    missionsPlayed: campaign.missionsPlayed,
    victories,
    defeats,
    totalXPEarned,
    totalKills,
    totalCredits: campaign.credits,
    heroCount: Object.keys(campaign.heroes).length,
    averageMissionXP: campaign.missionsPlayed > 0 ? Math.round(totalXPEarned / campaign.missionsPlayed) : 0,
  };
}

// ============================================================================
// EQUIPMENT INVENTORY MANAGEMENT
// ============================================================================

/**
 * Get the campaign's equipment inventory, handling backward compatibility
 * for campaigns created before the inventory system. For legacy campaigns,
 * derives inventory from narrativeItems (item: prefixed entries) minus
 * items currently equipped on heroes.
 */
export function getInventory(campaign: CampaignState): string[] {
  if (campaign.inventory !== undefined) return campaign.inventory;

  // Legacy migration: derive from narrativeItems
  const allOwnedItems = campaign.narrativeItems
    .filter(n => n.startsWith('item:'))
    .map(n => n.slice(5)); // strip 'item:' prefix

  // Subtract items currently equipped on heroes
  const equippedItems: string[] = [];
  for (const hero of Object.values(campaign.heroes)) {
    if (hero.equipment.primaryWeapon) equippedItems.push(hero.equipment.primaryWeapon);
    if (hero.equipment.secondaryWeapon) equippedItems.push(hero.equipment.secondaryWeapon);
    if (hero.equipment.armor) equippedItems.push(hero.equipment.armor);
  }

  // Remove equipped items from pool (handle duplicates correctly)
  const remaining = [...allOwnedItems];
  for (const eq of equippedItems) {
    const idx = remaining.indexOf(eq);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  return remaining;
}

/**
 * Add an item to the campaign's equipment inventory.
 */
export function addToInventory(
  campaign: CampaignState,
  itemId: string,
): CampaignState {
  const inventory = [...getInventory(campaign), itemId];
  return { ...campaign, inventory };
}

/**
 * Remove one instance of an item from the campaign's equipment inventory.
 * Returns the updated campaign, or the same campaign if the item wasn't found.
 */
export function removeFromInventory(
  campaign: CampaignState,
  itemId: string,
): CampaignState {
  const inventory = [...getInventory(campaign)];
  const idx = inventory.indexOf(itemId);
  if (idx === -1) return campaign;
  inventory.splice(idx, 1);
  return { ...campaign, inventory };
}

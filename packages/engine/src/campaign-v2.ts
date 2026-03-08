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
  ExplorationReward,
  RelicFragmentType,
  GameData,
  MissionSecretObjectiveState,
  BountyContract,
  CriticalInjuryDefinition,
  LegacyEventDefinition,
  ActProgress,
  ActOutcome,
  ActOutcomeTier,
  ExposureStatus,
  CampaignEpilogue,
  CampaignEpilogueTier,
} from './types';

import {
  DEFAULT_XP_AWARDS,
  THREAT_SCALING,
  createActProgress,
  getExposureStatus,
  getActOutcomeTier,
} from './types';
import { addFragment } from './relic-fragments';
import { decrementDirectiveDurations, getDirectiveXPBonus } from './agenda-phase';
import { resolveSecretObjectives, applySecretObjectiveRewards } from './secret-objectives';
import { processNaturalRecovery } from './critical-injuries';
import { updateMomentum, applyMomentumCredits } from './momentum';
import { processOverworldPostMission } from './campaign-overworld';
import { processLegacyEvents } from './legacy-events';
import type { LegacyEventContext } from './legacy-events';

// ============================================================================
// BOUNTY COMPLETION
// ============================================================================

export interface BountyCompletionResult {
  bountyId: string;
  bountyName: string;
  targetName: string;
  condition: 'eliminate' | 'capture' | 'interrogate';
  creditReward: number;
  reputationReward?: { factionId: string; delta: number };
  wasPrepped: boolean;
}

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

  // Initialize focus tokens for all heroes at 0
  const focusTokens: Record<string, number> = {};
  for (const hero of input.heroes) {
    focusTokens[hero.id] = 0;
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
    factionReputation: {},
    focusTokens,
    actProgress: createActProgress(1),
    actOutcomes: [],
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
  /** Focus tokens per hero at mission end (from Figure.focusTokens). Persisted to campaign. */
  heroFocusTokens?: Record<string, number>;
  /** Exploration rewards collected during the mission */
  explorationRewards?: ExplorationReward[];
  /** Secret objective state at mission end (for resolution) */
  secretObjectiveState?: MissionSecretObjectiveState;
  /** Entity IDs of defeated enemy NPCs (for bounty completion) */
  defeatedNpcIds?: string[];
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
  gameData?: GameData,
): { campaign: CampaignState; result: MissionResult; bountyCompletions: BountyCompletionResult[] } {
  const { mission, outcome, roundsPlayed, completedObjectiveIds, heroKills, lootCollected, heroesIncapacitated, leaderKilled } = input;
  const heroesWounded = input.heroesWounded ?? [];
  const narrativeBonus = input.narrativeBonus ?? 0;

  // Calculate total kills
  const totalKills = Object.values(heroKills).reduce((sum, k) => sum + k, 0);

  // Calculate XP (including agenda directive bonuses)
  const directiveXPBonus = getDirectiveXPBonus(campaign);
  const xpBreakdown = calculateMissionXP(
    mission, outcome, completedObjectiveIds,
    lootCollected, totalKills, leaderKilled, narrativeBonus + directiveXPBonus,
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

  // Process exploration rewards (relic fragments, extra credits, equipment, etc.)
  let campaignWithFragments = { ...campaign, credits, narrativeItems, inventory } as CampaignState;
  const explorationRewards = input.explorationRewards ?? [];
  for (const reward of explorationRewards) {
    switch (reward.type) {
      case 'relic_fragment':
        campaignWithFragments = addFragment(campaignWithFragments, reward.fragmentType, 1);
        break;
      case 'credits':
        credits += reward.value;
        break;
      case 'narrative_item':
        if (!narrativeItems.includes(reward.itemId)) {
          narrativeItems.push(reward.itemId);
        }
        break;
      case 'equipment':
        inventory.push(reward.itemId);
        break;
    }
  }

  // Resolve secret objectives
  let completedSecretObjectives = campaign.completedSecretObjectives ?? [];
  if (input.secretObjectiveState && gameData) {
    const newlyCompleted = resolveSecretObjectives(input.secretObjectiveState, mission.id, gameData);
    if (newlyCompleted.length > 0) {
      // applySecretObjectiveRewards handles XP/AP/credits for individual heroes
      const afterRewards = applySecretObjectiveRewards(
        { ...campaignWithFragments, heroes: newHeroes, completedSecretObjectives },
        newlyCompleted,
      );
      // Pull updated heroes and credits from the rewards application
      Object.assign(newHeroes, afterRewards.heroes);
      credits = afterRewards.credits;
      completedSecretObjectives = afterRewards.completedSecretObjectives ?? [];
    }
  }

  // Decrement active agenda directive durations
  const afterDirectives = decrementDirectiveDurations(campaign);
  const updatedDirectives = afterDirectives.activeDirectives;
  // Check bounty completion
  const defeatedNpcIds = new Set(input.defeatedNpcIds ?? []);
  const activeBounties = campaign.activeBounties ?? [];
  const completedBountyIds = [...(campaign.completedBounties ?? [])];
  const bountyCompletions: BountyCompletionResult[] = [];

  const bountyFactionRep = { ...(campaign.factionReputation ?? {}) };
  for (const bounty of activeBounties) {
    if (defeatedNpcIds.has(bounty.targetNpcId)) {
      completedBountyIds.push(bounty.id);
      credits += bounty.creditReward;
      bountyCompletions.push({
        bountyId: bounty.id,
        bountyName: bounty.name,
        targetName: bounty.targetName,
        condition: bounty.condition,
        creditReward: bounty.creditReward,
        reputationReward: bounty.reputationReward,
        wasPrepped: (campaign.bountyPrepResults ?? []).some(
          p => p.bountyId === bounty.id && p.success,
        ),
      });

      if (bounty.reputationReward) {
        bountyFactionRep[bounty.reputationReward.factionId] =
          (bountyFactionRep[bounty.reputationReward.factionId] ?? 0) + bounty.reputationReward.delta;
      }
    }
  }

  // Remove completed bounties from active list
  const remainingBounties = activeBounties.filter(b => !defeatedNpcIds.has(b.targetNpcId));

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

  // Persist focus tokens from mission figures to campaign
  const focusTokens = { ...(campaign.focusTokens ?? {}) };
  if (input.heroFocusTokens) {
    for (const [heroId, tokens] of Object.entries(input.heroFocusTokens)) {
      focusTokens[heroId] = tokens;
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

  // --- Rebellion Mechanics: Exposure & Influence/Control ---
  let actProgress = campaign.actProgress ?? createActProgress(campaign.currentAct);

  // Ensure actProgress matches current act (backward compat)
  if (actProgress.act !== campaign.currentAct) {
    actProgress = createActProgress(campaign.currentAct);
  }

  const exposureDelta = calculateMissionExposure(
    mission, outcome, heroesIncapacitated, completedObjectiveIds,
    totalKills, roundsPlayed,
  );
  const influenceDelta = calculateMissionInfluence(outcome, completedObjectiveIds);
  const controlDelta = calculateMissionControl(outcome, heroesIncapacitated);

  // Check if intel was gathered this mission (reduces exposure, max once per act)
  const newIntelItems = lootCollected.filter(id => {
    const token = mission.lootTokens.find(l => l.id === id);
    return token?.reward.type === 'narrative';
  });
  // Intel reduction: -1 exposure, max once per act
  const intelReduction = (newIntelItems.length > 0 && !actProgress.intelReductionUsed) ? -1 : 0;

  actProgress = updateActProgress(
    actProgress,
    exposureDelta + intelReduction,
    influenceDelta,
    controlDelta,
  );

  if (intelReduction < 0) {
    actProgress = { ...actProgress, intelReductionUsed: true };
  }

  // Handle act finale: freeze outcome and apply consequences
  let actOutcomes = [...(campaign.actOutcomes ?? [])];
  let actOutcomeForResult: ActOutcome | undefined;

  if (isActFinale) {
    const frozenOutcome = freezeActOutcome(actProgress);
    actOutcomes = [...actOutcomes, frozenOutcome];
    actOutcomeForResult = frozenOutcome;
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
    focusTokens,
    // TI4-inspired systems
    relicFragments: campaignWithFragments.relicFragments,
    completedSecretObjectives,
    activeDirectives: updatedDirectives,
    factionReputation: bountyCompletions.length > 0 ? bountyFactionRep : campaign.factionReputation,
    completedBounties: completedBountyIds,
    activeBounties: remainingBounties,
    // Clear prep results for completed bounties
    bountyPrepResults: (campaign.bountyPrepResults ?? []).filter(
      p => !completedBountyIds.includes(p.bountyId),
    ),
    actProgress,
    actOutcomes,
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

  // If act advanced, apply consequences from the completed act and reset progress
  if (currentAct > campaign.currentAct && actOutcomeForResult) {
    newCampaign = applyActOutcomeConsequences(newCampaign, actOutcomeForResult);
    newCampaign.actProgress = createActProgress(currentAct);
  }

  return { campaign: newCampaign, result, bountyCompletions };
}

// ============================================================================
// REBELLION MECHANICS: EXPOSURE & INFLUENCE/CONTROL
// ============================================================================

/** High body count threshold that triggers +1 exposure */
const HIGH_KILL_THRESHOLD = 8;

/** Exposure thresholds that grant one-time Control bonuses */
const EXPOSURE_CONTROL_THRESHOLDS: Array<{ threshold: number; controlBonus: number }> = [
  { threshold: 4, controlBonus: 1 },  // Detected
  { threshold: 7, controlBonus: 2 },  // Hunted
];

/**
 * Calculate exposure changes from a completed mission.
 */
export function calculateMissionExposure(
  mission: MissionDefinition,
  outcome: 'victory' | 'defeat' | 'draw',
  heroesIncapacitated: string[],
  completedObjectiveIds: string[],
  totalKills: number,
  roundsPlayed: number,
): number {
  let delta = 0;

  // Mission defeat: +2
  if (outcome === 'defeat') delta += 2;

  // Hero incapacitated: +1 each
  delta += heroesIncapacitated.length;

  // Missed objectives: +1 per incomplete objective
  const incompleteObjectives = mission.objectives.filter(
    obj => !completedObjectiveIds.includes(obj.id),
  );
  delta += incompleteObjectives.length;

  // High body count: +1
  if (totalKills > HIGH_KILL_THRESHOLD) delta += 1;

  // Round limit reached: +1
  if (roundsPlayed >= mission.roundLimit) delta += 1;

  // Perfect mission: -1 (all objectives, no incapacitated)
  if (
    outcome === 'victory' &&
    incompleteObjectives.length === 0 &&
    heroesIncapacitated.length === 0
  ) {
    delta -= 1;
  }

  return delta;
}

/**
 * Calculate influence changes from a completed mission.
 */
export function calculateMissionInfluence(
  outcome: 'victory' | 'defeat' | 'draw',
  completedObjectiveIds: string[],
): number {
  let delta = 0;

  // Mission victory: +2
  if (outcome === 'victory') delta += 2;

  // Each completed objective: +1
  delta += completedObjectiveIds.length;

  return delta;
}

/**
 * Calculate control changes from a completed mission.
 */
export function calculateMissionControl(
  outcome: 'victory' | 'defeat' | 'draw',
  heroesIncapacitated: string[],
): number {
  let delta = 0;

  // Passive per mission: +1
  delta += 1;

  // Mission defeat: +3
  if (outcome === 'defeat') delta += 3;

  // Mission draw: +1
  if (outcome === 'draw') delta += 1;

  // Hero incapacitated: +1 each
  delta += heroesIncapacitated.length;

  return delta;
}

/**
 * Update act progress with mission results.
 * Handles exposure threshold crossing bonuses to control.
 */
export function updateActProgress(
  progress: ActProgress,
  exposureDelta: number,
  influenceDelta: number,
  controlDelta: number,
): ActProgress {
  const newExposure = Math.max(0, Math.min(10, progress.exposure + exposureDelta));
  let extraControl = 0;
  const newThresholds = [...progress.exposureThresholdsTriggered];

  // Check exposure threshold crossings for one-time control bonuses
  for (const { threshold, controlBonus } of EXPOSURE_CONTROL_THRESHOLDS) {
    if (newExposure >= threshold && !progress.exposureThresholdsTriggered.includes(threshold)) {
      extraControl += controlBonus;
      newThresholds.push(threshold);
    }
  }

  return {
    ...progress,
    exposure: newExposure,
    influence: progress.influence + influenceDelta,
    control: progress.control + controlDelta + extraControl,
    exposureThresholdsTriggered: newThresholds,
  };
}

/**
 * Freeze current act progress into an ActOutcome.
 */
export function freezeActOutcome(progress: ActProgress): ActOutcome {
  const delta = progress.influence - progress.control;
  return {
    act: progress.act,
    exposure: progress.exposure,
    influence: progress.influence,
    control: progress.control,
    delta,
    tier: getActOutcomeTier(delta),
  };
}

/** Act outcome carry-forward consequences */
export interface ActOutcomeConsequences {
  creditsDelta: number;
  threatModifier: number;
  reputationChanges: Array<{ factionId: string; delta: number }>;
  loseCompanion: boolean;
}

/**
 * Determine the consequences of an act outcome tier for the next act.
 */
export function getActOutcomeConsequences(tier: ActOutcomeTier): ActOutcomeConsequences {
  switch (tier) {
    case 'dominant':
      return { creditsDelta: 100, threatModifier: -2, reputationChanges: [], loseCompanion: false };
    case 'favorable':
      return { creditsDelta: 50, threatModifier: -1, reputationChanges: [], loseCompanion: false };
    case 'contested':
      return { creditsDelta: 0, threatModifier: 0, reputationChanges: [], loseCompanion: false };
    case 'unfavorable':
      return { creditsDelta: -25, threatModifier: 1, reputationChanges: [], loseCompanion: false };
    case 'dire':
      return { creditsDelta: -50, threatModifier: 2, reputationChanges: [], loseCompanion: true };
  }
}

/**
 * Apply act outcome consequences to campaign state.
 * Called when transitioning from one act to the next.
 */
export function applyActOutcomeConsequences(
  campaign: CampaignState,
  outcome: ActOutcome,
): CampaignState {
  const consequences = getActOutcomeConsequences(outcome.tier);
  let state = { ...campaign };

  // Credits (floor at 0)
  state.credits = Math.max(0, state.credits + consequences.creditsDelta);

  // Threat modifier applied to the campaign threat level
  state.threatLevel = state.threatLevel + consequences.threatModifier;

  // Reputation changes for unfavorable/dire (applied generically)
  if (outcome.tier === 'unfavorable') {
    const reputation = { ...(state.factionReputation ?? {}) };
    // Apply -1 to the faction with highest reputation (most to lose)
    const factions = Object.entries(reputation);
    if (factions.length > 0) {
      const [topFaction] = factions.sort((a, b) => b[1] - a[1]);
      reputation[topFaction[0]] = topFaction[1] - 1;
      state.factionReputation = reputation;
    }
  } else if (outcome.tier === 'dire') {
    const reputation = { ...(state.factionReputation ?? {}) };
    // Apply -1 to top two factions
    const factions = Object.entries(reputation).sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < Math.min(2, factions.length); i++) {
      reputation[factions[i][0]] = factions[i][1] - 1;
    }
    state.factionReputation = reputation;

    // Lose a companion (remove the last recruited one)
    if (consequences.loseCompanion && state.companions && state.companions.length > 0) {
      state.companions = state.companions.slice(0, -1);
    }
  }

  // Dominant/favorable: free reputation boost to highest faction
  if (outcome.tier === 'dominant' || outcome.tier === 'favorable') {
    const reputation = { ...(state.factionReputation ?? {}) };
    const factions = Object.entries(reputation);
    const boost = outcome.tier === 'dominant' ? 2 : 1;
    if (factions.length > 0) {
      const [topFaction] = factions.sort((a, b) => b[1] - a[1]);
      reputation[topFaction[0]] = topFaction[1] + boost;
      state.factionReputation = reputation;
    }
  }

  return state;
}

/**
 * Get the finale modifiers based on current exposure status.
 * These are applied when starting an act finale (missionIndex === 4).
 */
export function getFinaleExposureModifiers(exposure: number): {
  threatBonus: number;
  roundLimitModifier: number;
  extraReinforcements: Array<{
    id: string;
    triggerRound: number;
    groups: Array<{ npcProfileId: string; count: number; asMinGroup: boolean }>;
    threatCost: number;
  }>;
} {
  const status = getExposureStatus(exposure);

  switch (status) {
    case 'ghost':
      return { threatBonus: 0, roundLimitModifier: 0, extraReinforcements: [] };
    case 'detected':
      return {
        threatBonus: 3,
        roundLimitModifier: -1,
        extraReinforcements: [
          {
            id: 'exposure-wave-1',
            triggerRound: 3,
            groups: [{ npcProfileId: 'stormtrooper', count: 3, asMinGroup: true }],
            threatCost: 0, // Free, exposure-driven
          },
        ],
      };
    case 'hunted':
      return {
        threatBonus: 5,
        roundLimitModifier: -2,
        extraReinforcements: [
          {
            id: 'exposure-wave-1',
            triggerRound: 2,
            groups: [{ npcProfileId: 'stormtrooper', count: 3, asMinGroup: true }],
            threatCost: 0,
          },
          {
            id: 'exposure-wave-2',
            triggerRound: 4,
            groups: [{ npcProfileId: 'stormtrooper-sergeant', count: 2, asMinGroup: true }],
            threatCost: 0,
          },
        ],
      };
  }
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
 * Wraps JSON.parse in try-catch and validates numeric bounds.
 */
export function campaignFromJSON(json: string): CampaignState {
  let saveFile: CampaignSaveFile;
  try {
    saveFile = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid campaign JSON: ${e instanceof Error ? e.message : 'parse error'}`);
  }
  if (!saveFile || typeof saveFile !== 'object') {
    throw new Error('Invalid campaign JSON: expected an object');
  }
  const campaign = loadCampaign(saveFile);
  validateCampaignBounds(campaign);
  return campaign;
}

/**
 * Validate that numeric fields in a deserialized campaign are within sane bounds.
 */
function validateCampaignBounds(c: CampaignState): void {
  if (typeof c.credits === 'number' && (c.credits < 0 || c.credits > 1_000_000)) {
    throw new Error('Invalid campaign data: credits out of range');
  }
  if (typeof c.currentAct === 'number' && (c.currentAct < 1 || c.currentAct > 10)) {
    throw new Error('Invalid campaign data: currentAct out of range');
  }
  if (c.heroes && typeof c.heroes === 'object') {
    for (const [heroId, hero] of Object.entries(c.heroes)) {
      if (!hero || typeof hero !== 'object') {
        throw new Error(`Invalid campaign data: hero '${heroId}' is not an object`);
      }
      if (hero.wounds && typeof hero.wounds.current === 'number' && hero.wounds.current < 0) {
        throw new Error(`Invalid campaign data: hero '${heroId}' has negative wounds`);
      }
      if (hero.strain && typeof hero.strain.current === 'number' && hero.strain.current < 0) {
        throw new Error(`Invalid campaign data: hero '${heroId}' has negative strain`);
      }
    }
  }
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

  // Use completedMissions.length as source of truth instead of the
  // missionsPlayed counter, which can drift from duplicate calls or
  // missions started but not completed.
  const played = campaign.completedMissions.length;

  return {
    missionsPlayed: played,
    victories,
    defeats,
    totalXPEarned,
    totalKills,
    totalCredits: campaign.credits,
    heroCount: Object.keys(campaign.heroes).length,
    averageMissionXP: played > 0 ? Math.round(totalXPEarned / played) : 0,
  };
}

// ============================================================================
// CAMPAIGN EPILOGUE
// ============================================================================

const TIER_SCORES: Record<string, number> = {
  dominant: 2,
  favorable: 1,
  contested: 0,
  unfavorable: -1,
  dire: -2,
};

const EPILOGUE_DATA: Record<CampaignEpilogueTier, { title: string; narrative: string }> = {
  legendary: {
    title: 'A New Dawn',
    narrative:
      'Against all odds, the operatives have shattered Imperial control across the sector. ' +
      'Their names are whispered in cantinas and shouted in celebrations from Coruscant to the Outer Rim. ' +
      'The sector is free, and the seeds of a new galactic order have been planted. ' +
      'The Empire will remember this defeat -- and the galaxy will remember these heroes.',
  },
  heroic: {
    title: 'The Tide Turns',
    narrative:
      'The operatives have dealt a serious blow to Imperial operations in the sector. ' +
      'While pockets of resistance remain, the balance of power has shifted decisively. ' +
      'New allies rally to the cause daily, and the local population dares to hope again. ' +
      'The fight is not over, but the hardest part may be behind them.',
  },
  pyrrhic: {
    title: 'The Long War',
    narrative:
      'Victory and defeat have traded blows throughout the campaign. ' +
      'The sector remains contested -- neither fully liberated nor fully subjugated. ' +
      'The operatives have survived, and as long as they draw breath, the fight continues. ' +
      'But the cost has been high, and the road ahead is uncertain.',
  },
  bittersweet: {
    title: 'Fading Light',
    narrative:
      'The Empire has tightened its grip on the sector despite the operatives\' efforts. ' +
      'Allies have scattered, safe houses have been compromised, and the network is fraying. ' +
      'Yet the operatives persist, carrying the flame of resistance into darker days. ' +
      'Perhaps another sector, another time, will see the tide turn.',
  },
  fallen: {
    title: 'Imperial Dominion',
    narrative:
      'The Empire\'s iron fist has crushed the resistance. The operatives are scattered, ' +
      'hunted, and nearly broken. The sector has been made an example -- a warning to any ' +
      'who would defy Imperial authority. But even in the darkest hour, a spark remains. ' +
      'Somewhere, someone remembers what these operatives fought for.',
  },
};

function getEpilogueTier(score: number): CampaignEpilogueTier {
  if (score >= 4) return 'legendary';
  if (score >= 2) return 'heroic';
  if (score >= -1) return 'pyrrhic';
  if (score >= -3) return 'bittersweet';
  return 'fallen';
}

/**
 * Compute the campaign epilogue from accumulated act outcomes.
 * Combines all act tier scores into a cumulative score that determines
 * the overall campaign ending narrative.
 */
export function getCampaignEpilogue(campaign: CampaignState): CampaignEpilogue | null {
  const outcomes = campaign.actOutcomes ?? [];
  if (outcomes.length === 0) return null;

  const actSummaries = outcomes.map(o => ({ act: o.act, tier: o.tier }));
  const cumulativeScore = outcomes.reduce(
    (sum, o) => sum + (TIER_SCORES[o.tier] ?? 0), 0,
  );
  const tier = getEpilogueTier(cumulativeScore);
  const data = EPILOGUE_DATA[tier];

  return {
    tier,
    title: data.title,
    narrative: data.narrative,
    actSummaries,
    cumulativeScore,
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

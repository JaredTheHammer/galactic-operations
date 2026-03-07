/**
 * Secret Objectives Engine
 *
 * TI4-inspired per-hero secret objectives drawn at mission start.
 * Each hero draws one secret objective from a shared deck. Completing
 * the objective during the mission awards bonus XP, AP, and/or credits.
 *
 * Tracks progress during combat and resolves at mission end.
 */

import type {
  SecretObjectiveDefinition,
  AssignedSecretObjective,
  MissionSecretObjectiveState,
  CompletedSecretObjective,
  CampaignState,
  GameState,
  HeroCharacter,
  Figure,
  GameData,
  YahtzeeCombo,
} from './types.js';

import type { RollFn } from './dice-v2.js';
import { defaultRollFn } from './dice-v2.js';

// ============================================================================
// DECK MANAGEMENT
// ============================================================================

/**
 * Initialize secret objective state for a mission.
 * Draws one objective per hero from the available deck.
 */
export function initializeSecretObjectives(
  gameData: GameData,
  heroIds: string[],
  previouslyCompleted: string[] = [],
  rollFn: RollFn = defaultRollFn,
): MissionSecretObjectiveState {
  const allObjectives = gameData.secretObjectives ?? {};

  // Build available deck: exclude already-completed objectives
  const completedSet = new Set(previouslyCompleted);
  let availableDeck = Object.keys(allObjectives).filter(id => !completedSet.has(id));

  // Shuffle available deck
  availableDeck = shuffleArray([...availableDeck], rollFn);

  // Draw one per hero
  const assignments: AssignedSecretObjective[] = [];
  for (const heroId of heroIds) {
    if (availableDeck.length === 0) break;
    const objectiveId = availableDeck.pop()!;
    assignments.push({
      objectiveId,
      heroId,
      progress: 0,
      isCompleted: false,
    });
  }

  return { assignments, availableDeck };
}

/**
 * Shuffle an array using Fisher-Yates with the provided RNG.
 */
function shuffleArray<T>(arr: T[], rollFn: RollFn): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rollFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Update secret objective progress based on a game event.
 * Returns a new state with updated progress/completion.
 */
export function updateSecretObjectiveProgress(
  state: MissionSecretObjectiveState,
  event: SecretObjectiveEvent,
  gameData: GameData,
): MissionSecretObjectiveState {
  const objectives = gameData.secretObjectives ?? {};

  const updatedAssignments = state.assignments.map(assignment => {
    if (assignment.isCompleted) return assignment;

    const def = objectives[assignment.objectiveId];
    if (!def) return assignment;

    // Check if this event is relevant to the hero's objective
    if (event.heroId !== assignment.heroId) return assignment;

    const newProgress = calculateProgress(assignment, def, event);
    const isCompleted = newProgress >= (def.threshold ?? 1);

    return {
      ...assignment,
      progress: newProgress,
      isCompleted,
    };
  });

  return { ...state, assignments: updatedAssignments };
}

/** Events that can trigger secret objective progress */
export type SecretObjectiveEvent =
  | { type: 'enemy_killed'; heroId: string; enemyTier: string }
  | { type: 'nemesis_killed'; heroId: string }
  | { type: 'objective_interacted'; heroId: string }
  | { type: 'loot_collected'; heroId: string }
  | { type: 'exploration_revealed'; heroId: string }
  | { type: 'combo_rolled'; heroId: string; comboType: string }
  | { type: 'talent_used'; heroId: string }
  | { type: 'ally_healed'; heroId: string; amount: number }
  | { type: 'fragment_collected'; heroId: string }
  | { type: 'first_kill'; heroId: string }
  | { type: 'mission_end'; heroId: string; wounds: number; strain: number; anyIncapacitated: boolean };

/**
 * Calculate new progress for an assignment based on an event.
 */
function calculateProgress(
  assignment: AssignedSecretObjective,
  def: SecretObjectiveDefinition,
  event: SecretObjectiveEvent,
): number {
  let progress = assignment.progress;

  switch (def.condition) {
    case 'kill_nemesis':
      if (event.type === 'nemesis_killed') progress += 1;
      break;
    case 'kill_count':
      if (event.type === 'enemy_killed') progress += 1;
      break;
    case 'zero_strain_finish':
      if (event.type === 'mission_end' && event.strain === 0) progress = 1;
      break;
    case 'zero_wounds_finish':
      if (event.type === 'mission_end' && event.wounds === 0) progress = 1;
      break;
    case 'interact_objectives':
      if (event.type === 'objective_interacted') progress += 1;
      break;
    case 'collect_loot':
      if (event.type === 'loot_collected') progress += 1;
      break;
    case 'explore_tokens':
      if (event.type === 'exploration_revealed') progress += 1;
      break;
    case 'no_incapacitation':
      if (event.type === 'mission_end' && !event.anyIncapacitated) progress = 1;
      break;
    case 'first_kill':
      if (event.type === 'first_kill') progress = 1;
      break;
    case 'high_combo':
      if (event.type === 'combo_rolled') {
        const highCombos = ['Trips', 'Quad', 'Quint', 'LargeRun', 'FullRun'];
        if (highCombos.includes(event.comboType)) progress += 1;
      }
      break;
    case 'use_talent':
      if (event.type === 'talent_used') progress += 1;
      break;
    case 'heal_ally':
      if (event.type === 'ally_healed') progress += event.amount;
      break;
    case 'collect_fragments':
      if (event.type === 'fragment_collected') progress += 1;
      break;
  }

  return progress;
}

// ============================================================================
// MISSION END RESOLUTION
// ============================================================================

/**
 * Resolve secret objectives at mission end.
 * Returns completed objectives with rewards.
 */
export function resolveSecretObjectives(
  state: MissionSecretObjectiveState,
  missionId: string,
  gameData: GameData,
): CompletedSecretObjective[] {
  const objectives = gameData.secretObjectives ?? {};
  const completed: CompletedSecretObjective[] = [];

  for (const assignment of state.assignments) {
    if (!assignment.isCompleted) continue;

    const def = objectives[assignment.objectiveId];
    if (!def) continue;

    completed.push({
      objectiveId: assignment.objectiveId,
      heroId: assignment.heroId,
      missionId,
      xpAwarded: def.xpReward,
      apAwarded: def.apReward,
      creditsAwarded: def.creditsReward ?? 0,
      completedAt: new Date().toISOString(),
    });
  }

  return completed;
}

/**
 * Apply secret objective rewards to campaign state.
 */
export function applySecretObjectiveRewards(
  campaign: CampaignState,
  completedObjectives: CompletedSecretObjective[],
): CampaignState {
  let credits = campaign.credits;
  const heroes = { ...campaign.heroes };
  const existing = [...(campaign.completedSecretObjectives ?? [])];

  for (const completed of completedObjectives) {
    credits += completed.creditsAwarded;
    existing.push(completed);

    // Apply XP and AP to the hero
    const hero = heroes[completed.heroId];
    if (hero) {
      heroes[completed.heroId] = {
        ...hero,
        xp: {
          total: hero.xp.total + completed.xpAwarded,
          available: hero.xp.available + completed.xpAwarded,
        },
        abilityPoints: {
          total: hero.abilityPoints.total + completed.apAwarded,
          available: hero.abilityPoints.available + completed.apAwarded,
        },
      };
    }
  }

  return {
    ...campaign,
    credits,
    heroes,
    completedSecretObjectives: existing,
  };
}

/**
 * Get the secret objective assigned to a specific hero.
 */
export function getHeroSecretObjective(
  state: MissionSecretObjectiveState,
  heroId: string,
): AssignedSecretObjective | undefined {
  return state.assignments.find(a => a.heroId === heroId);
}

/**
 * Get the definition for an assigned objective.
 */
export function getObjectiveDefinition(
  objectiveId: string,
  gameData: GameData,
): SecretObjectiveDefinition | undefined {
  return (gameData.secretObjectives ?? {})[objectiveId];
}

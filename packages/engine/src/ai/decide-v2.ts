/**
 * AI System v2 - Priority-Rule Decision Engine
 *
 * The core AI "brain" updated for v2 action economy and entity model.
 * For each figure activation:
 * 1. Load the archetype profile for this unit
 * 2. Iterate priority rules top-to-bottom
 * 3. Evaluate each condition against current game state
 * 4. First satisfied condition triggers its action
 * 5. Action builder produces 1-3 GameActions (Action + Maneuver + optional StrainForManeuver)
 *
 * Changes from v1 (decide.ts):
 * - Imports from evaluate-v2 and actions-v2
 * - Profile resolution uses figure.entityType/entityId (not figure.unitId)
 * - Morale uses MoraleTrack.value (not bare number)
 * - Action trimming respects v2 economy (Action + Maneuver, not 2 Actions)
 * - Card text updated for v2 action economy
 */

import type {
  Figure,
  GameState,
  GameData,
  GameAction,
} from '../types.js';

import type {
  AIArchetypeProfile,
  AIProfilesData,
  AIDecisionResult,
  AIPriorityRule,
  AIWeights,
} from './types.js';

import { evaluateCondition } from './evaluate-v2.js';
import { buildActionsForAIAction, buildRallyAction } from './actions-v2.js';
import { getMoraleState } from '../morale.js';
import { getSuppressionState } from '../turn-machine-v2.js';

// ============================================================================
// PROFILE RESOLUTION
// ============================================================================

/**
 * Load AI profiles from parsed JSON data.
 */
export function loadAIProfiles(data: any): AIProfilesData {
  return {
    archetypes: data.archetypes ?? {},
    unitMapping: data.unitMapping ?? {},
    defaultArchetype: data.defaultArchetype ?? 'trooper',
  };
}

/**
 * Get the archetype profile for a specific figure.
 *
 * v2 resolution order:
 * 1. NPCs: use npcProfile.aiArchetype field directly
 * 2. Heroes: look up figure.entityId in profilesData.unitMapping
 * 3. Fallback to defaultArchetype
 */
export function getProfileForFigure(
  figure: Figure,
  gameState: GameState,
  profilesData: AIProfilesData,
): AIArchetypeProfile {
  let archetypeId: string;

  if (figure.entityType === 'npc') {
    // NPCs carry their archetype in the profile
    const npc = gameState.npcProfiles[figure.entityId];
    archetypeId = npc?.aiArchetype
      ?? profilesData.unitMapping[figure.entityId]
      ?? profilesData.defaultArchetype;
  } else {
    // Heroes: check mapping, then fall back to 'hero' archetype (not default trooper)
    archetypeId = profilesData.unitMapping[figure.entityId]
      ?? 'hero';
  }

  const profile = profilesData.archetypes[archetypeId];
  if (!profile) {
    return profilesData.archetypes[profilesData.defaultArchetype] ?? createFallbackProfile();
  }

  return profile;
}

/**
 * Emergency fallback profile if JSON data is missing.
 */
function createFallbackProfile(): AIArchetypeProfile {
  return {
    id: 'fallback',
    name: 'Fallback',
    cardTitle: 'BASIC TACTICS',
    description: 'Minimal fallback behavior.',
    priorityRules: [
      {
        rank: 1,
        condition: 'enemy-in-range',
        action: 'attack-best-target',
        cardText: 'If an enemy is in range: Attack.',
      },
      {
        rank: 2,
        condition: 'default',
        action: 'advance-with-cover',
        cardText: 'Otherwise: Move toward enemies.',
      },
    ],
    weights: {
      killPotential: 5,
      coverValue: 5,
      proximity: 5,
      threatLevel: 5,
      elevation: 2,
      selfPreservation: 5,
    },
  };
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

/**
 * Determine the best actions for an AI-controlled figure.
 *
 * This is the main entry point for the AI system. It:
 * 1. Resolves the figure's archetype profile
 * 2. Checks morale constraints
 * 3. Iterates priority rules top-to-bottom
 * 4. Returns the first matching rule's actions
 *
 * @param figure The figure to decide for
 * @param gameState Current game state
 * @param gameData Game data (weapons, armor, species, etc.)
 * @param profilesData All AI profiles
 * @returns Decision result with actions and reasoning
 */
export function determineActions(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  profilesData: AIProfilesData,
): AIDecisionResult {
  const profile = getProfileForFigure(figure, gameState, profilesData);
  const weights = profile.weights;

  // Check morale constraints first
  // Imperial NPCs (Minion/Rival tier) are morale-exempt: they fight to the death.
  // This prevents expendable reinforcement waves from wasting turns on Rally.
  // Only heroes and Nemesis-tier enemies check morale.
  const side = gameState.players.find(p => p.id === figure.playerId)?.role;
  if (side) {
    const isImperialNPC = side === 'Imperial' && figure.entityType === 'npc';
    const npcProfile = isImperialNPC ? gameState.npcProfiles[figure.entityId] : null;
    const isExempt = isImperialNPC && npcProfile && npcProfile.tier !== 'Nemesis';

    if (!isExempt) {
      const moraleTrack = side === 'Imperial'
        ? gameState.imperialMorale
        : gameState.operativeMorale;
      const moraleState = getMoraleState(moraleTrack);

      if (moraleState === 'Broken') {
        return buildBrokenMoraleDecision(figure, gameState, gameData, weights, profile);
      }
    }
  }

  // Check suppression constraints (parallel to morale check)
  const suppressionState = getSuppressionState(figure);
  if (suppressionState === 'Panicked') {
    // Panicked: must flee toward nearest cover, no attacks
    return buildPanickedDecision(figure, gameState, gameData, weights, profile);
  }
  if (suppressionState === 'Suppressed') {
    // Suppressed: no Action (maneuver only) -- try to take cover or hold
    return buildSuppressedDecision(figure, gameState, gameData, weights, profile);
  }

  // No actions AND no maneuvers remaining: skip
  if (figure.actionsRemaining <= 0 && figure.maneuversRemaining <= 0) {
    return {
      actions: [],
      matchedRule: profile.priorityRules[profile.priorityRules.length - 1],
      reasoning: 'No actions or maneuvers remaining',
    };
  }

  // Iterate priority rules
  for (const rule of profile.priorityRules) {
    const effectiveWeights = rule.weights ? { ...weights, ...rule.weights } : weights;

    const result = evaluateCondition(
      rule.condition,
      figure,
      gameState,
      gameData,
      effectiveWeights,
    );

    if (result.satisfied) {
      const actions = buildActionsForAIAction(
        rule.action,
        figure,
        result.context,
        gameState,
        gameData,
        effectiveWeights,
      );

      // Verify we got valid actions
      if (actions.length > 0) {
        return {
          actions,
          matchedRule: rule,
          reasoning: `Rule #${rule.rank} (${rule.condition}): ${result.context.reasoning}`,
        };
      }

      // If action builder returned nothing despite condition being satisfied,
      // fall through to next rule
    }
  }

  // No rule matched: fallback to rally
  return {
    actions: [buildRallyAction(figure.id)],
    matchedRule: profile.priorityRules[profile.priorityRules.length - 1],
    reasoning: 'No rules matched; rallying as fallback',
  };
}

/**
 * Build a decision for a figure under Broken morale (Move or Rally only).
 * v2: broken units can move (maneuver) and rally (action), no attacks.
 */
function buildBrokenMoraleDecision(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
  profile: AIArchetypeProfile,
): AIDecisionResult {
  // Try to retreat to cover
  const retreatResult = evaluateCondition(
    'low-health-should-retreat',
    figure,
    gameState,
    gameData,
    { ...weights, selfPreservation: 10 },
  );

  if (retreatResult.satisfied && retreatResult.context.destination) {
    const actions = buildActionsForAIAction(
      'retreat-to-cover',
      figure,
      retreatResult.context,
      gameState,
      gameData,
      weights,
    );

    if (actions.length > 0) {
      return {
        actions,
        matchedRule: profile.priorityRules[0],
        reasoning: `MORALE BROKEN: Retreating to cover. ${retreatResult.context.reasoning}`,
      };
    }
  }

  // Just rally
  return {
    actions: [buildRallyAction(figure.id)],
    matchedRule: profile.priorityRules[0],
    reasoning: 'MORALE BROKEN: Cannot retreat, rallying.',
  };
}

// ============================================================================
// SUPPRESSION DECISION HELPERS
// ============================================================================

/**
 * Build a decision for a panicked figure (suppression >= 2x courage).
 * Must flee toward nearest cover away from enemies. No attacks allowed.
 */
function buildPanickedDecision(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
  profile: AIArchetypeProfile,
): AIDecisionResult {
  // Try to retreat to cover (same logic as broken morale)
  const retreatResult = evaluateCondition(
    'low-health-should-retreat',
    figure,
    gameState,
    gameData,
    { ...weights, selfPreservation: 10 },
  );

  if (retreatResult.satisfied && retreatResult.context.destination) {
    const actions = buildActionsForAIAction(
      'retreat-to-cover',
      figure,
      retreatResult.context,
      gameState,
      gameData,
      weights,
    );

    if (actions.length > 0) {
      // Filter out attack actions: panicked units cannot attack
      const moveOnly = actions.filter(a => a.type === 'Move' || a.type === 'TakeCover');
      if (moveOnly.length > 0) {
        return {
          actions: moveOnly,
          matchedRule: profile.priorityRules[0],
          reasoning: `PANICKED (suppression ${figure.suppressionTokens} >= ${figure.courage * 2}): Fleeing to cover.`,
        };
      }
    }
  }

  // Can't retreat: hunker down
  return {
    actions: [],
    matchedRule: profile.priorityRules[0],
    reasoning: `PANICKED (suppression ${figure.suppressionTokens} >= ${figure.courage * 2}): Cannot flee, hunkering down.`,
  };
}

/**
 * Build a decision for a suppressed figure (suppression >= courage but < 2x).
 * No Action allowed, maneuver only. Take cover or hold position.
 */
function buildSuppressedDecision(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
  profile: AIArchetypeProfile,
): AIDecisionResult {
  // Try to move to cover if not already in cover
  const retreatResult = evaluateCondition(
    'low-health-should-retreat',
    figure,
    gameState,
    gameData,
    { ...weights, selfPreservation: 8 },
  );

  if (retreatResult.satisfied && retreatResult.context.destination) {
    const actions = buildActionsForAIAction(
      'retreat-to-cover',
      figure,
      retreatResult.context,
      gameState,
      gameData,
      weights,
    );

    if (actions.length > 0) {
      // Only maneuvers allowed
      const moveOnly = actions.filter(a => a.type === 'Move' || a.type === 'TakeCover');
      if (moveOnly.length > 0) {
        return {
          actions: moveOnly,
          matchedRule: profile.priorityRules[0],
          reasoning: `SUPPRESSED (${figure.suppressionTokens} >= ${figure.courage}): Moving to cover.`,
        };
      }
    }
  }

  // Already in cover or can't reach cover: hold position
  return {
    actions: [],
    matchedRule: profile.priorityRules[0],
    reasoning: `SUPPRESSED (${figure.suppressionTokens} >= ${figure.courage}): Holding position, no Action available.`,
  };
}

// ============================================================================
// CARD TEXT GENERATION
// ============================================================================

/**
 * Generate the printable 4x6 card text for a profile.
 * Returns a formatted string ready for rendering.
 */
export function generateCardText(profile: AIArchetypeProfile): string {
  const lines: string[] = [];

  lines.push(`${'='.repeat(38)}`);
  lines.push(`  ${profile.cardTitle}`);
  lines.push(`  ${profile.description}`);
  lines.push(`${'='.repeat(38)}`);
  lines.push('');
  lines.push('CHECK THESE IN ORDER (first match wins):');
  lines.push('');

  for (const rule of profile.priorityRules) {
    lines.push(`  ${rule.rank}. ${rule.cardText}`);
    lines.push('');
  }

  lines.push(`${'~'.repeat(38)}`);
  lines.push('  REMEMBER:');
  lines.push('  - 1 Action + 1 Maneuver per activation');
  lines.push('  - Suffer 2 strain for extra Maneuver');
  lines.push('  - Broken morale = Move or Rally only');
  lines.push(`${'~'.repeat(38)}`);

  return lines.join('\n');
}

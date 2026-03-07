/**
 * Liberation Tracks Engine (Terraforming Mars Global Parameters)
 *
 * Three campaign-wide progress tracks that advance based on mission outcomes,
 * side objectives, and social phase results. Reaching thresholds on each
 * track unlocks new missions, equipment, allies, and narrative content.
 *
 * Tracks:
 * - Rebel Influence: Political/social progress (advanced by social phase, diplomacy)
 * - Imperial Destabilization: Military weakening (advanced by kills, mission victories)
 * - Resource Control: Economic dominance (advanced by loot, credits, projects)
 */

import type {
  CampaignState,
  LiberationTrackId,
  LiberationTrackDefinition,
  LiberationTrackDelta,
  LiberationTrackState,
  LiberationThreshold,
  MissionResult,
  ProjectCardEffect,
} from './types';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Create initial liberation track state (all tracks at 0).
 */
export function initializeLiberationTracks(): LiberationTrackState {
  return {
    values: {
      rebel_influence: 0,
      imperial_destabilization: 0,
      resource_control: 0,
    },
    claimedThresholds: [],
  };
}

// ============================================================================
// TRACK ADVANCEMENT
// ============================================================================

/**
 * Apply a set of deltas to liberation tracks.
 * Clamps values to [0, maxValue] per track definition.
 * Returns updated state and any newly crossed thresholds.
 */
export function advanceLiberationTracks(
  state: LiberationTrackState,
  deltas: LiberationTrackDelta[],
  trackDefinitions: Record<LiberationTrackId, LiberationTrackDefinition>,
): {
  state: LiberationTrackState;
  newThresholds: Array<{ trackId: LiberationTrackId; threshold: LiberationThreshold }>;
} {
  const newValues = { ...state.values };
  const claimedSet = new Set(state.claimedThresholds);
  const newThresholds: Array<{ trackId: LiberationTrackId; threshold: LiberationThreshold }> = [];

  for (const delta of deltas) {
    const def = trackDefinitions[delta.trackId];
    if (!def) continue;

    const oldValue = newValues[delta.trackId];
    const newValue = Math.max(0, Math.min(def.maxValue, oldValue + delta.delta));
    newValues[delta.trackId] = newValue;

    // Check for newly crossed thresholds
    for (const threshold of def.thresholds) {
      const thresholdKey = `${delta.trackId}:${threshold.value}`;
      if (claimedSet.has(thresholdKey)) continue;
      if (newValue >= threshold.value && oldValue < threshold.value) {
        newThresholds.push({ trackId: delta.trackId, threshold });
        claimedSet.add(thresholdKey);
      }
    }
  }

  return {
    state: {
      values: newValues,
      claimedThresholds: Array.from(claimedSet),
    },
    newThresholds,
  };
}

// ============================================================================
// MISSION-BASED DELTAS
// ============================================================================

/**
 * Calculate liberation track deltas from a completed mission result.
 * This is the automatic advancement that happens after every mission.
 */
export function calculateMissionTrackDeltas(
  result: MissionResult,
): LiberationTrackDelta[] {
  const deltas: LiberationTrackDelta[] = [];
  const totalKills = Object.values(result.heroKills).reduce((s, k) => s + k, 0);

  // Imperial Destabilization: +1 per 3 kills, +2 for victory, +1 for leader kill
  if (totalKills >= 3) {
    deltas.push({
      trackId: 'imperial_destabilization',
      delta: Math.floor(totalKills / 3),
      reason: `Eliminated ${totalKills} enemies`,
    });
  }
  if (result.outcome === 'victory') {
    deltas.push({
      trackId: 'imperial_destabilization',
      delta: 2,
      reason: 'Mission victory',
    });
  }
  if (result.xpBreakdown.leaderKill > 0) {
    deltas.push({
      trackId: 'imperial_destabilization',
      delta: 1,
      reason: 'Enemy leader eliminated',
    });
  }

  // Resource Control: +1 per 2 loot tokens collected
  if (result.lootCollected.length >= 2) {
    deltas.push({
      trackId: 'resource_control',
      delta: Math.floor(result.lootCollected.length / 2),
      reason: `Collected ${result.lootCollected.length} loot tokens`,
    });
  }

  // Rebel Influence: +1 for completing secondary objectives
  const secondaryCount = result.completedObjectiveIds.length;
  if (secondaryCount > 0) {
    deltas.push({
      trackId: 'rebel_influence',
      delta: 1,
      reason: `Completed ${secondaryCount} objective(s)`,
    });
  }

  // Setback on defeat
  if (result.outcome === 'defeat') {
    deltas.push({
      trackId: 'rebel_influence',
      delta: -1,
      reason: 'Mission defeat',
    });
  }

  return deltas;
}

// ============================================================================
// SOCIAL PHASE DELTAS
// ============================================================================

/**
 * Calculate liberation track deltas from social phase outcomes.
 * Call this when social encounters are resolved.
 */
export function calculateSocialTrackDeltas(
  successfulChecks: number,
  companionRecruited: boolean,
  creditsSpent: number,
): LiberationTrackDelta[] {
  const deltas: LiberationTrackDelta[] = [];

  // Rebel Influence: +1 per 2 successful social checks
  if (successfulChecks >= 2) {
    deltas.push({
      trackId: 'rebel_influence',
      delta: Math.floor(successfulChecks / 2),
      reason: `${successfulChecks} successful social interactions`,
    });
  }

  // Rebel Influence: +2 for recruiting a companion
  if (companionRecruited) {
    deltas.push({
      trackId: 'rebel_influence',
      delta: 2,
      reason: 'Recruited a companion',
    });
  }

  // Resource Control: +1 if significant credits spent on projects/equipment
  if (creditsSpent >= 50) {
    deltas.push({
      trackId: 'resource_control',
      delta: 1,
      reason: 'Significant resource investment',
    });
  }

  return deltas;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get current value of a specific track.
 */
export function getTrackValue(
  campaign: CampaignState,
  trackId: LiberationTrackId,
): number {
  return campaign.liberationTracks?.values[trackId] ?? 0;
}

/**
 * Get progress summary for all tracks.
 */
export function getTrackProgress(
  campaign: CampaignState,
  trackDefinitions: Record<LiberationTrackId, LiberationTrackDefinition>,
): Array<{
  trackId: LiberationTrackId;
  name: string;
  current: number;
  max: number;
  percentage: number;
  nextThreshold: LiberationThreshold | null;
}> {
  const state = campaign.liberationTracks ?? initializeLiberationTracks();
  const claimed = new Set(state.claimedThresholds);

  return (Object.keys(trackDefinitions) as LiberationTrackId[]).map(trackId => {
    const def = trackDefinitions[trackId];
    const current = state.values[trackId];

    // Find next unclaimed threshold
    const nextThreshold = def.thresholds
      .filter(t => !claimed.has(`${trackId}:${t.value}`))
      .sort((a, b) => a.value - b.value)[0] ?? null;

    return {
      trackId,
      name: def.name,
      current,
      max: def.maxValue,
      percentage: Math.round((current / def.maxValue) * 100),
      nextThreshold,
    };
  });
}

/**
 * Get all stat bonuses currently active from claimed liberation thresholds.
 */
export function getActiveLiberationBonuses(
  campaign: CampaignState,
  trackDefinitions: Record<LiberationTrackId, LiberationTrackDefinition>,
): ProjectCardEffect[] {
  const state = campaign.liberationTracks ?? initializeLiberationTracks();
  const claimed = new Set(state.claimedThresholds);
  const bonuses: ProjectCardEffect[] = [];

  for (const [trackId, def] of Object.entries(trackDefinitions)) {
    for (const threshold of def.thresholds) {
      const key = `${trackId}:${threshold.value}`;
      if (claimed.has(key) && threshold.reward.type === 'stat_bonus') {
        bonuses.push(threshold.reward.effect);
      }
    }
  }

  return bonuses;
}

/**
 * Apply liberation track updates to campaign state.
 * Convenience function that wraps advanceLiberationTracks and updates campaign.
 */
export function applyTrackDeltas(
  campaign: CampaignState,
  deltas: LiberationTrackDelta[],
  trackDefinitions: Record<LiberationTrackId, LiberationTrackDefinition>,
): {
  campaign: CampaignState;
  newThresholds: Array<{ trackId: LiberationTrackId; threshold: LiberationThreshold }>;
} {
  const currentState = campaign.liberationTracks ?? initializeLiberationTracks();
  const { state, newThresholds } = advanceLiberationTracks(
    currentState,
    deltas,
    trackDefinitions,
  );

  return {
    campaign: {
      ...campaign,
      liberationTracks: state,
    },
    newThresholds,
  };
}

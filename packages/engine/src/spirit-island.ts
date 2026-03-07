/**
 * Spirit Island Subsystems - Master Module
 *
 * Unified initialization and integration point for all 5 Spirit Island-inspired
 * subsystems. All subsystems are toggleable via OptionalSubsystems.
 *
 * Subsystems:
 * 1. Disruption Track - Terror levels shift victory conditions
 * 2. Dual-Timing - Fast/Slow action timing
 * 3. Threat Cadence - Predictable Imperial behavior cycle
 * 4. Element Synergy - Element accumulation triggers innate powers
 * 5. Collateral Damage - Environmental destruction with cascades
 */

import type {
  OptionalSubsystems,
  SpiritIslandState,
  TieredVictoryCondition,
  GameState,
} from './types.js';

import { initializeDisruptionTrack } from './disruption-track.js';
import { initializeDualTiming } from './dual-timing.js';
import { initializeThreatCadence } from './threat-cadence.js';
import { initializeElementTracker } from './element-synergy.js';
import { initializeCollateralDamage } from './collateral-damage.js';

/**
 * Initialize all enabled Spirit Island subsystems.
 * Call this when creating a new game state.
 */
export function initializeSpiritIsland(
  subsystems: OptionalSubsystems,
  options?: {
    disruptionThresholds?: [number, number, number];
    tieredConditions?: TieredVictoryCondition[];
    collateralThreshold?: number;
  },
): SpiritIslandState {
  return {
    subsystems,
    disruption: subsystems.disruptionTrack
      ? initializeDisruptionTrack(
          options?.tieredConditions,
          options?.disruptionThresholds,
        )
      : undefined,
    dualTiming: subsystems.dualTiming
      ? initializeDualTiming()
      : undefined,
    threatCadence: subsystems.threatCadence
      ? initializeThreatCadence()
      : undefined,
    elementSynergy: subsystems.elementSynergy
      ? initializeElementTracker()
      : undefined,
    collateralDamage: subsystems.collateralDamage
      ? initializeCollateralDamage(options?.collateralThreshold)
      : undefined,
  };
}

/**
 * Check if any Spirit Island subsystem is enabled.
 */
export function hasAnySubsystem(state: GameState): boolean {
  const si = state.spiritIsland;
  if (!si) return false;

  return !!(
    si.subsystems.disruptionTrack ||
    si.subsystems.dualTiming ||
    si.subsystems.threatCadence ||
    si.subsystems.elementSynergy ||
    si.subsystems.collateralDamage
  );
}

/**
 * Get a human-readable summary of enabled subsystems (for UI).
 */
export function getEnabledSubsystems(subsystems: OptionalSubsystems): string[] {
  const enabled: string[] = [];
  if (subsystems.disruptionTrack) enabled.push('Disruption Track');
  if (subsystems.dualTiming) enabled.push('Dual-Timing Actions');
  if (subsystems.threatCadence) enabled.push('Threat Cadence');
  if (subsystems.elementSynergy) enabled.push('Element Synergy');
  if (subsystems.collateralDamage) enabled.push('Collateral Damage');
  return enabled;
}

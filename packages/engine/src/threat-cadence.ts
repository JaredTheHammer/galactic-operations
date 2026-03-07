/**
 * Spirit Island Subsystem #3: Imperial Threat Cadence
 *
 * A visible, predictable 3-phase cycle for Imperial behavior:
 *   Scout (cautious) -> Fortify (defensive, more reinforcements) -> Strike (aggressive)
 *
 * Inspired by Spirit Island's Explore -> Build -> Ravage cycle.
 * Players can see the current phase and plan ahead. Disrupting a phase
 * (via the Disruption Track) can skip or weaken the next phase.
 */

import type {
  ThreatCadenceState,
  ThreatCadencePhase,
  ThreatCadenceEffect,
  GameState,
  GridCoordinate,
} from './types.js';

import { THREAT_CADENCE_EFFECTS } from './types.js';

/** Phase cycle order */
const PHASE_ORDER: ThreatCadencePhase[] = ['Scout', 'Fortify', 'Strike'];

/**
 * Create initial threat cadence state for a mission.
 */
export function initializeThreatCadence(): ThreatCadenceState {
  return {
    currentPhase: 'Scout',
    cycleCount: 0,
    phaseDisrupted: false,
    scoutedZones: [],
    fortifications: [],
  };
}

/**
 * Get the current phase based on round number.
 * Each phase lasts 1 round, cycling every 3 rounds.
 */
export function getPhaseForRound(roundNumber: number): ThreatCadencePhase {
  const index = (roundNumber - 1) % 3;
  return PHASE_ORDER[index];
}

/**
 * Get the cycle count (how many full Scout->Fortify->Strike cycles completed).
 */
export function getCycleCount(roundNumber: number): number {
  return Math.floor((roundNumber - 1) / 3);
}

/**
 * Advance the threat cadence to the next phase.
 * Called at the start of each round.
 */
export function advanceThreatCadence(
  state: ThreatCadenceState,
  roundNumber: number,
): ThreatCadenceState {
  const newPhase = getPhaseForRound(roundNumber);
  const newCycle = getCycleCount(roundNumber);

  // Reset scouted zones and fortifications when a new cycle begins
  const isNewCycle = newCycle > state.cycleCount;

  return {
    currentPhase: newPhase,
    cycleCount: newCycle,
    phaseDisrupted: false,
    scoutedZones: isNewCycle ? [] : state.scoutedZones,
    fortifications: isNewCycle ? [] : state.fortifications,
  };
}

/**
 * Mark the current phase as disrupted.
 * A disrupted Scout phase means no zones are revealed.
 * A disrupted Fortify phase means reinforcements don't get defense bonuses.
 * A disrupted Strike phase means the attack bonus is halved.
 */
export function disruptCurrentPhase(
  state: ThreatCadenceState,
): ThreatCadenceState {
  return {
    ...state,
    phaseDisrupted: true,
  };
}

/**
 * Get the active effects for the current phase.
 * Disrupted phases have reduced effects.
 */
export function getActiveEffects(
  state: ThreatCadenceState,
): ThreatCadenceEffect {
  const base = THREAT_CADENCE_EFFECTS[state.currentPhase];

  if (!state.phaseDisrupted) {
    return base;
  }

  // Disrupted phases have halved bonuses
  return {
    ...base,
    threatIncomeMultiplier: state.currentPhase === 'Fortify'
      ? 1.0 // disrupted Fortify loses extra reinforcements
      : base.threatIncomeMultiplier,
    imperialDefenseBonus: Math.floor(base.imperialDefenseBonus / 2),
    imperialAttackBonus: Math.floor(base.imperialAttackBonus / 2),
  };
}

/**
 * Add scouted zones during the Scout phase.
 */
export function addScoutedZones(
  state: ThreatCadenceState,
  zones: GridCoordinate[],
): ThreatCadenceState {
  return {
    ...state,
    scoutedZones: [...state.scoutedZones, ...zones],
  };
}

/**
 * Add fortifications during the Fortify phase.
 */
export function addFortification(
  state: ThreatCadenceState,
  position: GridCoordinate,
  defenseBonus: number = 1,
): ThreatCadenceState {
  return {
    ...state,
    fortifications: [
      ...state.fortifications,
      { position, defenseBonus },
    ],
  };
}

/**
 * Get the next phase in the cycle (for UI preview).
 */
export function getNextPhase(currentPhase: ThreatCadencePhase): ThreatCadencePhase {
  const index = PHASE_ORDER.indexOf(currentPhase);
  return PHASE_ORDER[(index + 1) % 3];
}

/**
 * Get the threat income multiplier for the current phase.
 * Used to modify reinforcement point generation.
 */
export function getThreatIncomeMultiplier(state: ThreatCadenceState): number {
  return getActiveEffects(state).threatIncomeMultiplier;
}

/**
 * Apply threat cadence round advancement to game state.
 */
export function applyThreatCadenceRound(
  gameState: GameState,
): GameState {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.threatCadence || !si.threatCadence) {
    return gameState;
  }

  const updated = advanceThreatCadence(si.threatCadence, gameState.roundNumber);

  return {
    ...gameState,
    spiritIsland: {
      ...si,
      threatCadence: updated,
    },
  };
}

/**
 * Check if a position has a fortification bonus.
 */
export function getFortificationBonus(
  state: ThreatCadenceState,
  position: GridCoordinate,
): number {
  const fort = state.fortifications.find(
    f => f.position.x === position.x && f.position.y === position.y,
  );
  return fort?.defenseBonus ?? 0;
}

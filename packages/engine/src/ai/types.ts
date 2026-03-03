/**
 * AI System - Type Definitions
 * Types for the priority-rule AI brain and simulation system
 */

import type {
  GridCoordinate,
  GameAction,
  ActionType,
  Side,
} from '../types.js';

// ============================================================================
// AI PROFILE TYPES (maps 1:1 to printable 4x6 card)
// ============================================================================

/**
 * A single priority rule on the AI card.
 * Evaluated top-to-bottom; first matching condition triggers the action.
 */
export interface AIPriorityRule {
  /** Display rank on card (1 = highest priority) */
  rank: number;
  /** Machine-readable condition identifier */
  condition: AIConditionId;
  /** Machine-readable action identifier */
  action: AIActionId;
  /** Human-readable text for the physical card */
  cardText: string;
  /** Optional: scoring weight overrides for tie-breaking within this rule */
  weights?: Partial<AIWeights>;
}

/**
 * Archetype profile defining behavior for a category of units.
 * Each profile maps directly to one printable 4x6 card.
 */
export interface AIArchetypeProfile {
  id: string;
  name: string;
  cardTitle: string;
  description: string;
  priorityRules: AIPriorityRule[];
  /** Default scoring weights for this archetype */
  weights: AIWeights;
}

/**
 * Complete AI profiles data loaded from JSON
 */
export interface AIProfilesData {
  archetypes: Record<string, AIArchetypeProfile>;
  /** Maps unit definition ID to archetype ID */
  unitMapping: Record<string, string>;
  /** Fallback archetype if unit not mapped */
  defaultArchetype: string;
}

// ============================================================================
// CONDITION AND ACTION IDENTIFIERS
// ============================================================================

/**
 * All recognized condition IDs that the AI can evaluate.
 * Each maps to a pure function in evaluate.ts.
 */
export type AIConditionId =
  | 'can-kill-target'
  | 'can-attack-from-cover'
  | 'enemy-in-range'
  | 'can-reach-cover-near-enemy'
  | 'low-health-should-retreat'
  | 'has-overwatch-opportunity'
  | 'adjacent-to-enemy'
  | 'morale-broken'
  | 'should-use-second-wind'
  | 'should-use-bought-time'
  | 'can-interact-objective'
  | 'should-aim-before-attack'
  | 'should-dodge-for-defense'
  | 'default';

/**
 * All recognized action IDs that the AI can execute.
 * Each maps to a builder function in actions.ts.
 */
export type AIActionId =
  | 'attack-kill-target'
  | 'move-to-cover-then-attack'
  | 'attack-best-target'
  | 'advance-with-cover'
  | 'retreat-to-cover'
  | 'set-overwatch'
  | 'melee-charge'
  | 'move-toward-enemy'
  | 'rest'
  | 'hold-position'
  | 'use-second-wind'
  | 'use-bought-time-advance'
  | 'move-to-objective-interact'
  | 'aim-then-attack'
  | 'dodge-and-hold';

// ============================================================================
// SCORING AND EVALUATION
// ============================================================================

/**
 * Weights for scoring heuristics.
 * Controls how the AI prioritizes different factors within a rule.
 */
export interface AIWeights {
  /** Prefer targets with lower health (easier kills) */
  killPotential: number;
  /** Prefer positions with better cover */
  coverValue: number;
  /** Prefer being closer to enemies */
  proximity: number;
  /** Prefer high-threat targets */
  threatLevel: number;
  /** Prefer elevated positions */
  elevation: number;
  /** How much to value self-preservation */
  selfPreservation: number;
  /** How much to value completing objectives (heroes only) */
  objectiveValue?: number;
  /** How much to value suppressive fire on low-courage targets */
  suppressionValue?: number;
  /** How much to value aiming for extra dice (0-10, aggressive archetypes higher) */
  aimValue?: number;
  /** How much to value dodging for defense (0-10, defensive archetypes higher) */
  dodgeValue?: number;
}

/**
 * Result of evaluating a single condition against game state
 */
export interface ConditionResult {
  /** Whether the condition is satisfied */
  satisfied: boolean;
  /** Contextual data for the action builder */
  context: ConditionContext;
}

/**
 * Contextual data produced by condition evaluation, consumed by action builders.
 * Not all fields are populated for every condition.
 */
export interface ConditionContext {
  /** Best target figure ID (for attack conditions) */
  targetId?: string;
  /** Best destination coordinate (for move conditions) */
  destination?: GridCoordinate;
  /** Attack position to move to before attacking */
  attackPosition?: GridCoordinate;
  /** Estimated damage output */
  expectedDamage?: number;
  /** Kill probability 0-1 */
  killProbability?: number;
  /** Cover at the proposed position */
  coverAtPosition?: string;
  /** Talent ID to activate (for talent-using actions) */
  talentId?: string;
  /** Objective point ID to interact with */
  objectivePointId?: string;
  /** Human-readable reasoning */
  reasoning: string;
}

/**
 * The complete result of the AI decision process for one activation
 */
export interface AIDecisionResult {
  /** The actions to take (may be 1-2 actions per activation) */
  actions: GameAction[];
  /** Which priority rule matched */
  matchedRule: AIPriorityRule;
  /** Human-readable explanation of the decision */
  reasoning: string;
  /** Scoring details for debugging/display */
  scores?: AIScoreCard[];
}

/**
 * Detailed score for a single candidate action (for debugging/UI display)
 */
export interface AIScoreCard {
  description: string;
  targetId?: string;
  destination?: GridCoordinate;
  score: number;
  components: Record<string, number>;
}

// ============================================================================
// SIMULATION TYPES
// ============================================================================

/**
 * Statistics collected per round of a simulated game
 */
export interface RoundStats {
  roundNumber: number;
  combatsOccurred: number;
  damageByImperial: number;
  damageByOperative: number;
  defeatedByImperial: number;
  defeatedByOperative: number;
  imperialMorale: number;
  operativeMorale: number;
  actionsPerType: Record<string, number>;
}

/**
 * Complete statistics for a single simulated game
 */
export interface GameSimulationResult {
  gameId: number;
  seed: number;
  winner: Side | 'Draw';
  victoryCondition: string;
  roundsPlayed: number;
  totalCombats: number;
  totalDamage: { imperial: number; operative: number };
  figuresDefeated: { imperial: number; operative: number };
  objectivesCompleted: number;
  objectivesTotal: number;
  roundStats: RoundStats[];
  moraleTrajectory: { imperial: number[]; operative: number[] };
  actionDistribution: Record<string, number>;
}

/**
 * Aggregated statistics across a batch of simulated games
 */
export interface BatchSimulationResult {
  gamesPlayed: number;
  imperialWinRate: number;
  operativeWinRate: number;
  drawRate: number;
  avgRoundsPlayed: number;
  avgDamage: { imperial: number; operative: number };
  avgDefeated: { imperial: number; operative: number };
  avgObjectivesCompleted: number;
  /** Victory condition breakdown: condition string -> count */
  victoryConditionBreakdown: Record<string, number>;
  games: GameSimulationResult[];
  /** Per-unit-type performance */
  unitPerformance: Record<string, UnitPerformanceStats>;
}

/**
 * Performance statistics for a specific unit type across all games
 */
export interface UnitPerformanceStats {
  unitId: string;
  unitName: string;
  gamesAppeared: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  survivalRate: number;
  avgActivations: number;
}

// ============================================================================
// SEEDED RNG
// ============================================================================

/**
 * A seedable random number generator function.
 * Returns a value in [0, 1) like Math.random().
 */
export type SeededRng = () => number;

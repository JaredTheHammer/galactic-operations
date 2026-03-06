/**
 * Balance Testing Framework - Type Definitions
 *
 * Types for systematic combat variable isolation testing.
 * Each test mutates exactly one variable from a baseline hero
 * to measure its isolated power contribution.
 */

import type { CombatScenarioConfig, CombatBatchResult, QuickHeroSpec, ArenaConfig } from '../../packages/engine/src/ai/combat-simulator.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Categories of variables that can be tested */
export type BalanceCategory =
  | 'characteristic'
  | 'skill'
  | 'weapon'
  | 'armor'
  | 'talent'
  | 'species'
  | 'synergy'
  | 'team'
  | 'progression'

/** Which tier of tests to run */
export type BalanceTier = 1 | 2 | 3

/** Baseline configuration: the neutral reference point */
export interface BaselineConfig {
  /** The baseline hero spec (human, e-11, padded-armor, no talents) */
  hero: QuickHeroSpec
  /** The standardized opponent (2x stormtroopers) */
  opponentNpcId: string
  opponentCount: number
  /** Arena settings */
  arena: ArenaConfig
  /** Side labels */
  sideALabel: string
  sideBLabel: string
}

/** Currency types for cross-pool comparison */
export type CurrencyType = 'xp' | 'credits' | 'ability-points'

/** Metadata attached to each generated scenario for reporting */
export interface ScenarioMeta {
  category: BalanceCategory
  tier: BalanceTier
  variableName: string
  variableValue: string
  xpCost: number | null
  creditCost: number | null
  abilityPointCost: number | null
  isBaseline?: boolean
}

/** A scenario config enriched with balance metadata */
export interface BalanceScenario {
  config: CombatScenarioConfig
  meta: ScenarioMeta
}

// ============================================================================
// RESULTS
// ============================================================================

/** Result for a single balance test */
export interface BalanceTestResult {
  scenarioId: string
  category: BalanceCategory
  tier: BalanceTier
  variableName: string
  variableValue: string
  /** Win rate for the hero side (Side B = operative) */
  winRate: number
  /** Win rate difference from baseline */
  powerDelta: number
  /** Average rounds to resolution */
  avgRounds: number
  /** Hero survival rate */
  heroSurvivalRate: number
  /** XP cost of this variable (null if not XP-priced) */
  xpCost: number | null
  /** Credit cost (null if not credit-priced) */
  creditCost: number | null
  /** Ability point cost (null if not AP-priced) */
  abilityPointCost: number | null
  /** Power per XP spent (null if no XP cost) */
  xpEfficiency: number | null
  /** Power per credit spent (null if no credit cost) */
  creditEfficiency: number | null
  /** Power per ability point spent (null if no AP cost) */
  abilityPointEfficiency: number | null
  /** Which currency pool this item primarily belongs to */
  primaryCurrency: CurrencyType | null
  /** Balance classification */
  classification: BalanceClassification
  /** Raw batch result for deep inspection */
  batchResult: CombatBatchResult
}

/** Balance classification based on power delta */
export type BalanceClassification =
  | 'overpowered'    // delta > +0.15
  | 'strong'         // delta > +0.08
  | 'balanced'       // delta between -0.08 and +0.08
  | 'weak'           // delta < -0.08
  | 'underpowered'   // delta < -0.15
  | 'negligible'     // delta between -0.03 and +0.03

/** Aggregated report across all tests in a tier */
export interface BalanceReport {
  timestamp: string
  gamesPerScenario: number
  seed: number
  baselineWinRate: number
  tiers: BalanceTier[]
  categories: BalanceCategory[]
  results: BalanceTestResult[]
  summary: BalanceSummary
}

/** Summary statistics for the report */
export interface BalanceSummary {
  totalScenarios: number
  totalGames: number
  avgBaselineWinRate: number
  topPerformers: BalanceTestResult[]
  bottomPerformers: BalanceTestResult[]
  outliers: BalanceTestResult[]
  byCategory: Record<string, CategorySummary>
  /** Cross-currency exchange rates derived from efficiency data */
  currencyExchangeRates: CurrencyExchangeRate[]
}

/** Per-category summary */
export interface CategorySummary {
  category: BalanceCategory
  count: number
  avgPowerDelta: number
  maxPowerDelta: number
  minPowerDelta: number
  avgXpEfficiency: number | null
  avgCreditEfficiency: number | null
  avgAbilityPointEfficiency: number | null
}

/** Exchange rate between two currency pools derived from efficiency ratios */
export interface CurrencyExchangeRate {
  from: CurrencyType
  to: CurrencyType
  /** How many units of 'to' currency = 1 unit of 'from' currency in power terms */
  rate: number
  /** Number of data points used to compute this rate */
  sampleSize: number
  /** Confidence: higher = more data points and lower variance */
  confidence: 'high' | 'medium' | 'low'
}

// ============================================================================
// CLI
// ============================================================================

/** Which baseline preset to use */
export type BaselinePreset = 'standard' | 'weak' | 'hard'

export interface BalanceCLIArgs {
  tier: BalanceTier | 'all'
  count: number
  seed: number
  category: BalanceCategory | 'all'
  format: 'console' | 'csv' | 'json' | 'html'
  output: string
  verbose: boolean
  baseline: BaselinePreset
}

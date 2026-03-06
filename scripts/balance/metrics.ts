/**
 * Balance Testing Framework - Metrics & Classification
 *
 * Computes power delta, multi-currency efficiency, exchange rates,
 * and balance classification from raw CombatBatchResult data.
 */

import type { CombatBatchResult } from '../../packages/engine/src/ai/combat-simulator.js'
import type {
  BalanceTestResult,
  BalanceClassification,
  BalanceScenario,
  BalanceSummary,
  CategorySummary,
  BalanceCategory,
  CurrencyType,
  CurrencyExchangeRate,
} from './types.js'

// ============================================================================
// POWER DELTA & CLASSIFICATION
// ============================================================================

/** Classification thresholds for power delta */
const THRESHOLDS = {
  overpowered: 0.15,
  strong: 0.08,
  negligible: 0.03,
  weak: -0.08,
  underpowered: -0.15,
}

export function classifyBalance(delta: number): BalanceClassification {
  const abs = Math.abs(delta)
  if (abs <= THRESHOLDS.negligible) return 'negligible'
  if (delta > THRESHOLDS.overpowered) return 'overpowered'
  if (delta > THRESHOLDS.strong) return 'strong'
  if (delta > -THRESHOLDS.strong) return 'balanced'
  if (delta > THRESHOLDS.underpowered) return 'weak'
  return 'underpowered'
}

/**
 * Compute power delta: variant win rate - baseline win rate.
 * Side B = hero/operative side.
 */
export function computePowerDelta(baselineWinRate: number, variantWinRate: number): number {
  return variantWinRate - baselineWinRate
}

// ============================================================================
// CURRENCY EFFICIENCY
// ============================================================================

/**
 * Power per unit of currency spent. Higher = more value per unit.
 * Returns null if no cost is applicable or cost is zero.
 */
export function computeEfficiency(powerDelta: number, cost: number | null): number | null {
  if (cost === null || cost === 0) return null
  return powerDelta / cost
}

/** Alias for backward compat */
export const computeXpEfficiency = computeEfficiency

/**
 * Determine which currency pool an item primarily belongs to based on its costs.
 * Items can have multiple costs (e.g., a talent costs XP, but the weapon it enables costs credits).
 * We pick the primary one based on which cost is non-null.
 */
export function determinePrimaryCurrency(
  xpCost: number | null,
  creditCost: number | null,
  abilityPointCost: number | null,
): CurrencyType | null {
  if (abilityPointCost !== null && abilityPointCost > 0) return 'ability-points'
  if (creditCost !== null && creditCost > 0) return 'credits'
  if (xpCost !== null && xpCost > 0) return 'xp'
  return null
}

// ============================================================================
// RESULT BUILDER
// ============================================================================

/**
 * Build a BalanceTestResult from a scenario + its batch result + baseline win rate.
 */
export function buildTestResult(
  scenario: BalanceScenario,
  batchResult: CombatBatchResult,
  baselineWinRate: number,
): BalanceTestResult {
  const heroWinRate = batchResult.sideBWinRate
  const delta = computePowerDelta(baselineWinRate, heroWinRate)
  const xpEff = computeEfficiency(delta, scenario.meta.xpCost)
  const creditEff = computeEfficiency(delta, scenario.meta.creditCost)
  const apEff = computeEfficiency(delta, scenario.meta.abilityPointCost)

  // Compute hero survival rate from figure stats
  let heroSurvivalRate = 0
  const figureEntries = Object.entries(batchResult.figureStats)
  const heroEntries = figureEntries.filter(([key]) => key.startsWith('hero-') || key.includes('Baseline'))
  if (heroEntries.length > 0) {
    heroSurvivalRate = heroEntries.reduce((sum, [, stats]) => sum + stats.survivalRate, 0) / heroEntries.length
  }

  return {
    scenarioId: scenario.config.id,
    category: scenario.meta.category,
    tier: scenario.meta.tier,
    variableName: scenario.meta.variableName,
    variableValue: scenario.meta.variableValue,
    winRate: heroWinRate,
    powerDelta: delta,
    avgRounds: batchResult.avgRoundsPlayed,
    heroSurvivalRate,
    xpCost: scenario.meta.xpCost,
    creditCost: scenario.meta.creditCost,
    abilityPointCost: scenario.meta.abilityPointCost,
    xpEfficiency: xpEff,
    creditEfficiency: creditEff,
    abilityPointEfficiency: apEff,
    primaryCurrency: determinePrimaryCurrency(
      scenario.meta.xpCost,
      scenario.meta.creditCost,
      scenario.meta.abilityPointCost,
    ),
    classification: classifyBalance(delta),
    batchResult,
  }
}

// ============================================================================
// EXCHANGE RATE COMPUTATION
// ============================================================================

/**
 * Compute cross-currency exchange rates from efficiency data.
 *
 * The idea: if 1 XP of power costs X and 1 credit of power costs Y,
 * then the exchange rate is X/Y credits per XP (in power terms).
 *
 * For example, if avg XP efficiency = 0.002 (0.2% power per XP)
 * and avg credit efficiency = 0.00004 (0.004% power per credit),
 * then 1 XP = 0.002/0.00004 = 50 credits in power terms.
 */
function computeExchangeRates(results: BalanceTestResult[]): CurrencyExchangeRate[] {
  const rates: CurrencyExchangeRate[] = []

  // Collect positive-delta efficiencies per currency
  const xpEfficiencies = results
    .filter(r => r.xpEfficiency !== null && r.powerDelta > 0)
    .map(r => r.xpEfficiency!)
  const creditEfficiencies = results
    .filter(r => r.creditEfficiency !== null && r.powerDelta > 0)
    .map(r => r.creditEfficiency!)
  const apEfficiencies = results
    .filter(r => r.abilityPointEfficiency !== null && r.powerDelta > 0)
    .map(r => r.abilityPointEfficiency!)

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const confidence = (n: number): 'high' | 'medium' | 'low' =>
    n >= 10 ? 'high' : n >= 3 ? 'medium' : 'low'

  const avgXp = avg(xpEfficiencies)
  const avgCredit = avg(creditEfficiencies)
  const avgAp = avg(apEfficiencies)

  // XP <-> Credits
  if (avgXp !== null && avgCredit !== null && avgCredit !== 0) {
    rates.push({
      from: 'xp',
      to: 'credits',
      rate: Math.round(avgXp / avgCredit),
      sampleSize: xpEfficiencies.length + creditEfficiencies.length,
      confidence: confidence(Math.min(xpEfficiencies.length, creditEfficiencies.length)),
    })
    rates.push({
      from: 'credits',
      to: 'xp',
      rate: +(avgCredit / avgXp).toFixed(4),
      sampleSize: xpEfficiencies.length + creditEfficiencies.length,
      confidence: confidence(Math.min(xpEfficiencies.length, creditEfficiencies.length)),
    })
  }

  // XP <-> Ability Points
  if (avgXp !== null && avgAp !== null && avgAp !== 0) {
    rates.push({
      from: 'xp',
      to: 'ability-points',
      rate: +(avgXp / avgAp).toFixed(2),
      sampleSize: xpEfficiencies.length + apEfficiencies.length,
      confidence: confidence(Math.min(xpEfficiencies.length, apEfficiencies.length)),
    })
    rates.push({
      from: 'ability-points',
      to: 'xp',
      rate: +(avgAp / avgXp).toFixed(4),
      sampleSize: xpEfficiencies.length + apEfficiencies.length,
      confidence: confidence(Math.min(xpEfficiencies.length, apEfficiencies.length)),
    })
  }

  // Credits <-> Ability Points
  if (avgCredit !== null && avgAp !== null && avgAp !== 0) {
    rates.push({
      from: 'credits',
      to: 'ability-points',
      rate: +(avgCredit / avgAp).toFixed(4),
      sampleSize: creditEfficiencies.length + apEfficiencies.length,
      confidence: confidence(Math.min(creditEfficiencies.length, apEfficiencies.length)),
    })
    rates.push({
      from: 'ability-points',
      to: 'credits',
      rate: Math.round(avgAp / avgCredit),
      sampleSize: creditEfficiencies.length + apEfficiencies.length,
      confidence: confidence(Math.min(creditEfficiencies.length, apEfficiencies.length)),
    })
  }

  return rates
}

// ============================================================================
// SUMMARY STATISTICS
// ============================================================================

/**
 * Build aggregated summary across all test results.
 */
export function buildSummary(results: BalanceTestResult[]): BalanceSummary {
  const totalGames = results.reduce((sum, r) => sum + r.batchResult.gamesPlayed, 0)

  // Sort by power delta for top/bottom performers
  const sorted = [...results].sort((a, b) => b.powerDelta - a.powerDelta)
  const topPerformers = sorted.slice(0, 5)
  const bottomPerformers = sorted.slice(-5).reverse()

  // Outliers: overpowered or underpowered
  const outliers = results.filter(
    r => r.classification === 'overpowered' || r.classification === 'underpowered',
  )

  // Per-category summaries
  const byCategory: Record<string, CategorySummary> = {}
  const categoryGroups = new Map<BalanceCategory, BalanceTestResult[]>()

  for (const r of results) {
    if (!categoryGroups.has(r.category)) categoryGroups.set(r.category, [])
    categoryGroups.get(r.category)!.push(r)
  }

  for (const [category, group] of categoryGroups) {
    const deltas = group.map(r => r.powerDelta)
    const xpEfficiencies = group.map(r => r.xpEfficiency).filter((e): e is number => e !== null)
    const creditEfficiencies = group.map(r => r.creditEfficiency).filter((e): e is number => e !== null)
    const apEfficiencies = group.map(r => r.abilityPointEfficiency).filter((e): e is number => e !== null)

    byCategory[category] = {
      category,
      count: group.length,
      avgPowerDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      maxPowerDelta: Math.max(...deltas),
      minPowerDelta: Math.min(...deltas),
      avgXpEfficiency: xpEfficiencies.length > 0
        ? xpEfficiencies.reduce((a, b) => a + b, 0) / xpEfficiencies.length
        : null,
      avgCreditEfficiency: creditEfficiencies.length > 0
        ? creditEfficiencies.reduce((a, b) => a + b, 0) / creditEfficiencies.length
        : null,
      avgAbilityPointEfficiency: apEfficiencies.length > 0
        ? apEfficiencies.reduce((a, b) => a + b, 0) / apEfficiencies.length
        : null,
    }
  }

  // Compute cross-currency exchange rates
  const currencyExchangeRates = computeExchangeRates(results)

  return {
    totalScenarios: results.length,
    totalGames,
    avgBaselineWinRate: 0, // Filled in by caller
    topPerformers,
    bottomPerformers,
    outliers,
    byCategory,
    currencyExchangeRates,
  }
}

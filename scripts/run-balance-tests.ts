/**
 * Balance Testing Framework - CLI Entry Point
 *
 * Runs systematic A/B combat tests to measure the power contribution
 * of every combat variable (characteristics, skills, weapons, armor,
 * talents, species) in isolation and combination.
 *
 * Usage:
 *   pnpm balance                                    # Default: tier 1, 100 games, console
 *   pnpm balance:quick                              # Quick: weapons only, 20 games
 *   pnpm balance --tier 1 --count 50 --format html --output reports/balance-t1.html
 *   pnpm balance --tier all --count 200 --seed 42 --format html --output reports/balance.html
 *   pnpm balance --category weapons --count 50
 *   pnpm balance --category talent --count 100 --format csv --output reports/talents.csv
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

import { loadGameDataV2, loadBoardTemplates } from '../packages/engine/src/data-loader.js'
import { loadAIProfiles } from '../packages/engine/src/ai/decide-v2.js'
import { runCombatBatch } from '../packages/engine/src/ai/combat-simulator.js'

import type { BalanceCLIArgs, BalanceCategory, BalanceTier, BalanceReport, BaselinePreset } from './balance/types.js'
import { getBaselineConfig, buildScenario, tagScenario } from './balance/baseline.js'
import { generateTierScenarios, generateCategoryScenarios } from './balance/scenario-generators.js'
import { buildTestResult, buildSummary } from './balance/metrics.js'
import {
  generateConsoleReport,
  generateCSVReport,
  generateJSONReport,
  generateHTMLReport,
} from './balance/report-generator.js'

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(): BalanceCLIArgs {
  const args = process.argv.slice(2)
  let tier: BalanceTier | 'all' = 1
  let count = 100
  let seed = 42
  let category: BalanceCategory | 'all' = 'all'
  let format: 'console' | 'csv' | 'json' | 'html' = 'console'
  let output = ''
  let verbose = false
  let baseline: BaselinePreset = 'standard'

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tier':
        tier = args[++i] === 'all' ? 'all' : (parseInt(args[i], 10) as BalanceTier)
        break
      case '--count':
        count = parseInt(args[++i], 10)
        break
      case '--seed':
        seed = parseInt(args[++i], 10)
        break
      case '--category':
        category = args[++i] as BalanceCategory | 'all'
        break
      case '--format':
        format = args[++i] as 'console' | 'csv' | 'json' | 'html'
        break
      case '--output':
        output = args[++i]
        break
      case '--baseline':
        baseline = args[++i] as BaselinePreset
        break
      case '--verbose':
        verbose = true
        break
      case '--help':
        console.log(`
  GALACTIC OPERATIONS - BALANCE TESTING FRAMEWORK

  Usage: pnpm balance [options]

  Options:
    --tier <1|2|3|all>       Test tier (default: 1)
    --count <N>              Games per scenario (default: 100)
    --seed <N>               RNG seed (default: 42)
    --category <name|all>    Filter by category (default: all)
                             Categories: characteristic, skill, weapon, armor,
                             talent, species, synergy, team, progression
    --baseline <preset>      Baseline preset: standard, weak, hard (default: standard)
    --format <type>          Output format: console, csv, json, html (default: console)
    --output <path>          Output file path (default: auto-generated)
    --verbose                Show per-game details
    --help                   Show this help
`)
        process.exit(0)
    }
  }

  return { tier, count, seed, category, format, output, verbose, baseline }
}

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function progressBar(current: number, total: number, label: string): void {
  const pct = Math.floor((current / total) * 100)
  const bar = '='.repeat(Math.floor(pct / 2.5)) + ' '.repeat(40 - Math.floor(pct / 2.5))
  process.stderr.write(`\r  [${bar}] ${pct}% (${current}/${total}) ${label}`)
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = parseArgs()
  const DATA_PATH = path.join(ROOT, 'data')

  console.log('')
  console.log('  GALACTIC OPERATIONS - BALANCE TESTING FRAMEWORK')
  console.log('  ' + '='.repeat(50))
  console.log(`  Tier: ${args.tier}  Category: ${args.category}  Baseline: ${args.baseline}  Games/scenario: ${args.count}  Seed: ${args.seed}`)
  console.log('')

  // Load game data
  process.stderr.write('  Loading game data...')
  const gameData = await loadGameDataV2(DATA_PATH)
  const boardTemplates = await loadBoardTemplates(DATA_PATH)
  const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'))
  const profilesData = loadAIProfiles(profilesJson)
  process.stderr.write(' done\n')

  // Resolve baseline config
  const baselineConfig = getBaselineConfig(args.baseline)

  // Generate scenarios
  process.stderr.write('  Generating scenarios...')
  let scenarios = args.category !== 'all'
    ? generateCategoryScenarios(args.category, baselineConfig, gameData, args.count, args.seed)
    : generateTierScenarios(args.tier, baselineConfig, gameData, args.count, args.seed)

  process.stderr.write(` ${scenarios.length} scenarios\n`)

  // Run baseline first to establish reference win rate
  const baselineLabel = args.baseline === 'weak'
    ? 'Weak Baseline (Human / Fists / No Armor)'
    : args.baseline === 'hard'
      ? 'Hard Baseline (Human / E-11 / Padded / vs 3x Stormtroopers)'
      : 'Standard Baseline (Human / E-11 / Padded Armor)'
  process.stderr.write(`  Running ${args.baseline} baseline...`)
  const baselineScenarioConfig = buildScenario(
    'baseline',
    baselineLabel,
    baselineConfig.hero,
    baselineConfig,
    args.count,
    args.seed,
  )
  const baselineResult = runCombatBatch(
    baselineScenarioConfig,
    gameData,
    profilesData,
    boardTemplates,
    args.count,
    args.seed,
    args.verbose,
  )
  const baselineWinRate = baselineResult.sideBWinRate
  process.stderr.write(` win rate: ${(baselineWinRate * 100).toFixed(1)}%\n\n`)

  // Run all variant scenarios
  const results = []
  const startTime = Date.now()

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    const label = scenario.config.name.slice(0, 30)
    progressBar(i + 1, scenarios.length, label)

    const batchResult = runCombatBatch(
      scenario.config,
      gameData,
      profilesData,
      boardTemplates,
      args.count,
      args.seed,
      args.verbose,
    )

    results.push(buildTestResult(scenario, batchResult, baselineWinRate))
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  process.stderr.write(`\n\n  Completed ${scenarios.length} scenarios in ${elapsed}s\n`)

  // Build report
  const summary = buildSummary(results)
  summary.avgBaselineWinRate = baselineWinRate

  const report: BalanceReport = {
    timestamp: new Date().toISOString(),
    gamesPerScenario: args.count,
    seed: args.seed,
    baselineWinRate,
    tiers: args.tier === 'all' ? [1, 2, 3] : [args.tier as BalanceTier],
    categories: args.category === 'all'
      ? [...new Set(results.map(r => r.category))]
      : [args.category as BalanceCategory],
    results,
    summary,
  }

  // Generate output
  let outputContent: string
  let outputExt: string

  switch (args.format) {
    case 'csv':
      outputContent = generateCSVReport(report)
      outputExt = 'csv'
      break
    case 'json':
      outputContent = generateJSONReport(report)
      outputExt = 'json'
      break
    case 'html':
      outputContent = generateHTMLReport(report)
      outputExt = 'html'
      break
    case 'console':
    default:
      console.log(generateConsoleReport(report))
      // Also write to file if --output specified
      if (args.output) {
        outputContent = generateConsoleReport(report)
        outputExt = 'txt'
      } else {
        return // Console only, no file output
      }
      break
  }

  // Write file output
  const outputPath = args.output || path.join(ROOT, 'reports', `balance-${args.tier}-${args.category}.${outputExt!}`)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, outputContent!)
  console.log(`\n  Report written to: ${outputPath}`)
  console.log('')
}

main().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})

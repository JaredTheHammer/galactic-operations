/**
 * Batch Simulation CLI
 *
 * Runs multiple headless AI-vs-AI games and produces:
 *   - Console summary of win rates and statistics
 *   - reports/results.json   (full BatchSimulationResult)
 *   - reports/games.csv      (one row per game)
 *   - reports/summary.txt    (human-readable)
 *   - reports/balance-report.html (interactive Chart.js dashboard)
 *
 * Usage:
 *   pnpm simulate                         # 50 games, seed 42
 *   pnpm simulate --count 100 --seed 7    # 100 games, seed 7
 *   pnpm simulate --count 10 --verbose    # 10 games with per-action logging
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

// Engine imports (v2)
import { loadGameDataV2, loadBoardTemplates } from '../packages/engine/src/data-loader.js'
import { loadAIProfiles } from '../packages/engine/src/ai/decide-v2.js'
import { runBatchV2, generateTestHeroes, defaultArmyV2 } from '../packages/engine/src/ai/simulator-v2.js'
import type { BatchSimulationResult, GameSimulationResult } from '../packages/engine/src/ai/types.js'
import type { Mission } from '../packages/engine/src/types.js'

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(): { count: number; seed: number; verbose: boolean } {
  const args = process.argv.slice(2)
  let count = 50
  let seed = 42
  let verbose = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--seed' && args[i + 1]) {
      seed = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--verbose') {
      verbose = true
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
GALACTIC OPERATIONS - Batch Simulator

Usage: pnpm simulate [options]

Options:
  --count N     Number of games to simulate (default: 50)
  --seed  N     Base RNG seed (default: 42)
  --verbose     Print per-action details
  --help, -h    Show this help
      `)
      process.exit(0)
    }
  }

  return { count, seed, verbose }
}

// ============================================================================
// MISSION TEMPLATE
// ============================================================================

const SIMULATION_MISSION: Mission = {
  id: 'sim-balance-v2',
  name: 'Balance Test v2',
  description: 'Standard balance simulation with wounded mechanic and objectives',
  mapId: 'generated',
  roundLimit: 15,
  imperialThreat: 4,
  imperialReinforcementPoints: 5,
  victoryConditions: [
    { side: 'Imperial', description: 'Wound all heroes', condition: 'allHeroesWounded' },
    {
      side: 'Operative',
      description: 'Complete 2 of 3 mission objectives',
      condition: 'objectivesCompleted',
      objectiveThreshold: 2,
    },
  ],
}

// ============================================================================
// REPORT GENERATORS
// ============================================================================

function generateSummaryText(result: BatchSimulationResult, seed: number): string {
  const lines: string[] = []
  const w = 52

  lines.push('='.repeat(w))
  lines.push('  GALACTIC OPERATIONS - BALANCE REPORT')
  lines.push('='.repeat(w))
  lines.push(`  Games played:   ${result.gamesPlayed}`)
  lines.push(`  Base seed:      ${seed}`)
  lines.push(`  Army: Imperial  (initial patrol + threat reinforcements)`)
  lines.push(`  Army: Operative (4 heroes with full character sheets)`)
  lines.push('')

  lines.push('-'.repeat(w))
  lines.push('  WIN RATES')
  lines.push('-'.repeat(w))
  lines.push(`  Imperial:   ${(result.imperialWinRate * 100).toFixed(1)}%  (${Math.round(result.imperialWinRate * result.gamesPlayed)} wins)`)
  lines.push(`  Operative:  ${(result.operativeWinRate * 100).toFixed(1)}%  (${Math.round(result.operativeWinRate * result.gamesPlayed)} wins)`)
  lines.push(`  Draw:       ${(result.drawRate * 100).toFixed(1)}%  (${Math.round(result.drawRate * result.gamesPlayed)} draws)`)
  lines.push('')

  lines.push('-'.repeat(w))
  lines.push('  AVERAGES PER GAME')
  lines.push('-'.repeat(w))
  lines.push(`  Rounds played:    ${result.avgRoundsPlayed.toFixed(1)}`)
  lines.push(`  Imp damage dealt: ${result.avgDamage.imperial.toFixed(1)}`)
  lines.push(`  Op  damage dealt: ${result.avgDamage.operative.toFixed(1)}`)
  lines.push(`  Imp figs defeated:${result.avgDefeated.imperial.toFixed(1)}`)
  lines.push(`  Op  figs defeated:${result.avgDefeated.operative.toFixed(1)}`)
  lines.push(`  Objectives done:  ${result.avgObjectivesCompleted.toFixed(2)} / 3`)
  lines.push('')

  // Victory condition breakdown
  lines.push('-'.repeat(w))
  lines.push('  VICTORY CONDITIONS')
  lines.push('-'.repeat(w))
  for (const [condition, count] of Object.entries(result.victoryConditionBreakdown).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${condition.padEnd(28)} ${count} (${(count / result.gamesPlayed * 100).toFixed(1)}%)`)
  }
  lines.push('')

  lines.push('-'.repeat(w))
  lines.push('  UNIT PERFORMANCE')
  lines.push('-'.repeat(w))
  lines.push(`  ${'Unit'.padEnd(22)} Survival  AvgDmgTaken`)

  for (const [unitId, stats] of Object.entries(result.unitPerformance)) {
    const name = stats.unitName.padEnd(22)
    const surv = `${(stats.survivalRate * 100).toFixed(0)}%`.padStart(7)
    const dmg = stats.avgDamageTaken.toFixed(1).padStart(10)
    lines.push(`  ${name} ${surv}  ${dmg}`)
  }

  lines.push('')
  lines.push('='.repeat(w))

  return lines.join('\n')
}

function generateCSV(result: BatchSimulationResult): string {
  const headers = [
    'gameId', 'seed', 'winner', 'victoryCondition', 'roundsPlayed',
    'imperialDamage', 'operativeDamage',
    'imperialDefeated', 'operativeDefeated',
    'objectivesCompleted', 'totalCombats',
  ]

  const rows = result.games.map(g => [
    g.gameId,
    g.seed,
    g.winner,
    g.victoryCondition,
    g.roundsPlayed,
    g.totalDamage.imperial,
    g.totalDamage.operative,
    g.figuresDefeated.imperial,
    g.figuresDefeated.operative,
    g.objectivesCompleted,
    g.totalCombats,
  ].join(','))

  return [headers.join(','), ...rows].join('\n')
}

function generateHTMLReport(result: BatchSimulationResult, seed: number): string {
  const impWins = Math.round(result.imperialWinRate * result.gamesPlayed)
  const opWins = Math.round(result.operativeWinRate * result.gamesPlayed)
  const draws = Math.round(result.drawRate * result.gamesPlayed)

  // Aggregate morale trajectories (average across all games)
  const maxRounds = Math.max(...result.games.map(g => g.moraleTrajectory.imperial.length))
  const avgMoraleImp: number[] = []
  const avgMoraleOp: number[] = []
  for (let r = 0; r < maxRounds; r++) {
    let sumImp = 0, sumOp = 0, count = 0
    for (const g of result.games) {
      if (r < g.moraleTrajectory.imperial.length) {
        sumImp += g.moraleTrajectory.imperial[r]
        sumOp += g.moraleTrajectory.operative[r]
        count++
      }
    }
    avgMoraleImp.push(count ? sumImp / count : 0)
    avgMoraleOp.push(count ? sumOp / count : 0)
  }

  // Rounds distribution
  const roundCounts: Record<number, number> = {}
  for (const g of result.games) {
    roundCounts[g.roundsPlayed] = (roundCounts[g.roundsPlayed] || 0) + 1
  }
  const roundLabels = Object.keys(roundCounts).sort((a, b) => +a - +b)
  const roundValues = roundLabels.map(k => roundCounts[+k])

  // Unit stats for bar chart
  const unitNames = Object.values(result.unitPerformance).map(u => u.unitName)
  const unitSurvival = Object.values(result.unitPerformance).map(u => +(u.survivalRate * 100).toFixed(1))
  const unitDmgTaken = Object.values(result.unitPerformance).map(u => +u.avgDamageTaken.toFixed(1))

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Galactic Operations - Balance Report</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.6/chart.umd.min.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0f;
    color: #c8cad0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    padding: 32px;
  }
  h1 {
    text-align: center;
    font-size: 22px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #4a9eff;
    margin-bottom: 6px;
  }
  .subtitle {
    text-align: center;
    font-size: 12px;
    color: #666;
    margin-bottom: 32px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .card {
    background: #111118;
    border: 1px solid #1a1a2e;
    border-radius: 8px;
    padding: 20px;
  }
  .card h2 {
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #4a9eff;
    margin-bottom: 16px;
  }
  .card canvas { max-height: 260px; }
  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    padding: 6px 0;
    border-bottom: 1px solid #1a1a2e;
  }
  .stat-row:last-child { border: none; }
  .stat-label { color: #888; }
  .stat-value { font-weight: 700; }
  .imp { color: #ff4444; }
  .op { color: #44ff44; }
  .draw { color: #ffd700; }
  .full-width { grid-column: 1 / -1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #4a9eff; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #1a1a2e; }
  td { padding: 6px 8px; border-bottom: 1px solid #0d0d14; }
</style>
</head>
<body>
<h1>Galactic Operations - Balance Report</h1>
<div class="subtitle">${result.gamesPlayed} games | base seed ${seed} | ${new Date().toISOString().slice(0, 10)}</div>

<div class="grid">
  <!-- Win Rates -->
  <div class="card">
    <h2>Win Rates</h2>
    <canvas id="winChart"></canvas>
  </div>

  <!-- Summary Stats -->
  <div class="card">
    <h2>Summary</h2>
    <div class="stat-row"><span class="stat-label">Games</span><span class="stat-value">${result.gamesPlayed}</span></div>
    <div class="stat-row"><span class="stat-label">Imperial Wins</span><span class="stat-value imp">${impWins} (${(result.imperialWinRate * 100).toFixed(1)}%)</span></div>
    <div class="stat-row"><span class="stat-label">Operative Wins</span><span class="stat-value op">${opWins} (${(result.operativeWinRate * 100).toFixed(1)}%)</span></div>
    <div class="stat-row"><span class="stat-label">Draws</span><span class="stat-value draw">${draws} (${(result.drawRate * 100).toFixed(1)}%)</span></div>
    <div class="stat-row"><span class="stat-label">Avg Rounds</span><span class="stat-value">${result.avgRoundsPlayed.toFixed(1)}</span></div>
    <div class="stat-row"><span class="stat-label">Avg Imp Damage</span><span class="stat-value imp">${result.avgDamage.imperial.toFixed(1)}</span></div>
    <div class="stat-row"><span class="stat-label">Avg Op Damage</span><span class="stat-value op">${result.avgDamage.operative.toFixed(1)}</span></div>
  </div>

  <!-- Rounds Distribution -->
  <div class="card">
    <h2>Rounds Distribution</h2>
    <canvas id="roundsChart"></canvas>
  </div>

  <!-- Morale Trajectory -->
  <div class="card">
    <h2>Average Morale Trajectory</h2>
    <canvas id="moraleChart"></canvas>
  </div>

  <!-- Unit Performance -->
  <div class="card full-width">
    <h2>Unit Performance</h2>
    <table>
      <tr><th>Unit</th><th>Appearances</th><th>Survival Rate</th><th>Avg Damage Taken</th></tr>
      ${Object.values(result.unitPerformance).map(u => `
      <tr>
        <td>${u.unitName}</td>
        <td>${u.gamesAppeared}</td>
        <td>${(u.survivalRate * 100).toFixed(0)}%</td>
        <td>${u.avgDamageTaken.toFixed(1)}</td>
      </tr>`).join('')}
    </table>
  </div>

  <!-- Unit Survival Chart -->
  <div class="card full-width">
    <h2>Unit Survival vs Damage Taken</h2>
    <canvas id="unitChart"></canvas>
  </div>
</div>

<script>
  Chart.defaults.color = '#888';
  Chart.defaults.borderColor = '#1a1a2e';

  // Win Rate Pie
  new Chart(document.getElementById('winChart'), {
    type: 'doughnut',
    data: {
      labels: ['Imperial', 'Operative', 'Draw'],
      datasets: [{
        data: [${impWins}, ${opWins}, ${draws}],
        backgroundColor: ['#ff4444', '#44ff44', '#ffd700'],
        borderWidth: 0,
      }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
  });

  // Rounds Distribution
  new Chart(document.getElementById('roundsChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(roundLabels)},
      datasets: [{
        label: 'Games',
        data: ${JSON.stringify(roundValues)},
        backgroundColor: '#4a9eff',
        borderRadius: 3,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Rounds Played', color: '#666' } },
        y: { title: { display: true, text: 'Game Count', color: '#666' }, beginAtZero: true }
      }
    }
  });

  // Morale Trajectory
  new Chart(document.getElementById('moraleChart'), {
    type: 'line',
    data: {
      labels: ${JSON.stringify(avgMoraleImp.map((_, i) => `R${i}`))},
      datasets: [
        {
          label: 'Imperial',
          data: ${JSON.stringify(avgMoraleImp.map(v => +v.toFixed(1)))},
          borderColor: '#ff4444',
          backgroundColor: 'rgba(255,68,68,0.1)',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Operative',
          data: ${JSON.stringify(avgMoraleOp.map(v => +v.toFixed(1)))},
          borderColor: '#44ff44',
          backgroundColor: 'rgba(68,255,68,0.1)',
          tension: 0.3,
          fill: true,
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { title: { display: true, text: 'Morale', color: '#666' }, min: 0 }
      }
    }
  });

  // Unit Performance
  new Chart(document.getElementById('unitChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(unitNames)},
      datasets: [
        {
          label: 'Survival Rate (%)',
          data: ${JSON.stringify(unitSurvival)},
          backgroundColor: '#44ff44',
          borderRadius: 3,
        },
        {
          label: 'Avg Damage Taken',
          data: ${JSON.stringify(unitDmgTaken)},
          backgroundColor: '#ff4444',
          borderRadius: 3,
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
<\/script>
</body>
</html>`
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { count, seed, verbose } = parseArgs()

  console.log('\n  GALACTIC OPERATIONS - Batch Simulator')
  console.log(`  Games: ${count} | Seed: ${seed} | Verbose: ${verbose}\n`)

  // Load v2 game data
  console.log('  Loading v2 game data...')
  const dataPath = path.join(ROOT, 'data')
  const gameData = await loadGameDataV2(dataPath)

  // Load board templates for proper map generation (matches live game)
  const boardTemplates = await loadBoardTemplates(dataPath)
  console.log(`  Board templates loaded: ${boardTemplates.length}`)

  // Load AI profiles
  const aiProfilesRaw = JSON.parse(
    await fs.readFile(path.join(dataPath, 'ai-profiles.json'), 'utf-8')
  )
  const profiles = loadAIProfiles(aiProfilesRaw)

  // Generate test heroes
  const heroes = generateTestHeroes(gameData)
  console.log(`  Heroes: ${heroes.map(h => h.name).join(', ')}`)
  console.log('  Data loaded. Starting v2 simulation...\n')

  const startTime = Date.now()

  // Run v2 batch with generated map (skirmish 36x36, matches live game)
  const result = runBatchV2(
    SIMULATION_MISSION,
    gameData,
    profiles,
    heroes,
    count,
    defaultArmyV2(heroes),
    seed,
    verbose,
    boardTemplates,
  )

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n  Simulation complete in ${elapsed}s`)

  // Print summary to console
  const summary = generateSummaryText(result, seed)
  console.log('\n' + summary)

  // Write reports
  const reportsDir = path.join(ROOT, 'reports')
  await fs.mkdir(reportsDir, { recursive: true })

  await fs.writeFile(path.join(reportsDir, 'summary.txt'), summary, 'utf-8')
  await fs.writeFile(path.join(reportsDir, 'results.json'), JSON.stringify(result, null, 2), 'utf-8')
  await fs.writeFile(path.join(reportsDir, 'games.csv'), generateCSV(result), 'utf-8')
  await fs.writeFile(path.join(reportsDir, 'balance-report.html'), generateHTMLReport(result, seed), 'utf-8')

  console.log(`\n  Reports written to ${reportsDir}/`)
  console.log('    summary.txt')
  console.log('    results.json')
  console.log('    games.csv')
  console.log('    balance-report.html')
}

main().catch(err => {
  console.error('Simulation failed:', err)
  process.exit(1)
})

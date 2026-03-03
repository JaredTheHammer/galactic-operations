/**
 * Standalone Combat Simulator Runner
 *
 * This script can be imported and executed via vitest or any TS runner
 * that doesn't require IPC pipes. It runs all example scenarios,
 * writes CSV + HTML reports, and prints a text summary.
 *
 * Usage via vitest:
 *   npx vitest run scripts/run-combat-sim-standalone.ts
 *
 * Or import and call runAllScenarios() directly.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

import { loadGameDataV2, loadBoardTemplates } from '../packages/engine/src/data-loader.js';
import { loadAIProfiles } from '../packages/engine/src/ai/decide-v2.js';
import {
  runCombatBatch,
  type CombatScenarioConfig,
  type CombatBatchResult,
} from '../packages/engine/src/ai/combat-simulator.js';

// ============================================================================
// REPORT GENERATORS (duplicated from run-combat-sim.ts for standalone use)
// ============================================================================

function generateCombatSummary(result: CombatBatchResult): string {
  const lines: string[] = [];
  const w = 56;

  lines.push('='.repeat(w));
  lines.push('  COMBAT SIMULATOR - BALANCE REPORT');
  lines.push('='.repeat(w));
  lines.push(`  Scenario:       ${result.scenarioName}`);
  lines.push(`  Games played:   ${result.gamesPlayed}`);
  lines.push(`  Side A:         ${result.sideALabel}`);
  lines.push(`  Side B:         ${result.sideBLabel}`);
  lines.push('');

  lines.push('-'.repeat(w));
  lines.push('  WIN RATES');
  lines.push('-'.repeat(w));
  const aWins = Math.round(result.sideAWinRate * result.gamesPlayed);
  const bWins = Math.round(result.sideBWinRate * result.gamesPlayed);
  const drawCount = Math.round(result.drawRate * result.gamesPlayed);
  lines.push(`  ${result.sideALabel.padEnd(20)} ${(result.sideAWinRate * 100).toFixed(1)}%  (${aWins} wins)`);
  lines.push(`  ${result.sideBLabel.padEnd(20)} ${(result.sideBWinRate * 100).toFixed(1)}%  (${bWins} wins)`);
  lines.push(`  ${'Draw'.padEnd(20)} ${(result.drawRate * 100).toFixed(1)}%  (${drawCount} draws)`);
  lines.push('');

  lines.push('-'.repeat(w));
  lines.push('  AVERAGES PER GAME');
  lines.push('-'.repeat(w));
  lines.push(`  Rounds played:       ${result.avgRoundsPlayed.toFixed(1)}`);
  lines.push(`  Side A damage taken: ${result.avgDamage.sideA.toFixed(1)}`);
  lines.push(`  Side B damage taken: ${result.avgDamage.sideB.toFixed(1)}`);
  lines.push(`  Side A defeated:     ${result.avgDefeated.sideA.toFixed(1)}`);
  lines.push(`  Side B defeated:     ${result.avgDefeated.sideB.toFixed(1)}`);
  lines.push('');

  lines.push('-'.repeat(w));
  lines.push('  FIGURE PERFORMANCE');
  lines.push('-'.repeat(w));
  lines.push(`  ${'Figure'.padEnd(22)} Side  Survival  AvgDmgTkn  AvgRounds`);

  for (const [, stats] of Object.entries(result.figureStats)) {
    const name = stats.name.padEnd(22);
    const side = stats.side.padEnd(4);
    const surv = `${(stats.survivalRate * 100).toFixed(0)}%`.padStart(8);
    const dmg = stats.avgDamageTaken.toFixed(1).padStart(10);
    const rnds = stats.avgRoundsSurvived.toFixed(1).padStart(10);
    lines.push(`  ${name} ${side} ${surv} ${dmg} ${rnds}`);
  }

  lines.push('');
  lines.push('='.repeat(w));

  return lines.join('\n');
}

function generateCombatCSV(result: CombatBatchResult): string {
  const headers = [
    'gameId', 'seed', 'winner', 'winnerLabel', 'roundsPlayed',
    'sideADamageTaken', 'sideBDamageTaken',
    'sideADefeated', 'sideBDefeated',
  ];

  const rows = result.games.map(g => [
    g.gameId,
    g.seed,
    g.winner,
    g.winnerLabel,
    g.roundsPlayed,
    g.totalDamage.sideA,
    g.totalDamage.sideB,
    g.totalDefeated.sideA,
    g.totalDefeated.sideB,
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

function generateCombatHTML(results: CombatBatchResult[]): string {
  const isComparison = results.length > 1;

  const scenarioData = results.map(r => {
    const aWins = Math.round(r.sideAWinRate * r.gamesPlayed);
    const bWins = Math.round(r.sideBWinRate * r.gamesPlayed);
    const draws = Math.round(r.drawRate * r.gamesPlayed);

    const roundCounts: Record<number, number> = {};
    for (const g of r.games) {
      roundCounts[g.roundsPlayed] = (roundCounts[g.roundsPlayed] || 0) + 1;
    }
    const roundLabels = Object.keys(roundCounts).sort((a, b) => +a - +b);
    const roundValues = roundLabels.map(k => roundCounts[+k]);

    const figNames = Object.values(r.figureStats).map(f => `${f.name} (${f.side})`);
    const figSurvival = Object.values(r.figureStats).map(f => +(f.survivalRate * 100).toFixed(1));
    const figDmgTaken = Object.values(r.figureStats).map(f => +f.avgDamageTaken.toFixed(1));

    return { ...r, aWins, bWins, draws, roundLabels, roundValues, figNames, figSurvival, figDmgTaken };
  });

  const title = isComparison
    ? 'Combat Simulator - Comparison Report'
    : `Combat Simulator - ${results[0].scenarioName}`;

  const compLabels = scenarioData.map(s => s.scenarioName);
  const compAWins = scenarioData.map(s => +(s.sideAWinRate * 100).toFixed(1));
  const compBWins = scenarioData.map(s => +(s.sideBWinRate * 100).toFixed(1));
  const compDraws = scenarioData.map(s => +(s.drawRate * 100).toFixed(1));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
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
    max-width: 1200px;
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
  .card canvas { max-height: 280px; }
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
  .sideA { color: #ff4444; }
  .sideB { color: #44ff44; }
  .draw { color: #ffd700; }
  .full-width { grid-column: 1 / -1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #4a9eff; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #1a1a2e; }
  td { padding: 6px 8px; border-bottom: 1px solid #0d0d14; }
  .scenario-section { margin-bottom: 48px; }
  .scenario-section h3 {
    font-size: 16px;
    color: #ffd700;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #1a1a2e;
  }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="subtitle">${results.reduce((sum, r) => sum + r.gamesPlayed, 0)} total games | ${new Date().toISOString().slice(0, 10)}</div>

${isComparison ? `
<!-- COMPARISON VIEW -->
<div class="grid">
  <div class="card full-width">
    <h2>Win Rate Comparison</h2>
    <canvas id="compWinChart"></canvas>
  </div>

  <div class="card full-width">
    <h2>Avg Rounds to Resolution</h2>
    <canvas id="compRoundsChart"></canvas>
  </div>

  <div class="card full-width">
    <h2>Scenario Summary</h2>
    <table>
      <tr><th>Scenario</th><th>Games</th><th>Side A Win</th><th>Side B Win</th><th>Draw</th><th>Avg Rounds</th><th>Avg Dmg A</th><th>Avg Dmg B</th></tr>
      ${scenarioData.map(sd => `
      <tr>
        <td>${sd.scenarioName}</td>
        <td>${sd.gamesPlayed}</td>
        <td class="sideA">${(sd.sideAWinRate * 100).toFixed(1)}%</td>
        <td class="sideB">${(sd.sideBWinRate * 100).toFixed(1)}%</td>
        <td class="draw">${(sd.drawRate * 100).toFixed(1)}%</td>
        <td>${sd.avgRoundsPlayed.toFixed(1)}</td>
        <td>${sd.avgDamage.sideA.toFixed(1)}</td>
        <td>${sd.avgDamage.sideB.toFixed(1)}</td>
      </tr>`).join('')}
    </table>
  </div>
</div>
` : ''}

${scenarioData.map((sd, idx) => `
<div class="scenario-section">
  ${isComparison ? `<h3>${sd.scenarioName}</h3>` : ''}
  <div class="grid">
    <!-- Win Rates -->
    <div class="card">
      <h2>Win Rates</h2>
      <canvas id="winChart${idx}"></canvas>
    </div>

    <!-- Summary -->
    <div class="card">
      <h2>Summary</h2>
      <div class="stat-row"><span class="stat-label">Games</span><span class="stat-value">${sd.gamesPlayed}</span></div>
      <div class="stat-row"><span class="stat-label">${sd.sideALabel}</span><span class="stat-value sideA">${sd.aWins} (${(sd.sideAWinRate * 100).toFixed(1)}%)</span></div>
      <div class="stat-row"><span class="stat-label">${sd.sideBLabel}</span><span class="stat-value sideB">${sd.bWins} (${(sd.sideBWinRate * 100).toFixed(1)}%)</span></div>
      <div class="stat-row"><span class="stat-label">Draw</span><span class="stat-value draw">${sd.draws} (${(sd.drawRate * 100).toFixed(1)}%)</span></div>
      <div class="stat-row"><span class="stat-label">Avg Rounds</span><span class="stat-value">${sd.avgRoundsPlayed.toFixed(1)}</span></div>
      <div class="stat-row"><span class="stat-label">Avg Dmg Taken (A)</span><span class="stat-value sideA">${sd.avgDamage.sideA.toFixed(1)}</span></div>
      <div class="stat-row"><span class="stat-label">Avg Dmg Taken (B)</span><span class="stat-value sideB">${sd.avgDamage.sideB.toFixed(1)}</span></div>
    </div>

    <!-- Rounds Distribution -->
    <div class="card">
      <h2>Rounds Distribution</h2>
      <canvas id="roundsChart${idx}"></canvas>
    </div>

    <!-- Figure Performance Table -->
    <div class="card">
      <h2>Figure Performance</h2>
      <table>
        <tr><th>Figure</th><th>Side</th><th>Survival</th><th>Avg Dmg</th><th>Wounded</th></tr>
        ${Object.values(sd.figureStats).map(f => `
        <tr>
          <td>${f.name}</td>
          <td>${f.side}</td>
          <td>${(f.survivalRate * 100).toFixed(0)}%</td>
          <td>${f.avgDamageTaken.toFixed(1)}</td>
          <td>${(f.woundedRate * 100).toFixed(0)}%</td>
        </tr>`).join('')}
      </table>
    </div>

    <!-- Figure Survival Chart -->
    <div class="card full-width">
      <h2>Figure Survival vs Damage Taken</h2>
      <canvas id="figChart${idx}"></canvas>
    </div>
  </div>
</div>
`).join('')}

<script>
  Chart.defaults.color = '#888';
  Chart.defaults.borderColor = '#1a1a2e';

  ${isComparison ? `
  // Comparison Win Rate Chart
  new Chart(document.getElementById('compWinChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(compLabels)},
      datasets: [
        { label: 'Side A Win %', data: ${JSON.stringify(compAWins)}, backgroundColor: '#ff4444', borderRadius: 3 },
        { label: 'Side B Win %', data: ${JSON.stringify(compBWins)}, backgroundColor: '#44ff44', borderRadius: 3 },
        { label: 'Draw %', data: ${JSON.stringify(compDraws)}, backgroundColor: '#ffd700', borderRadius: 3 },
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Win Rate %', color: '#666' } } }
    }
  });

  // Comparison Rounds Chart
  new Chart(document.getElementById('compRoundsChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(compLabels)},
      datasets: [{
        label: 'Avg Rounds',
        data: ${JSON.stringify(scenarioData.map(sd => +sd.avgRoundsPlayed.toFixed(1)))},
        backgroundColor: '#4a9eff',
        borderRadius: 3,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Rounds', color: '#666' } } }
    }
  });
  ` : ''}

  ${scenarioData.map((sd, idx) => `
  // Scenario ${idx}: Win Rate Pie
  new Chart(document.getElementById('winChart${idx}'), {
    type: 'doughnut',
    data: {
      labels: ['${sd.sideALabel}', '${sd.sideBLabel}', 'Draw'],
      datasets: [{
        data: [${sd.aWins}, ${sd.bWins}, ${sd.draws}],
        backgroundColor: ['#ff4444', '#44ff44', '#ffd700'],
        borderWidth: 0,
      }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
  });

  // Scenario ${idx}: Rounds Distribution
  new Chart(document.getElementById('roundsChart${idx}'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(sd.roundLabels)},
      datasets: [{
        label: 'Games',
        data: ${JSON.stringify(sd.roundValues)},
        backgroundColor: '#4a9eff',
        borderRadius: 3,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Rounds', color: '#666' } },
        y: { beginAtZero: true }
      }
    }
  });

  // Scenario ${idx}: Figure Performance
  new Chart(document.getElementById('figChart${idx}'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(sd.figNames)},
      datasets: [
        {
          label: 'Survival Rate (%)',
          data: ${JSON.stringify(sd.figSurvival)},
          backgroundColor: '#44ff44',
          borderRadius: 3,
        },
        {
          label: 'Avg Damage Taken',
          data: ${JSON.stringify(sd.figDmgTaken)},
          backgroundColor: '#ff4444',
          borderRadius: 3,
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
  `).join('\n')}
<\/script>
</body>
</html>`;
}

// ============================================================================
// MAIN RUNNER (wrapped in vitest describe/it for execution)
// ============================================================================

describe('Combat Simulator - Full Run', () => {
  it('runs all example scenarios and generates reports', async () => {
    const DATA_PATH = path.join(ROOT, 'data');
    const OUTPUT_DIR = path.join(ROOT, 'reports', 'combat');

    console.log('\n  GALACTIC OPERATIONS - COMBAT SIMULATOR');
    console.log('  ' + '='.repeat(44) + '\n');

    // Load game data
    console.log('  Loading game data...');
    const gameData = await loadGameDataV2(DATA_PATH);
    const boardTemplates = await loadBoardTemplates(DATA_PATH);
    const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
    const profilesData = loadAIProfiles(profilesJson);

    // Load scenarios
    const scenarioPath = path.join(DATA_PATH, 'combat-scenarios', 'example-scenarios.json');
    console.log(`  Loading scenarios: ${scenarioPath}`);
    const scenarios: CombatScenarioConfig[] = JSON.parse(await fs.readFile(scenarioPath, 'utf-8'));
    console.log(`  Found ${scenarios.length} scenarios\n`);

    const GAME_COUNT = 100;
    const BASE_SEED = 42;

    // Run simulations
    const allResults: CombatBatchResult[] = [];

    for (const scenario of scenarios) {
      console.log(`  Running: ${scenario.name}`);
      console.log(`  Side A: ${scenario.sideA.label} vs Side B: ${scenario.sideB.label}`);
      console.log(`  Arena: ${scenario.arena.preset}, Cover: ${scenario.arena.cover}`);

      const result = runCombatBatch(
        scenario,
        gameData,
        profilesData,
        boardTemplates,
        GAME_COUNT,
        BASE_SEED,
        false,
      );

      allResults.push(result);

      // Print summary
      console.log(generateCombatSummary(result));
      console.log('');
    }

    // Write reports
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Per-scenario CSV + summary
    for (const result of allResults) {
      const prefix = result.scenarioId.replace(/[^a-z0-9-]/gi, '-');
      await fs.writeFile(path.join(OUTPUT_DIR, `${prefix}-results.csv`), generateCombatCSV(result));
      await fs.writeFile(path.join(OUTPUT_DIR, `${prefix}-summary.txt`), generateCombatSummary(result));
    }

    // Combined JSON
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'combat-results.json'),
      JSON.stringify(allResults, null, 2),
    );

    // HTML report (comparison mode)
    const htmlPath = path.join(OUTPUT_DIR, 'combat-report.html');
    await fs.writeFile(htmlPath, generateCombatHTML(allResults));

    console.log(`\n  Reports written to ${OUTPUT_DIR}/`);
    console.log(`  - combat-report.html (interactive dashboard)`);
    console.log(`  - combat-results.json (raw data)`);
    for (const result of allResults) {
      const prefix = result.scenarioId.replace(/[^a-z0-9-]/gi, '-');
      console.log(`  - ${prefix}-results.csv`);
      console.log(`  - ${prefix}-summary.txt`);
    }

    // Verify reports exist
    const htmlContent = await fs.readFile(htmlPath, 'utf-8');
    expect(htmlContent).toContain('Combat Simulator');
    expect(allResults.length).toBe(scenarios.length);
    for (const r of allResults) {
      expect(r.gamesPlayed).toBe(GAME_COUNT);
    }
  }, 120000); // 2-minute timeout for 400 games
});

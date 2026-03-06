/**
 * Balance Testing Framework - Report Generators
 *
 * Console, CSV, JSON, and HTML output formats.
 * HTML uses Chart.js with dark theme matching the game UI.
 * Supports cross-currency comparison (XP, Credits, Ability Points).
 */

import type { BalanceReport, BalanceTestResult, BalanceClassification, CurrencyExchangeRate } from './types.js'

// ============================================================================
// CONSOLE
// ============================================================================

const CLASSIFICATION_COLORS: Record<BalanceClassification, string> = {
  overpowered: '\x1b[31m',   // red
  strong: '\x1b[33m',        // yellow
  balanced: '\x1b[32m',      // green
  weak: '\x1b[36m',          // cyan
  underpowered: '\x1b[35m',  // magenta
  negligible: '\x1b[90m',    // gray
}
const RESET = '\x1b[0m'

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length)
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return sign + (n * 100).toFixed(1) + '%'
}

function fmtCost(r: BalanceTestResult): string {
  if (r.xpCost !== null) return `${r.xpCost} XP`
  if (r.creditCost !== null) return `${r.creditCost} cr`
  if (r.abilityPointCost !== null) return `${r.abilityPointCost} AP`
  return '-'
}

function fmtEfficiency(r: BalanceTestResult): string {
  if (r.xpEfficiency !== null) return (r.xpEfficiency * 1000).toFixed(2) + '/XP'
  if (r.creditEfficiency !== null) return (r.creditEfficiency * 100000).toFixed(2) + '/cr'
  if (r.abilityPointEfficiency !== null) return (r.abilityPointEfficiency * 1000).toFixed(2) + '/AP'
  return '-'
}

export function generateConsoleReport(report: BalanceReport): string {
  const lines: string[] = []

  lines.push('')
  lines.push('  GALACTIC OPERATIONS - BALANCE TEST REPORT')
  lines.push('  ' + '='.repeat(44))
  lines.push(`  Timestamp: ${report.timestamp}`)
  lines.push(`  Games/scenario: ${report.gamesPerScenario}  Seed: ${report.seed}`)
  lines.push(`  Baseline win rate: ${fmtPct(report.baselineWinRate)}`)
  lines.push(`  Total scenarios: ${report.summary.totalScenarios}  Total games: ${report.summary.totalGames}`)
  lines.push('')

  // Currency exchange rates
  if (report.summary.currencyExchangeRates.length > 0) {
    lines.push('  CURRENCY EXCHANGE RATES (power-equivalent)')
    lines.push('  ' + '-'.repeat(60))
    for (const rate of report.summary.currencyExchangeRates) {
      lines.push(`  1 ${rate.from} = ${rate.rate} ${rate.to}  [${rate.confidence} confidence, n=${rate.sampleSize}]`)
    }
    lines.push('')
  }

  // Category summaries
  lines.push('  CATEGORY OVERVIEW')
  lines.push('  ' + '-'.repeat(70))
  lines.push(`  ${pad('Category', 16)} ${pad('Count', 7)} ${pad('Avg Delta', 12)} ${pad('Best', 12)} ${pad('Worst', 12)}`)
  lines.push('  ' + '-'.repeat(70))

  for (const [cat, summary] of Object.entries(report.summary.byCategory)) {
    lines.push(
      `  ${pad(cat, 16)} ${pad(String(summary.count), 7)} ${pad(fmtDelta(summary.avgPowerDelta), 12)} ${pad(fmtDelta(summary.maxPowerDelta), 12)} ${pad(fmtDelta(summary.minPowerDelta), 12)}`,
    )
  }
  lines.push('')

  // Top performers
  lines.push('  TOP 5 PERFORMERS')
  lines.push('  ' + '-'.repeat(80))
  for (const r of report.summary.topPerformers) {
    const color = CLASSIFICATION_COLORS[r.classification]
    lines.push(
      `  ${color}${pad(r.scenarioId, 40)}${RESET} Win: ${fmtPct(r.winRate)}  Delta: ${fmtDelta(r.powerDelta)}  [${r.classification}]`,
    )
  }
  lines.push('')

  // Bottom performers
  lines.push('  BOTTOM 5 PERFORMERS')
  lines.push('  ' + '-'.repeat(80))
  for (const r of report.summary.bottomPerformers) {
    const color = CLASSIFICATION_COLORS[r.classification]
    lines.push(
      `  ${color}${pad(r.scenarioId, 40)}${RESET} Win: ${fmtPct(r.winRate)}  Delta: ${fmtDelta(r.powerDelta)}  [${r.classification}]`,
    )
  }
  lines.push('')

  // Outliers
  if (report.summary.outliers.length > 0) {
    lines.push('  OUTLIERS (overpowered / underpowered)')
    lines.push('  ' + '-'.repeat(80))
    for (const r of report.summary.outliers) {
      const color = CLASSIFICATION_COLORS[r.classification]
      lines.push(
        `  ${color}${pad(r.scenarioId, 40)}${RESET} Delta: ${fmtDelta(r.powerDelta)}  Cost: ${fmtCost(r)}  [${r.classification}]`,
      )
    }
    lines.push('')
  }

  // Full results table per category
  const byCategory = new Map<string, BalanceTestResult[]>()
  for (const r of report.results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, [])
    byCategory.get(r.category)!.push(r)
  }

  for (const [cat, results] of byCategory) {
    const sorted = [...results].sort((a, b) => b.powerDelta - a.powerDelta)
    lines.push(`  ${cat.toUpperCase()} RESULTS (${sorted.length} scenarios)`)
    lines.push('  ' + '-'.repeat(95))
    lines.push(`  ${pad('Variable', 28)} ${pad('Win%', 8)} ${pad('Delta', 10)} ${pad('Cost', 10)} ${pad('Eff', 14)} ${pad('Class', 14)}`)
    lines.push('  ' + '-'.repeat(95))

    for (const r of sorted) {
      const color = CLASSIFICATION_COLORS[r.classification]
      lines.push(
        `  ${color}${pad(r.variableValue, 28)}${RESET} ${pad(fmtPct(r.winRate), 8)} ${pad(fmtDelta(r.powerDelta), 10)} ${pad(fmtCost(r), 10)} ${pad(fmtEfficiency(r), 14)} ${r.classification}`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// CSV
// ============================================================================

export function generateCSVReport(report: BalanceReport): string {
  const headers = [
    'scenarioId', 'category', 'tier', 'variableName', 'variableValue',
    'winRate', 'powerDelta', 'avgRounds', 'heroSurvivalRate',
    'xpCost', 'creditCost', 'abilityPointCost',
    'xpEfficiency', 'creditEfficiency', 'abilityPointEfficiency',
    'primaryCurrency', 'classification',
  ]

  const rows = report.results.map(r => [
    r.scenarioId,
    r.category,
    r.tier,
    r.variableName,
    r.variableValue,
    r.winRate.toFixed(4),
    r.powerDelta.toFixed(4),
    r.avgRounds.toFixed(2),
    r.heroSurvivalRate.toFixed(4),
    r.xpCost ?? '',
    r.creditCost ?? '',
    r.abilityPointCost ?? '',
    r.xpEfficiency !== null ? r.xpEfficiency.toFixed(6) : '',
    r.creditEfficiency !== null ? r.creditEfficiency.toFixed(6) : '',
    r.abilityPointEfficiency !== null ? r.abilityPointEfficiency.toFixed(6) : '',
    r.primaryCurrency ?? '',
    r.classification,
  ])

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

// ============================================================================
// JSON
// ============================================================================

export function generateJSONReport(report: BalanceReport): string {
  // Strip the heavy batchResult from each result to keep JSON manageable
  const lightweight = {
    ...report,
    results: report.results.map(({ batchResult, ...rest }) => rest),
  }
  return JSON.stringify(lightweight, null, 2)
}

// ============================================================================
// HTML -- Chart.js Dashboard with Cross-Currency Comparison
// ============================================================================

export function generateHTMLReport(report: BalanceReport): string {
  // Prepare chart data
  const categories = Object.keys(report.summary.byCategory)
  const avgDeltas = categories.map(c => +(report.summary.byCategory[c].avgPowerDelta * 100).toFixed(1))
  const maxDeltas = categories.map(c => +(report.summary.byCategory[c].maxPowerDelta * 100).toFixed(1))
  const minDeltas = categories.map(c => +(report.summary.byCategory[c].minPowerDelta * 100).toFixed(1))

  // Multi-currency scatter data: XP-priced items, credit-priced items, AP-priced items
  const xpScatter = report.results
    .filter(r => r.xpCost !== null && r.xpCost > 0)
    .map(r => ({ x: r.xpCost!, y: +(r.powerDelta * 100).toFixed(1), label: r.variableValue, cat: r.category }))
  const creditScatter = report.results
    .filter(r => r.creditCost !== null && r.creditCost > 0)
    .map(r => ({ x: r.creditCost!, y: +(r.powerDelta * 100).toFixed(1), label: r.variableValue, cat: r.category }))
  const apScatter = report.results
    .filter(r => r.abilityPointCost !== null && r.abilityPointCost > 0)
    .map(r => ({ x: r.abilityPointCost!, y: +(r.powerDelta * 100).toFixed(1), label: r.variableValue, cat: r.category }))

  // Normalized efficiency scatter: all items on same scale (power per normalized cost unit)
  // Normalize credits to XP-equivalent using exchange rate
  const xpToCreditRate = report.summary.currencyExchangeRates.find(r => r.from === 'xp' && r.to === 'credits')
  const exchangeRate = xpToCreditRate?.rate ?? 50 // default fallback

  const normalizedScatter = report.results
    .filter(r => r.powerDelta > 0 && r.primaryCurrency !== null)
    .map(r => {
      let normalizedCost = 0
      let currency = r.primaryCurrency!
      if (r.xpCost !== null && r.xpCost > 0) normalizedCost = r.xpCost
      else if (r.creditCost !== null && r.creditCost > 0) normalizedCost = r.creditCost / exchangeRate
      else if (r.abilityPointCost !== null && r.abilityPointCost > 0) normalizedCost = r.abilityPointCost
      return {
        x: +normalizedCost.toFixed(1),
        y: +(r.powerDelta * 100).toFixed(1),
        label: r.variableValue,
        currency,
        cat: r.category,
      }
    })

  const classColors: Record<BalanceClassification, string> = {
    overpowered: '#ff4444',
    strong: '#ffa500',
    balanced: '#44ff44',
    weak: '#44cccc',
    underpowered: '#cc44cc',
    negligible: '#666666',
  }

  const currencyColors: Record<string, string> = {
    'xp': '#bb99ff',
    'credits': '#ffd700',
    'ability-points': '#44ffaa',
  }

  // Exchange rate display
  const exchangeRateRows = report.summary.currencyExchangeRates
    .filter(r => r.from === 'xp') // Only show XP-to-X rates to avoid duplication
    .map(r => {
      const confidenceColor = r.confidence === 'high' ? '#44ff44' : r.confidence === 'medium' ? '#ffa500' : '#ff4444'
      return `<tr>
        <td style="padding:6px 12px;">1 ${r.from.toUpperCase()}</td>
        <td style="padding:6px 12px;">= ${r.rate} ${r.to.replace('ability-points', 'AP')}</td>
        <td style="padding:6px 12px;color:${confidenceColor};">${r.confidence} (n=${r.sampleSize})</td>
      </tr>`
    }).join('\n')

  // Full results table rows
  const tableRows = [...report.results]
    .sort((a, b) => b.powerDelta - a.powerDelta)
    .map(r => {
      const color = classColors[r.classification]
      const costStr = r.xpCost !== null ? `${r.xpCost} XP`
        : r.creditCost !== null ? `${r.creditCost} cr`
        : r.abilityPointCost !== null ? `${r.abilityPointCost} AP`
        : '-'
      const effStr = r.xpEfficiency !== null ? (r.xpEfficiency * 1000).toFixed(2)
        : r.creditEfficiency !== null ? (r.creditEfficiency * 100000).toFixed(2)
        : r.abilityPointEfficiency !== null ? (r.abilityPointEfficiency * 1000).toFixed(2)
        : '-'
      const currencyBadge = r.primaryCurrency
        ? `<span style="color:${currencyColors[r.primaryCurrency] ?? '#ccc'};font-size:11px;">${r.primaryCurrency}</span>`
        : '-'
      return `<tr style="border-bottom:1px solid #222;">
        <td style="padding:4px 8px;">${r.scenarioId}</td>
        <td style="padding:4px 8px;">${r.category}</td>
        <td style="padding:4px 8px;">${r.variableValue}</td>
        <td style="padding:4px 8px;">${(r.winRate * 100).toFixed(1)}%</td>
        <td style="padding:4px 8px;color:${color};font-weight:bold;">${r.powerDelta >= 0 ? '+' : ''}${(r.powerDelta * 100).toFixed(1)}%</td>
        <td style="padding:4px 8px;">${costStr}</td>
        <td style="padding:4px 8px;">${currencyBadge}</td>
        <td style="padding:4px 8px;">${effStr}</td>
        <td style="padding:4px 8px;color:${color};">${r.classification}</td>
      </tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Galactic Operations - Balance Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #ccc; font-family: 'Segoe UI', sans-serif; padding: 20px; }
  h1 { color: #bb99ff; margin-bottom: 6px; }
  h2 { color: #99bbff; margin: 20px 0 10px; }
  .meta { color: #888; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .card { background: #131320; border: 1px solid #333355; border-radius: 8px; padding: 16px; }
  .card h3 { color: #bb99ff; margin-bottom: 10px; }
  .card-wide { grid-column: 1 / -1; }
  canvas { max-height: 350px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; color: #bb99ff; border-bottom: 2px solid #333355; }
  .filter-bar { margin: 10px 0; display: flex; gap: 8px; flex-wrap: wrap; }
  .filter-btn { padding: 4px 12px; background: #1a1a2e; border: 1px solid #333355; color: #ccc; cursor: pointer; border-radius: 4px; font-size: 12px; }
  .filter-btn.active { background: #333355; color: #bb99ff; }
  .exchange-card { background: #0f0f1a; border: 1px solid #444488; border-radius: 8px; padding: 16px; text-align: center; }
  .exchange-rate { font-size: 24px; font-weight: bold; margin: 8px 0; }
  .exchange-label { color: #888; font-size: 12px; }
  .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
</style>
</head>
<body>
<h1>Galactic Operations - Balance Report</h1>
<div class="meta">
  ${report.timestamp} | ${report.gamesPerScenario} games/scenario | Seed: ${report.seed} |
  Baseline win rate: ${(report.baselineWinRate * 100).toFixed(1)}% |
  ${report.summary.totalScenarios} scenarios | ${report.summary.totalGames} total games
</div>

${report.summary.currencyExchangeRates.length > 0 ? `
<h2>Currency Exchange Rates</h2>
<p style="color:#888;margin-bottom:12px;">Power-equivalent exchange rates derived from simulation data. "1 XP = N credits" means spending 1 XP and N credits yield the same average power increase.</p>
<div class="grid-3">
  ${report.summary.currencyExchangeRates
    .filter(r => r.from === 'xp')
    .map(r => {
      const toLabel = r.to === 'ability-points' ? 'Ability Points' : r.to.charAt(0).toUpperCase() + r.to.slice(1)
      const confidenceColor = r.confidence === 'high' ? '#44ff44' : r.confidence === 'medium' ? '#ffa500' : '#ff4444'
      return `<div class="exchange-card">
        <div class="exchange-label">1 XP is equivalent to</div>
        <div class="exchange-rate" style="color:${currencyColors[r.to] ?? '#ccc'};">${r.rate} ${toLabel}</div>
        <div class="exchange-label">Confidence: <span style="color:${confidenceColor};">${r.confidence}</span> (n=${r.sampleSize})</div>
      </div>`
    }).join('\n  ')}
  ${report.summary.currencyExchangeRates
    .filter(r => r.from === 'credits' && r.to === 'ability-points')
    .map(r => {
      const confidenceColor = r.confidence === 'high' ? '#44ff44' : r.confidence === 'medium' ? '#ffa500' : '#ff4444'
      return `<div class="exchange-card">
        <div class="exchange-label">1 Credit is equivalent to</div>
        <div class="exchange-rate" style="color:#44ffaa;">${r.rate} AP</div>
        <div class="exchange-label">Confidence: <span style="color:${confidenceColor};">${r.confidence}</span> (n=${r.sampleSize})</div>
      </div>`
    }).join('\n  ')}
</div>
` : ''}

<div class="grid">
  <div class="card">
    <h3>Power Delta by Category</h3>
    <canvas id="categoryChart"></canvas>
  </div>
  <div class="card">
    <h3>Cost vs Power Delta (by Currency)</h3>
    <canvas id="currencyScatterChart"></canvas>
  </div>
</div>

<div class="grid">
  <div class="card">
    <h3>Normalized Efficiency (XP-equivalent cost)</h3>
    <canvas id="normalizedChart"></canvas>
  </div>
  <div class="card">
    <h3>Efficiency Distribution by Currency Pool</h3>
    <canvas id="efficiencyBoxChart"></canvas>
  </div>
</div>

<div class="grid">
  <div class="card">
    <h3>Top 5 Performers</h3>
    <canvas id="topChart"></canvas>
  </div>
  <div class="card">
    <h3>Bottom 5 Performers</h3>
    <canvas id="bottomChart"></canvas>
  </div>
</div>

<h2>All Results</h2>
<div class="filter-bar" id="filterBar">
  <button class="filter-btn active" data-cat="all">All</button>
  ${categories.map(c => `<button class="filter-btn" data-cat="${c}">${c}</button>`).join('\n  ')}
</div>
<div class="filter-bar" id="currencyFilterBar">
  <span style="color:#888;font-size:12px;line-height:26px;">Currency:</span>
  <button class="filter-btn active" data-currency="all">All</button>
  <button class="filter-btn" data-currency="xp"><span class="legend-dot" style="background:#bb99ff;"></span>XP</button>
  <button class="filter-btn" data-currency="credits"><span class="legend-dot" style="background:#ffd700;"></span>Credits</button>
  <button class="filter-btn" data-currency="ability-points"><span class="legend-dot" style="background:#44ffaa;"></span>AP</button>
  <button class="filter-btn" data-currency="none">No Cost</button>
</div>
<div class="card" style="overflow-x:auto;">
  <table id="resultsTable">
    <thead>
      <tr>
        <th>Scenario</th><th>Category</th><th>Variable</th><th>Win Rate</th>
        <th>Power Delta</th><th>Cost</th><th>Currency</th><th>Efficiency</th><th>Classification</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</div>

<script>
  Chart.defaults.color = '#999';
  Chart.defaults.borderColor = '#333355';

  const currencyColors = ${JSON.stringify(currencyColors)};

  // Category chart
  new Chart(document.getElementById('categoryChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(categories)},
      datasets: [
        { label: 'Avg Delta %', data: ${JSON.stringify(avgDeltas)}, backgroundColor: '#bb99ff', borderRadius: 3 },
        { label: 'Max Delta %', data: ${JSON.stringify(maxDeltas)}, backgroundColor: '#44ff44', borderRadius: 3 },
        { label: 'Min Delta %', data: ${JSON.stringify(minDeltas)}, backgroundColor: '#ff4444', borderRadius: 3 },
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { title: { display: true, text: 'Power Delta %', color: '#666' } } }
    }
  });

  // Multi-currency scatter: separate datasets per currency pool
  const xpPoints = ${JSON.stringify(xpScatter)};
  const creditPoints = ${JSON.stringify(creditScatter)};
  const apPoints = ${JSON.stringify(apScatter)};

  new Chart(document.getElementById('currencyScatterChart'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'XP-Priced',
          data: xpPoints.map(p => ({ x: p.x, y: p.y })),
          backgroundColor: '#bb99ff',
          pointRadius: 5,
          pointHoverRadius: 8,
        },
        {
          label: 'Credit-Priced',
          data: creditPoints.map(p => ({ x: p.x, y: p.y })),
          backgroundColor: '#ffd700',
          pointRadius: 5,
          pointHoverRadius: 8,
        },
        {
          label: 'AP-Priced',
          data: apPoints.map(p => ({ x: p.x, y: p.y })),
          backgroundColor: '#44ffaa',
          pointRadius: 5,
          pointHoverRadius: 8,
        },
      ].filter(ds => ds.data.length > 0)
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const dsLabel = ctx.dataset.label;
              const allPoints = dsLabel.includes('XP') ? xpPoints : dsLabel.includes('Credit') ? creditPoints : apPoints;
              const pt = allPoints[ctx.dataIndex];
              return pt ? pt.label + ' (' + pt.cat + '): ' + ctx.parsed.y + '% at cost ' + ctx.parsed.x : '';
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Cost (in native currency units)', color: '#666' } },
        y: { title: { display: true, text: 'Power Delta %', color: '#666' } }
      }
    }
  });

  // Normalized efficiency scatter: all items on XP-equivalent scale
  const normalizedPoints = ${JSON.stringify(normalizedScatter)};
  const normDatasets = {};
  for (const pt of normalizedPoints) {
    const key = pt.currency;
    if (!normDatasets[key]) {
      normDatasets[key] = {
        label: key === 'ability-points' ? 'Ability Points' : key.charAt(0).toUpperCase() + key.slice(1),
        data: [],
        backgroundColor: currencyColors[key] || '#ccc',
        pointRadius: 6,
        pointHoverRadius: 9,
      };
    }
    normDatasets[key].data.push({ x: pt.x, y: pt.y, label: pt.label });
  }
  new Chart(document.getElementById('normalizedChart'), {
    type: 'scatter',
    data: { datasets: Object.values(normDatasets) },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const ds = Object.values(normDatasets)[ctx.datasetIndex];
              const pt = ds?.data?.[ctx.dataIndex];
              return pt?.label ? pt.label + ': ' + ctx.parsed.y + '% power at ' + ctx.parsed.x + ' XP-eq' : '';
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Cost (XP-equivalent units)', color: '#666' } },
        y: { title: { display: true, text: 'Power Delta %', color: '#666' } }
      }
    }
  });

  // Efficiency distribution by currency pool (horizontal bar chart of avg efficiency per category)
  const catLabels = ${JSON.stringify(categories)};
  const xpEffByCat = ${JSON.stringify(categories.map(c => {
    const e = report.summary.byCategory[c].avgXpEfficiency
    return e !== null ? +(e * 1000).toFixed(3) : null
  }))};
  const creditEffByCat = ${JSON.stringify(categories.map(c => {
    const e = report.summary.byCategory[c].avgCreditEfficiency
    return e !== null ? +(e * 100000).toFixed(3) : null
  }))};

  new Chart(document.getElementById('efficiencyBoxChart'), {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [
        { label: 'XP Eff (x1000)', data: xpEffByCat, backgroundColor: '#bb99ff', borderRadius: 3 },
        { label: 'Credit Eff (x100k)', data: creditEffByCat, backgroundColor: '#ffd700', borderRadius: 3 },
      ].filter(ds => ds.data.some(v => v !== null))
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { title: { display: true, text: 'Efficiency (normalized)', color: '#666' } }
      }
    }
  });

  // Top performers
  const topLabels = ${JSON.stringify(report.summary.topPerformers.map(r => r.variableValue))};
  const topDeltas = ${JSON.stringify(report.summary.topPerformers.map(r => +(r.powerDelta * 100).toFixed(1)))};
  const topCurrencies = ${JSON.stringify(report.summary.topPerformers.map(r => r.primaryCurrency))};
  new Chart(document.getElementById('topChart'), {
    type: 'bar',
    data: {
      labels: topLabels,
      datasets: [{
        label: 'Power Delta %',
        data: topDeltas,
        backgroundColor: topCurrencies.map(c => currencyColors[c] || '#44ff44'),
        borderRadius: 3
      }]
    },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  // Bottom performers
  const bottomLabels = ${JSON.stringify(report.summary.bottomPerformers.map(r => r.variableValue))};
  const bottomDeltas = ${JSON.stringify(report.summary.bottomPerformers.map(r => +(r.powerDelta * 100).toFixed(1)))};
  new Chart(document.getElementById('bottomChart'), {
    type: 'bar',
    data: { labels: bottomLabels, datasets: [{ label: 'Power Delta %', data: bottomDeltas, backgroundColor: '#ff4444', borderRadius: 3 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  // Table filtering -- category
  let activeCategory = 'all';
  let activeCurrency = 'all';

  function filterTable() {
    const rows = document.querySelectorAll('#resultsTable tbody tr');
    rows.forEach(row => {
      const rowCat = row.children[1].textContent;
      const rowCurrency = row.children[6].textContent.trim();
      const catMatch = activeCategory === 'all' || rowCat === activeCategory;
      const currMatch = activeCurrency === 'all'
        || (activeCurrency === 'none' && rowCurrency === '-')
        || rowCurrency.includes(activeCurrency);
      row.style.display = (catMatch && currMatch) ? '' : 'none';
    });
  }

  document.getElementById('filterBar').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#filterBar .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    filterTable();
  });

  document.getElementById('currencyFilterBar').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#currencyFilterBar .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCurrency = btn.dataset.currency;
    filterTable();
  });
<\/script>
</body>
</html>`
}

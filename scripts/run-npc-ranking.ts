#!/usr/bin/env npx tsx
/**
 * NPC Power Ranking Script
 *
 * Runs the full power ranking pipeline: analytical ratings + 1v1 duel tournament.
 * Optionally generates detailed reports (JSON + text) to reports/ directory.
 *
 * Usage:
 *   npx tsx scripts/run-npc-ranking.ts                    # Full ranking (20 games per matchup)
 *   npx tsx scripts/run-npc-ranking.ts --quick             # Quick ranking (5 games per matchup)
 *   npx tsx scripts/run-npc-ranking.ts --report            # Full + write reports to reports/
 *   npx tsx scripts/run-npc-ranking.ts --report --log      # Full + reports with per-duel BattleLogs
 *   npx tsx scripts/run-npc-ranking.ts --filter stormtrooper,inquisitor  # Specific NPCs
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadGameDataV2 } from '../packages/engine/src/data-loader.js';
import { loadAIProfiles } from '../packages/engine/src/ai/decide-v2.js';
import { loadBoardTemplates } from '../packages/engine/src/data-loader.js';
import { runFullPowerRanking, generatePowerRankingReport } from '../packages/engine/src/power-ranking.js';
import aiProfilesRaw from '../data/ai-profiles.json';

async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes('--quick');
  const doReport = args.includes('--report');
  const doLog = args.includes('--log');
  const filterIdx = args.indexOf('--filter');
  const npcFilter = filterIdx >= 0 && args[filterIdx + 1]
    ? args[filterIdx + 1].split(',')
    : undefined;

  console.log('\n' + '='.repeat(60));
  console.log('  GALACTIC OPERATIONS -- NPC POWER RANKING');
  console.log('='.repeat(60));

  // Load game data
  console.log('\nLoading game data...');
  const gameData = await loadGameDataV2('./data');
  const profilesData = loadAIProfiles(aiProfilesRaw);
  const boardTemplates = await loadBoardTemplates('./data');

  const gamesPerMatchup = isQuick ? 5 : 20;
  console.log(`Mode: ${isQuick ? 'QUICK' : 'FULL'} (${gamesPerMatchup} games per matchup)`);
  if (doReport) console.log(`Reports: enabled (output to reports/)`);
  if (doLog) console.log(`BattleLogs: enabled (per-duel combat logs)`);

  if (npcFilter) {
    console.log(`Filter: ${npcFilter.join(', ')}`);
  }

  const startTime = Date.now();

  const result = runFullPowerRanking(
    gameData,
    profilesData,
    boardTemplates,
    {
      gamesPerMatchup,
      baseSeed: 42,
      npcFilter,
      enableLogging: doLog,
    },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Total duels: ${result.duelResults.length} matchups x ${gamesPerMatchup} games = ${result.config.totalDuels} fights`);

  // Write reports
  if (doReport) {
    const reportsDir = path.resolve('./reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    // Text report
    const textReport = generatePowerRankingReport(result, gameData);
    const textPath = path.join(reportsDir, `power-ranking-${timestamp}.txt`);
    fs.writeFileSync(textPath, textReport);
    console.log(`\nText report:  ${textPath}`);

    // JSON report (strip BattleLogs from JSON unless --log was used, to keep file size manageable)
    const jsonResult = doLog ? result : {
      ...result,
      duelResults: result.duelResults.map(d => ({
        ...d,
        gameDetails: d.gameDetails.map(g => {
          const { battleLog, ...rest } = g;
          return rest;
        }),
      })),
    };
    const jsonPath = path.join(reportsDir, `power-ranking-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonResult, null, 2));
    console.log(`JSON report:  ${jsonPath}`);

    // Also write a "latest" symlink-style copy
    const latestTextPath = path.join(reportsDir, 'power-ranking-latest.txt');
    const latestJsonPath = path.join(reportsDir, 'power-ranking-latest.json');
    fs.writeFileSync(latestTextPath, textReport);
    fs.writeFileSync(latestJsonPath, JSON.stringify(jsonResult, null, 2));
    console.log(`Latest links: power-ranking-latest.{txt,json}`);
  }

  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

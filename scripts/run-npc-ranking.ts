#!/usr/bin/env npx tsx
/**
 * NPC Power Ranking Script
 *
 * Runs the full power ranking pipeline: analytical ratings + 1v1 duel tournament.
 *
 * Usage:
 *   npx tsx scripts/run-npc-ranking.ts              # Full ranking (20 games per matchup)
 *   npx tsx scripts/run-npc-ranking.ts --quick       # Quick ranking (5 games per matchup)
 *   npx tsx scripts/run-npc-ranking.ts --filter stormtrooper,inquisitor  # Specific NPCs
 */

import { loadGameDataV2 } from '../packages/engine/src/data-loader.js';
import { loadAIProfiles } from '../packages/engine/src/ai/decide-v2.js';
import { loadBoardTemplates } from '../packages/engine/src/data-loader.js';
import { runFullPowerRanking } from '../packages/engine/src/power-ranking.js';
import aiProfilesRaw from '../data/ai-profiles.json';

async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes('--quick');
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
    },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Total duels: ${result.duelResults.length} matchups x ${gamesPerMatchup} games = ${result.duelResults.length * gamesPerMatchup} fights`);
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

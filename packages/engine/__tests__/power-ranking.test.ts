/**
 * Power Ranking System Tests
 *
 * Tests analytical rating computation and the 1v1 duel system.
 */

import path from 'path';
import { describe, it, expect } from 'vitest';
import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import { computeAnalyticalRating, runDuelTournament } from '../src/power-ranking.js';
import type { NPCProfile, GameData } from '../src/types.js';
import aiProfilesRaw from '../../data/ai-profiles.json';

const DATA_PATH = path.resolve(__dirname, '../../../data');

let gameData: GameData;
let boardTemplates: any[];

// Load game data once for all tests
async function ensureData() {
  if (!gameData) {
    gameData = await loadGameDataV2(DATA_PATH);
    boardTemplates = await loadBoardTemplates(DATA_PATH);
  }
}

describe('Analytical Power Rating', () => {
  it('rates Inquisitor higher than Stormtrooper', async () => {
    await ensureData();
    const inquisitor = computeAnalyticalRating('inquisitor', gameData.npcProfiles['inquisitor']);
    const stormtrooper = computeAnalyticalRating('stormtrooper', gameData.npcProfiles['stormtrooper']);

    expect(inquisitor.totalRating).toBeGreaterThan(stormtrooper.totalRating);
    expect(inquisitor.tier).toBe('Nemesis');
    expect(stormtrooper.tier).toBe('Minion');
  });

  it('rates Rivals higher than Minions on average', async () => {
    await ensureData();

    let minionTotal = 0, minionCount = 0;
    let rivalTotal = 0, rivalCount = 0;

    for (const [id, npc] of Object.entries(gameData.npcProfiles)) {
      if (!npc.weapons || npc.weapons.length === 0) continue;
      const rating = computeAnalyticalRating(id, npc);
      if (npc.tier === 'Minion') { minionTotal += rating.totalRating; minionCount++; }
      if (npc.tier === 'Rival') { rivalTotal += rating.totalRating; rivalCount++; }
    }

    const minionAvg = minionTotal / minionCount;
    const rivalAvg = rivalTotal / rivalCount;

    expect(rivalAvg).toBeGreaterThan(minionAvg);
  });

  it('includes offensive, defensive, mobility, and keyword components', async () => {
    await ensureData();
    const rating = computeAnalyticalRating('stormtrooper-elite', gameData.npcProfiles['stormtrooper-elite']);

    expect(rating.offensiveRating).toBeGreaterThan(0);
    expect(rating.defensiveRating).toBeGreaterThan(0);
    expect(rating.mobilityRating).toBeGreaterThan(0);
    expect(rating.npcId).toBe('stormtrooper-elite');
    expect(rating.name).toBe('Stormtrooper Elite');
  });
});

describe('1v1 Duel Tournament', () => {
  it('runs a mini tournament between 3 NPCs', async () => {
    await ensureData();
    const profiles = loadAIProfiles(aiProfilesRaw);

    const { duelResults, rankings } = runDuelTournament(
      ['stormtrooper', 'stormtrooper-elite', 'inquisitor'],
      gameData,
      profiles,
      boardTemplates,
      3,  // 3 games per matchup for speed
      42,
    );

    // 3 NPCs = 3 pairwise matchups
    expect(duelResults).toHaveLength(3);

    // All 3 NPCs should appear in rankings
    expect(rankings).toHaveLength(3);

    // Each duel result should have valid structure
    for (const duel of duelResults) {
      expect(duel.gamesPlayed).toBe(3);
      expect(duel.winsA + duel.winsB + duel.draws).toBe(3);
      expect(duel.avgRounds).toBeGreaterThan(0);
    }

    // Rankings should be sorted by Elo descending
    for (let i = 1; i < rankings.length; i++) {
      expect(rankings[i - 1].eloRating).toBeGreaterThanOrEqual(rankings[i].eloRating);
    }

    // Inquisitor (Nemesis) should generally rank above Stormtrooper (Minion)
    const inqRank = rankings.findIndex(r => r.npcId === 'inquisitor');
    const stRank = rankings.findIndex(r => r.npcId === 'stormtrooper');
    expect(inqRank).toBeLessThan(stRank);
  });
});

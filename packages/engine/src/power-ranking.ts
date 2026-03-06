/**
 * Power Ranking System
 *
 * Measures the combat power level of every NPC (and heroes) using two methods:
 *
 * 1. **Analytical rating** -- stat-based formula from dice math, wound threshold,
 *    soak, speed, and keyword bonuses. Fast, deterministic, no simulation needed.
 *
 * 2. **Empirical rating** -- round-robin 1v1 duel tournament where every NPC
 *    fights every other NPC N times. Win rate, average rounds survived, and
 *    damage dealt produce an Elo-like ranking.
 *
 * The final power level combines both into a single number suitable for
 * threat cost assignment and hero balance assessment.
 */

import type {
  NPCProfile,
  GameData,
  GameState,
  Player,
  BoardTemplate,
  Side,
} from './types.js';

import {
  createInitialGameStateV2,
  deployFiguresV2,
  advancePhaseV2,
  executeActionV2,
  checkVictoryV2,
  resetForActivation,
  getCurrentFigureV2,
  getFigureName,
} from './turn-machine-v2.js';

import type { ArmyCompositionV2 } from './turn-machine-v2.js';
import type { AIProfilesData } from './ai/types.js';
import { determineActions } from './ai/decide-v2.js';
import { createSeededRng, installSeededRandom } from './ai/simulator-v2.js';
import { buildArenaMap } from './ai/combat-simulator.js';

// ============================================================================
// ANALYTICAL POWER RATING
// ============================================================================

/**
 * Expected successes per die type (from dice-v2.ts face tables):
 *   Ability (green):     faces 4,5,6 hit -> E[success] = 3/6 = 0.50
 *   Proficiency (yellow): faces 3,4,5 = 1 success, face 6 = 2 -> E = (3+2)/6 = 5/6 ≈ 0.833
 *   Difficulty (purple):  faces 4,5,6 fail -> E[failure] = 3/6 = 0.50
 *   Challenge (red):      faces 3,4,5 = 1, face 6 = 2 -> E = 5/6 ≈ 0.833
 */
const E_ABILITY = 0.5;
const E_PROFICIENCY = 5 / 6;
const E_DIFFICULTY = 0.5;
const E_CHALLENGE = 5 / 6;

/** Expected net successes for an attack pool vs defense pool */
function expectedNetSuccesses(
  atk: { ability: number; proficiency: number },
  def: { difficulty: number; challenge: number },
): number {
  const atkExpected = atk.ability * E_ABILITY + atk.proficiency * E_PROFICIENCY;
  const defExpected = def.difficulty * E_DIFFICULTY + def.challenge * E_CHALLENGE;
  return atkExpected - defExpected;
}

/** Rough hit probability using normal approximation */
function estimateHitProb(
  atk: { ability: number; proficiency: number },
  def: { difficulty: number; challenge: number },
): number {
  const net = expectedNetSuccesses(atk, def);
  // Variance per die ≈ 0.25 for all types
  const totalDice = atk.ability + atk.proficiency + def.difficulty + def.challenge;
  const variance = totalDice * 0.25;
  const sigma = Math.sqrt(Math.max(variance, 0.01));
  // P(X >= 1) ≈ Phi((net - 0.5) / sigma) using simple logistic approximation
  const z = (net - 0.5) / sigma;
  return 1 / (1 + Math.exp(-1.7 * z));
}

export interface AnalyticalRating {
  npcId: string;
  name: string;
  tier: string;
  offensiveRating: number;   // Expected damage output per activation
  defensiveRating: number;   // Effective HP (how much damage it takes to kill)
  mobilityRating: number;    // Speed-based tactical advantage
  keywordBonus: number;      // Bonus from mechanical keywords
  totalRating: number;       // Combined power score
}

/**
 * Compute analytical power rating for an NPC.
 * Uses expected values from the dice math plus stat-based heuristics.
 */
export function computeAnalyticalRating(
  npcId: string,
  npc: NPCProfile,
  avgEnemySoak: number = 3,
  avgEnemyDefense: { difficulty: number; challenge: number } = { difficulty: 1, challenge: 0 },
): AnalyticalRating {
  // --- Offensive Rating ---
  // Best weapon's expected damage per attack
  let bestOffense = 0;
  for (const weapon of npc.weapons) {
    const hitProb = estimateHitProb(npc.attackPool, avgEnemyDefense);
    const netSuccess = Math.max(0, expectedNetSuccesses(npc.attackPool, avgEnemyDefense));
    // Damage formula: baseDamage + netSuccesses - soak
    const rawDamage = weapon.baseDamage + netSuccess - avgEnemySoak;
    const expectedDamage = hitProb * Math.max(0, rawDamage);

    // Factor in weapon qualities
    let qualityBonus = 0;
    for (const q of weapon.qualities ?? []) {
      if (q.name === 'Pierce') qualityBonus += (q.value ?? 1) * 0.3;
      if (q.name === 'Vicious') qualityBonus += (q.value ?? 1) * 0.2;
      if (q.name === 'Stun') qualityBonus += 0.5;
      if (q.name === 'Blast') qualityBonus += (q.value ?? 1) * 0.4;
      if (q.name === 'AutoFire') qualityBonus += 1.0;
      if (q.name === 'Knockdown') qualityBonus += 0.3;
    }

    const totalOffense = expectedDamage + qualityBonus;
    if (totalOffense > bestOffense) bestOffense = totalOffense;
  }

  const offensiveRating = bestOffense;

  // --- Defensive Rating ---
  // Effective HP: wounds / (1 - avgHitProb) * soakFactor
  const avgAttackPool = { ability: 2, proficiency: 1 }; // typical enemy attack
  const hitProbAgainstMe = estimateHitProb(avgAttackPool, npc.defensePool);
  const avgIncomingDamage = Math.max(0.1,
    estimateHitProb(avgAttackPool, npc.defensePool) *
    Math.max(0, 5 + expectedNetSuccesses(avgAttackPool, npc.defensePool) - npc.soak)
  );
  const effectiveHP = npc.woundThreshold / avgIncomingDamage;

  // Strain adds survivability for Rival/Nemesis
  const strainBonus = npc.strainThreshold ? npc.strainThreshold * 0.15 : 0;

  const defensiveRating = effectiveHP + strainBonus;

  // --- Mobility Rating ---
  // Speed 4 is baseline (1.0x), each point above/below is ±0.15
  const mobilityRating = 1.0 + (npc.speed - 4) * 0.15;

  // --- Keyword Bonuses ---
  let keywordBonus = 0;
  if (npc.mechanicalKeywords) {
    for (const kw of npc.mechanicalKeywords) {
      switch (kw.name) {
        case 'Armor': keywordBonus += (kw.value ?? 1) * 1.5; break;
        case 'Agile': keywordBonus += 0.8; break;
        case 'Relentless': keywordBonus += 0.6; break;
        case 'Disciplined': keywordBonus += (kw.value ?? 1) * 0.3; break;
        case 'Dauntless': keywordBonus += 0.4; break;
        case 'Guardian': keywordBonus += (kw.value ?? 1) * 0.5; break;
        case 'Cumbersome': keywordBonus -= 0.5; break;
      }
    }
  }

  // Ability text bonuses (heuristic scan)
  for (const ability of npc.abilities ?? []) {
    const lower = ability.toLowerCase();
    if (lower.includes('regenerat')) keywordBonus += 1.0;
    if (lower.includes('force')) keywordBonus += 0.5;
    if (lower.includes('adversary')) keywordBonus += 1.5;
    if (lower.includes('self-destruct')) keywordBonus += 0.3;
    if (lower.includes('commanding')) keywordBonus += 0.5;
    if (lower.includes('rally')) keywordBonus += 0.3;
  }

  // --- Total Rating ---
  // Weight offense and defense roughly equally, with smaller contributions from mobility and keywords
  const totalRating = offensiveRating * 2.0 + defensiveRating * 1.5 + mobilityRating + keywordBonus;

  return {
    npcId,
    name: npc.name,
    tier: npc.tier,
    offensiveRating: Math.round(offensiveRating * 100) / 100,
    defensiveRating: Math.round(defensiveRating * 100) / 100,
    mobilityRating: Math.round(mobilityRating * 100) / 100,
    keywordBonus: Math.round(keywordBonus * 100) / 100,
    totalRating: Math.round(totalRating * 100) / 100,
  };
}

// ============================================================================
// EMPIRICAL 1v1 DUEL SYSTEM
// ============================================================================

export interface DuelResult {
  npcA: string;
  npcB: string;
  winsA: number;
  winsB: number;
  draws: number;
  gamesPlayed: number;
  avgRounds: number;
}

export interface DuelRanking {
  npcId: string;
  name: string;
  tier: string;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  winRate: number;
  eloRating: number;
}

export interface PowerRankingResult {
  analytical: AnalyticalRating[];
  duelResults: DuelResult[];
  rankings: CombinedRanking[];
}

export interface CombinedRanking {
  rank: number;
  npcId: string;
  name: string;
  tier: string;
  analyticalScore: number;
  empiricalScore: number;  // Elo-based
  combinedScore: number;
  winRate: number;
  suggestedThreatCost: number;
}

/**
 * Run a single 1v1 duel between two NPCs on a small arena.
 * Returns the winner ('A', 'B', or 'draw').
 */
function runDuel(
  npcA: string,
  npcB: string,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  seed: number,
  roundLimit: number = 15,
): { winner: 'A' | 'B' | 'draw'; rounds: number } {
  const rng = createSeededRng(seed);
  const restoreRandom = installSeededRandom(rng);

  try {
    const players: Player[] = [
      { id: 0, name: 'Side A', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Side B', role: 'Operative', isLocal: true, isAI: true },
    ];

    const arenaMap = buildArenaMap(
      { preset: 'tiny', cover: 'light' },
      boardTemplates,
      seed,
    );

    const mission = {
      id: 'duel',
      name: 'Duel',
      description: '1v1',
      mapId: 'arena',
      roundLimit,
      imperialThreat: 0,
      imperialReinforcementPoints: 0,
      victoryConditions: [
        { side: 'Imperial' as const, description: 'Defeat enemy', condition: 'allEnemiesDefeated' },
        { side: 'Operative' as const, description: 'Defeat enemy', condition: 'allEnemiesDefeated' },
      ],
    };

    let gs = createInitialGameStateV2(mission, players, gameData, arenaMap, {
      npcProfiles: gameData.npcProfiles,
    });

    const army: ArmyCompositionV2 = {
      imperial: [{ npcId: npcA, count: 1 }],
      operative: [{ entityType: 'npc' as const, entityId: npcB, count: 1 }],
    };

    gs = deployFiguresV2(gs, army, gameData);

    // Disable morale (not relevant for 1v1)
    gs = {
      ...gs,
      imperialMorale: { ...gs.imperialMorale, value: 99, max: 99 },
      operativeMorale: { ...gs.operativeMorale, value: 99, max: 99 },
    };

    // Run combat
    gs = advancePhaseV2(gs); // Setup -> Initiative

    let turnCount = 0;
    const maxTurns = 200;

    while (gs.turnPhase !== 'GameOver' && gs.roundNumber <= roundLimit && turnCount < maxTurns) {
      gs = advancePhaseV2(gs); // Initiative -> Activation

      while (
        gs.turnPhase === 'Activation' &&
        gs.currentActivationIndex < gs.activationOrder.length &&
        turnCount < maxTurns
      ) {
        const figure = getCurrentFigureV2(gs);
        if (!figure || figure.isDefeated) {
          gs = advancePhaseV2(gs);
          turnCount++;
          continue;
        }

        gs = {
          ...gs,
          figures: gs.figures.map(f =>
            f.id === figure.id ? resetForActivation(f) : f
          ),
        };

        const activeFig = gs.figures.find(f => f.id === figure.id)!;
        const decision = determineActions(activeFig, gs, gameData, profilesData);

        for (const action of decision.actions) {
          gs = executeActionV2(gs, action, gameData);
        }

        gs = {
          ...gs,
          figures: gs.figures.map(f =>
            f.id === figure.id ? { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 } : f
          ),
        };

        const victory = checkVictoryV2(gs, mission);
        if (victory.winner) {
          gs = { ...gs, winner: victory.winner, victoryCondition: victory.condition, turnPhase: 'GameOver' };
          break;
        }

        gs = advancePhaseV2(gs);
        turnCount++;
      }

      if (gs.turnPhase === 'GameOver') break;

      const endVictory = checkVictoryV2(gs, mission);
      if (endVictory.winner) {
        gs = { ...gs, winner: endVictory.winner, victoryCondition: endVictory.condition, turnPhase: 'GameOver' };
        break;
      }

      if (gs.turnPhase === 'Activation') gs = { ...gs, turnPhase: 'Status' as const };
      if (gs.turnPhase === 'Status') gs = advancePhaseV2(gs);
      if (gs.turnPhase === 'Reinforcement') gs = advancePhaseV2(gs);
      if (gs.turnPhase === 'Initiative') gs = advancePhaseV2(gs);

      gs = {
        ...gs,
        figures: gs.figures.map(f => f.isDefeated ? f : resetForActivation(f)),
      };
    }

    // Resolve winner
    if (gs.winner === 'Imperial') return { winner: 'A', rounds: gs.roundNumber };
    if (gs.winner === 'Operative') return { winner: 'B', rounds: gs.roundNumber };

    // Tiebreak by remaining wounds
    const figA = gs.figures.find(f => f.entityId === npcA && !f.isDefeated);
    const figB = gs.figures.find(f => f.entityId === npcB && !f.isDefeated);
    const hpA = figA ? (gameData.npcProfiles[npcA]?.woundThreshold ?? 0) - figA.woundsCurrent : 0;
    const hpB = figB ? (gameData.npcProfiles[npcB]?.woundThreshold ?? 0) - figB.woundsCurrent : 0;

    if (hpA > hpB) return { winner: 'A', rounds: gs.roundNumber };
    if (hpB > hpA) return { winner: 'B', rounds: gs.roundNumber };
    return { winner: 'draw', rounds: gs.roundNumber };
  } finally {
    restoreRandom();
  }
}

/**
 * Run a full round-robin 1v1 tournament between all provided NPCs.
 */
export function runDuelTournament(
  npcIds: string[],
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  gamesPerMatchup: number = 20,
  baseSeed: number = 42,
): { duelResults: DuelResult[]; rankings: DuelRanking[] } {
  const duelResults: DuelResult[] = [];
  const tracker = new Map<string, { wins: number; losses: number; draws: number; games: number }>();

  // Initialize tracker
  for (const npcId of npcIds) {
    tracker.set(npcId, { wins: 0, losses: 0, draws: 0, games: 0 });
  }

  let seedCounter = baseSeed;

  // Round robin: every pair fights
  for (let i = 0; i < npcIds.length; i++) {
    for (let j = i + 1; j < npcIds.length; j++) {
      const npcA = npcIds[i];
      const npcB = npcIds[j];
      let winsA = 0, winsB = 0, draws = 0;
      let totalRounds = 0;

      for (let g = 0; g < gamesPerMatchup; g++) {
        // Alternate who goes on which side for fairness
        const swapped = g % 2 === 1;
        const result = runDuel(
          swapped ? npcB : npcA,
          swapped ? npcA : npcB,
          gameData,
          profilesData,
          boardTemplates,
          seedCounter++,
        );

        totalRounds += result.rounds;

        if (result.winner === 'draw') {
          draws++;
        } else if ((result.winner === 'A' && !swapped) || (result.winner === 'B' && swapped)) {
          winsA++;
        } else {
          winsB++;
        }
      }

      duelResults.push({
        npcA,
        npcB,
        winsA,
        winsB,
        draws,
        gamesPlayed: gamesPerMatchup,
        avgRounds: totalRounds / gamesPerMatchup,
      });

      const tA = tracker.get(npcA)!;
      const tB = tracker.get(npcB)!;
      tA.wins += winsA; tA.losses += winsB; tA.draws += draws; tA.games += gamesPerMatchup;
      tB.wins += winsB; tB.losses += winsA; tB.draws += draws; tB.games += gamesPerMatchup;

      process.stdout.write(`  Duel: ${npcA} vs ${npcB}: ${winsA}-${winsB}-${draws}\n`);
    }
  }

  // Compute Elo ratings from results
  const elo = new Map<string, number>();
  for (const npcId of npcIds) {
    elo.set(npcId, 1000);
  }

  // Multiple passes to converge
  for (let pass = 0; pass < 5; pass++) {
    for (const duel of duelResults) {
      const eloA = elo.get(duel.npcA)!;
      const eloB = elo.get(duel.npcB)!;
      const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
      const actualA = (duel.winsA + duel.draws * 0.5) / duel.gamesPlayed;
      const K = 32;
      elo.set(duel.npcA, eloA + K * (actualA - expectedA));
      elo.set(duel.npcB, eloB + K * ((1 - actualA) - (1 - expectedA)));
    }
  }

  // Build rankings
  const rankings: DuelRanking[] = npcIds.map(npcId => {
    const t = tracker.get(npcId)!;
    const npc = gameData.npcProfiles[npcId];
    return {
      npcId,
      name: npc?.name ?? npcId,
      tier: npc?.tier ?? 'Unknown',
      wins: t.wins,
      losses: t.losses,
      draws: t.draws,
      totalGames: t.games,
      winRate: t.games > 0 ? t.wins / t.games : 0,
      eloRating: Math.round(elo.get(npcId) ?? 1000),
    };
  });

  // Sort by Elo descending
  rankings.sort((a, b) => b.eloRating - a.eloRating);

  return { duelResults, rankings };
}

// ============================================================================
// COMBINED POWER RANKING
// ============================================================================

/**
 * Suggested threat cost based on combined power score.
 * Calibrated so baseline stormtrooper = 2, elite units = 4-6, nemesis = 8+.
 */
function suggestThreatCost(combinedScore: number, tier: string): number {
  // Tier baseline
  const tierBase = tier === 'Minion' ? 2 : tier === 'Rival' ? 4 : 8;

  // Scale by power score relative to tier average
  const tierAvgScore = tier === 'Minion' ? 8 : tier === 'Rival' ? 15 : 25;
  const ratio = combinedScore / tierAvgScore;
  const cost = Math.round(tierBase * ratio);

  return Math.max(1, Math.min(cost, 12));
}

/**
 * Run the full power ranking pipeline:
 * 1. Compute analytical ratings for all NPCs
 * 2. Run round-robin 1v1 duel tournament
 * 3. Combine scores and produce final ranking
 */
export function runFullPowerRanking(
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  options: {
    gamesPerMatchup?: number;
    baseSeed?: number;
    npcFilter?: string[];  // Optional: only rank these NPC IDs
  } = {},
): PowerRankingResult {
  const gamesPerMatchup = options.gamesPerMatchup ?? 20;
  const baseSeed = options.baseSeed ?? 42;

  // Collect all NPC IDs
  let npcIds = Object.keys(gameData.npcProfiles);
  if (options.npcFilter && options.npcFilter.length > 0) {
    npcIds = npcIds.filter(id => options.npcFilter!.includes(id));
  }

  // Filter out NPCs that can't fight (no weapons)
  npcIds = npcIds.filter(id => {
    const npc = gameData.npcProfiles[id];
    return npc && npc.weapons && npc.weapons.length > 0;
  });

  console.log(`\nPower Ranking: ${npcIds.length} NPCs`);
  console.log('='.repeat(60));

  // 1. Analytical ratings
  console.log('\n--- Analytical Ratings ---\n');
  const analytical: AnalyticalRating[] = npcIds.map(id =>
    computeAnalyticalRating(id, gameData.npcProfiles[id])
  );
  analytical.sort((a, b) => b.totalRating - a.totalRating);

  for (const r of analytical) {
    console.log(
      `  ${r.name.padEnd(25)} [${r.tier.padEnd(7)}] ` +
      `Off: ${r.offensiveRating.toFixed(1).padStart(5)}  ` +
      `Def: ${r.defensiveRating.toFixed(1).padStart(5)}  ` +
      `Spd: ${r.mobilityRating.toFixed(2).padStart(5)}  ` +
      `KW: ${r.keywordBonus.toFixed(1).padStart(5)}  ` +
      `TOTAL: ${r.totalRating.toFixed(1).padStart(6)}`
    );
  }

  // 2. Duel tournament
  console.log('\n--- 1v1 Duel Tournament ---\n');
  const { duelResults, rankings: duelRankings } = runDuelTournament(
    npcIds,
    gameData,
    profilesData,
    boardTemplates,
    gamesPerMatchup,
    baseSeed,
  );

  console.log('\n--- Duel Rankings (by Elo) ---\n');
  for (const r of duelRankings) {
    console.log(
      `  ${r.name.padEnd(25)} [${r.tier.padEnd(7)}] ` +
      `W: ${String(r.wins).padStart(3)}  L: ${String(r.losses).padStart(3)}  D: ${String(r.draws).padStart(3)}  ` +
      `WR: ${(r.winRate * 100).toFixed(0).padStart(3)}%  ` +
      `Elo: ${String(r.eloRating).padStart(5)}`
    );
  }

  // 3. Combine into final ranking
  console.log('\n--- Combined Power Ranking ---\n');

  // Normalize scores to 0-100 range
  const maxAnalytical = Math.max(...analytical.map(a => a.totalRating), 1);
  const maxElo = Math.max(...duelRankings.map(r => r.eloRating), 1);
  const minElo = Math.min(...duelRankings.map(r => r.eloRating));

  const combined: CombinedRanking[] = npcIds.map(id => {
    const aRating = analytical.find(a => a.npcId === id)!;
    const dRating = duelRankings.find(r => r.npcId === id)!;
    const npc = gameData.npcProfiles[id];

    const analyticalNorm = (aRating.totalRating / maxAnalytical) * 100;
    const eloRange = maxElo - minElo || 1;
    const empiricalNorm = ((dRating.eloRating - minElo) / eloRange) * 100;

    // 40% analytical, 60% empirical (duels are more reliable)
    const combinedScore = analyticalNorm * 0.4 + empiricalNorm * 0.6;
    const suggestedCost = suggestThreatCost(combinedScore, npc.tier);

    return {
      rank: 0,
      npcId: id,
      name: npc.name,
      tier: npc.tier,
      analyticalScore: Math.round(analyticalNorm * 10) / 10,
      empiricalScore: Math.round(empiricalNorm * 10) / 10,
      combinedScore: Math.round(combinedScore * 10) / 10,
      winRate: dRating.winRate,
      suggestedThreatCost: suggestedCost,
    };
  });

  combined.sort((a, b) => b.combinedScore - a.combinedScore);
  combined.forEach((c, i) => { c.rank = i + 1; });

  // Print final ranking
  console.log(
    '  #  ' +
    'Name'.padEnd(25) +
    'Tier'.padEnd(9) +
    'Analytical'.padStart(11) +
    'Empirical'.padStart(10) +
    'Combined'.padStart(9) +
    'WinRate'.padStart(8) +
    'Threat$'.padStart(8)
  );
  console.log('  ' + '-'.repeat(87));

  for (const c of combined) {
    console.log(
      `  ${String(c.rank).padStart(2)} ` +
      `${c.name.padEnd(25)}` +
      `${c.tier.padEnd(9)}` +
      `${c.analyticalScore.toFixed(1).padStart(11)}` +
      `${c.empiricalScore.toFixed(1).padStart(10)}` +
      `${c.combinedScore.toFixed(1).padStart(9)}` +
      `${(c.winRate * 100).toFixed(0).padStart(7)}%` +
      `${String(c.suggestedThreatCost).padStart(8)}`
    );
  }

  return { analytical, duelResults, rankings: combined };
}

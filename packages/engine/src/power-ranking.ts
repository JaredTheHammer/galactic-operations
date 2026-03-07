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
import { determineActions, getProfileForFigure } from './ai/decide-v2.js';
import { createSeededRng, installSeededRandom } from './ai/simulator-v2.js';
import { buildArenaMap } from './ai/combat-simulator.js';
import { BattleLogger } from './ai/battle-logger.js';
import type { BattleLog } from './ai/battle-logger.js';

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
  nameA: string;
  nameB: string;
  winsA: number;
  winsB: number;
  draws: number;
  gamesPlayed: number;
  avgRounds: number;
  /** Per-game detail: damage dealt by each side, rounds, HP remaining */
  gameDetails: DuelGameDetail[];
}

export interface DuelGameDetail {
  seed: number;
  winner: 'A' | 'B' | 'draw';
  rounds: number;
  damageByA: number;
  damageByB: number;
  hpRemainingA: number;
  hpRemainingB: number;
  /** Full BattleLog for this game (only populated when logging enabled) */
  battleLog?: BattleLog;
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
  timestamp: string;
  config: { gamesPerMatchup: number; baseSeed: number; npcCount: number; totalDuels: number };
  analytical: AnalyticalRating[];
  duelResults: DuelResult[];
  rankings: CombinedRanking[];
  /** Per-NPC aggregated combat stats from all duels */
  npcCombatStats: NPCCombatStats[];
  /** Balance flags: NPCs that may need adjustment */
  balanceFlags: BalanceFlag[];
}

export interface NPCCombatStats {
  npcId: string;
  name: string;
  tier: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  avgRoundsSurvived: number;
  avgHpRemaining: number;
  /** How often this NPC wins vs higher-tier units */
  upsetWinRate: number;
  /** How often this NPC loses to lower-tier units */
  upsetLossRate: number;
  /** Best and worst matchups */
  bestMatchup: { opponentId: string; opponentName: string; winRate: number } | null;
  worstMatchup: { opponentId: string; opponentName: string; winRate: number } | null;
}

export interface BalanceFlag {
  npcId: string;
  name: string;
  tier: string;
  flag: 'overpowered' | 'underpowered' | 'tier_mismatch' | 'high_draw_rate';
  reason: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
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

interface DuelRunResult {
  winner: 'A' | 'B' | 'draw';
  rounds: number;
  damageByA: number;
  damageByB: number;
  hpRemainingA: number;
  hpRemainingB: number;
  battleLog?: BattleLog;
}

/**
 * Run a single 1v1 duel between two NPCs on a small arena.
 * Returns winner, rounds, damage stats, and optionally a full BattleLog.
 */
function runDuel(
  npcA: string,
  npcB: string,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  seed: number,
  options: { roundLimit?: number; enableLogging?: boolean } = {},
): DuelRunResult {
  const roundLimit = options.roundLimit ?? 15;
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

    // Track damage per side
    let damageByA = 0;
    let damageByB = 0;

    // Initialize BattleLogger if enabled
    let logger: BattleLogger | null = null;
    if (options.enableLogging) {
      logger = new BattleLogger();
      const archetypeMap: Record<string, string> = {};
      for (const fig of gs.figures) {
        const profile = getProfileForFigure(fig, gs, profilesData);
        archetypeMap[fig.id] = profile.name;
      }
      logger.startGame(gs, gameData, archetypeMap, roundLimit, 'Duel Arena');
    }

    // Run combat
    gs = advancePhaseV2(gs); // Setup -> Initiative

    let turnCount = 0;
    const maxTurns = 200;

    while (gs.turnPhase !== 'GameOver' && gs.roundNumber <= roundLimit && turnCount < maxTurns) {
      gs = advancePhaseV2(gs); // Initiative -> Activation
      logger?.startRound(gs.roundNumber);

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
        const gsBefore = gs;
        const profile = getProfileForFigure(activeFig, gs, profilesData);
        const decision = determineActions(activeFig, gs, gameData, profilesData);

        const actionDescs: string[] = [];
        for (const action of decision.actions) {
          actionDescs.push(`${action.type}${(action.payload as Record<string, unknown>)?.targetId ? ' -> ' + (action.payload as Record<string, unknown>).targetId : ''}`);
          gs = executeActionV2(gs, action, gameData);
        }

        // Track damage dealt this activation
        for (const enemy of gsBefore.figures.filter(f => f.playerId !== activeFig.playerId)) {
          const enemyAfter = gs.figures.find(f => f.id === enemy.id);
          if (enemyAfter) {
            const dmg = Math.max(0, enemyAfter.woundsCurrent - enemy.woundsCurrent);
            if (dmg > 0) {
              if (activeFig.playerId === 0) damageByA += dmg;
              else damageByB += dmg;
            }
          }
        }

        // Log activation
        if (logger) {
          logger.logActivation(
            activeFig, gsBefore, gs, gameData,
            decision, profile, decision.actions, actionDescs,
          );
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

      logger?.endRound(gs);

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

    // HP remaining
    const figA = gs.figures.find(f => f.entityId === npcA);
    const figB = gs.figures.find(f => f.entityId === npcB);
    const maxHpA = gameData.npcProfiles[npcA]?.woundThreshold ?? 0;
    const maxHpB = gameData.npcProfiles[npcB]?.woundThreshold ?? 0;
    const hpA = figA && !figA.isDefeated ? maxHpA - figA.woundsCurrent : 0;
    const hpB = figB && !figB.isDefeated ? maxHpB - figB.woundsCurrent : 0;

    // Resolve winner
    let winner: 'A' | 'B' | 'draw';
    if (gs.winner === 'Imperial') winner = 'A';
    else if (gs.winner === 'Operative') winner = 'B';
    else if (hpA > hpB) winner = 'A';
    else if (hpB > hpA) winner = 'B';
    else winner = 'draw';

    const winnerStr = winner === 'A' ? 'Imperial' : winner === 'B' ? 'Operative' : 'Draw';
    logger?.endGame(winnerStr, gs.victoryCondition ?? 'HP tiebreak', gs);

    return {
      winner,
      rounds: gs.roundNumber,
      damageByA,
      damageByB,
      hpRemainingA: hpA,
      hpRemainingB: hpB,
      battleLog: logger?.getLog(),
    };
  } finally {
    restoreRandom();
  }
}

/**
 * Run a full round-robin 1v1 tournament between all provided NPCs.
 * When enableLogging is true, each duel includes a full BattleLog for analysis.
 */
export function runDuelTournament(
  npcIds: string[],
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  gamesPerMatchup: number = 20,
  baseSeed: number = 42,
  enableLogging: boolean = false,
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
      const nameA = gameData.npcProfiles[npcA]?.name ?? npcA;
      const nameB = gameData.npcProfiles[npcB]?.name ?? npcB;
      let winsA = 0, winsB = 0, draws = 0;
      let totalRounds = 0;
      const gameDetails: DuelGameDetail[] = [];

      for (let g = 0; g < gamesPerMatchup; g++) {
        // Alternate who goes on which side for fairness
        const swapped = g % 2 === 1;
        const currentSeed = seedCounter++;
        const result = runDuel(
          swapped ? npcB : npcA,
          swapped ? npcA : npcB,
          gameData,
          profilesData,
          boardTemplates,
          currentSeed,
          { enableLogging },
        );

        totalRounds += result.rounds;

        // Normalize: translate A/B relative to the canonical npcA/npcB order
        let canonicalWinner: 'A' | 'B' | 'draw';
        let dmgA: number, dmgB: number, hpA: number, hpB: number;
        if (result.winner === 'draw') {
          canonicalWinner = 'draw';
          draws++;
        } else if ((result.winner === 'A' && !swapped) || (result.winner === 'B' && swapped)) {
          canonicalWinner = 'A';
          winsA++;
        } else {
          canonicalWinner = 'B';
          winsB++;
        }

        if (swapped) {
          dmgA = result.damageByB; dmgB = result.damageByA;
          hpA = result.hpRemainingB; hpB = result.hpRemainingA;
        } else {
          dmgA = result.damageByA; dmgB = result.damageByB;
          hpA = result.hpRemainingA; hpB = result.hpRemainingB;
        }

        gameDetails.push({
          seed: currentSeed,
          winner: canonicalWinner,
          rounds: result.rounds,
          damageByA: dmgA,
          damageByB: dmgB,
          hpRemainingA: hpA,
          hpRemainingB: hpB,
          battleLog: result.battleLog,
        });
      }

      duelResults.push({
        npcA,
        npcB,
        nameA,
        nameB,
        winsA,
        winsB,
        draws,
        gamesPlayed: gamesPerMatchup,
        avgRounds: totalRounds / gamesPerMatchup,
        gameDetails,
      });

      const tA = tracker.get(npcA)!;
      const tB = tracker.get(npcB)!;
      tA.wins += winsA; tA.losses += winsB; tA.draws += draws; tA.games += gamesPerMatchup;
      tB.wins += winsB; tB.losses += winsA; tB.draws += draws; tB.games += gamesPerMatchup;

      process.stdout.write(`  Duel: ${nameA} vs ${nameB}: ${winsA}-${winsB}-${draws}\n`);
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
 * 4. Compute per-NPC combat stats and balance flags
 */
export function runFullPowerRanking(
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  options: {
    gamesPerMatchup?: number;
    baseSeed?: number;
    npcFilter?: string[];
    enableLogging?: boolean;  // Enable per-duel BattleLogs (slower, more data)
  } = {},
): PowerRankingResult {
  const gamesPerMatchup = options.gamesPerMatchup ?? 20;
  const baseSeed = options.baseSeed ?? 42;
  const enableLogging = options.enableLogging ?? false;

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
    enableLogging,
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

  // 4. Compute per-NPC combat stats
  const npcCombatStats = computeNPCCombatStats(npcIds, duelResults, gameData);

  // 5. Detect balance issues
  const balanceFlags = detectBalanceFlags(npcCombatStats, combined, gameData);

  if (balanceFlags.length > 0) {
    console.log('\n--- Balance Flags ---\n');
    for (const flag of balanceFlags) {
      const icon = flag.severity === 'high' ? '!!!' : flag.severity === 'medium' ? ' !!' : '  !';
      console.log(`  ${icon} [${flag.flag.toUpperCase()}] ${flag.name} (${flag.tier}): ${flag.reason}`);
      console.log(`      Suggestion: ${flag.suggestion}`);
    }
  }

  const totalDuels = duelResults.length * gamesPerMatchup;

  return {
    timestamp: new Date().toISOString(),
    config: { gamesPerMatchup, baseSeed, npcCount: npcIds.length, totalDuels },
    analytical,
    duelResults,
    rankings: combined,
    npcCombatStats,
    balanceFlags,
  };
}

// ============================================================================
// PER-NPC COMBAT STATS AGGREGATION
// ============================================================================

function computeNPCCombatStats(
  npcIds: string[],
  duelResults: DuelResult[],
  gameData: GameData,
): NPCCombatStats[] {
  const tierOrder: Record<string, number> = { 'Minion': 0, 'Rival': 1, 'Nemesis': 2 };

  return npcIds.map(npcId => {
    const npc = gameData.npcProfiles[npcId];
    const tier = npc?.tier ?? 'Unknown';

    // Gather all matchups involving this NPC
    let totalDmgDealt = 0, totalDmgTaken = 0;
    let totalRounds = 0, totalHpRemaining = 0;
    let wins = 0, losses = 0, draws = 0, totalGames = 0;
    let upsetWins = 0, upsetOpportunities = 0;
    let upsetLosses = 0, upsetLossOpportunities = 0;

    const matchupWins = new Map<string, number>();
    const matchupGames = new Map<string, number>();

    for (const duel of duelResults) {
      const isA = duel.npcA === npcId;
      const isB = duel.npcB === npcId;
      if (!isA && !isB) continue;

      const opponentId = isA ? duel.npcB : duel.npcA;
      const opponentTier = gameData.npcProfiles[opponentId]?.tier ?? 'Unknown';

      const myWins = isA ? duel.winsA : duel.winsB;
      const myLosses = isA ? duel.winsB : duel.winsA;
      wins += myWins;
      losses += myLosses;
      draws += duel.draws;
      totalGames += duel.gamesPlayed;

      matchupWins.set(opponentId, (matchupWins.get(opponentId) ?? 0) + myWins);
      matchupGames.set(opponentId, (matchupGames.get(opponentId) ?? 0) + duel.gamesPlayed);

      // Upset tracking
      const myTierRank = tierOrder[tier] ?? 0;
      const oppTierRank = tierOrder[opponentTier] ?? 0;
      if (oppTierRank > myTierRank) {
        upsetOpportunities += duel.gamesPlayed;
        upsetWins += myWins;
      }
      if (oppTierRank < myTierRank) {
        upsetLossOpportunities += duel.gamesPlayed;
        upsetLosses += myLosses;
      }

      // Aggregate per-game stats
      for (const game of duel.gameDetails) {
        totalRounds += game.rounds;
        if (isA) {
          totalDmgDealt += game.damageByA;
          totalDmgTaken += game.damageByB;
          totalHpRemaining += game.hpRemainingA;
        } else {
          totalDmgDealt += game.damageByB;
          totalDmgTaken += game.damageByA;
          totalHpRemaining += game.hpRemainingB;
        }
      }
    }

    // Best and worst matchups
    let bestMatchup: NPCCombatStats['bestMatchup'] = null;
    let worstMatchup: NPCCombatStats['worstMatchup'] = null;
    let bestWR = -1, worstWR = 2;

    for (const [oppId, oppGames] of matchupGames) {
      const oppWins = matchupWins.get(oppId) ?? 0;
      const wr = oppGames > 0 ? oppWins / oppGames : 0;
      const oppNpc = gameData.npcProfiles[oppId];
      if (wr > bestWR) {
        bestWR = wr;
        bestMatchup = { opponentId: oppId, opponentName: oppNpc?.name ?? oppId, winRate: Math.round(wr * 1000) / 1000 };
      }
      if (wr < worstWR) {
        worstWR = wr;
        worstMatchup = { opponentId: oppId, opponentName: oppNpc?.name ?? oppId, winRate: Math.round(wr * 1000) / 1000 };
      }
    }

    return {
      npcId,
      name: npc?.name ?? npcId,
      tier,
      totalGames,
      wins,
      losses,
      draws,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 1000) / 1000 : 0,
      avgDamageDealt: totalGames > 0 ? Math.round((totalDmgDealt / totalGames) * 10) / 10 : 0,
      avgDamageTaken: totalGames > 0 ? Math.round((totalDmgTaken / totalGames) * 10) / 10 : 0,
      avgRoundsSurvived: totalGames > 0 ? Math.round((totalRounds / totalGames) * 10) / 10 : 0,
      avgHpRemaining: totalGames > 0 ? Math.round((totalHpRemaining / totalGames) * 10) / 10 : 0,
      upsetWinRate: upsetOpportunities > 0 ? Math.round((upsetWins / upsetOpportunities) * 1000) / 1000 : 0,
      upsetLossRate: upsetLossOpportunities > 0 ? Math.round((upsetLosses / upsetLossOpportunities) * 1000) / 1000 : 0,
      bestMatchup,
      worstMatchup,
    };
  });
}

// ============================================================================
// BALANCE FLAG DETECTION
// ============================================================================

function detectBalanceFlags(
  stats: NPCCombatStats[],
  rankings: CombinedRanking[],
  gameData: GameData,
): BalanceFlag[] {
  const flags: BalanceFlag[] = [];
  const tierOrder: Record<string, number> = { 'Minion': 0, 'Rival': 1, 'Nemesis': 2 };

  for (const s of stats) {
    const npc = gameData.npcProfiles[s.npcId];
    if (!npc) continue;

    const ranking = rankings.find(r => r.npcId === s.npcId);

    // Overpowered: wins > 80% of all matchups
    if (s.totalGames >= 10 && s.winRate > 0.80) {
      flags.push({
        npcId: s.npcId,
        name: s.name,
        tier: s.tier,
        flag: 'overpowered',
        severity: s.winRate > 0.90 ? 'high' : 'medium',
        reason: `${(s.winRate * 100).toFixed(0)}% overall win rate across ${s.totalGames} games`,
        suggestion: `Reduce wound threshold (currently ${npc.woundThreshold}), lower base damage, or reduce attack pool dice`,
      });
    }

    // Underpowered: wins < 20% of all matchups
    if (s.totalGames >= 10 && s.winRate < 0.20) {
      flags.push({
        npcId: s.npcId,
        name: s.name,
        tier: s.tier,
        flag: 'underpowered',
        severity: s.winRate < 0.10 ? 'high' : 'medium',
        reason: `${(s.winRate * 100).toFixed(0)}% overall win rate across ${s.totalGames} games`,
        suggestion: `Increase wound threshold (currently ${npc.woundThreshold}), raise base damage, or add a weapon quality`,
      });
    }

    // Tier mismatch: Minion consistently beating Rivals, or Rival beating Nemesis
    if (s.tier === 'Minion' && s.upsetWinRate > 0.40) {
      flags.push({
        npcId: s.npcId,
        name: s.name,
        tier: s.tier,
        flag: 'tier_mismatch',
        severity: s.upsetWinRate > 0.55 ? 'high' : 'medium',
        reason: `Minion beats higher-tier units ${(s.upsetWinRate * 100).toFixed(0)}% of the time`,
        suggestion: `Consider promoting to Rival tier, or nerf stats to match Minion power budget`,
      });
    }

    if (s.tier === 'Nemesis' && s.upsetLossRate > 0.40) {
      flags.push({
        npcId: s.npcId,
        name: s.name,
        tier: s.tier,
        flag: 'tier_mismatch',
        severity: s.upsetLossRate > 0.55 ? 'high' : 'medium',
        reason: `Nemesis loses to lower-tier units ${(s.upsetLossRate * 100).toFixed(0)}% of the time`,
        suggestion: `Buff stats to justify Nemesis tier, or demote to Rival`,
      });
    }

    // High draw rate indicates stalemates (bad for gameplay)
    if (s.totalGames >= 10 && s.draws / s.totalGames > 0.25) {
      flags.push({
        npcId: s.npcId,
        name: s.name,
        tier: s.tier,
        flag: 'high_draw_rate',
        severity: s.draws / s.totalGames > 0.40 ? 'high' : 'low',
        reason: `${(s.draws / s.totalGames * 100).toFixed(0)}% draw rate (${s.draws}/${s.totalGames} games)`,
        suggestion: `Increase offensive capability or reduce defense to create decisive outcomes`,
      });
    }
  }

  // Sort: high severity first
  const sevOrder: Record<string, number> = { 'high': 0, 'medium': 1, 'low': 2 };
  flags.sort((a, b) => (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2));

  return flags;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * Generate a full text report from a PowerRankingResult.
 * Designed to be saved to a file and read by a human or LLM for balance analysis.
 */
export function generatePowerRankingReport(result: PowerRankingResult, gameData: GameData): string {
  const lines: string[] = [];
  const hr = '='.repeat(90);
  const hr2 = '-'.repeat(90);

  lines.push(hr);
  lines.push('  GALACTIC OPERATIONS -- NPC POWER RANKING REPORT');
  lines.push(hr);
  lines.push(`  Generated: ${result.timestamp}`);
  lines.push(`  NPCs: ${result.config.npcCount}  |  Games/matchup: ${result.config.gamesPerMatchup}  |  Seed: ${result.config.baseSeed}`);
  lines.push(`  Total duels: ${result.config.totalDuels}`);
  lines.push('');

  // === COMBINED RANKINGS ===
  lines.push(hr);
  lines.push('  COMBINED POWER RANKINGS');
  lines.push(hr);
  lines.push('');
  lines.push(
    '  #  ' +
    'Name'.padEnd(25) +
    'Tier'.padEnd(9) +
    'Analytical'.padStart(11) +
    'Empirical'.padStart(10) +
    'Combined'.padStart(9) +
    'WinRate'.padStart(8) +
    'Threat$'.padStart(8)
  );
  lines.push('  ' + '-'.repeat(87));
  for (const c of result.rankings) {
    lines.push(
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
  lines.push('');

  // === PER-NPC COMBAT STATS ===
  lines.push(hr);
  lines.push('  PER-NPC COMBAT STATISTICS');
  lines.push(hr);
  lines.push('');

  // Sort stats by combined score for consistent ordering
  const sortedStats = [...result.npcCombatStats].sort((a, b) => {
    const ra = result.rankings.find(r => r.npcId === a.npcId);
    const rb = result.rankings.find(r => r.npcId === b.npcId);
    return (ra?.rank ?? 999) - (rb?.rank ?? 999);
  });

  for (const s of sortedStats) {
    const npc = gameData.npcProfiles[s.npcId];
    const ranking = result.rankings.find(r => r.npcId === s.npcId);
    lines.push(`  ${s.name} [${s.tier}]  --  Rank #${ranking?.rank ?? '?'}  Elo: ${ranking?.empiricalScore.toFixed(0) ?? '?'}`);
    lines.push(`    Record: ${s.wins}W / ${s.losses}L / ${s.draws}D  (${(s.winRate * 100).toFixed(1)}% win rate)`);
    lines.push(`    Avg damage dealt: ${s.avgDamageDealt}  |  Avg damage taken: ${s.avgDamageTaken}`);
    lines.push(`    Avg rounds survived: ${s.avgRoundsSurvived}  |  Avg HP remaining: ${s.avgHpRemaining}`);
    if (s.bestMatchup) {
      lines.push(`    Best matchup:  vs ${s.bestMatchup.opponentName} (${(s.bestMatchup.winRate * 100).toFixed(0)}% WR)`);
    }
    if (s.worstMatchup) {
      lines.push(`    Worst matchup: vs ${s.worstMatchup.opponentName} (${(s.worstMatchup.winRate * 100).toFixed(0)}% WR)`);
    }
    if (s.upsetWinRate > 0) {
      lines.push(`    Upset wins vs higher tiers: ${(s.upsetWinRate * 100).toFixed(0)}%`);
    }
    if (s.upsetLossRate > 0) {
      lines.push(`    Upset losses to lower tiers: ${(s.upsetLossRate * 100).toFixed(0)}%`);
    }

    // Stat summary for context
    if (npc) {
      const w = npc.weapons[0];
      lines.push(`    Stats: HP=${npc.woundThreshold} Soak=${npc.soak} Spd=${npc.speed} Atk=[${npc.attackPool.ability}g/${npc.attackPool.proficiency}y] Def=[${npc.defensePool.difficulty}p/${npc.defensePool.challenge}r]`);
      if (w) {
        lines.push(`    Weapon: ${w.name} (dmg ${w.baseDamage}, range ${w.range}${w.qualities?.length ? ', ' + w.qualities.map(q => `${q.name}${q.value ? ' ' + q.value : ''}`).join(', ') : ''})`);
      }
    }
    lines.push('');
  }

  // === MATCHUP MATRIX ===
  lines.push(hr);
  lines.push('  HEAD-TO-HEAD MATCHUP RESULTS');
  lines.push(hr);
  lines.push('');

  for (const duel of result.duelResults) {
    const avgDmgA = duel.gameDetails.length > 0
      ? (duel.gameDetails.reduce((sum, g) => sum + g.damageByA, 0) / duel.gameDetails.length).toFixed(1)
      : '?';
    const avgDmgB = duel.gameDetails.length > 0
      ? (duel.gameDetails.reduce((sum, g) => sum + g.damageByB, 0) / duel.gameDetails.length).toFixed(1)
      : '?';

    lines.push(`  ${duel.nameA} vs ${duel.nameB}`);
    lines.push(`    Score: ${duel.winsA}-${duel.winsB}-${duel.draws} (${duel.gamesPlayed} games, avg ${duel.avgRounds.toFixed(1)} rounds)`);
    lines.push(`    Avg damage: ${duel.nameA} ${avgDmgA} / ${duel.nameB} ${avgDmgB}`);

    // Show per-game breakdown for small matchup counts
    if (duel.gameDetails.length <= 10) {
      const gameStrs = duel.gameDetails.map(g => {
        const w = g.winner === 'A' ? duel.nameA.substring(0, 8) : g.winner === 'B' ? duel.nameB.substring(0, 8) : 'Draw';
        return `R${g.rounds}:${w}`;
      });
      lines.push(`    Games: ${gameStrs.join(', ')}`);
    }
    lines.push('');
  }

  // === BALANCE FLAGS ===
  if (result.balanceFlags.length > 0) {
    lines.push(hr);
    lines.push('  BALANCE FLAGS & RECOMMENDATIONS');
    lines.push(hr);
    lines.push('');

    for (const flag of result.balanceFlags) {
      const icon = flag.severity === 'high' ? '[!!!]' : flag.severity === 'medium' ? '[!! ]' : '[!  ]';
      lines.push(`  ${icon} ${flag.flag.toUpperCase()}: ${flag.name} (${flag.tier})`);
      lines.push(`        ${flag.reason}`);
      lines.push(`        Suggestion: ${flag.suggestion}`);
      lines.push('');
    }
  } else {
    lines.push(hr);
    lines.push('  No balance flags detected. All units within expected parameters.');
    lines.push(hr);
    lines.push('');
  }

  // === ANALYTICAL BREAKDOWN ===
  lines.push(hr);
  lines.push('  ANALYTICAL RATING BREAKDOWN');
  lines.push(hr);
  lines.push('');
  lines.push(
    '  ' +
    'Name'.padEnd(25) +
    'Tier'.padEnd(9) +
    'Offense'.padStart(8) +
    'Defense'.padStart(8) +
    'Speed'.padStart(6) +
    'Keywords'.padStart(9) +
    'Total'.padStart(7)
  );
  lines.push('  ' + '-'.repeat(71));
  for (const r of result.analytical) {
    lines.push(
      `  ${r.name.padEnd(25)}` +
      `${r.tier.padEnd(9)}` +
      `${r.offensiveRating.toFixed(1).padStart(8)}` +
      `${r.defensiveRating.toFixed(1).padStart(8)}` +
      `${r.mobilityRating.toFixed(2).padStart(6)}` +
      `${r.keywordBonus.toFixed(1).padStart(9)}` +
      `${r.totalRating.toFixed(1).padStart(7)}`
    );
  }
  lines.push('');

  return lines.join('\n');
}

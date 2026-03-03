/**
 * AI System - Headless Simulator (v2)
 *
 * Runs complete AI-vs-AI games using the v2 engine.
 * Supports wounded hero mechanic, reinforcement phases, skill checks,
 * and the full Genesys action economy (Action + Maneuver).
 *
 * Key differences from v1 simulator:
 * - Uses v2 engine: createInitialGameStateV2, executeActionV2, checkVictoryV2
 * - Heroes with full character sheets (species, careers, skills)
 * - Threat-based reinforcement system
 * - Wounded hero mechanic (heroes survive first wound threshold)
 * - Action + Maneuver economy (not 2 generic actions)
 * - Mission objective points with skill checks
 */

import type {
  GameState,
  GameData,
  GameMap,
  Mission,
  Player,
  Figure,
  Side,
  HeroCharacter,
  NPCProfile,
  NPCTier,
  BoardTemplate,
  MapConfig,
} from '../types.js';

import { MAP_PRESETS } from '../types.js';

import {
  createInitialGameStateV2,
  deployFiguresV2,
  advancePhaseV2,
  executeActionV2,
  checkVictoryV2,
  resetForActivation,
  applyReinforcementPhase,
  getCurrentFigureV2,
  getFigureName,
} from '../turn-machine-v2.js';

import type { ArmyCompositionV2 } from '../turn-machine-v2.js';

import { getMoraleChangeForEvent, applyMoraleChange } from '../morale.js';

import type {
  AIProfilesData,
  RoundStats,
  GameSimulationResult,
  BatchSimulationResult,
  UnitPerformanceStats,
  SeededRng,
} from './types.js';

import { determineActions } from './decide-v2.js';

import { createHero } from '../character-v2.js';

import { generateMap } from '../map-generator.js';

// ============================================================================
// SEEDED RNG (engine-agnostic utilities, formerly in v1 simulator)
// ============================================================================

/**
 * Mulberry32: a simple, fast 32-bit seedable PRNG.
 * Returns values in [0, 1) like Math.random().
 */
export function createSeededRng(seed: number): SeededRng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Install a seeded RNG as Math.random replacement.
 * Returns a restore function to put the original back.
 */
export function installSeededRandom(rng: SeededRng): () => void {
  const original = Math.random;
  Math.random = rng;
  return () => { Math.random = original; };
}

// ============================================================================
// DEFAULT V2 ARMY & HERO GENERATION
// ============================================================================

/**
 * Generate 4 pre-built test heroes for AI vs AI playtesting.
 * Matches the client's generateTestHeroes exactly.
 */
export function generateTestHeroes(gameData: GameData): HeroCharacter[] {
  const heroes: HeroCharacter[] = [];

  // Hero 1: Wookiee Hired Gun / Mercenary -- tank/heavy weapons
  const korrga = createHero({
    name: 'Korrga',
    speciesId: 'wookiee',
    careerId: 'hired-gun',
    specializationId: 'mercenary',
    initialSkills: { 'ranged-heavy': 2, 'resilience': 1, 'athletics': 1, 'mechanics': 1 },
    characteristicIncreases: { brawn: 1 },
  }, gameData);
  // Stable ID for deterministic simulation (createHero uses Date.now())
  korrga.id = 'hero-korrga';
  korrga.equipment.primaryWeapon = 'a280';
  korrga.equipment.armor = 'heavy-battle-armor';
  heroes.push(korrga);

  // Hero 2: Human Scoundrel / Smuggler -- mobile DPS
  const vex = createHero({
    name: 'Vex Dorin',
    speciesId: 'human',
    careerId: 'scoundrel',
    specializationId: 'smuggler',
    initialSkills: { 'ranged-light': 2, 'cool': 1, 'coordination': 1, 'computers': 1 },
    characteristicIncreases: { agility: 1 },
  }, gameData);
  vex.id = 'hero-vex-dorin';
  vex.equipment.primaryWeapon = 'dl-44';
  vex.equipment.armor = 'blast-vest';
  heroes.push(vex);

  // Hero 3: Twi'lek Commander / Tactician -- support/leader
  const ashara = createHero({
    name: 'Ashara Nev',
    speciesId: 'twilek',
    careerId: 'commander',
    specializationId: 'tactician',
    initialSkills: { 'ranged-light': 1, 'leadership': 2, 'cool': 1, 'perception': 1, 'computers': 1 },
    characteristicIncreases: { presence: 1 },
  }, gameData);
  ashara.id = 'hero-ashara-nev';
  ashara.equipment.primaryWeapon = 'westar-35';
  ashara.equipment.armor = 'padded-armor';
  heroes.push(ashara);

  // Hero 4: Trandoshan Bounty Hunter / Assassin -- sniper/finisher
  const ssorku = createHero({
    name: 'Ssorku',
    speciesId: 'trandoshan',
    careerId: 'bounty-hunter',
    specializationId: 'assassin',
    initialSkills: { 'ranged-heavy': 2, 'stealth': 1, 'perception': 1, 'skulduggery': 1 },
    characteristicIncreases: { agility: 1 },
  }, gameData);
  ssorku.id = 'hero-ssorku';
  ssorku.equipment.primaryWeapon = 'e-11';
  ssorku.equipment.armor = 'padded-armor';
  heroes.push(ssorku);

  return heroes;
}

/**
 * Build default v2 army for AI battles.
 * Imperial starts with small patrol; reinforcements via threat system.
 */
export function defaultArmyV2(heroes: HeroCharacter[]): ArmyCompositionV2 {
  return {
    imperial: [
      { npcId: 'stormtrooper', count: 3 },
      { npcId: 'stormtrooper-elite', count: 1 },
      { npcId: 'imperial-officer', count: 1 },
    ],
    operative: heroes.map(h => ({
      entityType: 'hero' as const,
      entityId: h.id,
      count: 1,
    })),
  };
}

// ============================================================================
// SINGLE GAME SIMULATION (v2)
// ============================================================================

export interface SimulateGameV2Result {
  finalState: GameState;
  stats: GameSimulationResult;
}

/**
 * Run a single complete AI-vs-AI game using the v2 engine.
 *
 * @param boardTemplates Optional board templates for generating a proper map.
 *   When provided, the simulator generates a skirmish-sized (36x36) map with
 *   terrain, walls, cover, and deployment zones matching the live game.
 *   When omitted, falls back to a minimal 10x10 empty grid (legacy behavior).
 */
export function simulateGameV2(
  mission: Mission,
  gameData: GameData,
  profilesData: AIProfilesData,
  heroes: HeroCharacter[],
  army?: ArmyCompositionV2,
  seed?: number,
  verbose: boolean = false,
  boardTemplates?: BoardTemplate[],
): SimulateGameV2Result {
  const actualSeed = seed ?? Date.now();
  const rng = createSeededRng(actualSeed);
  const restoreRandom = installSeededRandom(rng);

  try {
    // Generate a proper map if board templates are available
    const map = boardTemplates && boardTemplates.length > 0
      ? generateMap(MAP_PRESETS.skirmish, boardTemplates, actualSeed)
      : undefined;

    return runSimulationV2(mission, gameData, profilesData, heroes, army ?? defaultArmyV2(heroes), actualSeed, verbose, map);
  } finally {
    restoreRandom();
  }
}

function runSimulationV2(
  mission: Mission,
  gameData: GameData,
  profilesData: AIProfilesData,
  heroes: HeroCharacter[],
  army: ArmyCompositionV2,
  seed: number,
  verbose: boolean,
  prebuiltMap?: GameMap,
): SimulateGameV2Result {
  // Create players
  const players: Player[] = [
    { id: 0, name: 'Imperial AI', role: 'Imperial', isLocal: true, isAI: true },
    { id: 1, name: 'Operative AI', role: 'Operative', isLocal: true, isAI: true },
  ];

  // Build heroes registry
  const heroesRegistry: Record<string, HeroCharacter> = {};
  for (const hero of heroes) {
    heroesRegistry[hero.id] = hero;
  }

  // Initialize game with v2 engine (use generated map if available)
  let gs = createInitialGameStateV2(mission, players, gameData, prebuiltMap, {
    heroes: heroesRegistry,
    npcProfiles: gameData.npcProfiles,
  });

  // Place objective points along the combat corridor between deployment zones.
  // Both armies deploy at y~0 on opposite x-edges, so objectives must be at
  // low y-values to be reachable during normal gameplay. Synced with game-store.ts.
  const midX = Math.floor(gs.map.width / 2);
  gs.objectivePoints = [
    {
      id: 'obj-terminal-1',
      position: { x: midX - 5, y: 3 },
      type: 'terminal',
      skillRequired: 'computers',
      alternateSkill: 'mechanics',
      difficulty: 2,
      description: 'Security terminal -- slice to disable base alarms',
      isCompleted: false,
      objectiveId: 'interact-terminals',
    },
    {
      id: 'obj-lock-1',
      position: { x: midX + 3, y: 1 },
      type: 'lock',
      skillRequired: 'skulduggery',
      alternateSkill: 'mechanics',
      difficulty: 2,
      description: 'Reinforced blast door -- bypass the lock mechanism',
      isCompleted: false,
      objectiveId: 'interact-terminals',
    },
    {
      id: 'obj-datapad-1',
      position: { x: midX, y: 5 },
      type: 'datapad',
      skillRequired: 'computers',
      alternateSkill: 'perception',
      difficulty: 2,
      description: 'Encrypted datapad -- extract Imperial troop movements',
      isCompleted: false,
      objectiveId: 'interact-terminals',
    },
  ];

  // Deploy figures
  gs = deployFiguresV2(gs, army, gameData);

  // Track stats
  const roundStats: RoundStats[] = [];
  const moraleTrajectory = { imperial: [12], operative: [12] };
  const actionDistribution: Record<string, number> = {};
  let totalCombats = 0;
  let totalDamage = { imperial: 0, operative: 0 };
  let figuresDefeated = { imperial: 0, operative: 0 };

  // Track wounded events for analysis
  const woundedEvents: Array<{ round: number; figureId: string; name: string }> = [];

  // Advance past Setup
  gs = advancePhaseV2(gs); // Setup -> Initiative

  const maxRounds = mission.roundLimit || 20;
  const maxTotalTurns = 800; // Higher safety valve for v2 (more actions per activation)
  let turnCount = 0;

  while (gs.turnPhase !== 'GameOver' && gs.roundNumber <= maxRounds && turnCount < maxTotalTurns) {
    let roundCombats = 0;
    let roundDmgImp = 0;
    let roundDmgOp = 0;
    let roundDefImp = 0;
    let roundDefOp = 0;
    const roundActions: Record<string, number> = {};
    const currentRound = gs.roundNumber;

    // Advance to Activation
    gs = advancePhaseV2(gs); // Initiative -> Activation

    // Process all activations in this round
    while (
      gs.turnPhase === 'Activation' &&
      gs.currentActivationIndex < gs.activationOrder.length &&
      turnCount < maxTotalTurns
    ) {
      const figure = getCurrentFigureV2(gs);
      if (!figure || figure.isDefeated) {
        gs = advancePhaseV2(gs);
        turnCount++;
        continue;
      }

      // Reset for this activation (1 Action + 1 Maneuver)
      gs = {
        ...gs,
        figures: gs.figures.map(f =>
          f.id === figure.id ? resetForActivation(f) : f
        ),
      };

      const activeFig = gs.figures.find(f => f.id === figure.id)!;

      // AI decides
      const decision = determineActions(activeFig, gs, gameData, profilesData);

      if (verbose) {
        const name = getFigureName(activeFig, gs);
        console.log(
          `  [R${gs.roundNumber}] ${name} (${activeFig.id}): ${decision.reasoning}`
        );
      }

      // Snapshot health before actions
      const healthBefore = new Map<string, { wounds: number; isWounded: boolean; isDefeated: boolean }>();
      for (const f of gs.figures) {
        healthBefore.set(f.id, {
          wounds: f.woundsCurrent,
          isWounded: f.isWounded,
          isDefeated: f.isDefeated,
        });
      }

      // Execute each action
      for (const action of decision.actions) {
        const aType = action.type;
        roundActions[aType] = (roundActions[aType] || 0) + 1;
        actionDistribution[aType] = (actionDistribution[aType] || 0) + 1;

        if (aType === 'Attack') roundCombats++;

        gs = executeActionV2(gs, action, gameData);
      }

      // Calculate damage and track defeats/wounds this activation
      for (const f of gs.figures) {
        const before = healthBefore.get(f.id);
        if (!before) continue;

        const victimSide = gs.players.find(p => p.id === f.playerId)?.role;

        // Track newly wounded heroes
        if (f.isWounded && !before.isWounded) {
          woundedEvents.push({
            round: currentRound,
            figureId: f.id,
            name: getFigureName(f, gs),
          });
          if (verbose) {
            console.log(`    ** ${getFigureName(f, gs)} is now WOUNDED! **`);
          }
        }

        // Track newly defeated
        if (f.isDefeated && !before.isDefeated) {
          if (victimSide === 'Imperial') {
            roundDefOp++;
            figuresDefeated.imperial++;
          } else {
            roundDefImp++;
            figuresDefeated.operative++;
          }

          if (verbose) {
            console.log(`    ** ${getFigureName(f, gs)} DEFEATED! **`);
          }

          // Apply morale change for defeat
          const npc = gs.npcProfiles[f.entityId];
          const heroChar = gs.heroes[f.entityId];
          const tierStr = f.entityType === 'hero' ? 'Hero'
            : (npc?.tier as string) ?? 'Minion';

          const event = tierStr === 'Hero' ? 'heroDefeated' as const
            : tierStr === 'Elite' ? 'eliteDefeated' as const
            : 'figureDefeated' as const;

          if (victimSide === 'Imperial') {
            const change = getMoraleChangeForEvent(event, 'Imperial');
            gs = { ...gs, imperialMorale: applyMoraleChange(gs.imperialMorale, change) };
          } else {
            const change = getMoraleChangeForEvent(event, 'Operative');
            gs = { ...gs, operativeMorale: applyMoraleChange(gs.operativeMorale, change) };
          }
        }

        // Estimate damage (use wound threshold difference for v2)
        // In v2, damage tracking is through woundsCurrent changes
        if (f.woundsCurrent > (before.wounds ?? 0) && !f.isWounded && !before.isWounded) {
          const dmg = f.woundsCurrent - (before.wounds ?? 0);
          if (victimSide === 'Imperial') {
            roundDmgOp += dmg;
            totalDamage.operative += dmg;
          } else {
            roundDmgImp += dmg;
            totalDamage.imperial += dmg;
          }
        }
        // If they became wounded this turn, count damage up to threshold
        if (f.isWounded && !before.isWounded) {
          // They took at least enough to reach threshold from their prior wound count
          // (wounds were reset to 0 on becoming wounded)
          // We approximate damage as what was needed to reach threshold
          const dmg = Math.max(1, before.wounds ?? 0);
          if (victimSide === 'Imperial') {
            roundDmgOp += dmg;
            totalDamage.operative += dmg;
          } else {
            roundDmgImp += dmg;
            totalDamage.imperial += dmg;
          }
        }
      }

      // Mark figure as activated and advance
      gs = {
        ...gs,
        figures: gs.figures.map(f =>
          f.id === figure.id ? { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 } : f
        ),
      };

      // Check mid-activation victory
      const midVictory = checkVictoryV2(gs, mission);
      if (midVictory.winner) {
        gs = { ...gs, winner: midVictory.winner, victoryCondition: midVictory.condition, turnPhase: 'GameOver' };
        break;
      }

      gs = advancePhaseV2(gs);
      turnCount++;
    }

    if (gs.turnPhase === 'GameOver') break;

    // Record round stats
    totalCombats += roundCombats;
    roundStats.push({
      roundNumber: currentRound,
      combatsOccurred: roundCombats,
      damageByImperial: roundDmgImp,
      damageByOperative: roundDmgOp,
      defeatedByImperial: roundDefImp,
      defeatedByOperative: roundDefOp,
      imperialMorale: gs.imperialMorale.value,
      operativeMorale: gs.operativeMorale.value,
      actionsPerType: roundActions,
    });

    moraleTrajectory.imperial.push(gs.imperialMorale.value);
    moraleTrajectory.operative.push(gs.operativeMorale.value);

    // Check victory at end of round
    const victory = checkVictoryV2(gs, mission);
    if (victory.winner) {
      gs = { ...gs, winner: victory.winner, victoryCondition: victory.condition, turnPhase: 'GameOver' };
      break;
    }

    // Status Phase
    if (gs.turnPhase === 'Activation') {
      gs = { ...gs, turnPhase: 'Status' };
    }
    if (gs.turnPhase === 'Status') {
      gs = advancePhaseV2(gs); // Status -> Reinforcement
    }

    // Reinforcement Phase (v2: threat accumulation + unit spawning)
    if (gs.turnPhase === 'Reinforcement') {
      const reinforcement = applyReinforcementPhase(gs, gameData, mission.roundLimit);
      gs = reinforcement.gameState;

      if (verbose && reinforcement.events.length > 0) {
        console.log(`  [R${currentRound}] Reinforcement: +${reinforcement.threatGained} threat, spent ${reinforcement.threatSpent}. Pool: ${reinforcement.newThreatPool}`);
        for (const evt of reinforcement.events) {
          console.log(`    Deployed: ${evt.npcName} at (${evt.position.x},${evt.position.y}) [cost: ${evt.threatCost}]`);
        }
      }

      gs = advancePhaseV2(gs); // Reinforcement -> Initiative (increments round)
    }

    // Advance to next round activation
    if (gs.turnPhase === 'Initiative') {
      gs = advancePhaseV2(gs); // Initiative -> Activation (builds new activation order)
    }

    // Reset all non-defeated figures for new round
    gs = {
      ...gs,
      figures: gs.figures.map(f =>
        f.isDefeated ? f : resetForActivation(f)
      ),
    };

    if (verbose) {
      const aliveImp = gs.figures.filter(f => !f.isDefeated && gs.players.find(p => p.id === f.playerId)?.role === 'Imperial').length;
      const aliveOp = gs.figures.filter(f => !f.isDefeated && gs.players.find(p => p.id === f.playerId)?.role === 'Operative').length;
      const woundedOp = gs.figures.filter(f => f.isWounded && !f.isDefeated && f.entityType === 'hero').length;
      console.log(
        `  Round ${currentRound} complete. Morale: Imp=${gs.imperialMorale.value} Op=${gs.operativeMorale.value} | Alive: Imp=${aliveImp} Op=${aliveOp} | Wounded heroes: ${woundedOp}`
      );
    }
  }

  // Post-loop victory check: catches round-limit condition.
  // The main loop exits when roundNumber > maxRounds, but checkVictoryV2
  // inside the loop only sees roundNumber == maxRounds (not >), so the
  // round-limit condition never fires in-loop.
  if (gs.turnPhase !== 'GameOver') {
    const postLoopVictory = checkVictoryV2(gs, mission);
    if (postLoopVictory.winner) {
      gs = { ...gs, winner: postLoopVictory.winner, victoryCondition: postLoopVictory.condition, turnPhase: 'GameOver' };
    }
  }

  const winner: Side | 'Draw' = gs.winner ?? 'Draw';

  if (verbose) {
    console.log(`\n  Game over: ${winner} wins! (${gs.victoryCondition ?? 'round limit'})`);
    console.log(`  Wounded events: ${woundedEvents.length}`);
    for (const e of woundedEvents) {
      console.log(`    R${e.round}: ${e.name} wounded`);
    }
    const completedObj = gs.objectivePoints.filter(op => op.isCompleted).length;
    console.log(`  Objectives completed: ${completedObj}/${gs.objectivePoints.length}`);
  }

  const objCompleted = gs.objectivePoints.filter(op => op.isCompleted).length;
  const objTotal = gs.objectivePoints.length;

  const stats: GameSimulationResult = {
    gameId: 0,
    seed,
    winner,
    victoryCondition: gs.victoryCondition ?? 'unknown',
    roundsPlayed: gs.roundNumber,
    totalCombats,
    totalDamage,
    figuresDefeated,
    objectivesCompleted: objCompleted,
    objectivesTotal: objTotal,
    roundStats,
    moraleTrajectory,
    actionDistribution,
  };

  return { finalState: gs, stats };
}

// ============================================================================
// BATCH SIMULATION (v2)
// ============================================================================

/**
 * Run multiple v2 games and aggregate statistics.
 */
export function runBatchV2(
  mission: Mission,
  gameData: GameData,
  profilesData: AIProfilesData,
  heroes: HeroCharacter[],
  gameCount: number,
  army?: ArmyCompositionV2,
  baseSeed?: number,
  verbose: boolean = false,
  boardTemplates?: BoardTemplate[],
): BatchSimulationResult {
  const games: GameSimulationResult[] = [];
  const seedStart = baseSeed ?? 42;

  let imperialWins = 0, operativeWins = 0, draws = 0;
  let totalRounds = 0;
  let totalDmgImp = 0, totalDmgOp = 0;
  let totalDefImp = 0, totalDefOp = 0;
  let totalObjectives = 0;
  const victoryConditionCounts: Record<string, number> = {};

  const unitTracker = new Map<string, {
    unitName: string;
    appearances: number;
    totalDamageTaken: number;
    survivals: number;
  }>();

  for (let i = 0; i < gameCount; i++) {
    if (verbose) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`GAME ${i + 1} / ${gameCount} (seed: ${seedStart + i})`);
      console.log(`${'='.repeat(50)}`);
    }

    const { finalState, stats } = simulateGameV2(
      mission,
      gameData,
      profilesData,
      heroes,
      army,
      seedStart + i,
      verbose,
      boardTemplates,
    );

    stats.gameId = i + 1;
    games.push(stats);

    if (stats.winner === 'Imperial') imperialWins++;
    else if (stats.winner === 'Operative') operativeWins++;
    else draws++;

    totalRounds += stats.roundsPlayed;
    totalDmgImp += stats.totalDamage.imperial;
    totalDmgOp += stats.totalDamage.operative;
    totalDefImp += stats.figuresDefeated.imperial;
    totalDefOp += stats.figuresDefeated.operative;
    totalObjectives += stats.objectivesCompleted;
    victoryConditionCounts[stats.victoryCondition] = (victoryConditionCounts[stats.victoryCondition] ?? 0) + 1;

    // Track per-unit stats from final state
    for (const fig of finalState.figures) {
      const name = getFigureName(fig, finalState);
      const key = fig.entityType === 'hero' ? `hero-${fig.entityId}` : fig.entityId;

      if (!unitTracker.has(key)) {
        unitTracker.set(key, {
          unitName: name,
          appearances: 0,
          totalDamageTaken: 0,
          survivals: 0,
        });
      }

      const tracker = unitTracker.get(key)!;
      tracker.appearances++;
      tracker.totalDamageTaken += fig.woundsCurrent;
      if (!fig.isDefeated) tracker.survivals++;
    }

    if (!verbose) {
      // Progress indicator
      process.stdout.write(`  Game ${i + 1}/${gameCount}: ${stats.winner} (${stats.roundsPlayed} rounds)\r`);
    }
  }

  if (!verbose) console.log(); // Clear progress line

  // Build unit performance stats
  const unitPerformance: Record<string, UnitPerformanceStats> = {};
  for (const [unitId, tracker] of Array.from(unitTracker.entries())) {
    unitPerformance[unitId] = {
      unitId,
      unitName: tracker.unitName,
      gamesAppeared: tracker.appearances,
      avgDamageDealt: 0, // Not tracked per-unit in v2 yet
      avgDamageTaken: tracker.totalDamageTaken / Math.max(1, tracker.appearances),
      survivalRate: tracker.survivals / Math.max(1, tracker.appearances),
      avgActivations: 0, // Not tracked per-unit in v2 yet
    };
  }

  return {
    gamesPlayed: gameCount,
    imperialWinRate: imperialWins / gameCount,
    operativeWinRate: operativeWins / gameCount,
    drawRate: draws / gameCount,
    avgRoundsPlayed: totalRounds / gameCount,
    avgDamage: {
      imperial: totalDmgImp / gameCount,
      operative: totalDmgOp / gameCount,
    },
    avgDefeated: {
      imperial: totalDefImp / gameCount,
      operative: totalDefOp / gameCount,
    },
    avgObjectivesCompleted: totalObjectives / gameCount,
    victoryConditionBreakdown: victoryConditionCounts,
    games,
    unitPerformance,
  };
}

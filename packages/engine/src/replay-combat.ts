/**
 * Replay Combat Runner
 *
 * Wraps the combat simulator to capture per-action state snapshots
 * for visual replay. Runs the full combat synchronously (<100ms),
 * records a ReplayFrame after every action and phase transition,
 * then returns a CombatReplay object suitable for animated playback.
 *
 * Architecture: Record-then-Replay (Option C)
 *   - No engine modifications required
 *   - Instant seek to any frame
 *   - Deterministic replay from seed
 *   - JSON-serializable output (no circular refs, no functions)
 */

import type {
  GameState,
  GameData,
  GameMap,
  Mission,
  Player,
  Figure,
  HeroCharacter,
  BoardTemplate,
  Tile,
  GridCoordinate,
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

import {
  buildQuickHero,
  buildArenaMap,
  type CombatScenarioConfig,
} from './ai/combat-simulator.js';

import { createSeededRng, installSeededRandom } from './ai/simulator-v2.js';

// ============================================================================
// REPLAY TYPES
// ============================================================================

/** Snapshot of a single figure at a point in time */
export interface ReplayFigureSnapshot {
  id: string;
  entityId: string;
  entityType: 'hero' | 'npc';
  name: string;
  position: { x: number; y: number };
  playerId: number;
  side: 'A' | 'B';
  woundsCurrent: number;
  woundThreshold: number;
  isWounded: boolean;
  isDefeated: boolean;
  conditions: string[];
  /** Resolved portrait ID (figure override -> hero/NPC default). */
  portraitId?: string;
  /** Physical base size for token sizing. */
  baseSize?: string;
  /** Silhouette hint inferred from NPC keywords (e.g. 'droid', 'vehicle'). */
  silhouetteHint?: string;
}

/** A single frame in the replay timeline */
export interface ReplayFrame {
  frameIndex: number;
  roundNumber: number;
  phaseLabel: string;
  actionText: string;
  executingFigureId: string | null;
  figures: ReplayFigureSnapshot[];
  /** Line from attacker to target (for Attack actions) */
  attackLine?: { from: GridCoordinate; to: GridCoordinate };
  /** Movement path tiles (for Move actions) */
  movePath?: GridCoordinate[];
}

/** Complete combat replay data, fully JSON-serializable */
export interface CombatReplay {
  scenarioName: string;
  sideALabel: string;
  sideBLabel: string;
  arenaWidth: number;
  arenaHeight: number;
  /** Static map terrain (same for all frames) */
  tiles: Tile[][];
  deploymentZones: { imperial: GridCoordinate[]; operative: GridCoordinate[] };
  frames: ReplayFrame[];
  winner: 'sideA' | 'sideB' | 'draw';
  winnerLabel: string;
  totalRounds: number;
  seed: number;
}

// ============================================================================
// REPLAY RECORDER
// ============================================================================

class ReplayRecorder {
  public frames: ReplayFrame[] = [];
  private figureSideMap: Map<string, 'A' | 'B'>;
  private gs: GameState | null;

  constructor(
    private gameData: GameData,
    figureSideMap: Map<string, 'A' | 'B'>,
  ) {
    this.figureSideMap = figureSideMap;
    this.gs = null; // set via setGameState before first record
  }

  setGameState(gs: GameState): void {
    this.gs = gs;
  }

  private get state(): GameState {
    if (!this.gs) throw new Error('ReplayRecorder: setGameState must be called before recording');
    return this.gs;
  }

  private snapshotFigures(): ReplayFigureSnapshot[] {
    return this.state.figures.map(f => {
      // Resolve portrait ID: figure override -> hero/NPC default
      let portraitId = f.portraitId;
      let baseSize = f.baseSize;
      let silhouetteHint: string | undefined;

      if (f.entityType === 'hero') {
        const hero = this.state.heroes?.[f.entityId];
        if (!portraitId && hero?.portraitId) portraitId = hero.portraitId;
        if (!baseSize && f.baseSize) baseSize = f.baseSize;
      } else {
        const npc = this.gameData.npcProfiles[f.entityId];
        if (!portraitId && npc?.defaultPortraitId) portraitId = npc.defaultPortraitId;
        if (!baseSize && npc?.baseSize) baseSize = npc.baseSize;
        // Infer silhouette hint from NPC keywords
        if (npc?.keywords && npc.keywords.length > 0) {
          silhouetteHint = npc.keywords[0]; // primary keyword as hint
        }
      }

      return {
        id: f.id,
        entityId: f.entityId,
        entityType: f.entityType,
        name: getFigureName(f, this.state),
        position: { x: f.position.x, y: f.position.y },
        playerId: f.playerId,
        side: this.figureSideMap.get(f.id) ?? 'A',
        woundsCurrent: f.woundsCurrent,
        woundThreshold: f.entityType === 'npc'
          ? (this.gameData.npcProfiles[f.entityId]?.woundThreshold ?? 4)
          : 10,
        isWounded: f.isWounded,
        isDefeated: f.isDefeated,
        conditions: [...f.conditions],
        portraitId,
        baseSize,
        silhouetteHint,
      };
    });
  }

  recordPhase(phaseLabel: string): void {
    this.frames.push({
      frameIndex: this.frames.length,
      roundNumber: this.state.roundNumber,
      phaseLabel,
      actionText: phaseLabel,
      executingFigureId: null,
      figures: this.snapshotFigures(),
    });
  }

  recordAction(
    figureId: string,
    actionText: string,
    options?: {
      attackLine?: { from: GridCoordinate; to: GridCoordinate };
      movePath?: GridCoordinate[];
    },
  ): void {
    this.frames.push({
      frameIndex: this.frames.length,
      roundNumber: this.state.roundNumber,
      phaseLabel: `Activation`,
      actionText,
      executingFigureId: figureId,
      figures: this.snapshotFigures(),
      attackLine: options?.attackLine,
      movePath: options?.movePath,
    });
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run a single combat and return a full replay for visual playback.
 *
 * Uses the same combat loop as combat-simulator.ts executeCombat(),
 * but captures a ReplayFrame after every action and phase transition.
 */
export function runCombatWithReplay(
  scenario: CombatScenarioConfig,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  seed?: number,
): CombatReplay {
  const actualSeed = seed ?? scenario.simulation.seed ?? 42;
  const rng = createSeededRng(actualSeed);
  const restoreRandom = installSeededRandom(rng);

  try {
    return executeReplayCombat(scenario, gameData, profilesData, boardTemplates, actualSeed);
  } finally {
    restoreRandom();
  }
}

function executeReplayCombat(
  scenario: CombatScenarioConfig,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  seed: number,
): CombatReplay {
  // ========================================================================
  // SETUP (identical to combat-simulator.ts executeCombat)
  // ========================================================================

  // Build heroes from specs
  const heroRegistry: Record<string, HeroCharacter> = {};

  for (const figSpec of [...scenario.sideA.figures, ...scenario.sideB.figures]) {
    if (figSpec.type === 'hero') {
      const hero = buildQuickHero(figSpec.spec, gameData);
      if (figSpec.heroId) hero.id = figSpec.heroId;
      heroRegistry[hero.id] = hero;
    }
  }

  // Build army composition (Side A = Imperial, Side B = Operative)
  const cleanArmy: ArmyCompositionV2 = {
    imperial: [],
    operative: [],
  };

  for (const figSpec of scenario.sideA.figures) {
    if (figSpec.type === 'npc') {
      cleanArmy.imperial.push({ npcId: figSpec.npcId, count: figSpec.count });
    } else if (figSpec.type === 'hero') {
      const heroId = figSpec.heroId ?? `hero-${figSpec.spec.name.toLowerCase().replace(/\s+/g, '-')}`;
      cleanArmy.operative.push({
        entityType: 'hero' as const,
        entityId: heroId,
        count: 1,
      });
    }
  }

  for (const figSpec of scenario.sideB.figures) {
    if (figSpec.type === 'npc') {
      cleanArmy.imperial.push({ npcId: figSpec.npcId, count: figSpec.count });
    } else if (figSpec.type === 'hero') {
      const heroId = figSpec.heroId ?? `hero-${figSpec.spec.name.toLowerCase().replace(/\s+/g, '-')}`;
      cleanArmy.operative.push({
        entityType: 'hero' as const,
        entityId: heroId,
        count: 1,
      });
    }
  }

  // Players
  const players: Player[] = [
    { id: 0, name: scenario.sideA.label, role: 'Imperial', isLocal: true, isAI: true },
    { id: 1, name: scenario.sideB.label, role: 'Operative', isLocal: true, isAI: true },
  ];

  // Arena map
  const arenaMap = buildArenaMap(scenario.arena, boardTemplates, seed);

  // Combat-only mission
  const roundLimit = scenario.simulation.roundLimit ?? 20;
  const combatMission: Mission = {
    id: `combat-${scenario.id}`,
    name: scenario.name,
    description: scenario.description ?? 'Arena combat',
    mapId: 'arena',
    roundLimit,
    imperialThreat: 0,
    imperialReinforcementPoints: 0,
    victoryConditions: [
      { side: 'Imperial', description: 'Defeat all enemies', condition: 'allEnemiesDefeated' },
      { side: 'Operative', description: 'Defeat all enemies', condition: 'allEnemiesDefeated' },
    ],
  };

  // Initialize game state
  let gs = createInitialGameStateV2(combatMission, players, gameData, arenaMap, {
    heroes: heroRegistry,
    npcProfiles: gameData.npcProfiles,
  });

  // Deploy figures
  gs = deployFiguresV2(gs, cleanArmy, gameData);

  // Build side map
  const figureSideMap = new Map<string, 'A' | 'B'>();
  for (const fig of gs.figures) {
    const player = gs.players.find(p => p.id === fig.playerId);
    figureSideMap.set(fig.id, player?.role === 'Imperial' ? 'A' : 'B');
  }

  // Disable morale unless explicitly enabled
  if (!scenario.simulation.morale) {
    gs = {
      ...gs,
      imperialMorale: { ...gs.imperialMorale, value: 99, max: 99 },
      operativeMorale: { ...gs.operativeMorale, value: 99, max: 99 },
    };
  }

  // ========================================================================
  // REPLAY RECORDER
  // ========================================================================

  const recorder = new ReplayRecorder(gameData, figureSideMap);
  recorder.setGameState(gs);

  // Record initial deployment
  recorder.recordPhase('Deployment complete');

  // ========================================================================
  // COMBAT LOOP (with replay recording)
  // ========================================================================

  // Advance past Setup
  gs = advancePhaseV2(gs);
  recorder.setGameState(gs);

  const maxTotalTurns = 500;
  let turnCount = 0;

  while (gs.turnPhase !== 'GameOver' && gs.roundNumber <= roundLimit && turnCount < maxTotalTurns) {
    const currentRound = gs.roundNumber;

    // Record round start
    recorder.recordPhase(`Round ${currentRound} begins`);

    // Advance to Activation
    gs = advancePhaseV2(gs);
    recorder.setGameState(gs);

    // Process all activations
    while (
      gs.turnPhase === 'Activation' &&
      gs.currentActivationIndex < gs.activationOrder.length &&
      turnCount < maxTotalTurns
    ) {
      const figure = getCurrentFigureV2(gs);
      if (!figure || figure.isDefeated) {
        gs = advancePhaseV2(gs);
        recorder.setGameState(gs);
        turnCount++;
        continue;
      }

      // Reset for activation
      gs = {
        ...gs,
        figures: gs.figures.map(f =>
          f.id === figure.id ? resetForActivation(f) : f
        ),
      };

      const activeFig = gs.figures.find(f => f.id === figure.id)!;
      const figureName = getFigureName(activeFig, gs);

      // Record activation start
      recorder.setGameState(gs);
      recorder.recordPhase(`${figureName} activates`);

      // Snapshot health before
      const healthBefore = new Map<string, { wounds: number; isWounded: boolean; isDefeated: boolean }>();
      for (const f of gs.figures) {
        healthBefore.set(f.id, { wounds: f.woundsCurrent, isWounded: f.isWounded, isDefeated: f.isDefeated });
      }

      // AI decision
      const decision = determineActions(activeFig, gs, gameData, profilesData);

      // Execute actions (recording each one)
      for (const action of decision.actions) {
        const prevPositions = new Map(gs.figures.map(f => [f.id, { ...f.position }]));

        gs = executeActionV2(gs, action, gameData);
        recorder.setGameState(gs);

        // Build action text and visualization data
        let actionText = '';
        let attackLine: { from: GridCoordinate; to: GridCoordinate } | undefined;
        let movePath: GridCoordinate[] | undefined;

        switch (action.type) {
          case 'Move': {
            const endPos = gs.figures.find(f => f.id === figure.id)?.position;
            actionText = `${figureName} moves to (${endPos?.x}, ${endPos?.y})`;
            movePath = action.payload?.path;
            break;
          }
          case 'Attack': {
            const target = gs.figures.find(f => f.id === action.payload?.targetId);
            const targetName = target ? getFigureName(target, gs) : 'unknown';
            const beforeHP = healthBefore.get(action.payload?.targetId ?? '');
            const afterHP = target;

            let dmgText = '';
            if (target && beforeHP) {
              if (target.isDefeated && !beforeHP.isDefeated) {
                dmgText = ' -- DEFEATED!';
              } else if (target.isWounded && !beforeHP.isWounded) {
                dmgText = ' -- WOUNDED!';
              } else {
                const dmg = (target.woundsCurrent ?? 0) - (beforeHP.wounds ?? 0);
                if (dmg > 0) dmgText = ` for ${dmg} damage`;
                else dmgText = ' -- miss!';
              }
            }

            actionText = `${figureName} attacks ${targetName}${dmgText}`;

            // Attack line from attacker to target
            const attackerPos = gs.figures.find(f => f.id === figure.id)?.position;
            const targetPos = target?.position;
            if (attackerPos && targetPos) {
              attackLine = {
                from: { x: attackerPos.x, y: attackerPos.y },
                to: { x: targetPos.x, y: targetPos.y },
              };
            }
            break;
          }
          case 'Rally':
            actionText = `${figureName} rallies (recovers strain)`;
            break;
          case 'GuardedStance':
            actionText = `${figureName} takes a guarded stance`;
            break;
          case 'TakeCover':
            actionText = `${figureName} takes cover`;
            break;
          case 'Aim':
            actionText = `${figureName} aims`;
            break;
          case 'StrainForManeuver':
            actionText = `${figureName} pushes through (strain for maneuver)`;
            break;
          default:
            actionText = `${figureName} performs ${action.type}`;
        }

        recorder.recordAction(figure.id, actionText, { attackLine, movePath });

        // Check for newly defeated figures and record
        for (const f of gs.figures) {
          const before = healthBefore.get(f.id);
          if (before && f.isDefeated && !before.isDefeated) {
            const defeatedName = getFigureName(f, gs);
            recorder.recordAction(f.id, `${defeatedName} has been defeated!`);
          }
        }
      }

      // Mark activated
      gs = {
        ...gs,
        figures: gs.figures.map(f =>
          f.id === figure.id ? { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 } : f
        ),
      };
      recorder.setGameState(gs);

      // Mid-activation victory check
      const midVictory = checkVictoryV2(gs, combatMission);
      if (midVictory.winner) {
        gs = { ...gs, winner: midVictory.winner, victoryCondition: midVictory.condition, turnPhase: 'GameOver' };
        recorder.setGameState(gs);
        break;
      }

      gs = advancePhaseV2(gs);
      recorder.setGameState(gs);
      turnCount++;
    }

    if (gs.turnPhase === 'GameOver') break;

    // End-of-round victory check
    const victory = checkVictoryV2(gs, combatMission);
    if (victory.winner) {
      gs = { ...gs, winner: victory.winner, victoryCondition: victory.condition, turnPhase: 'GameOver' };
      recorder.setGameState(gs);
      break;
    }

    // Advance through Status -> Reinforcement -> Initiative
    if (gs.turnPhase === 'Activation') gs = { ...gs, turnPhase: 'Status' };
    if (gs.turnPhase === 'Status') gs = advancePhaseV2(gs);
    if (gs.turnPhase === 'Reinforcement') gs = advancePhaseV2(gs);
    if (gs.turnPhase === 'Initiative') gs = advancePhaseV2(gs);

    // Reset all figures
    gs = {
      ...gs,
      figures: gs.figures.map(f => f.isDefeated ? f : resetForActivation(f)),
    };
    recorder.setGameState(gs);
  }

  // Post-loop victory check
  if (gs.turnPhase !== 'GameOver') {
    const postVictory = checkVictoryV2(gs, combatMission);
    if (postVictory.winner) {
      gs = { ...gs, winner: postVictory.winner, victoryCondition: postVictory.condition, turnPhase: 'GameOver' };
    }
  }

  // Record final state
  recorder.setGameState(gs);

  // Determine winner
  let winner: 'sideA' | 'sideB' | 'draw';
  if (gs.winner === 'Imperial') winner = 'sideA';
  else if (gs.winner === 'Operative') winner = 'sideB';
  else winner = 'draw';

  const winnerLabel = winner === 'sideA' ? scenario.sideA.label
    : winner === 'sideB' ? scenario.sideB.label
    : 'Draw';

  recorder.recordPhase(`${winnerLabel} wins!`);

  // ========================================================================
  // BUILD REPLAY OBJECT
  // ========================================================================

  return {
    scenarioName: scenario.name,
    sideALabel: scenario.sideA.label,
    sideBLabel: scenario.sideB.label,
    arenaWidth: arenaMap.width,
    arenaHeight: arenaMap.height,
    tiles: arenaMap.tiles,
    deploymentZones: arenaMap.deploymentZones,
    frames: recorder.frames,
    winner,
    winnerLabel,
    totalRounds: gs.roundNumber,
    seed,
  };
}

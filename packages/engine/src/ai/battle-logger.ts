/**
 * AI System - Structured Battle Logger
 *
 * Collects granular, machine-readable data during AI-vs-AI games.
 * The output JSON is designed to be fed back to an LLM or analysis script
 * for diagnosing AI behavior quality.
 *
 * Three-level hierarchy:
 *   BattleLog (game) -> RoundLog[] -> ActivationLog[]
 *
 * Each activation captures: figure state, AI decision details,
 * actions executed, damage dealt/received, position deltas, and
 * distances to all enemies before and after.
 */

import type {
  Figure,
  GameState,
  GameData,
  GameAction,
  GridCoordinate,
  Side,
  HeroCharacter,
  NPCProfile,
} from '../types.js';

import type {
  AIDecisionResult,
  AIArchetypeProfile,
} from './types.js';

import { getDistance } from '../movement.js';
import { getCover } from '../los.js';

// ============================================================================
// V2 FIGURE HELPERS (inlined to avoid circular deps with turn-machine-v2)
// ============================================================================

function getWoundThreshold(fig: Figure, gs: GameState): number {
  if (fig.entityType === 'hero') {
    const hero = gs.heroes[fig.entityId];
    return hero?.wounds.threshold ?? 10;
  }
  const npc = gs.npcProfiles[fig.entityId];
  return npc?.woundThreshold ?? 4;
}

function getCurrentHealth(fig: Figure, gs: GameState): number {
  const threshold = getWoundThreshold(fig, gs);
  return Math.max(0, threshold - fig.woundsCurrent);
}

function getFigureEntityName(fig: Figure, gs: GameState): string {
  if (fig.entityType === 'hero') {
    const hero = gs.heroes[fig.entityId];
    return hero?.name ?? fig.entityId;
  }
  const npc = gs.npcProfiles[fig.entityId];
  return npc?.name ?? fig.entityId;
}

// ============================================================================
// LOG TYPES
// ============================================================================

export interface BattleLog {
  version: '1.0';
  timestamp: string;
  mapSize: { width: number; height: number };
  boardLayout: string; // e.g. "3x3 Skirmish"
  roundLimit: number;

  armies: {
    imperial: ArmyEntry[];
    operative: ArmyEntry[];
  };

  result: {
    winner: string; // 'Imperial' | 'Operative' | 'Draw'
    condition: string; // e.g. 'allEnemiesDefeated' | 'Round limit reached'
    roundsPlayed: number;
    totalDamageByImperial: number;
    totalDamageByOperative: number;
    imperialUnitsDestroyed: number;
    operativeUnitsDestroyed: number;
    finalMorale: { imperial: number; operative: number };
  };

  rounds: RoundLog[];
}

export interface ArmyEntry {
  figureId: string;
  unitId: string;
  unitName: string;
  archetype: string;
  maxHealth: number;
  startPosition: GridCoordinate;
}

export interface ReinforcementLogEntry {
  npcId: string;
  npcName: string;
  figureId: string;
  position: { x: number; y: number };
  threatCost: number;
}

export interface RoundReinforcementLog {
  threatGained: number;
  threatSpent: number;
  threatPoolAfter: number;
  unitsDeployed: ReinforcementLogEntry[];
}

export interface RoundLog {
  roundNumber: number;
  activations: ActivationLog[];
  reinforcements?: RoundReinforcementLog;

  /** Snapshot at end of round */
  endOfRoundSnapshot: {
    imperialMorale: number;
    operativeMorale: number;
    figureStates: FigureSnapshot[];
  };
}

export interface FigureSnapshot {
  figureId: string;
  unitId: string;
  side: string;
  position: GridCoordinate;
  currentHealth: number;
  maxHealth: number;
  isWounded: boolean;
  isDefeated: boolean;
}

export interface ActivationLog {
  roundNumber: number;
  activationIndex: number;

  figure: {
    id: string;
    unitId: string;
    unitName: string;
    side: string;
    archetype: string;
  };

  /** State at activation start */
  before: {
    position: GridCoordinate;
    health: number;
    maxHealth: number;
    isWounded: boolean;
    enemyDistances: EnemyDistance[];
    coverAtPosition: string;
  };

  /** AI decision details */
  decision: {
    matchedRuleRank: number;
    matchedRuleCondition: string;
    matchedRuleAction: string;
    matchedRuleCardText: string;
    reasoning: string;
    actionCount: number;
  };

  /** Actions executed and their outcomes */
  actions: ActionLog[];

  /** State after all actions executed */
  after: {
    position: GridCoordinate;
    health: number;
    isWounded: boolean;
    enemyDistances: EnemyDistance[];
    coverAtPosition: string;
  };

  /** Damage dealt/received during this activation */
  damageDealt: DamageEntry[];
  damageReceived: number;

  /** Computed metrics for analysis */
  metrics: {
    distanceClosed: number; // positive = moved closer to nearest enemy
    tilesMovedTotal: number;
    attacksMade: number;
    totalDamageDealt: number;
    kills: string[]; // figure IDs killed this activation
  };
}

export interface EnemyDistance {
  figureId: string;
  unitId: string;
  distance: number;
  health: number;
  isDefeated: boolean;
}

export interface ActionLog {
  type: string; // 'Move' | 'Attack' | 'Rest' | 'Overwatch'
  details: string; // Human-readable description
  /** Move-specific */
  path?: GridCoordinate[];
  destination?: GridCoordinate;
  /** Attack-specific */
  targetId?: string;
  targetUnitName?: string;
  damageDealt?: number;
  targetHealthBefore?: number;
  targetHealthAfter?: number;
  targetWounded?: boolean;
  targetDefeated?: boolean;
}

export interface DamageEntry {
  targetId: string;
  targetUnitName: string;
  damage: number;
  killed: boolean;
}

// ============================================================================
// BATTLE LOGGER CLASS
// ============================================================================

/**
 * Stateful logger that accumulates data during a game.
 * Call methods in order: startGame -> startRound -> logActivation (repeated) -> endRound (repeated) -> endGame.
 * Then call getLog() to extract the complete BattleLog.
 */
export class BattleLogger {
  private log: BattleLog;
  private currentRound: RoundLog | null = null;
  private activationCounter = 0;
  private totalDmgImp = 0;
  private totalDmgOp = 0;
  private impDestroyed = 0;
  private opDestroyed = 0;

  constructor() {
    this.log = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      mapSize: { width: 0, height: 0 },
      boardLayout: '',
      roundLimit: 0,
      armies: { imperial: [], operative: [] },
      result: {
        winner: '',
        condition: '',
        roundsPlayed: 0,
        totalDamageByImperial: 0,
        totalDamageByOperative: 0,
        imperialUnitsDestroyed: 0,
        operativeUnitsDestroyed: 0,
        finalMorale: { imperial: 0, operative: 0 },
      },
      rounds: [],
    };
  }

  // ------------------------------------------------------------------
  // GAME LIFECYCLE
  // ------------------------------------------------------------------

  startGame(
    gs: GameState,
    gameData: GameData,
    archetypeMap: Record<string, string>, // figureId -> archetype name
    roundLimit: number,
    boardLayout: string
  ): void {
    this.log.timestamp = new Date().toISOString();
    this.log.mapSize = { width: gs.map.width, height: gs.map.height };
    this.log.boardLayout = boardLayout;
    this.log.roundLimit = roundLimit;

    for (const fig of gs.figures) {
      const player = gs.players.find(p => p.id === fig.playerId);
      const side = player?.role ?? 'Unknown';
      const entry: ArmyEntry = {
        figureId: fig.id,
        unitId: fig.entityId,
        unitName: getFigureEntityName(fig, gs),
        archetype: archetypeMap[fig.id] ?? 'unknown',
        maxHealth: getWoundThreshold(fig, gs),
        startPosition: { ...fig.position },
      };

      if (side === 'Imperial') {
        this.log.armies.imperial.push(entry);
      } else {
        this.log.armies.operative.push(entry);
      }
    }
  }

  startRound(roundNumber: number): void {
    this.currentRound = {
      roundNumber,
      activations: [],
      endOfRoundSnapshot: {
        imperialMorale: 0,
        operativeMorale: 0,
        figureStates: [],
      },
    };
    this.activationCounter = 0;
  }

  endRound(gs: GameState): void {
    if (!this.currentRound) return;

    this.currentRound.endOfRoundSnapshot = {
      imperialMorale: gs.imperialMorale.value,
      operativeMorale: gs.operativeMorale.value,
      figureStates: gs.figures.map(f => {
        const player = gs.players.find(p => p.id === f.playerId);
        return {
          figureId: f.id,
          unitId: f.entityId,
          side: player?.role ?? 'Unknown',
          position: { ...f.position },
          currentHealth: getCurrentHealth(f, gs),
          maxHealth: getWoundThreshold(f, gs),
          isWounded: f.isWounded,
          isDefeated: f.isDefeated,
        };
      }),
    };

    this.log.rounds.push(this.currentRound);
    this.currentRound = null;
  }

  /**
   * Log reinforcement events for the current round.
   * Called from useAITurn after applyReinforcementPhase runs.
   */
  logReinforcement(result: {
    events: Array<{ npcId: string; npcName: string; figureId: string; position: { x: number; y: number }; threatCost: number }>;
    threatSpent: number;
    threatGained: number;
    newThreatPool: number;
  }): void {
    // Attach to the most recent round log
    const lastRound = this.log.rounds[this.log.rounds.length - 1];
    if (lastRound) {
      lastRound.reinforcements = {
        threatGained: result.threatGained,
        threatSpent: result.threatSpent,
        threatPoolAfter: result.newThreatPool,
        unitsDeployed: result.events.map(e => ({
          npcId: e.npcId,
          npcName: e.npcName,
          figureId: e.figureId,
          position: { ...e.position },
          threatCost: e.threatCost,
        })),
      };
    }
  }

  endGame(
    winner: string,
    condition: string,
    gs: GameState
  ): void {
    this.log.result = {
      winner,
      condition,
      roundsPlayed: gs.roundNumber,
      totalDamageByImperial: this.totalDmgImp,
      totalDamageByOperative: this.totalDmgOp,
      imperialUnitsDestroyed: this.impDestroyed,
      operativeUnitsDestroyed: this.opDestroyed,
      finalMorale: {
        imperial: gs.imperialMorale.value,
        operative: gs.operativeMorale.value,
      },
    };

    // Close any open round
    if (this.currentRound) {
      this.endRound(gs);
    }
  }

  // ------------------------------------------------------------------
  // ACTIVATION LOGGING
  // ------------------------------------------------------------------

  /**
   * Log a complete figure activation.
   *
   * Call this after the AI has decided and all actions have been executed.
   * Pass the game states BEFORE and AFTER the activation so the logger
   * can compute deltas.
   */
  logActivation(
    figure: Figure,
    gsBefore: GameState,
    gsAfter: GameState,
    gameData: GameData,
    decision: AIDecisionResult,
    profile: AIArchetypeProfile,
    executedActions: GameAction[],
    actionDescriptions: string[]
  ): void {
    if (!this.currentRound) return;

    const playerBefore = gsBefore.players.find(p => p.id === figure.playerId);
    const side = playerBefore?.role ?? 'Unknown';
    const unitName = getFigureEntityName(figure, gsBefore);

    // Figure state before
    const figBefore = gsBefore.figures.find(f => f.id === figure.id)!;
    const figAfter = gsAfter.figures.find(f => f.id === figure.id)!;

    // Enemy distances before and after
    const enemiesBefore = gsBefore.figures.filter(
      f => !f.isDefeated && f.playerId !== figure.playerId
    );
    const enemiesAfter = gsAfter.figures.filter(
      f => f.playerId !== figure.playerId
    );

    const enemyDistBefore: EnemyDistance[] = enemiesBefore.map(e => ({
      figureId: e.id,
      unitId: e.entityId,
      distance: getDistance(figBefore.position, e.position),
      health: getCurrentHealth(e, gsBefore),
      isDefeated: e.isDefeated,
    }));

    const enemyDistAfter: EnemyDistance[] = enemiesAfter.map(e => ({
      figureId: e.id,
      unitId: e.entityId,
      distance: getDistance(figAfter.position, e.position),
      health: getCurrentHealth(e, gsAfter),
      isDefeated: e.isDefeated,
    }));

    // Cover at positions
    const coverBefore = getCoverAtPosition(figBefore.position, gsBefore);
    const coverAfter = getCoverAtPosition(figAfter.position, gsAfter);

    // Build action logs with damage tracking
    const actionLogs: ActionLog[] = [];
    const damageDealt: DamageEntry[] = [];
    let damageReceived = 0;
    let totalDmg = 0;
    let attackCount = 0;
    let tilesMovedTotal = 0;
    const kills: string[] = [];

    // Track health changes across all enemies (v2: health = threshold - woundsCurrent)
    const healthBefore = new Map<string, number>();
    for (const f of gsBefore.figures) {
      healthBefore.set(f.id, getCurrentHealth(f, gsBefore));
    }

    for (let i = 0; i < executedActions.length; i++) {
      const action = executedActions[i];
      const desc = actionDescriptions[i] ?? action.type;

      const actionLog: ActionLog = {
        type: action.type,
        details: desc,
      };

      if (action.type === 'Move' && action.payload?.path) {
        actionLog.path = action.payload.path;
        actionLog.destination = action.payload.path[action.payload.path.length - 1];
        tilesMovedTotal += action.payload.path.length - 1; // path includes start
      }

      if (action.type === 'Attack' && action.payload?.targetId) {
        attackCount++;
        const targetId = action.payload.targetId;
        const targetBefore = gsBefore.figures.find(f => f.id === targetId);
        const targetAfter = gsAfter.figures.find(f => f.id === targetId);
        const targetName = targetBefore ? getFigureEntityName(targetBefore, gsBefore) : targetId;

        actionLog.targetId = targetId;
        actionLog.targetUnitName = targetName;

        if (targetBefore && targetAfter) {
          const hpBefore = healthBefore.get(targetId) ?? getCurrentHealth(targetBefore, gsBefore);
          const hpAfter = getCurrentHealth(targetAfter, gsAfter);
          const dmg = Math.max(0, hpBefore - hpAfter);
          actionLog.targetHealthBefore = hpBefore;
          actionLog.targetHealthAfter = hpAfter;
          actionLog.damageDealt = dmg;
          actionLog.targetWounded = targetAfter.isWounded && !targetBefore.isWounded;
          actionLog.targetDefeated = targetAfter.isDefeated && !targetBefore.isDefeated;

          if (dmg > 0) {
            totalDmg += dmg;
            damageDealt.push({
              targetId,
              targetUnitName: targetName,
              damage: dmg,
              killed: actionLog.targetDefeated ?? false,
            });

            if (actionLog.targetDefeated) {
              kills.push(targetId);
              // Track destroyed counts
              const targetPlayer = gsBefore.players.find(p => p.id === targetBefore.playerId);
              if (targetPlayer?.role === 'Imperial') this.impDestroyed++;
              else this.opDestroyed++;
            }

            // Attribute damage to the correct side
            if (side === 'Imperial') this.totalDmgImp += dmg;
            else this.totalDmgOp += dmg;
          }

          // Update health tracking for multi-action damage
          healthBefore.set(targetId, hpAfter);
        }
      }

      actionLogs.push(actionLog);
    }

    // Check if this figure took damage (from overwatch or other sources)
    const selfHpBefore = getCurrentHealth(figBefore, gsBefore);
    const selfHpAfter = getCurrentHealth(figAfter, gsAfter);
    damageReceived = Math.max(0, selfHpBefore - selfHpAfter);

    // Distance closed = decrease in distance to nearest enemy
    const nearestBefore = Math.min(
      ...enemyDistBefore.map(e => e.distance),
      Infinity
    );
    const nearestAfter = Math.min(
      ...enemyDistAfter.filter(e => !e.isDefeated).map(e => e.distance),
      Infinity
    );
    const distanceClosed = nearestBefore === Infinity ? 0 :
      nearestAfter === Infinity ? 0 :
      nearestBefore - nearestAfter;

    const activation: ActivationLog = {
      roundNumber: this.currentRound.roundNumber,
      activationIndex: this.activationCounter++,
      figure: {
        id: figure.id,
        unitId: figure.entityId,
        unitName,
        side,
        archetype: profile.name,
      },
      before: {
        position: { ...figBefore.position },
        health: getCurrentHealth(figBefore, gsBefore),
        maxHealth: getWoundThreshold(figBefore, gsBefore),
        isWounded: figBefore.isWounded,
        enemyDistances: enemyDistBefore,
        coverAtPosition: coverBefore,
      },
      decision: {
        matchedRuleRank: decision.matchedRule.rank,
        matchedRuleCondition: decision.matchedRule.condition,
        matchedRuleAction: decision.matchedRule.action,
        matchedRuleCardText: decision.matchedRule.cardText,
        reasoning: decision.reasoning,
        actionCount: executedActions.length,
      },
      actions: actionLogs,
      after: {
        position: { ...figAfter.position },
        health: getCurrentHealth(figAfter, gsAfter),
        isWounded: figAfter.isWounded,
        enemyDistances: enemyDistAfter,
        coverAtPosition: coverAfter,
      },
      damageDealt,
      damageReceived,
      metrics: {
        distanceClosed,
        tilesMovedTotal,
        attacksMade: attackCount,
        totalDamageDealt: totalDmg,
        kills,
      },
    };

    this.currentRound.activations.push(activation);
  }

  // ------------------------------------------------------------------
  // OUTPUT
  // ------------------------------------------------------------------

  getLog(): BattleLog {
    return this.log;
  }

  /**
   * Serialize the log as a formatted JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.log, null, 2);
  }

  /**
   * Generate a concise text summary suitable for quick review.
   */
  toSummary(): string {
    const r = this.log.result;
    const lines: string[] = [];

    lines.push(`=== BATTLE LOG SUMMARY ===`);
    lines.push(`Map: ${this.log.mapSize.width}x${this.log.mapSize.height} (${this.log.boardLayout})`);
    lines.push(`Result: ${r.winner} wins (${r.condition}) in ${r.roundsPlayed} rounds`);
    lines.push(`Damage: Imperial dealt ${r.totalDamageByImperial}, Operative dealt ${r.totalDamageByOperative}`);
    lines.push(`Destroyed: ${r.imperialUnitsDestroyed} Imperial, ${r.operativeUnitsDestroyed} Operative`);
    lines.push(`Final Morale: Imperial ${r.finalMorale.imperial}, Operative ${r.finalMorale.operative}`);
    lines.push('');

    for (const round of this.log.rounds) {
      lines.push(`--- Round ${round.roundNumber} ---`);
      for (const act of round.activations) {
        const m = act.metrics;
        const dmgStr = m.totalDamageDealt > 0
          ? ` dealt ${m.totalDamageDealt} dmg`
          : '';
        const killStr = m.kills.length > 0
          ? ` KILLED ${m.kills.join(', ')}`
          : '';
        const moveStr = m.tilesMovedTotal > 0
          ? ` moved ${m.tilesMovedTotal} tiles (closed ${m.distanceClosed.toFixed(0)})`
          : '';
        lines.push(
          `  [${act.figure.side}] ${act.figure.unitName} (${act.figure.archetype}):` +
          ` Rule#${act.decision.matchedRuleRank} ${act.decision.matchedRuleCondition}` +
          `${moveStr}${dmgStr}${killStr}`
        );
      }

      const snap = round.endOfRoundSnapshot;
      const alive = snap.figureStates.filter(f => !f.isDefeated);
      const wounded = snap.figureStates.filter(f => f.isWounded && !f.isDefeated);
      const impAlive = alive.filter(f => f.side === 'Imperial').length;
      const opAlive = alive.filter(f => f.side === 'Operative').length;
      const woundedStr = wounded.length > 0
        ? ` | Wounded: ${wounded.map(f => f.unitId).join(', ')}`
        : '';
      lines.push(`  >> Units: Imp ${impAlive} alive, Op ${opAlive} alive | Morale: Imp ${snap.imperialMorale}, Op ${snap.operativeMorale}${woundedStr}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getCoverAtPosition(pos: GridCoordinate, gs: GameState): string {
  const tile = gs.map.tiles[pos.y]?.[pos.x];
  if (!tile) return 'None';
  if (tile.terrain === 'HeavyCover' || tile.cover === 'Heavy') return 'Heavy';
  if (tile.terrain === 'LightCover' || tile.cover === 'Light') return 'Light';
  return 'None';
}

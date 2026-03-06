/**
 * Tests for battle-logger.ts -- BattleLogger class.
 *
 * Covers:
 * - Constructor + initial state
 * - startGame: army registration, map size, layout
 * - startRound / endRound: round lifecycle, end-of-round snapshot
 * - logActivation: figure state capture, action logging, damage tracking,
 *   move distance, attack metrics, kill tracking, side damage attribution
 * - logReinforcement: threat tracking, units deployed
 * - endGame: result finalization, open-round closing
 * - getLog / toJSON / toSummary: output methods
 * - Helper functions: getWoundThreshold fallbacks, cover detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/movement.js', () => ({
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  getValidMoves: vi.fn(() => []),
  getPath: vi.fn(() => []),
  moveFigure: vi.fn((gs: any) => gs),
}));

vi.mock('../src/los.js', () => ({
  getCover: vi.fn(() => 'None'),
  hasLineOfSight: vi.fn(() => true),
}));

import { getDistance } from '../src/movement.js';
import { BattleLogger } from '../src/ai/battle-logger.js';

import type {
  Figure,
  GameState,
  GameData,
  GameAction,
  HeroCharacter,
  NPCProfile,
  Tile,
} from '../src/types.js';

import type {
  AIDecisionResult,
  AIArchetypeProfile,
  AIPriorityRule,
} from '../src/ai/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTile(overrides: Partial<Tile> = {}): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null, ...overrides };
}

function makeMapTiles(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => makeTile()));
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1', name: 'Korrga', species: 'human', career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, melee: 1 }, talents: [],
    wounds: { current: 0, threshold: 14 }, strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 0, available: 0 }, ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper', name: 'Stormtrooper', side: 'Imperial', tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4, strainThreshold: null, soak: 3, speed: 4,
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
    aiArchetype: 'trooper', keywords: ['Imperial', 'Trooper'], abilities: [], ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1', entityType: 'hero', entityId: 'hero-1', playerId: 1,
    position: { x: 5, y: 5 }, woundsCurrent: 0, strainCurrent: 0,
    actionsRemaining: 1, maneuversRemaining: 1, hasUsedStrainForManeuver: false,
    isActivated: false, isDefeated: false, isWounded: false, conditions: [],
    suppressionTokens: 0, courage: 2,
    talentUsesThisEncounter: {}, talentUsesThisSession: {},
    cachedAttackPool: null, cachedDefensePool: null, ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1', entityType: 'npc', entityId: 'stormtrooper',
    playerId: 2, position: { x: 15, y: 5 }, ...overrides,
  });
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission', roundNumber: 1, turnPhase: 'Activation', playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 24, height: 24, tiles: makeMapTiles(24, 24), deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0, figures, activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0, heroes, npcProfiles,
    imperialMorale: { value: 10, max: 12, state: 'Steady' },
    operativeMorale: { value: 8, max: 12, state: 'Steady' },
    activeCombat: null, threatPool: 0, reinforcementPoints: 0, actionLog: [],
    gameMode: 'Solo', winner: null, victoryCondition: null, activeMissionId: null,
    lootCollected: [], interactedTerminals: [], completedObjectiveIds: [], objectivePoints: [],
    ...overrides,
  };
}

function makeProfile(): AIArchetypeProfile {
  return {
    id: 'trooper', name: 'Trooper', cardTitle: 'TROOPER',
    description: 'Advance and fire.',
    priorityRules: [
      { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'If enemy in range: Attack.' },
      { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Otherwise: Advance.' },
    ],
    weights: { killPotential: 5, coverValue: 5, proximity: 5, threatLevel: 5, elevation: 2, selfPreservation: 5 },
  };
}

function makeDecision(overrides: Partial<AIDecisionResult> = {}): AIDecisionResult {
  return {
    actions: [],
    matchedRule: { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Attack.' },
    reasoning: 'Rule #1 (enemy-in-range): Target in range',
    ...overrides,
  };
}

// ============================================================================
// SETUP
// ============================================================================

let logger: BattleLogger;

beforeEach(() => {
  vi.clearAllMocks();
  logger = new BattleLogger();
});

// ============================================================================
// CONSTRUCTOR
// ============================================================================

describe('BattleLogger constructor', () => {
  it('initializes with empty log', () => {
    const log = logger.getLog();
    expect(log.version).toBe('1.0');
    expect(log.armies.imperial).toHaveLength(0);
    expect(log.armies.operative).toHaveLength(0);
    expect(log.rounds).toHaveLength(0);
    expect(log.result.winner).toBe('');
  });
});

// ============================================================================
// START GAME
// ============================================================================

describe('startGame', () => {
  it('registers figures into correct army sides', () => {
    const hero = makeFigure();
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const archetypeMap = { 'fig-hero-1': 'hero', 'fig-st-1': 'trooper' };

    logger.startGame(gs, {} as GameData, archetypeMap, 10, '3x3 Skirmish');
    const log = logger.getLog();

    expect(log.armies.operative).toHaveLength(1);
    expect(log.armies.imperial).toHaveLength(1);
    expect(log.armies.operative[0].unitName).toBe('Korrga');
    expect(log.armies.imperial[0].unitName).toBe('Stormtrooper');
  });

  it('records map size and layout', () => {
    const gs = makeGameState([makeFigure()], { 'hero-1': makeHero() });
    logger.startGame(gs, {} as GameData, {}, 12, '4x4 Large');
    const log = logger.getLog();

    expect(log.mapSize).toEqual({ width: 24, height: 24 });
    expect(log.boardLayout).toBe('4x4 Large');
    expect(log.roundLimit).toBe(12);
  });

  it('captures archetype and max health for each figure', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { 'hero-1': makeHero({ wounds: { current: 0, threshold: 16 } }) });
    logger.startGame(gs, {} as GameData, { 'fig-hero-1': 'commando' }, 10, 'test');
    const log = logger.getLog();

    expect(log.armies.operative[0].archetype).toBe('commando');
    expect(log.armies.operative[0].maxHealth).toBe(16);
  });

  it('uses fallback for missing archetype', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { 'hero-1': makeHero() });
    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    expect(logger.getLog().armies.operative[0].archetype).toBe('unknown');
  });
});

// ============================================================================
// ROUND LIFECYCLE
// ============================================================================

describe('startRound / endRound', () => {
  it('creates a round log with end-of-round snapshot', () => {
    const hero = makeFigure();
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    logger.endRound(gs);

    const log = logger.getLog();
    expect(log.rounds).toHaveLength(1);
    expect(log.rounds[0].roundNumber).toBe(1);

    const snap = log.rounds[0].endOfRoundSnapshot;
    expect(snap.imperialMorale).toBe(10);
    expect(snap.operativeMorale).toBe(8);
    expect(snap.figureStates).toHaveLength(2);
  });

  it('endRound does nothing when no round started', () => {
    const gs = makeGameState([], {});
    logger.endRound(gs);
    expect(logger.getLog().rounds).toHaveLength(0);
  });

  it('multiple rounds accumulate', () => {
    const gs = makeGameState([makeFigure()], { 'hero-1': makeHero() });
    logger.startGame(gs, {} as GameData, {}, 10, 'test');

    logger.startRound(1);
    logger.endRound(gs);
    logger.startRound(2);
    logger.endRound(gs);

    expect(logger.getLog().rounds).toHaveLength(2);
    expect(logger.getLog().rounds[1].roundNumber).toBe(2);
  });
});

// ============================================================================
// LOG ACTIVATION
// ============================================================================

describe('logActivation', () => {
  it('captures figure state before and after', () => {
    const hero = makeFigure({ position: { x: 5, y: 5 } });
    const npc = makeNPCFigure({ position: { x: 15, y: 5 } });
    const gsBefore = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    // After activation: hero moved to (8,5)
    const heroAfter = { ...hero, position: { x: 8, y: 5 } };
    const gsAfter = makeGameState([heroAfter, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, { 'fig-hero-1': 'hero' }, 10, 'test');
    logger.startRound(1);

    const moveAction: GameAction = { type: 'Move', figureId: hero.id, payload: { path: [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }] } };
    const decision = makeDecision({
      matchedRule: { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance.' },
      reasoning: 'Rule #2 (default): advancing',
    });

    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, decision, makeProfile(), [moveAction], ['Move to (8,5)']);

    const act = logger.getLog().rounds[0]?.activations[0];
    // This will be undefined since endRound hasn't been called yet
    // But the activation was added to currentRound
    logger.endRound(gsAfter);

    const round = logger.getLog().rounds[0];
    expect(round.activations).toHaveLength(1);

    const activation = round.activations[0];
    expect(activation.before.position).toEqual({ x: 5, y: 5 });
    expect(activation.after.position).toEqual({ x: 8, y: 5 });
    expect(activation.figure.unitName).toBe('Korrga');
    expect(activation.figure.side).toBe('Operative');
  });

  it('tracks move distance metrics', () => {
    const hero = makeFigure({ position: { x: 0, y: 0 } });
    const npc = makeNPCFigure({ position: { x: 20, y: 0 } });
    const gsBefore = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const heroAfter = { ...hero, position: { x: 4, y: 0 } };
    const gsAfter = makeGameState([heroAfter, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, {}, 10, 'test');
    logger.startRound(1);

    const moveAction: GameAction = {
      type: 'Move', figureId: hero.id,
      payload: { path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }] },
    };
    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [moveAction], ['Move']);
    logger.endRound(gsAfter);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.metrics.tilesMovedTotal).toBe(3); // path.length - 1
    expect(activation.metrics.distanceClosed).toBeGreaterThan(0);
  });

  it('tracks attack damage and kills', () => {
    const hero = makeFigure({ position: { x: 5, y: 5 } });
    const npc = makeNPCFigure({ position: { x: 6, y: 5 }, woundsCurrent: 0 });
    const gsBefore = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    // After: NPC takes 4 damage and is defeated (threshold 4)
    const npcAfter = { ...npc, woundsCurrent: 4, isDefeated: true };
    const gsAfter = makeGameState([hero, npcAfter], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, {}, 10, 'test');
    logger.startRound(1);

    const attackAction: GameAction = {
      type: 'Attack', figureId: hero.id,
      payload: { targetId: npc.id, weaponId: 'blaster-rifle' },
    };
    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [attackAction], ['Attack Stormtrooper']);
    logger.endRound(gsAfter);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.metrics.attacksMade).toBe(1);
    expect(activation.metrics.totalDamageDealt).toBe(4);
    expect(activation.metrics.kills).toContain(npc.id);
    expect(activation.damageDealt).toHaveLength(1);
    expect(activation.damageDealt[0].killed).toBe(true);
  });

  it('attributes damage to correct side', () => {
    const npc = makeNPCFigure({ position: { x: 6, y: 5 } });
    const hero = makeFigure({ position: { x: 5, y: 5 }, woundsCurrent: 0 });
    const gsBefore = makeGameState([npc, hero], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    // NPC attacks hero, hero takes 3 damage
    const heroAfter = { ...hero, woundsCurrent: 3 };
    const gsAfter = makeGameState([npc, heroAfter], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, {}, 10, 'test');
    logger.startRound(1);

    const attackAction: GameAction = {
      type: 'Attack', figureId: npc.id,
      payload: { targetId: hero.id, weaponId: 'e11' },
    };
    logger.logActivation(npc, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [attackAction], ['Attack hero']);
    logger.endRound(gsAfter);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.metrics.totalDamageDealt).toBe(3);
    // Imperial NPC dealt damage, so totalDmgImp should accumulate
  });

  it('tracks damage received by the activating figure', () => {
    const hero = makeFigure({ position: { x: 5, y: 5 }, woundsCurrent: 0 });
    const npc = makeNPCFigure({ position: { x: 15, y: 5 } });
    const gsBefore = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    // Hero took 2 wounds during activation (e.g. from standby fire)
    const heroAfter = { ...hero, woundsCurrent: 2 };
    const gsAfter = makeGameState([heroAfter, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [], ['No action']);
    logger.endRound(gsAfter);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.damageReceived).toBe(2);
  });

  it('does nothing when no round started', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { 'hero-1': makeHero() });
    // No startRound called
    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    expect(logger.getLog().rounds).toHaveLength(0);
  });

  it('captures decision details', () => {
    const hero = makeFigure();
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);

    const decision = makeDecision({
      matchedRule: { rank: 3, condition: 'low-health', action: 'retreat-to-cover', cardText: 'If low health: Retreat.' },
      reasoning: 'Rule #3 (low-health): Health below 50%',
    });
    logger.logActivation(hero, gs, gs, {} as GameData, decision, makeProfile(), [], []);
    logger.endRound(gs);

    const act = logger.getLog().rounds[0].activations[0];
    expect(act.decision.matchedRuleRank).toBe(3);
    expect(act.decision.matchedRuleCondition).toBe('low-health');
    expect(act.decision.matchedRuleAction).toBe('retreat-to-cover');
    expect(act.decision.reasoning).toContain('Health below 50%');
  });
});

// ============================================================================
// LOG REINFORCEMENT
// ============================================================================

describe('logReinforcement', () => {
  it('attaches reinforcement data to the most recent round', () => {
    const gs = makeGameState([makeFigure()], { 'hero-1': makeHero() });
    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    logger.endRound(gs);

    logger.logReinforcement({
      events: [
        { npcId: 'stormtrooper', npcName: 'Stormtrooper', figureId: 'fig-st-2', position: { x: 20, y: 0 }, threatCost: 4 },
      ],
      threatSpent: 4,
      threatGained: 6,
      newThreatPool: 8,
    });

    const round = logger.getLog().rounds[0];
    expect(round.reinforcements).toBeDefined();
    expect(round.reinforcements!.threatGained).toBe(6);
    expect(round.reinforcements!.threatSpent).toBe(4);
    expect(round.reinforcements!.threatPoolAfter).toBe(8);
    expect(round.reinforcements!.unitsDeployed).toHaveLength(1);
    expect(round.reinforcements!.unitsDeployed[0].npcName).toBe('Stormtrooper');
  });

  it('does nothing when no rounds exist', () => {
    logger.logReinforcement({
      events: [], threatSpent: 0, threatGained: 0, newThreatPool: 0,
    });
    expect(logger.getLog().rounds).toHaveLength(0);
  });
});

// ============================================================================
// END GAME
// ============================================================================

describe('endGame', () => {
  it('finalizes result with winner and condition', () => {
    const hero = makeFigure();
    const npc = makeNPCFigure({ isDefeated: true });
    const gs = makeGameState(
      [hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() },
      { roundNumber: 5 },
    );

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.endGame('Operative', 'allEnemiesDefeated', gs);

    const result = logger.getLog().result;
    expect(result.winner).toBe('Operative');
    expect(result.condition).toBe('allEnemiesDefeated');
    expect(result.roundsPlayed).toBe(5);
    expect(result.finalMorale.imperial).toBe(10);
    expect(result.finalMorale.operative).toBe(8);
  });

  it('closes an open round if one exists', () => {
    const gs = makeGameState([makeFigure()], { 'hero-1': makeHero() });
    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    // Don't call endRound -- endGame should close it
    logger.endGame('Imperial', 'roundLimit', gs);

    expect(logger.getLog().rounds).toHaveLength(1);
  });

  it('accumulates damage totals across activations', () => {
    const hero = makeFigure({ position: { x: 5, y: 5 } });
    const npc = makeNPCFigure({ position: { x: 6, y: 5 } });
    const gsBefore = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    // Hero deals 3 damage to NPC
    const npcAfter = { ...npc, woundsCurrent: 3 };
    const gsAfter = makeGameState([hero, npcAfter], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, {}, 10, 'test');
    logger.startRound(1);

    const attackAction: GameAction = {
      type: 'Attack', figureId: hero.id,
      payload: { targetId: npc.id, weaponId: 'blaster-rifle' },
    };
    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [attackAction], ['Attack']);
    logger.endRound(gsAfter);

    logger.endGame('Operative', 'objectives', gsAfter);

    const result = logger.getLog().result;
    expect(result.totalDamageByOperative).toBe(3);
    expect(result.totalDamageByImperial).toBe(0);
  });
});

// ============================================================================
// OUTPUT METHODS
// ============================================================================

describe('output methods', () => {
  it('toJSON returns valid JSON string', () => {
    logger.startGame(
      makeGameState([makeFigure()], { 'hero-1': makeHero() }),
      {} as GameData, {}, 10, 'test',
    );
    const json = logger.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.0');
  });

  it('toSummary returns readable text', () => {
    const hero = makeFigure();
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gs, {} as GameData, { 'fig-hero-1': 'hero' }, 10, '3x3 Skirmish');
    logger.startRound(1);

    // Simple activation
    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], ['Hold']);
    logger.endRound(gs);
    logger.endGame('Operative', 'objectives', gs);

    const summary = logger.toSummary();
    expect(summary).toContain('BATTLE LOG SUMMARY');
    expect(summary).toContain('3x3 Skirmish');
    expect(summary).toContain('Operative wins');
    expect(summary).toContain('Round 1');
    expect(summary).toContain('Korrga');
  });

  it('toSummary shows damage and kills when present', () => {
    const hero = makeFigure({ position: { x: 5, y: 5 } });
    const npc = makeNPCFigure({ position: { x: 6, y: 5 } });
    const gsBefore = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    const npcAfter = { ...npc, woundsCurrent: 4, isDefeated: true };
    const gsAfter = makeGameState([hero, npcAfter], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, { 'fig-hero-1': 'hero', 'fig-st-1': 'trooper' }, 10, 'test');
    logger.startRound(1);

    const attackAction: GameAction = {
      type: 'Attack', figureId: hero.id,
      payload: { targetId: npc.id, weaponId: 'blaster-rifle' },
    };
    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [attackAction], ['Attack']);
    logger.endRound(gsAfter);
    logger.endGame('Operative', 'allEnemiesDefeated', gsAfter);

    const summary = logger.toSummary();
    expect(summary).toContain('dealt');
    expect(summary).toContain('KILLED');
  });
});

// ============================================================================
// HELPER FUNCTIONS (indirectly tested via class methods)
// ============================================================================

describe('helper function edge cases', () => {
  it('uses fallback wound threshold for missing hero', () => {
    // Figure references a hero not in the registry
    const orphanFig = makeFigure({ entityId: 'missing-hero' });
    const gs = makeGameState([orphanFig], {});

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    // maxHealth should use fallback of 10
    expect(logger.getLog().armies.operative[0].maxHealth).toBe(10);
  });

  it('uses fallback wound threshold for missing NPC', () => {
    const orphanNpc = makeNPCFigure({ entityId: 'missing-npc' });
    const gs = makeGameState([orphanNpc], {}, {});

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    // maxHealth should use fallback of 4
    expect(logger.getLog().armies.imperial[0].maxHealth).toBe(4);
  });

  it('uses fallback name for missing entity', () => {
    const orphanFig = makeFigure({ entityId: 'mystery-hero' });
    const gs = makeGameState([orphanFig], {});

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    expect(logger.getLog().armies.operative[0].unitName).toBe('mystery-hero');
  });

  it('handles figure snapshot for cover detection with HeavyCover terrain', () => {
    const hero = makeFigure({ position: { x: 3, y: 3 } });
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    gs.map.tiles[3][3] = makeTile({ terrain: 'HeavyCover', cover: 'Heavy' });

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.endRound(gs);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.before.coverAtPosition).toBe('Heavy');
  });

  it('handles figure snapshot for LightCover terrain', () => {
    const hero = makeFigure({ position: { x: 4, y: 4 } });
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    gs.map.tiles[4][4] = makeTile({ terrain: 'LightCover', cover: 'Light' });

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.endRound(gs);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.before.coverAtPosition).toBe('Light');
  });
});

// ============================================================================
// ENEMY DISTANCES
// ============================================================================

describe('enemy distance tracking', () => {
  it('captures enemy distances before and after activation', () => {
    const hero = makeFigure({ position: { x: 0, y: 0 } });
    const npc1 = makeNPCFigure({ id: 'fig-st-1', position: { x: 10, y: 0 } });
    const npc2 = makeNPCFigure({ id: 'fig-st-2', entityId: 'stormtrooper', position: { x: 20, y: 0 } });
    const gsBefore = makeGameState([hero, npc1, npc2], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    const heroAfter = { ...hero, position: { x: 4, y: 0 } };
    const gsAfter = makeGameState([heroAfter, npc1, npc2], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gsBefore, {} as GameData, {}, 10, 'test');
    logger.startRound(1);
    logger.logActivation(hero, gsBefore, gsAfter, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.endRound(gsAfter);

    const activation = logger.getLog().rounds[0].activations[0];
    expect(activation.before.enemyDistances).toHaveLength(2);
    expect(activation.after.enemyDistances).toHaveLength(2);
    // Distance to npc1 should be shorter after moving
    const distBefore = activation.before.enemyDistances.find(e => e.figureId === 'fig-st-1');
    const distAfter = activation.after.enemyDistances.find(e => e.figureId === 'fig-st-1');
    expect(distBefore!.distance).toBeGreaterThan(distAfter!.distance);
  });
});

// ============================================================================
// ACTIVATION INDEX
// ============================================================================

describe('activation indexing', () => {
  it('increments activation index within a round', () => {
    const hero = makeFigure();
    const npc = makeNPCFigure();
    const gs = makeGameState([hero, npc], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });

    logger.startGame(gs, {} as GameData, {}, 10, 'test');
    logger.startRound(1);

    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.logActivation(npc, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.endRound(gs);

    const activations = logger.getLog().rounds[0].activations;
    expect(activations[0].activationIndex).toBe(0);
    expect(activations[1].activationIndex).toBe(1);
  });

  it('resets activation index on new round', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { 'hero-1': makeHero() });

    logger.startGame(gs, {} as GameData, {}, 10, 'test');

    logger.startRound(1);
    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.endRound(gs);

    logger.startRound(2);
    logger.logActivation(hero, gs, gs, {} as GameData, makeDecision(), makeProfile(), [], []);
    logger.endRound(gs);

    expect(logger.getLog().rounds[1].activations[0].activationIndex).toBe(0);
  });
});

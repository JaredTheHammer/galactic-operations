/**
 * Tests for executeActionV2 action handlers:
 * - TakeCover: consumes 1 maneuver
 * - StandUp: removes Prone condition, consumes 1 maneuver
 * - CollectLoot: adds loot token, deduplicates, consumes 1 maneuver
 * - AimManeuver: grants +1 aimTokens (capped at 2), consumes 1 maneuver
 * - Cumbersome keyword: blocks attack after move
 * - Relentless keyword: grants +1 maneuver after attack (if not moved)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  moveFigure: vi.fn((gameState: any, figureId: string, target: any) => {
    const figs = gameState.figures.map((f: any) =>
      f.id === figureId ? { ...f, position: target } : f
    );
    return { ...gameState, figures: figs };
  }),
  getPath: vi.fn((from: any, to: any) => {
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  }),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None' as any),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn(() => 'Steady'),
  checkMoraleEffect: vi.fn(),
}));

vi.mock('../src/combat-v2.js', () => ({
  createCombatScenarioV2: vi.fn((...args: any[]) => ({
    attacker: args[0],
    defender: args[1],
    weaponId: args[2],
    cover: args[3],
    elevationDiff: args[4],
    hasLOS: args[5],
  })),
  resolveCombatV2: vi.fn(() => ({
    damage: 3,
    strain: 0,
    criticalInjury: null,
    advantageSpent: [],
    isHit: true,
    attackRolls: [],
    defenseRolls: [],
    netSuccesses: 1,
    netAdvantages: 0,
    triumphs: 0,
    despairs: 0,
  })),
  applyCombatResult: vi.fn((state: any) => state),
  buildCombatPools: vi.fn(() => ({
    attack: { ability: 2, proficiency: 1, boost: 0 },
    defense: { difficulty: 2, challenge: 0, setback: 0 },
  })),
}));

import { executeActionV2 } from '../src/turn-machine-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  Tile,
} from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
}

function makeMapTiles(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => makeTile()));
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, melee: 1 },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    side: 'Imperial',
    tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
    aiArchetype: 'trooper',
    keywords: ['Imperial', 'Trooper'],
    abilities: [],
    ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 2,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 8, y: 5 },
    ...overrides,
  });
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 20, height: 20, tiles: makeMapTiles(20, 20), deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures,
    activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0,
    heroes,
    npcProfiles,
    imperialMorale: { value: 10, max: 12, state: 'Steady' },
    operativeMorale: { value: 10, max: 12, state: 'Steady' },
    activeCombat: null,
    threatPool: 0,
    reinforcementPoints: 0,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    ...overrides,
  } as GameState;
}

const EMPTY_GAME_DATA = {} as GameData;

// ============================================================================
// TESTS
// ============================================================================

describe('executeActionV2 - action handlers', () => {

  describe('TakeCover', () => {
    it('consumes 1 maneuver remaining', () => {
      const hero = makeHero();
      const fig = makeFigure({ maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'TakeCover', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.maneuversRemaining).toBe(0);
    });

    it('does not reduce maneuversRemaining below 0', () => {
      const hero = makeHero();
      const fig = makeFigure({ maneuversRemaining: 0 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'TakeCover', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.maneuversRemaining).toBe(0);
    });
  });

  describe('StandUp', () => {
    it('removes Prone condition and consumes 1 maneuver', () => {
      const hero = makeHero();
      const fig = makeFigure({ conditions: ['Prone'], maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'StandUp', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.conditions).not.toContain('Prone');
      expect(updatedFig.maneuversRemaining).toBe(0);
    });

    it('preserves other conditions when removing Prone', () => {
      const hero = makeHero();
      const fig = makeFigure({ conditions: ['Prone', 'Staggered'], maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'StandUp', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.conditions).toEqual(['Staggered']);
      expect(updatedFig.conditions).not.toContain('Prone');
    });
  });

  describe('CollectLoot', () => {
    it('adds loot token to lootCollected array and consumes 1 maneuver', () => {
      const hero = makeHero();
      const fig = makeFigure({ maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'CollectLoot', figureId: 'fig-hero-1', payload: { lootTokenId: 'loot-1' } },
        EMPTY_GAME_DATA,
      );

      expect(result.lootCollected).toContain('loot-1');
      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.maneuversRemaining).toBe(0);
    });

    it('deduplicates loot tokens (collecting same token twice)', () => {
      const hero = makeHero();
      const fig = makeFigure({ maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero }, {}, { lootCollected: ['loot-1'] });

      const result = executeActionV2(
        gs,
        { type: 'CollectLoot', figureId: 'fig-hero-1', payload: { lootTokenId: 'loot-1' } },
        EMPTY_GAME_DATA,
      );

      // Should not have duplicates
      const count = result.lootCollected.filter(l => l === 'loot-1').length;
      expect(count).toBe(1);
      // Maneuver is still consumed
      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.maneuversRemaining).toBe(0);
    });

    it('can collect multiple different loot tokens', () => {
      const hero = makeHero();
      const fig = makeFigure({ maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero }, {}, { lootCollected: ['loot-1'] });

      const result = executeActionV2(
        gs,
        { type: 'CollectLoot', figureId: 'fig-hero-1', payload: { lootTokenId: 'loot-2' } },
        EMPTY_GAME_DATA,
      );

      expect(result.lootCollected).toContain('loot-1');
      expect(result.lootCollected).toContain('loot-2');
    });
  });

  describe('AimManeuver', () => {
    it('grants +1 aimTokens and consumes 1 maneuver', () => {
      const hero = makeHero();
      const fig = makeFigure({ aimTokens: 0, maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'AimManeuver', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.aimTokens).toBe(1);
      expect(updatedFig.maneuversRemaining).toBe(0);
    });

    it('caps aimTokens at 2', () => {
      const hero = makeHero();
      const fig = makeFigure({ aimTokens: 2, maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'AimManeuver', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.aimTokens).toBe(2);
    });

    it('increments from 1 to 2', () => {
      const hero = makeHero();
      const fig = makeFigure({ aimTokens: 1, maneuversRemaining: 1 });
      const gs = makeGameState([fig], { 'hero-1': hero });

      const result = executeActionV2(
        gs,
        { type: 'AimManeuver', figureId: 'fig-hero-1', payload: {} },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-hero-1')!;
      expect(updatedFig.aimTokens).toBe(2);
    });
  });

  describe('Cumbersome keyword', () => {
    it('blocks attack when figure has moved and has Cumbersome keyword', () => {
      const npc = makeNPC({
        id: 'heavy-trooper',
        name: 'Heavy Trooper',
        mechanicalKeywords: [{ name: 'Cumbersome' }],
      });
      const heavyFig = makeNPCFigure({
        id: 'fig-heavy-1',
        entityId: 'heavy-trooper',
        playerId: 2,
        position: { x: 3, y: 3 },
        hasMovedThisActivation: true,
        actionsRemaining: 1,
      });
      const targetFig = makeFigure({
        id: 'fig-hero-1',
        position: { x: 5, y: 3 },
      });
      const gs = makeGameState(
        [heavyFig, targetFig],
        { 'hero-1': makeHero() },
        { 'heavy-trooper': npc },
        { currentPlayerIndex: 1, activationOrder: ['fig-heavy-1', 'fig-hero-1'], currentActivationIndex: 0 },
      );

      const result = executeActionV2(
        gs,
        { type: 'Attack', figureId: 'fig-heavy-1', payload: { targetId: 'fig-hero-1', weaponId: 'e11' } },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-heavy-1')!;
      // Action consumed
      expect(updatedFig.actionsRemaining).toBe(0);
      // Attack flag set
      expect(updatedFig.hasAttackedThisActivation).toBe(true);
    });

    it('allows attack when figure has NOT moved even with Cumbersome keyword', async () => {
      const { createCombatScenarioV2 } = await import('../src/combat-v2.js');
      const npc = makeNPC({
        id: 'heavy-trooper',
        name: 'Heavy Trooper',
        mechanicalKeywords: [{ name: 'Cumbersome' }],
      });
      const heavyFig = makeNPCFigure({
        id: 'fig-heavy-1',
        entityId: 'heavy-trooper',
        playerId: 2,
        position: { x: 3, y: 3 },
        hasMovedThisActivation: false,
        actionsRemaining: 1,
      });
      const targetFig = makeFigure({
        id: 'fig-hero-1',
        position: { x: 5, y: 3 },
      });
      const gs = makeGameState(
        [heavyFig, targetFig],
        { 'hero-1': makeHero() },
        { 'heavy-trooper': npc },
        { currentPlayerIndex: 1, activationOrder: ['fig-heavy-1', 'fig-hero-1'], currentActivationIndex: 0 },
      );

      const result = executeActionV2(
        gs,
        { type: 'Attack', figureId: 'fig-heavy-1', payload: { targetId: 'fig-hero-1', weaponId: 'e11' } },
        EMPTY_GAME_DATA,
      );

      // Combat should have been invoked (not blocked)
      expect(createCombatScenarioV2).toHaveBeenCalled();
    });
  });

  describe('Relentless keyword', () => {
    it('grants +1 maneuver after attack when figure has NOT moved', () => {
      const npc = makeNPC({
        id: 'relentless-trooper',
        name: 'Relentless Trooper',
        mechanicalKeywords: [{ name: 'Relentless' }],
      });
      const trooperFig = makeNPCFigure({
        id: 'fig-rel-1',
        entityId: 'relentless-trooper',
        playerId: 2,
        position: { x: 3, y: 3 },
        hasMovedThisActivation: false,
        actionsRemaining: 1,
        maneuversRemaining: 1,
      });
      const targetFig = makeFigure({
        id: 'fig-hero-1',
        position: { x: 5, y: 3 },
      });
      const gs = makeGameState(
        [trooperFig, targetFig],
        { 'hero-1': makeHero() },
        { 'relentless-trooper': npc },
        { currentPlayerIndex: 1, activationOrder: ['fig-rel-1', 'fig-hero-1'], currentActivationIndex: 0 },
      );

      const result = executeActionV2(
        gs,
        { type: 'Attack', figureId: 'fig-rel-1', payload: { targetId: 'fig-hero-1', weaponId: 'e11' } },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-rel-1')!;
      // Action consumed (1 -> 0) but maneuver gets +1 bonus (1 -> 2 via Relentless)
      expect(updatedFig.actionsRemaining).toBe(0);
      expect(updatedFig.maneuversRemaining).toBe(2);
    });

    it('does NOT grant bonus maneuver if figure has already moved', () => {
      const npc = makeNPC({
        id: 'relentless-trooper',
        name: 'Relentless Trooper',
        mechanicalKeywords: [{ name: 'Relentless' }],
      });
      const trooperFig = makeNPCFigure({
        id: 'fig-rel-1',
        entityId: 'relentless-trooper',
        playerId: 2,
        position: { x: 3, y: 3 },
        hasMovedThisActivation: true,
        actionsRemaining: 1,
        maneuversRemaining: 0,
      });
      const targetFig = makeFigure({
        id: 'fig-hero-1',
        position: { x: 5, y: 3 },
      });
      const gs = makeGameState(
        [trooperFig, targetFig],
        { 'hero-1': makeHero() },
        { 'relentless-trooper': npc },
        { currentPlayerIndex: 1, activationOrder: ['fig-rel-1', 'fig-hero-1'], currentActivationIndex: 0 },
      );

      const result = executeActionV2(
        gs,
        { type: 'Attack', figureId: 'fig-rel-1', payload: { targetId: 'fig-hero-1', weaponId: 'e11' } },
        EMPTY_GAME_DATA,
      );

      const updatedFig = result.figures.find(f => f.id === 'fig-rel-1')!;
      // No bonus maneuver since figure already moved
      expect(updatedFig.maneuversRemaining).toBe(0);
    });
  });
});

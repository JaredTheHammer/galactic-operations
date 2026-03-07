/**
 * Exploration Token Engine Tests
 * Tests for TI4 PoK-inspired exploration system.
 */

import { describe, it, expect } from 'vitest';
import {
  generateExplorationTokens,
  getRevealableTokens,
  revealExplorationToken,
  applyExplorationReveal,
  getUnrevealedTokenCount,
  getCollectedRewards,
} from '../src/exploration-tokens';
import type {
  ExplorationToken,
  ExplorationTokenType,
  GameState,
  GameData,
  GameMap,
  Tile,
  Figure,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeOpenTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
}

function makeWallTile(): Tile {
  return { terrain: 'Wall', elevation: 0, cover: 'Full', occupied: null, objective: null };
}

function makeTestMap(width: number = 12, height: number = 12): GameMap {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles.push([]);
    for (let x = 0; x < width; x++) {
      tiles[y].push(makeOpenTile());
    }
  }
  return {
    id: 'test-map',
    name: 'Test Map',
    width,
    height,
    tiles,
    deploymentZones: { imperial: [], operative: [] },
  };
}

function makeTestGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    dice: {} as any,
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: {},
    explorationTokenTypes: {
      'supply-stim': {
        id: 'supply-stim',
        name: 'Stim Pack Cache',
        description: 'A hidden supply crate.',
        resultType: 'supply_cache',
        consumableId: 'stim-pack',
        weight: 20,
      },
      'credits-small': {
        id: 'credits-small',
        name: 'Hidden Credits',
        description: 'A small credit stash.',
        resultType: 'credits_stash',
        creditsValue: 25,
        weight: 20,
      },
      'trap-mine': {
        id: 'trap-mine',
        name: 'Proximity Mine',
        description: 'A concealed mine.',
        resultType: 'booby_trap',
        trapDamage: 4,
        trapSkill: 'perception',
        trapDifficulty: 2,
        weight: 10,
      },
      'fragment-combat': {
        id: 'fragment-combat',
        name: 'Combat Fragment',
        description: 'A relic fragment.',
        resultType: 'relic_fragment',
        fragmentType: 'combat',
        weight: 5,
      },
      'medical-cache': {
        id: 'medical-cache',
        name: 'Medical Station',
        description: 'Heals wounds.',
        resultType: 'medical_cache',
        healValue: 4,
        weight: 10,
      },
      'empty-cache': {
        id: 'empty-cache',
        name: 'Empty Container',
        description: 'Nothing here.',
        resultType: 'nothing',
        weight: 10,
      },
    },
    ...overrides,
  };
}

function makeMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation' as any,
    playMode: 'grid',
    map: makeTestMap(),
    players: [],
    currentPlayerIndex: 0,
    figures: [],
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { value: 8, max: 12 },
    operativeMorale: { value: 8, max: 12 },
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
    lootTokens: [],
    explorationTokens: [],
    ...overrides,
  };
}

function constRoll(value: number) {
  return () => value;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Exploration Tokens - Generation', () => {
  it('generates tokens on valid positions', () => {
    const map = makeTestMap(24, 24);
    const gameData = makeTestGameData();
    const tokens = generateExplorationTokens(map, gameData, 5, constRoll(0.5));

    expect(tokens).toHaveLength(5);
    for (const token of tokens) {
      expect(token.isRevealed).toBe(false);
      expect(token.position.x).toBeGreaterThanOrEqual(0);
      expect(token.position.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('defaults to reasonable count based on map size', () => {
    const map = makeTestMap(36, 36);
    const gameData = makeTestGameData();
    const tokens = generateExplorationTokens(map, gameData, undefined, constRoll(0.5));

    // 36*36 = 1296 tiles, 1296/50 = ~25 tokens
    expect(tokens.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array when no token types defined', () => {
    const map = makeTestMap();
    const gameData = makeTestGameData({ explorationTokenTypes: {} });
    const tokens = generateExplorationTokens(map, gameData, 5, constRoll(0.5));

    expect(tokens).toHaveLength(0);
  });

  it('avoids wall tiles', () => {
    const map = makeTestMap(12, 12);
    // Fill the middle with walls
    for (let y = 2; y < 10; y++) {
      for (let x = 0; x < 12; x++) {
        map.tiles[y][x] = makeWallTile();
      }
    }
    const gameData = makeTestGameData();
    const tokens = generateExplorationTokens(map, gameData, 3, constRoll(0.5));

    for (const token of tokens) {
      const tile = map.tiles[token.position.y][token.position.x];
      expect(tile.terrain).not.toBe('Wall');
    }
  });
});

describe('Exploration Tokens - Discovery', () => {
  it('finds revealable tokens adjacent to figure', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 }, isActive: true } as any,
      ],
      explorationTokens: [
        { id: 'tok-1', position: { x: 6, y: 5 }, tokenTypeId: 'supply-stim', isRevealed: false },
        { id: 'tok-2', position: { x: 5, y: 6 }, tokenTypeId: 'credits-small', isRevealed: false },
        { id: 'tok-3', position: { x: 10, y: 10 }, tokenTypeId: 'supply-stim', isRevealed: false },
      ],
    });

    const revealable = getRevealableTokens(gs, 'hero-1');
    expect(revealable).toHaveLength(2);
  });

  it('excludes already revealed tokens', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 }, isActive: true } as any,
      ],
      explorationTokens: [
        { id: 'tok-1', position: { x: 6, y: 5 }, tokenTypeId: 'supply-stim', isRevealed: true },
        { id: 'tok-2', position: { x: 5, y: 6 }, tokenTypeId: 'credits-small', isRevealed: false },
      ],
    });

    const revealable = getRevealableTokens(gs, 'hero-1');
    expect(revealable).toHaveLength(1);
    expect(revealable[0].id).toBe('tok-2');
  });

  it('only operatives can explore', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'npc-1', side: 'Imperial', position: { x: 5, y: 5 }, isActive: true } as any,
      ],
      explorationTokens: [
        { id: 'tok-1', position: { x: 6, y: 5 }, tokenTypeId: 'supply-stim', isRevealed: false },
      ],
    });

    const revealable = getRevealableTokens(gs, 'npc-1');
    expect(revealable).toHaveLength(0);
  });

  it('includes diagonally adjacent tokens', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 }, isActive: true } as any,
      ],
      explorationTokens: [
        { id: 'tok-1', position: { x: 6, y: 6 }, tokenTypeId: 'supply-stim', isRevealed: false }, // diagonal
      ],
    });

    const revealable = getRevealableTokens(gs, 'hero-1');
    expect(revealable).toHaveLength(1);
  });
});

describe('Exploration Tokens - Reveal Resolution', () => {
  it('resolves supply cache', () => {
    const gameData = makeTestGameData();
    const token: ExplorationToken = {
      id: 'tok-1',
      position: { x: 5, y: 5 },
      tokenTypeId: 'supply-stim',
      isRevealed: false,
    };
    const figure = { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 } } as Figure;

    const result = revealExplorationToken(token, figure, gameData);
    expect(result.resultType).toBe('supply_cache');
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0].type).toBe('consumable');
  });

  it('resolves credits stash', () => {
    const gameData = makeTestGameData();
    const token: ExplorationToken = {
      id: 'tok-2',
      position: { x: 5, y: 5 },
      tokenTypeId: 'credits-small',
      isRevealed: false,
    };
    const figure = { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 } } as Figure;

    const result = revealExplorationToken(token, figure, gameData);
    expect(result.resultType).toBe('credits_stash');
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]).toEqual({ type: 'credits', value: 25 });
  });

  it('resolves relic fragment', () => {
    const gameData = makeTestGameData();
    const token: ExplorationToken = {
      id: 'tok-3',
      position: { x: 5, y: 5 },
      tokenTypeId: 'fragment-combat',
      isRevealed: false,
    };
    const figure = { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 } } as Figure;

    const result = revealExplorationToken(token, figure, gameData);
    expect(result.resultType).toBe('relic_fragment');
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]).toEqual({ type: 'relic_fragment', fragmentType: 'combat' });
  });

  it('resolves medical cache with healing', () => {
    const gameData = makeTestGameData();
    const token: ExplorationToken = {
      id: 'tok-4',
      position: { x: 5, y: 5 },
      tokenTypeId: 'medical-cache',
      isRevealed: false,
    };
    const figure = { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 } } as Figure;

    const result = revealExplorationToken(token, figure, gameData);
    expect(result.resultType).toBe('medical_cache');
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]).toEqual({ type: 'healing', value: 4 });
  });

  it('resolves unknown token type gracefully', () => {
    const gameData = makeTestGameData();
    const token: ExplorationToken = {
      id: 'tok-unknown',
      position: { x: 5, y: 5 },
      tokenTypeId: 'nonexistent-type',
      isRevealed: false,
    };
    const figure = { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 } } as Figure;

    const result = revealExplorationToken(token, figure, gameData);
    expect(result.resultType).toBe('nothing');
    expect(result.rewards).toHaveLength(0);
  });

  it('resolves nothing token', () => {
    const gameData = makeTestGameData();
    const token: ExplorationToken = {
      id: 'tok-empty',
      position: { x: 5, y: 5 },
      tokenTypeId: 'empty-cache',
      isRevealed: false,
    };
    const figure = { id: 'hero-1', side: 'Operative', position: { x: 5, y: 5 } } as Figure;

    const result = revealExplorationToken(token, figure, gameData);
    expect(result.resultType).toBe('nothing');
    expect(result.rewards).toHaveLength(0);
  });
});

describe('Exploration Tokens - State Updates', () => {
  it('marks token as revealed in game state', () => {
    const gs = makeMinimalGameState({
      explorationTokens: [
        { id: 'tok-1', position: { x: 5, y: 5 }, tokenTypeId: 'supply-stim', isRevealed: false },
        { id: 'tok-2', position: { x: 8, y: 8 }, tokenTypeId: 'credits-small', isRevealed: false },
      ],
    });

    const result = {
      tokenTypeId: 'supply-stim',
      resultType: 'supply_cache' as const,
      narrativeText: 'Found supplies',
      rewards: [{ type: 'consumable' as const, itemId: 'stim-pack', quantity: 1 }],
    };

    const updated = applyExplorationReveal(gs, 'tok-1', result);
    expect(updated.explorationTokens![0].isRevealed).toBe(true);
    expect(updated.explorationTokens![1].isRevealed).toBe(false);
  });

  it('adds consumable to inventory on supply cache reveal', () => {
    const gs = makeMinimalGameState({
      consumableInventory: { 'stim-pack': 2 },
      explorationTokens: [
        { id: 'tok-1', position: { x: 5, y: 5 }, tokenTypeId: 'supply-stim', isRevealed: false },
      ],
    });

    const result = {
      tokenTypeId: 'supply-stim',
      resultType: 'supply_cache' as const,
      narrativeText: 'Found stim pack',
      rewards: [{ type: 'consumable' as const, itemId: 'stim-pack', quantity: 1 }],
    };

    const updated = applyExplorationReveal(gs, 'tok-1', result);
    expect(updated.consumableInventory!['stim-pack']).toBe(3);
  });
});

describe('Exploration Tokens - Utility', () => {
  it('counts unrevealed tokens', () => {
    const gs = makeMinimalGameState({
      explorationTokens: [
        { id: 'tok-1', position: { x: 5, y: 5 }, tokenTypeId: 'a', isRevealed: false },
        { id: 'tok-2', position: { x: 6, y: 6 }, tokenTypeId: 'b', isRevealed: true },
        { id: 'tok-3', position: { x: 7, y: 7 }, tokenTypeId: 'c', isRevealed: false },
      ],
    });

    expect(getUnrevealedTokenCount(gs)).toBe(2);
  });

  it('collects rewards from revealed tokens', () => {
    const gs = makeMinimalGameState({
      explorationTokens: [
        {
          id: 'tok-1', position: { x: 5, y: 5 }, tokenTypeId: 'a', isRevealed: true,
          revealResult: {
            tokenTypeId: 'a', resultType: 'credits_stash', narrativeText: '',
            rewards: [{ type: 'credits', value: 25 }],
          },
        },
        { id: 'tok-2', position: { x: 6, y: 6 }, tokenTypeId: 'b', isRevealed: false },
      ],
    });

    const rewards = getCollectedRewards(gs);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toEqual({ type: 'credits', value: 25 });
  });
});

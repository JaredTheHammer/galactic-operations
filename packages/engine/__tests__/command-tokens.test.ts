/**
 * Command Token Engine Tests
 * Tests for TI4-inspired command token economy.
 */

import { describe, it, expect } from 'vitest';
import {
  initializeCommandTokens,
  calculateOperativeTokens,
  calculateImperialTokens,
  refreshCommandTokens,
  canSpendToken,
  spendCommandToken,
  validateTokenUsage,
  applyTokenEffect,
  getTokensRemaining,
  applyDirectiveBonus,
} from '../src/command-tokens';
import type {
  CommandTokenState,
  HeroCharacter,
  GameState,
  Figure,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation' as any,
    playMode: 'grid',
    map: { id: 'test', name: 'Test', width: 12, height: 12, tiles: [], deploymentZones: { imperial: [], operative: [] } },
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
    commandTokens: {
      operativeTokens: 2,
      imperialTokens: 1,
      operativeMaxPerRound: 2,
      imperialMaxPerRound: 1,
      operativeSpentThisRound: 0,
      imperialSpentThisRound: 0,
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Command Tokens - Initialization', () => {
  it('initializes with base tokens for single hero', () => {
    const heroes = { 'hero-1': makeTestHero() };
    const state = initializeCommandTokens(heroes, 0);

    expect(state.operativeTokens).toBe(2); // base
    expect(state.operativeMaxPerRound).toBe(2);
  });

  it('grants bonus token for Commander career', () => {
    const heroes = {
      'hero-1': makeTestHero({ career: 'commander' }),
    };
    const state = initializeCommandTokens(heroes, 0);

    expect(state.operativeTokens).toBe(3); // base 2 + commander 1
  });

  it('scales imperial tokens with threat level', () => {
    const heroes = { 'hero-1': makeTestHero() };
    const state = initializeCommandTokens(heroes, 10);

    expect(state.imperialTokens).toBe(3); // base 1 + floor(10/5)
  });

  it('imperial tokens minimum is base', () => {
    expect(calculateImperialTokens(0)).toBe(1);
    expect(calculateImperialTokens(4)).toBe(1);
    expect(calculateImperialTokens(5)).toBe(2);
  });
});

describe('Command Tokens - Round Management', () => {
  it('refreshes tokens to max at round start', () => {
    const state: CommandTokenState = {
      operativeTokens: 0,
      imperialTokens: 0,
      operativeMaxPerRound: 3,
      imperialMaxPerRound: 2,
      operativeSpentThisRound: 3,
      imperialSpentThisRound: 2,
    };

    const refreshed = refreshCommandTokens(state);
    expect(refreshed.operativeTokens).toBe(3);
    expect(refreshed.imperialTokens).toBe(2);
    expect(refreshed.operativeSpentThisRound).toBe(0);
    expect(refreshed.imperialSpentThisRound).toBe(0);
  });
});

describe('Command Tokens - Spending', () => {
  it('can spend operative token', () => {
    const state: CommandTokenState = {
      operativeTokens: 2,
      imperialTokens: 1,
      operativeMaxPerRound: 2,
      imperialMaxPerRound: 1,
      operativeSpentThisRound: 0,
      imperialSpentThisRound: 0,
    };

    expect(canSpendToken(state, 'Operative')).toBe(true);
    const result = spendCommandToken(state, 'Operative');
    expect(result).not.toBeNull();
    expect(result!.operativeTokens).toBe(1);
    expect(result!.operativeSpentThisRound).toBe(1);
  });

  it('cannot spend when empty', () => {
    const state: CommandTokenState = {
      operativeTokens: 0,
      imperialTokens: 1,
      operativeMaxPerRound: 2,
      imperialMaxPerRound: 1,
      operativeSpentThisRound: 2,
      imperialSpentThisRound: 0,
    };

    expect(canSpendToken(state, 'Operative')).toBe(false);
    expect(spendCommandToken(state, 'Operative')).toBeNull();
  });

  it('can spend imperial token', () => {
    const state: CommandTokenState = {
      operativeTokens: 2,
      imperialTokens: 1,
      operativeMaxPerRound: 2,
      imperialMaxPerRound: 1,
      operativeSpentThisRound: 0,
      imperialSpentThisRound: 0,
    };

    const result = spendCommandToken(state, 'Imperial');
    expect(result).not.toBeNull();
    expect(result!.imperialTokens).toBe(0);
    expect(result!.imperialSpentThisRound).toBe(1);
  });
});

describe('Command Tokens - Validation', () => {
  it('validates coordinate usage requires target', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'hero-1', side: 'Operative', position: { x: 0, y: 0 }, isActive: true } as any,
        { id: 'hero-2', side: 'Operative', position: { x: 1, y: 0 }, isActive: true } as any,
      ],
    });

    const noTarget = validateTokenUsage('coordinate', { usage: 'coordinate' }, gs, 'hero-1');
    expect(noTarget.valid).toBe(false);

    const withTarget = validateTokenUsage(
      'coordinate',
      { usage: 'coordinate', coordinateTargetId: 'hero-2' },
      gs,
      'hero-1',
    );
    expect(withTarget.valid).toBe(true);
  });

  it('rejects coordinate with enemy target', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'hero-1', side: 'Operative', position: { x: 0, y: 0 }, isActive: true } as any,
        { id: 'npc-1', side: 'Imperial', position: { x: 1, y: 0 }, isActive: true } as any,
      ],
    });

    const result = validateTokenUsage(
      'coordinate',
      { usage: 'coordinate', coordinateTargetId: 'npc-1' },
      gs,
      'hero-1',
    );
    expect(result.valid).toBe(false);
  });

  it('validates simple usage types', () => {
    const gs = makeMinimalGameState({
      figures: [
        { id: 'hero-1', side: 'Operative', position: { x: 0, y: 0 }, isActive: true } as any,
      ],
    });

    expect(validateTokenUsage('bonus_maneuver', { usage: 'bonus_maneuver' }, gs, 'hero-1').valid).toBe(true);
    expect(validateTokenUsage('focus_fire', { usage: 'focus_fire' }, gs, 'hero-1').valid).toBe(true);
    expect(validateTokenUsage('defensive_stance', { usage: 'defensive_stance' }, gs, 'hero-1').valid).toBe(true);
  });

  it('rejects when no tokens initialized', () => {
    const gs = makeMinimalGameState({ commandTokens: undefined });
    gs.figures = [{ id: 'hero-1', side: 'Operative', position: { x: 0, y: 0 }, isActive: true } as any];

    const result = validateTokenUsage('bonus_maneuver', { usage: 'bonus_maneuver' }, gs, 'hero-1');
    expect(result.valid).toBe(false);
  });
});

describe('Command Tokens - Effect Application', () => {
  it('applies coordinate effect and decrements tokens', () => {
    const gs = makeMinimalGameState();
    const { gameState, description } = applyTokenEffect(
      gs,
      'Operative',
      'coordinate',
      { usage: 'coordinate', coordinateTargetId: 'hero-2' },
    );

    expect(gameState.commandTokens!.operativeTokens).toBe(1);
    expect(description).toContain('coordinated activation');
  });

  it('reports no tokens when pool is empty', () => {
    const gs = makeMinimalGameState({
      commandTokens: {
        operativeTokens: 0,
        imperialTokens: 0,
        operativeMaxPerRound: 2,
        imperialMaxPerRound: 1,
        operativeSpentThisRound: 2,
        imperialSpentThisRound: 1,
      },
    });

    const { description } = applyTokenEffect(gs, 'Operative', 'bonus_maneuver', { usage: 'bonus_maneuver' });
    expect(description).toContain('No tokens');
  });
});

describe('Command Tokens - Directive Bonus', () => {
  it('applies directive bonus to operative', () => {
    const state: CommandTokenState = {
      operativeTokens: 2,
      imperialTokens: 1,
      operativeMaxPerRound: 2,
      imperialMaxPerRound: 1,
      operativeSpentThisRound: 0,
      imperialSpentThisRound: 0,
    };

    const updated = applyDirectiveBonus(state, 1, 'Operative');
    expect(updated.operativeMaxPerRound).toBe(3);
    expect(updated.operativeTokens).toBe(3);
  });

  it('applies directive bonus to imperial', () => {
    const state: CommandTokenState = {
      operativeTokens: 2,
      imperialTokens: 1,
      operativeMaxPerRound: 2,
      imperialMaxPerRound: 1,
      operativeSpentThisRound: 0,
      imperialSpentThisRound: 0,
    };

    const updated = applyDirectiveBonus(state, 2, 'Imperial');
    expect(updated.imperialMaxPerRound).toBe(3);
    expect(updated.imperialTokens).toBe(3);
  });
});

describe('Command Tokens - Utility', () => {
  it('getTokensRemaining returns correct count', () => {
    const state: CommandTokenState = {
      operativeTokens: 3,
      imperialTokens: 1,
      operativeMaxPerRound: 3,
      imperialMaxPerRound: 2,
      operativeSpentThisRound: 0,
      imperialSpentThisRound: 1,
    };

    expect(getTokensRemaining(state, 'Operative')).toBe(3);
    expect(getTokensRemaining(state, 'Imperial')).toBe(1);
  });
});

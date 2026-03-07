/**
 * focus-resource.test.ts -- Focus Resource System Tests
 *
 * Tests for the Oathsworn Animus-inspired Focus system:
 * - Focus initialization from hero career
 * - Focus recovery at activation start
 * - Focus spending (all effect types)
 * - Cost validation and affordability checks
 * - Edge cases (no Focus, refund on invalid condition removal)
 * - Integration with resetForActivation
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  FocusEffect,
} from '../src/types';

import { FOCUS_COSTS, DEFAULT_FOCUS_BY_CAREER, DEFAULT_FOCUS_CONFIG } from '../src/types';

import {
  getFocusConfigForHero,
  initFocusResource,
  recoverFocus,
  canSpendFocus,
  getAvailableFocusEffects,
  spendFocus,
  hasFocusResource,
  getFocusPercent,
  getFocusEffectLabel,
} from '../src/focus-resource';

import { resetForActivation } from '../src/turn-machine-v2';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'smuggler',
    specializations: [],
    characteristics: {
      brawn: 2,
      agility: 3,
      intellect: 2,
      cunning: 3,
      willpower: 2,
      presence: 3,
    },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { weapons: [], armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'hero-fig-1',
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
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: 2,
    focusCurrent: 5,
    focusMax: 5,
    focusRecovery: 2,
    ...overrides,
  };
}

function makeGameState(figures: Figure[] = []): GameState {
  return {
    missionId: 'test',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'Campaign',
    map: {
      id: 'test',
      name: 'Test',
      width: 10,
      height: 10,
      tiles: Array(10).fill(null).map(() =>
        Array(10).fill(null).map(() => ({
          terrain: 'Open' as const,
          elevation: 0,
          cover: 'None' as const,
          occupied: null,
          objective: null,
        }))
      ),
      deploymentZones: { imperial: [], operative: [] },
    },
    players: [
      { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
    ],
    currentPlayerIndex: 1,
    figures,
    activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0,
    heroes: {
      'hero-1': makeHero(),
    },
    npcProfiles: {},
    imperialMorale: { value: 10, max: 10, state: 'Steady' },
    operativeMorale: { value: 10, max: 10, state: 'Steady' },
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
  };
}

// ============================================================================
// INITIALIZATION TESTS
// ============================================================================

describe('Focus Initialization', () => {
  it('initializes Focus from smuggler career', () => {
    const hero = makeHero({ career: 'smuggler' });
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined, focusRecovery: undefined });

    const result = initFocusResource(fig, hero);
    expect(result.focusMax).toBe(5);
    expect(result.focusCurrent).toBe(5); // starts full
    expect(result.focusRecovery).toBe(2);
  });

  it('initializes Focus from soldier career', () => {
    const hero = makeHero({ career: 'soldier' });
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined, focusRecovery: undefined });

    const result = initFocusResource(fig, hero);
    expect(result.focusMax).toBe(3);
    expect(result.focusRecovery).toBe(1);
  });

  it('initializes Focus from force_sensitive career', () => {
    const hero = makeHero({ career: 'force_sensitive' });
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined, focusRecovery: undefined });

    const result = initFocusResource(fig, hero);
    expect(result.focusMax).toBe(6);
    expect(result.focusRecovery).toBe(3);
  });

  it('uses default Focus for unknown careers', () => {
    const hero = makeHero({ career: 'space_pirate' });
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined, focusRecovery: undefined });

    const result = initFocusResource(fig, hero);
    expect(result.focusMax).toBe(DEFAULT_FOCUS_CONFIG.max);
    expect(result.focusRecovery).toBe(DEFAULT_FOCUS_CONFIG.recoveryPerActivation);
  });

  it('does not modify NPC figures', () => {
    const hero = makeHero();
    const fig = makeFigure({ entityType: 'npc', focusCurrent: undefined, focusMax: undefined });

    const result = initFocusResource(fig, hero);
    expect(result.focusCurrent).toBeUndefined();
    expect(result.focusMax).toBeUndefined();
  });

  it('handles hyphenated career names', () => {
    const hero = makeHero({ career: 'bounty-hunter' });
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined, focusRecovery: undefined });

    const result = initFocusResource(fig, hero);
    expect(result.focusMax).toBe(4);
    expect(result.focusRecovery).toBe(2);
  });
});

// ============================================================================
// RECOVERY TESTS
// ============================================================================

describe('Focus Recovery', () => {
  it('recovers Focus at activation start', () => {
    const fig = makeFigure({ focusCurrent: 1, focusMax: 5, focusRecovery: 2 });
    const result = recoverFocus(fig);
    expect(result.focusCurrent).toBe(3);
  });

  it('caps Focus at max', () => {
    const fig = makeFigure({ focusCurrent: 4, focusMax: 5, focusRecovery: 2 });
    const result = recoverFocus(fig);
    expect(result.focusCurrent).toBe(5);
  });

  it('does not change Focus for NPCs', () => {
    const fig = makeFigure({ entityType: 'npc', focusCurrent: 1, focusMax: 5, focusRecovery: 2 });
    const result = recoverFocus(fig);
    expect(result.focusCurrent).toBe(1);
  });

  it('handles missing Focus fields gracefully', () => {
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined });
    const result = recoverFocus(fig);
    expect(result.focusCurrent).toBeUndefined();
  });
});

// ============================================================================
// SPENDING TESTS
// ============================================================================

describe('Focus Spending', () => {
  it('checks affordability correctly', () => {
    const fig = makeFigure({ focusCurrent: 2 });

    expect(canSpendFocus(fig, 'bonus_move')).toBe(true);   // costs 1
    expect(canSpendFocus(fig, 'bonus_aim')).toBe(true);     // costs 1
    expect(canSpendFocus(fig, 'bonus_damage')).toBe(true);  // costs 2
    expect(canSpendFocus(fig, 'bonus_defense')).toBe(true); // costs 2
    expect(canSpendFocus(fig, 'shake_condition')).toBe(false); // costs 3
  });

  it('returns all affordable effects', () => {
    const fig = makeFigure({ focusCurrent: 5 });
    const effects = getAvailableFocusEffects(fig);
    expect(effects.length).toBe(6); // all effects
  });

  it('returns empty for NPC figures', () => {
    const fig = makeFigure({ entityType: 'npc', focusCurrent: 5 });
    const effects = getAvailableFocusEffects(fig);
    expect(effects.length).toBe(0);
  });

  it('spends Focus on bonus_move', () => {
    const fig = makeFigure({ focusCurrent: 3 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'bonus_move', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.focusCurrent).toBe(2);
    expect(result!.description).toContain('+2 speed');
  });

  it('spends Focus on bonus_aim (adds aim token)', () => {
    const fig = makeFigure({ focusCurrent: 3, aimTokens: 0 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'bonus_aim', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.focusCurrent).toBe(2);
    expect(result!.figure.aimTokens).toBe(1);
  });

  it('caps aim tokens at 3 with Focus', () => {
    const fig = makeFigure({ focusCurrent: 3, aimTokens: 3 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'bonus_aim', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.aimTokens).toBe(3);
  });

  it('spends Focus on bonus_damage', () => {
    const fig = makeFigure({ focusCurrent: 3 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'bonus_damage', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.focusCurrent).toBe(1);
    expect(result!.description).toContain('+3 damage');
  });

  it('spends Focus on bonus_defense', () => {
    const fig = makeFigure({ focusCurrent: 3 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'bonus_defense', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.focusCurrent).toBe(1);
    expect(result!.description).toContain('defense');
  });

  it('spends Focus on recover_strain', () => {
    const fig = makeFigure({ focusCurrent: 3, strainCurrent: 5 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'recover_strain', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.focusCurrent).toBe(2);
    expect(result!.figure.strainCurrent).toBe(3);
  });

  it('spends Focus on shake_condition', () => {
    const fig = makeFigure({ focusCurrent: 5, conditions: ['Stunned', 'Bleeding'] });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'shake_condition', gs);

    expect(result).not.toBeNull();
    expect(result!.figure.focusCurrent).toBe(2);
    expect(result!.figure.conditions).not.toContain('Stunned');
    expect(result!.figure.conditions).toContain('Bleeding');
  });

  it('does not remove Wounded condition', () => {
    const fig = makeFigure({ focusCurrent: 5, conditions: ['Wounded'] });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'shake_condition', gs);

    // Should return null since Wounded is the only condition and it's not removable
    expect(result).toBeNull();
  });

  it('returns null when cannot afford', () => {
    const fig = makeFigure({ focusCurrent: 0 });
    const gs = makeGameState([fig]);
    const result = spendFocus(fig, 'bonus_move', gs);
    expect(result).toBeNull();
  });
});

// ============================================================================
// QUERY HELPER TESTS
// ============================================================================

describe('Focus Query Helpers', () => {
  it('detects Focus resource presence', () => {
    const fig = makeFigure({ focusMax: 5 });
    expect(hasFocusResource(fig)).toBe(true);

    const fig2 = makeFigure({ focusMax: undefined });
    expect(hasFocusResource(fig2)).toBe(false);

    const fig3 = makeFigure({ focusMax: 0 });
    expect(hasFocusResource(fig3)).toBe(false);
  });

  it('calculates Focus percentage', () => {
    const fig = makeFigure({ focusCurrent: 3, focusMax: 5 });
    expect(getFocusPercent(fig)).toBe(60);
  });

  it('returns 0% for figures without Focus', () => {
    const fig = makeFigure({ focusCurrent: undefined, focusMax: undefined });
    expect(getFocusPercent(fig)).toBe(0);
  });

  it('returns labels for all effects', () => {
    const effects: FocusEffect[] = [
      'bonus_move', 'bonus_aim', 'bonus_damage',
      'bonus_defense', 'recover_strain', 'shake_condition',
    ];
    for (const e of effects) {
      expect(getFocusEffectLabel(e)).toBeTruthy();
    }
  });
});

// ============================================================================
// INTEGRATION WITH RESET FOR ACTIVATION
// ============================================================================

describe('Focus Integration with resetForActivation', () => {
  it('recovers Focus during activation reset', () => {
    const fig = makeFigure({
      focusCurrent: 1,
      focusMax: 5,
      focusRecovery: 2,
      isActivated: true,
    });

    const result = resetForActivation(fig);
    expect(result.focusCurrent).toBe(3);
  });

  it('caps Focus recovery at max during reset', () => {
    const fig = makeFigure({
      focusCurrent: 4,
      focusMax: 5,
      focusRecovery: 2,
      isActivated: true,
    });

    const result = resetForActivation(fig);
    expect(result.focusCurrent).toBe(5);
  });

  it('preserves undefined Focus for non-Focus figures', () => {
    const fig = makeFigure({
      focusCurrent: undefined,
      focusMax: undefined,
      focusRecovery: undefined,
      isActivated: true,
    });

    const result = resetForActivation(fig);
    expect(result.focusCurrent).toBeUndefined();
  });
});

// ============================================================================
// COST TABLE TESTS
// ============================================================================

describe('Focus Cost Table', () => {
  it('has correct costs for all effects', () => {
    expect(FOCUS_COSTS.bonus_move).toBe(1);
    expect(FOCUS_COSTS.bonus_aim).toBe(1);
    expect(FOCUS_COSTS.bonus_damage).toBe(2);
    expect(FOCUS_COSTS.bonus_defense).toBe(2);
    expect(FOCUS_COSTS.recover_strain).toBe(1);
    expect(FOCUS_COSTS.shake_condition).toBe(3);
  });
});

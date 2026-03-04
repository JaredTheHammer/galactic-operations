/**
 * Tests for morale.ts
 *
 * Covers:
 * - getMoraleState boundary transitions (Steady/Shaken/Wavering/Broken)
 * - applyMoraleChange clamping and state updates
 * - checkMoraleEffect action restrictions under Broken morale
 * - getMoraleChangeForEvent values
 */

import { describe, it, expect } from 'vitest';
import {
  getMoraleState,
  applyMoraleChange,
  checkMoraleEffect,
  getMoraleChangeForEvent,
} from '../src/morale.js';
import type { MoraleTrack, Figure, ActionType } from '../src/types.js';

function makeMorale(value: number, max = 12): MoraleTrack {
  return {
    value,
    max,
    state: getMoraleState({ value, max, state: 'Steady' }),
  };
}

function makeFigure(): Figure {
  return {
    id: 'fig-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 0, y: 0 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 2,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
  };
}

// ============================================================================
// getMoraleState boundary tests
// ============================================================================

describe('getMoraleState', () => {
  it('returns Steady at value 6 (lower boundary)', () => {
    expect(getMoraleState(makeMorale(6))).toBe('Steady');
  });

  it('returns Steady at value 12 (max)', () => {
    expect(getMoraleState(makeMorale(12))).toBe('Steady');
  });

  it('returns Shaken at value 5 (upper boundary)', () => {
    expect(getMoraleState(makeMorale(5))).toBe('Shaken');
  });

  it('returns Shaken at value 4 (lower boundary)', () => {
    expect(getMoraleState(makeMorale(4))).toBe('Shaken');
  });

  it('returns Wavering at value 3 (upper boundary)', () => {
    expect(getMoraleState(makeMorale(3))).toBe('Wavering');
  });

  it('returns Wavering at value 1 (lower boundary)', () => {
    expect(getMoraleState(makeMorale(1))).toBe('Wavering');
  });

  it('returns Broken at value 0', () => {
    expect(getMoraleState(makeMorale(0))).toBe('Broken');
  });

  // Exhaustive sweep of all valid values
  it('assigns correct state for every value 0-12', () => {
    const expected: Record<number, string> = {
      0: 'Broken',
      1: 'Wavering', 2: 'Wavering', 3: 'Wavering',
      4: 'Shaken', 5: 'Shaken',
      6: 'Steady', 7: 'Steady', 8: 'Steady', 9: 'Steady',
      10: 'Steady', 11: 'Steady', 12: 'Steady',
    };
    for (let v = 0; v <= 12; v++) {
      expect(getMoraleState(makeMorale(v))).toBe(expected[v]);
    }
  });
});

// ============================================================================
// applyMoraleChange
// ============================================================================

describe('applyMoraleChange', () => {
  it('decrements morale value', () => {
    const track = makeMorale(10);
    const result = applyMoraleChange(track, -3);
    expect(result.value).toBe(7);
    expect(result.state).toBe('Steady');
  });

  it('increments morale value', () => {
    const track = makeMorale(3);
    const result = applyMoraleChange(track, 2);
    expect(result.value).toBe(5);
    expect(result.state).toBe('Shaken');
  });

  it('clamps at zero (cannot go negative)', () => {
    const track = makeMorale(2);
    const result = applyMoraleChange(track, -10);
    expect(result.value).toBe(0);
    expect(result.state).toBe('Broken');
  });

  it('clamps at max (cannot exceed)', () => {
    const track = makeMorale(10);
    const result = applyMoraleChange(track, 20);
    expect(result.value).toBe(12);
    expect(result.state).toBe('Steady');
  });

  it('transitions Steady -> Shaken on drop', () => {
    const track = makeMorale(6);
    const result = applyMoraleChange(track, -1);
    expect(result.state).toBe('Shaken');
  });

  it('transitions Shaken -> Wavering on drop', () => {
    const track = makeMorale(4);
    const result = applyMoraleChange(track, -1);
    expect(result.state).toBe('Wavering');
  });

  it('transitions Wavering -> Broken on drop', () => {
    const track = makeMorale(1);
    const result = applyMoraleChange(track, -1);
    expect(result.state).toBe('Broken');
  });

  it('transitions Broken -> Wavering on recovery', () => {
    const track = makeMorale(0);
    const result = applyMoraleChange(track, 2);
    expect(result.state).toBe('Wavering');
  });

  it('does not mutate original track', () => {
    const track = makeMorale(8);
    const originalValue = track.value;
    applyMoraleChange(track, -5);
    expect(track.value).toBe(originalValue);
  });
});

// ============================================================================
// checkMoraleEffect - action restrictions
// ============================================================================

describe('checkMoraleEffect', () => {
  const fig = makeFigure();

  describe('non-Broken states allow all actions', () => {
    const allActions: ActionType[] = [
      'Move', 'Attack', 'Aim', 'Rally', 'GuardedStance',
      'Rest', 'Dodge', 'TakeCover', 'StrainForManeuver',
      'InteractTerminal', 'InteractLoot',
    ];

    for (const state of ['Steady', 'Shaken', 'Wavering'] as const) {
      for (const action of allActions) {
        it(`allows ${action} when ${state}`, () => {
          expect(checkMoraleEffect(fig, state, action)).toBe(true);
        });
      }
    }
  });

  describe('Broken morale restricts to Move and Rest only', () => {
    it('allows Move when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'Move')).toBe(true);
    });

    it('allows Rest when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'Rest')).toBe(true);
    });

    it('blocks Attack when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'Attack')).toBe(false);
    });

    it('blocks Aim when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'Aim')).toBe(false);
    });

    it('blocks Rally when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'Rally')).toBe(false);
    });

    it('blocks GuardedStance when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'GuardedStance')).toBe(false);
    });

    it('blocks Dodge when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'Dodge')).toBe(false);
    });

    it('blocks InteractTerminal when Broken', () => {
      expect(checkMoraleEffect(fig, 'Broken', 'InteractTerminal')).toBe(false);
    });
  });
});

// ============================================================================
// getMoraleChangeForEvent
// ============================================================================

describe('getMoraleChangeForEvent', () => {
  it('returns -1 for figureDefeated', () => {
    expect(getMoraleChangeForEvent('figureDefeated', 'Imperial')).toBe(-1);
  });

  it('returns -2 for eliteDefeated', () => {
    expect(getMoraleChangeForEvent('eliteDefeated', 'Operative')).toBe(-2);
  });

  it('returns -3 for heroDefeated', () => {
    expect(getMoraleChangeForEvent('heroDefeated', 'Operative')).toBe(-3);
  });

  it('returns 3 for villainDefeated', () => {
    expect(getMoraleChangeForEvent('villainDefeated', 'Imperial')).toBe(3);
  });

  it('returns -2 for objectiveLost', () => {
    expect(getMoraleChangeForEvent('objectiveLost', 'Imperial')).toBe(-2);
  });

  it('returns 2 for objectiveWon', () => {
    expect(getMoraleChangeForEvent('objectiveWon', 'Imperial')).toBe(2);
  });
});

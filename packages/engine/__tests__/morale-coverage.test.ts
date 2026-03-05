/**
 * morale-coverage.test.ts
 *
 * Additional coverage for morale.ts:
 * - Broken morale blocks TakeCover, StrainForManeuver, InteractLoot
 * - Broken morale allows only Move and Rest (exhaustive)
 * - getMoraleChangeForEvent returns 0 for unknown event types
 */

import { describe, it, expect } from 'vitest';
import {
  getMoraleState,
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
// Broken morale: exhaustive action restrictions
// ============================================================================

describe('checkMoraleEffect - Broken morale exhaustive', () => {
  const fig = makeFigure();

  const allowedActions: ActionType[] = ['Move', 'Rest'];
  const blockedActions: ActionType[] = [
    'Attack', 'Aim', 'Rally', 'GuardedStance', 'Dodge',
    'TakeCover', 'StrainForManeuver', 'InteractTerminal', 'InteractLoot',
  ];

  for (const action of allowedActions) {
    it(`Broken morale ALLOWS ${action}`, () => {
      expect(checkMoraleEffect(fig, 'Broken', action)).toBe(true);
    });
  }

  for (const action of blockedActions) {
    it(`Broken morale BLOCKS ${action}`, () => {
      expect(checkMoraleEffect(fig, 'Broken', action)).toBe(false);
    });
  }
});

// ============================================================================
// getMoraleChangeForEvent - unknown event
// ============================================================================

describe('getMoraleChangeForEvent - unknown event', () => {
  it('returns 0 for unrecognized event type', () => {
    expect(getMoraleChangeForEvent('unknownEvent' as any, 'Imperial')).toBe(0);
  });
});

// ============================================================================
// Negative morale value edge case
// ============================================================================

describe('getMoraleState - edge cases', () => {
  it('returns Broken for negative values', () => {
    expect(getMoraleState({ value: -1, max: 12, state: 'Steady' })).toBe('Broken');
  });

  it('returns Steady for values above max', () => {
    expect(getMoraleState({ value: 20, max: 12, state: 'Steady' })).toBe('Steady');
  });
});

/**
 * Spirit Island Subsystems Tests
 * Tests for all 5 Spirit Island-inspired toggleable subsystems.
 */

import { describe, it, expect } from 'vitest';

// #1 Disruption Track
import {
  initializeDisruptionTrack,
  computeTerrorLevel,
  addDisruption,
  getActiveVictoryConditions,
  didTerrorLevelIncrease,
  applyDisruptionEvent,
} from '../src/disruption-track';

// #2 Dual-Timing
import {
  initializeDualTiming,
  getSlowBonus,
  queueSlowAction,
  cancelSlowActionsForFigure,
  getPendingSlowActions,
  clearSlowQueue,
  canBeSlowed,
  applySlowAction,
  resolveSlowPhase,
  onFigureDefeated,
} from '../src/dual-timing';

// #3 Threat Cadence
import {
  initializeThreatCadence,
  getPhaseForRound,
  getCycleCount,
  advanceThreatCadence,
  disruptCurrentPhase,
  getActiveEffects as getThreatEffects,
  addScoutedZones,
  addFortification,
  getNextPhase,
  getThreatIncomeMultiplier,
  applyThreatCadenceRound,
  getFortificationBonus,
} from '../src/threat-cadence';

// #4 Element Synergy
import {
  initializeElementTracker,
  addElementForAction,
  addElement,
  meetsThresholds,
  checkInnatePowers,
  getActiveEffects as getElementEffects,
  mergeEffects,
  getHeroElementCounts,
  applyElementGeneration,
  DEFAULT_INNATE_POWERS,
} from '../src/element-synergy';

// #5 Collateral Damage
import {
  initializeCollateralDamage,
  getTileCollateral,
  applyCollateralToTile,
  getCollateralForQuality,
  applyWeaponCollateral,
  getTilesAtLevel,
  getTerrainModification,
  applyCollateralToGameState,
  getXPMultiplier,
  getCollateralSummary,
} from '../src/collateral-damage';

// Master module
import {
  initializeSpiritIsland,
  hasAnySubsystem,
  getEnabledSubsystems,
} from '../src/spirit-island';

import type {
  GameState,
  GameMap,
  Figure,
  TieredVictoryCondition,
  InnatePower,
  DisruptionTrackState,
  ThreatCadenceState,
  SpiritIslandState,
  OptionalSubsystems,
} from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalMap(width = 10, height = 10): GameMap {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({
        terrain: 'Open' as const,
        elevation: 0,
        cover: 'None' as const,
        occupied: null,
        objective: null,
      });
    }
  }
  return {
    id: 'test-map',
    width,
    height,
    tiles,
    deploymentZones: { imperial: [], operative: [] },
  };
}

function makeMinimalGameState(
  subsystems: OptionalSubsystems = {},
): GameState {
  const si = initializeSpiritIsland(subsystems);
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: makeMinimalMap(),
    players: [],
    currentPlayerIndex: 0,
    figures: [],
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
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
    lootTokens: [],
    spiritIsland: si,
  } as GameState;
}

function makeFigure(id: string, defeated = false): Figure {
  return {
    id,
    entityType: 'hero',
    entityId: id,
    playerId: 0,
    position: { x: 0, y: 0 },
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
    isDefeated: defeated,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: 1,
  } as Figure;
}

// ===========================================================================
// #1 Disruption Track Tests
// ===========================================================================

describe('Spirit Island #1: Disruption Track', () => {
  describe('initializeDisruptionTrack', () => {
    it('creates default state', () => {
      const state = initializeDisruptionTrack();
      expect(state.disruption).toBe(0);
      expect(state.terrorLevel).toBe(1);
      expect(state.thresholds).toEqual([0, 8, 16]);
      expect(state.eventLog).toEqual([]);
    });

    it('accepts custom thresholds', () => {
      const state = initializeDisruptionTrack([], [0, 5, 10]);
      expect(state.thresholds).toEqual([0, 5, 10]);
    });

    it('accepts tiered conditions', () => {
      const conditions: TieredVictoryCondition[] = [
        { terrorLevel: 2, side: 'Operative', description: 'Reach extraction', condition: 'extract' },
      ];
      const state = initializeDisruptionTrack(conditions);
      expect(state.tieredConditions).toHaveLength(1);
    });
  });

  describe('computeTerrorLevel', () => {
    const thresholds: [number, number, number] = [0, 8, 16];

    it('returns TL1 for low disruption', () => {
      expect(computeTerrorLevel(0, thresholds)).toBe(1);
      expect(computeTerrorLevel(7, thresholds)).toBe(1);
    });

    it('returns TL2 at threshold', () => {
      expect(computeTerrorLevel(8, thresholds)).toBe(2);
      expect(computeTerrorLevel(15, thresholds)).toBe(2);
    });

    it('returns TL3 at highest threshold', () => {
      expect(computeTerrorLevel(16, thresholds)).toBe(3);
      expect(computeTerrorLevel(100, thresholds)).toBe(3);
    });
  });

  describe('addDisruption', () => {
    it('adds disruption points from events', () => {
      let state = initializeDisruptionTrack();
      state = addDisruption(state, 'elite_defeated', 1, 'test');
      expect(state.disruption).toBe(3);
      expect(state.eventLog).toHaveLength(1);
      expect(state.eventLog[0]).toEqual({ round: 1, source: 'test', amount: 3 });
    });

    it('escalates terror level when threshold reached', () => {
      let state = initializeDisruptionTrack();
      state = addDisruption(state, 'leader_defeated', 1); // +5
      expect(state.terrorLevel).toBe(1);
      state = addDisruption(state, 'elite_defeated', 2); // +3 = 8
      expect(state.terrorLevel).toBe(2);
    });

    it('stacks disruption from multiple events', () => {
      let state = initializeDisruptionTrack();
      state = addDisruption(state, 'terminal_hacked', 1); // +1
      state = addDisruption(state, 'loot_secured', 1); // +1
      state = addDisruption(state, 'objective_completed', 2); // +2
      expect(state.disruption).toBe(4);
      expect(state.eventLog).toHaveLength(3);
    });
  });

  describe('getActiveVictoryConditions', () => {
    it('returns base conditions at TL1', () => {
      const state = initializeDisruptionTrack();
      const base = [{ side: 'Operative' as const, description: 'Eliminate all', condition: 'eliminate_all' }];
      const active = getActiveVictoryConditions(state, base);
      expect(active).toEqual(base);
    });

    it('replaces with tiered conditions at higher terror', () => {
      const tiered: TieredVictoryCondition[] = [
        { terrorLevel: 2, side: 'Operative', description: 'Just extract', condition: 'extract' },
      ];
      let state = initializeDisruptionTrack(tiered);
      // Force to TL2
      state = { ...state, disruption: 10, terrorLevel: 2 };

      const base = [{ side: 'Operative' as const, description: 'Eliminate all', condition: 'eliminate_all' }];
      const active = getActiveVictoryConditions(state, base);
      expect(active[0].condition).toBe('extract');
      expect(active[0].description).toBe('Just extract');
    });
  });

  describe('didTerrorLevelIncrease', () => {
    it('detects increase', () => {
      const before = { ...initializeDisruptionTrack(), terrorLevel: 1 as const };
      const after = { ...initializeDisruptionTrack(), terrorLevel: 2 as const };
      expect(didTerrorLevelIncrease(before, after)).toBe(true);
    });

    it('detects no change', () => {
      const before = initializeDisruptionTrack();
      const after = initializeDisruptionTrack();
      expect(didTerrorLevelIncrease(before, after)).toBe(false);
    });
  });

  describe('applyDisruptionEvent (GameState integration)', () => {
    it('does nothing when subsystem disabled', () => {
      const gs = makeMinimalGameState({});
      const result = applyDisruptionEvent(gs, 'elite_defeated');
      expect(result).toBe(gs); // identity, no change
    });

    it('adds disruption when enabled', () => {
      const gs = makeMinimalGameState({ disruptionTrack: true });
      const result = applyDisruptionEvent(gs, 'elite_defeated');
      expect(result.spiritIsland!.disruption!.disruption).toBe(3);
    });
  });
});

// ===========================================================================
// #2 Dual-Timing Actions Tests
// ===========================================================================

describe('Spirit Island #2: Dual-Timing Actions', () => {
  describe('initializeDualTiming', () => {
    it('creates empty state', () => {
      const state = initializeDualTiming();
      expect(state.slowQueue).toEqual([]);
      expect(state.cancelledThisRound).toEqual([]);
    });
  });

  describe('getSlowBonus', () => {
    it('returns bonus for Attack', () => {
      const bonus = getSlowBonus('Attack');
      expect(bonus).toBeDefined();
      expect(bonus!.bonusDamage).toBe(2);
      expect(bonus!.bonusPierce).toBe(1);
    });

    it('returns bonus for Rally', () => {
      const bonus = getSlowBonus('Rally');
      expect(bonus).toBeDefined();
      expect(bonus!.bonusHealing).toBe(2);
    });

    it('returns undefined for non-slowable actions', () => {
      expect(getSlowBonus('Move')).toBeUndefined();
      expect(getSlowBonus('StandUp')).toBeUndefined();
    });
  });

  describe('canBeSlowed', () => {
    it('returns true for slowable actions', () => {
      expect(canBeSlowed('Attack')).toBe(true);
      expect(canBeSlowed('UseSkill')).toBe(true);
      expect(canBeSlowed('Aim')).toBe(true);
    });

    it('returns false for non-slowable actions', () => {
      expect(canBeSlowed('Move')).toBe(false);
      expect(canBeSlowed('Dodge')).toBe(false);
    });
  });

  describe('queueSlowAction', () => {
    it('adds action to queue', () => {
      let state = initializeDualTiming();
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      state = queueSlowAction(state, 'hero-1', action, 1);
      expect(state.slowQueue).toHaveLength(1);
      expect(state.slowQueue[0].figureId).toBe('hero-1');
      expect(state.slowQueue[0].slowBonus.bonusDamage).toBe(2);
    });

    it('accepts custom bonus', () => {
      let state = initializeDualTiming();
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      state = queueSlowAction(state, 'hero-1', action, 1, { bonusDamage: 5 });
      expect(state.slowQueue[0].slowBonus.bonusDamage).toBe(5);
    });
  });

  describe('cancelSlowActionsForFigure', () => {
    it('removes defeated figure actions', () => {
      let state = initializeDualTiming();
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      state = queueSlowAction(state, 'hero-1', action, 1);
      state = queueSlowAction(state, 'hero-2', action, 1);
      state = cancelSlowActionsForFigure(state, 'hero-1');
      expect(state.slowQueue).toHaveLength(1);
      expect(state.slowQueue[0].figureId).toBe('hero-2');
      expect(state.cancelledThisRound).toContain('hero-1');
    });

    it('returns same state if no matching actions', () => {
      let state = initializeDualTiming();
      const result = cancelSlowActionsForFigure(state, 'hero-1');
      expect(result).toBe(state);
    });
  });

  describe('getPendingSlowActions', () => {
    it('filters out defeated figures', () => {
      let state = initializeDualTiming();
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      state = queueSlowAction(state, 'hero-1', action, 1);
      state = queueSlowAction(state, 'hero-2', action, 1);

      const figures = [makeFigure('hero-1', true), makeFigure('hero-2', false)];
      const pending = getPendingSlowActions(state, figures);
      expect(pending).toHaveLength(1);
      expect(pending[0].figureId).toBe('hero-2');
    });
  });

  describe('clearSlowQueue', () => {
    it('empties the queue', () => {
      let state = initializeDualTiming();
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      state = queueSlowAction(state, 'hero-1', action, 1);
      state = clearSlowQueue(state);
      expect(state.slowQueue).toEqual([]);
    });
  });

  describe('resolveSlowPhase (GameState integration)', () => {
    it('returns empty when disabled', () => {
      const gs = makeMinimalGameState({});
      const { actionsToExecute } = resolveSlowPhase(gs);
      expect(actionsToExecute).toEqual([]);
    });

    it('resolves queued actions', () => {
      const gs = makeMinimalGameState({ dualTiming: true });
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      const withAction = applySlowAction(gs, 'hero-1', action);
      const figures = [makeFigure('hero-1')];
      const gsWithFigures = { ...withAction, figures };
      const { actionsToExecute, gameState: resolved } = resolveSlowPhase(gsWithFigures);
      expect(actionsToExecute).toHaveLength(1);
      expect(resolved.spiritIsland!.dualTiming!.slowQueue).toEqual([]);
    });
  });

  describe('onFigureDefeated', () => {
    it('cancels slow actions for defeated figure', () => {
      const gs = makeMinimalGameState({ dualTiming: true });
      const action = { type: 'Attack' as const, figureId: 'hero-1', payload: { targetId: 'npc-1', weaponId: 'e-11' } };
      const withAction = applySlowAction(gs, 'hero-1', action);
      const result = onFigureDefeated(withAction, 'hero-1');
      expect(result.spiritIsland!.dualTiming!.slowQueue).toHaveLength(0);
      expect(result.spiritIsland!.dualTiming!.cancelledThisRound).toContain('hero-1');
    });
  });
});

// ===========================================================================
// #3 Imperial Threat Cadence Tests
// ===========================================================================

describe('Spirit Island #3: Imperial Threat Cadence', () => {
  describe('getPhaseForRound', () => {
    it('cycles through Scout -> Fortify -> Strike', () => {
      expect(getPhaseForRound(1)).toBe('Scout');
      expect(getPhaseForRound(2)).toBe('Fortify');
      expect(getPhaseForRound(3)).toBe('Strike');
      expect(getPhaseForRound(4)).toBe('Scout');
      expect(getPhaseForRound(5)).toBe('Fortify');
      expect(getPhaseForRound(6)).toBe('Strike');
    });
  });

  describe('getCycleCount', () => {
    it('counts completed cycles', () => {
      expect(getCycleCount(1)).toBe(0);
      expect(getCycleCount(3)).toBe(0);
      expect(getCycleCount(4)).toBe(1);
      expect(getCycleCount(7)).toBe(2);
    });
  });

  describe('advanceThreatCadence', () => {
    it('advances to correct phase', () => {
      const state = initializeThreatCadence();
      const round2 = advanceThreatCadence(state, 2);
      expect(round2.currentPhase).toBe('Fortify');
      expect(round2.phaseDisrupted).toBe(false);
    });

    it('resets zones on new cycle', () => {
      let state = initializeThreatCadence();
      state = addScoutedZones(state, [{ x: 1, y: 1 }]);
      expect(state.scoutedZones).toHaveLength(1);

      // Round 4 = new cycle
      const newCycle = advanceThreatCadence(state, 4);
      expect(newCycle.scoutedZones).toHaveLength(0);
      expect(newCycle.cycleCount).toBe(1);
    });
  });

  describe('disruptCurrentPhase', () => {
    it('marks phase as disrupted', () => {
      const state = initializeThreatCadence();
      const disrupted = disruptCurrentPhase(state);
      expect(disrupted.phaseDisrupted).toBe(true);
    });
  });

  describe('getActiveEffects', () => {
    it('returns full effects for undisrupted phase', () => {
      const state = { ...initializeThreatCadence(), currentPhase: 'Fortify' as const };
      const effects = getThreatEffects(state);
      expect(effects.threatIncomeMultiplier).toBe(1.5);
      expect(effects.imperialDefenseBonus).toBe(1);
    });

    it('reduces effects when disrupted', () => {
      const state = {
        ...initializeThreatCadence(),
        currentPhase: 'Fortify' as const,
        phaseDisrupted: true,
      };
      const effects = getThreatEffects(state);
      expect(effects.threatIncomeMultiplier).toBe(1.0); // reduced from 1.5
      expect(effects.imperialDefenseBonus).toBe(0); // halved from 1, floored
    });

    it('returns Strike bonuses', () => {
      const state = { ...initializeThreatCadence(), currentPhase: 'Strike' as const };
      const effects = getThreatEffects(state);
      expect(effects.aiBehavior).toBe('aggressive');
      expect(effects.imperialAttackBonus).toBe(1);
    });
  });

  describe('getNextPhase', () => {
    it('returns next phase in cycle', () => {
      expect(getNextPhase('Scout')).toBe('Fortify');
      expect(getNextPhase('Fortify')).toBe('Strike');
      expect(getNextPhase('Strike')).toBe('Scout');
    });
  });

  describe('getThreatIncomeMultiplier', () => {
    it('returns Scout multiplier (reduced income)', () => {
      const state = initializeThreatCadence(); // default = Scout
      expect(getThreatIncomeMultiplier(state)).toBe(0.5);
    });
  });

  describe('getFortificationBonus', () => {
    it('returns bonus for fortified position', () => {
      let state = initializeThreatCadence();
      state = addFortification(state, { x: 5, y: 5 }, 2);
      expect(getFortificationBonus(state, { x: 5, y: 5 })).toBe(2);
    });

    it('returns 0 for unfortified position', () => {
      const state = initializeThreatCadence();
      expect(getFortificationBonus(state, { x: 5, y: 5 })).toBe(0);
    });
  });

  describe('applyThreatCadenceRound (GameState integration)', () => {
    it('does nothing when disabled', () => {
      const gs = makeMinimalGameState({});
      const result = applyThreatCadenceRound(gs);
      expect(result).toBe(gs);
    });

    it('advances cadence when enabled', () => {
      const gs = makeMinimalGameState({ threatCadence: true });
      const round2 = { ...gs, roundNumber: 2 };
      const result = applyThreatCadenceRound(round2);
      expect(result.spiritIsland!.threatCadence!.currentPhase).toBe('Fortify');
    });
  });
});

// ===========================================================================
// #4 Element Synergy System Tests
// ===========================================================================

describe('Spirit Island #4: Element Synergy', () => {
  describe('initializeElementTracker', () => {
    it('creates empty tracker', () => {
      const tracker = initializeElementTracker();
      expect(tracker.heroElements).toEqual({});
      expect(tracker.activatedPowers).toEqual({});
    });
  });

  describe('addElementForAction', () => {
    it('adds Aggression for Attack', () => {
      let tracker = initializeElementTracker();
      tracker = addElementForAction(tracker, 'hero-1', 'Attack');
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Aggression).toBe(1);
    });

    it('adds Precision for Aim', () => {
      let tracker = initializeElementTracker();
      tracker = addElementForAction(tracker, 'hero-1', 'Aim');
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Precision).toBe(1);
    });

    it('adds Fortitude for GuardedStance', () => {
      let tracker = initializeElementTracker();
      tracker = addElementForAction(tracker, 'hero-1', 'GuardedStance');
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Fortitude).toBe(1);
    });

    it('adds Cunning for InteractTerminal', () => {
      let tracker = initializeElementTracker();
      tracker = addElementForAction(tracker, 'hero-1', 'InteractTerminal');
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Cunning).toBe(1);
    });

    it('does not add element for Move', () => {
      let tracker = initializeElementTracker();
      tracker = addElementForAction(tracker, 'hero-1', 'Move');
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Aggression).toBe(0);
    });

    it('accumulates elements across actions', () => {
      let tracker = initializeElementTracker();
      tracker = addElementForAction(tracker, 'hero-1', 'Attack');
      tracker = addElementForAction(tracker, 'hero-1', 'Attack');
      tracker = addElementForAction(tracker, 'hero-1', 'Attack');
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Aggression).toBe(3);
    });
  });

  describe('addElement', () => {
    it('adds specific element', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Force', 2);
      const counts = getHeroElementCounts(tracker, 'hero-1');
      expect(counts.Force).toBe(2);
    });
  });

  describe('meetsThresholds', () => {
    it('returns true when thresholds met', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 3);
      expect(meetsThresholds(tracker, 'hero-1', [{ element: 'Aggression', count: 3 }])).toBe(true);
    });

    it('returns false when thresholds not met', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 2);
      expect(meetsThresholds(tracker, 'hero-1', [{ element: 'Aggression', count: 3 }])).toBe(false);
    });

    it('requires ALL thresholds for multi-element', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 3);
      tracker = addElement(tracker, 'hero-1', 'Precision', 1);
      const thresholds = [
        { element: 'Aggression' as const, count: 3 },
        { element: 'Precision' as const, count: 2 },
      ];
      expect(meetsThresholds(tracker, 'hero-1', thresholds)).toBe(false);
    });
  });

  describe('checkInnatePowers', () => {
    it('activates powers when thresholds met', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 3);

      const { tracker: updated, newlyActivated } = checkInnatePowers(
        tracker,
        'hero-1',
        DEFAULT_INNATE_POWERS,
      );

      expect(newlyActivated).toHaveLength(1);
      expect(newlyActivated[0].id).toBe('battle-fury');
      expect(updated.activatedPowers['hero-1']).toContain('battle-fury');
    });

    it('does not re-activate already activated powers', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 3);

      const { tracker: first } = checkInnatePowers(tracker, 'hero-1', DEFAULT_INNATE_POWERS);
      const { newlyActivated } = checkInnatePowers(first, 'hero-1', DEFAULT_INNATE_POWERS);
      expect(newlyActivated).toHaveLength(0);
    });

    it('activates multiple powers at once', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 3);
      tracker = addElement(tracker, 'hero-1', 'Precision', 3);

      const { newlyActivated } = checkInnatePowers(tracker, 'hero-1', DEFAULT_INNATE_POWERS);
      const ids = newlyActivated.map(p => p.id);
      expect(ids).toContain('battle-fury');
      expect(ids).toContain('dead-eye');
    });
  });

  describe('mergeEffects', () => {
    it('stacks numeric bonuses', () => {
      const merged = mergeEffects([
        { bonusDamage: 1 },
        { bonusDamage: 2, bonusPierce: 1 },
      ]);
      expect(merged.bonusDamage).toBe(3);
      expect(merged.bonusPierce).toBe(1);
    });

    it('ORs boolean flags', () => {
      const merged = mergeEffects([
        { bonusSoak: 1 },
        { freeManeuver: true },
      ]);
      expect(merged.freeManeuver).toBe(true);
      expect(merged.bonusSoak).toBe(1);
    });
  });

  describe('getActiveEffects', () => {
    it('returns composite effects for activated powers', () => {
      let tracker = initializeElementTracker();
      tracker = addElement(tracker, 'hero-1', 'Aggression', 3);
      tracker = addElement(tracker, 'hero-1', 'Precision', 3);

      const { tracker: updated } = checkInnatePowers(tracker, 'hero-1', DEFAULT_INNATE_POWERS);
      const effects = getElementEffects(updated, 'hero-1', DEFAULT_INNATE_POWERS);
      // battle-fury (+1 dmg) + ruthless-precision (+2 dmg) = 3
      expect(effects.bonusDamage).toBe(3);
      // dead-eye (+1 pierce) + ruthless-precision (+2 pierce) = 3
      expect(effects.bonusPierce).toBe(3);
    });
  });

  describe('applyElementGeneration (GameState integration)', () => {
    it('does nothing when disabled', () => {
      const gs = makeMinimalGameState({});
      const result = applyElementGeneration(gs, 'hero-1', 'Attack');
      expect(result).toBe(gs);
    });

    it('generates elements when enabled', () => {
      const gs = makeMinimalGameState({ elementSynergy: true });
      const result = applyElementGeneration(gs, 'hero-1', 'Attack');
      const counts = getHeroElementCounts(result.spiritIsland!.elementSynergy!, 'hero-1');
      expect(counts.Aggression).toBe(1);
    });
  });
});

// ===========================================================================
// #5 Collateral Damage System Tests
// ===========================================================================

describe('Spirit Island #5: Collateral Damage', () => {
  describe('initializeCollateralDamage', () => {
    it('creates default state', () => {
      const state = initializeCollateralDamage();
      expect(state.totalCollateral).toBe(0);
      expect(state.penaltyThreshold).toBe(15);
      expect(state.xpMultiplier).toBe(1.0);
      expect(state.damagedTiles).toEqual([]);
    });

    it('accepts custom threshold', () => {
      const state = initializeCollateralDamage(10);
      expect(state.penaltyThreshold).toBe(10);
    });
  });

  describe('getTileCollateral', () => {
    it('returns 0 for undamaged tile', () => {
      const state = initializeCollateralDamage();
      expect(getTileCollateral(state, { x: 5, y: 5 })).toBe(0);
    });
  });

  describe('applyCollateralToTile', () => {
    const map = makeMinimalMap();

    it('adds damage to a tile', () => {
      let state = initializeCollateralDamage();
      state = applyCollateralToTile(state, { x: 5, y: 5 }, 1, 'Blast', map);
      expect(getTileCollateral(state, { x: 5, y: 5 })).toBe(1);
      expect(state.totalCollateral).toBe(1);
    });

    it('caps at level 3', () => {
      let state = initializeCollateralDamage();
      state = applyCollateralToTile(state, { x: 5, y: 5 }, 5, 'Blast', map);
      expect(getTileCollateral(state, { x: 5, y: 5 })).toBe(3);
    });

    it('cascades to adjacent tiles at level 3', () => {
      let state = initializeCollateralDamage();
      state = applyCollateralToTile(state, { x: 5, y: 5 }, 3, 'Blast', map);
      // Adjacent tiles should have level 1
      expect(getTileCollateral(state, { x: 4, y: 4 })).toBe(1);
      expect(getTileCollateral(state, { x: 5, y: 4 })).toBe(1);
      expect(getTileCollateral(state, { x: 6, y: 5 })).toBe(1);
    });

    it('does not cascade when disabled', () => {
      let state = initializeCollateralDamage();
      state = applyCollateralToTile(state, { x: 5, y: 5 }, 3, 'Blast', map, false);
      expect(getTileCollateral(state, { x: 4, y: 4 })).toBe(0);
    });

    it('triggers penalty threshold', () => {
      let state = initializeCollateralDamage(5);
      state = applyCollateralToTile(state, { x: 1, y: 1 }, 3, 'test', map, false);
      state = applyCollateralToTile(state, { x: 2, y: 2 }, 3, 'test', map, false);
      expect(state.penaltyTriggered).toBe(true);
      expect(state.xpMultiplier).toBe(0.75);
    });
  });

  describe('getCollateralForQuality', () => {
    it('returns config for Blast', () => {
      const result = getCollateralForQuality('Blast');
      expect(result).toEqual({ baseCollateral: 2, cascades: true });
    });

    it('returns config for Burn', () => {
      const result = getCollateralForQuality('Burn');
      expect(result).toEqual({ baseCollateral: 1, cascades: true });
    });

    it('returns null for non-collateral quality', () => {
      expect(getCollateralForQuality('Accurate')).toBeNull();
      expect(getCollateralForQuality('Pierce')).toBeNull();
    });
  });

  describe('applyWeaponCollateral', () => {
    const map = makeMinimalMap();

    it('applies collateral for weapon with Blast', () => {
      let state = initializeCollateralDamage();
      state = applyWeaponCollateral(state, { x: 5, y: 5 }, ['Blast'], map);
      expect(getTileCollateral(state, { x: 5, y: 5 })).toBe(2);
    });

    it('stacks collateral from multiple qualities', () => {
      let state = initializeCollateralDamage();
      state = applyWeaponCollateral(state, { x: 5, y: 5 }, ['Blast', 'Burn'], map);
      expect(getTileCollateral(state, { x: 5, y: 5 })).toBe(3); // 2+1, capped at 3
    });

    it('ignores non-collateral qualities', () => {
      let state = initializeCollateralDamage();
      state = applyWeaponCollateral(state, { x: 5, y: 5 }, ['Accurate', 'Pierce'], map);
      expect(state.totalCollateral).toBe(0);
    });
  });

  describe('getTilesAtLevel', () => {
    const map = makeMinimalMap();

    it('returns tiles at specific level', () => {
      let state = initializeCollateralDamage();
      state = applyCollateralToTile(state, { x: 1, y: 1 }, 1, 'test', map, false);
      state = applyCollateralToTile(state, { x: 2, y: 2 }, 2, 'test', map, false);
      const level1 = getTilesAtLevel(state, 1);
      expect(level1).toHaveLength(1);
      expect(level1[0]).toEqual({ x: 1, y: 1 });
    });
  });

  describe('getTerrainModification', () => {
    it('returns correct mods for each level', () => {
      expect(getTerrainModification(0)).toEqual({ coverRemoved: false, difficultTerrain: false, impassable: false });
      expect(getTerrainModification(1)).toEqual({ coverRemoved: true, difficultTerrain: false, impassable: false });
      expect(getTerrainModification(2)).toEqual({ coverRemoved: true, difficultTerrain: true, impassable: false });
      expect(getTerrainModification(3)).toEqual({ coverRemoved: true, difficultTerrain: true, impassable: true });
    });
  });

  describe('getXPMultiplier', () => {
    it('returns 1.0 when no penalty', () => {
      const state = initializeCollateralDamage();
      expect(getXPMultiplier(state)).toBe(1.0);
    });
  });

  describe('getCollateralSummary', () => {
    const map = makeMinimalMap();

    it('returns summary stats', () => {
      let state = initializeCollateralDamage();
      state = applyCollateralToTile(state, { x: 1, y: 1 }, 1, 'test', map, false);
      state = applyCollateralToTile(state, { x: 2, y: 2 }, 2, 'test', map, false);
      const summary = getCollateralSummary(state);
      expect(summary.tilesAffected).toBe(2);
      expect(summary.byLevel[1]).toBe(1);
      expect(summary.byLevel[2]).toBe(1);
    });
  });

  describe('applyCollateralToGameState (integration)', () => {
    it('does nothing when disabled', () => {
      const gs = makeMinimalGameState({});
      const result = applyCollateralToGameState(gs, { x: 5, y: 5 }, ['Blast']);
      expect(result).toBe(gs);
    });

    it('applies collateral when enabled', () => {
      const gs = makeMinimalGameState({ collateralDamage: true });
      const result = applyCollateralToGameState(gs, { x: 5, y: 5 }, ['Blast']);
      expect(result.spiritIsland!.collateralDamage!.totalCollateral).toBeGreaterThan(0);
    });
  });
});

// ===========================================================================
// Master Module Tests
// ===========================================================================

describe('Spirit Island Master Module', () => {
  describe('initializeSpiritIsland', () => {
    it('creates state with no subsystems', () => {
      const state = initializeSpiritIsland({});
      expect(state.subsystems).toEqual({});
      expect(state.disruption).toBeUndefined();
      expect(state.dualTiming).toBeUndefined();
    });

    it('creates state with all subsystems', () => {
      const state = initializeSpiritIsland({
        disruptionTrack: true,
        dualTiming: true,
        threatCadence: true,
        elementSynergy: true,
        collateralDamage: true,
      });
      expect(state.disruption).toBeDefined();
      expect(state.dualTiming).toBeDefined();
      expect(state.threatCadence).toBeDefined();
      expect(state.elementSynergy).toBeDefined();
      expect(state.collateralDamage).toBeDefined();
    });

    it('initializes only selected subsystems', () => {
      const state = initializeSpiritIsland({
        disruptionTrack: true,
        collateralDamage: true,
      });
      expect(state.disruption).toBeDefined();
      expect(state.dualTiming).toBeUndefined();
      expect(state.threatCadence).toBeUndefined();
      expect(state.elementSynergy).toBeUndefined();
      expect(state.collateralDamage).toBeDefined();
    });
  });

  describe('hasAnySubsystem', () => {
    it('returns false for empty state', () => {
      const gs = makeMinimalGameState({});
      expect(hasAnySubsystem(gs)).toBe(false);
    });

    it('returns true when any subsystem enabled', () => {
      const gs = makeMinimalGameState({ elementSynergy: true });
      expect(hasAnySubsystem(gs)).toBe(true);
    });

    it('returns false when spiritIsland is undefined', () => {
      const gs = { ...makeMinimalGameState({}), spiritIsland: undefined };
      expect(hasAnySubsystem(gs)).toBe(false);
    });
  });

  describe('getEnabledSubsystems', () => {
    it('returns empty for no subsystems', () => {
      expect(getEnabledSubsystems({})).toEqual([]);
    });

    it('returns names of enabled subsystems', () => {
      const names = getEnabledSubsystems({
        disruptionTrack: true,
        dualTiming: true,
      });
      expect(names).toEqual(['Disruption Track', 'Dual-Timing Actions']);
    });

    it('returns all names when all enabled', () => {
      const names = getEnabledSubsystems({
        disruptionTrack: true,
        dualTiming: true,
        threatCadence: true,
        elementSynergy: true,
        collateralDamage: true,
      });
      expect(names).toHaveLength(5);
    });
  });
});

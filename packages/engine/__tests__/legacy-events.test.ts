/**
 * Tests for the Legacy Event Deck System
 */
import { describe, it, expect } from 'vitest';
import {
  initializeLegacyDeck,
  evaluateTrigger,
  evaluateAllTriggers,
  checkForTriggeredEvents,
  applyLegacyEffect,
  resolveEvent,
  processLegacyEvents,
  acknowledgePendingEvents,
  isRuleChangeActive,
} from '../src/legacy-events';
import type { LegacyEventContext } from '../src/legacy-events';
import type {
  CampaignState,
  LegacyEventDefinition,
  LegacyEventTrigger,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-1',
    name: 'Test',
    difficulty: 'standard',
    createdAt: '2024-01-01',
    lastPlayedAt: '2024-01-01',
    heroes: {},
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['m1'],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 3,
    momentum: 0,
    legacyDeck: initializeLegacyDeck(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<LegacyEventContext> = {}): LegacyEventContext {
  return {
    campaign: makeCampaign(),
    ...overrides,
  };
}

const TEST_EVENTS: Record<string, LegacyEventDefinition> = {
  'mission-event': {
    id: 'mission-event',
    name: 'Mission Event',
    narrativeText: 'A thing happened.',
    triggers: [{ type: 'mission_complete', missionId: 'm1', outcome: 'victory' }],
    effects: [{ type: 'award_credits', amount: 100 }],
    oneShot: true,
    priority: 10,
    act: 1,
    isRevealed: true,
  },
  'act-event': {
    id: 'act-event',
    name: 'Act Event',
    narrativeText: 'New act begins.',
    triggers: [{ type: 'act_start', act: 2 }],
    effects: [
      { type: 'add_narrative_item', itemId: 'act2-intel' },
      { type: 'modify_threat_multiplier', delta: 0.1 },
    ],
    oneShot: true,
    priority: 15,
    act: 2,
    isRevealed: true,
  },
  'wound-event': {
    id: 'wound-event',
    name: 'Wounded Rally',
    narrativeText: 'Heroes rally.',
    triggers: [{ type: 'hero_wounded', heroCount: 2 }],
    effects: [{ type: 'modify_momentum', delta: -1 }],
    oneShot: true,
    priority: 5,
    act: 1,
    isRevealed: false,
  },
  'momentum-event': {
    id: 'momentum-event',
    name: 'Momentum Shift',
    narrativeText: 'Tide turns.',
    triggers: [{ type: 'momentum_threshold', minMomentum: 2 }],
    effects: [{ type: 'award_credits', amount: 75 }],
    oneShot: true,
    priority: 7,
    act: 1,
    isRevealed: true,
  },
  'missions-played-event': {
    id: 'missions-played-event',
    name: 'Crackdown',
    narrativeText: 'Imperial crackdown.',
    triggers: [{ type: 'missions_played', count: 3 }],
    effects: [{ type: 'add_rule_change', ruleId: 'curfew' }],
    oneShot: true,
    priority: 10,
    act: 1,
    isRevealed: true,
  },
  'multi-trigger': {
    id: 'multi-trigger',
    name: 'Multi-Trigger',
    narrativeText: 'Multiple conditions.',
    triggers: [
      { type: 'narrative_item', itemId: 'key-item' },
      { type: 'missions_played', count: 5 },
    ],
    effects: [{ type: 'unlock_mission', missionId: 'secret-mission' }],
    oneShot: true,
    priority: 12,
    act: 2,
    isRevealed: true,
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('Legacy Event Deck System', () => {
  describe('evaluateTrigger', () => {
    it('evaluates mission_complete trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'mission_complete', missionId: 'm1', outcome: 'victory' };
      expect(evaluateTrigger(trigger, makeContext({
        completedMissionId: 'm1', missionOutcome: 'victory',
      }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({
        completedMissionId: 'm1', missionOutcome: 'defeat',
      }))).toBe(false);
      expect(evaluateTrigger(trigger, makeContext({
        completedMissionId: 'm2', missionOutcome: 'victory',
      }))).toBe(false);
    });

    it('evaluates act_start trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'act_start', act: 2 };
      expect(evaluateTrigger(trigger, makeContext({ actStarted: 2 }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({ actStarted: 1 }))).toBe(false);
    });

    it('evaluates hero_wounded trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'hero_wounded', heroCount: 2 };
      expect(evaluateTrigger(trigger, makeContext({
        heroesWounded: ['h1', 'h2'],
      }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({
        heroesWounded: ['h1'],
      }))).toBe(false);
    });

    it('evaluates narrative_item trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'narrative_item', itemId: 'key-item' };
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ narrativeItems: ['key-item'] }),
      }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ narrativeItems: [] }),
      }))).toBe(false);
    });

    it('evaluates momentum_threshold trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'momentum_threshold', minMomentum: 2 };
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ momentum: 3 }),
      }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ momentum: 1 }),
      }))).toBe(false);
    });

    it('evaluates missions_played trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'missions_played', count: 3 };
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ missionsPlayed: 3 }),
      }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ missionsPlayed: 2 }),
      }))).toBe(false);
    });

    it('evaluates companion_recruited trigger', () => {
      const trigger: LegacyEventTrigger = { type: 'companion_recruited', companionId: 'drez' };
      expect(evaluateTrigger(trigger, makeContext({
        companionRecruited: 'drez',
      }))).toBe(true);
      expect(evaluateTrigger(trigger, makeContext({
        campaign: makeCampaign({ companions: ['drez'] }),
      }))).toBe(true);
    });
  });

  describe('evaluateAllTriggers', () => {
    it('requires ALL triggers to be satisfied', () => {
      const event = TEST_EVENTS['multi-trigger'];
      // Both conditions met
      expect(evaluateAllTriggers(event, makeContext({
        campaign: makeCampaign({ narrativeItems: ['key-item'], missionsPlayed: 5 }),
      }))).toBe(true);
      // Only one condition met
      expect(evaluateAllTriggers(event, makeContext({
        campaign: makeCampaign({ narrativeItems: ['key-item'], missionsPlayed: 2 }),
      }))).toBe(false);
    });
  });

  describe('checkForTriggeredEvents', () => {
    it('returns events whose triggers are satisfied', () => {
      const deck = initializeLegacyDeck();
      const context = makeContext({
        completedMissionId: 'm1',
        missionOutcome: 'victory',
        campaign: makeCampaign({ missionsPlayed: 3 }),
      });
      const triggered = checkForTriggeredEvents(TEST_EVENTS, deck, context);
      const ids = triggered.map(e => e.id);
      expect(ids).toContain('mission-event');
      expect(ids).toContain('missions-played-event');
    });

    it('skips already-resolved one-shot events', () => {
      const deck = {
        ...initializeLegacyDeck(),
        resolvedEventIds: ['missions-played-event'],
      };
      const context = makeContext({
        campaign: makeCampaign({ missionsPlayed: 3 }),
      });
      const triggered = checkForTriggeredEvents(TEST_EVENTS, deck, context);
      expect(triggered.map(e => e.id)).not.toContain('missions-played-event');
    });

    it('sorts by priority (highest first)', () => {
      const deck = initializeLegacyDeck();
      const context = makeContext({
        completedMissionId: 'm1',
        missionOutcome: 'victory',
        campaign: makeCampaign({ missionsPlayed: 3 }),
      });
      const triggered = checkForTriggeredEvents(TEST_EVENTS, deck, context);
      for (let i = 1; i < triggered.length; i++) {
        expect(triggered[i - 1].priority).toBeGreaterThanOrEqual(triggered[i].priority);
      }
    });
  });

  describe('applyLegacyEffect', () => {
    it('awards credits', () => {
      const campaign = makeCampaign();
      const result = applyLegacyEffect(campaign, { type: 'award_credits', amount: 100 });
      expect(result.credits).toBe(600);
    });

    it('adds narrative item', () => {
      const campaign = makeCampaign();
      const result = applyLegacyEffect(campaign, { type: 'add_narrative_item', itemId: 'intel' });
      expect(result.narrativeItems).toContain('intel');
    });

    it('does not duplicate narrative items', () => {
      const campaign = makeCampaign({ narrativeItems: ['intel'] });
      const result = applyLegacyEffect(campaign, { type: 'add_narrative_item', itemId: 'intel' });
      expect(result.narrativeItems.filter(i => i === 'intel')).toHaveLength(1);
    });

    it('removes narrative item', () => {
      const campaign = makeCampaign({ narrativeItems: ['intel', 'other'] });
      const result = applyLegacyEffect(campaign, { type: 'remove_narrative_item', itemId: 'intel' });
      expect(result.narrativeItems).not.toContain('intel');
      expect(result.narrativeItems).toContain('other');
    });

    it('unlocks mission', () => {
      const campaign = makeCampaign();
      const result = applyLegacyEffect(campaign, { type: 'unlock_mission', missionId: 'secret' });
      expect(result.availableMissionIds).toContain('secret');
    });

    it('modifies momentum', () => {
      const campaign = makeCampaign({ momentum: 1 });
      const result = applyLegacyEffect(campaign, { type: 'modify_momentum', delta: -2 });
      expect(result.momentum).toBe(-1);
    });

    it('clamps momentum to range', () => {
      const campaign = makeCampaign({ momentum: -2 });
      const result = applyLegacyEffect(campaign, { type: 'modify_momentum', delta: -5 });
      expect(result.momentum).toBe(-3);
    });

    it('modifies threat multiplier', () => {
      const campaign = makeCampaign();
      const result = applyLegacyEffect(campaign, { type: 'modify_threat_multiplier', delta: 0.15 });
      expect(result.threatMultiplier).toBeCloseTo(1.15);
    });

    it('adds companion', () => {
      const campaign = makeCampaign();
      const result = applyLegacyEffect(campaign, { type: 'add_companion', companionId: 'drez' });
      expect(result.companions).toContain('drez');
    });

    it('removes companion', () => {
      const campaign = makeCampaign({ companions: ['drez', 'kira'] });
      const result = applyLegacyEffect(campaign, { type: 'remove_companion', companionId: 'drez' });
      expect(result.companions).not.toContain('drez');
      expect(result.companions).toContain('kira');
    });

    it('adds rule change', () => {
      const campaign = makeCampaign();
      const result = applyLegacyEffect(campaign, { type: 'add_rule_change', ruleId: 'curfew' });
      expect(result.legacyDeck?.activeRuleChanges).toContain('curfew');
    });
  });

  describe('resolveEvent', () => {
    it('applies all effects and marks event as resolved', () => {
      const campaign = makeCampaign();
      const result = resolveEvent(campaign, TEST_EVENTS['mission-event']);
      expect(result.credits).toBe(600);
      expect(result.legacyDeck?.resolvedEventIds).toContain('mission-event');
    });

    it('adds revealed events to pending list', () => {
      const campaign = makeCampaign();
      const result = resolveEvent(campaign, TEST_EVENTS['mission-event']);
      expect(result.legacyDeck?.pendingEventIds).toContain('mission-event');
    });

    it('does not add unrevealed events to pending list', () => {
      const campaign = makeCampaign();
      const result = resolveEvent(campaign, TEST_EVENTS['wound-event']);
      expect(result.legacyDeck?.pendingEventIds).not.toContain('wound-event');
    });
  });

  describe('processLegacyEvents', () => {
    it('processes all triggered events', () => {
      const campaign = makeCampaign({ missionsPlayed: 3 });
      const context: LegacyEventContext = {
        campaign,
        completedMissionId: 'm1',
        missionOutcome: 'victory',
      };
      const { campaign: result, triggeredEvents } = processLegacyEvents(
        campaign, TEST_EVENTS, context,
      );
      expect(triggeredEvents.length).toBeGreaterThan(0);
      expect(result.credits).toBe(600); // mission-event awards 100
      expect(result.legacyDeck?.activeRuleChanges).toContain('curfew'); // missions-played-event
    });
  });

  describe('acknowledgePendingEvents', () => {
    it('clears pending events', () => {
      const campaign = makeCampaign({
        legacyDeck: {
          resolvedEventIds: ['e1'],
          activeRuleChanges: [],
          pendingEventIds: ['e1'],
        },
      });
      const result = acknowledgePendingEvents(campaign);
      expect(result.legacyDeck?.pendingEventIds).toHaveLength(0);
    });
  });

  describe('isRuleChangeActive', () => {
    it('detects active rule changes', () => {
      const campaign = makeCampaign({
        legacyDeck: {
          resolvedEventIds: [],
          activeRuleChanges: ['curfew'],
          pendingEventIds: [],
        },
      });
      expect(isRuleChangeActive(campaign, 'curfew')).toBe(true);
      expect(isRuleChangeActive(campaign, 'other')).toBe(false);
    });
  });
});

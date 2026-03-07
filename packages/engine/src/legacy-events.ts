/**
 * Galactic Operations - Legacy Event Deck System
 * Pandemic Legacy-inspired triggered narrative events that permanently
 * alter the campaign based on player actions and game state.
 *
 * Events are defined in JSON data files and checked after each mission
 * and during act transitions. When trigger conditions are met, effects
 * are applied to the campaign state.
 */

import type {
  LegacyEventDefinition,
  LegacyEventTrigger,
  LegacyEventEffect,
  LegacyDeckState,
  CampaignState,
  CriticalInjurySeverity,
  SectorControlLevel,
} from './types';
import {
  modifySectorControl as modifySectorControlFn,
  addSectorMutation as addSectorMutationFn,
} from './sector-control';

// ============================================================================
// DECK INITIALIZATION
// ============================================================================

/**
 * Create a fresh legacy deck state.
 */
export function initializeLegacyDeck(): LegacyDeckState {
  return {
    resolvedEventIds: [],
    activeRuleChanges: [],
    pendingEventIds: [],
  };
}

// ============================================================================
// TRIGGER EVALUATION
// ============================================================================

/**
 * Context object containing the current campaign state and recent events,
 * used to evaluate whether legacy event triggers are satisfied.
 */
export interface LegacyEventContext {
  campaign: CampaignState;
  /** Most recently completed mission ID */
  completedMissionId?: string;
  /** Outcome of the most recent mission */
  missionOutcome?: 'victory' | 'defeat' | 'draw';
  /** Act that just started (if any) */
  actStarted?: number;
  /** Act that just ended (if any) */
  actEnded?: number;
  /** Heroes wounded in the most recent mission */
  heroesWounded?: string[];
  /** Critical injuries sustained in the most recent mission */
  newCriticalInjuries?: Array<{ heroId: string; severity: CriticalInjurySeverity }>;
  /** Companion just recruited (if any) */
  companionRecruited?: string;
}

/**
 * Check whether a single trigger condition is satisfied.
 */
export function evaluateTrigger(
  trigger: LegacyEventTrigger,
  context: LegacyEventContext,
): boolean {
  switch (trigger.type) {
    case 'mission_complete':
      if (context.completedMissionId !== trigger.missionId) return false;
      if (trigger.outcome && context.missionOutcome !== trigger.outcome) return false;
      return true;

    case 'act_start':
      return context.actStarted === trigger.act;

    case 'act_end':
      return context.actEnded === trigger.act;

    case 'hero_wounded': {
      const woundedCount = (context.heroesWounded ?? []).length;
      return trigger.heroCount ? woundedCount >= trigger.heroCount : woundedCount > 0;
    }

    case 'hero_critical_injury': {
      if (!context.newCriticalInjuries || context.newCriticalInjuries.length === 0) return false;
      if (trigger.severity) {
        return context.newCriticalInjuries.some(ci => ci.severity === trigger.severity);
      }
      return true;
    }

    case 'sector_control': {
      const overworld = context.campaign.overworld;
      if (!overworld) return false;
      const sector = overworld.sectors[trigger.sectorId];
      if (!sector) return false;
      return sector.controlLevel >= trigger.minLevel;
    }

    case 'narrative_item':
      return context.campaign.narrativeItems.includes(trigger.itemId);

    case 'momentum_threshold': {
      const momentum = context.campaign.momentum ?? 0;
      if (trigger.minMomentum !== undefined && momentum < trigger.minMomentum) return false;
      if (trigger.maxMomentum !== undefined && momentum > trigger.maxMomentum) return false;
      return true;
    }

    case 'missions_played':
      return context.campaign.missionsPlayed >= trigger.count;

    case 'companion_recruited':
      return context.companionRecruited === trigger.companionId ||
        (context.campaign.companions ?? []).includes(trigger.companionId);

    default:
      return false;
  }
}

/**
 * Check all triggers for an event. ALL must be satisfied for the event to fire.
 */
export function evaluateAllTriggers(
  event: LegacyEventDefinition,
  context: LegacyEventContext,
): boolean {
  return event.triggers.every(trigger => evaluateTrigger(trigger, context));
}

// ============================================================================
// EVENT CHECKING
// ============================================================================

/**
 * Scan all events and return those whose triggers are now satisfied.
 * Respects oneShot (already-resolved events are skipped) and priority ordering.
 */
export function checkForTriggeredEvents(
  allEvents: Record<string, LegacyEventDefinition>,
  deck: LegacyDeckState,
  context: LegacyEventContext,
): LegacyEventDefinition[] {
  const resolvedSet = new Set(deck.resolvedEventIds);

  const triggered = Object.values(allEvents)
    .filter(event => {
      // Skip already-resolved one-shot events
      if (event.oneShot && resolvedSet.has(event.id)) return false;
      // Check all trigger conditions
      return evaluateAllTriggers(event, context);
    })
    .sort((a, b) => b.priority - a.priority); // Higher priority first

  return triggered;
}

// ============================================================================
// EFFECT APPLICATION
// ============================================================================

/**
 * Apply a single legacy event effect to the campaign state.
 * Returns the updated campaign state.
 *
 * Note: Some effects (like adding critical injuries to random heroes)
 * require a rollFn for randomization. The caller should handle the
 * randomized selection and pass concrete hero IDs.
 */
export function applyLegacyEffect(
  campaign: CampaignState,
  effect: LegacyEventEffect,
  resolveHeroSelector?: (selector: string) => string[],
): CampaignState {
  switch (effect.type) {
    case 'unlock_mission': {
      const available = campaign.availableMissionIds.includes(effect.missionId)
        ? campaign.availableMissionIds
        : [...campaign.availableMissionIds, effect.missionId];
      return { ...campaign, availableMissionIds: available };
    }

    case 'add_narrative_item': {
      if (campaign.narrativeItems.includes(effect.itemId)) return campaign;
      return { ...campaign, narrativeItems: [...campaign.narrativeItems, effect.itemId] };
    }

    case 'remove_narrative_item': {
      return {
        ...campaign,
        narrativeItems: campaign.narrativeItems.filter(i => i !== effect.itemId),
      };
    }

    case 'modify_sector_control': {
      if (!campaign.overworld) return campaign;
      const overworld = modifySectorControlFn(
        campaign.overworld, effect.sectorId, effect.delta, 'legacy-event',
      );
      return { ...campaign, overworld };
    }

    case 'award_credits': {
      return { ...campaign, credits: Math.max(0, campaign.credits + effect.amount) };
    }

    case 'award_xp': {
      const heroes: Record<string, typeof campaign.heroes[string]> = {};
      for (const [id, hero] of Object.entries(campaign.heroes)) {
        heroes[id] = {
          ...hero,
          xp: {
            total: hero.xp.total + effect.amount,
            available: hero.xp.available + effect.amount,
          },
        };
      }
      return { ...campaign, heroes };
    }

    case 'modify_momentum': {
      const current = campaign.momentum ?? 0;
      const newMomentum = Math.max(-3, Math.min(3, current + effect.delta));
      return { ...campaign, momentum: newMomentum };
    }

    case 'add_sector_mutation': {
      if (!campaign.overworld) return campaign;
      const overworld = addSectorMutationFn(campaign.overworld, effect.sectorId, effect.mutation);
      return { ...campaign, overworld };
    }

    case 'modify_threat_multiplier': {
      return { ...campaign, threatMultiplier: campaign.threatMultiplier + effect.delta };
    }

    case 'add_companion': {
      const companions = campaign.companions ?? [];
      if (companions.includes(effect.companionId)) return campaign;
      return { ...campaign, companions: [...companions, effect.companionId] };
    }

    case 'remove_companion': {
      const companions = campaign.companions ?? [];
      return { ...campaign, companions: companions.filter(c => c !== effect.companionId) };
    }

    case 'add_rule_change': {
      const deck = campaign.legacyDeck ?? initializeLegacyDeck();
      if (deck.activeRuleChanges.includes(effect.ruleId)) return campaign;
      return {
        ...campaign,
        legacyDeck: {
          ...deck,
          activeRuleChanges: [...deck.activeRuleChanges, effect.ruleId],
        },
      };
    }

    case 'add_critical_injury':
    case 'heal_critical_injury': {
      // These require hero selection logic -- handled by resolveEvent()
      return campaign;
    }

    default:
      return campaign;
  }
}

/**
 * Fully resolve a legacy event: mark it as resolved, apply all effects,
 * and add to pending reveals if appropriate.
 */
export function resolveEvent(
  campaign: CampaignState,
  event: LegacyEventDefinition,
): CampaignState {
  let result = campaign;

  // Apply all effects
  for (const effect of event.effects) {
    result = applyLegacyEffect(result, effect);
  }

  // Update deck state
  const deck = result.legacyDeck ?? initializeLegacyDeck();
  const updatedDeck: LegacyDeckState = {
    ...deck,
    resolvedEventIds: [...deck.resolvedEventIds, event.id],
    pendingEventIds: event.isRevealed
      ? [...deck.pendingEventIds, event.id]
      : deck.pendingEventIds,
  };

  return { ...result, legacyDeck: updatedDeck };
}

/**
 * Process all triggered events for the current context.
 * Returns the updated campaign and list of events that fired.
 */
export function processLegacyEvents(
  campaign: CampaignState,
  allEvents: Record<string, LegacyEventDefinition>,
  context: LegacyEventContext,
): { campaign: CampaignState; triggeredEvents: LegacyEventDefinition[] } {
  const deck = campaign.legacyDeck ?? initializeLegacyDeck();
  const campaignWithDeck = campaign.legacyDeck ? campaign : { ...campaign, legacyDeck: deck };

  const triggered = checkForTriggeredEvents(allEvents, deck, context);

  let result = campaignWithDeck;
  for (const event of triggered) {
    result = resolveEvent(result, event);
  }

  return { campaign: result, triggeredEvents: triggered };
}

/**
 * Acknowledge pending events (mark them as seen by the player).
 */
export function acknowledgePendingEvents(
  campaign: CampaignState,
): CampaignState {
  const deck = campaign.legacyDeck;
  if (!deck || deck.pendingEventIds.length === 0) return campaign;

  return {
    ...campaign,
    legacyDeck: {
      ...deck,
      pendingEventIds: [],
    },
  };
}

/**
 * Check if a rule change is active in the current campaign.
 */
export function isRuleChangeActive(
  campaign: CampaignState,
  ruleId: string,
): boolean {
  return (campaign.legacyDeck?.activeRuleChanges ?? []).includes(ruleId);
}

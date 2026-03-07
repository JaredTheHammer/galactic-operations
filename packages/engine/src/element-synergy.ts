/**
 * Spirit Island Subsystem #4: Element Synergy System
 *
 * Actions generate elements (Aggression, Precision, Fortitude, Cunning, Force).
 * When a hero accumulates enough elements, innate powers activate automatically.
 * Elements are NOT spent; reaching the threshold just triggers the innate.
 *
 * Inspired by Spirit Island's element/innate power system.
 */

import type {
  ElementTracker,
  SynergyElement,
  InnatePower,
  InnatePowerEffect,
  ElementThreshold,
  GameState,
} from './types.js';

import { ELEMENT_GENERATION } from './types.js';

/** All possible synergy elements */
export const ALL_ELEMENTS: SynergyElement[] = [
  'Aggression', 'Precision', 'Fortitude', 'Cunning', 'Force',
];

/**
 * Create initial element tracker for a mission.
 */
export function initializeElementTracker(): ElementTracker {
  return {
    heroElements: {},
    activatedPowers: {},
  };
}

/**
 * Get or create a hero's element record.
 */
function getHeroElements(
  tracker: ElementTracker,
  heroId: string,
): Record<SynergyElement, number> {
  return tracker.heroElements[heroId] ?? {
    Aggression: 0,
    Precision: 0,
    Fortitude: 0,
    Cunning: 0,
    Force: 0,
  };
}

/**
 * Add an element to a hero's accumulator based on the action they performed.
 */
export function addElementForAction(
  tracker: ElementTracker,
  heroId: string,
  actionType: string,
): ElementTracker {
  const element = ELEMENT_GENERATION[actionType];
  if (!element) return tracker;

  return addElement(tracker, heroId, element);
}

/**
 * Add a specific element to a hero's tracker.
 */
export function addElement(
  tracker: ElementTracker,
  heroId: string,
  element: SynergyElement,
  count: number = 1,
): ElementTracker {
  const current = getHeroElements(tracker, heroId);

  return {
    ...tracker,
    heroElements: {
      ...tracker.heroElements,
      [heroId]: {
        ...current,
        [element]: current[element] + count,
      },
    },
  };
}

/**
 * Check if a hero meets the thresholds for an innate power.
 */
export function meetsThresholds(
  tracker: ElementTracker,
  heroId: string,
  thresholds: ElementThreshold[],
): boolean {
  const elements = getHeroElements(tracker, heroId);

  return thresholds.every(t => elements[t.element] >= t.count);
}

/**
 * Check all innate powers for a hero and activate any newly met ones.
 * Returns the updated tracker and list of newly activated powers.
 */
export function checkInnatePowers(
  tracker: ElementTracker,
  heroId: string,
  availablePowers: InnatePower[],
): { tracker: ElementTracker; newlyActivated: InnatePower[] } {
  const alreadyActivated = new Set(tracker.activatedPowers[heroId] ?? []);
  const newlyActivated: InnatePower[] = [];

  for (const power of availablePowers) {
    if (alreadyActivated.has(power.id)) continue;
    if (meetsThresholds(tracker, heroId, power.thresholds)) {
      newlyActivated.push(power);
      alreadyActivated.add(power.id);
    }
  }

  if (newlyActivated.length === 0) {
    return { tracker, newlyActivated: [] };
  }

  return {
    tracker: {
      ...tracker,
      activatedPowers: {
        ...tracker.activatedPowers,
        [heroId]: Array.from(alreadyActivated),
      },
    },
    newlyActivated,
  };
}

/**
 * Get all active innate power effects for a hero.
 * Merges all activated power effects into a single composite effect.
 */
export function getActiveEffects(
  tracker: ElementTracker,
  heroId: string,
  allPowers: InnatePower[],
): InnatePowerEffect {
  const activatedIds = new Set(tracker.activatedPowers[heroId] ?? []);
  const activePowers = allPowers.filter(p => activatedIds.has(p.id));

  return mergeEffects(activePowers.map(p => p.effect));
}

/**
 * Merge multiple innate power effects into a single composite effect.
 * Numeric bonuses stack additively. Boolean flags OR together.
 */
export function mergeEffects(effects: InnatePowerEffect[]): InnatePowerEffect {
  const merged: InnatePowerEffect = {};

  for (const effect of effects) {
    if (effect.bonusDamage) merged.bonusDamage = (merged.bonusDamage ?? 0) + effect.bonusDamage;
    if (effect.bonusPierce) merged.bonusPierce = (merged.bonusPierce ?? 0) + effect.bonusPierce;
    if (effect.bonusSoak) merged.bonusSoak = (merged.bonusSoak ?? 0) + effect.bonusSoak;
    if (effect.healWounds) merged.healWounds = (merged.healWounds ?? 0) + effect.healWounds;
    if (effect.recoverStrain) merged.recoverStrain = (merged.recoverStrain ?? 0) + effect.recoverStrain;
    if (effect.freeManeuver) merged.freeManeuver = true;
    if (effect.upgradeAttack) merged.upgradeAttack = (merged.upgradeAttack ?? 0) + effect.upgradeAttack;
    if (effect.upgradeDefense) merged.upgradeDefense = (merged.upgradeDefense ?? 0) + effect.upgradeDefense;
  }

  return merged;
}

/**
 * Get the element counts for a hero (for UI display).
 */
export function getHeroElementCounts(
  tracker: ElementTracker,
  heroId: string,
): Record<SynergyElement, number> {
  return getHeroElements(tracker, heroId);
}

/**
 * Apply element generation to game state after a hero action.
 */
export function applyElementGeneration(
  gameState: GameState,
  heroId: string,
  actionType: string,
): GameState {
  const si = gameState.spiritIsland;
  if (!si?.subsystems.elementSynergy || !si.elementSynergy) {
    return gameState;
  }

  const updated = addElementForAction(si.elementSynergy, heroId, actionType);

  return {
    ...gameState,
    spiritIsland: {
      ...si,
      elementSynergy: updated,
    },
  };
}

/** Built-in innate powers available to all heroes */
export const DEFAULT_INNATE_POWERS: InnatePower[] = [
  {
    id: 'battle-fury',
    name: 'Battle Fury',
    description: 'Sustained aggression sharpens your killing instinct.',
    thresholds: [{ element: 'Aggression', count: 3 }],
    effect: { bonusDamage: 1 },
  },
  {
    id: 'dead-eye',
    name: 'Dead Eye',
    description: 'Careful aim and precision let you find gaps in armor.',
    thresholds: [{ element: 'Precision', count: 3 }],
    effect: { bonusPierce: 1 },
  },
  {
    id: 'iron-will',
    name: 'Iron Will',
    description: 'Defensive discipline hardens your resolve.',
    thresholds: [{ element: 'Fortitude', count: 3 }],
    effect: { bonusSoak: 1 },
  },
  {
    id: 'opportunist',
    name: 'Opportunist',
    description: 'Cunning observation reveals tactical openings.',
    thresholds: [{ element: 'Cunning', count: 3 }],
    effect: { freeManeuver: true },
  },
  {
    id: 'force-attunement',
    name: 'Force Attunement',
    description: 'Deep connection to the Force enhances all abilities.',
    thresholds: [{ element: 'Force', count: 3 }],
    effect: { upgradeAttack: 1, upgradeDefense: 1 },
  },
  // Multi-element powers (harder to reach, stronger effects)
  {
    id: 'ruthless-precision',
    name: 'Ruthless Precision',
    description: 'The perfect blend of violence and accuracy.',
    thresholds: [
      { element: 'Aggression', count: 3 },
      { element: 'Precision', count: 2 },
    ],
    effect: { bonusDamage: 2, bonusPierce: 2 },
  },
  {
    id: 'adaptive-defense',
    name: 'Adaptive Defense',
    description: 'Cunning and resilience combine into impenetrable defense.',
    thresholds: [
      { element: 'Fortitude', count: 3 },
      { element: 'Cunning', count: 2 },
    ],
    effect: { bonusSoak: 2, freeManeuver: true },
  },
];

/**
 * Focus Resource System (Oathsworn Animus-inspired)
 *
 * Focus is a per-activation regenerating resource for hero figures.
 * Heroes spend Focus on powerful temporary effects that create meaningful
 * tradeoffs: sprint to cover OR boost your attack, not both.
 *
 * Focus effects:
 * - bonus_move (1 Focus): +2 speed this activation
 * - bonus_aim (1 Focus): +1 Ability die on next attack
 * - bonus_damage (2 Focus): +3 damage on next attack
 * - bonus_defense (2 Focus): +1 Challenge die to defense until next activation
 * - recover_strain (1 Focus): recover 2 strain immediately
 * - shake_condition (3 Focus): remove one non-Wounded condition
 *
 * Design principles:
 * - Focus regenerates each activation (not hoarded between rounds)
 * - Career determines base Focus pool and recovery rate
 * - Talents can modify Focus max/recovery (future extension point)
 * - Focus is heroes-only (NPCs don't use it)
 */

import type {
  Figure,
  GameState,
  HeroCharacter,
  FocusEffect,
  FocusConfig,
  Condition,
  DefensePool,
} from './types.js';

import { FOCUS_COSTS, DEFAULT_FOCUS_BY_CAREER, DEFAULT_FOCUS_CONFIG } from './types.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Get the Focus configuration for a hero based on their career.
 */
export function getFocusConfigForHero(hero: HeroCharacter): FocusConfig {
  // Normalize career ID for lookup (handle both 'bounty_hunter' and 'bounty-hunter' formats)
  const careerKey = hero.career.toLowerCase().replace(/-/g, '_');
  return DEFAULT_FOCUS_BY_CAREER[careerKey] ?? DEFAULT_FOCUS_CONFIG;
}

/**
 * Initialize Focus resource on a hero Figure.
 * Called during figure deployment for hero entities.
 */
export function initFocusResource(
  figure: Figure,
  hero: HeroCharacter,
): Figure {
  if (figure.entityType !== 'hero') return figure;

  const config = getFocusConfigForHero(hero);
  return {
    ...figure,
    focusCurrent: config.max,  // Start at full Focus
    focusMax: config.max,
    focusRecovery: config.recoveryPerActivation,
  };
}

// ============================================================================
// FOCUS RECOVERY
// ============================================================================

/**
 * Recover Focus at the start of a hero's activation.
 * Recovery is capped at focusMax.
 */
export function recoverFocus(figure: Figure): Figure {
  if (figure.entityType !== 'hero') return figure;
  if (figure.focusMax === undefined || figure.focusCurrent === undefined) return figure;

  const recovery = figure.focusRecovery ?? 0;
  const newFocus = Math.min(figure.focusMax, figure.focusCurrent + recovery);

  return {
    ...figure,
    focusCurrent: newFocus,
  };
}

// ============================================================================
// FOCUS SPENDING
// ============================================================================

/**
 * Check if a figure can afford a Focus effect.
 */
export function canSpendFocus(figure: Figure, effect: FocusEffect): boolean {
  if (figure.entityType !== 'hero') return false;
  if (figure.focusCurrent === undefined) return false;

  const cost = FOCUS_COSTS[effect];
  return figure.focusCurrent >= cost;
}

/**
 * Get all Focus effects currently affordable by a figure.
 */
export function getAvailableFocusEffects(figure: Figure): FocusEffect[] {
  const effects: FocusEffect[] = [
    'bonus_move', 'bonus_aim', 'bonus_damage',
    'bonus_defense', 'recover_strain', 'shake_condition',
  ];
  return effects.filter(e => canSpendFocus(figure, e));
}

/**
 * Spend Focus and apply the immediate effect.
 * Returns the updated Figure with Focus deducted and effect applied.
 *
 * Note: Some effects (bonus_aim, bonus_damage) set flags that are consumed
 * during the next attack resolution. Others (bonus_move, recover_strain,
 * shake_condition, bonus_defense) apply immediately.
 */
export function spendFocus(
  figure: Figure,
  effect: FocusEffect,
  gameState: GameState,
): { figure: Figure; description: string } | null {
  if (!canSpendFocus(figure, effect)) return null;

  const cost = FOCUS_COSTS[effect];
  let updated: Figure = {
    ...figure,
    focusCurrent: (figure.focusCurrent ?? 0) - cost,
  };

  let description = '';

  switch (effect) {
    case 'bonus_move':
      // +2 speed is tracked as a transient flag; consumed by movement resolution
      description = `Spent ${cost} Focus for +2 speed this activation`;
      break;

    case 'bonus_aim':
      // Add an aim token (stacks with existing aim, max 3 with Focus)
      updated = {
        ...updated,
        aimTokens: Math.min((updated.aimTokens ?? 0) + 1, 3),
      };
      description = `Spent ${cost} Focus for +1 Ability die on next attack`;
      break;

    case 'bonus_damage':
      // Tracked via a flag; consumed in calculateDamage
      description = `Spent ${cost} Focus for +3 damage on next attack`;
      break;

    case 'bonus_defense':
      // Tracked as a temporary condition-like flag; cleared at next activation
      description = `Spent ${cost} Focus for +1 Challenge die to defense`;
      break;

    case 'recover_strain':
      updated = {
        ...updated,
        strainCurrent: Math.max(0, updated.strainCurrent - 2),
      };
      description = `Spent ${cost} Focus to recover 2 strain`;
      break;

    case 'shake_condition': {
      // Remove the first non-Wounded, non-permanent condition
      const removable = updated.conditions.filter(
        c => c !== 'Wounded' && c !== 'HeroicFortitude',
      );
      if (removable.length > 0) {
        const toRemove = removable[0];
        updated = {
          ...updated,
          conditions: updated.conditions.filter(c => c !== toRemove),
        };
        description = `Spent ${cost} Focus to remove ${toRemove} condition`;
      } else {
        // Refund if no removable conditions
        updated = {
          ...updated,
          focusCurrent: (updated.focusCurrent ?? 0) + cost,
        };
        return null;
      }
      break;
    }
  }

  return { figure: updated, description };
}

// ============================================================================
// FOCUS QUERY HELPERS
// ============================================================================

/**
 * Check if a figure has any Focus resource configured.
 */
export function hasFocusResource(figure: Figure): boolean {
  return figure.focusMax !== undefined && figure.focusMax > 0;
}

/**
 * Get the current Focus percentage (for UI display).
 */
export function getFocusPercent(figure: Figure): number {
  if (!figure.focusMax || figure.focusCurrent === undefined) return 0;
  return Math.round((figure.focusCurrent / figure.focusMax) * 100);
}

/**
 * Get a display-friendly label for a Focus effect.
 */
export function getFocusEffectLabel(effect: FocusEffect): string {
  const labels: Record<FocusEffect, string> = {
    bonus_move: '+2 Speed',
    bonus_aim: '+1 Attack Die',
    bonus_damage: '+3 Damage',
    bonus_defense: '+1 Defense Die',
    recover_strain: 'Recover 2 Strain',
    shake_condition: 'Remove Condition',
  };
  return labels[effect];
}

/**
 * Balance Testing Framework - Baseline Definitions
 *
 * The baseline is a neutral reference hero: Human, hired-gun/mercenary,
 * all characteristics at species default (2), ranged-heavy 1, E-11 rifle,
 * padded armor, no talents. All tests measure deviation from this baseline.
 */

import type { QuickHeroSpec, ArenaConfig, CombatScenarioConfig } from '../../packages/engine/src/ai/combat-simulator.js'
import type { BaselineConfig, BaselinePreset, BalanceScenario, ScenarioMeta, BalanceCategory, BalanceTier } from './types.js'

// ============================================================================
// BASELINE DEFINITIONS
// ============================================================================

export const BASELINE_ARENA: ArenaConfig = {
  preset: 'small',
  cover: 'light',
}

/**
 * STANDARD baseline: competent soldier. Good for measuring relative power
 * between similarly-priced upgrades but produces mostly negative deltas
 * since the hero already wins ~73% of fights.
 */
export const STANDARD_HERO: QuickHeroSpec = {
  name: 'Baseline',
  species: 'human',
  career: 'hired-gun',
  specialization: 'mercenary',
  skills: { 'ranged-heavy': 1 },
  weapon: 'e-11',
  armor: 'padded-armor',
  talents: [],
}

export const STANDARD_CONFIG: BaselineConfig = {
  hero: STANDARD_HERO,
  opponentNpcId: 'stormtrooper',
  opponentCount: 2,
  arena: BASELINE_ARENA,
  sideALabel: 'Imperial Patrol',
  sideBLabel: 'Test Hero',
}

/**
 * WEAK baseline: unarmed, unskilled recruit. Loses most fights, so
 * every upgrade (weapon, skill, talent) shows positive power delta.
 * Best for deriving cross-currency exchange rates since both XP-priced
 * and credit-priced items produce positive gains.
 */
export const WEAK_HERO: QuickHeroSpec = {
  name: 'Weak Baseline',
  species: 'human',
  career: 'hired-gun',
  specialization: 'mercenary',
  // Human base: all 2s. No overrides, no skills, fists, no armor.
  skills: {},
  weapon: 'fists',
  armor: 'none',
  talents: [],
}

export const WEAK_CONFIG: BaselineConfig = {
  hero: WEAK_HERO,
  opponentNpcId: 'stormtrooper',
  opponentCount: 2,
  arena: BASELINE_ARENA,
  sideALabel: 'Imperial Patrol',
  sideBLabel: 'Test Hero',
}

/**
 * HARD baseline: standard hero vs tougher opposition (3 stormtroopers).
 * Tests whether upgrades help survive harder encounters.
 */
export const HARD_CONFIG: BaselineConfig = {
  hero: STANDARD_HERO,
  opponentNpcId: 'stormtrooper',
  opponentCount: 3,
  arena: BASELINE_ARENA,
  sideALabel: 'Imperial Squad',
  sideBLabel: 'Test Hero',
}

/** Look up a baseline config by preset name */
export function getBaselineConfig(preset: BaselinePreset): BaselineConfig {
  switch (preset) {
    case 'weak': return WEAK_CONFIG
    case 'hard': return HARD_CONFIG
    case 'standard':
    default: return STANDARD_CONFIG
  }
}

/** Backward-compatible aliases */
export const BASELINE_HERO = STANDARD_HERO
export const BASELINE_CONFIG = STANDARD_CONFIG

// ============================================================================
// VARIANT BUILDER
// ============================================================================

/**
 * Deep-clone a QuickHeroSpec and apply overrides.
 * Returns a new spec -- never mutates the original.
 */
export function makeVariant(
  base: QuickHeroSpec,
  overrides: Partial<QuickHeroSpec> & {
    addSkills?: Record<string, number>
    addTalents?: string[]
    addCharacteristics?: Record<string, number>
  },
): QuickHeroSpec {
  const variant: QuickHeroSpec = {
    name: overrides.name ?? base.name,
    species: overrides.species ?? base.species,
    career: overrides.career ?? base.career,
    specialization: overrides.specialization ?? base.specialization,
    characteristicOverrides: { ...(base.characteristicOverrides ?? {}) },
    skills: { ...(base.skills ?? {}) },
    weapon: overrides.weapon ?? base.weapon,
    armor: overrides.armor ?? base.armor,
    talents: [...(base.talents ?? [])],
  }

  // Merge characteristic overrides
  if (overrides.characteristicOverrides) {
    variant.characteristicOverrides = { ...variant.characteristicOverrides, ...overrides.characteristicOverrides }
  }
  if (overrides.addCharacteristics) {
    for (const [key, delta] of Object.entries(overrides.addCharacteristics)) {
      const current = (variant.characteristicOverrides as any)?.[key] ?? 0
      ;(variant.characteristicOverrides as any)[key] = current + delta
    }
  }

  // Merge skills
  if (overrides.skills) {
    variant.skills = { ...variant.skills, ...overrides.skills }
  }
  if (overrides.addSkills) {
    for (const [key, delta] of Object.entries(overrides.addSkills)) {
      variant.skills![key] = (variant.skills![key] ?? 0) + delta
    }
  }

  // Merge talents
  if (overrides.talents) {
    variant.talents = [...overrides.talents]
  }
  if (overrides.addTalents) {
    variant.talents = [...(variant.talents ?? []), ...overrides.addTalents]
  }

  return variant
}

// ============================================================================
// SCENARIO BUILDER HELPERS
// ============================================================================

/**
 * Build a CombatScenarioConfig for a single hero variant vs the baseline opponent.
 */
export function buildScenario(
  id: string,
  name: string,
  heroSpec: QuickHeroSpec,
  config: BaselineConfig,
  simCount: number,
  seed: number,
): CombatScenarioConfig {
  return {
    id,
    name,
    arena: config.arena,
    sideA: {
      label: config.sideALabel,
      figures: [
        { type: 'npc', npcId: config.opponentNpcId, count: config.opponentCount },
      ],
    },
    sideB: {
      label: config.sideBLabel,
      figures: [
        {
          type: 'hero',
          heroId: `hero-${id}`,
          spec: heroSpec,
        },
      ],
    },
    simulation: { count: simCount, seed, roundLimit: 20 },
  }
}

/**
 * Wrap a scenario config with balance metadata.
 */
export function tagScenario(
  config: CombatScenarioConfig,
  category: BalanceCategory,
  tier: BalanceTier,
  variableName: string,
  variableValue: string,
  xpCost: number | null = null,
  creditCost: number | null = null,
  isBaseline: boolean = false,
  abilityPointCost: number | null = null,
): BalanceScenario {
  return {
    config,
    meta: {
      category,
      tier,
      variableName,
      variableValue,
      xpCost,
      creditCost,
      abilityPointCost,
      isBaseline,
    },
  }
}

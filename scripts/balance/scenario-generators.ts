/**
 * Balance Testing Framework - Scenario Generators
 *
 * Each generator produces BalanceScenario[] where exactly one variable
 * changes from baseline. The generators read game data at runtime so
 * they stay in sync with data file changes.
 */

import type { GameData, CharacteristicName } from '../../packages/engine/src/types.js'
import type { QuickHeroSpec } from '../../packages/engine/src/ai/combat-simulator.js'
import type { BalanceScenario, BaselineConfig, BalanceCategory } from './types.js'
import { makeVariant, buildScenario, tagScenario, BASELINE_HERO } from './baseline.js'

// ============================================================================
// TIER 1: SINGLE VARIABLE ISOLATION
// ============================================================================

const CHARACTERISTICS: CharacteristicName[] = [
  'brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence',
]

/** XP cost table for characteristic increases (cumulative from species base) */
const CHAR_XP_COST: Record<number, number> = {
  1: 10, // +1 from base
  2: 20, // +2 from base
  3: 30, // +3 from base
  4: 40, // +4 from base
}

/** Max characteristic value enforced by the engine */
const MAX_CHARACTERISTIC = 5

/**
 * Tier 1: Characteristics -- 6 chars x up to 3 delta levels.
 * Each test bumps one characteristic by +1..+N from species base,
 * capped at the engine maximum (5).
 */
export function generateCharacteristicScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  // Look up species base characteristics to know the starting values
  const speciesData = gameData.species[baseline.hero.species]
  const speciesChars = (speciesData as any)?.characteristics ?? {}

  for (const char of CHARACTERISTICS) {
    const baseValue = speciesChars[char] ?? 2 // human default is 2
    const maxDelta = MAX_CHARACTERISTIC - baseValue

    for (let delta = 1; delta <= Math.min(4, maxDelta); delta++) {
      const id = `char-${char}-plus${delta}`
      const variant = makeVariant(baseline.hero, {
        name: `${char.charAt(0).toUpperCase() + char.slice(1)} +${delta}`,
        addCharacteristics: { [char]: delta },
      })
      const cumulativeXP = Array.from({ length: delta }, (_, i) => CHAR_XP_COST[i + 1]).reduce((a, b) => a + b, 0)
      const config = buildScenario(id, `${char} +${delta}`, variant, baseline, simCount, seed)
      scenarios.push(tagScenario(config, 'characteristic', 1, char, `+${delta}`, cumulativeXP))
    }
  }

  return scenarios
}

/** Combat-relevant skills and their rank XP costs */
const COMBAT_SKILLS = [
  'ranged-heavy', 'ranged-light', 'melee', 'brawl', 'gunnery',
  'athletics', 'cool', 'discipline', 'resilience', 'vigilance',
  'coordination', 'perception', 'stealth',
]

/** XP cost per rank for career skills (cheaper) vs non-career */
const SKILL_XP_COST_CAREER: Record<number, number> = { 1: 5, 2: 10, 3: 15 }
const SKILL_XP_COST_NONCAREER: Record<number, number> = { 1: 10, 2: 15, 3: 20 }

/**
 * Tier 1: Skills -- each combat-relevant skill at ranks 1, 2, 3.
 * Baseline has ranged-heavy 1, so variants override/add to that.
 */
export function generateSkillScenarios(
  baseline: BaselineConfig,
  _gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []
  const hiredGunCareerSkills = new Set([
    'athletics', 'brawl', 'discipline', 'melee',
    'ranged-heavy', 'ranged-light', 'resilience', 'vigilance',
  ])

  for (const skill of COMBAT_SKILLS) {
    for (let rank = 1; rank <= 3; rank++) {
      // Skip ranged-heavy 1 -- that IS the baseline
      if (skill === 'ranged-heavy' && rank === 1) continue

      const id = `skill-${skill}-r${rank}`
      const variant = makeVariant(baseline.hero, {
        name: `${skill} rank ${rank}`,
        skills: { ...baseline.hero.skills, [skill]: rank },
      })

      const isCareer = hiredGunCareerSkills.has(skill)
      const costTable = isCareer ? SKILL_XP_COST_CAREER : SKILL_XP_COST_NONCAREER
      const cumulativeXP = Array.from({ length: rank }, (_, i) => costTable[i + 1]).reduce((a, b) => a + b, 0)

      const config = buildScenario(id, `${skill} rank ${rank}`, variant, baseline, simCount, seed)
      scenarios.push(tagScenario(config, 'skill', 1, skill, `rank ${rank}`, cumulativeXP))
    }
  }

  return scenarios
}

/**
 * Tier 1: Weapons -- swap baseline E-11 for each weapon, adjusting skill to match.
 * This isolates weapon power from skill mismatch.
 */
export function generateWeaponScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []
  const weapons = gameData.weapons

  for (const [weaponId, weapon] of Object.entries(weapons)) {
    // Skip the baseline weapon (e-11) -- already covered
    if (weaponId === baseline.hero.weapon) continue

    const id = `weapon-${weaponId}`
    // Give the hero rank 1 in the weapon's required skill
    const weaponSkill = (weapon as any).skill as string
    const skills: Record<string, number> = { [weaponSkill]: 1 }

    const variant = makeVariant(baseline.hero, {
      name: weapon.name,
      weapon: weaponId,
      skills,
    })

    const config = buildScenario(id, weapon.name, variant, baseline, simCount, seed)
    scenarios.push(tagScenario(config, 'weapon', 1, 'weapon', weaponId, null, (weapon as any).cost ?? null))
  }

  return scenarios
}

/**
 * Tier 1: Armor -- swap baseline padded-armor for each armor type.
 */
export function generateArmorScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []
  const armorData = gameData.armor

  for (const [armorId, armor] of Object.entries(armorData)) {
    if (armorId === baseline.hero.armor) continue

    const id = `armor-${armorId}`
    const variant = makeVariant(baseline.hero, {
      name: armor.name,
      armor: armorId,
    })

    const config = buildScenario(id, armor.name, variant, baseline, simCount, seed)
    scenarios.push(tagScenario(config, 'armor', 1, 'armor', armorId, null, (armor as any).cost ?? null))
  }

  return scenarios
}

/**
 * Tier 1: Talents -- each individual talent from all 6 specialization files.
 * The hero keeps baseline stats and just gains one talent.
 *
 * XP cost approximation: tier * 5 for the talent itself.
 */
export function generateTalentScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []
  const specs = gameData.specializations

  if (!specs) return scenarios

  for (const [specId, specData] of Object.entries(specs)) {
    const talents = (specData as any).talents as Array<{
      id: string
      name: string
      tier: number
      mechanicalEffect?: { type: string }
    }>
    if (!talents) continue

    for (const talent of talents) {
      // Skip talents with no mechanical effect -- they won't change combat outcomes
      if (!talent.mechanicalEffect) continue

      const id = `talent-${talent.id}`
      const variant = makeVariant(baseline.hero, {
        name: talent.name,
        addTalents: [talent.id],
      })

      const xpCost = talent.tier * 5
      const config = buildScenario(id, `${talent.name} (${specId})`, variant, baseline, simCount, seed)
      scenarios.push(tagScenario(config, 'talent', 1, specId, talent.id, xpCost))
    }
  }

  return scenarios
}

/**
 * Tier 1: Species -- each non-human species with the same career/spec/weapon/armor.
 * The characteristicOverrides are computed as deltas from the target species base
 * to reach the same effective stats as baseline (human all-2s), BUT we actually
 * want to test the species raw -- so we use NO overrides, letting species base
 * characteristics speak for themselves.
 */
export function generateSpeciesScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []
  const speciesData = gameData.species

  for (const [speciesId, species] of Object.entries(speciesData)) {
    if (speciesId === baseline.hero.species) continue

    const id = `species-${speciesId}`
    // No characteristicOverrides -- use species raw base stats
    const variant = makeVariant(baseline.hero, {
      name: species.name,
      species: speciesId,
      characteristicOverrides: {}, // reset -- use species defaults
    })

    const xpDelta = (species as any).startingXP - 110 // vs human's 110
    const config = buildScenario(id, species.name, variant, baseline, simCount, seed)
    scenarios.push(tagScenario(config, 'species', 1, 'species', speciesId, xpDelta))
  }

  return scenarios
}

// ============================================================================
// TIER 2: SYNERGY & COMBINATION TESTS
// ============================================================================

/** Weapon archetypes for synergy testing */
const WEAPON_ARCHETYPES: Array<{
  label: string
  weaponId: string
  skill: string
  primaryChar: CharacteristicName
}> = [
  { label: 'Ranged Heavy', weaponId: 'e-11', skill: 'ranged-heavy', primaryChar: 'agility' },
  { label: 'Ranged Light', weaponId: 'dl-44', skill: 'ranged-light', primaryChar: 'agility' },
  { label: 'Melee', weaponId: 'vibro-blade', skill: 'melee', primaryChar: 'brawn' },
  { label: 'Brawl', weaponId: 'fists', skill: 'brawl', primaryChar: 'brawn' },
  { label: 'Heavy Ranged', weaponId: 'a280', skill: 'ranged-heavy', primaryChar: 'agility' },
  { label: 'Lightsaber', weaponId: 'lightsaber', skill: 'melee', primaryChar: 'brawn' },
]

/**
 * Tier 2: Weapon + skill rank sweeps.
 * For each archetype, test weapon with skill ranks 1-3 and primary char +1-2.
 * Costs: weapon credit cost + skill XP (career rates) + characteristic XP.
 */
export function generateWeaponSkillSynergyScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  for (const arch of WEAPON_ARCHETYPES) {
    const weaponCreditCost = (gameData.weapons[arch.weaponId] as any)?.cost ?? 0

    for (let skillRank = 1; skillRank <= 3; skillRank++) {
      for (let charDelta = 0; charDelta <= 2; charDelta++) {
        // Skip the pure-baseline combo (e-11, ranged-heavy 1, no char bonus)
        if (arch.weaponId === 'e-11' && skillRank === 1 && charDelta === 0) continue

        const id = `synergy-${arch.label.replace(/\s+/g, '-').toLowerCase()}-s${skillRank}-c${charDelta}`
        const variant = makeVariant(baseline.hero, {
          name: `${arch.label} S${skillRank} C+${charDelta}`,
          weapon: arch.weaponId,
          skills: { [arch.skill]: skillRank },
          addCharacteristics: charDelta > 0 ? { [arch.primaryChar]: charDelta } : undefined,
        })

        // Compute XP cost: skill ranks + characteristic boosts
        const skillXP = Array.from({ length: skillRank }, (_, i) => SKILL_XP_COST_CAREER[i + 1]).reduce((a, b) => a + b, 0)
        const charXP = charDelta > 0
          ? Array.from({ length: charDelta }, (_, i) => CHAR_XP_COST[i + 1]).reduce((a, b) => a + b, 0)
          : 0
        const totalXP = skillXP + charXP

        const config = buildScenario(id, `${arch.label} S${skillRank} ${arch.primaryChar}+${charDelta}`, variant, baseline, simCount, seed)
        scenarios.push(tagScenario(config, 'synergy', 2, `${arch.label} combo`, `s${skillRank}/c+${charDelta}`, totalXP, weaponCreditCost))
      }
    }
  }

  return scenarios
}

/** Defensive talent combos to test stacking effects */
const DEFENSIVE_COMBOS: Array<{ label: string; armorId: string; talents: string[] }> = [
  { label: 'Heavy Armor + Toughened', armorId: 'heavy-battle-armor', talents: ['merc-t1-01'] },
  { label: 'Heavy Armor + Enduring + Toughened', armorId: 'heavy-battle-armor', talents: ['merc-t1-01', 'merc-t2-03'] },
  { label: 'Padded + Defensive Stance', armorId: 'padded-armor', talents: ['merc-t2-04'] },
]

/**
 * Tier 2: Armor + defensive talent stacking.
 * Costs: armor credit cost + talent XP cost (tier * 5 per talent).
 */
export function generateDefensiveStackScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  // Build a talent tier lookup from specialization data
  const talentTierMap = new Map<string, number>()
  if (gameData.specializations) {
    for (const specData of Object.values(gameData.specializations)) {
      const talents = (specData as any).talents as Array<{ id: string; tier: number }> | undefined
      if (talents) {
        for (const t of talents) talentTierMap.set(t.id, t.tier)
      }
    }
  }

  for (const combo of DEFENSIVE_COMBOS) {
    const id = `defensive-${combo.label.replace(/\s+/g, '-').toLowerCase()}`
    const variant = makeVariant(baseline.hero, {
      name: combo.label,
      armor: combo.armorId,
      addTalents: combo.talents,
    })

    // Armor credit cost
    const armorCreditCost = (gameData.armor[combo.armorId] as any)?.cost ?? 0
    // Talent XP cost: sum of tier * 5 for each talent
    const talentXP = combo.talents.reduce((sum, tId) => sum + (talentTierMap.get(tId) ?? 1) * 5, 0)

    const config = buildScenario(id, combo.label, variant, baseline, simCount, seed)
    scenarios.push(tagScenario(config, 'synergy', 2, 'defensive combo', combo.label, talentXP, armorCreditCost))
  }

  return scenarios
}

/**
 * Tier 2: Multi-talent builds from the same tree.
 * Tests stacking 2-3 talents from one specialization.
 */
export function generateMultiTalentScenarios(
  baseline: BaselineConfig,
  _gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  const MULTI_TALENT_BUILDS: Array<{ label: string; talents: string[]; xpCost: number }> = [
    // Mercenary offense stack
    { label: 'Merc: Point Blank + Barrage', talents: ['merc-t1-06', 'merc-t2-01'], xpCost: 15 },
    { label: 'Merc: T1 Combat Trio', talents: ['merc-t1-01', 'merc-t1-06', 'merc-t1-07'], xpCost: 15 },
    { label: 'Merc: T1-T2 Stack (5 talents)', talents: ['merc-t1-01', 'merc-t1-06', 'merc-t1-07', 'merc-t2-01', 'merc-t2-03'], xpCost: 35 },
    // Assassin stealth stack
    { label: 'Assassin: Lethal Blows + Stalker', talents: ['assn-t1-06', 'assn-t1-05'], xpCost: 10 },
    // Tactician support stack
    { label: 'Tactician: Field Commander + Bodyguard', talents: ['tact-t2-01', 'tact-t1-04'], xpCost: 15 },
  ]

  for (const build of MULTI_TALENT_BUILDS) {
    const id = `multi-talent-${build.label.replace(/[:\s]+/g, '-').toLowerCase()}`
    const variant = makeVariant(baseline.hero, {
      name: build.label,
      addTalents: build.talents,
    })

    const config = buildScenario(id, build.label, variant, baseline, simCount, seed)
    scenarios.push(tagScenario(config, 'synergy', 2, 'multi-talent', build.label, build.xpCost))
  }

  return scenarios
}

// ============================================================================
// TIER 2: ABILITY POINT SCENARIOS (AP-costed combat abilities)
// ============================================================================

/**
 * AP ability definitions: hypothetical abilities purchasable with AP.
 *
 * Each ability models a specific combat benefit as stat modifications.
 * These provide data points for AP efficiency calculations and cross-currency
 * exchange rate computation (XP:AP, credits:AP).
 *
 * AP costs roughly follow: 1 AP = minor passive, 2 AP = moderate active,
 * 3 AP = significant advantage, 5 AP = build-defining ability.
 */
const AP_ABILITIES: Array<{
  label: string
  apCost: number
  overrides: Parameters<typeof makeVariant>[1]
}> = [
  // --- 1 AP abilities (minor passives) ---
  {
    label: 'Hardened (Brawn +1)',
    apCost: 1,
    overrides: { name: 'AP: Hardened', addCharacteristics: { brawn: 1 } },
  },
  {
    label: 'Quick Reflexes (Agility +1)',
    apCost: 1,
    overrides: { name: 'AP: Quick Reflexes', addCharacteristics: { agility: 1 } },
  },
  {
    label: 'Steady Aim (ranged-heavy +1)',
    apCost: 1,
    overrides: { name: 'AP: Steady Aim', addSkills: { 'ranged-heavy': 1 } },
  },
  {
    label: 'Street Fighter (brawl +1)',
    apCost: 1,
    overrides: { name: 'AP: Street Fighter', addSkills: { brawl: 1 } },
  },

  // --- 2 AP abilities (moderate combat boosts) ---
  {
    label: 'Combat Training (Agi +1, ranged-heavy +1)',
    apCost: 2,
    overrides: {
      name: 'AP: Combat Training',
      addCharacteristics: { agility: 1 },
      addSkills: { 'ranged-heavy': 1 },
    },
  },
  {
    label: 'Brawler Instinct (Brawn +1, melee +1)',
    apCost: 2,
    overrides: {
      name: 'AP: Brawler Instinct',
      addCharacteristics: { brawn: 1 },
      addSkills: { melee: 1 },
    },
  },
  {
    label: 'Tactical Awareness (Cunning +1, vigilance +1)',
    apCost: 2,
    overrides: {
      name: 'AP: Tactical Awareness',
      addCharacteristics: { cunning: 1 },
      addSkills: { vigilance: 1 },
    },
  },
  {
    label: 'Resilient Frame (Brawn +1, Toughened)',
    apCost: 2,
    overrides: {
      name: 'AP: Resilient Frame',
      addCharacteristics: { brawn: 1 },
      addTalents: ['merc-t1-06'], // Toughened
    },
  },

  // --- 3 AP abilities (significant advantages) ---
  {
    label: 'Elite Marksman (Agi +2, ranged-heavy +1)',
    apCost: 3,
    overrides: {
      name: 'AP: Elite Marksman',
      addCharacteristics: { agility: 2 },
      addSkills: { 'ranged-heavy': 1 },
    },
  },
  {
    label: 'Iron Will (Will +2, discipline +1)',
    apCost: 3,
    overrides: {
      name: 'AP: Iron Will',
      addCharacteristics: { willpower: 2 },
      addSkills: { discipline: 1 },
    },
  },
  {
    label: 'Veteran Combatant (Agi +1, Brawn +1, Toughened)',
    apCost: 3,
    overrides: {
      name: 'AP: Veteran Combatant',
      addCharacteristics: { agility: 1, brawn: 1 },
      addTalents: ['merc-t1-06'],
    },
  },

  // --- 5 AP abilities (build-defining) ---
  {
    label: 'War Machine (Agi +2, Brawn +1, ranged-heavy +1, Toughened)',
    apCost: 5,
    overrides: {
      name: 'AP: War Machine',
      addCharacteristics: { agility: 2, brawn: 1 },
      addSkills: { 'ranged-heavy': 1 },
      addTalents: ['merc-t1-06'],
    },
  },
  {
    label: 'Apex Predator (Agi +2, ranged-heavy +2, Point Blank)',
    apCost: 5,
    overrides: {
      name: 'AP: Apex Predator',
      addCharacteristics: { agility: 2 },
      addSkills: { 'ranged-heavy': 2 },
      addTalents: ['merc-t1-01'], // Point Blank
    },
  },
]

/**
 * Tier 2: AP ability scenarios.
 * Tests hypothetical abilities purchasable with Ability Points to generate
 * AP efficiency data for cross-currency exchange rate computation.
 */
export function generateAbilityPointScenarios(
  baseline: BaselineConfig,
  _gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  for (const ability of AP_ABILITIES) {
    const id = `ap-${ability.label.replace(/[^\w]+/g, '-').toLowerCase()}`
    const variant = makeVariant(baseline.hero, ability.overrides)
    const config = buildScenario(id, ability.label, variant, baseline, simCount, seed)
    // Tag with AP cost only -- these are purely AP-purchased abilities
    scenarios.push(tagScenario(config, 'synergy', 2, 'ability', ability.label, null, null, false, ability.apCost))
  }

  return scenarios
}

// ============================================================================
// TIER 3: TEAM COMPOSITION & PROGRESSION
// ============================================================================

/**
 * Tier 3: Team scenarios with 2+ heroes vs scaled opposition.
 * Uses buildScenario's opponent config but overrides figure counts.
 * Costs: combined XP (skills + chars + talents) + credits (weapons + armor) across all heroes.
 */
export function generateTeamScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  const TEAM_CONFIGS: Array<{
    label: string
    heroes: Array<{ name: string; overrides: Parameters<typeof makeVariant>[1]; xpCost: number; creditCost: number }>
    opponents: { npcId: string; count: number }
  }> = [
    {
      label: '2x Baseline vs 4 Stormtroopers',
      heroes: [
        { name: 'Baseline A', overrides: { name: 'Baseline A' }, xpCost: 5, creditCost: 0 },       // ranged-heavy 1 = 5 XP, e-11 baseline
        { name: 'Baseline B', overrides: { name: 'Baseline B' }, xpCost: 5, creditCost: 0 },
      ],
      opponents: { npcId: 'stormtrooper', count: 4 },
    },
    {
      label: 'Melee + Ranged vs 3 Stormtroopers',
      heroes: [
        // Melee Fighter: vibro-blade (credit), melee 2 (5+10=15 XP), brawn +1 (10 XP)
        { name: 'Melee Fighter', overrides: { name: 'Melee Fighter', weapon: 'vibro-blade', skills: { melee: 2 }, addCharacteristics: { brawn: 1 } }, xpCost: 25, creditCost: 0 },
        // Ranged Support: a280 (credit), ranged-heavy 2 (5+10=15 XP)
        { name: 'Ranged Support', overrides: { name: 'Ranged Support', weapon: 'a280', skills: { 'ranged-heavy': 2 } }, xpCost: 15, creditCost: 0 },
      ],
      opponents: { npcId: 'stormtrooper', count: 3 },
    },
    {
      label: 'Tank + DPS vs 4 Stormtroopers',
      heroes: [
        // Tank: heavy-battle-armor (3000cr), brawn +2 (10+20=30 XP), toughened (5 XP)
        { name: 'Tank', overrides: { name: 'Tank', armor: 'heavy-battle-armor', addCharacteristics: { brawn: 2 }, addTalents: ['merc-t1-01'] }, xpCost: 35, creditCost: 3000 },
        // DPS: a280 (credit), ranged-heavy 3 (5+10+15=30 XP), agility +1 (10 XP)
        { name: 'DPS', overrides: { name: 'DPS', weapon: 'a280', skills: { 'ranged-heavy': 3 }, addCharacteristics: { agility: 1 } }, xpCost: 40, creditCost: 0 },
      ],
      opponents: { npcId: 'stormtrooper', count: 4 },
    },
  ]

  for (const team of TEAM_CONFIGS) {
    const id = `team-${team.label.replace(/[^\w]+/g, '-').toLowerCase()}`
    const heroSpecs = team.heroes.map((h, i) => {
      const spec = makeVariant(baseline.hero, h.overrides)
      return { type: 'hero' as const, heroId: `hero-${id}-${i}`, spec }
    })

    const config = {
      id,
      name: team.label,
      arena: baseline.arena,
      sideA: {
        label: baseline.sideALabel,
        figures: [{ type: 'npc' as const, npcId: team.opponents.npcId, count: team.opponents.count }],
      },
      sideB: {
        label: baseline.sideBLabel,
        figures: heroSpecs,
      },
      simulation: { count: simCount, seed, roundLimit: 20 },
    }

    // Sum costs across all heroes; also look up weapon/armor credit costs from game data
    const totalXP = team.heroes.reduce((sum, h) => sum + h.xpCost, 0)
    let totalCredits = team.heroes.reduce((sum, h) => sum + h.creditCost, 0)
    // Add weapon credit costs from game data for non-baseline weapons
    for (const h of team.heroes) {
      const weaponId = h.overrides.weapon
      if (weaponId && weaponId !== baseline.hero.weapon) {
        totalCredits += (gameData.weapons[weaponId] as any)?.cost ?? 0
      }
    }

    scenarios.push(tagScenario(config, 'team', 3, 'team', team.label, totalXP, totalCredits))
  }

  return scenarios
}

/**
 * Tier 3: Progression milestones.
 * Simulate heroes at 50 XP, 100 XP, and 150 XP investment levels.
 * Credit costs are added for weapon/armor upgrades at higher XP tiers.
 */
export function generateProgressionScenarios(
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  const PROGRESSION_BUILDS: Array<{
    label: string
    xpBudget: number
    creditCost: number
    overrides: Parameters<typeof makeVariant>[1]
  }> = [
    {
      label: '50 XP: Ranged Specialist',
      xpBudget: 50,
      creditCost: 0, // keeps baseline weapon
      overrides: {
        name: '50 XP Ranged',
        addCharacteristics: { agility: 1 },       // 10 XP
        skills: { 'ranged-heavy': 2 },              // 10 XP (career)
        addTalents: ['merc-t1-01', 'merc-t1-06'],   // 10 XP (2x tier 1)
        // Remaining ~20 XP for skills
      },
    },
    {
      label: '100 XP: Combat Veteran',
      xpBudget: 100,
      creditCost: 0, // keeps baseline weapon
      overrides: {
        name: '100 XP Veteran',
        addCharacteristics: { agility: 2, brawn: 1 },
        skills: { 'ranged-heavy': 3, vigilance: 1 },
        addTalents: ['merc-t1-01', 'merc-t1-06', 'merc-t2-01', 'merc-t2-03'],
      },
    },
    {
      label: '150 XP: Elite Operative',
      xpBudget: 150,
      creditCost: -1, // sentinel: look up a280 cost from game data
      overrides: {
        name: '150 XP Elite',
        addCharacteristics: { agility: 3, brawn: 1 },
        skills: { 'ranged-heavy': 3, vigilance: 2, athletics: 1 },
        addTalents: ['merc-t1-01', 'merc-t1-06', 'merc-t1-07', 'merc-t2-01', 'merc-t2-03', 'merc-t3-01', 'merc-t3-02'],
        weapon: 'a280',
      },
    },
  ]

  for (const build of PROGRESSION_BUILDS) {
    const id = `progression-${build.xpBudget}xp`
    const variant = makeVariant(baseline.hero, build.overrides)

    // Resolve credit cost: look up weapon cost from game data if weapon differs from baseline
    let creditCost = build.creditCost
    if (creditCost === -1 && build.overrides.weapon) {
      creditCost = (gameData.weapons[build.overrides.weapon] as any)?.cost ?? 0
    }
    creditCost = Math.max(0, creditCost)

    const config = buildScenario(id, build.label, variant, baseline, simCount, seed)
    scenarios.push(tagScenario(config, 'progression', 3, 'xp-budget', `${build.xpBudget} XP`, build.xpBudget, creditCost > 0 ? creditCost : null))
  }

  return scenarios
}

/**
 * Tier 3: Opposition scaling -- same hero vs 1, 2, 3, 4 stormtroopers.
 */
export function generateOppositionScalingScenarios(
  baseline: BaselineConfig,
  _gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []

  for (let count = 1; count <= 4; count++) {
    if (count === baseline.opponentCount) continue // Skip the baseline count

    const id = `opposition-${count}x`
    const config = buildScenario(id, `vs ${count} Stormtroopers`, baseline.hero, {
      ...baseline,
      opponentCount: count,
    }, simCount, seed)
    scenarios.push(tagScenario(config, 'team', 3, 'opposition-count', `${count}x`))
  }

  return scenarios
}

// ============================================================================
// AGGREGATED GENERATORS
// ============================================================================

/**
 * Generate ALL scenarios for a given tier.
 */
export function generateTierScenarios(
  tier: 1 | 2 | 3 | 'all',
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  const scenarios: BalanceScenario[] = []
  const tiers = tier === 'all' ? [1, 2, 3] : [tier]

  if (tiers.includes(1)) {
    scenarios.push(...generateCharacteristicScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateSkillScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateWeaponScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateArmorScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateTalentScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateSpeciesScenarios(baseline, gameData, simCount, seed))
  }

  if (tiers.includes(2)) {
    scenarios.push(...generateWeaponSkillSynergyScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateDefensiveStackScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateMultiTalentScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateAbilityPointScenarios(baseline, gameData, simCount, seed))
  }

  if (tiers.includes(3)) {
    scenarios.push(...generateTeamScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateProgressionScenarios(baseline, gameData, simCount, seed))
    scenarios.push(...generateOppositionScalingScenarios(baseline, gameData, simCount, seed))
  }

  return scenarios
}

/**
 * Generate scenarios filtered by category.
 */
export function generateCategoryScenarios(
  category: BalanceCategory | 'all',
  baseline: BaselineConfig,
  gameData: GameData,
  simCount: number,
  seed: number,
): BalanceScenario[] {
  if (category === 'all') {
    return generateTierScenarios('all', baseline, gameData, simCount, seed)
  }

  const generators: Record<BalanceCategory, () => BalanceScenario[]> = {
    characteristic: () => generateCharacteristicScenarios(baseline, gameData, simCount, seed),
    skill: () => generateSkillScenarios(baseline, gameData, simCount, seed),
    weapon: () => generateWeaponScenarios(baseline, gameData, simCount, seed),
    armor: () => generateArmorScenarios(baseline, gameData, simCount, seed),
    talent: () => generateTalentScenarios(baseline, gameData, simCount, seed),
    species: () => generateSpeciesScenarios(baseline, gameData, simCount, seed),
    synergy: () => [
      ...generateWeaponSkillSynergyScenarios(baseline, gameData, simCount, seed),
      ...generateDefensiveStackScenarios(baseline, gameData, simCount, seed),
      ...generateMultiTalentScenarios(baseline, gameData, simCount, seed),
      ...generateAbilityPointScenarios(baseline, gameData, simCount, seed),
    ],
    team: () => [
      ...generateTeamScenarios(baseline, gameData, simCount, seed),
      ...generateOppositionScalingScenarios(baseline, gameData, simCount, seed),
    ],
    progression: () => generateProgressionScenarios(baseline, gameData, simCount, seed),
  }

  return generators[category]()
}

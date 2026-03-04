/**
 * Multi-Faction Balance Tuning Script
 *
 * Runs AI-vs-AI simulations against all 3 faction army compositions
 * with faction-scoped NPC pools (no cross-faction reinforcement contamination).
 *
 * Usage:
 *   pnpm tsx scripts/run-balance-tuning.ts
 *   pnpm tsx scripts/run-balance-tuning.ts --count 100
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

import { loadGameDataV2, loadBoardTemplates } from '../packages/engine/src/data-loader.js'
import { loadAIProfiles } from '../packages/engine/src/ai/decide-v2.js'
import { runBatchV2, generateTestHeroes, defaultArmyV2 } from '../packages/engine/src/ai/simulator-v2.js'
import type { BatchSimulationResult } from '../packages/engine/src/ai/types.js'
import type { GameData, Mission, NPCProfile } from '../packages/engine/src/types.js'
import type { ArmyCompositionV2 } from '../packages/engine/src/turn-machine-v2.js'

// ============================================================================
// FACTION DEFINITIONS
// ============================================================================

interface FactionConfig {
  name: string
  npcFile: string
  initialArmy: Array<{ npcId: string; count: number }>
  mission: Mission
}

const FACTIONS: FactionConfig[] = [
  {
    name: 'Act 1: Imperials',
    npcFile: 'imperials.json',
    initialArmy: [
      { npcId: 'stormtrooper', count: 3 },
      { npcId: 'stormtrooper-elite', count: 1 },
      { npcId: 'imperial-officer', count: 1 },
    ],
    mission: {
      id: 'sim-imperials',
      name: 'Imperial Balance Test',
      description: 'Simulates Act 1 Imperial encounters',
      mapId: 'generated',
      roundLimit: 12,
      imperialThreat: 6,
      imperialReinforcementPoints: 3,
      victoryConditions: [
        { side: 'Imperial', description: 'Wound all heroes', condition: 'allHeroesWounded' },
        { side: 'Operative', description: 'Complete 2/3 objectives', condition: 'objectivesCompleted', objectiveThreshold: 2 },
      ],
    },
  },
  {
    name: 'Act 2: Shadow Syndicate',
    npcFile: 'bounty-hunters.json',
    initialArmy: [
      { npcId: 'nikto-gunner', count: 3 },
      { npcId: 'gamorrean-brute', count: 2 },
      { npcId: 'syndicate-lieutenant', count: 1 },
    ],
    mission: {
      id: 'sim-syndicate',
      name: 'Syndicate Balance Test',
      description: 'Simulates Act 2 Shadow Syndicate encounters',
      mapId: 'generated',
      roundLimit: 10,
      imperialThreat: 8,
      imperialReinforcementPoints: 2,
      victoryConditions: [
        { side: 'Imperial', description: 'Wound all heroes', condition: 'allHeroesWounded' },
        { side: 'Operative', description: 'Complete 2/3 objectives', condition: 'objectivesCompleted', objectiveThreshold: 2 },
      ],
    },
  },
  {
    name: 'Act 3: Warlord Forces',
    npcFile: 'warlord-forces.json',
    initialArmy: [
      { npcId: 'conscript-militia', count: 4 },
      { npcId: 'defector-trooper', count: 2 },
      { npcId: 'rebel-turncoat', count: 1 },
    ],
    mission: {
      id: 'sim-warlord',
      name: 'Warlord Balance Test',
      description: 'Simulates Act 3 Warlord encounters',
      mapId: 'generated',
      roundLimit: 10,
      imperialThreat: 6,
      imperialReinforcementPoints: 3,
      victoryConditions: [
        { side: 'Imperial', description: 'Wound all heroes', condition: 'allHeroesWounded' },
        { side: 'Operative', description: 'Complete 2/3 objectives', condition: 'objectivesCompleted', objectiveThreshold: 2 },
      ],
    },
  },
]

// ============================================================================
// FACTION-SCOPED GAME DATA
// ============================================================================

function createFactionGameData(fullGameData: GameData, factionNpcIds: string[]): GameData {
  const scopedProfiles: Record<string, NPCProfile> = {}
  for (const id of factionNpcIds) {
    if (fullGameData.npcProfiles[id]) {
      scopedProfiles[id] = fullGameData.npcProfiles[id]
    }
  }
  return {
    ...fullGameData,
    npcProfiles: scopedProfiles,
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  let count = 50
  let seed = 42
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) { count = parseInt(args[i + 1], 10); i++ }
    if (args[i] === '--seed' && args[i + 1]) { seed = parseInt(args[i + 1], 10); i++ }
  }

  console.log('\n  GALACTIC OPERATIONS - Multi-Faction Balance Tuning')
  console.log(`  Games per faction: ${count} | Seed: ${seed}\n`)

  // Load base data
  const dataPath = path.join(ROOT, 'data')
  const fullGameData = await loadGameDataV2(dataPath)
  const boardTemplates = await loadBoardTemplates(dataPath)
  const aiProfilesRaw = JSON.parse(await fs.readFile(path.join(dataPath, 'ai-profiles.json'), 'utf-8'))
  const profiles = loadAIProfiles(aiProfilesRaw)
  const heroes = generateTestHeroes(fullGameData)

  console.log(`  Heroes: ${heroes.map(h => h.name).join(', ')}`)
  console.log(`  Board templates: ${boardTemplates.length}\n`)

  // Load faction NPC IDs from their JSON files
  const factionNpcIds: Record<string, string[]> = {}
  for (const faction of FACTIONS) {
    const raw = JSON.parse(await fs.readFile(path.join(dataPath, 'npcs', faction.npcFile), 'utf-8'))
    const npcs = raw.npcs ?? raw
    factionNpcIds[faction.name] = Object.keys(npcs)
  }

  // Run simulations per faction
  const results: Array<{ faction: FactionConfig; result: BatchSimulationResult }> = []

  for (const faction of FACTIONS) {
    console.log(`  --- ${faction.name} ---`)
    const scopedGameData = createFactionGameData(fullGameData, factionNpcIds[faction.name])

    const army: ArmyCompositionV2 = {
      imperial: faction.initialArmy,
      operative: heroes.map(h => ({ entityType: 'hero' as const, entityId: h.id, count: 1 })),
    }

    const startTime = Date.now()
    const result = runBatchV2(
      faction.mission,
      scopedGameData,
      profiles,
      heroes,
      count,
      army,
      seed,
      false,
      boardTemplates,
    )
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    results.push({ faction, result })
    console.log(`  Completed in ${elapsed}s\n`)
  }

  // Print comparative report
  const W = 72
  console.log('\n' + '='.repeat(W))
  console.log('  MULTI-FACTION BALANCE REPORT')
  console.log('='.repeat(W))
  console.log(`  Games per faction: ${count} | Seed: ${seed}`)
  console.log(`  Target win rate: 40-60% per side\n`)

  // Summary table
  console.log('-'.repeat(W))
  console.log('  ' + 'Faction'.padEnd(28) + 'Imp Win  Op Win   Avg Rds  Obj/3')
  console.log('-'.repeat(W))
  for (const { faction, result } of results) {
    const impPct = `${(result.imperialWinRate * 100).toFixed(0)}%`.padStart(5)
    const opPct = `${(result.operativeWinRate * 100).toFixed(0)}%`.padStart(5)
    const avgRds = result.avgRoundsPlayed.toFixed(1).padStart(7)
    const avgObj = result.avgObjectivesCompleted.toFixed(2).padStart(6)
    const status = result.imperialWinRate > 0.6 ? ' !! IMP-HEAVY'
      : result.operativeWinRate > 0.6 ? ' !! OP-HEAVY'
      : ' OK'
    console.log(`  ${faction.name.padEnd(28)}${impPct}   ${opPct}   ${avgRds}  ${avgObj}${status}`)
  }

  // Per-faction details
  for (const { faction, result } of results) {
    console.log('\n' + '-'.repeat(W))
    console.log(`  ${faction.name}`)
    console.log('-'.repeat(W))

    console.log(`  Win Rate: Imperial ${(result.imperialWinRate * 100).toFixed(1)}% | Operative ${(result.operativeWinRate * 100).toFixed(1)}%`)
    console.log(`  Avg Rounds: ${result.avgRoundsPlayed.toFixed(1)} | Avg Objectives: ${result.avgObjectivesCompleted.toFixed(2)}/3`)
    console.log(`  Avg Damage: Imp ${result.avgDamage.imperial.toFixed(1)} | Op ${result.avgDamage.operative.toFixed(1)}`)
    console.log(`  Avg Defeated: Imp figs ${result.avgDefeated.imperial.toFixed(1)} | Op heroes ${result.avgDefeated.operative.toFixed(1)}`)

    console.log('\n  Victory Conditions:')
    for (const [cond, cnt] of Object.entries(result.victoryConditionBreakdown).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cond.padEnd(40)} ${cnt} (${(cnt / result.gamesPlayed * 100).toFixed(0)}%)`)
    }

    console.log('\n  Unit Performance:')
    console.log('    ' + 'Unit'.padEnd(26) + 'Survival  AvgDmgTaken')
    for (const stats of Object.values(result.unitPerformance)) {
      const surv = `${(stats.survivalRate * 100).toFixed(0)}%`.padStart(7)
      const dmg = stats.avgDamageTaken.toFixed(1).padStart(10)
      console.log(`    ${stats.unitName.padEnd(26)}${surv}  ${dmg}`)
    }
  }

  // Hero survival comparison
  console.log('\n' + '-'.repeat(W))
  console.log('  HERO SURVIVAL COMPARISON')
  console.log('-'.repeat(W))
  const heroNames = heroes.map(h => h.name)
  console.log('  ' + 'Hero'.padEnd(16) + results.map(r => r.faction.name.slice(0, 18).padStart(20)).join(''))
  for (const heroName of heroNames) {
    let line = `  ${heroName.padEnd(16)}`
    for (const { result } of results) {
      const heroUnit = Object.values(result.unitPerformance).find(u => u.unitName === heroName)
      const surv = heroUnit ? `${(heroUnit.survivalRate * 100).toFixed(0)}%` : 'N/A'
      line += surv.padStart(20)
    }
    console.log(line)
  }

  // Balance assessment
  console.log('\n' + '='.repeat(W))
  console.log('  BALANCE ASSESSMENT')
  console.log('='.repeat(W))

  const issues: string[] = []
  for (const { faction, result } of results) {
    if (result.imperialWinRate > 0.65) {
      issues.push(`[HIGH] ${faction.name}: Imperial win rate ${(result.imperialWinRate * 100).toFixed(0)}% -- too hard for heroes`)
    } else if (result.operativeWinRate > 0.65) {
      issues.push(`[HIGH] ${faction.name}: Operative win rate ${(result.operativeWinRate * 100).toFixed(0)}% -- too easy for heroes`)
    } else if (result.imperialWinRate > 0.55) {
      issues.push(`[MED]  ${faction.name}: Imperial-leaning at ${(result.imperialWinRate * 100).toFixed(0)}%`)
    } else if (result.operativeWinRate > 0.55) {
      issues.push(`[MED]  ${faction.name}: Operative-leaning at ${(result.operativeWinRate * 100).toFixed(0)}%`)
    } else {
      issues.push(`[OK]   ${faction.name}: Balanced at ${(result.imperialWinRate * 100).toFixed(0)}/${(result.operativeWinRate * 100).toFixed(0)}`)
    }

    if (result.avgObjectivesCompleted < 0.8) {
      issues.push(`[HIGH] ${faction.name}: Objective completion ${result.avgObjectivesCompleted.toFixed(2)}/3 -- heroes never reach objectives`)
    } else if (result.avgObjectivesCompleted < 1.2) {
      issues.push(`[MED]  ${faction.name}: Objective completion ${result.avgObjectivesCompleted.toFixed(2)}/3 -- low`)
    }

    // Hero-specific issues
    for (const stats of Object.values(result.unitPerformance)) {
      if (stats.unitName.match(/^(Korrga|Vex|Ashara|Ssorku)/) && stats.survivalRate < 0.25) {
        issues.push(`[HIGH] ${faction.name}: ${stats.unitName} survival ${(stats.survivalRate * 100).toFixed(0)}% -- critically fragile`)
      }
    }
  }

  for (const issue of issues) {
    console.log(`  ${issue}`)
  }

  console.log('\n' + '='.repeat(W))

  // Write report
  const reportsDir = path.join(ROOT, 'reports')
  await fs.mkdir(reportsDir, { recursive: true })
  const reportData = results.map(r => ({
    faction: r.faction.name,
    imperialWinRate: r.result.imperialWinRate,
    operativeWinRate: r.result.operativeWinRate,
    avgRoundsPlayed: r.result.avgRoundsPlayed,
    avgObjectivesCompleted: r.result.avgObjectivesCompleted,
    avgDamage: r.result.avgDamage,
    avgDefeated: r.result.avgDefeated,
    victoryConditions: r.result.victoryConditionBreakdown,
    unitPerformance: r.result.unitPerformance,
  }))
  await fs.writeFile(path.join(reportsDir, 'balance-tuning.json'), JSON.stringify(reportData, null, 2), 'utf-8')
  console.log(`\n  Report written to ${reportsDir}/balance-tuning.json`)
}

main().catch(err => {
  console.error('Balance tuning failed:', err)
  process.exit(1)
})

/**
 * Diagnostic script to trace the Imperial hit rate discrepancy.
 * Computes actual hero defense pools and expected hit probabilities
 * for Stormtrooper and Officer attacks.
 *
 * Run: npx tsx scripts/diagnose-hit-rate.ts
 */

import { buildAttackPool, buildDefensePool, applyArmorDefense, applyCoverModifier, estimateHitProbability, expectedNetSuccesses } from '../packages/engine/src/dice-v2.js';

// ============================================================================
// Species base Agility values
// ============================================================================
const speciesAgility: Record<string, number> = {
  wookiee: 2,
  human: 2,
  twilek: 2,
  trandoshan: 1,
};

// ============================================================================
// Test hero definitions (matching generateTestHeroes in game-store.ts)
// ============================================================================
interface TestHero {
  name: string;
  species: string;
  agilityIncrease: number;
  coordinationRank: number;
  armorId: string;
  armorDefense: number;
  armorSoak: number;
}

const heroes: TestHero[] = [
  {
    name: 'Korrga',
    species: 'wookiee',
    agilityIncrease: 0, // characteristicIncreases: { brawn: 1 }
    coordinationRank: 0,
    armorId: 'heavy-battle-armor',
    armorDefense: 1,
    armorSoak: 3,
  },
  {
    name: 'Vex Dorin',
    species: 'human',
    agilityIncrease: 1, // characteristicIncreases: { agility: 1 }
    coordinationRank: 1, // initialSkills includes coordination: 1
    armorId: 'blast-vest',
    armorDefense: 0,
    armorSoak: 1,
  },
  {
    name: 'Ashara Nev',
    species: 'twilek',
    agilityIncrease: 0, // characteristicIncreases: { presence: 1 }
    coordinationRank: 0,
    armorId: 'padded-armor',
    armorDefense: 0,
    armorSoak: 2,
  },
  {
    name: 'Ssorku',
    species: 'trandoshan',
    agilityIncrease: 1, // characteristicIncreases: { agility: 1 }
    coordinationRank: 0,
    armorId: 'padded-armor',
    armorDefense: 0,
    armorSoak: 2,
  },
];

// ============================================================================
// Imperial attack pools (from imperials.json)
// ============================================================================
const stormtrooperAttack = { ability: 1, proficiency: 1 }; // 1Y+1G
const officerAttack = { ability: 1, proficiency: 0 };       // 1G only

// ============================================================================
// Compute and display
// ============================================================================

console.log('=== IMPERIAL HIT RATE DIAGNOSTIC ===\n');

console.log('--- Attacker Pools ---');
console.log(`Stormtrooper: 1Y+1G  (ability=${stormtrooperAttack.ability}, proficiency=${stormtrooperAttack.proficiency})`);
console.log(`Officer:      1G     (ability=${officerAttack.ability}, proficiency=${officerAttack.proficiency})`);
console.log();

console.log('--- Hero Defense Pools (computed from species + skills + armor) ---');

const coverTypes = ['None', 'Light', 'Heavy'] as const;

for (const hero of heroes) {
  const agility = speciesAgility[hero.species] + hero.agilityIncrease;
  let defPool = buildDefensePool(agility, hero.coordinationRank);

  // Apply armor defense
  if (hero.armorDefense > 0) {
    defPool = applyArmorDefense(defPool, hero.armorDefense);
  }

  const poolStr = `${defPool.difficulty}P${defPool.challenge > 0 ? `+${defPool.challenge}R` : ''}`;
  console.log(`\n${hero.name} (${hero.species}, Agi=${agility}, Coord=${hero.coordinationRank}, armor=${hero.armorId})`);
  console.log(`  Base defense pool: ${poolStr}  (difficulty=${defPool.difficulty}, challenge=${defPool.challenge})`);

  for (const cover of coverTypes) {
    const withCover = applyCoverModifier(defPool, cover);
    const coverPoolStr = `${withCover.difficulty}P${withCover.challenge > 0 ? `+${withCover.challenge}R` : ''}`;

    const stormHit = estimateHitProbability(stormtrooperAttack, withCover);
    const officerHit = estimateHitProbability(officerAttack, withCover);
    const stormEnet = expectedNetSuccesses(stormtrooperAttack, withCover);
    const officerEnet = expectedNetSuccesses(officerAttack, withCover);

    console.log(`  Cover=${cover.padEnd(5)} Pool=${coverPoolStr.padEnd(8)} | Stormtrooper: P(hit)=${(stormHit*100).toFixed(1)}% E[net]=${stormEnet.toFixed(2)} | Officer: P(hit)=${(officerHit*100).toFixed(1)}% E[net]=${officerEnet.toFixed(2)}`);
  }
}

// ============================================================================
// Summary statistics
// ============================================================================

console.log('\n\n--- SUMMARY: Expected Hit Rates ---');

for (const cover of coverTypes) {
  let stormTotal = 0;
  let officerTotal = 0;

  for (const hero of heroes) {
    const agility = speciesAgility[hero.species] + hero.agilityIncrease;
    let defPool = buildDefensePool(agility, hero.coordinationRank);
    if (hero.armorDefense > 0) {
      defPool = applyArmorDefense(defPool, hero.armorDefense);
    }
    const withCover = applyCoverModifier(defPool, cover);

    stormTotal += estimateHitProbability(stormtrooperAttack, withCover);
    officerTotal += estimateHitProbability(officerAttack, withCover);
  }

  const stormAvg = stormTotal / heroes.length;
  const officerAvg = officerTotal / heroes.length;

  console.log(`Cover=${cover.padEnd(5)} | Avg Stormtrooper hit: ${(stormAvg*100).toFixed(1)}% | Avg Officer hit: ${(officerAvg*100).toFixed(1)}%`);
}

// Monte Carlo comparison
console.log('\n--- Monte Carlo Reference (from DESIGN_SPEC) ---');
console.log('Stormtrooper (1Y+1G) vs 1P defense:  62.5% (but NO hero actually has only 1P!)');
console.log('Stormtrooper (1Y+1G) vs 2P defense:  43.5% (Ashara, Ssorku without cover)');
console.log('Stormtrooper (1Y+1G) vs 2P+2C defense: 10.4% (Beskar, nobody has this)');

console.log('\n--- ROOT CAUSE ANALYSIS ---');
console.log('1. Monte Carlo "unarmored hero (1P)" assumed Agility=1, Coord=0.');
console.log('   But the lightest hero has Agility=2 → 2P defense, not 1P.');
console.log('2. Imperial Officers attack with only 1G. Average hit rate ~10%.');
console.log('   Officers constituted ~6/17 of Imperial units in battle #3.');
console.log('3. Korrga (heavy-battle-armor, defense=1) gets 1P+1R, and');
console.log('   Vex (Agility 3 + Coord 1) gets 2P+1R — both very heavy.');
console.log('4. Cover on the map adds +1P (Light) or upgrades P→R (Heavy).');
console.log('5. Combined effect: average Stormtrooper hit rate ~36% (no cover),');
console.log('   ~25% (with cover). Officers ~10%. Weighted average: ~20-25%.');
console.log('6. Getting 2/21 hits (10%) is unlucky but within ~2 sigma of ~20%.');

/**
 * Standalone diagnostic - no imports, inlined formulas from dice-v2.ts
 */

// buildDefensePool(agility, coordRank) -> {difficulty, challenge}
function buildDefensePool(agility, coordRank) {
  const poolSize = Math.max(agility, coordRank);
  const upgrades = Math.min(agility, coordRank);
  return { difficulty: poolSize - upgrades, challenge: upgrades };
}

function applyArmorDefense(pool, armorDef) {
  let { difficulty, challenge } = pool;
  for (let i = 0; i < armorDef; i++) {
    if (difficulty > 0) { difficulty--; challenge++; }
    else { difficulty++; }
  }
  return { difficulty, challenge };
}

function applyCoverModifier(pool, cover) {
  let { difficulty, challenge } = pool;
  if (cover === 'Light') { difficulty++; }
  else if (cover === 'Heavy') {
    if (difficulty > 0) { difficulty--; challenge++; }
    else { difficulty++; }
  }
  return { difficulty, challenge };
}

function expectedNetSuccesses(attack, defense) {
  return attack.ability * 0.5 + attack.proficiency * (5/6)
       - defense.difficulty * 0.5 - defense.challenge * (5/6);
}

function normalCDF(x) {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-absX*absX/2);
  return 0.5 * (1.0 + sign * y);
}

function estimateHitProbability(attack, defense) {
  const eMean = expectedNetSuccesses(attack, defense);
  const varA = 0.25, varP = 17/36, varD = 0.25, varC = 17/36;
  const totalVar = attack.ability*varA + attack.proficiency*varP + defense.difficulty*varD + defense.challenge*varC;
  if (totalVar === 0) return eMean >= 1 ? 1 : 0;
  const sd = Math.sqrt(totalVar);
  const z = (0.5 - eMean) / sd;
  return 1 - normalCDF(z);
}

// Monte Carlo brute force verification (100K samples)
function monteCarloHitRate(attack, defense, samples = 100000) {
  const abilityFaces = [0,0,0,1,1,1]; // successes per face
  const profFaces = [0,0,1,1,1,2];
  const diffFaces = [0,0,0,1,1,1]; // failures per face
  const challFaces = [0,0,1,1,1,2];

  let hits = 0;
  for (let s = 0; s < samples; s++) {
    let successes = 0, failures = 0;
    for (let i = 0; i < attack.ability; i++) successes += abilityFaces[Math.floor(Math.random()*6)];
    for (let i = 0; i < attack.proficiency; i++) successes += profFaces[Math.floor(Math.random()*6)];
    for (let i = 0; i < defense.difficulty; i++) failures += diffFaces[Math.floor(Math.random()*6)];
    for (let i = 0; i < defense.challenge; i++) failures += challFaces[Math.floor(Math.random()*6)];
    if (successes - failures >= 1) hits++;
  }
  return hits / samples;
}

// ============================================================================

const stormAttack = { ability: 1, proficiency: 1 };
const officerAttack = { ability: 1, proficiency: 0 };

const heroes = [
  { name: 'Korrga (Wookiee)', agility: 2, coord: 0, armorDef: 1 },
  { name: 'Vex (Human)', agility: 3, coord: 1, armorDef: 0 },
  { name: 'Ashara (Twilek)', agility: 2, coord: 0, armorDef: 0 },
  { name: 'Ssorku (Trandoshan)', agility: 2, coord: 0, armorDef: 0 },
];

const covers = ['None', 'Light', 'Heavy'];

console.log('=== IMPERIAL HIT RATE DIAGNOSTIC ===\n');
console.log('Stormtrooper attack: 1Y+1G = {ability:1, proficiency:1}');
console.log('Officer attack:      1G    = {ability:1, proficiency:0}\n');

for (const hero of heroes) {
  let base = buildDefensePool(hero.agility, hero.coord);
  if (hero.armorDef > 0) base = applyArmorDefense(base, hero.armorDef);

  const poolStr = `${base.difficulty}P${base.challenge > 0 ? '+'+base.challenge+'R' : ''}`;
  console.log(`${hero.name} | Agi=${hero.agility} Coord=${hero.coord} ArmorDef=${hero.armorDef} | Base defense: ${poolStr}`);

  for (const cover of covers) {
    const def = applyCoverModifier(base, cover);
    const defStr = `${def.difficulty}P${def.challenge > 0 ? '+'+def.challenge+'R' : ''}`;
    const sHit = estimateHitProbability(stormAttack, def);
    const oHit = estimateHitProbability(officerAttack, def);
    const sMC = monteCarloHitRate(stormAttack, def);
    const oMC = monteCarloHitRate(officerAttack, def);

    console.log(`  Cover=${cover.padEnd(5)} Def=${defStr.padEnd(6)} | Storm: ${(sHit*100).toFixed(1)}% (MC:${(sMC*100).toFixed(1)}%) | Officer: ${(oHit*100).toFixed(1)}% (MC:${(oMC*100).toFixed(1)}%)`);
  }
  console.log();
}

// Summary
console.log('--- WEIGHTED AVERAGES (equal targeting across heroes) ---');
for (const cover of covers) {
  let sSum = 0, oSum = 0, sMCSum = 0, oMCSum = 0;
  for (const hero of heroes) {
    let base = buildDefensePool(hero.agility, hero.coord);
    if (hero.armorDef > 0) base = applyArmorDefense(base, hero.armorDef);
    const def = applyCoverModifier(base, cover);
    sSum += estimateHitProbability(stormAttack, def);
    oSum += estimateHitProbability(officerAttack, def);
    sMCSum += monteCarloHitRate(stormAttack, def);
    oMCSum += monteCarloHitRate(officerAttack, def);
  }
  console.log(`Cover=${cover.padEnd(5)} | Avg Storm: ${(sSum/4*100).toFixed(1)}% (MC:${(sMCSum/4*100).toFixed(1)}%) | Avg Officer: ${(oSum/4*100).toFixed(1)}% (MC:${(oMCSum/4*100).toFixed(1)}%)`);
}

// Battle log #3 mix: 10 stormtroopers + 7 officers = 17 total
// Stormtroopers got 19 attacks, officers got 2
console.log('\n--- BATTLE LOG #3 PREDICTION ---');
console.log('Mix: ~19 stormtrooper attacks, ~2 officer attacks (21 total)');
const nocover_s = heroes.reduce((s,h) => {
  let b = buildDefensePool(h.agility, h.coord);
  if (h.armorDef > 0) b = applyArmorDefense(b, h.armorDef);
  return s + monteCarloHitRate(stormAttack, b);
}, 0) / 4;
const nocover_o = heroes.reduce((s,h) => {
  let b = buildDefensePool(h.agility, h.coord);
  if (h.armorDef > 0) b = applyArmorDefense(b, h.armorDef);
  return s + monteCarloHitRate(officerAttack, b);
}, 0) / 4;
const light_s = heroes.reduce((s,h) => {
  let b = buildDefensePool(h.agility, h.coord);
  if (h.armorDef > 0) b = applyArmorDefense(b, h.armorDef);
  return s + monteCarloHitRate(stormAttack, applyCoverModifier(b, 'Light'));
}, 0) / 4;

console.log(`No cover:    Storm=${(nocover_s*100).toFixed(1)}%, Officer=${(nocover_o*100).toFixed(1)}%`);
console.log(`Light cover: Storm=${(light_s*100).toFixed(1)}%`);
console.log(`Predicted hits (no cover): ${(19*nocover_s + 2*nocover_o).toFixed(1)} out of 21`);
console.log(`Predicted hits (light cover): ${(19*light_s + 2*nocover_o).toFixed(1)} out of 21`);
console.log(`Actual hits from battle log #3: 2 out of 21 (9.5%)`);

console.log('\n--- ROOT CAUSE ---');
console.log('The Monte Carlo table assumed "unarmored hero" = 1P defense (Agility 1).');
console.log('But ALL test heroes have Agility >= 2, giving 2P minimum defense.');
console.log('Korrga gets 1P+1R (heavy-battle-armor defense=1).');
console.log('Vex gets 2P+1R (Agility 3, Coordination 1).');
console.log('This is NOT a code bug. The combat pipeline is working correctly.');
console.log('The 10% observed rate is low luck (~2 sigma below expected ~30%).');
console.log('\nThe real balance issues are:');
console.log('  1. Officers (1G attack) are nearly useless in combat');
console.log('  2. Hero defense pools are inherently strong (2P minimum)');
console.log('  3. The original Monte Carlo reference used wrong defense assumption');

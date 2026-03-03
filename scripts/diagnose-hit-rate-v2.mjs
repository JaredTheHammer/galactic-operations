/**
 * Post-fix diagnostic: verify new Stormtrooper (1Y+2G) and Officer (1Y+1G) hit rates
 */

function buildDefensePool(agility, coordRank) {
  const poolSize = Math.max(agility, coordRank);
  const upgrades = Math.min(agility, coordRank);
  return { difficulty: poolSize - upgrades, challenge: upgrades };
}
function applyArmorDefense(pool, armorDef) {
  let { difficulty, challenge } = pool;
  for (let i = 0; i < armorDef; i++) {
    if (difficulty > 0) { difficulty--; challenge++; } else { difficulty++; }
  }
  return { difficulty, challenge };
}
function applyCoverModifier(pool, cover) {
  let { difficulty, challenge } = pool;
  if (cover === 'Light') { difficulty++; }
  else if (cover === 'Heavy') {
    if (difficulty > 0) { difficulty--; challenge++; } else { difficulty++; }
  }
  return { difficulty, challenge };
}
function normalCDF(x) {
  if (x < -8) return 0; if (x > 8) return 1;
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign=x<0?-1:1, absX=Math.abs(x), t=1/(1+p*absX);
  const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-absX*absX/2);
  return 0.5*(1+sign*y);
}
function estimateHitProbability(attack, defense) {
  const eMean = attack.ability*0.5 + attack.proficiency*(5/6) - defense.difficulty*0.5 - defense.challenge*(5/6);
  const totalVar = attack.ability*0.25 + attack.proficiency*(17/36) + defense.difficulty*0.25 + defense.challenge*(17/36);
  if (totalVar===0) return eMean>=1?1:0;
  return 1 - normalCDF((0.5-eMean)/Math.sqrt(totalVar));
}
function monteCarloHitRate(attack, defense, samples=100000) {
  const aF=[0,0,0,1,1,1],pF=[0,0,1,1,1,2],dF=[0,0,0,1,1,1],cF=[0,0,1,1,1,2];
  let hits=0;
  for(let s=0;s<samples;s++){
    let succ=0,fail=0;
    for(let i=0;i<attack.ability;i++) succ+=aF[Math.floor(Math.random()*6)];
    for(let i=0;i<attack.proficiency;i++) succ+=pF[Math.floor(Math.random()*6)];
    for(let i=0;i<defense.difficulty;i++) fail+=dF[Math.floor(Math.random()*6)];
    for(let i=0;i<defense.challenge;i++) fail+=cF[Math.floor(Math.random()*6)];
    if(succ-fail>=1) hits++;
  }
  return hits/samples;
}

// NEW pools after balance fix
const stormAttackOLD = { ability: 1, proficiency: 1 }; // was 1Y+1G
const stormAttackNEW = { ability: 2, proficiency: 1 }; // now 1Y+2G
const officerOLD = { ability: 1, proficiency: 0 };      // was 1G
const officerNEW = { ability: 1, proficiency: 1 };      // now 1Y+1G

const heroes = [
  { name: 'Korrga', agility: 2, coord: 0, armorDef: 1 },
  { name: 'Vex', agility: 3, coord: 1, armorDef: 0 },
  { name: 'Ashara', agility: 2, coord: 0, armorDef: 0 },
  { name: 'Ssorku', agility: 2, coord: 0, armorDef: 0 },
];

console.log('=== POST-FIX HIT RATE COMPARISON ===\n');
console.log('Stormtrooper: 1Y+1G -> 1Y+2G (buffed)');
console.log('Officer:      1G    -> 1Y+1G (buffed)\n');

const covers = ['None', 'Light', 'Heavy'];

for (const cover of covers) {
  let oldS=0,newS=0,oldO=0,newO=0;
  let oldSmc=0,newSmc=0,oldOmc=0,newOmc=0;
  for (const h of heroes) {
    let b = buildDefensePool(h.agility, h.coord);
    if (h.armorDef>0) b = applyArmorDefense(b, h.armorDef);
    const d = applyCoverModifier(b, cover);
    oldS += estimateHitProbability(stormAttackOLD, d);
    newS += estimateHitProbability(stormAttackNEW, d);
    oldO += estimateHitProbability(officerOLD, d);
    newO += estimateHitProbability(officerNEW, d);
    oldSmc += monteCarloHitRate(stormAttackOLD, d);
    newSmc += monteCarloHitRate(stormAttackNEW, d);
    oldOmc += monteCarloHitRate(officerOLD, d);
    newOmc += monteCarloHitRate(officerNEW, d);
  }
  console.log(`Cover=${cover.padEnd(5)} | Storm: ${(oldSmc/4*100).toFixed(0)}% -> ${(newSmc/4*100).toFixed(0)}% | Officer: ${(oldOmc/4*100).toFixed(0)}% -> ${(newOmc/4*100).toFixed(0)}%`);
}

// Detailed per-hero for no cover
console.log('\n--- Per-hero detail (no cover) ---');
for (const h of heroes) {
  let b = buildDefensePool(h.agility, h.coord);
  if (h.armorDef>0) b = applyArmorDefense(b, h.armorDef);
  const defStr = `${b.difficulty}P${b.challenge>0?'+'+b.challenge+'R':''}`;
  const sOld = monteCarloHitRate(stormAttackOLD, b);
  const sNew = monteCarloHitRate(stormAttackNEW, b);
  const oOld = monteCarloHitRate(officerOLD, b);
  const oNew = monteCarloHitRate(officerNEW, b);
  console.log(`${h.name.padEnd(8)} (${defStr.padEnd(6)}) | Storm: ${(sOld*100).toFixed(0)}% -> ${(sNew*100).toFixed(0)}% | Officer: ${(oOld*100).toFixed(0)}% -> ${(oNew*100).toFixed(0)}%`);
}

// Projected battle outcome
console.log('\n--- PROJECTED BATTLE OUTCOME (15 rounds, 5 threat/round) ---');
console.log('Total threat available: 4 initial + (15 * 5) = 79 threat');
console.log('Possible reinforcements:');
console.log('  ~20 Stormtroopers (cost 2) or');
console.log('  ~10 Elites (cost 4) or');
console.log('  ~4 E-Webs (cost 5) or');
console.log('  Mix with 2-3 E-Webs + Elites + Stormtroopers');
console.log('  Can afford 1 Inquisitor (cost 9) by round 2');
console.log('\nWith 15 rounds and 5/round income, the spending algorithm can now');
console.log('field Elites (R4-6), E-Webs (R4-6), and mass spam + boss (R7+).');
console.log('\nWith morale exemption, all Imperial NPCs fight to the death.');
console.log('No more Rally-wasting. Every activation produces combat actions.');

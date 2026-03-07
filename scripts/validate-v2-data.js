#!/usr/bin/env node
/**
 * Validates all v2 JSON data files for structural correctness and cross-references.
 */
const fs = require('fs');
const path = require('path');

const coreFiles = [
  'data/dice-d6.json',
  'data/species.json',
  'data/careers.json',
  'data/weapons-v2.json',
  'data/armor.json',
  'data/consumables.json',
  'data/ai-profiles.json',
];

const specFiles = [
  'data/specializations/mercenary.json',
  'data/specializations/assassin.json',
  'data/specializations/droid-tech.json',
  'data/specializations/force-adept.json',
  'data/specializations/smuggler.json',
  'data/specializations/tactician.json',
  'data/specializations/bodyguard.json',
  'data/specializations/demolitionist.json',
  'data/specializations/gadgeteer.json',
  'data/specializations/survivalist.json',
  'data/specializations/gunslinger.json',
  'data/specializations/charmer.json',
  'data/specializations/outlaw-tech.json',
  'data/specializations/slicer.json',
  'data/specializations/healer.json',
  'data/specializations/niman-disciple.json',
  'data/specializations/figurehead.json',
  'data/specializations/strategist.json',
];

const npcFiles = [
  'data/npcs/imperials.json',
  'data/npcs/bounty-hunters.json',
  'data/npcs/warlord-forces.json',
  'data/npcs/companions.json',
  'data/npcs/bounty-targets.json',
];

const missionFiles = [
  'data/missions/act1-mission1-arrival.json',
  'data/missions/act1-mission2-intel.json',
  'data/missions/act1-mission3a-cache.json',
  'data/missions/act1-mission3b-ambush.json',
  'data/missions/act1-mission4-finale.json',
  'data/missions/act2-mission1-crossroads.json',
  'data/missions/act2-mission2-bounty.json',
  'data/missions/act2-mission3a-warehouse.json',
  'data/missions/act2-mission3b-hunting-grounds.json',
  'data/missions/act2-mission4-throne.json',
  'data/missions/act3-mission1-defection.json',
  'data/missions/act3-mission2-prototype.json',
  'data/missions/act3-mission3a-stronghold.json',
  'data/missions/act3-mission3b-betrayal.json',
  'data/missions/act3-mission4-endgame.json',
];

const socialFiles = [
  'data/social/act1-hub.json',
  'data/social/act2-hub.json',
  'data/social/act3-hub.json',
];

const campaignFiles = [
  'data/campaigns/tangrene-liberation.json',
];

const allFiles = [...coreFiles, ...specFiles, ...npcFiles, ...missionFiles, ...socialFiles, ...campaignFiles];

let allOk = true;
function fail(msg) { console.error('FAIL: ' + msg); allOk = false; }

// 1. Parse all JSON files
for (const f of allFiles) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log('OK: ' + f);
  } catch (e) {
    fail(f + ' -- ' + e.message);
  }
}

// 2. Load core data
const species = JSON.parse(fs.readFileSync('data/species.json', 'utf8')).species;
const careers = JSON.parse(fs.readFileSync('data/careers.json', 'utf8')).careers;
const weapons = JSON.parse(fs.readFileSync('data/weapons-v2.json', 'utf8')).weapons;
const armor = JSON.parse(fs.readFileSync('data/armor.json', 'utf8')).armor;
const consumables = JSON.parse(fs.readFileSync('data/consumables.json', 'utf8')).consumables;
const dice = JSON.parse(fs.readFileSync('data/dice-d6.json', 'utf8')).dieTypes;
const aiProfiles = JSON.parse(fs.readFileSync('data/ai-profiles.json', 'utf8'));
const allSpecs = specFiles.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));

// Merge all NPC data
const allNpcs = {};
for (const npcFile of npcFiles) {
  const npcs = JSON.parse(fs.readFileSync(npcFile, 'utf8')).npcs;
  Object.assign(allNpcs, npcs);
}

// 3. Dice: 4 types, each with 6 faces
for (const [id, die] of Object.entries(dice)) {
  if (die.faces.length !== 6) fail('Die ' + id + ' has ' + die.faces.length + ' faces (expected 6)');
}
console.log('OK: All 4 dice have 6 faces');

// 4. Species: characteristic totals = 12 (droids are exception: 10 points + extra XP)
const validAbilityEffectTypes = [
  'bonus_strain_recovery', 'social_skill_upgrade', 'wounded_melee_bonus',
  'condition_immunity', 'first_attack_bonus', 'regeneration',
  'skill_bonus', 'soak_bonus', 'natural_weapon_damage', 'dark_vision', 'silhouette_small',
];
const requiredCharFields = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
let speciesAbilityCount = 0;
for (const [id, sp] of Object.entries(species)) {
  // Required fields
  if (!sp.name) fail('Species ' + id + ' missing name');
  if (!sp.description) fail('Species ' + id + ' missing description');
  if (typeof sp.woundBase !== 'number' || sp.woundBase < 1) fail('Species ' + id + ' invalid woundBase');
  if (typeof sp.strainBase !== 'number' || sp.strainBase < 1) fail('Species ' + id + ' invalid strainBase');
  if (typeof sp.speed !== 'number' || sp.speed < 1) fail('Species ' + id + ' invalid speed');
  if (typeof sp.startingXP !== 'number' || sp.startingXP < 1) fail('Species ' + id + ' invalid startingXP');
  // Characteristics
  const c = sp.characteristics;
  for (const f of requiredCharFields) {
    if (typeof c[f] !== 'number' || c[f] < 1 || c[f] > 5) fail('Species ' + id + ' characteristic ' + f + '=' + c[f] + ' out of range [1-5]');
  }
  const total = c.brawn + c.agility + c.intellect + c.cunning + c.willpower + c.presence;
  const expectedTotal = sp.creatureType === 'droid' ? 10 : 12;
  if (total !== expectedTotal) fail('Species ' + id + ' total=' + total + ' (expected ' + expectedTotal + ')');
  // Abilities
  if (sp.abilities && Array.isArray(sp.abilities)) {
    for (const ab of sp.abilities) {
      speciesAbilityCount++;
      if (!ab.id) fail('Species ' + id + ' has ability missing id');
      if (!ab.name) fail('Species ' + id + ' has ability missing name');
      if (!ab.description) fail('Species ' + id + ' has ability missing description');
      if (ab.type !== 'passive') fail('Species ' + id + ' ability ' + ab.id + ' has unexpected type: ' + ab.type);
      if (!ab.effect || !ab.effect.type) fail('Species ' + id + ' ability ' + ab.id + ' missing effect.type');
      if (!validAbilityEffectTypes.includes(ab.effect.type)) {
        fail('Species ' + id + ' ability ' + ab.id + ' has unknown effect type: ' + ab.effect.type);
      }
      // Validate effect-specific fields
      if (ab.effect.type === 'condition_immunity' && !ab.effect.condition) {
        fail('Species ' + id + ' ability ' + ab.id + ' condition_immunity missing condition field');
      }
      if (ab.effect.type === 'skill_bonus') {
        if (!Array.isArray(ab.effect.skills) || ab.effect.skills.length === 0) {
          fail('Species ' + id + ' ability ' + ab.id + ' skill_bonus missing skills array');
        }
        if (typeof ab.effect.value !== 'number') {
          fail('Species ' + id + ' ability ' + ab.id + ' skill_bonus missing numeric value');
        }
      }
      const valueTypes = ['bonus_strain_recovery', 'social_skill_upgrade', 'wounded_melee_bonus',
        'first_attack_bonus', 'regeneration', 'soak_bonus', 'natural_weapon_damage', 'dark_vision', 'silhouette_small'];
      if (valueTypes.includes(ab.effect.type) && typeof ab.effect.value !== 'number') {
        fail('Species ' + id + ' ability ' + ab.id + ' ' + ab.effect.type + ' missing numeric value');
      }
    }
  }
}
console.log('OK: All ' + Object.keys(species).length + ' species valid (characteristics, fields, ' + speciesAbilityCount + ' abilities)');

// 5. Careers: 3 specializations each
for (const [id, career] of Object.entries(careers)) {
  if (career.specializations.length !== 3) fail('Career ' + id + ' has ' + career.specializations.length + ' specializations (expected 3)');
  if (career.careerSkills.length !== 8) fail('Career ' + id + ' has ' + career.careerSkills.length + ' career skills (expected 8)');
}
console.log('OK: All careers have 3 specializations and 8 career skills');

// 6. Specialization talent pools: 30 cards each with 10/8/6/4/2 distribution
const expectedTierDist = [0, 10, 8, 6, 4, 2];
for (const spec of allSpecs) {
  const name = spec.specialization.id;
  const tierCounts = [0, 0, 0, 0, 0, 0];
  for (const t of spec.talents) { tierCounts[t.tier]++; }
  for (let i = 1; i <= 5; i++) {
    if (tierCounts[i] !== expectedTierDist[i]) fail('Spec ' + name + ' Tier ' + i + ': got ' + tierCounts[i] + ', expected ' + expectedTierDist[i]);
  }
  if (!spec.specialization.career) fail('Spec ' + name + ' missing career reference');
  if (!spec.specialization.bonusCareerSkills || spec.specialization.bonusCareerSkills.length !== 4) {
    fail('Spec ' + name + ' should have exactly 4 bonus career skills');
  }
}
console.log('OK: All ' + allSpecs.length + ' specializations have 30 talents (10/8/6/4/2)');

// 7. NPC stat blocks: valid pools, strain rules
for (const [id, npc] of Object.entries(allNpcs)) {
  // Attack pool
  if (typeof npc.attackPool.ability !== 'number') fail('NPC ' + id + ' missing attackPool.ability');
  if (typeof npc.attackPool.proficiency !== 'number') fail('NPC ' + id + ' missing attackPool.proficiency');
  // Strain track (droids get null strainThreshold regardless of tier)
  const isDroid = (npc.keywords || []).some(k => k === 'Droid');
  if (npc.tier === 'Minion' && npc.strainThreshold !== null) fail('Minion ' + id + ' should have null strainThreshold');
  if (npc.tier === 'Rival' && npc.strainThreshold === null && !isDroid) fail('Rival ' + id + ' should have non-null strainThreshold');
  if (npc.tier === 'Nemesis' && npc.strainThreshold === null && !isDroid) fail('Nemesis ' + id + ' should have non-null strainThreshold');
  // Weapons
  for (const w of npc.weapons) {
    if (!w.baseDamage || !w.range) fail('NPC ' + id + ' weapon ' + w.name + ' missing fields');
  }
  // Courage override (optional, must be positive integer if present)
  if (npc.courage !== undefined) {
    if (typeof npc.courage !== 'number' || npc.courage < 1) fail('NPC ' + id + ' courage must be a positive number');
  }
  // Mechanical keywords (optional array, validate names)
  const validKeywords = ['Armor', 'Agile', 'Relentless', 'Cumbersome', 'Disciplined', 'Dauntless', 'Guardian', 'Droid', 'Elusive', 'Adversary', 'Retaliate', 'Pierce', 'Shield', 'Steadfast'];
  if (npc.mechanicalKeywords) {
    if (!Array.isArray(npc.mechanicalKeywords)) fail('NPC ' + id + ' mechanicalKeywords must be an array');
    for (const kw of npc.mechanicalKeywords) {
      if (!validKeywords.includes(kw.name)) fail('NPC ' + id + ' has unknown keyword: ' + kw.name);
      if (['Armor', 'Guardian', 'Disciplined'].includes(kw.name) && typeof kw.value !== 'number') {
        fail('NPC ' + id + ' keyword ' + kw.name + ' requires a numeric value');
      }
    }
  }
  // Boss hit locations (optional, validate structure when present)
  if (npc.isBoss) {
    if (npc.bossHitLocations) {
      if (!Array.isArray(npc.bossHitLocations)) fail('Boss NPC ' + id + ' bossHitLocations must be an array');
      const locIds = new Set();
      for (const loc of npc.bossHitLocations) {
        if (!loc.id || typeof loc.id !== 'string') fail('Boss NPC ' + id + ' hit location missing id');
        if (!loc.name || typeof loc.name !== 'string') fail('Boss NPC ' + id + ' hit location missing name');
        if (typeof loc.woundCapacity !== 'number' || loc.woundCapacity < 1) {
          fail('Boss NPC ' + id + ' hit location ' + loc.id + ' woundCapacity must be a positive number');
        }
        if (!loc.disabledEffects || typeof loc.disabledEffects !== 'object') {
          fail('Boss NPC ' + id + ' hit location ' + loc.id + ' missing disabledEffects');
        }
        if (locIds.has(loc.id)) fail('Boss NPC ' + id + ' has duplicate hit location id: ' + loc.id);
        locIds.add(loc.id);
        // Validate disabled weapon references
        if (loc.disabledEffects.disabledWeapons) {
          for (const wepId of loc.disabledEffects.disabledWeapons) {
            if (!npc.weapons.some(w => w.weaponId === wepId)) {
              fail('Boss NPC ' + id + ' hit location ' + loc.id + ' references unknown weapon: ' + wepId);
            }
          }
        }
      }
    }
    if (npc.bossPhaseTransitions) {
      if (!Array.isArray(npc.bossPhaseTransitions)) fail('Boss NPC ' + id + ' bossPhaseTransitions must be an array');
      for (const pt of npc.bossPhaseTransitions) {
        if (typeof pt.disabledLocationsRequired !== 'number' || pt.disabledLocationsRequired < 1) {
          fail('Boss NPC ' + id + ' phase transition has invalid disabledLocationsRequired');
        }
        if (!pt.newAiArchetype || typeof pt.newAiArchetype !== 'string') {
          fail('Boss NPC ' + id + ' phase transition missing newAiArchetype');
        }
        // Validate optional statBonuses structure
        if (pt.statBonuses) {
          const validKeys = ['attackPoolBonus', 'defensePoolBonus', 'soakBonus', 'speedBonus', 'damageBonus'];
          for (const key of Object.keys(pt.statBonuses)) {
            if (!validKeys.includes(key)) {
              fail('Boss NPC ' + id + ' phase transition has unknown statBonuses key: ' + key);
            }
            if (typeof pt.statBonuses[key] !== 'number') {
              fail('Boss NPC ' + id + ' phase transition statBonuses.' + key + ' must be a number');
            }
          }
        }
      }
    }
  }
}
console.log('OK: All ' + Object.keys(allNpcs).length + ' NPC stat blocks valid (pools, strain, weapons, courage, keywords, boss)');

// 8. AI profile mappings: every NPC has an archetype
const unitMapping = aiProfiles.unitMapping;
for (const npcId of Object.keys(allNpcs)) {
  if (!unitMapping[npcId]) fail('NPC ' + npcId + ' missing AI archetype mapping');
}
console.log('OK: All NPCs have AI archetype mappings');

// 9. Weapons: all melee add brawn, all ranged don't
for (const [id, w] of Object.entries(weapons)) {
  if ((w.type === 'Melee' || w.type === 'Brawl') && !w.damageAddBrawn) {
    fail('Weapon ' + id + ' is ' + w.type + ' but damageAddBrawn=false');
  }
  if ((w.type === 'Ranged (Heavy)' || w.type === 'Ranged (Light)' || w.type === 'Gunnery') && w.damageAddBrawn) {
    fail('Weapon ' + id + ' is ' + w.type + ' but damageAddBrawn=true');
  }
}
console.log('OK: Weapon Brawn rules consistent');

// 10. Armor: defense and soak are non-negative
for (const [id, a] of Object.entries(armor)) {
  if (a.soak < 0 || a.defense < 0) fail('Armor ' + id + ' has negative soak or defense');
}
console.log('OK: All armor stats non-negative');

// 11. Mission structure validation
const allMissions = {};
for (const mf of missionFiles) {
  const mission = JSON.parse(fs.readFileSync(mf, 'utf8'));
  allMissions[mission.id] = mission;
  // Required fields
  if (!mission.id) fail(mf + ' missing id');
  if (!mission.name) fail(mf + ' missing name');
  if (typeof mission.roundLimit !== 'number') fail(mf + ' missing roundLimit');
  if (!mission.objectives || mission.objectives.length === 0) fail(mf + ' has no objectives');
  if (!mission.victoryConditions || mission.victoryConditions.length === 0) fail(mf + ' has no victoryConditions');
  // Initial enemies reference valid NPCs
  for (const enemy of (mission.initialEnemies || [])) {
    if (!allNpcs[enemy.npcProfileId]) fail(mf + ' references unknown NPC: ' + enemy.npcProfileId);
  }
  // Reinforcements reference valid NPCs
  for (const wave of (mission.reinforcements || [])) {
    for (const group of wave.groups) {
      if (!allNpcs[group.npcProfileId]) fail(mf + ' reinforcement references unknown NPC: ' + group.npcProfileId);
    }
  }
  // Fog of war config validation
  if (mission.fogOfWar !== undefined && typeof mission.fogOfWar !== 'boolean') {
    fail(mf + ' fogOfWar must be a boolean');
  }
  if (mission.fogOfWarVisionRange !== undefined) {
    if (typeof mission.fogOfWarVisionRange !== 'number' || mission.fogOfWarVisionRange < 1 || mission.fogOfWarVisionRange > 20) {
      fail(mf + ' fogOfWarVisionRange must be a number between 1 and 20');
    }
  }
}
console.log('OK: All ' + Object.keys(allMissions).length + ' missions structurally valid');

// 12. Campaign graph: all referenced missions exist
const campaign = JSON.parse(fs.readFileSync('data/campaigns/tangrene-liberation.json', 'utf8'));
for (const act of campaign.acts) {
  for (const mId of act.missionIds) {
    if (!allMissions[mId]) fail('Campaign act ' + act.act + ' references unknown mission: ' + mId);
  }
}
for (const [from, toList] of Object.entries(campaign.missionGraph)) {
  if (!allMissions[from]) fail('Campaign graph node "' + from + '" is not a known mission');
  for (const to of toList) {
    if (!allMissions[to]) fail('Campaign graph edge "' + from + '" -> "' + to + '" references unknown mission');
  }
}
console.log('OK: Campaign graph references valid (' + Object.keys(campaign.missionGraph).length + ' nodes)');

// 13. Social hub validation
for (const sf of socialFiles) {
  const hub = JSON.parse(fs.readFileSync(sf, 'utf8'));
  if (!hub.location || !hub.location.id) fail(sf + ' missing location.id');
  if (!hub.npcs || Object.keys(hub.npcs).length === 0) fail(sf + ' has no NPCs');
  if (!hub.location.shops || hub.location.shops.length === 0) fail(sf + ' has no shops');
  // Encounters reference valid NPCs
  for (const enc of (hub.location.encounters || [])) {
    if (!hub.npcs[enc.npcId]) fail(sf + ' encounter "' + enc.id + '" references unknown NPC: ' + enc.npcId);
  }
}
console.log('OK: All social hubs structurally valid');

// 14. Consumables: required fields and valid effect types
const validEffects = ['heal_wounds', 'recover_strain', 'boost'];
const validTargetTypes = ['organic', 'droid', 'any'];
for (const [id, con] of Object.entries(consumables)) {
  if (!con.id || con.id !== id) fail('Consumable ' + id + ' has mismatched id');
  if (!con.name) fail('Consumable ' + id + ' missing name');
  if (!validEffects.includes(con.effect)) fail('Consumable ' + id + ' has unknown effect: ' + con.effect);
  if (!validTargetTypes.includes(con.targetType)) fail('Consumable ' + id + ' has unknown targetType: ' + con.targetType);
  if (typeof con.baseValue !== 'number' || con.baseValue < 1) fail('Consumable ' + id + ' baseValue must be a positive number');
  if (typeof con.price !== 'number' || con.price < 0) fail('Consumable ' + id + ' price must be non-negative');
}
console.log('OK: All ' + Object.keys(consumables).length + ' consumables valid (fields, effects, target types)');

// 15. Shop inventory cross-references: every shop item must exist in weapons, armor, or consumables
const allItemIds = new Set([
  ...Object.keys(weapons),
  ...Object.keys(armor),
  ...Object.keys(consumables),
]);
// Also include gear items from equipment.json (v1 format, items in "equipment" array)
try {
  const equipData = JSON.parse(fs.readFileSync('data/equipment.json', 'utf8'));
  for (const item of (equipData.equipment || [])) {
    allItemIds.add(item.id);
  }
} catch (e) { /* equipment.json is optional */ }

let shopItemCount = 0;
for (const sf of socialFiles) {
  const hub = JSON.parse(fs.readFileSync(sf, 'utf8'));
  for (const shop of (hub.location.shops || [])) {
    for (const entry of (shop.inventory || [])) {
      shopItemCount++;
      if (!allItemIds.has(entry.itemId)) {
        fail(sf + ' shop "' + shop.name + '" references unknown item: ' + entry.itemId);
      }
    }
  }
}
console.log('OK: All ' + shopItemCount + ' shop inventory items reference valid catalog entries');

// 16. Board templates: valid structure and dimensions
const boardsDir = 'data/boards';
const boardFiles = fs.readdirSync(boardsDir).filter(f => f.endsWith('.json') && f !== 'index.json');
for (const bf of boardFiles) {
  const filePath = path.join(boardsDir, bf);
  const board = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!board.id) fail(filePath + ' missing id');
  if (!board.name) fail(filePath + ' missing name');
  if (typeof board.width !== 'number' || board.width < 1) fail(filePath + ' missing or invalid width');
  if (typeof board.height !== 'number' || board.height < 1) fail(filePath + ' missing or invalid height');
  if (!Array.isArray(board.tiles)) fail(filePath + ' missing tiles array');
  if (board.tiles.length !== board.height) {
    fail(filePath + ' tiles rows (' + board.tiles.length + ') does not match height (' + board.height + ')');
  }
  for (let r = 0; r < board.tiles.length; r++) {
    if (board.tiles[r].length !== board.width) {
      fail(filePath + ' row ' + r + ' has ' + board.tiles[r].length + ' cols (expected ' + board.width + ')');
    }
  }
}
console.log('OK: All ' + boardFiles.length + ' board templates valid (id, dimensions, tile grid)');

console.log(allOk ? '\n=== ALL CHECKS PASSED ===' : '\n=== SOME CHECKS FAILED ===');
process.exit(allOk ? 0 : 1);

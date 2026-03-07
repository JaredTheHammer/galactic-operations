/**
 * Game Data Loader
 * Loads and parses game data from JSON files
 */

import type {
  GameData,
  V1_UnitDefinition,
  TacticCard,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  SpeciesDefinition,
  CareerDefinition,
  SpecializationDefinition,
  TalentCard,
  D6DieType,
  D6DieDefinition,
  BoardTemplate,
  FactionDefinition,
  SecretObjectiveDefinition,
  ExplorationTokenType,
  RelicDefinition,
  AgendaDirectiveDefinition,
  V1_DieColor,
} from './types.js';

// Legacy type aliases for the v1 data loader
type DieColor = V1_DieColor;
type UnitDefinition = V1_UnitDefinition;
type Equipment = Record<string, unknown>;
type DieDefinition = Record<string, unknown>;

/**
 * Load game data from the file system
 * Reads dice.json, units/imperials.json, units/operatives.json, cards/tactics.json, equipment.json
 * Merges imperial and operative units into a single Record
 * Returns a fully typed GameData object
 *
 * Note: This function is designed for Node.js file system access
 */
/** @deprecated Use loadGameDataV2 instead */
export async function loadGameData(basePath: string): Promise<GameData> {
  // Dynamic import of fs to support both Node.js and browser environments
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');

  const diceData = JSON.parse(
    await readFile(join(basePath, 'dice.json'), 'utf-8')
  );
  const imperialsData = JSON.parse(
    await readFile(join(basePath, 'units', 'imperials.json'), 'utf-8')
  );
  const operativesData = JSON.parse(
    await readFile(join(basePath, 'units', 'operatives.json'), 'utf-8')
  );
  const tacticsData = JSON.parse(
    await readFile(join(basePath, 'cards', 'tactics.json'), 'utf-8')
  );
  const equipmentData = JSON.parse(
    await readFile(join(basePath, 'equipment.json'), 'utf-8')
  );

  return loadGameDataFromObjects({
    dice: diceData,
    imperials: imperialsData,
    operatives: operativesData,
    tactics: tacticsData,
    equipment: equipmentData,
  });
}

/**
 * Load game data from pre-imported JSON objects
 * This version is useful for browser contexts where modules are pre-loaded
 */
/** @deprecated Use loadGameDataV2 instead */
export function loadGameDataFromObjects(data: {
  dice: any;
  imperials: any;
  operatives: any;
  tactics: any;
  equipment: any;
  factions?: any;
}): GameData {
  // Merge imperial and operative units into a single Record
  const units: Record<string, V1_UnitDefinition> = {
    ...data.imperials,
    ...data.operatives,
  };

  // Build dice definitions map
  const dice: Record<string, any> = {};
  if (Array.isArray(data.dice)) {
    for (const die of data.dice) {
      dice[die.color] = die;
    }
  } else {
    // If dice is already a Record
    Object.assign(dice, data.dice);
  }

  // Build tactic cards map
  const tacticCards: Record<string, TacticCard> = {};
  if (Array.isArray(data.tactics)) {
    for (const card of data.tactics) {
      tacticCards[card.id] = card;
    }
  } else {
    Object.assign(tacticCards, data.tactics);
  }

  // Build equipment map
  const equipment: Record<string, any> = {};
  if (Array.isArray(data.equipment)) {
    for (const item of data.equipment) {
      equipment[item.id] = item;
    }
  } else {
    Object.assign(equipment, data.equipment);
  }

  // Build factions map (if provided)
  const factions: Record<string, FactionDefinition> = {};
  if (data.factions) {
    const factionList = Array.isArray(data.factions) ? data.factions : Object.values(data.factions);
    for (const faction of factionList as any[]) {
      if (faction.id) factions[faction.id] = faction as FactionDefinition;
    }
  }

  return {
    dice,
    units,
    weapons: {}, // Weapons are derived from units for now
    tacticCards,
    equipment,
    factions: Object.keys(factions).length > 0 ? factions : undefined,
  } as any;
}

/**
 * Load v2 game data from the file system.
 * Returns the proper GameData shape used by the v2 engine:
 * { dice, species, careers, specializations, weapons, armor, npcProfiles }
 */
export async function loadGameDataV2(basePath: string): Promise<GameData> {
  const { readFile, readdir } = await import('fs/promises');
  const { join } = await import('path');

  // Dice (d6 system)
  const diceRaw = JSON.parse(
    await readFile(join(basePath, 'dice-d6.json'), 'utf-8')
  );
  const dice = (diceRaw.dieTypes ?? diceRaw) as Record<D6DieType, D6DieDefinition>;

  // Species
  const speciesRaw = JSON.parse(
    await readFile(join(basePath, 'species.json'), 'utf-8')
  );
  const species: Record<string, SpeciesDefinition> = speciesRaw.species ?? speciesRaw;

  // Careers
  const careersRaw = JSON.parse(
    await readFile(join(basePath, 'careers.json'), 'utf-8')
  );
  const careers: Record<string, CareerDefinition> = careersRaw.careers ?? careersRaw;

  // Weapons (v2)
  const weaponsRaw = JSON.parse(
    await readFile(join(basePath, 'weapons-v2.json'), 'utf-8')
  );
  const weapons: Record<string, WeaponDefinition> = weaponsRaw.weapons ?? weaponsRaw;

  // Armor
  const armorRaw = JSON.parse(
    await readFile(join(basePath, 'armor.json'), 'utf-8')
  );
  const armor: Record<string, ArmorDefinition> = armorRaw.armor ?? armorRaw;

  // NPC Profiles (load all JSON files in npcs directory)
  const npcProfiles: Record<string, NPCProfile> = {};
  const npcsDir = join(basePath, 'npcs');
  const npcFiles = await readdir(npcsDir);
  for (const file of npcFiles) {
    if (!file.endsWith('.json')) continue;
    const raw = JSON.parse(await readFile(join(npcsDir, file), 'utf-8'));
    const npcs = raw.npcs ?? raw;
    for (const [id, npc] of Object.entries(npcs)) {
      npcProfiles[id] = npc as NPCProfile;
    }
  }

  // Specializations (load all JSON files in specializations directory)
  const specializations: Record<string, SpecializationDefinition & { talents: TalentCard[] }> = {};
  const specDir = join(basePath, 'specializations');
  const specFiles = await readdir(specDir);
  for (const file of specFiles) {
    if (!file.endsWith('.json')) continue;
    const raw = JSON.parse(await readFile(join(specDir, file), 'utf-8'));
    if (raw.specialization) {
      const specDef = raw.specialization;
      specializations[specDef.id] = {
        ...specDef,
        talents: raw.talents ?? [],
      };
    }
  }

  // Factions (single file, array of faction definitions)
  const factions: Record<string, FactionDefinition> = {};
  try {
    const factionsRaw = JSON.parse(
      await readFile(join(basePath, 'factions.json'), 'utf-8')
    );
    const factionList = Array.isArray(factionsRaw) ? factionsRaw : (factionsRaw.factions ?? []);
    for (const faction of factionList) {
      if (faction.id) {
        factions[faction.id] = faction as FactionDefinition;
      }
    }
  } catch {
    // factions.json is optional; older data directories may not have it
  }
  // TI4-inspired data files (optional -- gracefully handle missing files)
  let secretObjectives: Record<string, SecretObjectiveDefinition> | undefined;
  let explorationTokenTypes: Record<string, ExplorationTokenType> | undefined;
  let relicDefinitions: Record<string, RelicDefinition> | undefined;
  let agendaDirectives: Record<string, AgendaDirectiveDefinition> | undefined;

  try {
    const raw = JSON.parse(await readFile(join(basePath, 'secret-objectives.json'), 'utf-8'));
    secretObjectives = raw.secretObjectives ?? raw;
  } catch { /* file not present */ }

  try {
    const raw = JSON.parse(await readFile(join(basePath, 'exploration-tokens.json'), 'utf-8'));
    explorationTokenTypes = raw.explorationTokenTypes ?? raw;
  } catch { /* file not present */ }

  try {
    const raw = JSON.parse(await readFile(join(basePath, 'relics.json'), 'utf-8'));
    relicDefinitions = raw.relicDefinitions ?? raw;
  } catch { /* file not present */ }

  try {
    const raw = JSON.parse(await readFile(join(basePath, 'agenda-directives.json'), 'utf-8'));
    agendaDirectives = raw.agendaDirectives ?? raw;
  } catch { /* file not present */ }

  return {
    dice,
    species,
    careers,
    specializations,
    weapons,
    armor,
    npcProfiles,
    factions: Object.keys(factions).length > 0 ? factions : undefined,
    secretObjectives,
    explorationTokenTypes,
    relicDefinitions,
    agendaDirectives,
  };
}

/**
 * Load board templates from the data/boards directory.
 * Used by the simulator to generate proper maps matching the live game.
 */
export async function loadBoardTemplates(basePath: string): Promise<BoardTemplate[]> {
  const { readFile, readdir } = await import('fs/promises');
  const { join } = await import('path');

  const boardsDir = join(basePath, 'boards');
  const files = await readdir(boardsDir);
  const templates: BoardTemplate[] = [];

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const raw = JSON.parse(await readFile(join(boardsDir, file), 'utf-8'));
    if (raw.id && raw.tiles) {
      templates.push(raw as BoardTemplate);
    }
  }

  return templates;
}


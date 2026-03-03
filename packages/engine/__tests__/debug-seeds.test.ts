import { describe, it, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../..', 'data');
import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import { runCombatSim, type CombatScenarioConfig } from '../src/ai/combat-simulator.js';
import type { GameData, BoardTemplate } from '../src/types.js';
import type { AIProfilesData } from '../src/ai/types.js';

let gameData: GameData;
let boardTemplates: BoardTemplate[];
let profilesData: AIProfilesData;

const korrgaScenario: CombatScenarioConfig = {
  id: 'korrga-vs-patrol', name: 'Korrga vs Patrol',
  arena: { preset: 'small', cover: 'light' },
  sideA: { label: 'Imperial', figures: [{ type: 'npc', npcId: 'stormtrooper', count: 3 }] },
  sideB: { label: 'Korrga', figures: [{ type: 'hero', heroId: 'hero-korrga',
    spec: { name: 'Korrga', species: 'wookiee', career: 'hired-gun', specialization: 'mercenary',
      characteristicOverrides: { brawn: 1 }, skills: { 'ranged-heavy': 2, resilience: 1, athletics: 1 },
      weapon: 'a280', armor: 'heavy-battle-armor' } }] },
  simulation: { count: 1, seed: 42, roundLimit: 20 },
};

beforeAll(async () => {
  gameData = await loadGameDataV2(DATA_PATH);
  boardTemplates = await loadBoardTemplates(DATA_PATH);
  const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
  profilesData = loadAIProfiles(profilesJson);
});

describe('debug seeds', () => {
  it('check 20 seeds for attacks', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const result = runCombatSim(korrgaScenario, gameData, profilesData, boardTemplates, seed);
      const hasAttacks = result.figures.some(f => (f.actionsUsed['Attack'] ?? 0) > 0);
      const hasDefeats = result.totalDefeated.sideA > 0 || result.totalDefeated.sideB > 0;
      console.log(`Seed ${seed}: winner=${result.winner} rounds=${result.roundsPlayed} attacks=${hasAttacks} defeats=${hasDefeats} actions=${JSON.stringify(result.figures.map(f=>f.actionsUsed))}`);
    }
  });
});

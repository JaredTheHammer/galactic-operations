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

const simpleScenario: CombatScenarioConfig = {
  id: 'replay-test-simple', name: 'Replay Test: 1v1',
  arena: { preset: 'tiny', cover: 'none' },
  sideA: { label: 'Imperial', figures: [{ type: 'npc', npcId: 'stormtrooper', count: 1 }] },
  sideB: { label: 'Operative', figures: [{ type: 'hero', heroId: 'hero-replay-test',
    spec: { name: 'Replay Tester', species: 'human', career: 'hired-gun', specialization: 'mercenary',
      characteristicOverrides: { brawn: 1 }, skills: { 'ranged-heavy': 2 },
      weapon: 'a280', armor: 'padded-armor' } }] },
  simulation: { count: 1, seed: 42, roundLimit: 16 },
};

beforeAll(async () => {
  gameData = await loadGameDataV2(DATA_PATH);
  boardTemplates = await loadBoardTemplates(DATA_PATH);
  const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
  profilesData = loadAIProfiles(profilesJson);
});

describe('debug sim', () => {
  it('run simpleScenario via combat-simulator', () => {
    const result = runCombatSim(simpleScenario, gameData, profilesData, boardTemplates, 42);
    console.log('Winner:', result.winner, result.winnerLabel);
    console.log('Rounds:', result.roundsPlayed);
    console.log('Figures:');
    for (const f of result.figures) {
      console.log(`  ${f.name} (${f.side}): survived=${f.survived}, wounded=${f.isWounded}, dmg=${f.damageTaken}, actions=${JSON.stringify(f.actionsUsed)}`);
    }
    console.log('Damage:', result.totalDamage);
    console.log('Defeated:', result.totalDefeated);
  });
});

import { describe, it, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../..', 'data');
import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import { runCombatWithReplay } from '../src/replay-combat.js';
import type { CombatScenarioConfig } from '../src/ai/combat-simulator.js';
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

describe('seed 2 replay', () => {
  it('produces attacks with seed 2', () => {
    const replay = runCombatWithReplay(korrgaScenario, gameData, profilesData, boardTemplates, 2);
    console.log('Winner:', replay.winner, replay.winnerLabel, 'Rounds:', replay.totalRounds);
    console.log('Total frames:', replay.frames.length);
    const attackFrames = replay.frames.filter(f => f.attackLine);
    const attackTextFrames = replay.frames.filter(f => f.actionText.includes('attacks'));
    console.log('Frames with attackLine:', attackFrames.length);
    console.log('Frames with "attacks" text:', attackTextFrames.length);
    
    // Show attack frames
    for (const f of attackTextFrames.slice(0, 5)) {
      console.log(`  [${f.frameIndex}] ${f.actionText} attackLine=${!!f.attackLine}`);
    }
    
    const lastFrame = replay.frames[replay.frames.length - 1];
    console.log('\nLast frame:');
    for (const fig of lastFrame.figures) {
      console.log(`  ${fig.name}: defeated=${fig.isDefeated}, wounds=${fig.woundsCurrent}`);
    }
  });
});

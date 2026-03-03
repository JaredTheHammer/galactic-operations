import { describe, it, expect, beforeAll } from 'vitest';
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

const multiScenario: CombatScenarioConfig = {
  id: 'replay-test-multi',
  name: 'Replay Test: 3v2',
  arena: { preset: 'small', cover: 'light' },
  sideA: {
    label: 'Imperial Patrol',
    figures: [{ type: 'npc', npcId: 'stormtrooper', count: 3 }],
  },
  sideB: {
    label: 'Hero Duo',
    figures: [
      {
        type: 'hero', heroId: 'hero-tank',
        spec: { name: 'Tank', species: 'wookiee', career: 'hired-gun', specialization: 'mercenary',
          characteristicOverrides: { brawn: 1 }, skills: { 'ranged-heavy': 2, resilience: 1 },
          weapon: 'a280', armor: 'heavy-battle-armor' },
      },
      {
        type: 'hero', heroId: 'hero-dps',
        spec: { name: 'DPS', species: 'human', career: 'scoundrel', specialization: 'smuggler',
          characteristicOverrides: { agility: 1 }, skills: { 'ranged-light': 2, cool: 1 },
          weapon: 'dl-44', armor: 'blast-vest' },
      },
    ],
  },
  simulation: { count: 1, seed: 42, roundLimit: 20 },
};

beforeAll(async () => {
  gameData = await loadGameDataV2(DATA_PATH);
  boardTemplates = await loadBoardTemplates(DATA_PATH);
  const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
  profilesData = loadAIProfiles(profilesJson);
});

describe('debug replay', () => {
  it('inspect frames', () => {
    const replay = runCombatWithReplay(multiScenario, gameData, profilesData, boardTemplates, 42);
    
    console.log('Winner:', replay.winner, replay.winnerLabel);
    console.log('Total frames:', replay.frames.length);
    console.log('Total rounds:', replay.totalRounds);
    
    // Check for "attacks" in action text
    const attackTextFrames = replay.frames.filter(f => f.actionText.includes('attacks'));
    console.log('Frames with "attacks" in actionText:', attackTextFrames.length);
    
    // Check for attackLine
    const attackLineFrames = replay.frames.filter(f => f.attackLine);
    console.log('Frames with attackLine:', attackLineFrames.length);
    
    // Show first 15 frames action text
    console.log('\n--- First 25 frames ---');
    for (let i = 0; i < Math.min(25, replay.frames.length); i++) {
      const f = replay.frames[i];
      console.log(`[${i}] R${f.roundNumber} ${f.actionText}${f.attackLine ? ' [ATTACK_LINE]' : ''}${f.movePath?.length ? ' [MOVE_PATH]' : ''}`);
    }
    
    // Check last frame for defeated
    const lastFrame = replay.frames[replay.frames.length - 1];
    console.log('\n--- Last frame figures ---');
    for (const fig of lastFrame.figures) {
      console.log(`  ${fig.name} (${fig.side}): defeated=${fig.isDefeated}, wounded=${fig.isWounded}, wounds=${fig.woundsCurrent}`);
    }
    
    // Check second-to-last frame
    if (replay.frames.length > 1) {
      const prevFrame = replay.frames[replay.frames.length - 2];
      console.log('\n--- Second-to-last frame figures ---');
      for (const fig of prevFrame.figures) {
        console.log(`  ${fig.name} (${fig.side}): defeated=${fig.isDefeated}, wounded=${fig.isWounded}, wounds=${fig.woundsCurrent}`);
      }
    }
    
    expect(true).toBe(true);
  });
});

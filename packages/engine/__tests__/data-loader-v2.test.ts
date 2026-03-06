/**
 * Tests for async data loading functions in data-loader.ts:
 * - loadGameDataV2: loads v2 game data including directory scanning
 * - loadBoardTemplates: loads board templates from boards/ directory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';

import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';

// ============================================================================
// HELPERS
// ============================================================================

const DATA_DIR = path.resolve(__dirname, '../../../data');

// ============================================================================
// loadGameDataV2 - INTEGRATION TESTS (uses real data files)
// ============================================================================

describe('loadGameDataV2', () => {
  it('loads all required data files and returns valid GameData', async () => {
    const gd = await loadGameDataV2(DATA_DIR);

    // Verify top-level keys
    expect(gd.dice).toBeDefined();
    expect(gd.species).toBeDefined();
    expect(gd.careers).toBeDefined();
    expect(gd.weapons).toBeDefined();
    expect(gd.armor).toBeDefined();
    expect(gd.npcProfiles).toBeDefined();
    expect(gd.specializations).toBeDefined();
  });

  it('loads species as a Record keyed by species ID', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    expect(Object.keys(gd.species).length).toBeGreaterThan(0);
    // Check a known species exists
    const speciesIds = Object.keys(gd.species);
    expect(speciesIds.some(id => id.toLowerCase().includes('human'))).toBe(true);
  });

  it('loads careers as a Record keyed by career ID', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    expect(Object.keys(gd.careers).length).toBeGreaterThan(0);
  });

  it('loads weapons as a Record keyed by weapon ID', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    const weaponIds = Object.keys(gd.weapons);
    expect(weaponIds.length).toBeGreaterThan(0);
  });

  it('loads armor as a Record keyed by armor ID', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    const armorIds = Object.keys(gd.armor);
    expect(armorIds.length).toBeGreaterThan(0);
  });

  it('loads NPC profiles from all files in npcs/ directory', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    const npcIds = Object.keys(gd.npcProfiles);
    expect(npcIds.length).toBeGreaterThan(0);
    // Should have at least one NPC with expected fields
    const firstNpc = gd.npcProfiles[npcIds[0]];
    expect(firstNpc).toHaveProperty('woundThreshold');
  });

  it('loads specializations from all files in specializations/ directory', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    const specIds = Object.keys(gd.specializations);
    expect(specIds.length).toBeGreaterThan(0);
    // Each specialization should have talents
    const firstSpec = gd.specializations[specIds[0]];
    expect(firstSpec).toHaveProperty('talents');
    expect(Array.isArray(firstSpec.talents)).toBe(true);
  });

  it('loads d6 dice definitions', async () => {
    const gd = await loadGameDataV2(DATA_DIR);
    expect(gd.dice).toBeDefined();
    expect(Object.keys(gd.dice).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// loadBoardTemplates - INTEGRATION TESTS
// ============================================================================

describe('loadBoardTemplates', () => {
  it('loads board templates from boards/ directory', async () => {
    const templates = await loadBoardTemplates(DATA_DIR);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('each template has id and tiles properties', async () => {
    const templates = await loadBoardTemplates(DATA_DIR);
    for (const t of templates) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('tiles');
    }
  });

  it('excludes index.json from templates', async () => {
    const templates = await loadBoardTemplates(DATA_DIR);
    // None should have the index.json id pattern
    for (const t of templates) {
      expect(t.id).not.toBe('index');
    }
  });

  it('returns an array of valid BoardTemplate objects', async () => {
    const templates = await loadBoardTemplates(DATA_DIR);
    expect(Array.isArray(templates)).toBe(true);
    // First template should have a string id and an array tiles
    if (templates.length > 0) {
      expect(typeof templates[0].id).toBe('string');
      expect(Array.isArray(templates[0].tiles)).toBe(true);
    }
  });
});

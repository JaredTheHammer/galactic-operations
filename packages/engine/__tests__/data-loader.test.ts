/**
 * Tests for data-loader.ts
 *
 * Covers loadGameDataFromObjects with both array and Record input formats
 * for dice, tactics, and equipment data.
 */

import { describe, it, expect } from 'vitest';
import { loadGameDataFromObjects } from '../src/data-loader.js';

describe('loadGameDataFromObjects', () => {
  const imperials = {
    stormtrooper: { id: 'stormtrooper', name: 'Stormtrooper' },
  };
  const operatives = {
    rebel: { id: 'rebel', name: 'Rebel Trooper' },
  };

  describe('dice input formats', () => {
    it('handles array-format dice (converts to Record by color)', () => {
      const gd = loadGameDataFromObjects({
        dice: [
          { color: 'green', faces: [1, 2, 3, 4, 5, 6] },
          { color: 'yellow', faces: [1, 2, 3, 4, 5, 6] },
        ],
        imperials,
        operatives,
        tactics: [],
        equipment: [],
      });

      expect(gd.dice).toHaveProperty('green');
      expect(gd.dice).toHaveProperty('yellow');
      expect((gd.dice as any).green.color).toBe('green');
      expect((gd.dice as any).yellow.color).toBe('yellow');
    });

    it('handles Record-format dice (passes through)', () => {
      const gd = loadGameDataFromObjects({
        dice: {
          green: { color: 'green', faces: [1, 2] },
          red: { color: 'red', faces: [3, 4] },
        },
        imperials,
        operatives,
        tactics: [],
        equipment: [],
      });

      expect(gd.dice).toHaveProperty('green');
      expect(gd.dice).toHaveProperty('red');
    });
  });

  describe('tactics input formats', () => {
    it('handles array-format tactics (converts to Record by id)', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials,
        operatives,
        tactics: [
          { id: 'ambush', name: 'Ambush', cost: 2 },
          { id: 'rally', name: 'Rally', cost: 1 },
        ],
        equipment: [],
      });

      expect(gd.tacticCards).toHaveProperty('ambush');
      expect(gd.tacticCards).toHaveProperty('rally');
      expect(gd.tacticCards!.ambush.name).toBe('Ambush');
    });

    it('handles Record-format tactics (passes through)', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials,
        operatives,
        tactics: {
          ambush: { id: 'ambush', name: 'Ambush', cost: 2 },
        },
        equipment: [],
      });

      expect(gd.tacticCards).toHaveProperty('ambush');
    });
  });

  describe('equipment input formats', () => {
    it('handles array-format equipment (converts to Record by id)', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials,
        operatives,
        tactics: [],
        equipment: [
          { id: 'medpac', name: 'Medpac', cost: 100 },
          { id: 'stim', name: 'Stim Pack', cost: 50 },
        ],
      });

      expect(gd.equipment).toHaveProperty('medpac');
      expect(gd.equipment).toHaveProperty('stim');
      expect(gd.equipment!.medpac.name).toBe('Medpac');
    });

    it('handles Record-format equipment (passes through)', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials,
        operatives,
        tactics: [],
        equipment: {
          medpac: { id: 'medpac', name: 'Medpac', cost: 100 },
        },
      });

      expect(gd.equipment).toHaveProperty('medpac');
    });
  });

  describe('unit merging', () => {
    it('merges imperials and operatives into a single units Record', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials,
        operatives,
        tactics: [],
        equipment: [],
      });

      expect(gd.units).toHaveProperty('stormtrooper');
      expect(gd.units).toHaveProperty('rebel');
    });

    it('handles empty units', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials: {},
        operatives: {},
        tactics: [],
        equipment: [],
      });

      expect(Object.keys(gd.units ?? {})).toHaveLength(0);
    });
  });

  describe('return shape', () => {
    it('returns all expected top-level keys', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials: {},
        operatives: {},
        tactics: [],
        equipment: [],
      });

      expect(gd).toHaveProperty('dice');
      expect(gd).toHaveProperty('units');
      expect(gd).toHaveProperty('weapons');
      expect(gd).toHaveProperty('tacticCards');
      expect(gd).toHaveProperty('equipment');
    });

    it('always sets weapons to empty object', () => {
      const gd = loadGameDataFromObjects({
        dice: {},
        imperials,
        operatives,
        tactics: [],
        equipment: [],
      });

      expect(gd.weapons).toEqual({});
    });
  });
});

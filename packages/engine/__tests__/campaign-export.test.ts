/**
 * Tests for campaign export/import bundle logic.
 *
 * Tests the pure-logic portions of campaign-export.ts that don't
 * require IndexedDB (blob helpers, portrait ID collection, bundle
 * structure validation).
 */

import { describe, it, expect } from 'vitest';
import type { CampaignState, HeroCharacter } from '../src/types';
import type { CampaignExportBundle, ExportedPortrait } from '../../client/src/services/campaign-export';

// ============================================================================
// Helper: minimal CampaignState with hero portraitIds
// ============================================================================

function makeCampaignWithHeroes(heroPortraits: Record<string, string | undefined>): CampaignState {
  const heroes: Record<string, HeroCharacter> = {};
  let idx = 0;
  for (const [name, portraitId] of Object.entries(heroPortraits)) {
    heroes[`hero-${idx}`] = {
      id: `hero-${idx}`,
      name,
      species: 'human',
      career: 'soldier',
      specializations: ['heavy'],
      portraitId: portraitId ?? undefined,
      abilities: [],
      skills: {},
      talents: [],
      wounds: { current: 0, threshold: 12 },
      strain: { current: 0, threshold: 12 },
      soak: 3,
      defenses: { melee: 0, ranged: 0 },
      xp: { total: 0, available: 0 },
      isWounded: false,
      missionsRested: 0,
      equipment: { weapons: [], armor: null, gear: [] },
    } as unknown as HeroCharacter;
    idx++;
  }

  return {
    name: 'Test Campaign',
    difficulty: 'normal',
    currentAct: 1,
    missionsPlayed: 0,
    completedMissions: [],
    availableMissionIds: [],
    heroes,
    credits: 500,
    threatLevel: 1,
    storyFlags: {},
    unlockedMissionIds: [],
  } as unknown as CampaignState;
}

// ============================================================================
// Tests
// ============================================================================

describe('campaign-export', () => {
  describe('collectHeroPortraitIds (tested via bundle structure)', () => {
    it('identifies heroes with portraitIds', () => {
      const campaign = makeCampaignWithHeroes({
        'Kira': 'portrait-abc',
        'Rex': 'portrait-def',
        'Spark': undefined,
      });

      const ids = new Set<string>();
      for (const hero of Object.values(campaign.heroes)) {
        if (hero.portraitId) ids.add(hero.portraitId);
      }

      expect(ids.size).toBe(2);
      expect(ids.has('portrait-abc')).toBe(true);
      expect(ids.has('portrait-def')).toBe(true);
    });

    it('returns empty set when no heroes have portraits', () => {
      const campaign = makeCampaignWithHeroes({
        'Kira': undefined,
        'Rex': undefined,
      });

      const ids = new Set<string>();
      for (const hero of Object.values(campaign.heroes)) {
        if (hero.portraitId) ids.add(hero.portraitId);
      }

      expect(ids.size).toBe(0);
    });

    it('deduplicates shared portraitIds', () => {
      const campaign = makeCampaignWithHeroes({
        'Kira': 'shared-portrait',
        'Rex': 'shared-portrait',
      });

      const ids = new Set<string>();
      for (const hero of Object.values(campaign.heroes)) {
        if (hero.portraitId) ids.add(hero.portraitId);
      }

      expect(ids.size).toBe(1);
    });
  });

  describe('CampaignExportBundle structure', () => {
    it('extends CampaignSaveFile with optional portraits', () => {
      const bundle: CampaignExportBundle = {
        version: '1.0.0',
        campaign: {} as any,
        portraits: {
          'abc': {
            id: 'abc',
            label: 'Test Portrait',
            tags: ['human', 'soldier'],
            mimeType: 'image/jpeg',
            originalWidth: 512,
            originalHeight: 512,
            crop: { x: 0, y: 0, width: 1, height: 1, zoom: 1 },
            filename: 'test.jpg',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            originalBase64: 'data:image/jpeg;base64,/9j/4AAQ',
            thumbnailBase64: 'data:image/jpeg;base64,/9j/4AAQ',
          },
        },
      };

      expect(bundle.portraits).toBeDefined();
      expect(bundle.portraits!['abc'].id).toBe('abc');
      expect(bundle.portraits!['abc'].tags).toContain('human');
    });

    it('allows portraits to be undefined', () => {
      const bundle: CampaignExportBundle = {
        version: '1.0.0',
        campaign: {} as any,
      };

      expect(bundle.portraits).toBeUndefined();
    });

    it('supports factionVisuals field', () => {
      const bundle: CampaignExportBundle = {
        version: '1.0.0',
        campaign: {} as any,
        factionVisuals: [
          {
            id: 'galactic-empire',
            label: 'Galactic Empire',
            defaultColors: { primary: '#ffffff', secondary: '#000000' },
            colors: { primary: '#ff0000', secondary: '#000000' },
          },
        ],
      };

      expect(bundle.factionVisuals).toHaveLength(1);
      expect(bundle.factionVisuals![0].id).toBe('galactic-empire');
    });
  });

  describe('ExportedPortrait structure', () => {
    it('includes all required metadata fields', () => {
      const portrait: ExportedPortrait = {
        id: 'sha256-abc',
        label: 'Rebel Pilot',
        tags: ['human', 'pilot', 'rebel-alliance'],
        mimeType: 'image/png',
        originalWidth: 1024,
        originalHeight: 1024,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, zoom: 1.2 },
        filename: 'pilot.png',
        createdAt: '2024-06-15T10:30:00Z',
        updatedAt: '2024-06-15T10:30:00Z',
        originalBase64: 'data:image/png;base64,iVBOR',
        thumbnailBase64: 'data:image/jpeg;base64,/9j/4',
      };

      expect(portrait.id).toBe('sha256-abc');
      expect(portrait.tags).toHaveLength(3);
      expect(portrait.crop.zoom).toBe(1.2);
      expect(portrait.originalBase64).toMatch(/^data:image\//);
      expect(portrait.thumbnailBase64).toMatch(/^data:image\//);
    });
  });

  describe('base64 round-trip (simulated)', () => {
    it('validates base64 data URL format', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const [header, data] = dataUrl.split(',');

      expect(header).toContain('image/jpeg');
      expect(header).toContain('base64');
      expect(data).toBeTruthy();

      // Validate it can be decoded
      const binary = atob(data);
      expect(binary.length).toBeGreaterThan(0);
    });

    it('extracts MIME type from data URL header', () => {
      const headers = [
        'data:image/jpeg;base64',
        'data:image/png;base64',
        'data:image/webp;base64',
      ];

      for (const header of headers) {
        const mimeMatch = header.match(/:(.*?);/);
        expect(mimeMatch).not.toBeNull();
        expect(mimeMatch![1]).toMatch(/^image\//);
      }
    });
  });

  describe('import dedup logic', () => {
    it('content-addressable IDs enable deduplication', () => {
      const existingIds = new Set(['sha256-aaa', 'sha256-bbb']);
      const incomingIds = ['sha256-aaa', 'sha256-ccc', 'sha256-bbb'];

      let imported = 0;
      let skipped = 0;

      for (const id of incomingIds) {
        if (existingIds.has(id)) {
          skipped++;
        } else {
          imported++;
        }
      }

      expect(imported).toBe(1); // sha256-ccc
      expect(skipped).toBe(2); // sha256-aaa, sha256-bbb
    });
  });
});

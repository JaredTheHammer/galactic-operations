/**
 * Tests for the Portrait Prompt Generation Engine.
 *
 * Validates that prompts are correctly composed from game taxonomy data,
 * tags, hero objects, and NPC keywords.
 */

import { describe, it, expect } from 'vitest';
import {
  generatePrompt,
  generatePromptFromTags,
  generatePromptFromNPC,
  BACKGROUND_PRESETS,
  PROMPT_PRESETS,
} from '../../client/src/services/prompt-generator';

describe('prompt-generator', () => {
  // ============================================================================
  // generatePrompt
  // ============================================================================

  describe('generatePrompt', () => {
    it('generates a prompt from a minimal context', () => {
      const result = generatePrompt({});
      expect(result.positive).toBeTruthy();
      expect(result.negative).toBeTruthy();
      expect(result.positive).toContain('character');
      expect(result.positive).toContain('Star Wars');
    });

    it('includes species visual description', () => {
      const result = generatePrompt({ species: 'twilek' });
      expect(result.positive).toContain('lekku');
      expect(result.sections.speciesDesc).toContain("Twi'lek");
    });

    it('includes career visual description', () => {
      const result = generatePrompt({ career: 'scoundrel' });
      expect(result.positive).toContain('spacer jacket');
      expect(result.sections.careerDesc).toContain('holdout blaster');
    });

    it('includes gender in subject phrase', () => {
      const result = generatePrompt({ species: 'human', gender: 'feminine' });
      expect(result.sections.subject).toContain('female');
    });

    it('skips gender for non-humanoid subjects', () => {
      const result = generatePrompt({ species: 'droid', gender: 'non-humanoid' });
      expect(result.sections.subject).not.toContain('male');
      expect(result.sections.subject).not.toContain('female');
    });

    it('includes appearance modifiers', () => {
      const result = generatePrompt({ appearance: ['armored', 'scarred'] });
      expect(result.positive).toContain('battle damage');
      expect(result.positive).toContain('facial scars');
    });

    it('includes faction hints', () => {
      const result = generatePrompt({ factions: ['galactic-empire'] });
      expect(result.positive).toContain('Imperial insignia');
    });

    it('respects style and framing options', () => {
      const result = generatePrompt({ style: 'cinematic', framing: 'action' });
      expect(result.sections.style).toContain('cinematic film still');
      expect(result.sections.framing).toContain('dynamic action pose');
    });

    it('uses custom background when provided', () => {
      const result = generatePrompt({ customBackground: 'Death Star interior' });
      expect(result.sections.background).toBe('Death Star interior');
    });

    it('uses custom subject when provided', () => {
      const result = generatePrompt({ customSubject: 'Darth Vader, Dark Lord' });
      expect(result.sections.subject).toBe('Darth Vader, Dark Lord');
    });

    it('returns structured sections', () => {
      const result = generatePrompt({
        species: 'wookiee',
        career: 'hired-gun',
        style: 'painterly',
        framing: 'bust',
      });
      expect(result.sections).toHaveProperty('subject');
      expect(result.sections).toHaveProperty('speciesDesc');
      expect(result.sections).toHaveProperty('careerDesc');
      expect(result.sections).toHaveProperty('framing');
      expect(result.sections).toHaveProperty('style');
      expect(result.sections).toHaveProperty('quality');
      expect(result.sections).toHaveProperty('background');
    });

    it('includes quality suffix in every prompt', () => {
      const result = generatePrompt({});
      expect(result.positive).toContain('highly detailed');
      expect(result.positive).toContain('sharp focus');
    });

    it('generates non-empty negative prompt', () => {
      const result = generatePrompt({});
      expect(result.negative).toContain('blurry');
      expect(result.negative).toContain('deformed');
    });
  });

  // ============================================================================
  // generatePromptFromTags
  // ============================================================================

  describe('generatePromptFromTags', () => {
    it('extracts species from tags', () => {
      const result = generatePromptFromTags(['rodian', 'scoundrel']);
      expect(result.positive).toContain('Rodian');
      expect(result.positive).toContain('spacer jacket');
    });

    it('extracts gender from tags', () => {
      const result = generatePromptFromTags(['human', 'feminine']);
      expect(result.sections.subject).toContain('female');
    });

    it('extracts appearance modifiers from tags', () => {
      const result = generatePromptFromTags(['hooded', 'cybernetic']);
      expect(result.positive).toContain('hood');
      expect(result.positive).toContain('cybernetic');
    });

    it('extracts factions from tags', () => {
      const result = generatePromptFromTags(['rebel-alliance', 'human', 'commander']);
      expect(result.positive).toContain('Rebel Alliance');
    });

    it('passes style and framing options through', () => {
      const result = generatePromptFromTags(['human'], {
        style: 'comic',
        framing: 'full-body',
      });
      expect(result.sections.style).toContain('comic book');
      expect(result.sections.framing).toContain('full body');
    });

    it('handles empty tag array gracefully', () => {
      const result = generatePromptFromTags([]);
      expect(result.positive).toBeTruthy();
      expect(result.positive).toContain('character');
    });
  });

  // ============================================================================
  // generatePromptFromNPC
  // ============================================================================

  describe('generatePromptFromNPC', () => {
    it('generates prompt for an Imperial officer', () => {
      const result = generatePromptFromNPC(
        'Admiral Thrawn',
        ['officer', 'chiss', 'imperial'],
        'Imperial',
      );
      expect(result.positive).toContain('Admiral Thrawn');
      expect(result.positive).toContain('blue skin');
      expect(result.positive).toContain('Imperial insignia');
    });

    it('infers stormtrooper as armored human soldier', () => {
      const result = generatePromptFromNPC(
        'Stormtrooper Sergeant',
        ['stormtrooper', 'soldier'],
        'Imperial',
      );
      expect(result.positive).toContain('armor');
      expect(result.sections.factionDesc).toContain('Imperial');
    });

    it('infers Rebel faction from Operative side', () => {
      const result = generatePromptFromNPC(
        'Rebel Commando',
        ['soldier'],
        'Operative',
      );
      expect(result.positive).toContain('Rebel Alliance');
    });

    it('handles droid keywords', () => {
      const result = generatePromptFromNPC(
        'Probe Droid',
        ['droid', 'probe-droid'],
        'Imperial',
      );
      expect(result.positive).toContain('droid');
    });

    it('passes render options through', () => {
      const result = generatePromptFromNPC(
        'Bounty Hunter',
        ['bounty-hunter', 'trandoshan'],
        'Neutral',
        { style: 'photorealistic', customBackground: 'Mos Eisley cantina' },
      );
      expect(result.sections.style).toContain('photorealistic');
      expect(result.sections.background).toContain('Mos Eisley');
    });
  });

  // ============================================================================
  // Presets
  // ============================================================================

  describe('presets', () => {
    it('has background presets', () => {
      expect(Object.keys(BACKGROUND_PRESETS).length).toBeGreaterThan(10);
      expect(BACKGROUND_PRESETS['cantina']).toContain('cantina');
    });

    it('has prompt presets with required fields', () => {
      for (const [, preset] of Object.entries(PROMPT_PRESETS)) {
        expect(preset).toHaveProperty('style');
        expect(preset).toHaveProperty('framing');
        expect(preset).toHaveProperty('customBackground');
      }
    });
  });
});

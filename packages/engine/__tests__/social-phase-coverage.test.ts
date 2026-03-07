/**
 * Additional social-phase.ts coverage tests.
 *
 * Covers uncovered paths by mocking resolveSkillCheck/resolveOpposedSkillCheck:
 * - Advantage spending (greedy from most expensive to least)
 * - Threat consequences (net negative advantages on failure)
 * - getNPCOpposedCharacteristic willpower fallback (unknown skill)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/character-v2.js', () => ({
  resolveSkillCheck: vi.fn(),
  resolveOpposedSkillCheck: vi.fn(),
}));

import { resolveSkillCheck, resolveOpposedSkillCheck } from '../src/character-v2.js';
import { resolveSocialCheck } from '../src/social-phase.js';
import type { HeroCharacter, SocialNPC, SocialDialogueOption } from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeHero(): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Jax',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 3, presence: 3 },
    skills: { charm: 2, negotiation: 1 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
  };
}

function makeNPC(overrides: Partial<SocialNPC> = {}): SocialNPC {
  return {
    id: 'npc-1',
    name: 'Merchant',
    description: 'Test NPC.',
    disposition: 'neutral',
    characteristics: { willpower: 2, presence: 2, cunning: 2 },
    skills: {},
    keywords: [],
    ...overrides,
  };
}

function mockCheckResult(overrides: any = {}) {
  return {
    pool: { ability: 2, proficiency: 1, boost: 0 },
    rolls: null,
    netSuccesses: 2,
    isSuccess: true,
    netAdvantages: 0,
    triumphs: 0,
    despairs: 0,
    ...overrides,
  };
}

// ============================================================================
// ADVANTAGE SPENDING
// ============================================================================

describe('Advantage spending (greedy from most expensive)', () => {
  it('spends advantages from most expensive to least', () => {
    (resolveSkillCheck as any).mockReturnValue(mockCheckResult({
      isSuccess: true,
      netAdvantages: 3,
    }));

    const option: SocialDialogueOption = {
      id: 'opt-1',
      text: 'Negotiate',
      skillId: 'charm' as any,
      difficulty: 2,
      successOutcomes: [{ type: 'credits', credits: 100, description: 'Base reward' }],
      failureOutcomes: [],
      advantageSpend: [
        { cost: 1, outcome: { type: 'credits', credits: 25, description: 'Small bonus' } },
        { cost: 2, outcome: { type: 'credits', credits: 75, description: 'Big bonus' } },
      ],
    };

    const result = resolveSocialCheck(makeHero(), option, makeNPC());

    // 3 advantages: spend 2 first (big), then 1 (small)
    expect(result.narrativeText).toContain('Big bonus');
    expect(result.narrativeText).toContain('Small bonus');
    const bonuses = result.outcomes.filter(o => o.description === 'Big bonus' || o.description === 'Small bonus');
    expect(bonuses).toHaveLength(2);
  });

  it('spends same option multiple times when affordable', () => {
    (resolveSkillCheck as any).mockReturnValue(mockCheckResult({
      isSuccess: true,
      netAdvantages: 4,
    }));

    const option: SocialDialogueOption = {
      id: 'opt-1',
      text: 'Negotiate',
      skillId: 'charm' as any,
      difficulty: 2,
      successOutcomes: [],
      failureOutcomes: [],
      advantageSpend: [
        { cost: 2, outcome: { type: 'credits', credits: 50, description: 'Bonus' } },
      ],
    };

    const result = resolveSocialCheck(makeHero(), option, makeNPC());
    // 4 advantages / 2 cost = 2 applications
    const bonuses = result.outcomes.filter(o => o.description === 'Bonus');
    expect(bonuses).toHaveLength(2);
  });
});

// ============================================================================
// THREAT CONSEQUENCES
// ============================================================================

describe('Threat consequences (net negative advantages on failure)', () => {
  it('applies threat consequences greedy from most expensive', () => {
    (resolveSkillCheck as any).mockReturnValue(mockCheckResult({
      isSuccess: false,
      netSuccesses: -1,
      netAdvantages: -3,
    }));

    const option: SocialDialogueOption = {
      id: 'opt-1',
      text: 'Intimidate',
      skillId: 'coercion' as any,
      difficulty: 2,
      successOutcomes: [],
      failureOutcomes: [{ type: 'narrative', description: 'Failed.' }],
      threatConsequence: [
        { cost: 1, outcome: { type: 'credits', credits: -25, description: 'Minor loss' } },
        { cost: 2, outcome: { type: 'reputation', factionId: 'rebels', reputationDelta: -5, description: 'Major loss' } },
      ],
    };

    const result = resolveSocialCheck(makeHero(), option, makeNPC());

    // 3 threats: spend 2 first (major), then 1 (minor)
    expect(result.narrativeText).toContain('Major loss');
    expect(result.narrativeText).toContain('Minor loss');
  });

  it('does not trigger on success even with negative advantages', () => {
    (resolveSkillCheck as any).mockReturnValue(mockCheckResult({
      isSuccess: true,
      netAdvantages: -2,
    }));

    const option: SocialDialogueOption = {
      id: 'opt-1',
      text: 'Charm',
      skillId: 'charm' as any,
      difficulty: 2,
      successOutcomes: [{ type: 'credits', credits: 100, description: 'Reward' }],
      failureOutcomes: [],
      threatConsequence: [
        { cost: 1, outcome: { type: 'credits', credits: -50, description: 'Penalty' } },
      ],
    };

    const result = resolveSocialCheck(makeHero(), option, makeNPC());
    // Success branch, so threatConsequence should NOT be checked
    // (threats only on failure path)
    const penalties = result.outcomes.filter(o => o.description === 'Penalty');
    expect(penalties).toHaveLength(0);
  });
});

// ============================================================================
// NPC OPPOSED CHARACTERISTIC FALLBACK
// ============================================================================

describe('getNPCOpposedCharacteristic willpower fallback', () => {
  it('falls back to willpower for unmapped skill', () => {
    (resolveOpposedSkillCheck as any).mockReturnValue(mockCheckResult({ isSuccess: true }));

    const npc = makeNPC({ characteristics: { willpower: 5, presence: 2, cunning: 2 } });
    const option: SocialDialogueOption = {
      id: 'opt-1',
      text: 'Use obscure skill',
      skillId: 'charm' as any,
      difficulty: 2,
      isOpposed: true,
      opposedSkillId: 'totally-made-up-skill',
      successOutcomes: [],
      failureOutcomes: [],
    };

    resolveSocialCheck(makeHero(), option, npc);

    // Should use willpower (5) as fallback
    expect(resolveOpposedSkillCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      5, // willpower fallback
      0, // no skill rank
      expect.anything(),
      expect.anything(),
      undefined, // gameData (optional)
    );
  });
});

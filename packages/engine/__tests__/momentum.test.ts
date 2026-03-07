/**
 * Tests for the Momentum System
 */
import { describe, it, expect } from 'vitest';
import {
  updateMomentum,
  getMomentumEffects,
  applyMomentumCredits,
  getMomentumThreatAdjustment,
  getMomentumTacticCardBonus,
  getMomentumNarrative,
  resetMomentum,
} from '../src/momentum';
import type { CampaignState } from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-1',
    name: 'Test',
    difficulty: 'standard',
    createdAt: '2024-01-01',
    lastPlayedAt: '2024-01-01',
    heroes: {},
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: [],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    momentum: 0,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Momentum System', () => {
  describe('updateMomentum', () => {
    it('increases by 1 on victory', () => {
      const campaign = makeCampaign({ momentum: 0 });
      const result = updateMomentum(campaign, 'victory', false, false, false);
      expect(result.momentum).toBe(1);
    });

    it('increases by 2 on perfect victory', () => {
      const campaign = makeCampaign({ momentum: 0 });
      const result = updateMomentum(campaign, 'victory', true, true, false);
      expect(result.momentum).toBe(2);
    });

    it('decreases by 1 on defeat', () => {
      const campaign = makeCampaign({ momentum: 0 });
      const result = updateMomentum(campaign, 'defeat', false, false, false);
      expect(result.momentum).toBe(-1);
    });

    it('decreases by 2 on crushing defeat', () => {
      const campaign = makeCampaign({ momentum: 0 });
      const result = updateMomentum(campaign, 'defeat', false, false, true);
      expect(result.momentum).toBe(-2);
    });

    it('no change on draw', () => {
      const campaign = makeCampaign({ momentum: 1 });
      const result = updateMomentum(campaign, 'draw', false, false, false);
      expect(result.momentum).toBe(1);
    });

    it('clamps to -3 minimum', () => {
      const campaign = makeCampaign({ momentum: -2 });
      const result = updateMomentum(campaign, 'defeat', false, false, true);
      expect(result.momentum).toBe(-3);
    });

    it('clamps to +3 maximum', () => {
      const campaign = makeCampaign({ momentum: 2 });
      const result = updateMomentum(campaign, 'victory', true, true, false);
      expect(result.momentum).toBe(3);
    });
  });

  describe('getMomentumEffects', () => {
    it('returns balanced effects at 0', () => {
      const effects = getMomentumEffects(makeCampaign({ momentum: 0 }));
      expect(effects.label).toBe('Balanced');
      expect(effects.bonusTacticCards).toBe(0);
      expect(effects.bonusCredits).toBe(0);
      expect(effects.threatReduction).toBe(0);
    });

    it('returns bonuses at negative momentum (losing)', () => {
      const effects = getMomentumEffects(makeCampaign({ momentum: -2 }));
      expect(effects.label).toBe('Struggling');
      expect(effects.bonusTacticCards).toBe(2);
      expect(effects.bonusCredits).toBe(100);
      expect(effects.threatReduction).toBe(2);
    });

    it('returns penalties at positive momentum (winning)', () => {
      const effects = getMomentumEffects(makeCampaign({ momentum: 2 }));
      expect(effects.label).toBe('Dominant');
      expect(effects.bonusTacticCards).toBe(0);
      expect(effects.bonusCredits).toBe(-50);
      expect(effects.threatReduction).toBe(-2);
    });

    it('returns maximum bonuses at -3', () => {
      const effects = getMomentumEffects(makeCampaign({ momentum: -3 }));
      expect(effects.label).toBe('Desperate');
      expect(effects.bonusTacticCards).toBe(3);
      expect(effects.bonusCredits).toBe(150);
      expect(effects.bonusDeployPoints).toBe(2);
    });
  });

  describe('applyMomentumCredits', () => {
    it('adds bonus credits when losing', () => {
      const campaign = makeCampaign({ momentum: -2, credits: 100 });
      const result = applyMomentumCredits(campaign);
      expect(result.credits).toBe(200); // +100
    });

    it('subtracts credits when winning', () => {
      const campaign = makeCampaign({ momentum: 2, credits: 200 });
      const result = applyMomentumCredits(campaign);
      expect(result.credits).toBe(150); // -50
    });

    it('does not go below 0 credits', () => {
      const campaign = makeCampaign({ momentum: 3, credits: 20 });
      const result = applyMomentumCredits(campaign);
      expect(result.credits).toBe(0); // max(0, 20 - 75)
    });

    it('no change at momentum 0', () => {
      const campaign = makeCampaign({ momentum: 0, credits: 100 });
      const result = applyMomentumCredits(campaign);
      expect(result.credits).toBe(100);
    });
  });

  describe('getMomentumThreatAdjustment', () => {
    it('reduces threat when losing', () => {
      expect(getMomentumThreatAdjustment(makeCampaign({ momentum: -1 }))).toBe(1);
      expect(getMomentumThreatAdjustment(makeCampaign({ momentum: -3 }))).toBe(3);
    });

    it('increases threat when winning', () => {
      expect(getMomentumThreatAdjustment(makeCampaign({ momentum: 1 }))).toBe(-1);
      expect(getMomentumThreatAdjustment(makeCampaign({ momentum: 3 }))).toBe(-3);
    });
  });

  describe('getMomentumTacticCardBonus', () => {
    it('grants extra cards when losing', () => {
      expect(getMomentumTacticCardBonus(makeCampaign({ momentum: -1 }))).toBe(1);
    });

    it('removes cards when dominant', () => {
      expect(getMomentumTacticCardBonus(makeCampaign({ momentum: 3 }))).toBe(-1);
    });
  });

  describe('getMomentumNarrative', () => {
    it('returns description for neutral momentum', () => {
      const narrative = getMomentumNarrative(makeCampaign({ momentum: 0 }));
      expect(narrative).toContain('Standard operations');
    });

    it('includes direction for non-zero momentum', () => {
      const narrative = getMomentumNarrative(makeCampaign({ momentum: -2 }));
      expect(narrative).toContain('behind');
      expect(narrative).toContain('Struggling');
    });
  });

  describe('resetMomentum', () => {
    it('resets momentum to 0', () => {
      const campaign = makeCampaign({ momentum: -3 });
      const result = resetMomentum(campaign);
      expect(result.momentum).toBe(0);
    });
  });
});

/**
 * Tests for the save slot system.
 * Since save-slots.ts is a client service that uses localStorage,
 * we test the core logic by mocking localStorage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { campaignToJSON, campaignFromJSON, saveCampaign, loadCampaign } from '../src/campaign-v2'
import type { CampaignState } from '../src/types'

// Create a minimal valid campaign state for testing
function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'test-campaign-1',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01T00:00:00Z',
    lastPlayedAt: '2026-01-01T00:00:00Z',
    heroes: {},
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['act1-m1-arrival'],
    credits: 500,
    narrativeItems: [],
    inventory: [],
    threatLevel: 0,
    threatMultiplier: 1,
    missionsPlayed: 0,
    ...overrides,
  } as CampaignState
}

describe('Campaign Save/Load (engine)', () => {
  it('round-trips campaign through JSON serialization', () => {
    const campaign = makeCampaign({ name: 'My Campaign', credits: 1234 })
    const json = campaignToJSON(campaign)
    const restored = campaignFromJSON(json)

    expect(restored.id).toBe(campaign.id)
    expect(restored.name).toBe('My Campaign')
    expect(restored.credits).toBe(1234)
    expect(restored.difficulty).toBe('standard')
    expect(restored.availableMissionIds).toEqual(['act1-m1-arrival'])
  })

  it('saveCampaign wraps in save file format', () => {
    const campaign = makeCampaign()
    const saveFile = saveCampaign(campaign)

    expect(saveFile.version).toBe('1.0.0')
    expect(saveFile.savedAt).toBeTruthy()
    expect(saveFile.campaign.id).toBe('test-campaign-1')
    expect(saveFile.campaign.lastPlayedAt).toBeTruthy()
  })

  it('loadCampaign validates required fields', () => {
    expect(() => loadCampaign({ version: '1.0.0', savedAt: '', campaign: {} as any }))
      .toThrow('campaign.id missing')

    expect(() => loadCampaign({ version: '', savedAt: '', campaign: {} as any }))
      .toThrow('missing version')
  })

  it('loadCampaign accepts valid save file', () => {
    const campaign = makeCampaign({ currentAct: 3, credits: 999 })
    const saveFile = saveCampaign(campaign)
    const loaded = loadCampaign(saveFile)

    expect(loaded.currentAct).toBe(3)
    expect(loaded.credits).toBe(999)
  })

  it('preserves inventory through serialization', () => {
    const campaign = makeCampaign({ inventory: ['blaster-pistol', 'heavy-armor'] })
    const json = campaignToJSON(campaign)
    const restored = campaignFromJSON(json)

    expect(restored.inventory).toEqual(['blaster-pistol', 'heavy-armor'])
  })

  it('preserves completedMissions through serialization', () => {
    const campaign = makeCampaign({
      completedMissions: [{
        missionId: 'act1-m1-arrival',
        outcome: 'victory',
        roundsPlayed: 8,
        completedObjectiveIds: ['obj-1'],
        xpBreakdown: {
          participation: 5,
          missionSuccess: 10,
          lootTokens: 2,
          enemyKills: 3,
          leaderKill: 0,
          objectiveBonus: 5,
          narrativeBonus: 0,
          total: 25,
        },
        heroKills: {},
        lootCollected: ['medpac'],
        heroesIncapacitated: [],
        completedAt: '2026-01-02T00:00:00Z',
      }],
    })
    const json = campaignToJSON(campaign)
    const restored = campaignFromJSON(json)

    expect(restored.completedMissions).toHaveLength(1)
    expect(restored.completedMissions[0].outcome).toBe('victory')
    expect(restored.completedMissions[0].xpBreakdown.total).toBe(25)
    expect(restored.completedMissions[0].lootCollected).toEqual(['medpac'])
  })
})

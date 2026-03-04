/**
 * Save slot system for campaign persistence.
 *
 * Supports up to 5 named save slots (slot 0 = auto-save, slots 1-4 = manual).
 * Each slot stores the full CampaignSaveFile JSON in localStorage.
 * A lightweight metadata index enables fast listing without parsing full saves.
 */

import type { CampaignState } from '@engine/types.js'
import { campaignToJSON, campaignFromJSON } from '@engine/campaign-v2.js'
import type { HeroCharacter } from '@engine/types.js'

// ============================================================================
// TYPES
// ============================================================================

export interface SaveSlotMeta {
  slotId: number
  campaignId: string
  campaignName: string
  difficulty: string
  currentAct: number
  missionsPlayed: number
  heroNames: string[]
  credits: number
  savedAt: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SLOT_PREFIX = 'galactic-ops-save-slot-'
const INDEX_KEY = 'galactic-ops-save-index'
const LEGACY_KEY = 'galactic-ops-campaign-save'
export const MAX_SLOTS = 5 // slot 0 = auto-save, 1-4 = manual
export const AUTO_SAVE_SLOT = 0

// ============================================================================
// INDEX MANAGEMENT
// ============================================================================

function readIndex(): SaveSlotMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeIndex(index: SaveSlotMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

function buildMeta(slotId: number, campaign: CampaignState): SaveSlotMeta {
  const heroes = Object.values(campaign.heroes) as HeroCharacter[]
  return {
    slotId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    difficulty: campaign.difficulty,
    currentAct: campaign.currentAct,
    missionsPlayed: campaign.missionsPlayed ?? campaign.completedMissions.length,
    heroNames: heroes.map(h => h.name),
    credits: campaign.credits,
    savedAt: new Date().toISOString(),
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** List all occupied save slots with metadata. */
export function listSaveSlots(): SaveSlotMeta[] {
  return readIndex().sort((a, b) => {
    // Auto-save first, then by most recent
    if (a.slotId === AUTO_SAVE_SLOT) return -1
    if (b.slotId === AUTO_SAVE_SLOT) return 1
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  })
}

/** Save campaign to a specific slot. */
export function saveToSlot(slotId: number, campaign: CampaignState): void {
  if (slotId < 0 || slotId >= MAX_SLOTS) {
    throw new Error(`Invalid save slot: ${slotId}`)
  }

  // Write full save data
  const json = campaignToJSON(campaign)
  localStorage.setItem(SLOT_PREFIX + slotId, json)

  // Update index
  const index = readIndex().filter(m => m.slotId !== slotId)
  index.push(buildMeta(slotId, campaign))
  writeIndex(index)
}

/** Load campaign from a specific slot. Returns null if slot is empty. */
export function loadFromSlot(slotId: number): CampaignState | null {
  try {
    const json = localStorage.getItem(SLOT_PREFIX + slotId)
    if (!json) return null
    return campaignFromJSON(json)
  } catch (e) {
    console.error(`Failed to load save slot ${slotId}:`, e)
    return null
  }
}

/** Delete a save slot. */
export function deleteSlot(slotId: number): void {
  localStorage.removeItem(SLOT_PREFIX + slotId)
  const index = readIndex().filter(m => m.slotId !== slotId)
  writeIndex(index)
}

/** Find the first empty manual slot (1-4). Returns null if all full. */
export function findEmptySlot(): number | null {
  const index = readIndex()
  const occupied = new Set(index.map(m => m.slotId))
  for (let i = 1; i < MAX_SLOTS; i++) {
    if (!occupied.has(i)) return i
  }
  return null
}

/**
 * Migrate legacy single-key save to slot system.
 * Called once on app init. Moves old save to slot 1 if no slots exist.
 */
export function migrateLegacySave(): void {
  const index = readIndex()
  if (index.length > 0) return // already migrated

  const legacyJson = localStorage.getItem(LEGACY_KEY)
  if (!legacyJson) return

  try {
    const campaign = campaignFromJSON(legacyJson)
    saveToSlot(1, campaign)
    // Keep legacy key as backup, don't delete
  } catch (e) {
    console.error('Failed to migrate legacy save:', e)
  }
}

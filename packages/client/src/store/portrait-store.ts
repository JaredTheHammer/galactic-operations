/**
 * Portrait Registry Zustand Store
 *
 * Manages the portrait library: metadata, upload pipeline, tag filtering,
 * and cache coordination. Hydrates from IndexedDB on first access.
 *
 * Separated from game-store.ts because portrait management is an
 * orthogonal concern to game state (turns, combat, campaign). The two
 * stores communicate through portrait IDs stored on Figure/HeroCharacter.
 *
 * Data flow:
 *   Upload -> ingestImage() -> putImageBlobs() + putMetadata() -> state.portraits
 *   Render -> getThumbnail() cache hit || getImageBlobs() -> cacheThumbnailFromBlob()
 *   Hydrate -> getAllMetadata() -> state.portraits (blobs loaded lazily)
 */

import { create } from 'zustand';
import type { PortraitEntry, CropState, FactionVisualConfig } from '../types/portrait';
import { DEFAULT_CROP } from '../types/portrait';
import {
  ingestImage,
  putImageBlobs,
  putMetadata,
  getImageBlobs,
  getAllMetadata,
  deletePortrait as deletePortraitFromDb,
  clearAll as clearAllFromDb,
  evict,
  clearImageCache,
  cacheOriginalFromBlob,
  cacheThumbnailFromBlob,
  getOriginal,
  getThumbnail,
} from '../services';
import { DEFAULT_FACTION_VISUALS } from '../data/settings/star-wars';

// ============================================================================
// Types
// ============================================================================

export interface PortraitStoreState {
  /** All portrait metadata entries, keyed by portrait ID. */
  portraits: Record<string, PortraitEntry>;

  /** Faction visual configs (colors, logos). */
  factionVisuals: FactionVisualConfig[];

  /** Whether the store has hydrated from IndexedDB. */
  hydrated: boolean;

  /** Currently uploading portrait IDs (for loading indicators). */
  uploading: Set<string>;

  // --- Actions ---

  /** Hydrate metadata from IndexedDB. Idempotent. */
  hydrate: () => Promise<void>;

  /** Upload a new image file and add it to the library. */
  uploadPortrait: (file: File, label?: string, tags?: string[]) => Promise<PortraitEntry>;

  /** Update metadata for an existing portrait (label, tags, crop). */
  updatePortrait: (id: string, patch: Partial<Pick<PortraitEntry, 'label' | 'tags' | 'crop'>>) => Promise<void>;

  /** Delete a portrait from both store and IndexedDB. */
  deletePortrait: (id: string) => Promise<void>;

  /** Update the crop state for a portrait. */
  setCrop: (id: string, crop: CropState) => Promise<void>;

  /** Get a thumbnail ImageBitmap, loading from IDB if needed. */
  ensureThumbnail: (id: string) => Promise<ImageBitmap | null>;

  /** Get an original ImageBitmap, loading from IDB if needed. */
  ensureOriginal: (id: string) => Promise<ImageBitmap | null>;

  /** Update faction visual config. */
  setFactionVisuals: (visuals: FactionVisualConfig[]) => void;

  /** Update a single faction's colors. */
  updateFactionColors: (factionId: string, primary: string, secondary: string) => void;

  /** Reset a faction's colors to defaults. */
  resetFactionColors: (factionId: string) => void;

  /** Clear all portrait data (for campaign reset). */
  clearAll: () => Promise<void>;
}

// ============================================================================
// Store
// ============================================================================

export const usePortraitStore = create<PortraitStoreState>((set, get) => ({
  portraits: {},
  factionVisuals: structuredClone(DEFAULT_FACTION_VISUALS),
  hydrated: false,
  uploading: new Set(),

  // --------------------------------------------------------------------------
  // Hydration
  // --------------------------------------------------------------------------

  async hydrate() {
    if (get().hydrated) return;

    try {
      const entries = await getAllMetadata();
      const portraits: Record<string, PortraitEntry> = {};
      for (const entry of entries) {
        portraits[entry.id] = entry;
      }
      set({ portraits, hydrated: true });
    } catch (err) {
      console.error('[portrait-store] Hydration failed:', err);
      set({ hydrated: true }); // Mark as hydrated to prevent retry loops
    }
  },

  // --------------------------------------------------------------------------
  // Upload
  // --------------------------------------------------------------------------

  async uploadPortrait(file: File, label?: string, tags?: string[]) {
    // Run the processing pipeline
    const result = await ingestImage(file);

    // Check for duplicate (same content hash)
    const existing = get().portraits[result.id];
    if (existing) {
      return existing;
    }

    // Build metadata entry
    const now = new Date().toISOString();
    const entry: PortraitEntry = {
      id: result.id,
      label: label || file.name.replace(/\.[^.]+$/, ''),
      filename: file.name,
      mimeType: result.mimeType,
      originalWidth: result.width,
      originalHeight: result.height,
      crop: { ...DEFAULT_CROP },
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };

    // Track upload state
    const uploading = new Set(get().uploading);
    uploading.add(result.id);
    set({ uploading });

    try {
      // Persist to IndexedDB
      await Promise.all([
        putImageBlobs(result.id, {
          original: result.original,
          thumbnail: result.thumbnail,
        }),
        putMetadata(entry),
      ]);

      // Prime the caches
      await Promise.all([
        cacheOriginalFromBlob(result.id, result.original),
        cacheThumbnailFromBlob(result.id, result.thumbnail),
      ]);

      // Update store state
      set(state => ({
        portraits: { ...state.portraits, [entry.id]: entry },
        uploading: (() => {
          const next = new Set(state.uploading);
          next.delete(result.id);
          return next;
        })(),
      }));

      return entry;
    } catch (err) {
      // Clean up upload tracking on failure
      set(state => {
        const next = new Set(state.uploading);
        next.delete(result.id);
        return { uploading: next };
      });
      throw err;
    }
  },

  // --------------------------------------------------------------------------
  // Update
  // --------------------------------------------------------------------------

  async updatePortrait(id, patch) {
    const existing = get().portraits[id];
    if (!existing) return;

    const updated: PortraitEntry = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await putMetadata(updated);
    set(state => ({
      portraits: { ...state.portraits, [id]: updated },
    }));
  },

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------

  async deletePortrait(id) {
    await deletePortraitFromDb(id);
    evict(id);

    set(state => {
      const { [id]: _, ...rest } = state.portraits;
      return { portraits: rest };
    });
  },

  // --------------------------------------------------------------------------
  // Crop
  // --------------------------------------------------------------------------

  async setCrop(id, crop) {
    return get().updatePortrait(id, { crop });
  },

  // --------------------------------------------------------------------------
  // Cache-through bitmap access
  // --------------------------------------------------------------------------

  async ensureThumbnail(id) {
    // Check in-memory cache first
    const cached = getThumbnail(id);
    if (cached) return cached;

    // Load from IndexedDB
    const blobs = await getImageBlobs(id);
    if (!blobs) return null;

    return cacheThumbnailFromBlob(id, blobs.thumbnail);
  },

  async ensureOriginal(id) {
    const cached = getOriginal(id);
    if (cached) return cached;

    const blobs = await getImageBlobs(id);
    if (!blobs) return null;

    return cacheOriginalFromBlob(id, blobs.original);
  },

  // --------------------------------------------------------------------------
  // Faction visuals
  // --------------------------------------------------------------------------

  setFactionVisuals(visuals) {
    set({ factionVisuals: visuals });
  },

  updateFactionColors(factionId, primary, secondary) {
    set(state => ({
      factionVisuals: state.factionVisuals.map(fv =>
        fv.id === factionId
          ? { ...fv, colors: { primary, secondary } }
          : fv
      ),
    }));
  },

  resetFactionColors(factionId) {
    set(state => ({
      factionVisuals: state.factionVisuals.map(fv =>
        fv.id === factionId
          ? { ...fv, colors: { ...fv.defaultColors } }
          : fv
      ),
    }));
  },

  // --------------------------------------------------------------------------
  // Clear all
  // --------------------------------------------------------------------------

  async clearAll() {
    await clearAllFromDb();
    clearImageCache();
    set({
      portraits: {},
      factionVisuals: structuredClone(DEFAULT_FACTION_VISUALS),
      hydrated: false,
      uploading: new Set(),
    });
  },
}));

// ============================================================================
// Selectors (for use with usePortraitStore(selector))
// ============================================================================

/** Get all portrait entries as an array, sorted by creation date (newest first). */
export function selectPortraitList(state: PortraitStoreState): PortraitEntry[] {
  return Object.values(state.portraits).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );
}

/** Get portraits filtered by a set of tag IDs (AND logic). */
export function selectPortraitsByTags(
  state: PortraitStoreState,
  tagIds: string[],
): PortraitEntry[] {
  if (tagIds.length === 0) return selectPortraitList(state);
  return selectPortraitList(state).filter(p =>
    tagIds.every(tag => p.tags.includes(tag))
  );
}

/** Get a single portrait entry by ID. */
export function selectPortrait(
  state: PortraitStoreState,
  id: string,
): PortraitEntry | undefined {
  return state.portraits[id];
}

/** Check if a portrait is currently uploading. */
export function selectIsUploading(
  state: PortraitStoreState,
  id: string,
): boolean {
  return state.uploading.has(id);
}

/** Get the faction visual config for a specific faction. */
export function selectFactionVisual(
  state: PortraitStoreState,
  factionId: string,
): FactionVisualConfig | undefined {
  return state.factionVisuals.find(fv => fv.id === factionId);
}

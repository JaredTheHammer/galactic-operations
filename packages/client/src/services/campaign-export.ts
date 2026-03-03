/**
 * Campaign Export/Import with Image Bundling
 *
 * Extends the engine's CampaignSaveFile with embedded portrait data,
 * producing a self-contained JSON bundle that can be moved between
 * browsers and machines.
 *
 * Export flow:
 *   CampaignState + IndexedDB portraits -> CampaignExportBundle (JSON)
 *
 * Import flow:
 *   CampaignExportBundle (JSON) -> CampaignState + IndexedDB portraits
 *
 * Portrait images are Base64-encoded inside the JSON. Since thumbnails
 * are 128x128 JPEG (~5-10 KB each), a 4-hero campaign adds ~40 KB.
 * Original images (1024x1024 JPEG) add ~200-400 KB each but are
 * included for full fidelity.
 */

import type { CampaignState, CampaignSaveFile } from '@engine/types.js';
import type { PortraitEntry, CropState, FactionVisualConfig } from '../types/portrait';
import { saveCampaign, loadCampaign } from '@engine/campaign-v2.js';
import {
  getImageBlobs,
  getMetadata,
  putImageBlobs,
  putMetadata,
  listPortraitIds,
} from './image-store';

// ============================================================================
// Types
// ============================================================================

/** Base64-encoded portrait for bundling into export files. */
export interface ExportedPortrait {
  id: string;
  label: string;
  tags: string[];
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  crop: CropState;
  filename: string;
  createdAt: string;
  updatedAt: string;
  /** Base64-encoded original image Blob. */
  originalBase64: string;
  /** Base64-encoded thumbnail Blob. */
  thumbnailBase64: string;
}

/** Extended save file with embedded portraits and faction visuals. */
export interface CampaignExportBundle extends CampaignSaveFile {
  /** Portraits referenced by heroes in the campaign. */
  portraits?: Record<string, ExportedPortrait>;
  /** Custom faction color overrides. */
  factionVisuals?: FactionVisualConfig[];
}

/** Result of an import operation. */
export interface ImportResult {
  campaign: CampaignState;
  portraitsImported: number;
  portraitsSkipped: number;
  warnings: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert a Blob to a base64 string. */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/** Convert a base64 data URL back to a Blob. */
function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/** Collect all portrait IDs referenced by heroes in the campaign. */
function collectHeroPortraitIds(campaign: CampaignState): Set<string> {
  const ids = new Set<string>();
  const heroes = Object.values(campaign.heroes) as Array<{ portraitId?: string }>;
  for (const hero of heroes) {
    if (hero.portraitId) {
      ids.add(hero.portraitId);
    }
  }
  return ids;
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export a campaign with all referenced portraits as a JSON bundle.
 *
 * Collects portrait images from IndexedDB, converts to base64,
 * and embeds them in the save file. Non-referenced portraits
 * are not included (keeping the bundle lean).
 */
export async function exportCampaign(
  campaign: CampaignState,
  factionVisuals?: FactionVisualConfig[],
): Promise<string> {
  const saveFile = saveCampaign(campaign);

  // Collect portrait IDs from hero characters
  const portraitIds = collectHeroPortraitIds(campaign);

  // Build portrait bundle
  const portraits: Record<string, ExportedPortrait> = {};

  for (const id of portraitIds) {
    const metadata = await getMetadata(id);
    const blobs = await getImageBlobs(id);

    if (!metadata || !blobs) {
      // Portrait referenced but not in library -- skip silently
      continue;
    }

    portraits[id] = {
      id: metadata.id,
      label: metadata.label,
      tags: metadata.tags,
      mimeType: metadata.mimeType,
      originalWidth: metadata.originalWidth,
      originalHeight: metadata.originalHeight,
      crop: metadata.crop,
      filename: metadata.filename,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      originalBase64: await blobToBase64(blobs.original),
      thumbnailBase64: await blobToBase64(blobs.thumbnail),
    };
  }

  const bundle: CampaignExportBundle = {
    ...saveFile,
    portraits: Object.keys(portraits).length > 0 ? portraits : undefined,
    factionVisuals: factionVisuals?.length ? factionVisuals : undefined,
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Export campaign and trigger browser download.
 */
export async function downloadCampaignBundle(
  campaign: CampaignState,
  factionVisuals?: FactionVisualConfig[],
): Promise<void> {
  const json = await exportCampaign(campaign, factionVisuals);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = campaign.name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'campaign';
  const filename = `${safeName}-${timestamp}.json`;

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Import
// ============================================================================

/**
 * Import a campaign from a JSON bundle string.
 *
 * Restores the campaign state and injects any bundled portraits
 * into IndexedDB. Existing portraits with the same ID are skipped
 * (content-addressable IDs guarantee identity).
 */
export async function importCampaignBundle(json: string): Promise<ImportResult> {
  const bundle: CampaignExportBundle = JSON.parse(json);
  const warnings: string[] = [];

  // Validate and restore campaign state
  const campaign = loadCampaign(bundle);

  // Import portraits
  let portraitsImported = 0;
  let portraitsSkipped = 0;

  if (bundle.portraits) {
    const existingIds = new Set(await listPortraitIds());

    for (const [id, exported] of Object.entries(bundle.portraits)) {
      // Skip if portrait already exists (content-addressable dedup)
      if (existingIds.has(id)) {
        portraitsSkipped++;
        continue;
      }

      try {
        // Reconstruct metadata entry
        const entry: PortraitEntry = {
          id: exported.id,
          label: exported.label,
          tags: exported.tags,
          mimeType: exported.mimeType,
          originalWidth: exported.originalWidth,
          originalHeight: exported.originalHeight,
          crop: exported.crop,
          filename: exported.filename,
          createdAt: exported.createdAt,
          updatedAt: exported.updatedAt,
        };

        // Reconstruct blobs from base64
        const originalBlob = base64ToBlob(exported.originalBase64);
        const thumbnailBlob = base64ToBlob(exported.thumbnailBase64);

        // Store in IndexedDB
        await putMetadata(entry);
        await putImageBlobs(id, {
          original: originalBlob,
          thumbnail: thumbnailBlob,
        });

        portraitsImported++;
      } catch (e) {
        warnings.push(`Failed to import portrait "${exported.label}": ${String(e)}`);
      }
    }
  }

  return {
    campaign,
    portraitsImported,
    portraitsSkipped,
    warnings,
  };
}

/**
 * Read a File object and import its contents as a campaign bundle.
 * Convenience wrapper around importCampaignBundle for file input handling.
 */
export async function importCampaignFromFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  return importCampaignBundle(text);
}

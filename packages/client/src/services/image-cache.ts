/**
 * In-memory ImageBitmap cache with LRU eviction.
 *
 * Sits between the UI/canvas rendering layer and the IndexedDB store.
 * Provides instant access to decoded ImageBitmap data without
 * re-reading blobs from disk on every render frame.
 *
 * Two cache tiers:
 *   originals  : full-resolution bitmaps for the portrait editor
 *   thumbnails : small bitmaps for grid tokens, list items, sidebar
 *
 * ImageBitmaps are GPU-transferable and much faster to draw on canvas
 * than HTMLImageElement. The LRU policy keeps memory bounded while
 * ensuring frequently-accessed portraits stay warm.
 */

// ============================================================================
// LRU Cache implementation
// ============================================================================

/**
 * Map-based LRU cache that auto-evicts oldest entries when full.
 *
 * Relies on Map's insertion-order iteration: the first entry in the
 * map is always the least-recently-used. On `get()`, we delete and
 * re-insert to move the entry to the end (most-recently-used).
 *
 * Calls `ImageBitmap.close()` on eviction to release GPU memory.
 */
class LRUImageCache {
  private map = new Map<string, ImageBitmap>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /** Retrieve a bitmap, promoting it to most-recently-used. */
  get(key: string): ImageBitmap | undefined {
    const bitmap = this.map.get(key);
    if (!bitmap) return undefined;

    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, bitmap);
    return bitmap;
  }

  /** Insert or replace a bitmap, evicting the oldest if at capacity. */
  set(key: string, bitmap: ImageBitmap): void {
    // Replace existing entry
    if (this.map.has(key)) {
      const old = this.map.get(key)!;
      old.close();
      this.map.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.map.size >= this.maxSize) {
      const oldest = this.map.entries().next();
      if (oldest.done) break;
      const [oldestKey, oldestBitmap] = oldest.value;
      oldestBitmap.close();
      this.map.delete(oldestKey);
    }

    this.map.set(key, bitmap);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Remove and close a specific entry. */
  evict(key: string): void {
    const bitmap = this.map.get(key);
    if (bitmap) {
      bitmap.close();
      this.map.delete(key);
    }
  }

  /** Close all bitmaps and empty the cache. */
  clear(): void {
    for (const bitmap of this.map.values()) {
      bitmap.close();
    }
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// ============================================================================
// Cache instances (module-level singletons)
// ============================================================================

/**
 * Max full-resolution originals in memory.
 * At ~1024x1024 RGBA, each bitmap is ~4 MB uncompressed.
 * 20 * 4 MB = ~80 MB worst case.
 */
const MAX_ORIGINALS = 20;

/**
 * Max thumbnails in memory.
 * At 128x128 RGBA, each is ~64 KB. 100 * 64 KB = ~6 MB.
 */
const MAX_THUMBNAILS = 100;

const originalCache = new LRUImageCache(MAX_ORIGINALS);
const thumbnailCache = new LRUImageCache(MAX_THUMBNAILS);

// ============================================================================
// Public API -- direct cache access
// ============================================================================

export function getOriginal(portraitId: string): ImageBitmap | undefined {
  return originalCache.get(portraitId);
}

export function setOriginal(portraitId: string, bitmap: ImageBitmap): void {
  originalCache.set(portraitId, bitmap);
}

export function getThumbnail(portraitId: string): ImageBitmap | undefined {
  return thumbnailCache.get(portraitId);
}

export function setThumbnail(portraitId: string, bitmap: ImageBitmap): void {
  thumbnailCache.set(portraitId, bitmap);
}

/** Evict a portrait from both cache tiers. */
export function evict(portraitId: string): void {
  originalCache.evict(portraitId);
  thumbnailCache.evict(portraitId);
}

/** Clear both cache tiers (e.g. on campaign reset). */
export function clearImageCache(): void {
  originalCache.clear();
  thumbnailCache.clear();
}

/** Get current cache utilization stats (for debug UI). */
export function getCacheStats(): {
  originals: number;
  thumbnails: number;
  maxOriginals: number;
  maxThumbnails: number;
} {
  return {
    originals: originalCache.size,
    thumbnails: thumbnailCache.size,
    maxOriginals: MAX_ORIGINALS,
    maxThumbnails: MAX_THUMBNAILS,
  };
}

// ============================================================================
// Convenience: decode blob -> cache in one call
// ============================================================================

/**
 * Decode a blob into an ImageBitmap and cache it as an original.
 * Returns the cached bitmap for immediate use.
 */
export async function cacheOriginalFromBlob(
  portraitId: string,
  blob: Blob,
): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(blob);
  originalCache.set(portraitId, bitmap);
  return bitmap;
}

/**
 * Decode a blob into an ImageBitmap and cache it as a thumbnail.
 * Returns the cached bitmap for immediate use.
 */
export async function cacheThumbnailFromBlob(
  portraitId: string,
  blob: Blob,
): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(blob);
  thumbnailCache.set(portraitId, bitmap);
  return bitmap;
}

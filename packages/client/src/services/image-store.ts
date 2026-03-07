/**
 * IndexedDB persistence layer for portrait image blobs and metadata.
 *
 * Two object stores:
 *   'images'   : portrait ID -> { original: Blob, thumbnail: Blob }
 *   'metadata' : portrait ID -> PortraitEntry
 *
 * This is the durable storage layer. The in-memory ImageCache (image-cache.ts)
 * sits above this for fast canvas rendering access. On app startup the Zustand
 * portrait slice hydrates from metadata, then lazily loads blobs into the cache
 * as portraits are displayed.
 *
 * Why raw IndexedDB instead of a library? The API surface is tiny (put/get/delete)
 * and we avoid adding a dependency for six straightforward operations.
 */

import type { PortraitEntry } from '../types/portrait';

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'galactic-ops-portraits';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';
const METADATA_STORE = 'metadata';

// ============================================================================
// Database connection (lazy singleton)
// ============================================================================

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE);
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // allow retry on transient failures
      reject(request.error);
    };
  });

  return dbPromise;
}

// ============================================================================
// Generic IDB transaction helpers
// ============================================================================

async function idbPut<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAllKeys(storeName: string): Promise<string[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAllKeys();
    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function idbClear(storeName: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// Image blob storage
// ============================================================================

export interface StoredImageBlobs {
  original: Blob;
  thumbnail: Blob;
}

/** Store original + thumbnail blobs for a portrait. */
export async function putImageBlobs(
  portraitId: string,
  blobs: StoredImageBlobs,
): Promise<void> {
  return idbPut(IMAGES_STORE, portraitId, blobs);
}

/** Retrieve blobs for a portrait (returns undefined if not found). */
export async function getImageBlobs(
  portraitId: string,
): Promise<StoredImageBlobs | undefined> {
  return idbGet<StoredImageBlobs>(IMAGES_STORE, portraitId);
}

/** Delete blobs for a portrait. */
export async function deleteImageBlobs(portraitId: string): Promise<void> {
  return idbDelete(IMAGES_STORE, portraitId);
}

// ============================================================================
// Metadata storage
// ============================================================================

/** Store or update portrait metadata. */
export async function putMetadata(entry: PortraitEntry): Promise<void> {
  return idbPut(METADATA_STORE, entry.id, entry);
}

/** Retrieve metadata for a single portrait. */
export async function getMetadata(
  portraitId: string,
): Promise<PortraitEntry | undefined> {
  return idbGet<PortraitEntry>(METADATA_STORE, portraitId);
}

/** Retrieve all portrait metadata entries (for hydration). */
export async function getAllMetadata(): Promise<PortraitEntry[]> {
  return idbGetAll<PortraitEntry>(METADATA_STORE);
}

/** Delete metadata for a portrait. */
export async function deleteMetadata(portraitId: string): Promise<void> {
  return idbDelete(METADATA_STORE, portraitId);
}

// ============================================================================
// Combined operations
// ============================================================================

/** Delete both blobs and metadata for a portrait. */
export async function deletePortrait(portraitId: string): Promise<void> {
  await Promise.all([
    deleteImageBlobs(portraitId),
    deleteMetadata(portraitId),
  ]);
}

/** Get all portrait IDs that have stored blobs. */
export async function listPortraitIds(): Promise<string[]> {
  return idbGetAllKeys(IMAGES_STORE);
}

/** Clear all portrait data (images + metadata). */
export async function clearAll(): Promise<void> {
  await Promise.all([
    idbClear(IMAGES_STORE),
    idbClear(METADATA_STORE),
  ]);
}

/**
 * Close the database connection.
 * Useful for testing and for clean shutdown during campaign export.
 */
export function closeDb(): void {
  if (dbPromise) {
    dbPromise.then(db => db.close()).catch(e => console.warn('[image-store] DB close failed:', e));
    dbPromise = null;
  }
}

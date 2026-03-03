/**
 * Image services barrel export.
 *
 * Three-layer architecture:
 *   1. image-processing : CPU-bound transforms (hash, resize, crop)
 *   2. image-store      : IndexedDB persistence (blobs + metadata)
 *   3. image-cache      : In-memory LRU cache (decoded ImageBitmaps)
 *
 * Typical flow:
 *   Upload -> ingestImage() -> putImageBlobs() + putMetadata()
 *   Render -> getThumbnail() || getImageBlobs() -> cacheThumbnailFromBlob()
 */

export {
  // Processing pipeline
  hashImageBytes,
  resizeImage,
  generateThumbnail,
  createCircularCrop,
  ingestImage,
  blobToImageBitmap,
  MAX_ORIGINAL_DIM,
  THUMBNAIL_SIZE,
  type IngestResult,
} from './image-processing';

export {
  // IndexedDB persistence
  putImageBlobs,
  getImageBlobs,
  deleteImageBlobs,
  putMetadata,
  getMetadata,
  getAllMetadata,
  deleteMetadata,
  deletePortrait,
  listPortraitIds,
  clearAll,
  closeDb,
  type StoredImageBlobs,
} from './image-store';

export {
  // In-memory cache
  getOriginal,
  setOriginal,
  getThumbnail,
  setThumbnail,
  evict,
  clearImageCache,
  getCacheStats,
  cacheOriginalFromBlob,
  cacheThumbnailFromBlob,
} from './image-cache';

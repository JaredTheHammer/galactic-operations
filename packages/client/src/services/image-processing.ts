/**
 * Image processing utilities for portrait management.
 *
 * Pipeline stages:
 *   1. hashImageBytes  - SHA-256 content-addressable ID from raw bytes
 *   2. resizeImage     - Downscale to max dimension (preserves aspect ratio)
 *   3. generateThumbnail - Square center-crop thumbnail
 *   4. createCircularCrop - Circle-clipped extract for token rendering
 *
 * All processing uses OffscreenCanvas so it works off the main thread
 * if called from a Web Worker (future optimization path).
 */

import type { CropState } from '../types/portrait';

// ============================================================================
// Constants
// ============================================================================

/** Maximum dimension (width or height) for stored originals. */
export const MAX_ORIGINAL_DIM = 1024;

/** Square thumbnail size in pixels. */
export const THUMBNAIL_SIZE = 128;

/** Default JPEG quality for resized images. */
const JPEG_QUALITY = 0.85;

/** JPEG quality for thumbnails (slightly higher -- they're small). */
const THUMBNAIL_QUALITY = 0.9;

// ============================================================================
// SHA-256 hashing
// ============================================================================

/**
 * Compute SHA-256 hex digest of raw image bytes.
 * Used as the portrait ID (content-addressable storage).
 *
 * Why SHA-256? Two users uploading the same image get the same ID,
 * preventing duplicate storage without a central registry.
 */
export async function hashImageBytes(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Canvas helpers
// ============================================================================

/** Load a Blob into an ImageBitmap. */
export async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Render an ImageBitmap onto an OffscreenCanvas and export to Blob. */
function bitmapToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mimeType = 'image/jpeg',
  quality = JPEG_QUALITY,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: mimeType, quality });
}

// ============================================================================
// Resize
// ============================================================================

/**
 * Resize an image blob so its longest side is at most `maxDim` pixels.
 * Returns the original blob unchanged if already within bounds.
 */
export async function resizeImage(
  blob: Blob,
  maxDim: number = MAX_ORIGINAL_DIM,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width: origW, height: origH } = bitmap;

  // Already small enough -- pass through
  if (origW <= maxDim && origH <= maxDim) {
    const result = { blob, width: origW, height: origH };
    bitmap.close();
    return result;
  }

  const scale = maxDim / Math.max(origW, origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);

  const resizedBlob = await bitmapToBlob(bitmap, newW, newH);
  bitmap.close();
  return { blob: resizedBlob, width: newW, height: newH };
}

// ============================================================================
// Thumbnail
// ============================================================================

/**
 * Generate a square center-crop thumbnail.
 * Crops to the largest centered square, then scales to `size` px.
 */
export async function generateThumbnail(
  blob: Blob,
  size: number = THUMBNAIL_SIZE,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width: w, height: h } = bitmap;

  // Center-crop source rect
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  return canvas.convertToBlob({ type: 'image/jpeg', quality: THUMBNAIL_QUALITY });
}

// ============================================================================
// Circular crop for token rendering
// ============================================================================

/**
 * Extract a circular-cropped region from an image for token rendering.
 *
 * CropState uses normalized 0-1 coordinates:
 *   centerX/Y : crop center relative to image dimensions
 *   zoom      : 1.0 = fit the shorter side into the circle diameter
 *               >1 zooms in, <1 zooms out (clamped to 0.1 minimum)
 *
 * Returns an ImageBitmap with transparent pixels outside the circle.
 */
export async function createCircularCrop(
  source: ImageBitmap,
  crop: CropState,
  outputSize: number,
): Promise<ImageBitmap> {
  const { width: srcW, height: srcH } = source;
  const canvas = new OffscreenCanvas(outputSize, outputSize);
  const ctx = canvas.getContext('2d')!;

  // Visible radius in source-pixel space
  const minSide = Math.min(srcW, srcH);
  const visibleRadius = (minSide / 2) / Math.max(crop.zoom, 0.1);

  // Crop center in source pixels
  const cx = crop.centerX * srcW;
  const cy = crop.centerY * srcH;

  // Source rect
  const sx = cx - visibleRadius;
  const sy = cy - visibleRadius;
  const sSize = visibleRadius * 2;

  // Clip to circle, then draw
  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(source, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);

  return createImageBitmap(canvas);
}

// ============================================================================
// Full ingest pipeline
// ============================================================================

export interface IngestResult {
  /** SHA-256 hex of the raw uploaded bytes. */
  id: string;
  /** Resized-to-max original blob (may be unchanged if already small). */
  original: Blob;
  /** Square center-crop thumbnail blob. */
  thumbnail: Blob;
  /** Final stored width. */
  width: number;
  /** Final stored height. */
  height: number;
  /** MIME type from the uploaded file. */
  mimeType: string;
}

/**
 * Full image ingest pipeline: hash -> resize -> thumbnail.
 *
 * The hash is computed on the *raw uploaded bytes* (before resize)
 * so the portrait ID is stable regardless of processing changes.
 */
export async function ingestImage(file: File): Promise<IngestResult> {
  // 1. Hash raw bytes for content-addressable ID
  const id = await hashImageBytes(file);

  // 2. Resize original to max dimension
  const { blob: original, width, height } = await resizeImage(file);

  // 3. Generate thumbnail from the (possibly resized) original
  const thumbnail = await generateThumbnail(original);

  return {
    id,
    original,
    thumbnail,
    width,
    height,
    mimeType: file.type || 'image/png',
  };
}

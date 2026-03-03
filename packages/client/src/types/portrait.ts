/**
 * Portrait & Token System - Core Types
 *
 * Defines the data model for user-uploaded character portraits, crop/zoom
 * metadata, silhouette fallbacks, and the tag taxonomy used for progressive
 * filtering in the portrait selector.
 */

import type { BaseSize } from '@engine/types';

// ============================================================================
// Portrait image metadata
// ============================================================================

/** Crop & zoom state for circular portrait rendering. */
export interface CropState {
  /** Normalized center X (0-1 range, 0.5 = image center). */
  centerX: number;
  /** Normalized center Y (0-1 range, 0.5 = image center). */
  centerY: number;
  /** Zoom level: 1.0 = fit-to-circle, >1 = zoomed in. */
  zoom: number;
}

/** Full portrait entry stored in the registry. */
export interface PortraitEntry {
  /** SHA-256 hex digest of the original image bytes. */
  id: string;
  /** User-facing label (defaults to filename without extension). */
  label: string;
  /** Original filename from upload. */
  filename: string;
  /** MIME type (image/png, image/jpeg, image/webp). */
  mimeType: string;
  /** Original image dimensions in pixels. */
  originalWidth: number;
  originalHeight: number;
  /** Circular crop + zoom state for token rendering. */
  crop: CropState;
  /** Tag IDs for progressive filtering (species, faction, era, career, etc.). */
  tags: string[];
  /** ISO timestamp of when the portrait was added. */
  createdAt: string;
  /** ISO timestamp of last metadata edit. */
  updatedAt: string;
}

/** Default crop state: centered, fit-to-circle. */
export const DEFAULT_CROP: CropState = {
  centerX: 0.5,
  centerY: 0.5,
  zoom: 1.0,
};

// ============================================================================
// Silhouette fallbacks
// ============================================================================

/**
 * Silhouette categories for figures without a portrait.
 * Drawn programmatically on the canvas token as a darkened shape.
 */
export type SilhouetteType =
  | 'infantry'
  | 'heavy-weapon'
  | 'officer'
  | 'droid'
  | 'beast'
  | 'force-user'
  | 'vehicle'
  | 'walker';

/** Map of silhouette types to display labels. */
export const SILHOUETTE_LABELS: Record<SilhouetteType, string> = {
  'infantry': 'Infantry',
  'heavy-weapon': 'Heavy Weapon',
  'officer': 'Officer',
  'droid': 'Droid',
  'beast': 'Beast',
  'force-user': 'Force User',
  'vehicle': 'Vehicle',
  'walker': 'Walker',
};

// ============================================================================
// Faction colors
// ============================================================================

/** Dual-color scheme for a faction (used for token borders and UI accents). */
export interface FactionColors {
  /** Primary color (hex). */
  primary: string;
  /** Secondary color (hex). */
  secondary: string;
}

/** Full faction visual configuration. */
export interface FactionVisualConfig {
  id: string;
  label: string;
  /** Default colors (reset target). */
  defaultColors: FactionColors;
  /** Current colors (user-customizable, starts as default copy). */
  colors: FactionColors;
  /** Optional portrait ID for faction logo/icon. */
  logoPortraitId?: string;
}

// ============================================================================
// Setting taxonomy (tag-based progressive filtering)
// ============================================================================

/**
 * A single tag option within a taxonomy category.
 * E.g., { id: 'human', label: 'Human', eras: ['galactic-civil-war', 'old-republic'] }
 */
export interface TaxonomyTag {
  id: string;
  label: string;
  /** Which eras this tag is available in. Empty array = all eras. */
  eras: string[];
}

/** An era definition within a setting. */
export interface EraDefinition {
  id: string;
  label: string;
  /** Short description of the era. */
  description: string;
}

/** A taxonomy category (species, faction, career, etc.). */
export interface TaxonomyCategory {
  id: string;
  label: string;
  /** Allow multiple tags from this category on one portrait. */
  multiSelect: boolean;
  /** Ordered list of available tags. */
  tags: TaxonomyTag[];
}

/**
 * Top-level setting definition. Each game setting (Star Wars, etc.)
 * provides its own era list and taxonomy categories.
 */
export interface SettingDefinition {
  id: string;
  label: string;
  eras: EraDefinition[];
  categories: TaxonomyCategory[];
}

// ============================================================================
// Token rendering configuration
// ============================================================================

/** How a portrait token should render on the tactical grid. */
export interface TokenRenderConfig {
  /** Portrait ID to render (falls back to silhouette if null). */
  portraitId: string | null;
  /** Crop state for the portrait. */
  crop: CropState;
  /** Border color (from faction). */
  borderColor: string;
  /** Physical base size for tile footprint. */
  baseSize: BaseSize;
  /** Silhouette type for fallback rendering. */
  silhouetteType: SilhouetteType;
  /** Figure label (name or type) for tooltip/accessibility. */
  label: string;
}

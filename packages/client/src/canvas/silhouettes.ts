/**
 * Silhouette Fallback Renderer
 *
 * Draws simple iconic silhouette shapes when no portrait image is
 * available for a figure. Each SilhouetteType has a distinct outline
 * optimized for readability at small token sizes (48-96 px).
 *
 * All drawing functions operate on a canvas context with a coordinate
 * system where (0,0) is the center and the unit circle radius is 1.
 * The caller is responsible for setting up the transform.
 *
 * Design principles:
 *   - Bold, simple shapes (no fine detail that disappears at 48px)
 *   - Instantly recognizable role archetypes
 *   - Single-color fill with subtle gradient for depth
 */

import type { SilhouetteType } from '../types/portrait';

// ============================================================================
// Types
// ============================================================================

export interface SilhouetteOptions {
  /** Fill color for the silhouette shape. */
  fillColor: string;
  /** Background color behind the silhouette. */
  bgColor: string;
  /** Output size in pixels (diameter of the circular token). */
  size: number;
}

const DEFAULT_OPTIONS: SilhouetteOptions = {
  fillColor: '#888899',
  bgColor: '#1a1a2e',
  size: 64,
};

// ============================================================================
// Drawing primitives
// ============================================================================

/**
 * Set up the canvas for silhouette drawing:
 * - Fill background circle
 * - Translate to center, scale so radius = 1
 * - Clip to circle
 */
function setupCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  bgColor: string,
): void {
  const r = size / 2;

  // Background circle
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Clip to circle
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();

  // Transform: origin at center, unit = radius
  ctx.translate(r, r);
  ctx.scale(r, r);
}

/** Draw a head (circle) at the given vertical position. */
function drawHead(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.arc(0, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a simple torso trapezoid. */
function drawTorso(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  topY: number,
  bottomY: number,
  topWidth: number,
  bottomWidth: number,
): void {
  ctx.beginPath();
  ctx.moveTo(-topWidth, topY);
  ctx.lineTo(topWidth, topY);
  ctx.lineTo(bottomWidth, bottomY);
  ctx.lineTo(-bottomWidth, bottomY);
  ctx.closePath();
  ctx.fill();
}

// ============================================================================
// Silhouette shapes
// ============================================================================

/** Standard trooper / infantry silhouette. */
function drawInfantry(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  // Head
  drawHead(ctx, -0.45, 0.22);
  // Torso
  drawTorso(ctx, -0.2, 0.5, 0.28, 0.35);
  // Shoulders
  ctx.fillRect(-0.5, -0.2, 1.0, 0.12);
}

/** Heavy weapons specialist (wider stance, weapon). */
function drawHeavyWeapon(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  drawHead(ctx, -0.42, 0.2);
  // Wide torso
  drawTorso(ctx, -0.18, 0.55, 0.35, 0.42);
  // Weapon barrel (horizontal bar)
  ctx.fillRect(-0.65, -0.12, 0.5, 0.08);
}

/** Officer / commander silhouette (tall, lean). */
function drawOfficer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  drawHead(ctx, -0.5, 0.2);
  // Tall lean torso
  drawTorso(ctx, -0.26, 0.6, 0.22, 0.28);
  // Cape/pauldrons
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.26);
  ctx.quadraticCurveTo(-0.55, -0.1, -0.4, 0.35);
  ctx.lineTo(-0.22, 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.22, -0.26);
  ctx.quadraticCurveTo(0.55, -0.1, 0.4, 0.35);
  ctx.lineTo(0.22, 0.35);
  ctx.closePath();
  ctx.fill();
}

/** Droid silhouette (angular, mechanical). */
function drawDroid(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  // Angular head
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.55);
  ctx.lineTo(0.15, -0.55);
  ctx.lineTo(0.18, -0.3);
  ctx.lineTo(-0.18, -0.3);
  ctx.closePath();
  ctx.fill();
  // Eye slit
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-0.12, -0.48, 0.24, 0.06);
  ctx.restore();
  // Body (rectangular)
  ctx.fillRect(-0.25, -0.25, 0.5, 0.65);
  // Arms
  ctx.fillRect(-0.4, -0.2, 0.12, 0.5);
  ctx.fillRect(0.28, -0.2, 0.12, 0.5);
}

/** Beast / creature silhouette (four-legged). */
function drawBeast(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  // Head
  ctx.beginPath();
  ctx.ellipse(-0.4, -0.15, 0.22, 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body (horizontal ellipse)
  ctx.beginPath();
  ctx.ellipse(0.05, 0.05, 0.45, 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.fillRect(-0.25, 0.2, 0.1, 0.35);
  ctx.fillRect(-0.05, 0.2, 0.1, 0.35);
  ctx.fillRect(0.2, 0.2, 0.1, 0.35);
  ctx.fillRect(0.38, 0.2, 0.1, 0.35);
}

/** Force user / mystic silhouette (robed, hood). */
function drawForceUser(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  // Hooded head
  ctx.beginPath();
  ctx.arc(0, -0.45, 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Hood peak
  ctx.beginPath();
  ctx.moveTo(0, -0.72);
  ctx.lineTo(-0.25, -0.4);
  ctx.lineTo(0.25, -0.4);
  ctx.closePath();
  ctx.fill();
  // Flowing robe (wide A-line)
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.22);
  ctx.quadraticCurveTo(-0.55, 0.3, -0.5, 0.65);
  ctx.lineTo(0.5, 0.65);
  ctx.quadraticCurveTo(0.55, 0.3, 0.2, -0.22);
  ctx.closePath();
  ctx.fill();
}

/** Vehicle silhouette (speeder/tank profile). */
function drawVehicle(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  // Hull
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.1);
  ctx.lineTo(-0.45, -0.2);
  ctx.lineTo(0.45, -0.2);
  ctx.lineTo(0.6, 0.1);
  ctx.lineTo(0.5, 0.25);
  ctx.lineTo(-0.5, 0.25);
  ctx.closePath();
  ctx.fill();
  // Turret/cockpit
  ctx.beginPath();
  ctx.arc(0, -0.15, 0.18, Math.PI, 0);
  ctx.fill();
  // Cannon
  ctx.fillRect(0.1, -0.35, 0.4, 0.07);
}

/** Walker silhouette (AT-ST style). */
function drawWalker(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
  // Head/cockpit
  ctx.beginPath();
  ctx.moveTo(-0.25, -0.45);
  ctx.lineTo(0.3, -0.45);
  ctx.lineTo(0.35, -0.2);
  ctx.lineTo(-0.3, -0.2);
  ctx.closePath();
  ctx.fill();
  // Chin guns
  ctx.fillRect(-0.35, -0.25, 0.12, 0.06);
  ctx.fillRect(0.23, -0.25, 0.12, 0.06);
  // Neck
  ctx.fillRect(-0.08, -0.2, 0.16, 0.2);
  // Body
  ctx.fillRect(-0.2, 0.0, 0.4, 0.15);
  // Legs (angled)
  ctx.save();
  ctx.translate(-0.12, 0.15);
  ctx.rotate(-0.15);
  ctx.fillRect(-0.05, 0, 0.1, 0.45);
  ctx.restore();
  ctx.save();
  ctx.translate(0.12, 0.15);
  ctx.rotate(0.15);
  ctx.fillRect(-0.05, 0, 0.1, 0.45);
  ctx.restore();
}

// ============================================================================
// Registry
// ============================================================================

const SILHOUETTE_DRAWERS: Record<
  SilhouetteType,
  (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void
> = {
  infantry: drawInfantry,
  'heavy-weapon': drawHeavyWeapon,
  officer: drawOfficer,
  droid: drawDroid,
  beast: drawBeast,
  'force-user': drawForceUser,
  vehicle: drawVehicle,
  walker: drawWalker,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a silhouette onto a new canvas and return as ImageBitmap.
 * The result can be cached and drawn directly onto the tactical grid.
 */
export async function renderSilhouette(
  type: SilhouetteType,
  options: Partial<SilhouetteOptions> = {},
): Promise<ImageBitmap> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const canvasSize = opts.size * dpr;

  const canvas = new OffscreenCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d')!;

  // Setup: background, clip, transform
  setupCanvas(ctx, canvasSize, opts.bgColor);

  // Draw the silhouette shape
  ctx.fillStyle = opts.fillColor;
  const drawer = SILHOUETTE_DRAWERS[type] || SILHOUETTE_DRAWERS.infantry;
  drawer(ctx);

  return createImageBitmap(canvas);
}

/**
 * Render a silhouette directly onto an existing canvas context.
 * Used for inline rendering in the tactical grid without creating
 * a separate bitmap.
 *
 * The caller should save/restore the context state.
 */
export function drawSilhouetteOnContext(
  ctx: CanvasRenderingContext2D,
  type: SilhouetteType,
  cx: number,
  cy: number,
  size: number,
  fillColor: string,
  bgColor: string,
): void {
  ctx.save();

  const r = size / 2;

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.clip();

  // Transform for unit-circle drawing
  ctx.translate(cx, cy);
  ctx.scale(r, r);

  // Draw shape
  ctx.fillStyle = fillColor;
  const drawer = SILHOUETTE_DRAWERS[type] || SILHOUETTE_DRAWERS.infantry;
  drawer(ctx);

  ctx.restore();
}

/**
 * Infer a silhouette type from NPC keywords or role.
 * Used when auto-selecting a fallback for unportraited figures.
 */
export function inferSilhouetteType(keywords: string[]): SilhouetteType {
  const kw = new Set(keywords.map(k => k.toLowerCase()));

  if (kw.has('vehicle') || kw.has('speeder') || kw.has('tank')) return 'vehicle';
  if (kw.has('walker') || kw.has('at-st') || kw.has('at-at')) return 'walker';
  if (kw.has('beast') || kw.has('creature') || kw.has('animal')) return 'beast';
  if (kw.has('droid') || kw.has('robot') || kw.has('mechanical')) return 'droid';
  if (kw.has('force-user') || kw.has('jedi') || kw.has('sith') || kw.has('mystic')) return 'force-user';
  if (kw.has('officer') || kw.has('commander') || kw.has('captain') || kw.has('leader')) return 'officer';
  if (kw.has('heavy') || kw.has('heavy-weapon') || kw.has('gunner')) return 'heavy-weapon';

  return 'infantry';
}

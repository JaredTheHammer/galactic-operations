/**
 * animation-manager.ts
 *
 * Manages visual combat effects rendered on the tactical grid canvas.
 * Effects are time-based and self-removing. The manager is ticked each frame
 * by the render loop and draws active effects onto the provided canvas context.
 */

import { TILE_SIZE } from './renderer'

// ============================================================================
// Effect types
// ============================================================================

interface BaseEffect {
  id: number
  startTime: number
  duration: number
}

/** Blaster bolt traveling from attacker to target */
export interface ProjectileEffect extends BaseEffect {
  type: 'projectile'
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
  isHit: boolean
}

/** Floating damage/miss text above a figure */
export interface DamageNumberEffect extends BaseEffect {
  type: 'damageNumber'
  x: number
  y: number
  text: string
  color: string
}

/** Particle burst on figure defeat */
export interface DeathParticlesEffect extends BaseEffect {
  type: 'deathParticles'
  x: number
  y: number
  particles: Array<{
    vx: number
    vy: number
    size: number
    color: string
    alpha: number
  }>
}

/** Brief afterimage trail when a figure moves */
export interface MoveTrailEffect extends BaseEffect {
  type: 'moveTrail'
  points: Array<{ x: number; y: number }>
  color: string
}

/** Screen shake on heavy hit */
export interface ScreenShakeEffect extends BaseEffect {
  type: 'screenShake'
  intensity: number
}

/** Muzzle flash at attacker position */
export interface MuzzleFlashEffect extends BaseEffect {
  type: 'muzzleFlash'
  x: number
  y: number
  color: string
}

export type CombatEffect =
  | ProjectileEffect
  | DamageNumberEffect
  | DeathParticlesEffect
  | MoveTrailEffect
  | ScreenShakeEffect
  | MuzzleFlashEffect

// ============================================================================
// Animation Manager
// ============================================================================

let nextEffectId = 0

export class AnimationManager {
  private effects: CombatEffect[] = []

  /** Current camera shake offset (consumed by renderer each frame) */
  shakeOffsetX = 0
  shakeOffsetY = 0

  get hasActiveEffects(): boolean {
    return this.effects.length > 0
  }

  // --------------------------------------------------------------------------
  // Spawn helpers
  // --------------------------------------------------------------------------

  /**
   * Spawn a blaster bolt projectile from attacker to defender.
   * @param from Grid coordinate of attacker
   * @param to Grid coordinate of defender
   * @param isHit Whether the attack landed
   * @param side 'imperial' | 'operative' for bolt color
   */
  spawnProjectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    isHit: boolean,
    side: string,
  ): void {
    const color = side === 'imperial' ? '#ff2222' : '#44ff44'
    this.effects.push({
      id: nextEffectId++,
      type: 'projectile',
      startTime: performance.now(),
      duration: 400,
      fromX: from.x * TILE_SIZE + TILE_SIZE / 2,
      fromY: from.y * TILE_SIZE + TILE_SIZE / 2,
      toX: to.x * TILE_SIZE + TILE_SIZE / 2,
      toY: to.y * TILE_SIZE + TILE_SIZE / 2,
      color,
      isHit,
    })

    // Muzzle flash at origin
    this.effects.push({
      id: nextEffectId++,
      type: 'muzzleFlash',
      startTime: performance.now(),
      duration: 150,
      x: from.x * TILE_SIZE + TILE_SIZE / 2,
      y: from.y * TILE_SIZE + TILE_SIZE / 2,
      color,
    })
  }

  /**
   * Spawn floating damage text above a figure.
   */
  spawnDamageNumber(
    pos: { x: number; y: number },
    wounds: number,
    isHit: boolean,
  ): void {
    const text = isHit ? (wounds > 0 ? `-${wounds}` : 'Blocked') : 'Miss'
    const color = isHit ? (wounds > 0 ? '#ff4444' : '#ffaa44') : '#aaaaaa'
    this.effects.push({
      id: nextEffectId++,
      type: 'damageNumber',
      startTime: performance.now(),
      duration: 900,
      x: pos.x * TILE_SIZE + TILE_SIZE / 2,
      y: pos.y * TILE_SIZE,
      text,
      color,
    })
  }

  /**
   * Spawn an explosion of particles where a figure was defeated.
   */
  spawnDeathParticles(pos: { x: number; y: number }, side: string): void {
    const baseColor = side === 'imperial' ? '#ff4444' : '#44ff44'
    const particles = Array.from({ length: 12 }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 80
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 4,
        color: baseColor,
        alpha: 1,
      }
    })

    this.effects.push({
      id: nextEffectId++,
      type: 'deathParticles',
      startTime: performance.now(),
      duration: 700,
      x: pos.x * TILE_SIZE + TILE_SIZE / 2,
      y: pos.y * TILE_SIZE + TILE_SIZE / 2,
      particles,
    })

    // Also shake the screen
    this.effects.push({
      id: nextEffectId++,
      type: 'screenShake',
      startTime: performance.now(),
      duration: 300,
      intensity: 6,
    })
  }

  /**
   * Spawn a trail showing a figure's movement path.
   */
  spawnMoveTrail(
    from: { x: number; y: number },
    to: { x: number; y: number },
    side: string,
  ): void {
    const color = side === 'imperial' ? 'rgba(255, 68, 68, 0.4)' : 'rgba(68, 255, 68, 0.4)'
    this.effects.push({
      id: nextEffectId++,
      type: 'moveTrail',
      startTime: performance.now(),
      duration: 500,
      points: [
        { x: from.x * TILE_SIZE + TILE_SIZE / 2, y: from.y * TILE_SIZE + TILE_SIZE / 2 },
        { x: to.x * TILE_SIZE + TILE_SIZE / 2, y: to.y * TILE_SIZE + TILE_SIZE / 2 },
      ],
      color,
    })
  }

  // --------------------------------------------------------------------------
  // Tick & draw
  // --------------------------------------------------------------------------

  /**
   * Update all effects and draw them. Call once per frame inside the render loop.
   * Must be called AFTER drawEffects (the status token layer) and after ctx
   * has the camera transform applied.
   */
  drawAnimations(ctx: CanvasRenderingContext2D): void {
    const now = performance.now()

    // Reset shake
    this.shakeOffsetX = 0
    this.shakeOffsetY = 0

    // Process effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]
      const elapsed = now - fx.startTime
      const progress = Math.min(elapsed / fx.duration, 1)

      if (progress >= 1) {
        this.effects.splice(i, 1)
        continue
      }

      switch (fx.type) {
        case 'projectile':
          this.drawProjectile(ctx, fx, progress)
          break
        case 'damageNumber':
          this.drawDamageNumber(ctx, fx, progress)
          break
        case 'deathParticles':
          this.drawDeathParticles(ctx, fx, progress)
          break
        case 'moveTrail':
          this.drawMoveTrail(ctx, fx, progress)
          break
        case 'screenShake':
          this.applyScreenShake(fx, progress)
          break
        case 'muzzleFlash':
          this.drawMuzzleFlash(ctx, fx, progress)
          break
      }
    }
  }

  // --------------------------------------------------------------------------
  // Individual renderers
  // --------------------------------------------------------------------------

  private drawProjectile(ctx: CanvasRenderingContext2D, fx: ProjectileEffect, progress: number): void {
    // Bolt travels first 70% of duration, then impact flash for last 30%
    const travelProgress = Math.min(progress / 0.7, 1)

    const x = fx.fromX + (fx.toX - fx.fromX) * travelProgress
    const y = fx.fromY + (fx.toY - fx.fromY) * travelProgress

    ctx.save()

    if (travelProgress < 1) {
      // Draw bolt -- elongated glow along travel direction
      const dx = fx.toX - fx.fromX
      const dy = fx.toY - fx.fromY
      const angle = Math.atan2(dy, dx)

      ctx.translate(x, y)
      ctx.rotate(angle)

      // Core bolt
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(0, 0, 8, 2, 0, 0, Math.PI * 2)
      ctx.fill()

      // Colored glow
      ctx.globalAlpha = 0.7
      ctx.fillStyle = fx.color
      ctx.beginPath()
      ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2)
      ctx.fill()

      // Trail
      ctx.globalAlpha = 0.3
      ctx.fillStyle = fx.color
      ctx.beginPath()
      ctx.ellipse(-8, 0, 10, 2, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Impact flash at destination
      const impactProgress = (progress - 0.7) / 0.3
      const flashRadius = fx.isHit ? 12 + impactProgress * 8 : 6 + impactProgress * 4
      const flashAlpha = 1 - impactProgress

      ctx.globalAlpha = flashAlpha
      ctx.fillStyle = fx.isHit ? '#ffffff' : '#666666'
      ctx.beginPath()
      ctx.arc(fx.toX, fx.toY, flashRadius, 0, Math.PI * 2)
      ctx.fill()

      if (fx.isHit) {
        ctx.globalAlpha = flashAlpha * 0.5
        ctx.fillStyle = fx.color
        ctx.beginPath()
        ctx.arc(fx.toX, fx.toY, flashRadius * 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()
  }

  private drawDamageNumber(ctx: CanvasRenderingContext2D, fx: DamageNumberEffect, progress: number): void {
    const floatY = fx.y - progress * 30 // Float upward
    const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3 // Fade out last 30%
    const scale = progress < 0.1 ? progress / 0.1 : 1 // Pop in

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `bold ${Math.round(16 * scale)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Shadow
    ctx.fillStyle = '#000000'
    ctx.fillText(fx.text, fx.x + 1, floatY + 1)

    // Text
    ctx.fillStyle = fx.color
    ctx.fillText(fx.text, fx.x, floatY)
    ctx.restore()
  }

  private drawDeathParticles(ctx: CanvasRenderingContext2D, fx: DeathParticlesEffect, progress: number): void {
    ctx.save()
    const dt = progress * fx.duration / 1000 // seconds elapsed

    for (const p of fx.particles) {
      const px = fx.x + p.vx * dt
      const py = fx.y + p.vy * dt + 30 * dt * dt // gravity
      const alpha = 1 - progress
      const size = p.size * (1 - progress * 0.5)

      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(px, py, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawMoveTrail(ctx: CanvasRenderingContext2D, fx: MoveTrailEffect, progress: number): void {
    if (fx.points.length < 2) return

    const alpha = 1 - progress
    ctx.save()
    ctx.globalAlpha = alpha * 0.6
    ctx.strokeStyle = fx.color
    ctx.lineWidth = 3
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(fx.points[0].x, fx.points[0].y)
    for (let i = 1; i < fx.points.length; i++) {
      ctx.lineTo(fx.points[i].x, fx.points[i].y)
    }
    ctx.stroke()

    // Afterimage circle at origin
    ctx.globalAlpha = alpha * 0.3
    ctx.fillStyle = fx.color
    ctx.beginPath()
    ctx.arc(fx.points[0].x, fx.points[0].y, TILE_SIZE / 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private applyScreenShake(fx: ScreenShakeEffect, progress: number): void {
    const decay = 1 - progress
    const intensity = fx.intensity * decay
    this.shakeOffsetX += (Math.random() - 0.5) * 2 * intensity
    this.shakeOffsetY += (Math.random() - 0.5) * 2 * intensity
  }

  private drawMuzzleFlash(ctx: CanvasRenderingContext2D, fx: MuzzleFlashEffect, progress: number): void {
    const alpha = 1 - progress
    const radius = 8 + progress * 6

    ctx.save()
    ctx.globalAlpha = alpha * 0.8
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(fx.x, fx.y, radius * 0.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = alpha * 0.4
    ctx.fillStyle = fx.color
    ctx.beginPath()
    ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** Remove all active effects immediately. */
  clear(): void {
    this.effects.length = 0
    this.shakeOffsetX = 0
    this.shakeOffsetY = 0
  }
}

/** Singleton instance shared between game store (triggers) and renderer (draws). */
export const combatAnimations = new AnimationManager()

import type { GridCoordinate } from '@engine/types.js'

export interface CameraState {
  x: number
  y: number
  zoom: number
}

export class Camera {
  private position: { x: number; y: number }
  private zoom: number
  private targetPosition: { x: number; y: number }
  private targetZoom: number
  private isAnimating: boolean = false
  private animationProgress: number = 0
  private animationDuration: number = 300 // milliseconds

  // Bounds (optional, for limiting camera pan)
  private minX: number = 0
  private minY: number = 0
  private maxX: number = 1000
  private maxY: number = 1000

  constructor(initialX: number = 0, initialY: number = 0, initialZoom: number = 1.0) {
    this.position = { x: initialX, y: initialY }
    this.zoom = initialZoom
    this.targetPosition = { ...this.position }
    this.targetZoom = initialZoom
  }

  getPosition(): { x: number; y: number } {
    return { ...this.position }
  }

  getZoom(): number {
    return this.zoom
  }

  getState(): CameraState {
    return {
      x: this.position.x,
      y: this.position.y,
      zoom: this.zoom,
    }
  }

  screenToWorld(screenX: number, screenY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number } {
    const worldX = (screenX - canvasWidth / 2) / this.zoom + this.position.x
    const worldY = (screenY - canvasHeight / 2) / this.zoom + this.position.y
    return { x: worldX, y: worldY }
  }

  worldToScreen(worldX: number, worldY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number } {
    const screenX = (worldX - this.position.x) * this.zoom + canvasWidth / 2
    const screenY = (worldY - this.position.y) * this.zoom + canvasHeight / 2
    return { x: screenX, y: screenY }
  }

  panBy(dx: number, dy: number) {
    this.position.x -= dx / this.zoom
    this.position.y -= dy / this.zoom
    this.clampPosition()
  }

  panTo(x: number, y: number, animate: boolean = false) {
    if (animate) {
      this.targetPosition = { x, y }
      this.isAnimating = true
      this.animationProgress = 0
    } else {
      this.position = { x, y }
      this.targetPosition = { ...this.position }
      this.clampPosition()
    }
  }

  /**
   * Compute and set zoom so the entire map fits within the viewport.
   * Adds a small margin so the map doesn't touch the edges.
   */
  fitToMap(mapWidthPx: number, mapHeightPx: number, canvasWidth: number, canvasHeight: number, animate: boolean = false) {
    const margin = 0.9 // 90% of viewport used for map
    const zoomX = (canvasWidth * margin) / mapWidthPx
    const zoomY = (canvasHeight * margin) / mapHeightPx
    const fitZoom = Math.min(zoomX, zoomY)

    // Center on map center
    const centerX = mapWidthPx / 2
    const centerY = mapHeightPx / 2
    this.panTo(centerX, centerY, animate)
    this.zoomTo(fitZoom, animate)
  }

  zoomTo(level: number, animate: boolean = false) {
    level = Math.max(0.15, Math.min(3.0, level))

    if (animate) {
      this.targetZoom = level
      this.isAnimating = true
      this.animationProgress = 0
    } else {
      this.zoom = level
      this.targetZoom = level
    }
  }

  zoomBy(delta: number, animate: boolean = false) {
    this.zoomTo(this.zoom + delta, animate)
  }

  centerOn(gridCoord: GridCoordinate, tileSize: number = 56, animate: boolean = false) {
    const worldX = gridCoord.x * tileSize + tileSize / 2
    const worldY = gridCoord.y * tileSize + tileSize / 2
    this.panTo(worldX, worldY, animate)
  }

  setBounds(minX: number, minY: number, maxX: number, maxY: number) {
    this.minX = minX
    this.minY = minY
    this.maxX = maxX
    this.maxY = maxY
    this.clampPosition()
  }

  private clampPosition() {
    this.position.x = Math.max(this.minX, Math.min(this.maxX, this.position.x))
    this.position.y = Math.max(this.minY, Math.min(this.maxY, this.position.y))
  }

  update(deltaTime: number = 16) {
    if (!this.isAnimating) return

    this.animationProgress += deltaTime
    const progress = Math.min(1, this.animationProgress / this.animationDuration)

    // Ease-out cubic interpolation
    const easeProgress = 1 - Math.pow(1 - progress, 3)

    this.position.x = this.position.x + (this.targetPosition.x - this.position.x) * easeProgress
    this.position.y = this.position.y + (this.targetPosition.y - this.position.y) * easeProgress
    this.zoom = this.zoom + (this.targetZoom - this.zoom) * easeProgress

    if (progress >= 1) {
      this.position = { ...this.targetPosition }
      this.zoom = this.targetZoom
      this.isAnimating = false
    }

    this.clampPosition()
  }

  isAnimatingNow(): boolean {
    return this.isAnimating
  }
}

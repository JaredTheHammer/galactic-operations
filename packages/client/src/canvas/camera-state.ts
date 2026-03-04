/**
 * Shared camera state for cross-component reads (e.g., Minimap).
 *
 * The TacticalGrid writes to this ref each frame.
 * Other components can read without triggering React renders.
 */

export interface SharedCameraState {
  x: number
  y: number
  zoom: number
  canvasWidth: number
  canvasHeight: number
}

export const sharedCamera: SharedCameraState = {
  x: 0,
  y: 0,
  zoom: 1,
  canvasWidth: 0,
  canvasHeight: 0,
}

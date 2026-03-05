/**
 * Polyfills for iOS Safari < 16.4 compatibility.
 * - OffscreenCanvas: falls back to a regular HTMLCanvasElement
 * - structuredClone: falls back to JSON round-trip
 */

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as any).OffscreenCanvas = class OffscreenCanvasPolyfill {
    private _canvas: HTMLCanvasElement
    width: number
    height: number

    constructor(width: number, height: number) {
      this._canvas = document.createElement('canvas')
      this._canvas.width = width
      this._canvas.height = height
      this.width = width
      this.height = height
    }

    getContext(type: string, options?: any): any {
      return this._canvas.getContext(type as any, options)
    }

    transferToImageBitmap(): ImageBitmap {
      return (this._canvas as any).transferToImageBitmap?.()
        ?? createImageBitmap(this._canvas)
    }

    toBlob(...args: any[]): Promise<Blob | null> {
      return new Promise((resolve) => this._canvas.toBlob(resolve, ...args))
    }

    toDataURL(...args: any[]): string {
      return this._canvas.toDataURL(...args)
    }
  }
}

if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value))
}

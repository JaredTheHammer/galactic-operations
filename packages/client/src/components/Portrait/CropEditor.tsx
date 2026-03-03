/**
 * Crop Editor - Interactive pan/zoom control for portrait cropping.
 *
 * Renders the full portrait image inside a circular viewport. The user
 * can drag to pan and scroll to zoom. The CropState is emitted on every
 * change for real-time preview in the token renderer.
 *
 * All coordinates are normalized 0-1 (resolution-independent).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { CropState } from '../../types/portrait';
import { DEFAULT_CROP } from '../../types/portrait';
import { usePortraitStore } from '../../store/portrait-store';

// ============================================================================
// Constants
// ============================================================================

const VIEWPORT_SIZE = 200; // px, circular viewport diameter
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.1;

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
};

const viewportContainerStyle: React.CSSProperties = {
  width: VIEWPORT_SIZE,
  height: VIEWPORT_SIZE,
  borderRadius: '50%',
  overflow: 'hidden',
  border: '2px solid #333355',
  cursor: 'grab',
  position: 'relative',
  backgroundColor: '#0a0a0f',
  flexShrink: 0,
};

const canvasStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
};

const controlsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '11px',
  color: '#888899',
};

const sliderStyle: React.CSSProperties = {
  width: '120px',
  accentColor: '#bb99ff',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '10px',
  backgroundColor: '#1a1a2e',
  color: '#888899',
  border: '1px solid #333355',
  borderRadius: '3px',
  cursor: 'pointer',
};

const nothingStyle: React.CSSProperties = {
  width: VIEWPORT_SIZE,
  height: VIEWPORT_SIZE,
  borderRadius: '50%',
  border: '2px dashed #333355',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#555566',
  fontSize: '12px',
};

// ============================================================================
// Component
// ============================================================================

interface CropEditorProps {
  /** Portrait ID to edit. */
  portraitId: string | null;
  /** Current crop state. */
  crop?: CropState;
  /** Called on every crop change (debounce in parent if needed). */
  onCropChange?: (crop: CropState) => void;
}

export const CropEditor: React.FC<CropEditorProps> = ({
  portraitId,
  crop = DEFAULT_CROP,
  onCropChange,
}) => {
  const ensureOriginal = usePortraitStore(s => s.ensureOriginal);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; crop: CropState } | null>(null);

  // Load original bitmap
  useEffect(() => {
    if (!portraitId) {
      setBitmap(null);
      return;
    }
    let cancelled = false;
    ensureOriginal(portraitId).then(bmp => {
      if (!cancelled) setBitmap(bmp);
    });
    return () => { cancelled = true; };
  }, [portraitId, ensureOriginal]);

  // Render the cropped view onto the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = VIEWPORT_SIZE * (window.devicePixelRatio || 1);
    canvas.width = size;
    canvas.height = size;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Calculate visible region in source pixels
    const { width: srcW, height: srcH } = bitmap;
    const minSide = Math.min(srcW, srcH);
    const visibleRadius = (minSide / 2) / Math.max(crop.zoom, 0.1);

    const cx = crop.centerX * srcW;
    const cy = crop.centerY * srcH;
    const sx = cx - visibleRadius;
    const sy = cy - visibleRadius;
    const sSize = visibleRadius * 2;

    ctx.drawImage(bitmap, sx, sy, sSize, sSize, 0, 0, size, size);
  }, [bitmap, crop]);

  // Pan: mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      crop: { ...crop },
    };
  }, [crop]);

  // Pan: mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStartRef.current || !bitmap) return;
    e.preventDefault();

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Convert pixel delta to normalized delta
    // Sensitivity inversely proportional to zoom
    const sensitivity = 1 / (VIEWPORT_SIZE * crop.zoom);
    const newCenterX = Math.max(0, Math.min(1,
      dragStartRef.current.crop.centerX - dx * sensitivity
    ));
    const newCenterY = Math.max(0, Math.min(1,
      dragStartRef.current.crop.centerY - dy * sensitivity
    ));

    onCropChange?.({
      ...crop,
      centerX: newCenterX,
      centerY: newCenterY,
    });
  }, [dragging, bitmap, crop, onCropChange]);

  // Pan: mouse up
  const handleMouseUp = useCallback(() => {
    setDragging(false);
    dragStartRef.current = null;
  }, []);

  // Zoom: scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom + delta));
    onCropChange?.({ ...crop, zoom: newZoom });
  }, [crop, onCropChange]);

  // Reset crop
  const handleReset = useCallback(() => {
    onCropChange?.(DEFAULT_CROP);
  }, [onCropChange]);

  if (!portraitId) {
    return <div style={nothingStyle}>Select a portrait</div>;
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          ...viewportContainerStyle,
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} style={canvasStyle} />
      </div>

      <div style={controlsStyle}>
        <span>Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={crop.zoom}
          onChange={e => onCropChange?.({ ...crop, zoom: parseFloat(e.target.value) })}
          style={sliderStyle}
        />
        <span>{crop.zoom.toFixed(1)}x</span>
        <button style={resetButtonStyle} onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
};

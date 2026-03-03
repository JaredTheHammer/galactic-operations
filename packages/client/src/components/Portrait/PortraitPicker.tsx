/**
 * Portrait Picker - Compact portrait selector for embedding in forms/wizards.
 *
 * Shows a selected portrait preview with a collapsible grid browser.
 * Designed for the hero creation wizard and similar contexts where
 * the full PortraitEditor is too heavy.
 *
 * Layout (collapsed):
 *   [preview circle]  Hero Portrait  [Browse] [Clear]
 *
 * Layout (expanded):
 *   [preview circle]  Hero Portrait  [Browse] [Clear]
 *   +----------------------------------------------+
 *   | Upload zone                                   |
 *   | [thumb] [thumb] [thumb] [thumb] [thumb]       |
 *   +----------------------------------------------+
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePortraitStore } from '../../store/portrait-store';
import { PortraitGrid } from './PortraitGrid';
import { PortraitUploader } from './PortraitUploader';

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  padding: '10px 12px',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const previewCircleStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: '2px solid #374151',
  overflow: 'hidden',
  flexShrink: 0,
  backgroundColor: '#111827',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const previewImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const placeholderStyle: React.CSSProperties = {
  fontSize: 18,
  color: '#374151',
};

const labelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: '#d1d5db',
};

const sublabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#6b7280',
};

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'monospace',
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: 3,
  color: '#d1d5db',
  cursor: 'pointer',
};

const browseActiveStyle: React.CSSProperties = {
  ...buttonStyle,
  borderColor: '#fbbf24',
  color: '#fbbf24',
};

const clearButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: '#9ca3af',
  fontSize: 10,
};

const expandedAreaStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 0 0 0',
  borderTop: '1px solid #374151',
};

const uploaderWrapStyle: React.CSSProperties = {
  marginBottom: 8,
};

const gridContainerStyle: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
};

// ============================================================================
// Component
// ============================================================================

interface PortraitPickerProps {
  /** Currently selected portrait ID. */
  selectedPortraitId: string | null;
  /** Called when selection changes. */
  onSelect: (portraitId: string | null) => void;
  /** Default tags for new uploads (e.g. species/career). */
  defaultTags?: string[];
  /** Show only portraits matching these tags. */
  filterTags?: string[];
  /** Placeholder label when no portrait is selected. */
  placeholder?: string;
}

export const PortraitPicker: React.FC<PortraitPickerProps> = ({
  selectedPortraitId,
  onSelect,
  defaultTags,
  filterTags,
  placeholder = 'No portrait selected',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const ensureThumbnail = usePortraitStore(s => s.ensureThumbnail);
  const portraits = usePortraitStore(s => s.portraits);
  const selectedPortrait = selectedPortraitId ? portraits[selectedPortraitId] : null;

  // Load thumbnail for selected portrait
  useEffect(() => {
    // Revoke previous URL
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setThumbUrl(null);

    if (!selectedPortraitId) return;

    let cancelled = false;

    ensureThumbnail(selectedPortraitId).then(bitmap => {
      if (cancelled || !bitmap) return;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      canvas.toBlob(blob => {
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setThumbUrl(url);
      });
    });

    return () => { cancelled = true; };
  }, [selectedPortraitId, ensureThumbnail]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const handleGridSelect = useCallback((id: string) => {
    onSelect(id);
    setExpanded(false);
  }, [onSelect]);

  const handleUploaded = useCallback((id: string) => {
    onSelect(id);
    // Keep expanded so user can see it selected in grid
  }, [onSelect]);

  const handleClear = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  return (
    <div style={containerStyle}>
      {/* Header row: preview + label + buttons */}
      <div style={headerRowStyle}>
        <div style={{
          ...previewCircleStyle,
          borderColor: selectedPortraitId ? '#fbbf24' : '#374151',
        }}>
          {thumbUrl ? (
            <img src={thumbUrl} alt="Portrait" style={previewImgStyle} draggable={false} />
          ) : (
            <div style={placeholderStyle}>{selectedPortrait ? '...' : '?'}</div>
          )}
        </div>

        <div style={labelStyle}>
          <div>{selectedPortrait?.label ?? placeholder}</div>
          {selectedPortrait && (
            <div style={sublabelStyle}>
              {selectedPortrait.originalWidth}x{selectedPortrait.originalHeight}
            </div>
          )}
        </div>

        <button
          style={expanded ? browseActiveStyle : buttonStyle}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Close' : 'Browse'}
        </button>

        {selectedPortraitId && (
          <button style={clearButtonStyle} onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {/* Expanded area: uploader + grid */}
      {expanded && (
        <div style={expandedAreaStyle}>
          <div style={uploaderWrapStyle}>
            <PortraitUploader
              onUploaded={handleUploaded}
              defaultTags={defaultTags}
            />
          </div>
          <div style={gridContainerStyle}>
            <PortraitGrid
              selectedId={selectedPortraitId}
              onSelect={handleGridSelect}
              filterTags={filterTags}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Portrait Grid - Thumbnail gallery for browsing and selecting portraits.
 *
 * Displays uploaded portraits as circular thumbnails in a responsive grid.
 * Supports selection, filtering by tags, and lazy thumbnail loading.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePortraitStore, selectPortraitsByTags } from '../../store/portrait-store';
import type { PortraitEntry } from '../../types/portrait';

// ============================================================================
// Styles
// ============================================================================

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
  gap: '8px',
  padding: '4px 0',
};

const cellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  paddingBottom: '100%', // 1:1 aspect ratio
  borderRadius: '50%',
  overflow: 'hidden',
  cursor: 'pointer',
  border: '2px solid transparent',
  transition: 'border-color 0.15s',
  backgroundColor: '#1a1a2e',
};

const cellSelectedStyle: React.CSSProperties = {
  ...cellStyle,
  borderColor: '#bb99ff',
  boxShadow: '0 0 8px rgba(187, 153, 255, 0.4)',
};

const cellHoverStyle: React.CSSProperties = {
  ...cellStyle,
  borderColor: '#555577',
};

const thumbnailStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const placeholderStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  color: '#333355',
};

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '-2px',
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: '9px',
  color: '#999999',
  textAlign: 'center',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: '1px 4px',
  backgroundColor: 'rgba(10, 10, 15, 0.8)',
  borderRadius: '2px',
};

const emptyStyle: React.CSSProperties = {
  color: '#555566',
  fontSize: '12px',
  textAlign: 'center',
  padding: '32px 16px',
};

// ============================================================================
// Thumbnail Cell
// ============================================================================

interface ThumbnailCellProps {
  portrait: PortraitEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const ThumbnailCell: React.FC<ThumbnailCellProps> = ({ portrait, isSelected, onSelect }) => {
  const ensureThumbnail = usePortraitStore(s => s.ensureThumbnail);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const urlRef = useRef<string | null>(null);

  // Load thumbnail bitmap on mount
  useEffect(() => {
    let cancelled = false;

    ensureThumbnail(portrait.id).then(bitmap => {
      if (cancelled || !bitmap) return;

      // Convert ImageBitmap to object URL for <img> rendering
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

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, [portrait.id, ensureThumbnail]);

  const style = isSelected
    ? cellSelectedStyle
    : hovered
      ? cellHoverStyle
      : cellStyle;

  return (
    <div
      style={style}
      onClick={() => onSelect(portrait.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={portrait.label}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={portrait.label}
          style={thumbnailStyle}
          draggable={false}
        />
      ) : (
        <div style={placeholderStyle}>?</div>
      )}
      {(isSelected || hovered) && (
        <div style={labelStyle}>{portrait.label}</div>
      )}
    </div>
  );
};

// ============================================================================
// Grid Component
// ============================================================================

interface PortraitGridProps {
  /** Currently selected portrait ID (if any). */
  selectedId?: string | null;
  /** Called when a portrait is selected. */
  onSelect?: (id: string) => void;
  /** Filter portraits to those matching ALL of these tag IDs. */
  filterTags?: string[];
  /** If true, shows the label for all cells, not just selected/hovered. */
  showLabels?: boolean;
}

export const PortraitGrid: React.FC<PortraitGridProps> = ({
  selectedId,
  onSelect,
  filterTags = [],
}) => {
  const hydrate = usePortraitStore(s => s.hydrate);
  const portraits = usePortraitStore(
    useCallback(s => selectPortraitsByTags(s, filterTags), [filterTags])
  );

  // Hydrate on mount
  useEffect(() => { hydrate(); }, [hydrate]);

  if (portraits.length === 0) {
    return <div style={emptyStyle}>No portraits yet. Upload one above.</div>;
  }

  return (
    <div style={gridStyle}>
      {portraits.map(p => (
        <ThumbnailCell
          key={p.id}
          portrait={p}
          isSelected={selectedId === p.id}
          onSelect={id => onSelect?.(id)}
        />
      ))}
    </div>
  );
};

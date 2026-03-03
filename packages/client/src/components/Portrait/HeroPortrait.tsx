/**
 * HeroPortrait - Small circular portrait token for hero cards.
 *
 * Renders a hero's portrait thumbnail as a circular token, or falls
 * back to a colored initial letter if no portrait is assigned. Handles
 * async thumbnail loading from IndexedDB internally.
 *
 * Usage:
 *   <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={36} />
 */

import React, { useEffect, useRef, useState } from 'react';
import { usePortraitStore } from '../../store/portrait-store';

// ============================================================================
// Component
// ============================================================================

interface HeroPortraitProps {
  /** Portrait ID from the hero character (may be undefined). */
  portraitId?: string | null;
  /** Hero name -- first letter is used as fallback. */
  name: string;
  /** Diameter in pixels. Default: 36. */
  size?: number;
  /** Accent color for the fallback circle. Default: #374151. */
  accentColor?: string;
  /** Optional extra styles on the outer container. */
  style?: React.CSSProperties;
}

export const HeroPortrait: React.FC<HeroPortraitProps> = ({
  portraitId,
  name,
  size = 36,
  accentColor = '#374151',
  style,
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const ensureThumbnail = usePortraitStore(s => s.ensureThumbnail);

  // Ensure portrait store is hydrated (idempotent, no-op if already done)
  useEffect(() => {
    usePortraitStore.getState().hydrate();
  }, []);

  useEffect(() => {
    // Revoke old URL
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setThumbUrl(null);

    if (!portraitId) return;

    let cancelled = false;

    ensureThumbnail(portraitId).then(bitmap => {
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
    }).catch(() => {
      // Portrait not in library; stay on fallback
    });

    return () => { cancelled = true; };
  }, [portraitId, ensureThumbnail]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const initial = name.charAt(0).toUpperCase() || '?';
  const fontSize = Math.max(10, Math.round(size * 0.4));

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    border: `2px solid ${accentColor}`,
    ...style,
  };

  if (thumbUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={thumbUrl}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          draggable={false}
        />
      </div>
    );
  }

  // Fallback: colored initial
  return (
    <div style={{
      ...containerStyle,
      backgroundColor: accentColor,
    }}>
      <span style={{
        fontSize,
        fontWeight: 'bold',
        color: '#e5e7eb',
        fontFamily: 'monospace',
        lineHeight: 1,
      }}>
        {initial}
      </span>
    </div>
  );
};

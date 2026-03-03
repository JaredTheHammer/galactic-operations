/**
 * Portrait Uploader - Drag-and-drop zone for image uploads.
 *
 * Handles file selection (drag-and-drop or click-to-browse),
 * validates image types, and delegates to the portrait store.
 */

import React, { useCallback, useRef, useState } from 'react';
import { usePortraitStore } from '../../store/portrait-store';

// ============================================================================
// Constants
// ============================================================================

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ============================================================================
// Styles
// ============================================================================

const dropZoneBase: React.CSSProperties = {
  border: '2px dashed #333355',
  borderRadius: '8px',
  padding: '24px 16px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'border-color 0.2s, background-color 0.2s',
  backgroundColor: 'rgba(19, 19, 32, 0.5)',
  color: '#888899',
  fontSize: '13px',
  userSelect: 'none',
};

const dropZoneActive: React.CSSProperties = {
  ...dropZoneBase,
  borderColor: '#bb99ff',
  backgroundColor: 'rgba(187, 153, 255, 0.08)',
  color: '#bb99ff',
};

const errorStyle: React.CSSProperties = {
  color: '#ff4444',
  fontSize: '11px',
  marginTop: '8px',
};

// ============================================================================
// Component
// ============================================================================

interface PortraitUploaderProps {
  /** Called after successful upload with the new portrait ID. */
  onUploaded?: (portraitId: string) => void;
  /** Default tags to apply to uploaded portraits. */
  defaultTags?: string[];
}

export const PortraitUploader: React.FC<PortraitUploaderProps> = ({
  onUploaded,
  defaultTags,
}) => {
  const uploadPortrait = usePortraitStore(s => s.uploadPortrait);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`Unsupported file type: ${file.type}. Use PNG, JPEG, or WebP.`);
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
      return;
    }

    setUploading(true);
    try {
      const entry = await uploadPortrait(file, undefined, defaultTags);
      onUploaded?.(entry.id);
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  }, [uploadPortrait, onUploaded, defaultTags]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  }, [processFile]);

  return (
    <div>
      <div
        style={isDragOver ? dropZoneActive : dropZoneBase}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        {uploading ? (
          <span style={{ color: '#bb99ff' }}>Processing...</span>
        ) : (
          <>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>+</div>
            <div>Drop an image here or click to browse</div>
            <div style={{ fontSize: '11px', marginTop: '4px', color: '#555566' }}>
              PNG, JPEG, WebP up to 10 MB
            </div>
          </>
        )}
      </div>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
};

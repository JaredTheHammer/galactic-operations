/**
 * Portrait Editor - Full portrait management panel.
 *
 * Composes the uploader, thumbnail grid, crop editor, and tag editor
 * into a cohesive portrait management interface. Can be used standalone
 * (in a dedicated portraits page) or embedded in hero creation flow.
 *
 * Layout:
 *   +-----------+------------------+
 *   | Grid      | Crop + Tags      |
 *   | (left)    | (right detail)   |
 *   +-----------+------------------+
 */

import React, { useCallback, useState } from 'react';
import { usePortraitStore } from '../../store/portrait-store';
import type { CropState, PortraitEntry } from '../../types/portrait';
import { PortraitUploader } from './PortraitUploader';
import { PortraitGrid } from './PortraitGrid';
import { CropEditor } from './CropEditor';
import { TagEditor } from './TagEditor';
import { PromptBuilder } from './PromptBuilder';
import { useIsMobile } from '../../hooks/useIsMobile';

// ============================================================================
// Styles
// ============================================================================

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  backgroundColor: '#131320',
  border: '1px solid #333355',
  borderRadius: '8px',
  padding: '16px',
  color: '#cccccc',
  overflow: 'hidden',
  minWidth: 0,
};

const panelMobileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  backgroundColor: '#131320',
  border: '1px solid #333355',
  borderRadius: '8px',
  padding: '12px',
  color: '#cccccc',
  minWidth: 0,
  // No overflow constraint - let content expand naturally so parent scrolls
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#bb99ff',
};

// Desktop: side-by-side columns
const layoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  minHeight: '320px',
  minWidth: 0,
};

// Mobile: vertical stack
const layoutMobileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
};

const leftColumnStyle: React.CSSProperties = {
  flex: '0 0 240px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  overflowY: 'auto',
  maxHeight: '500px',
  minWidth: 0,
};

const leftColumnMobileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
};

const rightColumnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  overflowY: 'auto',
  maxHeight: '500px',
  minWidth: 0,
};

const rightColumnMobileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
};

const detailHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const labelInputStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '1px solid #333355',
  color: '#cccccc',
  fontSize: '13px',
  padding: '2px 4px',
  outline: 'none',
  width: '100%',
  maxWidth: '200px',
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '10px',
  backgroundColor: '#1a1a2e',
  color: '#ff4444',
  border: '1px solid #442222',
  borderRadius: '3px',
  cursor: 'pointer',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #222233',
  margin: '4px 0',
};

const noSelectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  color: '#555566',
  fontSize: '12px',
};

const countStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#555566',
};

// ============================================================================
// Component
// ============================================================================

interface PortraitEditorProps {
  /** Called when a portrait is selected (useful in hero creation flow). */
  onSelectPortrait?: (portraitId: string | null) => void;
  /** If provided, pre-selects this portrait ID. */
  initialSelectedId?: string | null;
  /** Default tags applied to new uploads. */
  defaultTags?: string[];
  /** Show only portraits matching these tags. */
  filterTags?: string[];
  /** Compact mode for embedding in smaller containers. */
  compact?: boolean;
}

export const PortraitEditor: React.FC<PortraitEditorProps> = ({
  onSelectPortrait,
  initialSelectedId = null,
  defaultTags,
  filterTags,
  compact = false,
}) => {
  const { isMobile } = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const portraits = usePortraitStore(s => s.portraits);
  const updatePortrait = usePortraitStore(s => s.updatePortrait);
  const deletePortrait = usePortraitStore(s => s.deletePortrait);
  const setCrop = usePortraitStore(s => s.setCrop);

  const selectedPortrait: PortraitEntry | undefined = selectedId
    ? portraits[selectedId]
    : undefined;

  const portraitCount = Object.keys(portraits).length;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    onSelectPortrait?.(id);
  }, [onSelectPortrait]);

  const handleUploaded = useCallback((id: string) => {
    setSelectedId(id);
    onSelectPortrait?.(id);
  }, [onSelectPortrait]);

  const handleCropChange = useCallback((crop: CropState) => {
    if (selectedId) {
      setCrop(selectedId, crop);
    }
  }, [selectedId, setCrop]);

  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedId) {
      updatePortrait(selectedId, { label: e.target.value });
    }
  }, [selectedId, updatePortrait]);

  const handleTagsChange = useCallback((tags: string[]) => {
    if (selectedId) {
      updatePortrait(selectedId, { tags });
    }
  }, [selectedId, updatePortrait]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    await deletePortrait(selectedId);
    setSelectedId(null);
    onSelectPortrait?.(null);
  }, [selectedId, deletePortrait, onSelectPortrait]);

  const mobile = isMobile || compact;

  return (
    <div style={mobile ? panelMobileStyle : panelStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>Portrait Library</div>
        <div style={countStyle}>{portraitCount} portrait{portraitCount !== 1 ? 's' : ''}</div>
      </div>

      <div style={mobile ? layoutMobileStyle : layoutStyle}>
        {/* Left column: upload + grid */}
        <div style={mobile ? leftColumnMobileStyle : leftColumnStyle}>
          <PortraitUploader
            onUploaded={handleUploaded}
            defaultTags={defaultTags}
          />
          <PortraitGrid
            selectedId={selectedId}
            onSelect={handleSelect}
            filterTags={filterTags}
          />
        </div>

        {/* Right column: detail editor */}
        <div style={mobile ? rightColumnMobileStyle : rightColumnStyle}>
          {selectedPortrait ? (
            <>
              {/* Label + delete */}
              <div style={detailHeaderStyle}>
                <input
                  type="text"
                  value={selectedPortrait.label}
                  onChange={handleLabelChange}
                  style={labelInputStyle}
                  placeholder="Portrait name..."
                />
                <button
                  style={deleteButtonStyle}
                  onClick={handleDelete}
                  title="Delete portrait"
                >
                  Delete
                </button>
              </div>

              {/* Crop editor */}
              <CropEditor
                portraitId={selectedId}
                crop={selectedPortrait.crop}
                onCropChange={handleCropChange}
              />

              <div style={dividerStyle} />

              {/* Tag editor */}
              <TagEditor
                tags={selectedPortrait.tags}
                onTagsChange={handleTagsChange}
                compact={mobile}
              />

              {/* Metadata footer */}
              <div style={{
                fontSize: '9px',
                color: '#444455',
                marginTop: '4px',
              }}>
                {selectedPortrait.originalWidth}x{selectedPortrait.originalHeight} {selectedPortrait.mimeType}
                <br />
                ID: {selectedPortrait.id.slice(0, 12)}...
              </div>

              <div style={dividerStyle} />

              {/* AI Prompt Builder */}
              <PromptBuilder
                portraitTags={selectedPortrait.tags}
                compact={mobile}
              />
            </>
          ) : (
            <div style={noSelectionStyle}>
              Select a portrait to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

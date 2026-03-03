/**
 * PortraitManagerPage - Full-screen portrait & faction visual management.
 *
 * Wraps the PortraitEditor and FactionEditor into a dedicated campaign page
 * accessible from the MissionSelect toolbar. Provides a two-panel layout
 * with portraits on the left and faction colors on the right.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../store/game-store'
import { PortraitEditor } from '../Portrait/PortraitEditor'
import { FactionEditor } from '../Portrait/FactionEditor'
import { useIsMobile } from '../../hooks/useIsMobile'

// ============================================================================
// Tab type
// ============================================================================

type ManagerTab = 'portraits' | 'factions'

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#c0c0c0',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderBottom: '1px solid #2a2a3f',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '0 24px',
  borderBottom: '1px solid #2a2a3f',
  backgroundColor: '#0d0d18',
}

const tabStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
  border: 'none',
  borderBottom: '2px solid transparent',
  backgroundColor: 'transparent',
  color: '#888',
  transition: 'all 0.2s',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  color: '#bb99ff',
  borderBottomColor: '#bb99ff',
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '20px 24px',
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 18px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '13px',
}

// ============================================================================
// Component
// ============================================================================

export default function PortraitManagerPage() {
  const { closePortraitManager, campaignState } = useGameStore()
  const { isMobile } = useIsMobile()
  const [activeTab, setActiveTab] = useState<ManagerTab>('portraits')

  const headerResponsive: React.CSSProperties = {
    ...headerStyle,
    padding: isMobile ? '12px 16px' : headerStyle.padding,
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerResponsive}>
        <div>
          <h1 style={{ color: '#bb99ff', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>
            Portrait Manager
          </h1>
          {campaignState && (
            <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
              {campaignState.name}
            </div>
          )}
        </div>
        <button
          style={{ ...buttonStyle, backgroundColor: '#2a2a3a', color: '#88bbff' }}
          onClick={closePortraitManager}
        >
          BACK TO MISSIONS
        </button>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        <button
          style={activeTab === 'portraits' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('portraits')}
        >
          PORTRAITS
        </button>
        <button
          style={activeTab === 'factions' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('factions')}
        >
          FACTION COLORS
        </button>
      </div>

      {/* Content area */}
      <div style={contentStyle}>
        {activeTab === 'portraits' && (
          <PortraitEditor />
        )}
        {activeTab === 'factions' && (
          <FactionEditor />
        )}
      </div>
    </div>
  )
}

/**
 * StrategicCommand - Central hub for Dune-inspired campaign mechanics.
 * 5-tab layout: Contracts, Intel Network, Deck Building, Research, Mercenaries.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../../store/game-store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { t } from '../../../styles/theme'
import { ContractsPanel } from './ContractsPanel'
import { IntelNetworkPanel } from './IntelNetworkPanel'
import { DeckBuildingPanel } from './DeckBuildingPanel'
import { ResearchTrackPanel } from './ResearchTrackPanel'
import { MercenaryRosterPanel } from './MercenaryRosterPanel'

type Tab = 'contracts' | 'intel' | 'decks' | 'research' | 'mercenaries'

const TAB_CONFIG: Array<{ id: Tab; label: string; icon: string; color: string }> = [
  { id: 'contracts', label: 'Contracts', icon: '\u2694', color: '#ffd700' },
  { id: 'intel', label: 'Intel', icon: '\u{1F441}', color: '#4a9eff' },
  { id: 'decks', label: 'Decks', icon: '\u2660', color: '#bb99ff' },
  { id: 'research', label: 'Research', icon: '\u{1F52C}', color: '#44ff44' },
  { id: 'mercenaries', label: 'Mercs', icon: '\u{1F6E1}', color: '#ff8844' },
]

export default function StrategicCommand(): React.ReactElement {
  const { campaignState, closeStrategicCommand } = useGameStore()
  const { isMobile } = useIsMobile()
  const [activeTab, setActiveTab] = useState<Tab>('contracts')

  if (!campaignState) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: t.bgBase }}>
        <div style={{ color: t.textMuted }}>No active campaign</div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0a0a0f',
      color: '#c0c0c0',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderBottom: '1px solid #2a2a3f',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ color: '#cc8800', margin: 0, fontSize: isMobile ? '18px' : '22px', letterSpacing: '1px' }}>
            STRATEGIC COMMAND
          </h1>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
            Act {campaignState.currentAct} -- {campaignState.credits} credits
          </div>
        </div>
        <button
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            backgroundColor: '#2a2a3a',
            color: '#c0c0c0',
          }}
          onClick={closeStrategicCommand}
        >
          BACK
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #2a2a3f',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        {TAB_CONFIG.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              style={{
                flex: isMobile ? 1 : undefined,
                padding: isMobile ? '10px 8px' : '12px 24px',
                backgroundColor: isActive ? '#1a1a2f' : 'transparent',
                color: isActive ? tab.color : '#666',
                border: 'none',
                borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                cursor: 'pointer',
                fontWeight: isActive ? 'bold' : 'normal',
                fontSize: isMobile ? '12px' : '14px',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ marginRight: '6px' }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px' : '24px' }}>
        {activeTab === 'contracts' && <ContractsPanel campaignState={campaignState} />}
        {activeTab === 'intel' && <IntelNetworkPanel campaignState={campaignState} />}
        {activeTab === 'decks' && <DeckBuildingPanel campaignState={campaignState} />}
        {activeTab === 'research' && <ResearchTrackPanel campaignState={campaignState} />}
        {activeTab === 'mercenaries' && <MercenaryRosterPanel campaignState={campaignState} />}
      </div>
    </div>
  )
}

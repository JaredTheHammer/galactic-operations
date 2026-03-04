import React, { useState } from 'react'
import type { HeroCharacter } from '@engine/types.js'
import { useGameStore } from '../../../store/game-store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { HeroProgressionSidebar } from './HeroProgressionSidebar'
import { TalentPyramidEditor } from './TalentPyramidEditor'
import { SkillRankEditor } from './SkillRankEditor'
import { SpecializationPanel } from './SpecializationPanel'
import { EquipmentPanel } from './EquipmentPanel'

type Tab = 'talents' | 'skills' | 'specializations' | 'equipment'

export function HeroProgression() {
  const { campaignState, closeHeroProgression } = useGameStore()
  const { isMobile } = useIsMobile()
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('talents')

  if (!campaignState) return null

  const heroes = Object.values(campaignState.heroes) as HeroCharacter[]
  const selectedHero = selectedHeroId ? campaignState.heroes[selectedHeroId] ?? null : null

  // Auto-select first hero
  if (!selectedHero && heroes.length > 0 && !selectedHeroId) {
    setSelectedHeroId(heroes[0].id)
  }

  const buttonStyle: React.CSSProperties = {
    padding: '8px 16px',
    border: '1px solid #333355',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  }

  // --- Mobile layout ---
  if (isMobile) {
    const mobileTabStyle = (isActive: boolean): React.CSSProperties => ({
      flex: 1,
      padding: '10px 0',
      fontSize: '12px',
      fontWeight: isActive ? 'bold' : 'normal',
      color: isActive ? '#bb99ff' : '#999',
      backgroundColor: isActive ? '#1a1a2e' : 'transparent',
      border: 'none',
      borderBottom: isActive ? '2px solid #bb99ff' : '2px solid transparent',
      cursor: 'pointer',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      textAlign: 'center',
    })

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0f' }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '2px solid #333355',
          backgroundColor: '#131320',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              style={{ ...buttonStyle, padding: '6px 12px', backgroundColor: '#2a2a3a', color: '#bb99ff' }}
              onClick={closeHeroProgression}
            >
              Back
            </button>
            <span style={{ color: '#bb99ff', fontSize: '16px', fontWeight: 'bold' }}>
              HERO PROGRESSION
            </span>
          </div>
          {selectedHero && (
            <span style={{ color: '#888', fontSize: '12px' }}>
              {selectedHero.xp.available} XP
            </span>
          )}
        </div>

        {/* Hero selector dropdown */}
        <select
          value={selectedHeroId ?? ''}
          onChange={(e) => setSelectedHeroId(e.target.value)}
          style={{
            margin: '8px 12px',
            padding: '10px 12px',
            backgroundColor: '#131320',
            color: '#fff',
            border: '1px solid #333355',
            borderRadius: '6px',
            fontSize: '14px',
            appearance: 'auto',
            flexShrink: 0,
          }}
        >
          {heroes.map(hero => (
            <option key={hero.id} value={hero.id}>
              {hero.name} ({hero.xp.available} XP available)
            </option>
          ))}
        </select>

        {selectedHero ? (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '2px solid #333355', flexShrink: 0 }}>
              <button style={mobileTabStyle(activeTab === 'talents')} onClick={() => setActiveTab('talents')}>
                Talents
              </button>
              <button style={mobileTabStyle(activeTab === 'skills')} onClick={() => setActiveTab('skills')}>
                Skills
              </button>
              <button style={mobileTabStyle(activeTab === 'specializations')} onClick={() => setActiveTab('specializations')}>
                Specs
              </button>
              <button style={mobileTabStyle(activeTab === 'equipment')} onClick={() => setActiveTab('equipment')}>
                Equip
              </button>
            </div>

            {/* Active panel */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
              {activeTab === 'talents' && <TalentPyramidEditor hero={selectedHero} />}
              {activeTab === 'skills' && <SkillRankEditor hero={selectedHero} />}
              {activeTab === 'specializations' && <SpecializationPanel hero={selectedHero} />}
              {activeTab === 'equipment' && <EquipmentPanel hero={selectedHero} />}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: '#666', fontSize: '16px' }}>Select a hero to begin</div>
          </div>
        )}
      </div>
    )
  }

  // --- Desktop layout (unchanged) ---
  const containerStyle: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '2px solid #333355',
    backgroundColor: '#131320',
    flexShrink: 0,
  }

  const bodyStyle: React.CSSProperties = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  }

  const mainStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0',
    borderBottom: '2px solid #333355',
    backgroundColor: '#131320',
    flexShrink: 0,
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '10px 24px',
    fontSize: '13px',
    fontWeight: isActive ? 'bold' : 'normal',
    color: isActive ? '#bb99ff' : '#888',
    backgroundColor: isActive ? '#1a1a2e' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #bb99ff' : '2px solid transparent',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    transition: 'all 0.2s',
  })

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#bb99ff', margin: 0, fontSize: '20px' }}>Hero Advancement</h1>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
            Spend XP to upgrade talents, skills, and specializations. Manage equipment loadouts.
          </div>
        </div>
        <button
          style={{ ...buttonStyle, backgroundColor: '#2a2a3a', color: '#bb99ff' }}
          onClick={closeHeroProgression}
        >
          Back to HQ
        </button>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {/* Sidebar */}
        <HeroProgressionSidebar
          heroes={heroes}
          selectedHeroId={selectedHeroId}
          onSelectHero={setSelectedHeroId}
        />

        {/* Main Content */}
        <div style={mainStyle}>
          {selectedHero ? (
            <>
              {/* Tab Bar */}
              <div style={tabBarStyle}>
                <button style={tabStyle(activeTab === 'talents')} onClick={() => setActiveTab('talents')}>
                  Talents
                </button>
                <button style={tabStyle(activeTab === 'skills')} onClick={() => setActiveTab('skills')}>
                  Skills
                </button>
                <button style={tabStyle(activeTab === 'specializations')} onClick={() => setActiveTab('specializations')}>
                  Specializations
                </button>
                <button style={tabStyle(activeTab === 'equipment')} onClick={() => setActiveTab('equipment')}>
                  Equipment
                </button>
              </div>

              {/* Tab Content */}
              <div style={contentStyle}>
                {activeTab === 'talents' && (
                  <TalentPyramidEditor hero={selectedHero} />
                )}
                {activeTab === 'skills' && (
                  <SkillRankEditor hero={selectedHero} />
                )}
                {activeTab === 'specializations' && (
                  <SpecializationPanel hero={selectedHero} />
                )}
                {activeTab === 'equipment' && (
                  <EquipmentPanel hero={selectedHero} />
                )}
              </div>
            </>
          ) : (
            <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: '#666', fontSize: '16px' }}>Select a hero to begin</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

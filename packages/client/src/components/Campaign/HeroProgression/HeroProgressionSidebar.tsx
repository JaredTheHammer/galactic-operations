import React from 'react'
import type { HeroCharacter } from '@engine/types.js'
import { useGameStore } from '../../../store/game-store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { HeroPortrait } from '../../Portrait/HeroPortrait'

interface HeroProgressionSidebarProps {
  heroes: HeroCharacter[]
  selectedHeroId: string | null
  onSelectHero: (heroId: string) => void
}

export const HeroProgressionSidebar: React.FC<HeroProgressionSidebarProps> = ({
  heroes,
  selectedHeroId,
  onSelectHero,
}) => {
  const gameData = useGameStore(s => s.gameData)
  const { isMobile } = useIsMobile()

  if (isMobile) return null

  const sidebarStyle: React.CSSProperties = {
    width: '250px',
    flexShrink: 0,
    backgroundColor: '#131320',
    borderRight: '2px solid #333355',
    overflowY: 'auto',
    padding: '12px',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: '10px',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
    padding: '0 4px',
  }

  return (
    <div style={sidebarStyle}>
      <div style={sectionLabel}>Hero Roster</div>
      {heroes.map(hero => {
        const isSelected = hero.id === selectedHeroId
        const hasXP = hero.xp.available > 0
        const specName = gameData?.specializations[hero.specializations[0]]?.name ?? hero.specializations[0]
        const speciesName = gameData?.species[hero.species]?.name ?? hero.species

        const cardStyle: React.CSSProperties = {
          padding: '10px 12px',
          marginBottom: '6px',
          borderRadius: '6px',
          border: isSelected ? '2px solid #bb99ff' : '2px solid transparent',
          backgroundColor: isSelected ? '#1a1a2e' : '#0f0f1a',
          cursor: 'pointer',
          opacity: hasXP ? 1 : 0.6,
          transition: 'all 0.2s',
        }

        const nameStyle: React.CSSProperties = {
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#ffffff',
          marginBottom: '2px',
        }

        const subStyle: React.CSSProperties = {
          fontSize: '11px',
          color: '#888',
        }

        const xpBadgeStyle: React.CSSProperties = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '6px',
          padding: '3px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: 'bold',
          backgroundColor: hasXP ? '#2a1a3a' : '#1a1a1a',
          color: hasXP ? '#bb99ff' : '#666',
          border: `1px solid ${hasXP ? '#553388' : '#333'}`,
        }

        const woundBadgeStyle: React.CSSProperties = {
          display: 'inline-block',
          marginLeft: '6px',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '10px',
          fontWeight: 'bold',
          backgroundColor: '#3a1a1a',
          color: '#ff4444',
          border: '1px solid #552222',
        }

        return (
          <div
            key={hero.id}
            style={cardStyle}
            onClick={() => onSelectHero(hero.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={28} accentColor={isSelected ? '#bb99ff' : '#374151'} />
              <div>
                <div style={nameStyle}>{hero.name}</div>
                <div style={subStyle}>
                  {speciesName} {specName}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={xpBadgeStyle}>
                XP: {hero.xp.available} / {hero.xp.total}
              </span>
              {hero.isWounded && (
                <span style={woundBadgeStyle}>WOUNDED</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

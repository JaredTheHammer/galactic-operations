import React from 'react'
import type { HeroCharacter, SpecializationDefinition } from '@engine/types.js'
import { useGameStore } from '../../../store/game-store'

interface SpecializationPanelProps {
  hero: HeroCharacter
}

export const SpecializationPanel: React.FC<SpecializationPanelProps> = ({ hero }) => {
  const { gameData, unlockHeroSpecialization } = useGameStore()

  if (!gameData) return null

  const career = gameData.careers[hero.career]
  const careerName = career?.name ?? hero.career

  // Current specializations
  const currentSpecs: SpecializationDefinition[] = hero.specializations
    .map(specId => gameData.specializations[specId])
    .filter(Boolean)

  // Available specializations to unlock
  const allSpecIds = Object.keys(gameData.specializations)
  const unlockedSet = new Set(hero.specializations)
  const inCareerSpecs: SpecializationDefinition[] = []
  const outOfCareerSpecs: SpecializationDefinition[] = []

  for (const specId of allSpecIds) {
    if (unlockedSet.has(specId)) continue
    const spec = gameData.specializations[specId]
    if (!spec) continue
    if (career?.specializations.includes(specId)) {
      inCareerSpecs.push(spec)
    } else {
      outOfCareerSpecs.push(spec)
    }
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: '700px',
    margin: '0 auto',
  }

  const xpSummaryStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#131320',
    borderRadius: '8px',
    border: '1px solid #333355',
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: '24px',
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#bb99ff',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
    paddingBottom: '6px',
    borderBottom: '1px solid #333355',
  }

  function renderCurrentSpec(spec: SpecializationDefinition, index: number) {
    return (
      <div key={spec.id} style={{
        padding: '12px',
        backgroundColor: '#1a1a2e',
        borderRadius: '6px',
        border: index === 0 ? '2px solid #bb99ff' : '2px solid #333355',
        marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{spec.name}</span>
          {index === 0 && (
            <span style={{
              fontSize: '9px',
              color: '#bb99ff',
              padding: '2px 6px',
              backgroundColor: '#2a1a3a',
              borderRadius: '3px',
            }}>
              PRIMARY
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
          {spec.description}
        </div>
        <div style={{ marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>
            Bonus Career Skills:{' '}
          </span>
          <span style={{ fontSize: '11px', color: '#aaa' }}>
            {spec.bonusCareerSkills.join(', ')}
          </span>
        </div>
        <div style={{ marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>
            Talents:{' '}
          </span>
          <span style={{ fontSize: '11px', color: '#aaa' }}>
            {spec.talents.length} cards available
          </span>
        </div>
      </div>
    )
  }

  function renderAvailableSpec(spec: SpecializationDefinition, isInCareer: boolean) {
    const cost = isInCareer ? 10 : 20
    const canUnlock = hero.xp.available >= cost

    return (
      <div key={spec.id} style={{
        padding: '12px',
        backgroundColor: '#0f0f1a',
        borderRadius: '6px',
        border: '2px solid #222',
        marginBottom: '8px',
        opacity: canUnlock ? 1 : 0.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{spec.name}</span>
              <span style={{
                fontSize: '9px',
                color: isInCareer ? '#ffd700' : '#888',
                padding: '2px 6px',
                backgroundColor: isInCareer ? '#2a2a1a' : '#1a1a1a',
                borderRadius: '3px',
                border: `1px solid ${isInCareer ? '#554400' : '#333'}`,
              }}>
                {isInCareer ? 'IN-CAREER' : 'OUT-OF-CAREER'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {spec.description}
            </div>
            <div style={{ marginTop: '4px' }}>
              <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>
                Bonus Skills:{' '}
              </span>
              <span style={{ fontSize: '11px', color: '#aaa' }}>
                {spec.bonusCareerSkills.join(', ')}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginLeft: '16px', flexShrink: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: canUnlock ? '#bb99ff' : '#444' }}>
              {cost} XP
            </div>
            <button
              style={{
                padding: '5px 14px',
                fontSize: '11px',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '4px',
                cursor: canUnlock ? 'pointer' : 'default',
                backgroundColor: canUnlock ? '#2a1a3a' : '#1a1a1a',
                color: canUnlock ? '#bb99ff' : '#444',
                marginTop: '4px',
                transition: 'all 0.2s',
              }}
              disabled={!canUnlock}
              onClick={() => canUnlock && unlockHeroSpecialization(hero.id, spec.id)}
            >
              UNLOCK
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* XP Summary */}
      <div style={xpSummaryStyle}>
        <span style={{ color: '#bb99ff', fontSize: '18px', fontWeight: 'bold' }}>
          {hero.xp.available} XP
        </span>
        <span style={{ color: '#666', fontSize: '13px', marginLeft: '8px' }}>
          available ({hero.xp.total} total)
        </span>
      </div>

      {/* Current Specializations */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          Current Specializations ({careerName})
        </div>
        {currentSpecs.map((spec, i) => renderCurrentSpec(spec, i))}
      </div>

      {/* Available In-Career */}
      {inCareerSpecs.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            Available In-Career (10 XP)
          </div>
          {inCareerSpecs.map(spec => renderAvailableSpec(spec, true))}
        </div>
      )}

      {/* Available Out-of-Career */}
      {outOfCareerSpecs.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            Out-of-Career Specializations (20 XP)
          </div>
          {outOfCareerSpecs.map(spec => renderAvailableSpec(spec, false))}
        </div>
      )}

      {inCareerSpecs.length === 0 && outOfCareerSpecs.length === 0 && (
        <div style={{ textAlign: 'center', color: '#666', fontSize: '14px', padding: '20px' }}>
          All specializations have been unlocked.
        </div>
      )}
    </div>
  )
}

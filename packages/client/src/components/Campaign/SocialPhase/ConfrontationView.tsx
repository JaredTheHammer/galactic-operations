/**
 * ConfrontationView - UI for confronting the rival NPC during social phase.
 * Shows narrative intro, hero selection, dialogue skill choice, and result.
 */

import React, { useState, useMemo } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import type {
  CampaignState,
  HeroCharacter,
  RivalNPC,
  ConfrontationEncounter,
} from '../../../../../engine/src/types'
import { HeroPortrait } from '../../Portrait/HeroPortrait'

interface Props {
  encounter: ConfrontationEncounter
  rival: RivalNPC
  campaign: CampaignState
  onResolve: (heroId: string, skillId: string) => void
  onBack: () => void
}

const skillColors: Record<string, string> = {
  charm: '#ff69b4',
  negotiation: '#4a9eff',
  coercion: '#ff4444',
  deception: '#9966ff',
  leadership: '#ffd700',
  streetwise: '#ff8800',
}

const socialSkillCharacteristic: Record<string, keyof HeroCharacter['characteristics']> = {
  charm: 'presence',
  negotiation: 'presence',
  coercion: 'willpower',
  deception: 'cunning',
  leadership: 'presence',
  streetwise: 'cunning',
}

function computeHeroPool(hero: HeroCharacter, skillId: string): { ability: number; proficiency: number } {
  const charKey = socialSkillCharacteristic[skillId]
  if (!charKey) return { ability: 0, proficiency: 0 }
  let charValue = hero.characteristics[charKey]
  if (hero.isWounded) charValue = Math.max(1, charValue - 1)
  const skillRank = hero.skills[skillId] ?? 0
  const poolSize = Math.max(charValue, skillRank)
  const upgrades = Math.min(charValue, skillRank)
  return { ability: poolSize - upgrades, proficiency: upgrades }
}

export function ConfrontationView({ encounter, rival, campaign, onResolve, onBack }: Props) {
  const { isMobile } = useIsMobile()
  const heroes = useMemo(() => Object.values(campaign.heroes) as HeroCharacter[], [campaign.heroes])
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)

  const selectedHero = selectedHeroId ? campaign.heroes[selectedHeroId] : null
  const selectedOption = selectedOptionId
    ? encounter.dialogueOptions.find(o => o.id === selectedOptionId) ?? null
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderBottom: '1px solid #2a2a3f',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? '8px' : undefined,
      }}>
        <div>
          <h1 style={{ color: '#ff6644', margin: 0, fontSize: isMobile ? '16px' : '20px' }}>
            {encounter.name}
          </h1>
          <div style={{ color: '#ff8866', fontSize: '12px' }}>
            Rival: {rival.name}
          </div>
        </div>
        <button
          onClick={onBack}
          style={{
            padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px', border: '1px solid #555',
            cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px',
            backgroundColor: 'transparent', color: '#888',
          }}
        >
          BACK TO HUB
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden' }}>
        {/* Left: narrative + hero select */}
        <div style={{
          width: isMobile ? '100%' : '340px',
          borderRight: isMobile ? 'none' : '1px solid #2a2a3f',
          borderBottom: isMobile ? '1px solid #2a2a3f' : 'none',
          padding: isMobile ? '12px 16px' : '16px',
          overflowY: isMobile ? 'visible' : 'auto',
        }}>
          {/* Narrative intro */}
          <div style={{
            backgroundColor: '#1a0a0a', border: '1px solid #ff664440',
            borderLeft: '3px solid #ff6644', borderRadius: '8px',
            padding: isMobile ? '12px' : '16px', marginBottom: isMobile ? '16px' : '20px',
            fontStyle: 'italic', color: '#ccc', fontSize: '13px', lineHeight: '1.7',
          }}>
            {encounter.narrativeIntro}
          </div>

          {/* Cost warning */}
          <div style={{
            backgroundColor: '#1a1a0a', border: '1px solid #ff880040',
            borderRadius: '6px', padding: '8px 12px', marginBottom: '16px',
            fontSize: '11px', color: '#ff8800',
          }}>
            Costs 1 slot + 2 threat clock ticks. Opposed check vs rival's Discipline.
          </div>

          {/* Hero selector */}
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>
            Select a Hero
          </div>
          {heroes.map(hero => (
            <div
              key={hero.id}
              onClick={() => { setSelectedHeroId(hero.id); setSelectedOptionId(null) }}
              style={{
                backgroundColor: selectedHeroId === hero.id ? '#1a2a3f' : '#12121f',
                border: `1px solid ${selectedHeroId === hero.id ? '#4a9eff' : '#2a2a3f'}`,
                borderRadius: '8px', padding: '12px', marginBottom: '8px', cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => { if (selectedHeroId !== hero.id) e.currentTarget.style.borderColor = '#3a3a5f' }}
              onMouseLeave={e => { if (selectedHeroId !== hero.id) e.currentTarget.style.borderColor = '#2a2a3f' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={32} accentColor={selectedHeroId === hero.id ? '#4a9eff' : '#374151'} />
                <div>
                  <div style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                    {hero.species} {hero.career}
                  </div>
                </div>
              </div>
              {/* Relevant social skills */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                {encounter.dialogueOptions.map(opt => {
                  const rank = hero.skills[opt.skillId] ?? 0
                  const color = skillColors[opt.skillId] ?? '#888'
                  return (
                    <span key={opt.skillId} style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      backgroundColor: `${color}20`, color,
                    }}>
                      {opt.skillId} {rank}
                    </span>
                  )
                })}
              </div>
              {hero.isWounded && (
                <div style={{ fontSize: '10px', color: '#ff4444', marginTop: '4px' }}>WOUNDED (-1 all)</div>
              )}
            </div>
          ))}
        </div>

        {/* Right: dialogue options */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '24px', overflowY: isMobile ? 'visible' : 'auto' }}>
          <h2 style={{ color: '#ff6644', margin: '0 0 16px 0', fontSize: '18px' }}>
            Choose Your Approach
          </h2>

          {!selectedHero ? (
            <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
              Select a hero to see available approaches.
            </div>
          ) : (
            <>
              {encounter.dialogueOptions.map(option => {
                const isSelected = selectedOptionId === option.id
                const skillColor = skillColors[option.skillId] ?? '#888'
                const pool = computeHeroPool(selectedHero, option.skillId)

                return (
                  <div
                    key={option.id}
                    onClick={() => setSelectedOptionId(option.id)}
                    style={{
                      backgroundColor: isSelected ? '#1a0a0a' : '#12121f',
                      border: `1px solid ${isSelected ? '#ff6644' : '#2a2a3f'}`,
                      borderRadius: '8px', padding: '16px', marginBottom: '8px',
                      cursor: 'pointer', transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = '#3a3a5f' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = '#2a2a3f' }}
                  >
                    {/* Dialogue text */}
                    <div style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.6', marginBottom: '8px', fontStyle: 'italic' }}>
                      "{option.text}"
                    </div>

                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                      {option.description}
                    </div>

                    {/* Skill + dice pool */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: '4px',
                        backgroundColor: `${skillColor}20`, color: skillColor,
                      }}>
                        {option.skillId}
                      </span>

                      {/* Hero dice pool */}
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }} title={`${pool.proficiency}Y + ${pool.ability}G`}>
                        {Array.from({ length: pool.proficiency }).map((_, i) => (
                          <div key={`y-${i}`} style={{
                            width: '12px', height: '12px', borderRadius: '2px',
                            backgroundColor: '#ffd700', border: '1px solid #ccaa00',
                          }} />
                        ))}
                        {Array.from({ length: pool.ability }).map((_, i) => (
                          <div key={`g-${i}`} style={{
                            width: '12px', height: '12px', borderRadius: '2px',
                            backgroundColor: '#44cc44', border: '1px solid #339933',
                          }} />
                        ))}
                      </div>

                      <span style={{ color: '#555', fontSize: '12px' }}>vs</span>

                      <span style={{ fontSize: '10px', color: '#ffaa00', fontWeight: 'bold' }}>
                        OPPOSED (discipline)
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Resolve button */}
              {selectedOption && (
                <button
                  onClick={() => onResolve(selectedHero.id, selectedOption.skillId)}
                  style={{
                    padding: '14px 28px', borderRadius: '8px', border: 'none',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '16px',
                    backgroundColor: '#ff6644', color: '#fff', width: '100%',
                    marginTop: '16px', textShadow: '0 0 10px rgba(255, 102, 68, 0.5)',
                  }}
                >
                  CONFRONT {rival.name.toUpperCase()}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

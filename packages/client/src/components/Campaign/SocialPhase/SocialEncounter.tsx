/**
 * SocialEncounter - Encounter view with hero selection and dialogue options.
 */

import React, { useState, useMemo } from 'react'
import type {
  CampaignState,
  SocialEncounter as SocialEncounterType,
  SocialDialogueOption,
  SocialNPC,
  SocialCheckResult,
  SocialOutcome,
  HeroCharacter,
  Disposition,
} from '../../../../../engine/src/types'
import {
  getAvailableDialogueOptions,
  computeSocialDifficulty,
  resolveSocialCheck,
} from '../../../../../engine/src/social-phase'

interface Props {
  encounter: SocialEncounterType
  npc: SocialNPC
  campaign: CampaignState
  onCheckResolved: (result: SocialCheckResult, outcomes: SocialOutcome[], narrativeText: string) => void
  onBack: () => void
}

const dispositionColors: Record<Disposition, string> = {
  friendly: '#44ff44',
  neutral: '#888888',
  unfriendly: '#ffaa00',
  hostile: '#ff4444',
}

const skillColors: Record<string, string> = {
  charm: '#ff69b4',
  negotiation: '#4a9eff',
  coercion: '#ff4444',
  deception: '#9966ff',
  leadership: '#ffd700',
}

export function SocialEncounter({ encounter, npc, campaign, onCheckResolved, onBack }: Props) {
  const heroes = useMemo(() => Object.values(campaign.heroes) as HeroCharacter[], [campaign.heroes])
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)

  const selectedHero = selectedHeroId ? campaign.heroes[selectedHeroId] : null

  const availableOptions = useMemo(() => {
    if (!selectedHero) return []
    return getAvailableDialogueOptions(encounter, selectedHero, campaign)
  }, [encounter, selectedHero, campaign])

  const allOptions = encounter.dialogueOptions
  const selectedOption = selectedOptionId ? allOptions.find(o => o.id === selectedOptionId) ?? null : null

  const handleResolve = () => {
    if (!selectedHero || !selectedOption) return
    const { checkResult, outcomes, narrativeText } = resolveSocialCheck(selectedHero, selectedOption, npc)
    const result: SocialCheckResult = {
      encounterId: encounter.id,
      dialogueOptionId: selectedOption.id,
      heroId: selectedHero.id,
      skillUsed: selectedOption.skillId,
      isSuccess: checkResult.netSuccesses >= 1,
      netSuccesses: checkResult.netSuccesses,
      netAdvantages: checkResult.netAdvantages,
      triumphs: checkResult.triumphs,
      despairs: checkResult.despairs,
      outcomesApplied: outcomes,
      narrativeText,
    }
    onCheckResolved(result, outcomes, narrativeText)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #2a2a3f',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            backgroundColor: `${dispositionColors[npc.disposition]}20`,
            border: `2px solid ${dispositionColors[npc.disposition]}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', color: dispositionColors[npc.disposition], fontWeight: 'bold',
          }}>
            {npc.name[0]}
          </div>
          <div>
            <h1 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>{encounter.name}</h1>
            <div style={{ color: dispositionColors[npc.disposition], fontSize: '12px' }}>
              {npc.name} ({npc.disposition})
            </div>
          </div>
        </div>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px', borderRadius: '6px', border: '1px solid #555',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
            backgroundColor: 'transparent', color: '#888',
          }}
        >
          BACK TO HUB
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: narrative + hero select */}
        <div style={{ width: '340px', borderRight: '1px solid #2a2a3f', padding: '16px', overflowY: 'auto' }}>
          {/* Narrative intro */}
          <div style={{
            backgroundColor: '#12121f', border: '1px solid #2a2a3f',
            borderLeft: '3px solid #ffd700', borderRadius: '8px',
            padding: '16px', marginBottom: '20px',
            fontStyle: 'italic', color: '#ccc', fontSize: '13px', lineHeight: '1.6',
          }}>
            {encounter.narrativeIntro}
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
              <div style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                {hero.species} {hero.career} / {hero.specializations[0]}
              </div>
              {/* Social skill ranks */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                {(['charm', 'negotiation', 'coercion', 'deception', 'leadership'] as const).map(skill => {
                  const rank = hero.skills[skill] ?? 0
                  if (rank === 0) return null
                  return (
                    <span key={skill} style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      backgroundColor: `${skillColors[skill]}20`, color: skillColors[skill],
                    }}>
                      {skill} {rank}
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
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>
            Dialogue Options
          </h2>

          {!selectedHero ? (
            <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
              Select a hero to see available dialogue options.
            </div>
          ) : (
            <>
              {allOptions.map(option => {
                const isAvailable = availableOptions.some(o => o.id === option.id)
                const effectiveDiff = computeSocialDifficulty(option.difficulty, npc.disposition)
                const isSelected = selectedOptionId === option.id

                return (
                  <DialogueOptionCard
                    key={option.id}
                    option={option}
                    effectiveDifficulty={effectiveDiff}
                    isAvailable={isAvailable}
                    isSelected={isSelected}
                    npc={npc}
                    onClick={() => isAvailable && setSelectedOptionId(option.id)}
                  />
                )
              })}

              {/* Resolve button */}
              {selectedOption && (
                <button
                  onClick={handleResolve}
                  style={{
                    padding: '14px 28px', borderRadius: '8px', border: 'none',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '16px',
                    backgroundColor: '#4a9eff', color: '#fff', width: '100%',
                    marginTop: '16px', textShadow: '0 0 10px rgba(74, 158, 255, 0.5)',
                  }}
                >
                  ATTEMPT CHECK
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DialogueOptionCard({
  option,
  effectiveDifficulty,
  isAvailable,
  isSelected,
  npc,
  onClick,
}: {
  option: SocialDialogueOption
  effectiveDifficulty: number
  isAvailable: boolean
  isSelected: boolean
  npc: SocialNPC
  onClick: () => void
}) {
  const skillColor = skillColors[option.skillId] ?? '#888'
  const opacity = isAvailable ? 1 : 0.4

  return (
    <div
      onClick={isAvailable ? onClick : undefined}
      style={{
        backgroundColor: isSelected ? '#1a2a3f' : '#12121f',
        border: `1px solid ${isSelected ? '#4a9eff' : '#2a2a3f'}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '8px',
        opacity,
        cursor: isAvailable ? 'pointer' : 'not-allowed',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => { if (isAvailable && !isSelected) e.currentTarget.style.borderColor = '#3a3a5f' }}
      onMouseLeave={e => { if (isAvailable && !isSelected) e.currentTarget.style.borderColor = '#2a2a3f' }}
    >
      {/* Dialogue text */}
      <div style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.5', marginBottom: '12px', fontStyle: 'italic' }}>
        {option.text}
      </div>

      {/* Skill + difficulty row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Skill badge */}
        <span style={{
          fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: '4px',
          backgroundColor: `${skillColor}20`, color: skillColor,
        }}>
          {option.skillId}
        </span>

        {/* Difficulty dots */}
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          {Array.from({ length: effectiveDifficulty }).map((_, i) => (
            <div key={`d-${i}`} style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: '#9966ff',
            }} />
          ))}
          {option.challengeDice && Array.from({ length: option.challengeDice }).map((_, i) => (
            <div key={`c-${i}`} style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: '#ff4444',
            }} />
          ))}
        </div>

        {/* Opposed indicator */}
        {option.isOpposed && (
          <span style={{ fontSize: '10px', color: '#ffaa00' }}>
            Opposed ({option.opposedSkillId})
          </span>
        )}

        {/* Disposition modifier */}
        {npc.disposition !== 'neutral' && (
          <span style={{ fontSize: '10px', color: dispositionColors[npc.disposition] }}>
            {npc.disposition === 'friendly' ? '-1 diff' :
             npc.disposition === 'unfriendly' ? '+1 diff' :
             npc.disposition === 'hostile' ? '+2 diff' : ''}
          </span>
        )}
      </div>

      {/* Lock reason */}
      {!isAvailable && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#ff6644' }}>
          {option.requiresNarrativeItem && `Requires: ${option.requiresNarrativeItem}`}
          {option.requiresSkillRank && `Requires skill rank ${option.requiresSkillRank}+`}
        </div>
      )}
    </div>
  )
}

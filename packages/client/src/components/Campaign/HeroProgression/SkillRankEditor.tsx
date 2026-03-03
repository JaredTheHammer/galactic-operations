import React from 'react'
import type { HeroCharacter } from '@engine/types.js'
import { SKILL_LIST, skillRankXPCost, isCareerSkill } from '@engine/character-v2.js'
import { useGameStore } from '../../../store/game-store'

interface SkillRankEditorProps {
  hero: HeroCharacter
}

export const SkillRankEditor: React.FC<SkillRankEditorProps> = ({ hero }) => {
  const { gameData, purchaseHeroSkillRank } = useGameStore()

  if (!gameData) return null

  const combatSkills = SKILL_LIST.filter(s => s.type === 'combat')
  const generalSkills = SKILL_LIST.filter(s => s.type === 'general')

  const MAX_RANK = 5

  const containerStyle: React.CSSProperties = {
    maxWidth: '700px',
    margin: '0 auto',
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

  const xpSummaryStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#131320',
    borderRadius: '8px',
    border: '1px solid #333355',
  }

  function renderSkillRow(skill: typeof SKILL_LIST[number]) {
    const currentRank = hero.skills[skill.id] ?? 0
    const isCareer = isCareerSkill(skill.id, hero, gameData!)
    const newRank = currentRank + 1
    const cost = newRank <= MAX_RANK ? skillRankXPCost(newRank, isCareer) : 0
    const canPurchase = currentRank < MAX_RANK && hero.xp.available >= cost

    const rowStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      padding: '6px 8px',
      borderRadius: '4px',
      marginBottom: '2px',
      backgroundColor: '#0f0f1a',
      transition: 'background-color 0.15s',
    }

    const nameStyle: React.CSSProperties = {
      flex: 1,
      fontSize: '13px',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    }

    const charStyle: React.CSSProperties = {
      width: '70px',
      fontSize: '11px',
      color: '#888',
      textTransform: 'capitalize',
    }

    const pipsStyle: React.CSSProperties = {
      display: 'flex',
      gap: '3px',
      width: '90px',
    }

    const costStyle: React.CSSProperties = {
      width: '55px',
      fontSize: '11px',
      color: '#888',
      textAlign: 'right',
    }

    const buyBtnStyle: React.CSSProperties = {
      padding: '3px 10px',
      fontSize: '10px',
      fontWeight: 'bold',
      border: 'none',
      borderRadius: '3px',
      cursor: canPurchase ? 'pointer' : 'default',
      backgroundColor: canPurchase ? '#2a1a3a' : '#1a1a1a',
      color: canPurchase ? '#bb99ff' : '#444',
      opacity: canPurchase ? 1 : 0.5,
      marginLeft: '8px',
      transition: 'all 0.2s',
    }

    return (
      <div key={skill.id} style={rowStyle}>
        <div style={nameStyle}>
          {skill.name}
          {isCareer && (
            <span style={{
              fontSize: '10px',
              color: '#ffd700',
              padding: '1px 5px',
              backgroundColor: '#2a2a1a',
              borderRadius: '3px',
              border: '1px solid #554400',
            }}>
              Career
            </span>
          )}
        </div>
        <div style={charStyle}>{skill.characteristic}</div>
        <div style={pipsStyle}>
          {Array.from({ length: MAX_RANK }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid ' + (i < currentRank ? '#bb99ff' : '#333'),
                backgroundColor: i < currentRank ? '#bb99ff' : 'transparent',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>
        <div style={costStyle}>
          {currentRank < MAX_RANK ? `${cost} XP` : 'MAX'}
        </div>
        <button
          style={buyBtnStyle}
          disabled={!canPurchase}
          onClick={() => canPurchase && purchaseHeroSkillRank(hero.id, skill.id)}
        >
          {currentRank >= MAX_RANK ? '--' : 'BUY'}
        </button>
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

      {/* Cost Reference */}
      <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '11px', color: '#666' }}>
        Career skills: 5/10/15/20/25 XP per rank | Non-career: 10/15/20/25/30 XP per rank
      </div>

      {/* Combat Skills */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Combat Skills</div>
        {combatSkills.map(renderSkillRow)}
      </div>

      {/* General Skills */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>General Skills</div>
        {generalSkills.map(renderSkillRow)}
      </div>
    </div>
  )
}

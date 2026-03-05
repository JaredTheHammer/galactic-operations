/**
 * SkillsStep.tsx -- Career skill selection with toggle chips.
 * Each chip shows the skill name and current rank count.
 * Min 44px height for iOS tap target compliance.
 */

import React from 'react'
import { colors, wizardStyles as ws } from '../shared/wizardStyles'

interface SkillsStepProps {
  careerSkills: string[]
  selectedSkills: Record<string, number>
  onToggleSkill: (skillId: string) => void
  skillXPSpent: number
  xpRemaining: number
  isMobile: boolean
}

export default function SkillsStep({ careerSkills, selectedSkills, onToggleSkill, skillXPSpent, xpRemaining, isMobile }: SkillsStepProps) {
  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 4 } : {}),
      }}>Choose Starting Skills</h3>
      <div style={{
        ...ws.hint,
        fontSize: isMobile ? 10 : 11,
        marginBottom: isMobile ? 8 : 10,
      }}>
        Click to add ranks (max 2). Each rank costs 5 XP.
      </div>

      <div style={{
        ...ws.skillGrid,
        ...(isMobile ? { gap: 4 } : {}),
      }}>
        {careerSkills.map(skillId => {
          const rank = selectedSkills[skillId] ?? 0
          return (
            <div
              key={skillId}
              style={{
                ...ws.skillChip,
                backgroundColor: rank > 0 ? colors.successDim : colors.panel,
                borderColor: rank > 0 ? colors.success : colors.border,
                ...(isMobile ? { padding: '5px 8px', fontSize: 11 } : {}),
              }}
              onClick={() => onToggleSkill(skillId)}
            >
              {skillId}{' '}
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                {rank > 0 ? '\u25CF'.repeat(rank) + '\u25CB'.repeat(2 - rank) : '\u25CB\u25CB'}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 8, color: colors.textSecondary, fontSize: isMobile ? 11 : 13 }}>
        Skill XP spent: {skillXPSpent} | Remaining: {xpRemaining}
      </div>
    </div>
  )
}

/**
 * SpecializationStep.tsx -- Focused specialization selection.
 * Only 3 specs per career, so cards can be richer with description,
 * bonus skills, and talent tier preview.
 */

import React from 'react'
import type { CareerDefinition, SpecializationDefinition, TalentCard } from '@engine/types.js'
import { colors, wizardStyles as ws } from '../shared/wizardStyles'

type SpecWithTalents = SpecializationDefinition & { talents: TalentCard[] }

interface SpecializationStepProps {
  career: CareerDefinition
  specializations: Record<string, SpecWithTalents>
  selectedSpec: string | null
  onSelectSpec: (id: string) => void
  isMobile: boolean
}

// Talent tier colors for the dot preview
const TIER_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f97316', '#ef4444']

export default function SpecializationStep({ career, specializations, selectedSpec, onSelectSpec, isMobile }: SpecializationStepProps) {
  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 4 } : {}),
      }}>Choose Specialization</h3>
      <div style={{
        ...ws.hint,
        ...(isMobile ? { fontSize: 10, marginBottom: 8 } : {}),
      }}>for {career.name}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 8 }}>
        {career.specializations.map((specId: string) => {
          const specDef = specializations[specId]
          const isSelected = selectedSpec === specId
          const available = !!specDef
          const talents = specDef?.talents ?? []

          // Count talents per tier
          const tierCounts = [0, 0, 0, 0, 0]
          talents.forEach((t: TalentCard) => {
            if (t.tier >= 1 && t.tier <= 5) tierCounts[t.tier - 1]++
          })

          return (
            <div
              key={specId}
              style={{
                padding: isMobile ? '10px 12px' : '12px 16px',
                border: `2px solid ${isSelected ? colors.borderSelected : colors.border}`,
                borderRadius: 8,
                backgroundColor: isSelected ? colors.panelSelected : colors.panel,
                cursor: available ? 'pointer' : 'default',
                transition: 'border-color 0.15s, background-color 0.15s',
                opacity: available ? 1 : 0.5,
                ...(isSelected ? { borderLeftWidth: 4 } : {}),
              }}
              onClick={() => available && onSelectSpec(specId)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: isMobile ? 14 : 15,
                  color: colors.textBright,
                }}>
                  {specDef?.name ?? specId}
                  {!available && ' (Coming Soon)'}
                </span>
                {isSelected && (
                  <span style={{ color: colors.accent, fontSize: 16 }}>{'\u2713'}</span>
                )}
              </div>

              {specDef && (
                <>
                  <div style={{
                    fontSize: isMobile ? 11 : 12,
                    color: colors.textSecondary,
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}>{specDef.description}</div>

                  <div style={{
                    fontSize: isMobile ? 10 : 11,
                    color: colors.textMuted,
                    marginBottom: 6,
                  }}>
                    <strong style={{ color: colors.textSecondary }}>Bonus Skills:</strong>{' '}
                    {specDef.bonusCareerSkills.join(', ')}
                  </div>

                  {/* Talent tier preview dots */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: isMobile ? 10 : 11, color: colors.textMuted }}>
                      {talents.length} Talents
                    </span>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {tierCounts.map((count, tier) => (
                        count > 0 && (
                          <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <div style={{
                              width: isMobile ? 6 : 7,
                              height: isMobile ? 6 : 7,
                              borderRadius: '50%',
                              backgroundColor: TIER_COLORS[tier],
                            }} />
                            <span style={{ fontSize: 9, color: colors.textMuted }}>{count}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

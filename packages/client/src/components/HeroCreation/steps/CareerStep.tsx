/**
 * CareerStep.tsx -- Career selection with compact cards and detail panel.
 * Shows career cards with truncated descriptions.
 * Selected career expands a detail panel with full skills list.
 */

import React from 'react'
import type { CareerDefinition } from '@engine/types.js'
import { compactCardStyle, detailPanelStyle, colors, wizardStyles as ws } from '../shared/wizardStyles'

interface CareerStepProps {
  careerList: CareerDefinition[]
  selectedCareer: string | null
  onSelectCareer: (id: string) => void
  isMobile: boolean
}

export default function CareerStep({ careerList, selectedCareer, onSelectCareer, isMobile }: CareerStepProps) {
  const selected = careerList.find(c => c.id === selectedCareer)

  return (
    <div>
      <h3 style={{
        ...ws.sectionTitle,
        ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
      }}>Choose Career</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6 }}>
        {careerList.map(career => {
          const isSelected = selectedCareer === career.id
          return (
            <div
              key={career.id}
              style={compactCardStyle(isSelected)}
              onClick={() => onSelectCareer(career.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 'bold',
                  fontSize: isMobile ? 13 : 14,
                  color: colors.textBright,
                  marginBottom: 2,
                }}>{career.name}</div>
                <div style={{
                  fontSize: isMobile ? 10 : 11,
                  color: colors.textSecondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{career.description}</div>
              </div>
              {isSelected && (
                <span style={{ color: colors.accent, fontSize: 16, flexShrink: 0 }}>{'\u2713'}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail panel for selected career */}
      {selected && (
        <div style={detailPanelStyle}>
          <div style={{ marginBottom: 6, color: colors.textSecondary, fontSize: isMobile ? 11 : 12 }}>
            {selected.description}
          </div>
          <div style={{ fontSize: isMobile ? 10 : 11, color: colors.textMuted }}>
            <strong style={{ color: colors.textSecondary }}>Career Skills:</strong>{' '}
            {selected.careerSkills.join(', ')}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * StepIndicator.tsx -- Numbered circle stepper with connecting lines.
 * Shows completed steps with green checkmarks, current step in gold,
 * future steps as gray outlines. Completed steps are clickable.
 */

import React from 'react'
import { colors } from './wizardStyles'

interface StepIndicatorProps {
  steps: string[]
  labels: Record<string, string>
  currentStep: string
  onStepClick: (step: string) => void
  isMobile: boolean
}

type StepState = 'completed' | 'current' | 'future'

function circleStyle(state: StepState, isMobile: boolean): React.CSSProperties {
  const size = isMobile ? 22 : 26
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: isMobile ? 10 : 11,
    fontWeight: 'bold',
    flexShrink: 0,
    cursor: state === 'completed' ? 'pointer' : 'default',
    transition: 'background-color 0.2s, border-color 0.2s',
    ...(state === 'completed'
      ? { backgroundColor: colors.success, color: '#fff', border: 'none' }
      : state === 'current'
        ? { backgroundColor: colors.accent, color: '#000', border: 'none' }
        : { backgroundColor: 'transparent', border: `2px solid ${colors.border}`, color: colors.textMuted }),
  }
}

function connectorStyle(completed: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 2,
    backgroundColor: completed ? colors.success : colors.border,
    transition: 'background-color 0.2s',
  }
}

export default function StepIndicator({ steps, labels, currentStep, onStepClick, isMobile }: StepIndicatorProps) {
  const currentIdx = steps.indexOf(currentStep)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: isMobile ? '8px 10px 4px' : '10px 16px 6px',
      borderBottom: `1px solid ${colors.border}`,
    }}>
      {/* Circles + connectors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((s, i) => {
          const state: StepState = i < currentIdx ? 'completed' : i === currentIdx ? 'current' : 'future'
          return (
            <React.Fragment key={s}>
              <div
                style={circleStyle(state, isMobile)}
                onClick={() => state === 'completed' && onStepClick(s)}
                title={labels[s]}
              >
                {state === 'completed' ? '\u2713' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div style={connectorStyle(i < currentIdx)} />
              )}
            </React.Fragment>
          )
        })}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 3 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{
              width: isMobile ? 22 : 26,
              textAlign: 'center',
              fontSize: isMobile ? 8 : 9,
              color: i === currentIdx ? colors.accent : i < currentIdx ? colors.success : colors.textMuted,
              fontWeight: i === currentIdx ? 'bold' : 'normal',
              flexShrink: 0,
              letterSpacing: '-0.3px',
            }}>
              {labels[s]}
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1 }} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

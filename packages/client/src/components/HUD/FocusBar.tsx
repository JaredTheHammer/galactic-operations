/**
 * FocusBar - HUD component showing hero Focus resource and spend menu.
 *
 * Displays the current Focus pool as a segmented bar with a dropdown
 * menu for spending Focus on effects. Only shown for the currently
 * activating hero figure.
 *
 * Positioned above ActionButtons at bottom center.
 */

import React, { useState } from 'react'
import type { Figure, FocusEffect } from '@engine/types.js'
import { FOCUS_COSTS } from '@engine/types.js'
import {
  canSpendFocus,
  getAvailableFocusEffects,
  getFocusEffectLabel,
  hasFocusResource,
} from '@engine/focus-resource.js'
import { useGameStore } from '../../store/game-store'

interface FocusBarProps {
  figure: Figure | null
  compact?: boolean
}

export const FocusBar: React.FC<FocusBarProps> = ({ figure, compact = false }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const spendFocus = useGameStore(s => s.spendFocus)

  if (!figure || !hasFocusResource(figure)) return null

  const current = figure.focusCurrent ?? 0
  const max = figure.focusMax ?? 0
  const available = getAvailableFocusEffects(figure)

  const handleSpend = (effect: FocusEffect) => {
    spendFocus(effect)
    setMenuOpen(false)
  }

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
        <span style={{ color: '#aa88ff', fontWeight: 'bold' }}>{current}</span>
        <div style={{ display: 'flex', gap: '1px' }}>
          {Array.from({ length: max }, (_, i) => (
            <div
              key={i}
              style={{
                width: '5px',
                height: '8px',
                backgroundColor: i < current ? '#aa88ff' : '#2a2a3e',
                borderRadius: '1px',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '90px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(19, 19, 32, 0.92)',
    border: '1px solid #aa88ff',
    borderRadius: '6px',
    padding: '6px 12px',
    zIndex: 89,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#aa88ff',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
  }

  const segmentContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '2px',
  }

  const buttonStyle: React.CSSProperties = {
    backgroundColor: available.length > 0 ? '#aa88ff' : '#444466',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 'bold',
    cursor: available.length > 0 ? 'pointer' : 'not-allowed',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '4px',
    backgroundColor: 'rgba(19, 19, 32, 0.96)',
    border: '1px solid #aa88ff',
    borderRadius: '6px',
    padding: '4px',
    zIndex: 91,
    minWidth: '180px',
    backdropFilter: 'blur(8px)',
  }

  // Active Focus effect indicators
  const activeEffects: string[] = []
  if (figure.focusBonusMove) activeEffects.push('+2 Spd')
  if (figure.focusBonusDamage) activeEffects.push('+3 Dmg')
  if (figure.focusBonusDefense) activeEffects.push('+1 Def')

  return (
    <div style={{ ...containerStyle, position: 'fixed' }}>
      <span style={labelStyle}>Focus</span>
      <div style={segmentContainerStyle}>
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            style={{
              width: '10px',
              height: '14px',
              backgroundColor: i < current ? '#aa88ff' : '#2a2a3e',
              border: '1px solid #6644aa',
              borderRadius: '2px',
              transition: 'background-color 0.2s ease',
            }}
          />
        ))}
      </div>
      <span style={{ color: '#ccaaff', fontSize: '10px' }}>{current}/{max}</span>

      {activeEffects.length > 0 && (
        <div style={{ display: 'flex', gap: '3px' }}>
          {activeEffects.map((eff, i) => (
            <span key={i} style={{
              backgroundColor: '#6644aa',
              color: '#ffffff',
              padding: '1px 4px',
              borderRadius: '3px',
              fontSize: '9px',
              fontWeight: 'bold',
            }}>
              {eff}
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <button
          style={buttonStyle}
          onClick={() => available.length > 0 && setMenuOpen(!menuOpen)}
          disabled={available.length === 0}
        >
          Spend
        </button>

        {menuOpen && (
          <div style={menuStyle}>
            {(['bonus_move', 'bonus_aim', 'bonus_damage', 'bonus_defense', 'recover_strain', 'shake_condition'] as FocusEffect[]).map(effect => {
              const affordable = canSpendFocus(figure, effect)
              const cost = FOCUS_COSTS[effect]

              const itemStyle: React.CSSProperties = {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: affordable ? 'pointer' : 'not-allowed',
                color: affordable ? '#ffffff' : '#666666',
                backgroundColor: affordable ? 'transparent' : 'transparent',
                fontSize: '11px',
                transition: 'background-color 0.1s ease',
              }

              return (
                <div
                  key={effect}
                  style={itemStyle}
                  onClick={() => affordable && handleSpend(effect)}
                  onMouseEnter={(e) => {
                    if (affordable) (e.target as HTMLElement).style.backgroundColor = 'rgba(170, 136, 255, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = 'transparent'
                  }}
                >
                  <span>{getFocusEffectLabel(effect)}</span>
                  <span style={{
                    color: affordable ? '#aa88ff' : '#444444',
                    fontWeight: 'bold',
                    fontSize: '10px',
                  }}>
                    {cost}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

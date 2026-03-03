import React from 'react'
import { useGameStore } from '../../store/game-store'
import type { Figure } from '@engine/types.js'
import { getWoundThresholdV2 } from '@engine/turn-machine-v2.js'

interface ActionButtonsProps {
  selectedFigure: Figure | null
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ selectedFigure }) => {
  const {
    moveFigure, startAttack, rallyFigure, guardedStance, useTalent,
    endActivation, validMoves, validTargets, gameState, getActivatableTalents,
    aimFigure, dodgeFigure,
  } = useGameStore()

  if (!selectedFigure) return null

  const canMove = selectedFigure.maneuversRemaining > 0 && validMoves.length > 0
  const canAttack = selectedFigure.actionsRemaining > 0 && validTargets.length > 0
  const canRally = selectedFigure.actionsRemaining > 0 && selectedFigure.strainCurrent > 0
  const canGuardedStance = selectedFigure.actionsRemaining > 0
  const canAim = selectedFigure.actionsRemaining > 0 && selectedFigure.aimTokens < 2
  const canDodge = selectedFigure.actionsRemaining > 0 && selectedFigure.dodgeTokens < 1
  const canStrainForManeuver = !selectedFigure.hasUsedStrainForManeuver && selectedFigure.maneuversRemaining === 0

  const woundThreshold = gameState ? getWoundThresholdV2(selectedFigure, gameState) : 0

  // Get activatable talents for hero figures
  const activatableTalents = getActivatableTalents(selectedFigure)

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 100,
    backgroundColor: 'rgba(10, 10, 15, 0.9)',
    padding: '12px 20px',
    borderRadius: '8px',
    border: '2px solid #4a9eff',
    backdropFilter: 'blur(4px)',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '90vw',
  }

  const buttonStyle = (bgColor: string, disabled: boolean = false): React.CSSProperties => ({
    minWidth: '60px',
    minHeight: '44px',
    padding: '8px 16px',
    backgroundColor: disabled ? '#333333' : bgColor,
    color: disabled ? '#666666' : '#ffffff',
    border: `2px solid ${disabled ? '#555555' : bgColor}`,
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
  })

  const talentButtonStyle = (activation: string): React.CSSProperties => {
    const colors: Record<string, string> = {
      action: '#8b5cf6',
      maneuver: '#f59e0b',
      incidental: '#10b981',
    }
    const bgColor = colors[activation] ?? '#6366f1'
    return {
      ...buttonStyle(bgColor, false),
      minWidth: '50px',
      padding: '6px 10px',
      fontSize: '10px',
    }
  }

  return (
    <div style={containerStyle}>
      {/* Core actions */}
      <button
        style={buttonStyle('#4a9eff', !canMove)}
        onClick={() => {}}
        title="Move: Use valid move tiles (M)"
        disabled={!canMove}
      >
        <span>Move</span>
        <span style={{ fontSize: '10px', marginTop: '2px' }}>
          {validMoves.length}
        </span>
      </button>

      <button
        style={buttonStyle('#ff4444', !canAttack)}
        onClick={() => {}}
        title="Attack: Click target (A)"
        disabled={!canAttack}
      >
        <span>Atk</span>
        <span style={{ fontSize: '10px', marginTop: '2px' }}>
          {validTargets.length}
        </span>
      </button>

      <button
        style={buttonStyle('#c8a800', !canAim)}
        onClick={() => aimFigure()}
        title="Aim: Gain aim token (+1 die on next attack, max 2)"
        disabled={!canAim}
      >
        <span>Aim</span>
        {selectedFigure.aimTokens > 0 && (
          <span style={{ fontSize: '10px', marginTop: '2px' }}>
            {selectedFigure.aimTokens}/2
          </span>
        )}
      </button>

      <button
        style={buttonStyle('#44ff44', !canRally)}
        onClick={() => rallyFigure()}
        title="Rally: Recover strain (R)"
        disabled={!canRally}
      >
        <span>Rally</span>
      </button>

      <button
        style={buttonStyle('#3388dd', !canDodge)}
        onClick={() => dodgeFigure()}
        title="Dodge: Gain dodge token (cancel 1 hit when attacked)"
        disabled={!canDodge}
      >
        <span>Dodge</span>
        {selectedFigure.dodgeTokens > 0 && (
          <span style={{ fontSize: '10px', marginTop: '2px' }}>
            {selectedFigure.dodgeTokens}/1
          </span>
        )}
      </button>

      <button
        style={buttonStyle('#ffd700', !canGuardedStance)}
        onClick={() => guardedStance()}
        title="Standby: Set overwatch, interrupt enemy movement with attack"
        disabled={!canGuardedStance}
      >
        <span>Guard</span>
      </button>

      {/* Active Talent buttons (heroes only) */}
      {activatableTalents.length > 0 && (
        <>
          <div style={{
            width: '1px',
            height: '44px',
            backgroundColor: '#6366f1',
            margin: '0 4px',
          }} />
          {activatableTalents.map(talent => (
            <button
              key={talent.talentId}
              style={talentButtonStyle(talent.activation)}
              onClick={() => useTalent(talent.talentId)}
              title={`${talent.name} (${talent.activation})${talent.strainCost ? ` - ${talent.strainCost} strain` : ''}\n${talent.description}`}
            >
              <span>{talent.name.slice(0, 8)}</span>
              <span style={{ fontSize: '8px', marginTop: '1px', opacity: 0.7 }}>
                {talent.activation.slice(0, 3).toUpperCase()}
                {talent.strainCost ? ` ${talent.strainCost}s` : ''}
              </span>
            </button>
          ))}
        </>
      )}

      <button
        style={buttonStyle('#999999')}
        onClick={() => endActivation()}
        title="End Activation (E)"
      >
        <span>End</span>
      </button>

      {/* Status readout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: '12px',
          paddingLeft: '12px',
          borderLeft: '1px solid #4a9eff',
          fontSize: '11px',
          color: '#999999',
          minWidth: '180px',
          gap: '8px',
        }}
      >
        <span>
          A:{selectedFigure.actionsRemaining} M:{selectedFigure.maneuversRemaining}
        </span>
        <span style={{ color: '#ff4444' }}>
          W:{selectedFigure.woundsCurrent}/{woundThreshold}
        </span>
        <span style={{ color: '#ffd700' }}>
          S:{selectedFigure.strainCurrent}
        </span>
        {(selectedFigure.aimTokens > 0 || selectedFigure.dodgeTokens > 0 || selectedFigure.suppressionTokens > 0) && (
          <span style={{ borderLeft: '1px solid #555', paddingLeft: '8px', display: 'flex', gap: '6px' }}>
            {selectedFigure.aimTokens > 0 && (
              <span style={{ color: '#ffd700' }} title="Aim tokens">
                🎯{selectedFigure.aimTokens}
              </span>
            )}
            {selectedFigure.dodgeTokens > 0 && (
              <span style={{ color: '#4a9eff' }} title="Dodge tokens">
                🛡{selectedFigure.dodgeTokens}
              </span>
            )}
            {selectedFigure.suppressionTokens > 0 && (
              <span style={{ color: selectedFigure.suppressionTokens >= selectedFigure.courage ? '#ff4444' : '#ff8844' }} title="Suppression tokens">
                ⚡{selectedFigure.suppressionTokens}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

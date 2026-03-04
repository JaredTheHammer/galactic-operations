/**
 * FigureTooltip - Hover tooltip for figures on the tactical grid.
 *
 * Shows a compact stat summary (wounds, strain, conditions, tokens)
 * when hovering over any figure. Uses pointerEvents: 'none' so it
 * never interferes with canvas interactions.
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'
import { getWoundThresholdV2 } from '@engine/turn-machine-v2.js'
import type { Figure, GameState, GridCoordinate, RangeBand } from '@engine/types.js'

function getDistance(a: GridCoordinate, b: GridCoordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function distToRangeBand(dist: number): RangeBand {
  if (dist <= 1) return 'Engaged'
  if (dist <= 4) return 'Short'
  if (dist <= 8) return 'Medium'
  if (dist <= 16) return 'Long'
  return 'Extreme'
}

const RANGE_COLORS: Record<string, string> = {
  Engaged: '#44ff44',
  Short: '#88cc44',
  Medium: '#ccaa00',
  Long: '#ff8844',
  Extreme: '#ff4444',
}

function getCoverAtPosition(pos: GridCoordinate, gs: GameState): string | null {
  const tile = gs.map.tiles[pos.y]?.[pos.x]
  if (!tile) return null
  if (tile.terrain === 'HeavyCover') return 'Heavy Cover'
  if (tile.terrain === 'LightCover') return 'Light Cover'
  return null
}

export const FigureTooltip: React.FC = () => {
  const hoveredFigureId = useGameStore(s => s.hoveredFigureId)
  const figureTooltipPos = useGameStore(s => s.figureTooltipPos)
  const gameState = useGameStore(s => s.gameState)
  const selectedFigureId = useGameStore(s => s.selectedFigureId)
  const validTargets = useGameStore(s => s.validTargets)

  // Don't show tooltip for the already-selected figure (InfoPanel covers it)
  if (!hoveredFigureId || !figureTooltipPos || !gameState) return null
  if (hoveredFigureId === selectedFigureId) return null

  const figure = gameState.figures.find(f => f.id === hoveredFigureId)
  if (!figure) return null

  const woundThreshold = getWoundThresholdV2(figure, gameState)
  const isHero = figure.entityType === 'hero'
  const hero = isHero ? gameState.heroes?.[figure.entityId] : null
  const npc = !isHero ? gameState.npcProfiles?.[figure.entityId] : null

  // Display name
  const displayName = isHero
    ? (hero?.name ?? figure.entityId)
    : (npc?.displayName ?? npc?.name ?? figure.entityId)

  // Strain threshold
  const strainThreshold = isHero
    ? (hero?.strain?.threshold ?? 0)
    : (npc?.strainThreshold ?? 0)

  // NPC tier label
  const tierLabel = npc?.tier ? npc.tier.charAt(0).toUpperCase() + npc.tier.slice(1) : null

  // Faction color
  const isPlayerControlled = figure.playerId === 0
  const borderColor = isPlayerControlled ? '#4a9eff' : '#ff4444'

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${figureTooltipPos.x + 14}px`,
    top: `${figureTooltipPos.y + 14}px`,
    backgroundColor: 'rgba(14, 14, 24, 0.96)',
    border: `1px solid ${borderColor}`,
    borderRadius: '6px',
    padding: '8px 10px',
    maxWidth: '220px',
    zIndex: 160,
    backdropFilter: 'blur(6px)',
    color: '#ffffff',
    fontSize: '11px',
    pointerEvents: 'none',
    lineHeight: '1.4',
  }

  const woundPct = woundThreshold > 0
    ? ((woundThreshold - figure.woundsCurrent) / woundThreshold) * 100
    : 100
  const woundColor = woundPct > 50 ? '#44ff44' : woundPct > 25 ? '#ffaa00' : '#ff4444'

  return (
    <div style={tooltipStyle}>
      {/* Name + tier */}
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: borderColor, marginBottom: '4px' }}>
        {displayName}
        {tierLabel && (
          <span style={{ fontSize: '9px', color: '#999999', marginLeft: '6px', fontWeight: 'normal' }}>
            {tierLabel}
          </span>
        )}
      </div>

      {/* Wounds bar */}
      <div style={{ marginBottom: '3px' }}>
        <span style={{ color: '#999999' }}>HP: </span>
        <span style={{ color: woundColor }}>
          {woundThreshold - figure.woundsCurrent}/{woundThreshold}
        </span>
        {figure.minionGroupSize != null && (
          <span style={{ color: '#999999', marginLeft: '6px' }}>
            ({figure.minionGroupSize}/{figure.minionGroupMax} models)
          </span>
        )}
      </div>

      {/* Strain (if applicable) */}
      {strainThreshold > 0 && (
        <div style={{ marginBottom: '3px' }}>
          <span style={{ color: '#999999' }}>Strain: </span>
          <span style={{ color: '#bb99ff' }}>
            {figure.strainCurrent}/{strainThreshold}
          </span>
        </div>
      )}

      {/* Tokens */}
      {(figure.aimTokens > 0 || figure.dodgeTokens > 0 || figure.suppressionTokens > 0 || figure.hasStandby) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
          {figure.aimTokens > 0 && (
            <span style={{ color: '#c8a800' }}>Aim x{figure.aimTokens}</span>
          )}
          {figure.dodgeTokens > 0 && (
            <span style={{ color: '#3388dd' }}>Dodge</span>
          )}
          {figure.hasStandby && (
            <span style={{ color: '#ffd700' }}>Standby</span>
          )}
          {figure.suppressionTokens > 0 && (
            <span style={{
              color: figure.suppressionTokens >= figure.courage * 2
                ? '#ff4444'
                : figure.suppressionTokens >= figure.courage
                  ? '#ff8844'
                  : '#ffaa66',
            }}>
              Supp x{figure.suppressionTokens}
            </span>
          )}
        </div>
      )}

      {/* Conditions */}
      {figure.conditions.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {figure.conditions.map(c => (
            <span key={c} style={{
              padding: '1px 5px',
              backgroundColor: 'rgba(255, 68, 68, 0.2)',
              border: '1px solid #ff444460',
              borderRadius: '3px',
              fontSize: '9px',
              color: '#ff8888',
            }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Attack preview when this figure is a valid target */}
      {validTargets.includes(hoveredFigureId) && selectedFigureId && (() => {
        const attacker = gameState.figures.find(f => f.id === selectedFigureId)
        if (!attacker) return null
        const dist = getDistance(attacker.position, figure.position)
        const rangeBand = distToRangeBand(dist)
        const cover = getCoverAtPosition(figure.position, gameState)
        const rangeColor = RANGE_COLORS[rangeBand] ?? '#ffffff'

        return (
          <div style={{
            marginTop: '5px',
            paddingTop: '5px',
            borderTop: '1px solid #333355',
            fontSize: '10px',
          }}>
            <div style={{ color: '#ff8888', fontWeight: 'bold', fontSize: '9px', letterSpacing: '1px', marginBottom: '3px' }}>
              TARGET
            </div>
            <div>
              <span style={{ color: '#999999' }}>Range: </span>
              <span style={{ color: rangeColor }}>{rangeBand}</span>
              <span style={{ color: '#666666' }}> ({dist} tiles)</span>
            </div>
            {cover && (
              <div>
                <span style={{ color: '#999999' }}>Cover: </span>
                <span style={{ color: '#44cc44' }}>{cover}</span>
              </div>
            )}
            {figure.dodgeTokens > 0 && (
              <div style={{ color: '#3388dd', fontSize: '9px', marginTop: '2px' }}>
                Dodge token will cancel hits
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

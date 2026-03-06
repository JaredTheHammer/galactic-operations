/**
 * TileTooltip - Shows terrain type, cover, and elevation when hovering
 * a tile on the tactical grid (only when no figure occupies that tile).
 */

import React from 'react'
import { useGameStore } from '../../store/game-store'

// ============================================================================
// Terrain info lookup
// ============================================================================

interface TerrainInfo {
  label: string
  color: string
  effect: string
}

const TERRAIN_INFO: Record<string, TerrainInfo> = {
  Open:       { label: 'Open Ground',    color: '#888',    effect: 'No modifier' },
  LightCover: { label: 'Light Cover',    color: '#b4c850', effect: '+1 defense die' },
  HeavyCover: { label: 'Heavy Cover',    color: '#64c864', effect: '+2 defense dice' },
  Wall:       { label: 'Wall',           color: '#6464a0', effect: 'Blocks movement and line of sight' },
  Difficult:  { label: 'Difficult',      color: '#c8b450', effect: '+1 movement cost per tile' },
  Elevated:   { label: 'Elevated',       color: '#8c78c8', effect: '+1 ranged defense, LoS advantage' },
  Door:       { label: 'Door',           color: '#5050a0', effect: 'Interact to open or close' },
  Impassable: { label: 'Impassable',     color: '#ff5050', effect: 'Cannot enter' },
}

const COVER_LABELS: Record<string, { label: string; color: string }> = {
  None:  { label: 'None',  color: '#666' },
  Light: { label: 'Light', color: '#b4c850' },
  Heavy: { label: 'Heavy', color: '#64c864' },
}

export const TileTooltip: React.FC = () => {
  const coord = useGameStore(s => s.hoveredTileCoord)
  const pos = useGameStore(s => s.tileTooltipPos)
  const gameState = useGameStore(s => s.gameState)

  if (!coord || !pos || !gameState?.map) return null

  const { map } = gameState
  if (coord.y < 0 || coord.y >= map.height || coord.x < 0 || coord.x >= map.width) return null

  const tile = map.tiles[coord.y][coord.x]
  const info = TERRAIN_INFO[tile.terrain] ?? TERRAIN_INFO.Open

  // Don't show tooltip for plain open ground with no cover and no elevation
  if (tile.terrain === 'Open' && tile.cover === 'None' && tile.elevation === 0) return null

  const coverInfo = COVER_LABELS[tile.cover] ?? COVER_LABELS.None
  const showCover = tile.cover !== 'None' && tile.terrain !== 'LightCover' && tile.terrain !== 'HeavyCover'

  // Position tooltip offset from cursor
  const left = pos.x + 16
  const top = pos.y - 10

  return (
    <div style={{
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: 200,
      backgroundColor: 'rgba(10, 10, 15, 0.95)',
      border: `1px solid ${info.color}60`,
      borderRadius: '5px',
      padding: '6px 10px',
      pointerEvents: 'none',
      maxWidth: '220px',
      backdropFilter: 'blur(4px)',
    }}>
      {/* Terrain type */}
      <div style={{
        fontSize: '11px',
        fontWeight: 'bold',
        color: info.color,
        marginBottom: '2px',
      }}>
        {info.label}
      </div>

      {/* Effect */}
      <div style={{
        fontSize: '10px',
        color: '#aaa',
        lineHeight: '1.3',
      }}>
        {info.effect}
      </div>

      {/* Extra cover info (when tile.cover differs from terrain) */}
      {showCover && (
        <div style={{
          fontSize: '10px',
          color: coverInfo.color,
          marginTop: '3px',
        }}>
          Cover: {coverInfo.label}
        </div>
      )}

      {/* Elevation */}
      {tile.elevation > 0 && (
        <div style={{
          fontSize: '10px',
          color: '#8c78c8',
          marginTop: '3px',
        }}>
          Elevation: {tile.elevation}
        </div>
      )}

      {/* Coordinates */}
      <div style={{
        fontSize: '9px',
        color: '#555',
        marginTop: '3px',
      }}>
        ({coord.x}, {coord.y})
      </div>
    </div>
  )
}

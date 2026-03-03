/**
 * CombatArenaWatch.tsx
 *
 * Visual replay viewer for a completed combat.
 * Renders an HTML canvas grid with animated figures,
 * attack lines, and movement paths, alongside a
 * scrolling combat log and transport controls.
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import type { CombatReplay, ReplayFigureSnapshot, ReplayFrame } from '../../../../engine/src/replay-combat.js'
import type { GridCoordinate, Tile } from '../../../../engine/src/types.js'
import { useReplayPlayer, type ReplaySpeed } from './useReplayPlayer'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePortraitStore } from '../../store/portrait-store'
import { getThumbnail } from '../../services'
import type { SilhouetteType } from '../../types/portrait'
import { drawSilhouetteOnContext, inferSilhouetteType } from '../../canvas/silhouettes'

// ============================================================================
// CONSTANTS
// ============================================================================

const TILE_SIZE = 32
const SPEED_OPTIONS: { value: ReplaySpeed; label: string }[] = [
  { value: 'slow',    label: 'Slow' },
  { value: 'normal',  label: 'Normal' },
  { value: 'fast',    label: 'Fast' },
  { value: 'instant', label: 'Instant' },
]

const TERRAIN_COLORS: Record<string, string> = {
  open:    '#1a1a2e',
  wall:    '#333355',
  cover:   '#2a2a4a',
  blocked: '#222233',
  door:    '#4a3a2a',
  crate:   '#3a3a3a',
}

const SIDE_COLORS = {
  A: { fill: '#ff4444', stroke: '#ff6666', text: '#ffcccc' },
  B: { fill: '#44cc44', stroke: '#66ff66', text: '#ccffcc' },
}

// ============================================================================
// CANVAS RENDERER
// ============================================================================

/** Infer a silhouette type from a replay figure's hint and entity type. */
function inferReplaySilhouette(fig: ReplayFigureSnapshot): SilhouetteType {
  // Use the baked silhouette hint keyword if available
  if (fig.silhouetteHint) {
    const inferred = inferSilhouetteType([fig.silhouetteHint])
    if (inferred !== 'infantry') return inferred
  }
  // Heroes default to officer
  if (fig.entityType === 'hero') return 'officer'
  return 'infantry'
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: ReplayFrame,
  tiles: Tile[][],
  arenaWidth: number,
  arenaHeight: number,
  portraitBitmaps?: Map<string, ImageBitmap>,
) {
  const w = arenaWidth * TILE_SIZE
  const h = arenaHeight * TILE_SIZE

  // Clear
  ctx.fillStyle = '#0a0a0f'
  ctx.fillRect(0, 0, w, h)

  // Draw tiles
  for (let y = 0; y < arenaHeight; y++) {
    for (let x = 0; x < arenaWidth; x++) {
      const tile = tiles[y]?.[x]
      const terrain = tile?.terrain ?? 'open'
      ctx.fillStyle = TERRAIN_COLORS[terrain] ?? TERRAIN_COLORS.open
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)

      // Grid lines
      ctx.strokeStyle = '#1f1f3a'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
    }
  }

  // Draw movement path
  if (frame.movePath && frame.movePath.length > 1) {
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    const first = frame.movePath[0]
    ctx.moveTo(first.x * TILE_SIZE + TILE_SIZE / 2, first.y * TILE_SIZE + TILE_SIZE / 2)
    for (let i = 1; i < frame.movePath.length; i++) {
      const p = frame.movePath[i]
      ctx.lineTo(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Draw attack line
  if (frame.attackLine) {
    const { from, to } = frame.attackLine
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 68, 68, 0.8)'
    ctx.lineWidth = 2
    ctx.moveTo(from.x * TILE_SIZE + TILE_SIZE / 2, from.y * TILE_SIZE + TILE_SIZE / 2)
    ctx.lineTo(to.x * TILE_SIZE + TILE_SIZE / 2, to.y * TILE_SIZE + TILE_SIZE / 2)
    ctx.stroke()

    // Attack reticle on target
    ctx.beginPath()
    ctx.arc(to.x * TILE_SIZE + TILE_SIZE / 2, to.y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2)
    ctx.strokeStyle = '#ff4444'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Draw figures
  for (const fig of frame.figures) {
    if (fig.isDefeated) continue

    const cx = fig.position.x * TILE_SIZE + TILE_SIZE / 2
    const cy = fig.position.y * TILE_SIZE + TILE_SIZE / 2
    const r = TILE_SIZE * 0.38
    const colors = SIDE_COLORS[fig.side]
    const isActive = fig.id === frame.executingFigureId
    const tokenDiam = r * 2

    // Check for portrait bitmap
    const bitmap = fig.portraitId ? portraitBitmaps?.get(fig.portraitId) : undefined

    if (bitmap) {
      // Draw portrait clipped to circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(bitmap, cx - r, cy - r, tokenDiam, tokenDiam)
      ctx.restore()
    } else {
      // Silhouette fallback at this small size (32px tiles)
      const silType = inferReplaySilhouette(fig)
      const silFill = fig.side === 'A' ? '#aa3333' : '#33aa33'
      const silBg = '#1a1a2e'
      drawSilhouetteOnContext(ctx, silType, cx, cy, tokenDiam, silFill, silBg)
    }

    // Side-colored border ring
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = isActive ? '#ffd700' : colors.stroke
    ctx.lineWidth = isActive ? 2.5 : 1.5
    ctx.stroke()

    // Active glow
    if (isActive) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }

    // Health bar
    const barW = TILE_SIZE * 0.7
    const barH = 3
    const barX = cx - barW / 2
    const barY = cy + r + 3
    const hpRatio = fig.woundThreshold > 0
      ? Math.max(0, 1 - fig.woundsCurrent / fig.woundThreshold)
      : 1

    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff4444'
    ctx.fillRect(barX, barY, barW * hpRatio, barH)
  }

  // Draw defeated markers (X)
  for (const fig of frame.figures) {
    if (!fig.isDefeated) continue
    const cx = fig.position.x * TILE_SIZE + TILE_SIZE / 2
    const cy = fig.position.y * TILE_SIZE + TILE_SIZE / 2
    const s = TILE_SIZE * 0.25

    ctx.strokeStyle = 'rgba(255, 68, 68, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - s, cy - s)
    ctx.lineTo(cx + s, cy + s)
    ctx.moveTo(cx + s, cy - s)
    ctx.lineTo(cx - s, cy + s)
    ctx.stroke()
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export interface CombatArenaWatchProps {
  replay: CombatReplay
  onBack: () => void
  onRunAgain: () => void
}

export function CombatArenaWatch({ replay, onBack, onRunAgain }: CombatArenaWatchProps) {
  const { isMobile } = useIsMobile()
  const [state, controls] = useReplayPlayer(replay)
  const [showLog, setShowLog] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const canvasWidth = replay.arenaWidth * TILE_SIZE
  const canvasHeight = replay.arenaHeight * TILE_SIZE

  // Hydrate portrait store on mount (lazy, idempotent)
  useEffect(() => {
    usePortraitStore.getState().hydrate()
  }, [])

  // Collect all unique portrait IDs from the replay and warm the cache
  useEffect(() => {
    const store = usePortraitStore.getState()
    const portraitIds = new Set<string>()

    for (const frame of replay.frames) {
      for (const fig of frame.figures) {
        if (fig.portraitId) portraitIds.add(fig.portraitId)
      }
    }

    // Fire-and-forget: load missing thumbnails from IndexedDB into LRU cache
    for (const pid of portraitIds) {
      if (!getThumbnail(pid)) {
        store.ensureThumbnail(pid).catch(() => {
          // Silently ignore -- portrait not in library
        })
      }
    }
  }, [replay])

  // Collect portrait bitmaps synchronously from cache for current frame
  const portraitBitmaps = useMemo(() => {
    const bitmaps = new Map<string, ImageBitmap>()
    for (const fig of state.currentFrame.figures) {
      if (fig.portraitId && !fig.isDefeated) {
        const cached = getThumbnail(fig.portraitId)
        if (cached) bitmaps.set(fig.portraitId, cached)
      }
    }
    return bitmaps
  }, [state.currentFrame])

  // Draw frame
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderFrame(ctx, state.currentFrame, replay.tiles, replay.arenaWidth, replay.arenaHeight, portraitBitmaps)
  }, [state.currentFrame, replay, portraitBitmaps])

  // Auto-scroll combat log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [state.currentFrameIndex])

  // Build combat log entries up to current frame
  const logEntries = useMemo(() => {
    return replay.frames
      .slice(0, state.currentFrameIndex + 1)
      .filter(f => f.actionText && f.actionText.length > 0)
      .map(f => ({
        text: f.actionText,
        isPhase: f.executingFigureId === null,
        isAttack: f.actionText.includes('attacks'),
        isDefeat: f.actionText.includes('defeated') || f.actionText.includes('DEFEATED'),
      }))
  }, [replay, state.currentFrameIndex])

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault()
          controls.togglePause()
          break
        case 'ArrowRight':
          controls.stepForward()
          break
        case 'ArrowLeft':
          controls.stepBack()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [controls])

  // Figure summary for header
  const frame = state.currentFrame
  const sideACounts = frame.figures.filter(f => f.side === 'A')
  const sideBCounts = frame.figures.filter(f => f.side === 'B')
  const sideAAlive = sideACounts.filter(f => !f.isDefeated).length
  const sideBAlive = sideBCounts.filter(f => !f.isDefeated).length

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{
        ...styles.header,
        ...(isMobile ? { padding: '6px 10px' } : {}),
      }}>
        <div style={{ ...styles.headerLeft, ...(isMobile ? { fontSize: '11px' } : {}) }}>
          <span style={{ color: '#ff4444', fontWeight: 'bold' }}>
            {replay.sideALabel} ({sideAAlive}/{sideACounts.length})
          </span>
        </div>
        <div style={styles.headerCenter}>
          <div style={{ ...styles.scenarioName, ...(isMobile ? { fontSize: '12px' } : {}) }}>
            {replay.scenarioName}
          </div>
          <div style={styles.roundLabel}>
            Round {frame.roundNumber} / {replay.totalRounds}
          </div>
        </div>
        <div style={{ ...styles.headerRight, ...(isMobile ? { fontSize: '11px' } : {}) }}>
          <span style={{ color: '#44ff44', fontWeight: 'bold' }}>
            {replay.sideBLabel} ({sideBAlive}/{sideBCounts.length})
          </span>
        </div>
        {isMobile && (
          <button
            style={{
              background: 'none',
              border: '1px solid #333355',
              color: showLog ? '#4a9eff' : '#ffd700',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
              marginLeft: '6px',
            }}
            onClick={() => setShowLog(p => !p)}
          >
            LOG
          </button>
        )}
      </div>

      {/* Main area: canvas + log */}
      <div style={{
        ...styles.mainArea,
        ...(isMobile ? { flexDirection: 'column' as const } : {}),
      }}>
        {/* Canvas */}
        <div style={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            style={{
              ...styles.canvas,
              maxWidth: '100%',
              maxHeight: isMobile ? '50vh' : '60vh',
            }}
          />
          {/* Action text overlay */}
          <div style={{
            ...styles.actionOverlay,
            ...(isMobile ? {
              whiteSpace: 'normal' as const,
              maxWidth: '90%',
              textAlign: 'center' as const,
              fontSize: '11px',
            } : {}),
          }}>
            {frame.actionText}
          </div>
        </div>

        {/* Combat Log - desktop: side panel; mobile: overlay toggled by LOG button */}
        {isMobile ? (
          showLog && (
            <div style={{
              position: 'fixed' as const,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              zIndex: 400,
              display: 'flex',
              flexDirection: 'column' as const,
            }}>
              <div style={{
                flex: 1,
                margin: '40px 16px 16px',
                backgroundColor: '#111827',
                borderRadius: '8px',
                border: '1px solid #333',
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom: '1px solid #333',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>
                    Combat Log
                  </span>
                  <button
                    onClick={() => setShowLog(false)}
                    style={{
                      background: 'none',
                      border: '1px solid #555',
                      color: '#ccc',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
                <div ref={logRef} style={styles.logScroll}>
                  {logEntries.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.logEntry,
                        color: entry.isDefeat ? '#ff4444'
                          : entry.isAttack ? '#ffaa00'
                          : entry.isPhase ? '#4a9eff'
                          : '#ccc',
                        fontWeight: entry.isPhase ? 'bold' : 'normal',
                        fontSize: entry.isPhase ? '11px' : '10px',
                      }}
                    >
                      {entry.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : (
          <div style={styles.logPanel}>
            <div style={styles.logTitle}>Combat Log</div>
            <div ref={logRef} style={styles.logScroll}>
              {logEntries.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.logEntry,
                    color: entry.isDefeat ? '#ff4444'
                      : entry.isAttack ? '#ffaa00'
                      : entry.isPhase ? '#4a9eff'
                      : '#ccc',
                    fontWeight: entry.isPhase ? 'bold' : 'normal',
                    fontSize: entry.isPhase ? '11px' : '10px',
                  }}
                >
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transport Controls */}
      <div style={{
        ...styles.controls,
        ...(isMobile ? { padding: '6px 10px', gap: '4px' } : {}),
      }}>
        <div style={styles.controlRow}>
          <button style={{
            ...styles.transportBtn,
            ...(isMobile ? { padding: '5px 10px', fontSize: '11px' } : {}),
          }} onClick={controls.stepBack}>Prev</button>
          <button
            style={{
              ...styles.transportBtn,
              backgroundColor: state.isPaused ? '#00cc66' : '#ffd700',
              color: '#000',
              fontWeight: 'bold',
              minWidth: isMobile ? '60px' : '80px',
              ...(isMobile ? { padding: '5px 10px', fontSize: '11px' } : {}),
            }}
            onClick={controls.togglePause}
          >
            {state.isFinished ? 'Replay' : state.isPaused ? 'Play' : 'Pause'}
          </button>
          <button style={{
            ...styles.transportBtn,
            ...(isMobile ? { padding: '5px 10px', fontSize: '11px' } : {}),
          }} onClick={controls.stepForward}>Next</button>
        </div>

        {/* Speed buttons */}
        <div style={styles.controlRow}>
          {SPEED_OPTIONS.map(s => (
            <button
              key={s.value}
              style={{
                ...styles.speedBtn,
                backgroundColor: state.speed === s.value ? '#4a9eff' : '#1a1a2e',
                color: state.speed === s.value ? '#fff' : '#888',
              }}
              onClick={() => controls.setSpeed(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Seek slider */}
        <div style={{ ...styles.controlRow, ...(isMobile ? { width: '100%' } : {}) }}>
          <span style={styles.frameLabel}>Frame</span>
          <input
            type="range"
            min={0}
            max={state.totalFrames - 1}
            value={state.currentFrameIndex}
            onChange={e => controls.seekTo(parseInt(e.target.value))}
            style={{ ...styles.slider, ...(isMobile ? { flex: 1, width: 'auto' } : {}) }}
          />
          <span style={styles.frameCounter}>
            {state.currentFrameIndex + 1}/{state.totalFrames}
          </span>
        </div>

        {/* Winner banner */}
        {state.isFinished && (
          <div style={{
            ...styles.winnerBanner,
            ...(isMobile ? { fontSize: '12px' } : {}),
          }}>
            {replay.winnerLabel} wins in {replay.totalRounds} rounds!
          </div>
        )}

        {/* Nav buttons */}
        <div style={{
          ...styles.controlRow,
          ...(isMobile ? { flexWrap: 'wrap' as const, justifyContent: 'center' } : {}),
        }}>
          <button style={{
            ...styles.navBtn,
            ...(isMobile ? { flex: 1 } : {}),
          }} onClick={onBack}>Back to Setup</button>
          <button style={{
            ...styles.navBtn,
            backgroundColor: '#333',
            ...(isMobile ? { flex: 1 } : {}),
          }} onClick={onRunAgain}>
            Run Again (New Seed)
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#111827',
    borderBottom: '1px solid #333',
  } as React.CSSProperties,

  headerLeft: { flex: 1, textAlign: 'left' as const, fontSize: '13px' } as React.CSSProperties,
  headerCenter: { flex: 2, textAlign: 'center' as const } as React.CSSProperties,
  headerRight: { flex: 1, textAlign: 'right' as const, fontSize: '13px' } as React.CSSProperties,

  scenarioName: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#ffd700',
  } as React.CSSProperties,

  roundLabel: {
    fontSize: '11px',
    color: '#999',
  } as React.CSSProperties,

  mainArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: '0px',
  } as React.CSSProperties,

  canvasContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    padding: '8px',
  } as React.CSSProperties,

  canvas: {
    borderRadius: '4px',
    border: '1px solid #333',
    imageRendering: 'pixelated' as any,
  } as React.CSSProperties,

  actionOverlay: {
    position: 'absolute' as const,
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#ffd700',
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  logPanel: {
    width: '260px',
    backgroundColor: '#111827',
    borderLeft: '1px solid #333',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,

  logTitle: {
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: '1px solid #333',
  } as React.CSSProperties,

  logScroll: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  } as React.CSSProperties,

  logEntry: {
    padding: '2px 0',
    fontSize: '10px',
    lineHeight: '1.4',
  } as React.CSSProperties,

  controls: {
    backgroundColor: '#111827',
    borderTop: '1px solid #333',
    padding: '8px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    alignItems: 'center',
  } as React.CSSProperties,

  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,

  transportBtn: {
    padding: '6px 16px',
    fontSize: '12px',
    backgroundColor: '#1a1a2e',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '4px',
    cursor: 'pointer',
  } as React.CSSProperties,

  speedBtn: {
    padding: '3px 10px',
    fontSize: '10px',
    border: '1px solid #333',
    borderRadius: '3px',
    cursor: 'pointer',
  } as React.CSSProperties,

  slider: {
    width: '200px',
    cursor: 'pointer',
  } as React.CSSProperties,

  frameLabel: {
    fontSize: '10px',
    color: '#888',
  } as React.CSSProperties,

  frameCounter: {
    fontSize: '10px',
    color: '#888',
    width: '60px',
  } as React.CSSProperties,

  winnerBanner: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#ffd700',
    textAlign: 'center' as const,
    padding: '4px',
  } as React.CSSProperties,

  navBtn: {
    padding: '6px 16px',
    fontSize: '11px',
    backgroundColor: '#1a1a2e',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '4px',
    cursor: 'pointer',
  } as React.CSSProperties,
}

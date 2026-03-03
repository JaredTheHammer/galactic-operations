/**
 * useReplayPlayer.ts
 *
 * React hook for driving animated playback of a CombatReplay.
 * Auto-advances frames on a timer, supports play/pause, step,
 * seek, and speed control.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { CombatReplay, ReplayFrame } from '../../../../engine/src/replay-combat.js'

export type ReplaySpeed = 'slow' | 'normal' | 'fast' | 'instant'

const SPEED_MS: Record<ReplaySpeed, number> = {
  slow:    1200,
  normal:  600,
  fast:    200,
  instant: 0,
}

export interface ReplayPlayerState {
  currentFrameIndex: number
  currentFrame: ReplayFrame
  isPaused: boolean
  isFinished: boolean
  speed: ReplaySpeed
  totalFrames: number
}

export interface ReplayPlayerControls {
  play: () => void
  pause: () => void
  togglePause: () => void
  stepForward: () => void
  stepBack: () => void
  seekTo: (frame: number) => void
  setSpeed: (speed: ReplaySpeed) => void
  restart: () => void
}

export function useReplayPlayer(replay: CombatReplay): [ReplayPlayerState, ReplayPlayerControls] {
  const [frameIndex, setFrameIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeedState] = useState<ReplaySpeed>('normal')

  const speedRef = useRef(speed)
  const isPausedRef = useRef(isPaused)
  const frameRef = useRef(frameIndex)

  // Keep refs in sync
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { frameRef.current = frameIndex }, [frameIndex])

  const totalFrames = replay.frames.length
  const isFinished = frameIndex >= totalFrames - 1

  // Auto-advance timer
  useEffect(() => {
    if (isPaused || isFinished) return

    const ms = SPEED_MS[speed]
    if (ms === 0) {
      // Instant: jump to end
      setFrameIndex(totalFrames - 1)
      return
    }

    const timer = setInterval(() => {
      setFrameIndex(prev => {
        if (prev >= totalFrames - 1) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, ms)

    return () => clearInterval(timer)
  }, [isPaused, isFinished, speed, totalFrames])

  // Controls
  const play = useCallback(() => {
    if (isFinished) setFrameIndex(0)
    setIsPaused(false)
  }, [isFinished])

  const pause = useCallback(() => setIsPaused(true), [])

  const togglePause = useCallback(() => {
    if (isFinished) {
      setFrameIndex(0)
      setIsPaused(false)
    } else {
      setIsPaused(prev => !prev)
    }
  }, [isFinished])

  const stepForward = useCallback(() => {
    setIsPaused(true)
    setFrameIndex(prev => Math.min(prev + 1, totalFrames - 1))
  }, [totalFrames])

  const stepBack = useCallback(() => {
    setIsPaused(true)
    setFrameIndex(prev => Math.max(prev - 1, 0))
  }, [])

  const seekTo = useCallback((frame: number) => {
    setFrameIndex(Math.max(0, Math.min(frame, totalFrames - 1)))
  }, [totalFrames])

  const setSpeed = useCallback((s: ReplaySpeed) => setSpeedState(s), [])

  const restart = useCallback(() => {
    setFrameIndex(0)
    setIsPaused(false)
  }, [])

  const state: ReplayPlayerState = {
    currentFrameIndex: frameIndex,
    currentFrame: replay.frames[frameIndex] ?? replay.frames[0],
    isPaused,
    isFinished,
    speed,
    totalFrames,
  }

  const controls: ReplayPlayerControls = {
    play, pause, togglePause,
    stepForward, stepBack, seekTo,
    setSpeed, restart,
  }

  return [state, controls]
}

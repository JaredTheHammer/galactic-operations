/**
 * CombatArena.tsx
 *
 * Top-level orchestrator for the Combat Arena feature.
 * State machine: 'setup' -> 'running' -> 'watching'
 *
 * - setup:    CombatForceBuilder (select forces + arena config)
 * - running:  Brief spinner while combat engine runs (~100ms)
 * - watching: CombatArenaWatch (visual replay playback)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { CombatForceBuilder, type ForceBuilderResult } from './CombatForceBuilder'
import { CombatArenaWatch } from './CombatArenaWatch'
import { useGameStore } from '../../store/game-store'
import type { CombatScenarioConfig } from '../../../../engine/src/ai/combat-simulator.js'
import type { CombatReplay } from '../../../../engine/src/replay-combat.js'
import type { GameData, BoardTemplate } from '../../../../engine/src/types.js'
import type { AIProfilesData } from '../../../../engine/src/ai/types.js'

type ArenaPhase = 'setup' | 'running' | 'watching'

export function CombatArena() {
  const [phase, setPhase] = useState<ArenaPhase>('setup')
  const [replay, setReplay] = useState<CombatReplay | null>(null)
  const [lastConfig, setLastConfig] = useState<{ scenario: CombatScenarioConfig; seed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const closeCombatArena = useGameStore(s => s.closeCombatArena)
  const gameData = useGameStore(s => s.getGameData())

  const handleStartCombat = useCallback((result: ForceBuilderResult) => {
    setLastConfig(result)
    setError(null)
    setPhase('running')
  }, [])

  const handleBack = useCallback(() => {
    closeCombatArena()
  }, [closeCombatArena])

  const handleBackToSetup = useCallback(() => {
    setPhase('setup')
    setReplay(null)
    setError(null)
  }, [])

  const handleRunAgain = useCallback(() => {
    if (lastConfig) {
      // Run again with a new random seed
      const newSeed = Math.floor(Math.random() * 999999) + 1
      setLastConfig({ ...lastConfig, seed: newSeed })
      setError(null)
      setPhase('running')
    }
  }, [lastConfig])

  // Run combat when entering 'running' phase
  // Uses dynamic import to avoid bundling engine code eagerly
  useEffect(() => {
    if (phase !== 'running' || !lastConfig || !gameData) return

    let cancelled = false

    const runCombat = async () => {
      try {
        // Dynamic imports to keep the bundle lean
        const [replayModule, decideModule, dataLoaderModule] = await Promise.all([
          import('../../../../engine/src/replay-combat.js'),
          import('../../../../engine/src/ai/decide-v2.js'),
          import('../../../../engine/src/data-loader.js'),
        ])

        // Load AI profiles and board templates
        const aiProfilesRaw = (await import('@data/ai-profiles.json')).default
        const profilesData = decideModule.loadAIProfiles(aiProfilesRaw)

        // Board templates
        const boardTemplateModules = await Promise.all([
          import('@data/boards/open-ground.json'),
          import('@data/boards/corridor-complex.json'),
          import('@data/boards/command-center.json'),
          import('@data/boards/storage-bay.json'),
          import('@data/boards/landing-pad.json'),
          import('@data/boards/barracks.json'),
        ])
        const boardTemplates = boardTemplateModules.map(m => m.default) as BoardTemplate[]

        if (cancelled) return

        // Run combat with replay recording
        const result = replayModule.runCombatWithReplay(
          lastConfig.scenario,
          gameData,
          profilesData,
          boardTemplates,
          lastConfig.seed,
        )

        if (cancelled) return

        setReplay(result)
        setPhase('watching')
      } catch (err) {
        if (cancelled) return
        console.error('Combat Arena error:', err)
        setError(err instanceof Error ? err.message : String(err))
        setPhase('setup')
      }
    }

    // Use requestAnimationFrame to let the spinner render before blocking
    const rafId = requestAnimationFrame(() => {
      // Use setTimeout(0) to ensure the spinner paints
      setTimeout(runCombat, 16)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [phase, lastConfig, gameData])

  // ─── Render ────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div style={containerStyle}>
        {error && (
          <div style={errorBannerStyle}>
            Combat failed: {error}
          </div>
        )}
        {gameData && (
          <CombatForceBuilder
            gameData={gameData}
            onStartCombat={handleStartCombat}
            onBack={handleBack}
          />
        )}
      </div>
    )
  }

  if (phase === 'running') {
    return (
      <div style={containerStyle}>
        <style>{`@keyframes arena-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={spinnerContainerStyle}>
          <div style={spinnerStyle} />
          <div style={spinnerTextStyle}>Running combat simulation...</div>
          <div style={spinnerSubtextStyle}>
            {lastConfig?.scenario.name ?? 'Combat'}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'watching' && replay) {
    return (
      <CombatArenaWatch
        replay={replay}
        onBack={handleBackToSetup}
        onRunAgain={handleRunAgain}
      />
    )
  }

  return null
}

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  overflow: 'auto',
}

const errorBannerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  padding: '12px 20px',
  backgroundColor: 'rgba(255, 50, 50, 0.9)',
  color: '#fff',
  fontSize: '13px',
  textAlign: 'center',
  zIndex: 1000,
}

const spinnerContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
}

const spinnerStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  border: '4px solid #1a1a2e',
  borderTop: '4px solid #ffd700',
  borderRadius: '50%',
  animation: 'arena-spin 0.8s linear infinite',
}

const spinnerTextStyle: React.CSSProperties = {
  color: '#ffd700',
  fontSize: '18px',
  fontWeight: 'bold',
}

const spinnerSubtextStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '13px',
}

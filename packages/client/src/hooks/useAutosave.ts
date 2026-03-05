/**
 * useAutosave - Periodically saves campaign state to localStorage.
 *
 * Saves every AUTOSAVE_INTERVAL_MS while a campaign is active.
 * Only writes when the campaign state has actually changed since the last save
 * (compared by missionsPlayed + credits + hero XP totals as a cheap dirty check).
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/game-store'

const AUTOSAVE_INTERVAL_MS = 60_000 // 1 minute

/** Cheap fingerprint of campaign state to detect changes */
function campaignFingerprint(): string {
  const cs = useGameStore.getState().campaignState
  if (!cs) return ''
  const heroXP = Object.values(cs.heroes).reduce(
    (sum, h: any) => sum + (h.xp?.total ?? 0),
    0
  )
  return `${cs.missionsPlayed}|${cs.credits}|${heroXP}|${cs.completedMissions.length}|${JSON.stringify(cs.factionReputation ?? {})}`
}

export function useAutosave() {
  const campaignState = useGameStore(s => s.campaignState)
  const lastFingerprint = useRef<string>('')

  useEffect(() => {
    if (!campaignState) {
      lastFingerprint.current = ''
      return
    }

    // Take initial fingerprint
    lastFingerprint.current = campaignFingerprint()

    const interval = setInterval(() => {
      const cs = useGameStore.getState().campaignState
      if (!cs) return

      const fp = campaignFingerprint()
      if (fp === lastFingerprint.current) return // No changes

      useGameStore.getState().saveCampaignToStorage()
      lastFingerprint.current = fp
    }, AUTOSAVE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [campaignState])
}

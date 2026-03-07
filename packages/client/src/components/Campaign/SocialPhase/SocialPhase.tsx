/**
 * SocialPhase - Top-level orchestrator for the between-mission social phase.
 * State machine: 'hub' | 'encounter' | 'check-result' | 'shop' | 'summary'
 *
 * Expansion: Manages time slots, rival NPC, threat clock, and bounty system
 * alongside the original encounter/shop/healing flows.
 */

import React, { useState, useMemo, useCallback } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { useGameStore } from '../../../store/game-store'
import type {
  CampaignState,
  SocialPhaseLocation,
  SocialEncounter,
  SocialNPC,
  SocialCheckResult,
  SocialOutcome,
  SocialPhaseState,
  RivalNPC,
  BountyContract,
  ConfrontationEncounter,
} from '../../../../../engine/src/types'
import {
  applySocialOutcomes,
  completeSocialPhase as finalizeSocialPhaseOld,
  initializeSocialPhase,
  spendSlot,
  acceptBounty as engineAcceptBounty,
  prepBounty as enginePrepBounty,
  scoutMission as engineScoutMission,
  confrontRival as engineConfrontRival,
  deployEarly as engineDeployEarly,
  finalizeExpandedSocialPhase,
  getEffectiveDisposition,
  isItemAvailable,
} from '../../../../../engine/src/social-phase'
import { recoverHero, MEDICAL_RECOVERY_COST } from '../../../../../engine/src/campaign-v2'
import act1HubData from '../../../../../../data/social/act1-hub.json'
import act2HubData from '../../../../../../data/social/act2-hub.json'
import act3HubData from '../../../../../../data/social/act3-hub.json'
import campaignData from '../../../../../../data/campaigns/tangrene-liberation.json'

interface SocialHubData {
  location: SocialPhaseLocation
  npcs: Record<string, SocialNPC>
}

const socialHubsByAct: Record<number, SocialHubData> = {
  1: act1HubData,
  2: act2HubData,
  3: act3HubData,
}
import { SocialHub } from './SocialHub'
import { SocialEncounter as SocialEncounterView } from './SocialEncounter'
import { SocialCheckResult as SocialCheckResultView } from './SocialCheckResult'
import { SocialShop } from './SocialShop'
import { SocialSummary } from './SocialSummary'
import { ConfrontationView } from './ConfrontationView'
import { ActionResultView } from './ActionResultView'
import type { ActionResultData } from './ActionResultView'

export type SocialView = 'hub' | 'encounter' | 'check-result' | 'shop' | 'summary' | 'confrontation' | 'action-result'

export interface SocialSessionState {
  completedEncounterIds: Set<string>
  encounterResults: SocialCheckResult[]
  purchaseHistory: Array<{ itemId: string; price: number }>
  salesHistory: Array<{ itemId: string; revenue: number }>
  healingCreditsSpent: number
  currentEncounter: SocialEncounter | null
  selectedHeroId: string | null
  lastCheckResult: SocialCheckResult | null
  lastOutcomes: SocialOutcome[] | null
  lastNarrativeText: string | null
  activeShopId: string | null
  lastActionResult: ActionResultData | null
}

const getContainerStyle = (isMobile: boolean): React.CSSProperties => ({
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#c0c0c0',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  overflow: isMobile ? 'auto' : 'hidden',
})

/** Load rival definition from campaign data */
function getRival(): RivalNPC | undefined {
  const raw = (campaignData as Record<string, unknown>).rival as RivalNPC | undefined
  return raw
}

/** Load bounties for a given act from campaign data */
function getBountiesForAct(act: number): BountyContract[] {
  const bounties = (campaignData as Record<string, unknown>).bounties as Record<string, BountyContract[]> | undefined
  if (!bounties) return []
  const key = `act${act}`
  return bounties[key] ?? []
}

export function SocialPhase() {
  const { isMobile } = useIsMobile()
  const { campaignState, closeSocialPhase, updateCampaignState } = useGameStore()
  const [view, setView] = useState<SocialView>('hub')
  const [session, setSession] = useState<SocialSessionState>(() => ({
    completedEncounterIds: new Set(),
    encounterResults: [],
    purchaseHistory: [],
    salesHistory: [],
    healingCreditsSpent: 0,
    currentEncounter: null,
    selectedHeroId: null,
    lastCheckResult: null,
    lastOutcomes: null,
    lastNarrativeText: null,
    activeShopId: null,
    lastActionResult: null,
  }))

  // Load location data based on current campaign act
  const currentAct = campaignState?.currentAct ?? 1
  const location = useMemo<SocialPhaseLocation>(() => {
    const raw = socialHubsByAct[currentAct] ?? socialHubsByAct[1]
    return raw.location
  }, [currentAct])

  const npcs = useMemo<Record<string, SocialNPC>>(() => {
    const raw = socialHubsByAct[currentAct] ?? socialHubsByAct[1]
    return raw.npcs
  }, [currentAct])

  // Expansion: rival and bounties
  const rival = useMemo(() => getRival(), [])
  const bounties = useMemo(() => getBountiesForAct(currentAct), [currentAct])

  // Initialize expanded social phase state
  const [phaseState, setPhaseState] = useState<SocialPhaseState>(() => {
    if (!campaignState) {
      return initializeSocialPhase({ credits: 0, completedMissions: [], narrativeItems: [], consumableInventory: {}, threatLevel: 0, threatMultiplier: 1, missionsPlayed: 0, currentAct: 1, heroes: {}, id: '', name: '', difficulty: 'standard', createdAt: '', lastPlayedAt: '', availableMissionIds: [] } as CampaignState, currentAct, bounties)
    }
    return initializeSocialPhase(campaignState, currentAct, bounties)
  })

  if (!campaignState) {
    return (
      <div style={getContainerStyle(isMobile)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#ff4444' }}>
          No campaign loaded.
        </div>
      </div>
    )
  }

  // Navigation callbacks
  const goToEncounter = useCallback((encounter: SocialEncounter) => {
    setSession(prev => ({ ...prev, currentEncounter: encounter, selectedHeroId: null }))
    setView('encounter')
  }, [])

  const goToShop = useCallback((shopId: string) => {
    setSession(prev => ({ ...prev, activeShopId: shopId }))
    setView('shop')
  }, [])

  const goToHub = useCallback(() => {
    setView('hub')
  }, [])

  const goToSummary = useCallback(() => {
    setView('summary')
  }, [])

  // When a social check resolves (spends a slot)
  const onCheckResolved = useCallback((
    result: SocialCheckResult,
    outcomes: SocialOutcome[],
    narrativeText: string,
  ) => {
    // Apply outcomes to campaign state
    const updated = applySocialOutcomes(campaignState, outcomes, result.heroId)
    updateCampaignState(updated)

    // Spend a slot for the encounter
    setPhaseState(prev => spendSlot(
      prev, 'encounter', result.encounterId, result.heroId,
      rival, location, npcs, narrativeText,
    ))

    // Record in session
    setSession(prev => ({
      ...prev,
      encounterResults: [...prev.encounterResults, result],
      completedEncounterIds: new Set([...prev.completedEncounterIds, result.encounterId]),
      lastCheckResult: result,
      lastOutcomes: outcomes,
      lastNarrativeText: narrativeText,
    }))
    setView('check-result')
  }, [campaignState, updateCampaignState, rival, location, npcs])

  // Purchase item (spends a slot on first purchase per shop visit)
  const onPurchase = useCallback((itemId: string, price: number, updatedCampaign: CampaignState) => {
    updateCampaignState(updatedCampaign)
    setSession(prev => ({
      ...prev,
      purchaseHistory: [...prev.purchaseHistory, { itemId, price }],
    }))
  }, [updateCampaignState])

  // Sell item
  const onSell = useCallback((itemId: string, revenue: number, updatedCampaign: CampaignState) => {
    updateCampaignState(updatedCampaign)
    setSession(prev => ({
      ...prev,
      salesHistory: [...prev.salesHistory, { itemId, revenue }],
    }))
  }, [updateCampaignState])

  // Enter shop (spends a slot)
  const onEnterShop = useCallback((shopId: string) => {
    setPhaseState(prev => spendSlot(
      prev, 'shop', shopId, undefined,
      rival, location, npcs, `Visited shop.`,
    ))
    goToShop(shopId)
  }, [rival, location, npcs, goToShop])

  // Heal hero (spends a slot for rest_recover)
  const onHealHero = useCallback((heroId: string) => {
    const result = recoverHero(campaignState, heroId)
    if (result) {
      updateCampaignState(result)
      setSession(prev => ({
        ...prev,
        healingCreditsSpent: prev.healingCreditsSpent + MEDICAL_RECOVERY_COST,
      }))
      setPhaseState(prev => spendSlot(
        prev, 'rest_recover', undefined, heroId,
        rival, location, npcs, `Healed ${campaignState.heroes[heroId]?.name ?? heroId}.`,
      ))
    }
  }, [campaignState, updateCampaignState, rival, location, npcs])

  // Accept a bounty (free action)
  const onAcceptBounty = useCallback((bountyId: string) => {
    setPhaseState(prev => {
      const result = engineAcceptBounty(prev, bountyId)
      return result ?? prev
    })
  }, [])

  // Prep a bounty (spends a slot)
  const onPrepBounty = useCallback((bountyId: string, heroId: string) => {
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const bounty = phaseState.availableBounties.find(b => b.id === bountyId)
    let prepSuccess = false
    let prepIntel: string | undefined
    let prepWeakened = false
    setPhaseState(prev => {
      const { state, prepResult } = enginePrepBounty(prev, bountyId, hero, rival, location, npcs)
      prepSuccess = prepResult.success
      prepIntel = prepResult.intelRevealed
      prepWeakened = prepResult.targetWeakened ?? false
      return state
    })
    setSession(prev => ({
      ...prev,
      lastActionResult: {
        actionType: 'scout_mission', // reuse scout_mission styling (purple)
        title: `Bounty Prep: ${bounty?.targetName ?? 'Target'}`,
        success: prepSuccess,
        narrativeText: prepSuccess
          ? (prepIntel ?? 'You gathered intel on the target.') + (prepWeakened ? ' Your preparation was so thorough that the target will be weakened when you encounter them.' : '')
          : `Your attempts to gather intelligence on ${bounty?.targetName ?? 'the target'} came up empty. The underworld contacts you approached had nothing useful to share.`,
      },
    }))
    setView('action-result')
  }, [campaignState, phaseState, rival, location, npcs])

  // Scout mission (spends a slot, shows result)
  const onScoutMission = useCallback((heroId: string) => {
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    let scoutSuccess = false
    let scoutDelta = 0
    setPhaseState(prev => {
      const { state, success, clockDelta } = engineScoutMission(prev, hero, rival, location, npcs)
      scoutSuccess = success
      scoutDelta = clockDelta
      return state
    })
    setSession(prev => ({
      ...prev,
      lastActionResult: {
        actionType: 'scout_mission',
        title: 'Scout Mission',
        success: scoutSuccess,
        narrativeText: scoutSuccess
          ? 'Your reconnaissance paid off. You identified patrol routes, supply lines, and weak points in the enemy perimeter. The threat clock has been reduced.'
          : 'Your scouting attempt was detected. Enemy patrols tightened security in response, making the next mission harder.',
        clockDelta: scoutDelta,
      },
    }))
    setView('action-result')
  }, [campaignState, rival, location, npcs])

  // Open confrontation encounter view
  const onConfrontRival = useCallback((_heroId: string) => {
    if (!rival) return
    const confrontEncounter = location.confrontationEncounter
    if (confrontEncounter) {
      setView('confrontation')
    } else {
      // Fallback: no encounter data, resolve directly with first hero
      const hero = campaignState.heroes[_heroId]
      if (!hero) return
      let confrontSuccess = false
      let confrontTriumph = false
      let confrontDespair = false
      setPhaseState(prev => {
        const { state, success, triumph, despair } = engineConfrontRival(prev, hero, rival, location, npcs)
        confrontSuccess = success
        confrontTriumph = triumph
        confrontDespair = despair
        return state
      })
      setSession(prev => ({
        ...prev,
        lastActionResult: {
          actionType: 'confrontation',
          title: `Confronting ${rival.name}`,
          success: confrontSuccess,
          triumph: confrontTriumph,
          despair: confrontDespair,
          narrativeText: confrontSuccess
            ? `You confronted ${rival.name} and forced them to back down.`
            : `Your confrontation with ${rival.name} failed. They seized the initiative.`,
        },
      }))
      setView('action-result')
    }
  }, [campaignState, rival, location, npcs])

  // Resolve confrontation encounter (from ConfrontationView)
  const onResolveConfrontation = useCallback((heroId: string, _skillId: string) => {
    if (!rival) return
    const hero = campaignState.heroes[heroId]
    if (!hero) return
    const confrontEncounter = location.confrontationEncounter
    let confrontSuccess = false
    let confrontTriumph = false
    let confrontDespair = false
    setPhaseState(prev => {
      const { state, success, triumph, despair } = engineConfrontRival(prev, hero, rival, location, npcs)
      confrontSuccess = success
      confrontTriumph = triumph
      confrontDespair = despair
      return state
    })

    let narrativeText: string
    if (confrontEncounter) {
      narrativeText = confrontSuccess
        ? confrontEncounter.successNarrative
        : confrontDespair
          ? confrontEncounter.despairNarrative
          : confrontEncounter.failureNarrative
    } else {
      narrativeText = confrontSuccess
        ? `You confronted ${rival.name} and forced them to back down.`
        : `Your confrontation with ${rival.name} failed.`
    }

    setSession(prev => ({
      ...prev,
      lastActionResult: {
        actionType: 'confrontation',
        title: confrontEncounter?.name ?? `Confronting ${rival.name}`,
        success: confrontSuccess,
        triumph: confrontTriumph,
        despair: confrontDespair,
        narrativeText,
      },
    }))
    setView('action-result')
  }, [campaignState, rival, location, npcs])

  // Deploy early (forfeit remaining slots)
  const onDeployEarly = useCallback(() => {
    setPhaseState(prev => engineDeployEarly(prev))
    goToSummary()
  }, [goToSummary])

  // Complete phase and return to mission select
  const onComplete = useCallback(() => {
    const { campaign: finalCampaign } = finalizeExpandedSocialPhase(
      phaseState,
      campaignState,
      location.id,
      session.encounterResults,
      session.purchaseHistory,
      session.salesHistory,
      session.healingCreditsSpent,
    )
    updateCampaignState(finalCampaign)
    closeSocialPhase()
  }, [campaignState, phaseState, location, session, updateCampaignState, closeSocialPhase])

  // Skip social phase entirely
  const onSkip = useCallback(() => {
    closeSocialPhase()
  }, [closeSocialPhase])

  const activeShop = session.activeShopId
    ? location.shops.find(s => s.id === session.activeShopId) ?? null
    : null

  return (
    <div style={getContainerStyle(isMobile)}>
      {view === 'hub' && (
        <SocialHub
          location={location}
          npcs={npcs}
          campaign={campaignState}
          session={session}
          phaseState={phaseState}
          rival={rival}
          onSelectEncounter={goToEncounter}
          onSelectShop={onEnterShop}
          onHealHero={onHealHero}
          onComplete={goToSummary}
          onSkip={onSkip}
          onAcceptBounty={onAcceptBounty}
          onPrepBounty={onPrepBounty}
          onScoutMission={onScoutMission}
          onConfrontRival={onConfrontRival}
          onDeployEarly={onDeployEarly}
        />
      )}
      {view === 'encounter' && session.currentEncounter && (
        <SocialEncounterView
          encounter={session.currentEncounter}
          npc={npcs[session.currentEncounter.npcId]}
          campaign={campaignState}
          onCheckResolved={onCheckResolved}
          onBack={goToHub}
        />
      )}
      {view === 'check-result' && session.lastCheckResult && (
        <SocialCheckResultView
          result={session.lastCheckResult}
          outcomes={session.lastOutcomes ?? []}
          narrativeText={session.lastNarrativeText ?? ''}
          onContinue={goToHub}
        />
      )}
      {view === 'shop' && activeShop && (
        <SocialShop
          shop={activeShop}
          campaign={campaignState}
          onPurchase={onPurchase}
          onSell={onSell}
          onBack={goToHub}
        />
      )}
      {view === 'confrontation' && rival && location.confrontationEncounter && (
        <ConfrontationView
          encounter={location.confrontationEncounter}
          rival={rival}
          campaign={campaignState}
          onResolve={onResolveConfrontation}
          onBack={goToHub}
        />
      )}
      {view === 'action-result' && session.lastActionResult && (
        <ActionResultView
          result={session.lastActionResult}
          onContinue={goToHub}
        />
      )}
      {view === 'summary' && (
        <SocialSummary
          session={session}
          npcs={npcs}
          location={location}
          phaseState={phaseState}
          rival={rival}
          onComplete={onComplete}
        />
      )}
    </div>
  )
}

/**
 * Tutorial state management.
 * Tracks which tutorial step the player is on and provides
 * step definitions that react to game state changes.
 */

import { create } from 'zustand'

// ============================================================================
// TUTORIAL STEP DEFINITIONS
// ============================================================================

export interface TutorialStep {
  id: string
  title: string
  text: string
  /** Where to anchor the tooltip */
  anchor: 'center' | 'top-left' | 'top-right' | 'bottom-center' | 'canvas-center'
  /** If set, the step auto-advances when this game state condition is met */
  advanceOn?: 'figure-selected' | 'figure-moved' | 'attack-started' | 'activation-ended' | 'phase-advanced' | 'aim-used' | 'manual'
  /** Highlight hint for the canvas layer */
  highlight?: 'figures' | 'moves' | 'targets' | 'action-buttons' | 'info-panel'
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Galactic Operations',
    text: 'This tutorial will walk you through the basics of tactical combat. You command a team of Rebel operatives against Imperial forces on a grid-based battlefield.',
    anchor: 'center',
    advanceOn: 'manual',
  },
  {
    id: 'map-overview',
    title: 'The Battlefield',
    text: 'The map is divided into tiles. Different terrain types provide cover (yellow = light, orange = heavy) or block movement (walls). You can pan by dragging and zoom with the scroll wheel.',
    anchor: 'canvas-center',
    advanceOn: 'manual',
  },
  {
    id: 'select-hero',
    title: 'Select Your Hero',
    text: 'Click on a green Operative figure to select it. The info panel on the right will show their stats, weapons, and abilities.',
    anchor: 'top-right',
    advanceOn: 'figure-selected',
    highlight: 'figures',
  },
  {
    id: 'info-panel',
    title: 'Hero Information',
    text: 'The info panel shows your hero\'s wounds, strain, characteristics, equipment, and action economy. Each activation gives you 1 Action and 1 Maneuver.',
    anchor: 'top-right',
    advanceOn: 'manual',
    highlight: 'info-panel',
  },
  {
    id: 'move-hero',
    title: 'Movement',
    text: 'Cyan-highlighted tiles show where you can move. Click a highlighted tile to move there. Moving costs your Maneuver. You can spend strain for an extra maneuver.',
    anchor: 'bottom-center',
    advanceOn: 'figure-moved',
    highlight: 'moves',
  },
  {
    id: 'aim-action',
    title: 'Aim',
    text: 'Before attacking, try clicking AIM in the action buttons. Aiming adds a bonus die to your next attack, improving accuracy and damage.',
    anchor: 'bottom-center',
    advanceOn: 'aim-used',
    highlight: 'action-buttons',
  },
  {
    id: 'attack-target',
    title: 'Attack',
    text: 'Red-highlighted figures are valid targets. Click ATTACK, then click an enemy to engage in combat. Dice are rolled automatically: your attack pool vs their defense pool.',
    anchor: 'bottom-center',
    advanceOn: 'attack-started',
    highlight: 'targets',
  },
  {
    id: 'combat-resolution',
    title: 'Combat Resolution',
    text: 'Damage = weapon base + net successes - target soak. Matching dice (pairs, triples, runs) create Yahtzee combos for bonus damage. The combat log shows every roll.',
    anchor: 'center',
    advanceOn: 'manual',
  },
  {
    id: 'end-activation',
    title: 'End Activation',
    text: 'When you\'ve used your actions, click END TURN or the activation will end automatically. Then the next figure in initiative order activates. Imperial AI handles enemy turns automatically.',
    anchor: 'bottom-center',
    advanceOn: 'activation-ended',
    highlight: 'action-buttons',
  },
  {
    id: 'phases-rounds',
    title: 'Rounds & Phases',
    text: 'Each round, all figures activate once in initiative order. After all activations, reinforcements may arrive and victory conditions are checked. The threat tracker shows Imperial reinforcement budget.',
    anchor: 'top-left',
    advanceOn: 'manual',
  },
  {
    id: 'objectives',
    title: 'Objectives',
    text: 'Missions have objectives (terminals to slice, targets to eliminate, areas to secure). Complete primary objectives to win. Secondary objectives grant bonus XP.',
    anchor: 'center',
    advanceOn: 'manual',
  },
  {
    id: 'tutorial-complete',
    title: 'Tutorial Complete',
    text: 'You know the basics! Explore the campaign for a full experience with hero progression, social encounters, and an escalating 3-act story. Good luck, Commander.',
    anchor: 'center',
    advanceOn: 'manual',
  },
]

// ============================================================================
// STORE
// ============================================================================

interface TutorialStore {
  isActive: boolean
  currentStepIndex: number
  currentStep: TutorialStep | null
  /** Steps already seen (for skip-back) */
  completedStepIds: string[]

  // Actions
  startTutorial: () => void
  nextStep: () => void
  prevStep: () => void
  endTutorial: () => void
  /** Called by game state watchers to auto-advance */
  notifyEvent: (event: TutorialStep['advanceOn']) => void
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  isActive: false,
  currentStepIndex: 0,
  currentStep: null,
  completedStepIds: [],

  startTutorial: () => {
    set({
      isActive: true,
      currentStepIndex: 0,
      currentStep: TUTORIAL_STEPS[0],
      completedStepIds: [],
    })
  },

  nextStep: () => {
    const { currentStepIndex, currentStep } = get()
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= TUTORIAL_STEPS.length) {
      // Tutorial finished
      set({ isActive: false, currentStep: null })
      return
    }
    set({
      currentStepIndex: nextIndex,
      currentStep: TUTORIAL_STEPS[nextIndex],
      completedStepIds: currentStep
        ? [...get().completedStepIds, currentStep.id]
        : get().completedStepIds,
    })
  },

  prevStep: () => {
    const { currentStepIndex } = get()
    if (currentStepIndex <= 0) return
    const prevIndex = currentStepIndex - 1
    set({
      currentStepIndex: prevIndex,
      currentStep: TUTORIAL_STEPS[prevIndex],
    })
  },

  endTutorial: () => {
    set({ isActive: false, currentStep: null, currentStepIndex: 0, completedStepIds: [] })
  },

  notifyEvent: (event) => {
    const { isActive, currentStep } = get()
    if (!isActive || !currentStep) return
    if (currentStep.advanceOn === event) {
      get().nextStep()
    }
  },
}))

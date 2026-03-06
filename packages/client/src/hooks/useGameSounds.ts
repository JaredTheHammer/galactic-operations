/**
 * useGameSounds - Reactive sound effect hook
 *
 * Watches game state changes via Zustand selectors and triggers
 * appropriate synthesized sounds. Mounted once in App.tsx.
 */

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/game-store';
import { useAudioStore } from '../store/audio-store';

export function useGameSounds(): void {
  const play = useAudioStore(s => s.play);

  // Track previous values to detect transitions
  const prev = useRef<{
    turnPhase: string | null;
    roundNumber: number;
    figureCount: number;
    defeatedCount: number;
    woundedCount: number;
    winner: string | null;
    objectivesCompleted: number;
    activeCombat: boolean;
    showSetup: boolean;
    showMissionSelect: boolean;
    showPostMission: boolean;
    showSocialPhase: boolean;
    showHeroProgression: boolean;
    showPortraitManager: boolean;
  }>({
    turnPhase: null,
    roundNumber: 0,
    figureCount: 0,
    defeatedCount: 0,
    woundedCount: 0,
    winner: null,
    objectivesCompleted: 0,
    activeCombat: false,
    showSetup: true,
    showMissionSelect: false,
    showPostMission: false,
    showSocialPhase: false,
    showHeroProgression: false,
    showPortraitManager: false,
  });

  const gameState = useGameStore(s => s.gameState);
  const showSetup = useGameStore(s => s.showSetup);
  const showMissionSelect = useGameStore(s => s.showMissionSelect);
  const showPostMission = useGameStore(s => s.showPostMission);
  const showSocialPhase = useGameStore(s => s.showSocialPhase);
  const showHeroProgression = useGameStore(s => s.showHeroProgression);
  const showPortraitManager = useGameStore(s => s.showPortraitManager);

  useEffect(() => {
    const p = prev.current;

    // --- Screen transitions ---
    const screens = { showSetup, showMissionSelect, showPostMission, showSocialPhase, showHeroProgression, showPortraitManager };
    const prevScreens = { showSetup: p.showSetup, showMissionSelect: p.showMissionSelect, showPostMission: p.showPostMission, showSocialPhase: p.showSocialPhase, showHeroProgression: p.showHeroProgression, showPortraitManager: p.showPortraitManager };

    const screenChanged = (Object.keys(screens) as (keyof typeof screens)[]).some(
      k => screens[k] !== prevScreens[k]
    );
    if (screenChanged) {
      play('screenTransition');
    }

    // Update screen tracking
    p.showSetup = showSetup;
    p.showMissionSelect = showMissionSelect;
    p.showPostMission = showPostMission;
    p.showSocialPhase = showSocialPhase;
    p.showHeroProgression = showHeroProgression;
    p.showPortraitManager = showPortraitManager;

    if (!gameState) return;

    // --- Phase changes ---
    if (gameState.turnPhase && gameState.turnPhase !== p.turnPhase) {
      if (p.turnPhase !== null) {
        // Only play after initial setup
        if (gameState.turnPhase === 'Reinforcement') {
          play('reinforcement');
        } else if (gameState.turnPhase === 'Initiative' && gameState.roundNumber > p.roundNumber) {
          play('phaseChange');
        }
      }
      p.turnPhase = gameState.turnPhase;
    }

    // --- Round changes ---
    if (gameState.roundNumber !== p.roundNumber) {
      p.roundNumber = gameState.roundNumber;
    }

    // --- Figure defeats ---
    const currentDefeated = gameState.figures.filter(f => f.isDefeated).length;
    if (currentDefeated > p.defeatedCount && p.defeatedCount > 0) {
      play('defeat');
    }
    p.defeatedCount = currentDefeated;

    // --- Hero wounded ---
    const currentWounded = gameState.figures.filter(f => f.isWounded && !f.isDefeated).length;
    if (currentWounded > p.woundedCount && p.woundedCount >= 0 && p.figureCount > 0) {
      play('heroWounded');
    }
    p.woundedCount = currentWounded;
    p.figureCount = gameState.figures.length;

    // --- Objectives ---
    const currentObjectives = gameState.objectivePoints?.filter(op => op.isCompleted).length ?? 0;
    if (currentObjectives > p.objectivesCompleted) {
      play('objectiveComplete');
    }
    p.objectivesCompleted = currentObjectives;

    // --- Combat panel open/close ---
    const hasCombat = !!gameState.activeCombat;
    if (hasCombat && !p.activeCombat) {
      play('diceRoll');
    }
    p.activeCombat = hasCombat;

    // --- Victory/defeat ---
    if (gameState.winner && gameState.winner !== p.winner) {
      if (gameState.winner === 'Operative') {
        play('victory');
      } else if (gameState.winner === 'Imperial') {
        play('missionFailed');
      }
    }
    p.winner = gameState.winner ?? null;
  });
}

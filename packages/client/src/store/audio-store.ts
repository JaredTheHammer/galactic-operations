/**
 * Audio Settings Store (Zustand)
 *
 * Persists volume/mute settings to localStorage.
 * Syncs with AudioManager for actual playback control.
 */

import { create } from 'zustand';
import {
  setMasterVolume,
  setSfxVolume,
  setMuted,
  playSound,
  unlockAudio,
} from '../services/audio-manager';
import type { SoundName } from '../services/audio-manager';

interface AudioState {
  masterVolume: number;
  sfxVolume: number;
  muted: boolean;
  // Actions
  setMasterVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMute: () => void;
  play: (sound: SoundName) => void;
  unlock: () => void;
}

const STORAGE_KEY = 'galactic-ops-audio';

function loadSettings(): { masterVolume: number; sfxVolume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 0.5,
        sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : 0.7,
        muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
      };
    }
  } catch { /* ignore */ }
  return { masterVolume: 0.5, sfxVolume: 0.7, muted: false };
}

function saveSettings(s: { masterVolume: number; sfxVolume: number; muted: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

const initial = loadSettings();
// Sync initial values to AudioManager
setMasterVolume(initial.masterVolume);
setSfxVolume(initial.sfxVolume);
setMuted(initial.muted);

export const useAudioStore = create<AudioState>((set, get) => ({
  ...initial,

  setMasterVolume: (v: number) => {
    setMasterVolume(v);
    set({ masterVolume: v });
    saveSettings({ ...get(), masterVolume: v });
  },

  setSfxVolume: (v: number) => {
    setSfxVolume(v);
    set({ sfxVolume: v });
    saveSettings({ ...get(), sfxVolume: v });
  },

  toggleMute: () => {
    const muted = !get().muted;
    setMuted(muted);
    set({ muted });
    saveSettings({ ...get(), muted });
  },

  play: (sound: SoundName) => {
    playSound(sound);
  },

  unlock: () => {
    unlockAudio();
  },
}));

'use client';

import { create } from 'zustand';
import type { UserPreferences } from '@/types';
import { api } from '@/lib/api';

interface PreferencesState {
  preferences: UserPreferences;
  isLoaded: boolean;
  reasoningOnly: boolean;

  fetchPreferences: () => Promise<void>;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  setReasoningOnly: (val: boolean) => void;
}

const defaultPreferences: UserPreferences = {
  theme: 'light',
  color_theme: 'indigo',
  sidebar_mode: 'expanded',
  default_model_id: 'gpt-4o',
  default_temperature: 0.7,
  default_max_tokens: 4096,
  default_system_prompt: null,
  code_theme: 'github-dark',
  font_size: 'md',
  send_on_enter: true,
  show_token_counts: false,
  context_strategy: 'auto',
  enable_rag: true,
  message_width: 'md',
  chat_bg_pattern: 'none',
};

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: defaultPreferences,
  isLoaded: false,
  reasoningOnly: false,

  fetchPreferences: async () => {
    try {
      const prefs = await api.get<UserPreferences>('/preferences');
      set({ preferences: { ...defaultPreferences, ...prefs }, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  updatePreferences: async (updates) => {
    // Optimistic update
    set((state) => ({
      preferences: { ...state.preferences, ...updates },
    }));
    try {
      await api.patch('/preferences', updates);
    } catch (err) {
      console.error('Failed to update preferences:', err);
    }
  },

  setPreference: (key, value) => {
    set((state) => ({
      preferences: { ...state.preferences, [key]: value },
    }));
    // Debounced save handled by the component
  },

  setReasoningOnly: (val) => set({ reasoningOnly: val }),
}));

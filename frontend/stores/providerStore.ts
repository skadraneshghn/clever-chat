'use client';

import { create } from 'zustand';
import type {
  ProviderConnection,
  ProviderConnectionCreate,
  ProviderSyncResponse,
  AvailableModel,
} from '@/types';
import { api } from '@/lib/api';

interface ProviderState {
  providers: ProviderConnection[];
  availableModels: AvailableModel[];
  isLoadingProviders: boolean;
  isLoadingModels: boolean;
  isSyncing: string | null; // provider ID being synced

  // Actions
  fetchProviders: () => Promise<void>;
  fetchAvailableModels: () => Promise<void>;
  createProvider: (data: ProviderConnectionCreate) => Promise<ProviderSyncResponse>;
  deleteProvider: (id: string) => Promise<void>;
  syncProvider: (id: string) => Promise<ProviderSyncResponse>;
  toggleProvider: (id: string, isActive: boolean) => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  availableModels: [],
  isLoadingProviders: false,
  isLoadingModels: false,
  isSyncing: null,

  fetchProviders: async () => {
    set({ isLoadingProviders: true });
    try {
      const providers = await api.get<ProviderConnection[]>('/providers');
      set({ providers, isLoadingProviders: false });
    } catch (err) {
      console.error('Failed to fetch providers:', err);
      set({ isLoadingProviders: false });
    }
  },

  fetchAvailableModels: async () => {
    set({ isLoadingModels: true });
    try {
      const models = await api.get<AvailableModel[]>('/providers/models/available');
      set({ availableModels: models, isLoadingModels: false });
    } catch (err) {
      console.error('Failed to fetch available models:', err);
      set({ isLoadingModels: false });
    }
  },

  createProvider: async (data) => {
    const result = await api.post<ProviderSyncResponse>('/providers', data);
    set((state) => ({
      providers: [...state.providers, result.connection],
    }));
    // Refresh available models
    get().fetchAvailableModels();
    return result;
  },

  deleteProvider: async (id) => {
    await api.delete(`/providers/${id}`);
    set((state) => ({
      providers: state.providers.filter((p) => p.id !== id),
    }));
    // Refresh available models
    get().fetchAvailableModels();
  },

  syncProvider: async (id) => {
    set({ isSyncing: id });
    try {
      const result = await api.post<ProviderSyncResponse>(`/providers/${id}/sync`);
      set((state) => ({
        providers: state.providers.map((p) =>
          p.id === id ? result.connection : p
        ),
        isSyncing: null,
      }));
      // Refresh available models
      get().fetchAvailableModels();
      return result;
    } catch (err) {
      set({ isSyncing: null });
      throw err;
    }
  },

  toggleProvider: async (id, isActive) => {
    await api.patch(`/providers/${id}`, { is_active: isActive });
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, is_active: isActive } : p
      ),
    }));
    // Refresh available models
    get().fetchAvailableModels();
  },
}));

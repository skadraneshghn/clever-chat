'use client';

import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import type { User, TokenResponse, LoginCredentials, RegisterCredentials } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<TokenResponse>('/auth/login', credentials);
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      await get().fetchUser();
      set({ isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<TokenResponse>('/auth/register', credentials);
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      await get().fetchUser();
      set({ isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Registration failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Proceed with local logout even if server call fails
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, isAuthenticated: true });
    } catch (err) {
      // Only tear down the session on a hard auth failure. Transient errors
      // (network blips, 5xx) must not log the user out.
      const isAuthError = err instanceof ApiError && (err.status === 401 || err.status === 403);
      if (isAuthError) {
        set({ user: null, isAuthenticated: false });
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    }
  },

  clearError: () => set({ error: null }),
  setUser: (user) => set({ user, isAuthenticated: !!user }),

  hydrate: () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      get().fetchUser();
    }
  },
}));

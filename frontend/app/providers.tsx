'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Providers — React Query + Auth Hydration
   ═══════════════════════════════════════════════════════════════════════════ */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { colorThemes } from '@/lib/themes';
import { useTheme } from 'next-themes';
import { ToastProvider } from '@/components/Toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ColorThemeInjector() {
  const { preferences, fetchPreferences } = usePreferencesStore();
  const { resolvedTheme } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPreferences();
    }
  }, [isAuthenticated, fetchPreferences]);

  useEffect(() => {
    const colorTheme = preferences.color_theme || 'indigo';
    const isDark = resolvedTheme === 'dark';
    const vars = colorThemes[colorTheme]?.[isDark ? 'dark' : 'light'];
    
    if (vars) {
      const root = document.documentElement;
      
      // Clean previous layout overrides if any
      const layoutKeys = ['--bg-primary', '--bg-secondary', '--bg-sidebar', '--text-primary', '--text-heading'];
      layoutKeys.forEach((key) => {
        root.style.removeProperty(key);
      });

      // Inject theme variables
      Object.entries(vars).forEach(([name, val]) => {
        root.style.setProperty(name, val);
      });
    }
  }, [preferences.color_theme, resolvedTheme]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  if (!mounted) {
    return (
      <div style={{
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-pill)',
          border: '3px solid var(--border-default)',
          borderTopColor: 'var(--accent-primary)',
          animation: 'spin-slow 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ColorThemeInjector />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}

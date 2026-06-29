'use client';

import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from 'next-themes';
import { FiSun, FiMoon, FiMonitor } from 'react-icons/fi';

export default function PreferencesPage() {
  const { preferences, updatePreferences } = usePreferencesStore();
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'light', label: 'Light', icon: <FiSun size={18} /> },
    { value: 'dark', label: 'Dark', icon: <FiMoon size={18} /> },
    { value: 'system', label: 'System', icon: <FiMonitor size={18} /> },
  ];

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>Preferences</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Customize your experience
      </p>

      {/* Theme */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Theme</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => { setTheme(t.value); updatePreferences({ theme: t.value as any }); }}
              className="card card-interactive"
              style={{
                flex: 1,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                border: theme === t.value ? '2px solid var(--accent-primary)' : undefined,
                background: theme === t.value ? 'var(--accent-primary-soft)' : undefined,
                cursor: 'pointer',
              }}
            >
              <span style={{ color: theme === t.value ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{t.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Font Size</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <button
              key={size}
              onClick={() => updatePreferences({ font_size: size })}
              className="btn"
              style={{
                flex: 1,
                background: preferences.font_size === size ? 'var(--accent-primary)' : 'var(--surface-1)',
                color: preferences.font_size === size ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-default)',
              }}
            >
              {size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large'}
            </button>
          ))}
        </div>
      </div>

      {/* Behavior */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 16 }}>Behavior</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ToggleRow
            label="Send on Enter"
            description="Press Enter to send messages, Shift+Enter for new line"
            checked={preferences.send_on_enter}
            onChange={(v) => updatePreferences({ send_on_enter: v })}
          />
          <ToggleRow
            label="Show Token Counts"
            description="Display input/output token counts on messages"
            checked={preferences.show_token_counts}
            onChange={(v) => updatePreferences({ show_token_counts: v })}
          />
          <ToggleRow
            label="Smart Retrieval (RAG)"
            description="Search conversation history for relevant context"
            checked={preferences.enable_rag}
            onChange={(v) => updatePreferences({ enable_rag: v })}
          />
        </div>
      </div>
    </>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 'var(--radius-pill)',
          background: checked ? 'var(--accent-primary)' : 'var(--surface-3)',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background var(--transition-fast)',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'white',
          position: 'absolute',
          top: 3,
          left: checked ? 23 : 3,
          transition: 'left var(--transition-fast)',
          boxShadow: 'var(--shadow-xs)',
        }} />
      </button>
    </div>
  );
}

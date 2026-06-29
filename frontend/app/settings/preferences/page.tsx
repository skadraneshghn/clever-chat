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

  const colorThemesList = [
    { value: 'slate', label: 'Slate', color: '#64748b' },
    { value: 'gray', label: 'Gray', color: '#6b7280' },
    { value: 'zinc', label: 'Zinc', color: '#71717a' },
    { value: 'neutral', label: 'Neutral', color: '#737373' },
    { value: 'stone', label: 'Stone', color: '#78716c' },
    { value: 'red', label: 'Red', color: '#ef4444' },
    { value: 'orange', label: 'Orange', color: '#f97316' },
    { value: 'amber', label: 'Amber', color: '#f59e0b' },
    { value: 'yellow', label: 'Yellow', color: '#eab308' },
    { value: 'lime', label: 'Lime', color: '#84cc16' },
    { value: 'green', label: 'Green', color: '#22c55e' },
    { value: 'emerald', label: 'Emerald', color: '#10b981' },
    { value: 'indigo', label: 'Indigo', color: '#6366f1' },
    { value: 'anvix', label: 'Anvix', color: '#e27243' },
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

      {/* Accent Color */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>Accent Color</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Choose your primary accent color theme for the interface.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 10,
        }}>
          {colorThemesList.map((c) => {
            const isSelected = preferences.color_theme === c.value;
            return (
              <button
                key={c.value}
                onClick={() => updatePreferences({ color_theme: c.value as any })}
                className="card card-interactive"
                style={{
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-default)',
                  background: isSelected ? 'var(--accent-primary-soft)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: c.color,
                  boxShadow: 'var(--shadow-xs)',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Background Pattern */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>Chat Background Pattern</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Select a subtle graphic background pattern overlay for your active chat window.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}>
          {[
            { value: 'none', label: 'None (Solid)', preview: 'none' },
            { value: 'dots', label: 'Dots Grid', preview: 'dots' },
            { value: 'polygons', label: 'Polygons', preview: 'polygons' },
            { value: 'stripes', label: 'Slanted Lines', preview: 'stripes' },
            { value: 'temple', label: 'Telegram Doodle', preview: 'temple' },
            { value: 'pattern1', label: 'Chevron Repeat', preview: 'pattern1' },
            { value: 'pattern2', label: 'Triangular Mesh', preview: 'pattern2' },
            { value: 'pattern3', label: 'Diagonal Grid', preview: 'pattern3' },
            { value: 'pattern4', label: 'Golden Isometric', preview: 'pattern4' },
            { value: 'pattern5', label: 'Golden Hexagonal', preview: 'pattern5' },
          ].map((pat) => {
            const isSelected = preferences.chat_bg_pattern === pat.value;
            return (
              <button
                key={pat.value}
                onClick={() => updatePreferences({ chat_bg_pattern: pat.value as any })}
                className="card card-interactive"
                style={{
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-default)',
                  background: isSelected ? 'var(--accent-primary-soft)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all var(--transition-fast)',
                  position: 'relative',
                  overflow: 'hidden',
                  textAlign: 'left',
                }}
              >
                {/* Miniature Pattern Preview Box */}
                <div style={{
                  height: 38,
                  width: '100%',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-secondary)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {pat.value === 'dots' && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'radial-gradient(var(--accent-primary) 1.2px, transparent 1.2px)',
                      backgroundSize: '8px 8px',
                      opacity: 0.2,
                    }} />
                  )}
                  {pat.value === 'stripes' && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'repeating-linear-gradient(45deg, var(--accent-primary), var(--accent-primary) 0.5px, transparent 0.5px, transparent 6px)',
                      opacity: 0.15,
                    }} />
                  )}
                  {pat.value === 'polygons' && (
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.2, stroke: 'var(--accent-primary)', fill: 'none' }}>
                      <path d="M0 0 L15 15 L30 0 M15 15 L15 30 M0 30 L15 15 L30 30" strokeWidth="0.5" />
                      <path d="M30 0 L45 15 L60 0 M45 15 L45 30 M30 30 L45 15 L60 30" strokeWidth="0.5" />
                    </svg>
                  )}
                  {pat.value === 'temple' && (
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.25, stroke: 'var(--accent-primary)', fill: 'none' }}>
                      <path d="M5 5 L12 8 L8 10 Z" strokeWidth="0.5" />
                      <circle cx="22" cy="7" r="2" strokeWidth="0.5" />
                      <path d="M5 25 Q 10 22, 15 25" strokeWidth="0.5" />
                      <rect x="20" y="20" width="8" height="6" rx="1" strokeWidth="0.5" />
                    </svg>
                  )}
                  {['pattern1', 'pattern2', 'pattern3', 'pattern4', 'pattern5'].includes(pat.value) && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: `url(/patterns/${pat.value}.png)`,
                      backgroundSize: '40px 40px',
                      backgroundRepeat: 'repeat',
                      filter: theme === 'dark' ? 'invert(0.9) contrast(0.7) opacity(0.4)' : 'contrast(0.7) opacity(0.3)',
                    }} />
                  )}
                  {pat.value === 'none' && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'var(--bg-secondary)',
                    }} />
                  )}
                </div>
                
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                }}>{pat.label}</span>
              </button>
            );
          })}
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

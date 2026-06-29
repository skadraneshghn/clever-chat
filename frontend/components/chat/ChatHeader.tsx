'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   ChatHeader — Top bar with model selector, search, and new chat
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FiSearch, FiPlus, FiSettings, FiBell, FiShare2, FiSun, FiMoon } from 'react-icons/fi';
import { RiRobot2Line } from 'react-icons/ri';
import { SiOpenai, SiAnthropic } from 'react-icons/si';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { AVAILABLE_MODELS } from '@/types';
import { dropdownVariants } from '@/lib/motion';

export default function ChatHeader() {
  const { preferences, updatePreferences } = usePreferencesStore();
  const { resetChat } = useChatStore();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [modelOpen, setModelOpen] = useState(false);

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === preferences.default_model_id) || AVAILABLE_MODELS[0];

  function getProviderIcon(provider: string) {
    switch (provider) {
      case 'openai': return <SiOpenai size={14} />;
      case 'anthropic': return <SiAnthropic size={14} />;
      default: return <RiRobot2Line size={14} />;
    }
  }

  return (
    <header style={{
      height: 'var(--header-height)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      gap: 12,
      flexShrink: 0,
    }}>
      {/* Left: Model selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setModelOpen(!modelOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          {getProviderIcon(currentModel.provider)}
          <span>{currentModel.name}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.5 }}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <AnimatePresence>
          {modelOpen && (
            <>
              <div
                onClick={() => setModelOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: 4,
                  minWidth: 240,
                  zIndex: 50,
                }}
              >
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      updatePreferences({ default_model_id: model.id });
                      setModelOpen(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      color: model.id === preferences.default_model_id ? 'var(--accent-primary)' : 'var(--text-primary)',
                      background: model.id === preferences.default_model_id ? 'var(--accent-primary-soft)' : 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      if (model.id !== preferences.default_model_id) {
                        e.currentTarget.style.background = 'var(--surface-1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (model.id !== preferences.default_model_id) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{getProviderIcon(model.provider)}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{model.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{model.description}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Center: Search */}
      <div style={{
        flex: 1,
        maxWidth: 400,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}>
        <FiSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search"
          style={{
            width: '100%',
            padding: '7px 12px 7px 34px',
            fontSize: 13,
            color: 'var(--text-primary)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute',
          right: 10,
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
          background: 'var(--bg-secondary)',
          padding: '1px 5px',
          borderRadius: 'var(--radius-xs)',
          border: '1px solid var(--border-subtle)',
        }}>
          ⌘P
        </span>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-ghost btn-icon"
          title="Toggle theme"
          style={{ color: 'var(--text-secondary)' }}
        >
          {theme === 'dark' ? <FiSun size={17} /> : <FiMoon size={17} />}
        </button>
        <button
          onClick={() => router.push('/settings/profile')}
          className="btn-ghost btn-icon"
          title="Settings"
          style={{ color: 'var(--text-secondary)' }}
        >
          <FiSettings size={17} />
        </button>
        <button
          className="btn-ghost btn-icon"
          title="Notifications"
          style={{ color: 'var(--text-secondary)' }}
        >
          <FiBell size={17} />
        </button>
        <button
          onClick={() => {
            resetChat();
            router.push('/');
          }}
          className="btn btn-primary btn-sm"
          style={{ marginLeft: 4 }}
        >
          <FiPlus size={15} />
          New Chat
        </button>
      </div>
    </header>
  );
}

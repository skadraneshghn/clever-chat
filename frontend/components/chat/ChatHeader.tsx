'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   ChatHeader — Katteb-style: breadcrumb left, search center, actions right
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Settings, Bell, Share2, Sun, Moon, ChevronRight, Bot } from 'lucide-react';
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
    return <Bot size={13} />;
  }

  function handleNewChat() {
    resetChat();
    router.push('/');
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
      gap: 16,
      flexShrink: 0,
    }}>

      {/* Left: Model selector / breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setModelOpen(!modelOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 14px', fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-pill)',
              boxShadow: 'var(--shadow-xs)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            {getProviderIcon(currentModel.provider)}
            <span>{currentModel.name}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ opacity: .45 }}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <AnimatePresence>
            {modelOpen && (
              <>
                <div onClick={() => setModelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden" animate="visible" exit="exit"
                  style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: 6, minWidth: 260, zIndex: 50,
                  }}
                >
                  {AVAILABLE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => { updatePreferences({ default_model_id: model.id }); setModelOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', fontSize: 13,
                        color: model.id === preferences.default_model_id ? 'var(--accent-primary)' : 'var(--text-primary)',
                        background: model.id === preferences.default_model_id ? 'var(--accent-primary-soft)' : 'transparent',
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        textAlign: 'left', transition: 'all var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => { if (model.id !== preferences.default_model_id) e.currentTarget.style.background = 'var(--surface-1)'; }}
                      onMouseLeave={(e) => { if (model.id !== preferences.default_model_id) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {getProviderIcon(model.provider)}
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

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
          <ChevronRight size={14} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>AI Assistant</span>
        </div>
      </div>

      {/* Center: Search */}
      <div style={{
        flex: 1, maxWidth: 380,
        position: 'relative', display: 'flex', alignItems: 'center',
      }}>
        <Search size={13} style={{ position: 'absolute', left: 14, color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search"
          style={{
            width: '100%', padding: '7px 44px 7px 34px', fontSize: 13,
            color: 'var(--text-primary)', background: 'var(--bg-input)',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute', right: 10, fontSize: 10.5, color: 'var(--text-muted)',
          fontFamily: 'monospace', background: 'var(--bg-secondary)',
          padding: '1px 5px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)',
        }}>⌘P</span>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)',
            color: 'var(--text-secondary)',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            transition: 'all var(--transition-fast)',
          }}
          title="Toggle theme"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-card-hover)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Settings */}
        <button
          onClick={() => router.push('/settings/profile')}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)',
            color: 'var(--text-secondary)',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            transition: 'all var(--transition-fast)',
          }}
          title="Settings"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-card-hover)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          <Settings size={15} />
        </button>

        {/* Notifications */}
        <button
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)',
            color: 'var(--text-secondary)',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            position: 'relative',
            transition: 'all var(--transition-fast)',
          }}
          title="Notifications"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-card-hover)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          <Bell size={15} />
          {/* Notification dot */}
          <span style={{
            position: 'absolute', top: 3, right: 3,
            width: 6, height: 6, borderRadius: '50%',
            background: '#ef4444',
            border: '1.5px solid var(--bg-secondary)',
          }} />
        </button>

        {/* Share */}
        <button
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)',
            color: 'var(--text-secondary)',
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all var(--transition-fast)',
          }}
          title="Share"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-card-hover)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          <Share2 size={14} />
          <span>Share</span>
        </button>

        {/* New Chat — primary pill button */}
        <button
          onClick={handleNewChat}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', marginLeft: 4,
            fontSize: 13, fontWeight: 500,
            background: '#111827', color: 'white',
            border: 'none', borderRadius: 'var(--radius-pill)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer', transition: 'all var(--transition-fast)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
            e.currentTarget.style.transform = 'translateY(-0.5px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>
    </header>
  );
}

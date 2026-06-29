'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   ChatHeader — Katteb-style: breadcrumb left, search center, actions right
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Settings, Bell, Share2, Sun, Moon, ChevronRight, Bot, Server, Cloud, Cpu, Globe } from 'lucide-react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useProviderStore } from '@/stores/providerStore';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { dropdownVariants } from '@/lib/motion';
import type { ProviderType } from '@/types';

function getProviderIcon(providerType: ProviderType) {
  switch (providerType) {
    case 'openai': return <Cloud size={13} />;
    case 'ollama': return <Server size={13} />;
    case 'nvidia': return <Cpu size={13} />;
    default: return <Globe size={13} />;
  }
}

export default function ChatHeader() {
  const { preferences, updatePreferences, reasoningOnly } = usePreferencesStore();
  const { availableModels, fetchAvailableModels } = useProviderStore();
  const { resetChat } = useChatStore();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [modelOpen, setModelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAvailableModels();
  }, [fetchAvailableModels]);

  const currentModel = availableModels.find((m) => m.model_id === preferences.default_model_id);
  const currentModelName = currentModel?.display_name || preferences.default_model_id || 'Select Model';
  const currentProviderType = currentModel?.provider_type || 'openai';

  // Filter models by reasoning and search
  let filteredModels = availableModels;
  if (reasoningOnly) {
    filteredModels = filteredModels.filter((m) => m.capabilities?.reasoning === true);
  }
  if (searchQuery) {
    filteredModels = filteredModels.filter((m) =>
      m.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.model_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.provider_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Group by provider
  const grouped = filteredModels.reduce<Record<string, typeof filteredModels>>((acc, model) => {
    const key = model.provider_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});

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
            {getProviderIcon(currentProviderType)}
            <span>{currentModelName}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ opacity: .45 }}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <AnimatePresence>
            {modelOpen && (
              <>
                <div onClick={() => { setModelOpen(false); setSearchQuery(''); }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden" animate="visible" exit="exit"
                  style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: 6, minWidth: 300, maxHeight: 420, zIndex: 50,
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* Search inside dropdown */}
                  <div style={{ padding: '4px 6px 8px' }}>
                    <input
                      type="text"
                      placeholder="Search models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%', padding: '7px 10px', fontSize: 12,
                        color: 'var(--text-primary)', background: 'var(--bg-input)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)', outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {availableModels.length === 0 ? (
                      <div style={{ padding: '20px 12px', textAlign: 'center' }}>
                        <Bot size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                          No models available
                        </div>
                        <button
                          onClick={() => { router.push('/settings/connections'); setModelOpen(false); }}
                          style={{
                            fontSize: 12, fontWeight: 600,
                            color: 'var(--accent-primary)',
                            background: 'none', border: 'none',
                            cursor: 'pointer', textDecoration: 'underline',
                          }}
                        >
                          Add a connection →
                        </button>
                      </div>
                    ) : Object.keys(grouped).length === 0 ? (
                      <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                        No models match &ldquo;{searchQuery}&rdquo;
                      </div>
                    ) : (
                      Object.entries(grouped).map(([providerName, models]) => (
                        <div key={providerName}>
                          <div style={{
                            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                            padding: '6px 12px 4px',
                          }}>
                            {providerName}
                          </div>
                          {models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                updatePreferences({ default_model_id: model.model_id });
                                setModelOpen(false);
                                setSearchQuery('');
                              }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 12px', fontSize: 13,
                                color: model.model_id === preferences.default_model_id ? 'var(--accent-primary)' : 'var(--text-primary)',
                                background: model.model_id === preferences.default_model_id ? 'var(--accent-primary-soft)' : 'transparent',
                                border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                textAlign: 'left', transition: 'all var(--transition-fast)',
                              }}
                              onMouseEnter={(e) => { if (model.model_id !== preferences.default_model_id) e.currentTarget.style.background = 'var(--surface-1)'; }}
                              onMouseLeave={(e) => { if (model.model_id !== preferences.default_model_id) e.currentTarget.style.background = 'transparent'; }}
                            >
                              {getProviderIcon(model.provider_type)}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{model.display_name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {model.model_id}
                                </div>
                              </div>
                              {model.capabilities?.vision && (
                                <span style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 600 }}>👁</span>
                              )}
                              {model.capabilities?.reasoning && (
                                <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>⚡</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer link to connections */}
                  {availableModels.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px' }}>
                      <button
                        onClick={() => { router.push('/settings/connections'); setModelOpen(false); }}
                        style={{
                          width: '100%', padding: '7px 12px', fontSize: 12,
                          color: 'var(--text-muted)',
                          background: 'none', border: 'none',
                          borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        <Plus size={12} style={{ display: 'inline', marginRight: 6 }} />
                        Manage connections...
                      </button>
                    </div>
                  )}
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

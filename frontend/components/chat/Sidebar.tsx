'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar — Katteb-style with Lucide React icons
   conversation history, tools and profile at bottom
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Search, Settings, Trash2, Pin,
  LogOut, ChevronLeft, MessageSquare,
  LayoutDashboard, FileText, Zap, Cpu, PenSquare, Bot, Sparkles,
  MoreHorizontal, Share2, Users, Edit2, Archive, Folder
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useRouter } from 'next/navigation';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { ShareUser } from '@/types';

const NAV_SECTIONS = [
  {
    label: 'MAIN NAVIGATION',
    items: [
      { icon: <LayoutDashboard size={15} />, label: 'Dashboard',      href: '/' },
      { icon: <PenSquare size={15} />,       label: 'New Chat',       action: 'new' },
      { icon: <FileText size={15} />,        label: 'Conversations',  href: '/' },
      { icon: <Folder size={15} />,          label: 'Files Manager',  href: '/files' },
      { icon: <Sparkles size={15} />,        label: 'AI Assistant',   href: '/', active: true },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { icon: <Zap size={15} />,             label: 'Quick Prompts',  href: '/' },
      { icon: <Cpu size={15} />,             label: 'Models',         href: '/settings/models' },
      { icon: <Settings size={15} />,        label: 'Settings',       href: '/settings/profile' },
    ],
  },
];

export default function Sidebar() {
  const router = useRouter();
  const {
    conversations, fetchConversations, activeConversationId,
    setActiveConversation, deleteConversation, resetChat,
    shareConversationPrivate, unshareConversationPrivate, fetchConversationShares,
    duplicateConversation,
  } = useChatStore();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, isMobile, setMobileDrawerOpen } = useUIStore();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Sharing states
  const [shareModalConvId, setShareModalConvId] = useState<string | null>(null);
  const [shareTab, setShareTab] = useState<'public' | 'private'>('public');
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [sharedUsers, setSharedUsers] = useState<ShareUser[]>([]);
  const [publicShareToken, setPublicShareToken] = useState<string | null>(null);
  const [isSharingAction, setIsSharingAction] = useState(false);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    if (shareModalConvId) {
      const conv = conversations.find(c => c.id === shareModalConvId);
      setPublicShareToken(conv?.share_token || null);
      
      // Load shared users
      fetchConversationShares(shareModalConvId)
        .then(setSharedUsers)
        .catch(err => console.error(err));
         
      // Load system users
      api.get<any[]>('/auth/users')
        .then(setSystemUsers)
        .catch(err => console.error(err));
    }
  }, [shareModalConvId, conversations, fetchConversationShares]);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(filtered);

  function handleNewChat() {
    resetChat();
    router.push('/');
    if (isMobile) setMobileDrawerOpen(false);
  }

  function handleConvClick(id: string) {
    setActiveConversation(id);
    router.push(`/${id}`);
    if (isMobile) setMobileDrawerOpen(false);
  }

  async function handleDelete(id: string) {
    const isActive = activeConversationId === id;
    await deleteConversation(id);
    if (isActive) {
      resetChat();
      router.push('/');
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const newConv = await duplicateConversation(id);
      setActiveMenuId(null);
      router.push(`/${newConv.id}`);
    } catch (err) {
      console.error('Failed to duplicate conversation:', err);
      toast.error('Failed to duplicate conversation');
    }
  }

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <>
      <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border-subtle)',
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <style>{`
            .conv-item:hover .conv-more-btn {
              opacity: 1 !important;
            }
          `}</style>
          {/* ── Logo ──────────────────────────────────────────── */}
          <div style={{
            padding: '18px 16px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                borderRadius: 'var(--radius-md)',
                background: '#111827',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white',
                fontSize: 15, fontWeight: 700,
              }}>
                <Bot size={16} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-heading)' }}>
                CleverChat
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4, borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center',
              }}
              title="Collapse sidebar"
            >
              <ChevronLeft size={17} />
            </button>
          </div>

          {/* ── Search ────────────────────────────────────────── */}
          <div style={{ padding: '4px 12px 8px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 44px 7px 30px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  outline: 'none',
                  transition: 'all var(--transition-fast)',
                }}
              />
              <span style={{
                position: 'absolute', right: 8, fontSize: 10.5,
                color: 'var(--text-muted)', fontFamily: 'monospace',
                background: 'var(--bg-secondary)', padding: '1px 5px',
                borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)',
              }}>
                ⌘P
              </span>
            </div>
          </div>

          {/* ── Nav Sections ──────────────────────────────────── */}
          <div style={{ padding: '4px 8px' }}>
            {NAV_SECTIONS.map((section) => (
              <div key={section.label} style={{ marginBottom: 4 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '8px 8px 4px',
                }}>
                  {section.label}
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (item.action === 'new') handleNewChat();
                      else if (item.href) router.push(item.href);
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', fontSize: 13.5,
                      color: item.active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: item.active ? 'var(--bg-active-menu)' : 'transparent',
                      border: item.active ? '1px solid var(--border-active-menu)' : '1px solid transparent',
                      boxShadow: item.active ? 'var(--shadow-active-menu)' : 'none',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      textAlign: 'left', transition: 'all var(--transition-fast)',
                      fontWeight: item.active ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!item.active) {
                        e.currentTarget.style.background = 'var(--surface-1)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!item.active) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    <span style={{ opacity: item.active ? 0.9 : 0.7 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* ── Conversation List ──────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 4px' }}>
            {Object.entries(grouped).map(([label, convs]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '8px 8px 4px',
                }}>
                  {label}
                </div>
                {convs.map((conv) => (
                  <div key={conv.id} style={{ position: 'relative' }} className="conv-item">
                    <button
                      onClick={() => handleConvClick(conv.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                        padding: conv.is_shared ? '5px 32px 5px 10px' : '7px 32px 7px 10px', fontSize: 13.5,
                        color: activeConversationId === conv.id 
                          ? 'var(--text-primary)' 
                          : (conv.is_shared ? 'rgba(139, 92, 246, 0.85)' : 'var(--text-secondary)'),
                        background: activeConversationId === conv.id 
                          ? (conv.is_shared 
                              ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(99, 102, 241, 0.12))' 
                              : 'var(--bg-active-menu)') 
                          : (conv.is_shared ? 'rgba(139, 92, 246, 0.03)' : 'transparent'),
                        border: activeConversationId === conv.id 
                          ? (conv.is_shared 
                              ? '1px solid rgba(139, 92, 246, 0.35)' 
                              : '1px solid var(--border-active-menu)') 
                          : (conv.is_shared ? '1px dashed rgba(139, 92, 246, 0.2)' : '1px solid transparent'),
                        boxShadow: activeConversationId === conv.id ? 'var(--shadow-active-menu)' : 'none',
                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        textAlign: 'left', transition: 'all var(--transition-fast)',
                        fontWeight: activeConversationId === conv.id ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (activeConversationId !== conv.id) {
                          e.currentTarget.style.background = conv.is_shared ? 'rgba(139, 92, 246, 0.08)' : 'var(--surface-1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeConversationId !== conv.id) {
                          e.currentTarget.style.background = conv.is_shared ? 'rgba(139, 92, 246, 0.03)' : 'transparent';
                        }
                      }}
                    >
                      {conv.is_shared ? (
                        <Users size={14} style={{ flexShrink: 0, color: '#8b5cf6' }} />
                      ) : (
                        <MessageSquare size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      )}

                      {conv.is_shared ? (
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, lineHeight: 1.25 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 }}>
                            {conv.title}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.8 }}>
                            from @{conv.owner_username}
                          </span>
                        </div>
                      ) : (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {conv.title}
                        </span>
                      )}

                      {conv.is_pinned && <Pin size={11} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === conv.id ? null : conv.id);
                      }}
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', opacity: (activeConversationId === conv.id || activeMenuId === conv.id) ? 1 : 0, padding: 4,
                        borderRadius: 'var(--radius-sm)', transition: 'opacity var(--transition-fast), background var(--transition-fast)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
                      }}
                      className="conv-more-btn"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-2)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {activeMenuId === conv.id && (
                      <>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                          }}
                          style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 90,
                            cursor: 'default',
                          }}
                        />
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 2px)',
                            right: 8,
                            width: 180,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-lg)',
                            padding: '6px',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            animation: 'fade-in 0.15s ease-out',
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              setShareModalConvId(conv.id);
                            }}
                            disabled={conv.is_shared}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: conv.is_shared ? 'var(--text-muted)' : 'var(--text-secondary)',
                              textAlign: 'left', cursor: conv.is_shared ? 'not-allowed' : 'pointer', width: '100%',
                              borderRadius: 'var(--radius-md)',
                              transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={(e) => {
                              if (!conv.is_shared) e.currentTarget.style.background = 'var(--surface-1)';
                            }}
                            onMouseLeave={(e) => {
                              if (!conv.is_shared) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Share2 size={14} style={{ color: conv.is_shared ? 'var(--text-muted)' : 'var(--text-secondary)' }} />
                            <span>Share</span>
                          </button>
                          <button
                            disabled
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: 'var(--text-muted)',
                              textAlign: 'left', cursor: 'not-allowed', width: '100%',
                            }}
                          >
                            <Users size={14} />
                            <span>Start a group chat</span>
                          </button>
                          <button
                            disabled
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: 'var(--text-muted)',
                              textAlign: 'left', cursor: 'not-allowed', width: '100%',
                            }}
                          >
                            <Edit2 size={14} />
                            <span>Rename</span>
                          </button>
                          
                          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                          
                          <button
                            disabled
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: 'var(--text-muted)',
                              textAlign: 'left', cursor: 'not-allowed', width: '100%',
                            }}
                          >
                            <Pin size={14} />
                            <span>Pin chat</span>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await handleDuplicate(conv.id);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: 'var(--text-secondary)',
                              textAlign: 'left', cursor: 'pointer', width: '100%',
                              borderRadius: 'var(--radius-md)',
                              transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Archive size={14} />
                            <span>Duplicate</span>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              try {
                                await api.patch(`/conversations/${conv.id}`, { is_archived: !conv.is_archived });
                                fetchConversations();
                                toast.success(conv.is_archived ? 'Conversation unarchived' : 'Conversation archived');
                              } catch {
                                toast.error('Failed to update conversation');
                              }
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: 'var(--text-secondary)',
                              textAlign: 'left', cursor: 'pointer', width: '100%',
                              borderRadius: 'var(--radius-md)',
                              transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Archive size={14} />
                            <span>{conv.is_archived ? 'Unarchive' : 'Archive'}</span>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              await handleDelete(conv.id);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 10px', fontSize: 13, border: 'none',
                              background: 'transparent', color: 'var(--accent-error)',
                              textAlign: 'left', cursor: 'pointer', width: '100%',
                              borderRadius: 'var(--radius-md)',
                              transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--accent-error-soft)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Trash2 size={14} style={{ color: 'var(--accent-error)' }} />
                            <span style={{ fontWeight: 500 }}>Delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {search ? 'No conversations found' : 'No chats yet — start a new one!'}
              </div>
            )}
          </div>

          {/* ── User Profile Menu Card ────────────────────────── */}
          {user && (
            <div style={{ position: 'relative', padding: '0 8px 12px' }}>
              {/* Floating Menu Popover */}
              {menuOpen && (
                <>
                  {/* Click-outside backdrop */}
                  <div
                    onClick={() => setMenuOpen(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 90,
                      cursor: 'default',
                    }}
                  />
                  
                  {/* Dropdown Card */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 4px)',
                      left: 8,
                      right: 8,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-lg)',
                      padding: '6px',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      animation: 'fade-in 0.15s ease-out',
                    }}
                  >
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        router.push('/settings/profile');
                      }}
                      className="nav-item"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <Settings size={15} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)' }}>Profile Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        handleLogout();
                      }}
                      className="nav-item"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'var(--accent-error)',
                      }}
                    >
                      <LogOut size={15} style={{ color: 'var(--accent-error)' }} />
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>Log Out</span>
                    </button>
                  </div>
                </>
              )}

              {/* Profile Card Button */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-active-menu)',
                  border: '1px solid var(--border-active-menu)',
                  borderRadius: 'var(--radius-xl)',
                  boxShadow: 'var(--shadow-active-menu)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'var(--shadow-active-menu)';
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 14,
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-xs)',
                }}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: 'var(--text-heading)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.25,
                    marginBottom: 1,
                  }}>
                    {user.username}
                  </div>
                  <div style={{
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.25,
                  }}>
                    {user.email}
                  </div>
                </div>
              </button>
            </div>
          )}
        </motion.aside>
      )}
      </AnimatePresence>

      {/* ── Share Modal Overlay ────────────────────────────────────── */}
      <AnimatePresence>
        {shareModalConvId && (
          <div
            onClick={() => setShareModalConvId(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 460,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-2xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Share2 size={18} style={{ color: 'var(--accent-primary)' }} /> Share Conversation
                </span>
                <button
                  onClick={() => setShareModalConvId(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 18, fontWeight: 500,
                    padding: 4, borderRadius: 'var(--radius-sm)',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-1)',
              }}>
                <button
                  onClick={() => setShareTab('public')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    borderBottom: shareTab === 'public' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    color: shareTab === 'public' ? 'var(--text-heading)' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Public Link
                </button>
                <button
                  onClick={() => setShareTab('private')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    borderBottom: shareTab === 'private' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    color: shareTab === 'private' ? 'var(--text-heading)' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Share Privately
                </button>
              </div>

              {/* Body Content */}
              <div style={{ padding: 20, minHeight: 180, display: 'flex', flexDirection: 'column' }}>
                
                {/* PUBLIC TAB */}
                {shareTab === 'public' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                      Generate a public read-only link. Anyone with this URL can view the conversation history and messages.
                    </p>
                    
                    {publicShareToken ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border-default)',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-lg)',
                        }}>
                          <input
                            readOnly
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/shared/${publicShareToken}`}
                            style={{
                              flex: 1,
                              background: 'none',
                              border: 'none',
                              outline: 'none',
                              fontSize: 12.5,
                              color: 'var(--text-primary)',
                            }}
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/shared/${publicShareToken}`);
                              toast.success('Public link copied to clipboard!');
                            }}
                            style={{
                              background: 'var(--accent-primary)',
                              color: 'white',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: 'var(--radius-md)',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        
                        <button
                          onClick={async () => {
                            try {
                              setIsSharingAction(true);
                              await api.delete(`/conversations/${shareModalConvId}/share`);
                              setPublicShareToken(null);
                              useChatStore.getState().updateConversation(shareModalConvId!, { share_token: null });
                              toast.success('Public link revoked successfully.');
                            } catch (e) {
                              toast.error('Failed to revoke public link.');
                            } finally {
                              setIsSharingAction(false);
                            }
                          }}
                          disabled={isSharingAction}
                          style={{
                            alignSelf: 'flex-start',
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-error)',
                            fontSize: 12.5,
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: '4px 0',
                          }}
                        >
                          Revoke Public Access
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            setIsSharingAction(true);
                            const res = await api.post<{ share_token: string }>(`/conversations/${shareModalConvId}/share`);
                            setPublicShareToken(res.share_token);
                            useChatStore.getState().updateConversation(shareModalConvId!, { share_token: res.share_token });
                            toast.success('Public link generated!');
                          } catch (e) {
                            toast.error('Failed to generate public link.');
                          } finally {
                            setIsSharingAction(false);
                          }
                        }}
                        disabled={isSharingAction}
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'white',
                          border: 'none',
                          padding: '10px 16px',
                          borderRadius: 'var(--radius-lg)',
                          fontSize: 13.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'opacity 0.2s',
                          opacity: isSharingAction ? 0.7 : 1,
                        }}
                      >
                        Create Public Share Link
                      </button>
                    )}
                  </div>
                )}

                {/* PRIVATE TAB */}
                {shareTab === 'private' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                      Share this conversation privately with specific users. They will see it in their sidebar and can participate in it.
                    </p>
                    
                    {/* Autocomplete / User Selector */}
                    <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input
                          type="text"
                          placeholder="Enter recipient's username"
                          value={searchUserQuery}
                          onChange={(e) => setSearchUserQuery(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            fontSize: 13,
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-lg)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                        />
                        {/* Autocomplete Dropdown */}
                        {searchUserQuery && (
                          <div style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-lg)',
                            maxHeight: 150,
                            overflowY: 'auto',
                            zIndex: 10,
                          }}>
                            {systemUsers
                              .filter(u => u.username.toLowerCase().includes(searchUserQuery.toLowerCase()) && !sharedUsers.some(su => su.id === u.id))
                              .map(u => (
                                <div
                                  key={u.id}
                                  onClick={() => {
                                    setSearchUserQuery(u.username);
                                  }}
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    color: 'var(--text-primary)',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-1)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  @{u.username} ({u.email})
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!searchUserQuery.trim()) return;
                          try {
                            setIsSharingAction(true);
                            const recipient = await shareConversationPrivate(shareModalConvId!, searchUserQuery);
                            setSharedUsers([...sharedUsers, recipient]);
                            setSearchUserQuery('');
                            toast.success(`Conversation shared with @${recipient.username}!`);
                          } catch (e: any) {
                            toast.error(e.response?.data?.detail || 'Failed to share conversation.');
                          } finally {
                            setIsSharingAction(false);
                          }
                        }}
                        disabled={isSharingAction || !searchUserQuery}
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 'var(--radius-lg)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Share
                      </button>
                    </div>

                    {/* Shared Users List */}
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1, maxHeight: 150, overflowY: 'auto' }}>
                      <span style={{ fontSize: 11, fontWeight: 750, color: 'var(--text-muted)' }}>SHARED WITH</span>
                      {sharedUsers.length > 0 ? (
                        sharedUsers.map(u => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'var(--surface-1)',
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>@{u.username}</span>
                            <button
                              onClick={async () => {
                                try {
                                  setIsSharingAction(true);
                                  await unshareConversationPrivate(shareModalConvId!, u.username);
                                  setSharedUsers(sharedUsers.filter(su => su.id !== u.id));
                                  toast.success(`Access revoked for @${u.username}.`);
                                } catch (e) {
                                  toast.error('Failed to revoke access.');
                                } finally {
                                  setIsSharingAction(false);
                                }
                              }}
                              disabled={isSharingAction}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-error)',
                                fontSize: 12,
                                cursor: 'pointer',
                                padding: 2,
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Not shared with any users yet.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function groupByDate(conversations: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const conv of conversations) {
    const date = new Date(conv.updated_at || conv.created_at);
    let label: string;
    if (isToday(date)) label = 'Today';
    else if (isYesterday(date)) label = 'Yesterday';
    else if (isThisWeek(date)) label = 'This Week';
    else if (isThisMonth(date)) label = 'This Month';
    else label = format(date, 'MMMM yyyy');
    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }
  return groups;
}

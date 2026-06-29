'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar — Katteb-style with logo, search, nav sections, premium card,
   conversation history, and user profile at bottom
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FiPlus, FiSearch, FiSettings, FiTrash2, FiMapPin,
  FiLogOut, FiChevronLeft, FiMessageSquare,
  FiLayout, FiFileText, FiZap, FiCpu, FiEdit3,
} from 'react-icons/fi';
import { RiChat3Line, RiRobot2Line, RiSparklingLine } from 'react-icons/ri';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useRouter } from 'next/navigation';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';

const NAV_SECTIONS = [
  {
    label: 'MAIN NAVIGATION',
    items: [
      { icon: <FiLayout size={15} />,      label: 'Dashboard',      href: '/' },
      { icon: <FiEdit3 size={15} />,       label: 'New Chat',       action: 'new' },
      { icon: <FiFileText size={15} />,    label: 'Conversations',  href: '/' },
      { icon: <RiSparklingLine size={15}/>, label: 'AI Assistant',   href: '/', active: true },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { icon: <FiZap size={15} />,         label: 'Quick Prompts',  href: '/' },
      { icon: <FiCpu size={15} />,         label: 'Models',         href: '/settings/models' },
      { icon: <FiSettings size={15} />,    label: 'Settings',       href: '/settings/profile' },
    ],
  },
];

export default function Sidebar() {
  const router = useRouter();
  const { conversations, fetchConversations, activeConversationId, setActiveConversation, deleteConversation, resetChat } = useChatStore();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, isMobile, setMobileDrawerOpen } = useUIStore();
  const [search, setSearch] = useState('');

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

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
    await deleteConversation(id);
  }

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
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
                <RiRobot2Line />
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
              <FiChevronLeft size={17} />
            </button>
          </div>

          {/* ── Search ────────────────────────────────────────── */}
          <div style={{ padding: '4px 12px 8px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <FiSearch size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
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
                  borderRadius: 'var(--radius-md)',
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
                      background: item.active ? 'var(--surface-1)' : 'transparent',
                      border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      textAlign: 'left', transition: 'all var(--transition-fast)',
                      fontWeight: item.active ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!item.active) e.currentTarget.style.background = 'var(--surface-1)';
                      if (!item.active) e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!item.active) e.currentTarget.style.background = 'transparent';
                      if (!item.active) e.currentTarget.style.color = 'var(--text-secondary)';
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
                        padding: '7px 10px', fontSize: 13.5,
                        color: activeConversationId === conv.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                        background: activeConversationId === conv.id ? 'var(--surface-1)' : 'transparent',
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        textAlign: 'left', transition: 'all var(--transition-fast)',
                        fontWeight: activeConversationId === conv.id ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (activeConversationId !== conv.id) e.currentTarget.style.background = 'var(--surface-1)';
                      }}
                      onMouseLeave={(e) => {
                        if (activeConversationId !== conv.id) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <RiChat3Line size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {conv.title}
                      </span>
                      {conv.is_pinned && <FiMapPin size={11} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', opacity: 0, padding: 4,
                        borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)',
                      }}
                      className="conv-delete-btn"
                    >
                      <FiTrash2 size={12} />
                    </button>
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

          {/* ── Premium Card ──────────────────────────────────── */}
          <div style={{ padding: '8px 12px' }}>
            <div style={{
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, #eef2ff 0%, #fdf4ff 50%, #fff7ed 100%)',
              border: '1px solid #e0e7ff',
              padding: '14px 14px 12px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* deco blob */}
              <div style={{
                position: 'absolute', top: -12, right: -12,
                width: 60, height: 60,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(99,102,241,.15), rgba(168,85,247,.15))',
                filter: 'blur(12px)',
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                  background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <RiRobot2Line size={14} color="white" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Premium</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.4 }}>
                Unlock all models and advanced features
              </div>
              <button style={{
                fontSize: 12, fontWeight: 500,
                padding: '5px 12px',
                background: '#111827', color: 'white',
                border: 'none', borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
              }}>
                Upgrade Now
              </button>
            </div>
          </div>

          {/* ── User Profile ──────────────────────────────────── */}
          {user && (
            <div style={{
              padding: '10px 12px 14px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {/* Avatar */}
              <div style={{
                width: 34, height: 34,
                borderRadius: 'var(--radius-pill)',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 600, fontSize: 13, flexShrink: 0,
              }}>
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.username}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 'var(--radius-sm)', display: 'flex' }} title="Logout">
                <FiLogOut size={15} />
              </button>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
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

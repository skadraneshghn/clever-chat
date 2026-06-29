'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar Component — Conversation list, search, user profile
   Clean light design matching the Katteb reference
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FiPlus, FiSearch, FiMessageSquare, FiSettings, FiTrash2,
  FiEdit3, FiMapPin, FiArchive, FiMoreHorizontal, FiLogOut,
  FiChevronLeft, FiCommand,
} from 'react-icons/fi';
import { RiChat3Line, RiRobot2Line } from 'react-icons/ri';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useRouter } from 'next/navigation';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';

export default function Sidebar() {
  const router = useRouter();
  const { conversations, fetchConversations, activeConversationId, setActiveConversation, deleteConversation, resetChat } = useChatStore();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, isMobile, setMobileDrawerOpen } = useUIStore();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // Group conversations by date
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
    setMenuOpenId(null);
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
          animate={{ width: 280, opacity: 1 }}
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
          {/* ── Logo & Collapse ──────────────────────────────── */}
          <div style={{
            padding: '16px 16px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 16,
                fontWeight: 700,
              }}>
                <RiRobot2Line />
              </div>
              <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-heading)' }}>
                CleverChat
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn-ghost btn-icon"
              title="Collapse sidebar"
              style={{ color: 'var(--text-muted)' }}
            >
              <FiChevronLeft size={18} />
            </button>
          </div>

          {/* ── Search ───────────────────────────────────────── */}
          <div style={{ padding: '8px 12px' }}>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}>
              <FiSearch
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  transition: 'all var(--transition-fast)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
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
          </div>

          {/* ── New Chat Button ──────────────────────────────── */}
          <div style={{ padding: '4px 12px 8px' }}>
            <button
              onClick={handleNewChat}
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 13, padding: '9px 16px' }}
            >
              <FiPlus size={16} />
              New Chat
            </button>
          </div>

          {/* ── Conversation List ────────────────────────────── */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 8px',
          }}>
            {Object.entries(grouped).map(([label, convs]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '8px 8px 4px',
                }}>
                  {label}
                </div>
                {convs.map((conv) => (
                  <motion.div
                    key={conv.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{ position: 'relative' }}
                  >
                    <button
                      onClick={() => handleConvClick(conv.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 10px',
                        fontSize: 14,
                        color: activeConversationId === conv.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        background: activeConversationId === conv.id ? 'var(--bg-active)' : 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all var(--transition-fast)',
                        fontWeight: activeConversationId === conv.id ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (activeConversationId !== conv.id) {
                          e.currentTarget.style.background = 'var(--surface-1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeConversationId !== conv.id) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <RiChat3Line size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}>
                        {conv.title}
                      </span>
                      {conv.is_pinned && <FiMapPin size={12} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />}
                    </button>
                    {/* Quick delete on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        opacity: 0,
                        padding: 4,
                        borderRadius: 'var(--radius-sm)',
                        transition: 'all var(--transition-fast)',
                      }}
                      className="conv-delete-btn"
                      title="Delete"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </motion.div>
                ))}
              </div>
            ))}

            {filtered.length === 0 && (
              <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}>
                {search ? 'No conversations found' : 'No conversations yet'}
              </div>
            )}
          </div>

          {/* ── User Profile ─────────────────────────────────── */}
          {user && (
            <div style={{
              padding: '12px 12px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 14,
                flexShrink: 0,
              }}>
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.username}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
              <button
                onClick={() => router.push('/settings/profile')}
                className="btn-ghost btn-icon"
                title="Settings"
                style={{ color: 'var(--text-muted)' }}
              >
                <FiSettings size={16} />
              </button>
              <button
                onClick={handleLogout}
                className="btn-ghost btn-icon"
                title="Logout"
                style={{ color: 'var(--text-muted)' }}
              >
                <FiLogOut size={16} />
              </button>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ── Helper: group conversations by date ──────────────────────────────────

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

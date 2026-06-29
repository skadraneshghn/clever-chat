'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Chat Layout — Sidebar + Main content area
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import Sidebar from '@/components/chat/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import { FiMenu } from 'react-icons/fi';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, isMobile, setIsMobile } = useUIStore();
  const router = useRouter();

  // Responsive detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [setIsMobile]);

  // Auth guard
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated && typeof window !== 'undefined' && !localStorage.getItem('access_token')) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100dvh',
      background: 'var(--bg-app)',
      overflow: 'hidden',
      padding: '8px',
      gap: 8,
    }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content — white rounded panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,.05)',
        border: '1px solid var(--border-subtle)',
      }}>
        {/* Header */}
        <ChatHeader />

        {/* Page content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
      </div>

      {/* Mobile sidebar toggle */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed',
            top: 14,
            left: 14,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          <FiMenu size={18} />
        </button>
      )}
    </div>
  );
}

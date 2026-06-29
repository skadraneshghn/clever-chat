'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Settings Layout — Left nav + right panel
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  FiUser, FiSliders, FiCpu, FiLayout, FiDatabase,
  FiArrowLeft,
} from 'react-icons/fi';
import { fadeInUp } from '@/lib/motion';

const navItems = [
  { href: '/settings/profile', icon: <FiUser size={18} />, label: 'Profile' },
  { href: '/settings/preferences', icon: <FiSliders size={18} />, label: 'Preferences' },
  { href: '/settings/models', icon: <FiCpu size={18} />, label: 'AI Models' },
  { href: '/settings/data', icon: <FiDatabase size={18} />, label: 'Data' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div style={{
      display: 'flex',
      height: '100dvh',
      background: 'var(--bg-primary)',
    }}>
      {/* Left nav */}
      <div style={{
        width: 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 8px',
        flexShrink: 0,
      }}>
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            fontSize: 14,
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            marginBottom: 16,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-1)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <FiArrowLeft size={16} />
          Back to Chat
        </button>

        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '8px 12px 6px',
        }}>
          Settings
        </div>

        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', background: pathname === item.href ? 'var(--bg-active)' : 'transparent' }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 40px',
      }}>
        <motion.div
          key={pathname}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          style={{ maxWidth: 640 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

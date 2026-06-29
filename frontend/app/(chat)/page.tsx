'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Home Page — Katteb-style welcome screen
   Large greeting, centered input with action chips, 4-column suggestion cards
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  PenSquare, Sparkles, FileText, Code2, Bot
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import InputBar from '@/components/chat/InputBar';
import { staggerContainer, fadeInUp } from '@/lib/motion';

const SUGGESTION_CARDS = [
  {
    icon: <PenSquare size={16} />,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Write Content',
    description: 'Draft emails, articles, blog posts and creative pieces.',
    prompt: 'Help me write a compelling blog post about',
  },
  {
    icon: <Sparkles size={16} />,
    color: '#ec4899',
    bg: '#fdf2f8',
    title: 'Creative Ideas',
    description: 'Generate catchy headlines, slogans and brainstorm ideas.',
    prompt: 'Give me 5 creative headline ideas for',
  },
  {
    icon: <FileText size={16} />,
    color: '#f59e0b',
    bg: '#fffbeb',
    title: 'Summarize Text',
    description: 'Paste a long article and get a concise summary.',
    prompt: 'Please summarize the following text:',
  },
  {
    icon: <Code2 size={16} />,
    color: '#10b981',
    bg: '#f0fdf4',
    title: 'Code Assistant',
    description: 'Write code, debug errors and review pull requests.',
    prompt: 'Help me write a function that',
  },
];

export default function HomePage() {
  const { user } = useAuthStore();

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  const firstName = user?.username || 'there';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--bg-secondary)',
    }}>
      {/* Scrollable content area */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 24px',
        gap: 0,
      }}>

        {/* ── Logo orb ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            width: 72, height: 72,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #374151, #111827)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 30,
            marginBottom: 22,
            boxShadow: '0 8px 32px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.08)',
          }}
        >
          <Bot size={32} />
        </motion.div>

        {/* ── Greeting ────────────────────────────────────── */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          style={{
            fontSize: 34, fontWeight: 700,
            color: 'var(--text-heading)',
            textAlign: 'center', margin: 0, lineHeight: 1.25,
          }}
        >
          {getGreeting()}, {firstName}
        </motion.h1>

        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          style={{
            fontSize: 30, fontWeight: 700,
            textAlign: 'center', margin: '4px 0 32px', lineHeight: 1.25,
            color: 'var(--text-heading)',
          }}
        >
          How Can I{' '}
          <span style={{ color: '#4f46e5' }}>Assist You Today?</span>
        </motion.h2>

        {/* ── Input area ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.4 }}
          style={{ width: '100%', maxWidth: 'var(--max-content-width)' }}
        >
          <InputBar />
        </motion.div>

        {/* ── Suggestion cards ────────────────────────────── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            maxWidth: 'var(--max-content-width)',
            width: '100%',
            marginTop: 16,
          }}
        >
          {SUGGESTION_CARDS.map((card) => (
            <motion.button
              key={card.title}
              variants={fadeInUp}
              onClick={() => {}}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid rgba(0, 0, 0, 0.05)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 14px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--transition-normal)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.02), 0 2px 4px rgba(0, 0, 0, 0.01)',
              }}
              whileHover={{ y: -3, boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05)', borderColor: 'rgba(0, 0, 0, 0.08)' }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Icon */}
              <div style={{
                width: 34, height: 34,
                borderRadius: 'var(--radius-md)',
                background: card.bg,
                color: card.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10,
              }}>
                {card.icon}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>
                {card.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {card.description}
              </div>
            </motion.button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

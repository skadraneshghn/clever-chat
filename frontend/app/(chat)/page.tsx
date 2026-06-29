'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Home Page — New chat welcome screen with greeting and suggestion cards
   Matching the Katteb reference design
   ═══════════════════════════════════════════════════════════════════════════ */

import { motion } from 'motion/react';
import { RiRobot2Line } from 'react-icons/ri';
import { FiEdit3, FiZap, FiCode, FiFileText } from 'react-icons/fi';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import InputBar from '@/components/chat/InputBar';
import { fadeInUp, staggerContainer } from '@/lib/motion';

const suggestionCards = [
  {
    icon: <FiEdit3 size={18} />,
    color: 'var(--accent-primary)',
    bgColor: 'var(--accent-primary-soft)',
    title: 'Write Content',
    description: 'Draft emails, articles, blog posts, and creative writing pieces.',
  },
  {
    icon: <FiZap size={18} />,
    color: 'var(--accent-pink)',
    bgColor: 'var(--accent-pink-soft)',
    title: 'Creative Ideas',
    description: 'Generate creative and catchy headlines, slogans, and ideas.',
  },
  {
    icon: <FiFileText size={18} />,
    color: 'var(--accent-warning)',
    bgColor: 'var(--accent-warning-soft)',
    title: 'Summarize Text',
    description: 'Paste a long article or document and get a concise summary.',
  },
  {
    icon: <FiCode size={18} />,
    color: 'var(--accent-teal)',
    bgColor: 'var(--accent-teal-soft)',
    title: 'Code Assistant',
    description: 'Write code, debug errors, explain algorithms, and review PRs.',
  },
];

export default function HomePage() {
  const { user } = useAuthStore();

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Center content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        gap: 0,
      }}>
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 28,
            marginBottom: 24,
            boxShadow: '0 8px 32px rgba(79, 70, 229, 0.2)',
          }}
        >
          <RiRobot2Line />
        </motion.div>

        {/* Greeting */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: 'var(--text-heading)',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {getGreeting()}, {user?.username || 'there'}
        </motion.h1>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          style={{
            fontSize: 28,
            fontWeight: 600,
            textAlign: 'center',
            margin: '4px 0 32px',
            lineHeight: 1.3,
          }}
        >
          How Can I{' '}
          <span style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Assist You Today?
          </span>
        </motion.h2>

        {/* Input Bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          style={{ width: '100%', maxWidth: 'var(--max-content-width)' }}
        >
          <InputBar />
        </motion.div>

        {/* Suggestion Cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            maxWidth: 'var(--max-content-width)',
            width: '100%',
            marginTop: 8,
            padding: '0 24px',
          }}
        >
          {suggestionCards.map((card) => (
            <motion.div
              key={card.title}
              variants={fadeInUp}
              className="card card-interactive"
              style={{
                padding: 16,
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                background: card.bgColor,
                color: card.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}>
                {card.icon}
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-heading)',
                marginBottom: 4,
              }}>
                {card.title}
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}>
                {card.description}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

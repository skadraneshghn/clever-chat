'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MessageStream — Scrollable message list with auto-scroll
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FiArrowDown } from 'react-icons/fi';
import { useChatStore } from '@/stores/chatStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from 'next-themes';
import MessageBubble from './MessageBubble';

export default function MessageStream() {
  const { messages, isStreaming, streamingContent } = useChatStore();
  const { preferences } = usePreferencesStore();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streamingContent]);

  // Detect scroll position
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Filter active branch messages for linear display
  const activeMessages = messages.filter((m) => m.is_active_branch);

  const isDark = resolvedTheme === 'dark';

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px',
        position: 'relative',
        background: isDark
          ? 'linear-gradient(180deg, #090d16 0%, #0d121f 50%, #171d2c 100%)'
          : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 40%, #f1f5f9 100%)',
      }}
    >
      {/* ── Background Pattern Overlay ────────────────────── */}
      {preferences.chat_bg_pattern === 'dots' && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'radial-gradient(var(--accent-primary) 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
          opacity: isDark ? 0.05 : 0.07,
        }} />
      )}
      {preferences.chat_bg_pattern === 'stripes' && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, var(--accent-primary), var(--accent-primary) 1px, transparent 1px, transparent 18px)',
          opacity: isDark ? 0.04 : 0.06,
        }} />
      )}
      {preferences.chat_bg_pattern === 'polygons' && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: isDark ? 0.04 : 0.06, zIndex: 0 }}>
          <defs>
            <pattern id="polyPattern" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M0 0 L30 30 L60 0 M30 30 L30 60 M0 60 L30 30 L60 60" fill="none" stroke="var(--accent-primary)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#polyPattern)" />
        </svg>
      )}
      {preferences.chat_bg_pattern === 'temple' && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: isDark ? 0.05 : 0.08, zIndex: 0 }}>
          <defs>
            <pattern id="doodlePattern" width="140" height="140" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="var(--accent-primary)" strokeWidth="0.6">
                <path d="M15 15 L35 22 L23 27 Z M23 27 L25 35 L30 28" />
                <path d="M55 20 L57 23 L62 23 L58 26 L60 31 L55 28 L50 31 L52 26 L48 23 L53 23 Z" />
                <rect x="85" y="15" width="20" height="12" rx="3" />
                <path d="M90 27 L88 31 L94 27" />
                <path d="M15 70 Q 20 65, 25 70 T 35 70" />
                <path d="M60 75 L60 85 M57 80 L63 80" />
                <path d="M98 70 C95 67, 91 70, 95 76 L98 80 L101 76 C105 70, 101 67, 98 70 Z" />
                <rect x="45" y="105" width="12" height="12" rx="1.5" />
                <line x1="45" y1="108" x2="57" y2="108" />
                <line x1="45" y1="112" x2="53" y2="112" />
                <path d="M95 110 C92 110, 90 113, 93 116 C91 118, 93 121, 96 121 C98 121, 99 119, 100 117 C102 117, 103 115, 101 112 C100 110, 97 110, 95 110 Z" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#doodlePattern)" />
        </svg>
      )}
      {['pattern1', 'pattern2', 'pattern3', 'pattern4', 'pattern5'].includes(preferences.chat_bg_pattern) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          backgroundImage: `url(/patterns/${preferences.chat_bg_pattern}.png)`,
          backgroundSize: ['pattern4', 'pattern5'].includes(preferences.chat_bg_pattern) ? '180px 180px' : '100px 100px',
          backgroundRepeat: 'repeat',
          filter: isDark ? 'invert(0.9) brightness(1.2)' : 'none',
          mixBlendMode: isDark ? 'screen' : 'multiply',
          opacity: isDark ? 0.08 : 0.22,
        }} />
      )}

      {/* Message content relative wrapper */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <AnimatePresence mode="popLayout">
          {activeMessages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={idx === activeMessages.length - 1}
            />
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <MessageBubble
              key="streaming"
              message={{
                id: 'streaming',
                conversation_id: '',
                parent_message_id: null,
                role: 'assistant',
                content: [{ type: 'text', text: streamingContent }],
                model_id: null,
                input_tokens: null,
                output_tokens: null,
                latency_ms: null,
                is_active_branch: true,
                created_at: new Date().toISOString(),
                sender_id: null,
                sender_username: null,
                hidden_from_owner: false,
              }}
              isStreaming={true}
              streamingContent={streamingContent}
              isLast={true}
            />
          )}

          {/* Loading indicator when streaming starts but no content yet */}
          {isStreaming && !streamingContent && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                gap: 12,
                padding: '16px 0',
                maxWidth: 'var(--max-content-width)',
                margin: '0 auto',
                alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-primary-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  ✨
                </motion.div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8 }}>
                  CleverChat
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--accent-primary)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            style={{
              position: 'sticky',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-pill)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-md)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              zIndex: 10,
            }}
          >
            <FiArrowDown size={16} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

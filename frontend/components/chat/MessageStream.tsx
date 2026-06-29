'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MessageStream — Scrollable message list with auto-scroll
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FiArrowDown } from 'react-icons/fi';
import { useChatStore } from '@/stores/chatStore';
import MessageBubble from './MessageBubble';

export default function MessageStream() {
  const { messages, isStreaming, streamingContent } = useChatStore();
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

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px',
        position: 'relative',
      }}
    >
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

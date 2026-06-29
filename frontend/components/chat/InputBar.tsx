'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   InputBar — Chat input with action buttons, model selector, file attach
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import {
  FiSend, FiPaperclip, FiMic, FiImage, FiSquare, FiZap,
} from 'react-icons/fi';
import { RiSparklingLine, RiImageAddLine, RiSearchEyeLine } from 'react-icons/ri';
import { useChatStore } from '@/stores/chatStore';
import { useSSEStream } from '@/hooks/useSSEStream';
import { usePreferencesStore } from '@/stores/preferencesStore';

interface InputBarProps {
  conversationId?: string | null;
}

export default function InputBar({ conversationId }: InputBarProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isStreaming } = useChatStore();
  const { sendMessage, stopStream } = useSSEStream();
  const { preferences } = usePreferencesStore();

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming) return;

    sendMessage({
      conversation_id: conversationId || undefined,
      message: trimmed,
      model_id: preferences.default_model_id,
      temperature: preferences.default_temperature,
      max_tokens: preferences.default_max_tokens,
      system_prompt: preferences.default_system_prompt || undefined,
    });
    setMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, isStreaming, sendMessage, conversationId, preferences]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && preferences.send_on_enter) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const quickActions = [
    { icon: <FiPaperclip size={15} />, label: 'Attach', onClick: () => {} },
    { icon: <RiSparklingLine size={15} />, label: 'Reasoning', onClick: () => {} },
    { icon: <RiImageAddLine size={15} />, label: 'Create Image', onClick: () => {} },
    { icon: <RiSearchEyeLine size={15} />, label: 'Deep Research', onClick: () => {} },
  ];

  return (
    <div style={{
      padding: '0 24px 24px',
      maxWidth: 'var(--max-content-width)',
      margin: '0 auto',
      width: '100%',
    }}>
      <motion.div
        animate={isFocused ? { boxShadow: 'var(--shadow-input-focus)' } : { boxShadow: 'var(--shadow-card)' }}
        transition={{ duration: 0.2 }}
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${isFocused ? 'var(--border-input-focus)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          transition: 'border-color var(--transition-fast)',
        }}
      >
        {/* Textarea */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              fontSize: 18,
              lineHeight: '24px',
              marginTop: 2,
            }}>
              ✨
            </span>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Initiate a query or send a command to the AI..."
              rows={1}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                resize: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 14,
                lineHeight: '1.6',
                fontFamily: 'inherit',
                minHeight: 24,
                maxHeight: 200,
              }}
            />
          </div>
        </div>

        {/* Bottom action bar */}
        <div style={{
          padding: '6px 12px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 10px',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap',
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
                {action.icon}
                <span style={{ fontWeight: 450 }}>{action.label}</span>
              </button>
            ))}
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={stopStream}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-error)',
                border: 'none',
                cursor: 'pointer',
                color: 'white',
                transition: 'all var(--transition-fast)',
              }}
              title="Stop generating"
            >
              <FiSquare size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!message.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-pill)',
                background: message.trim() ? 'var(--accent-primary)' : 'var(--surface-2)',
                border: 'none',
                cursor: message.trim() ? 'pointer' : 'default',
                color: message.trim() ? 'white' : 'var(--text-muted)',
                transition: 'all var(--transition-fast)',
              }}
              title="Send message"
            >
              <FiSend size={15} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Keyboard hint */}
      <div style={{
        textAlign: 'center',
        marginTop: 8,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        {preferences.send_on_enter ? 'Press Enter to send, Shift+Enter for new line' : 'Press Ctrl+Enter to send'}
      </div>
    </div>
  );
}

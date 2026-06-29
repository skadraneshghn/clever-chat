'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   InputBar — Chat input with action buttons, model selector, file attach
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import {
  Send, Paperclip, Square, Sparkles, ImagePlus, LineChart
} from 'lucide-react';
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

  return (
    <div style={{
      padding: '0 24px 24px',
      maxWidth: 'var(--max-content-width)',
      margin: '0 auto',
      width: '100%',
    }}>
      <motion.div
        animate={isFocused ? { 
          boxShadow: '0 10px 30px rgba(79, 70, 229, 0.08), 0 2px 12px rgba(79, 70, 229, 0.03)',
          borderColor: 'rgba(79, 70, 229, 0.4)' 
        } : { 
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.03), 0 2px 8px rgba(0, 0, 0, 0.02)',
          borderColor: 'rgba(0, 0, 0, 0.07)'
        }}
        transition={{ duration: 0.2 }}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
        }}
      >
        {/* Textarea */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              fontSize: 18,
              lineHeight: '24px',
              marginTop: 2,
              opacity: 0.8,
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
          background: 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Attach button (standalone icon) */}
            <button
              onClick={() => {}}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                color: 'var(--text-secondary)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                boxShadow: 'var(--shadow-xs)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-1)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              title="Attach File"
            >
              <Paperclip size={14} />
            </button>

            {/* Chips (Reasoning, Create Image, Deep Research) */}
            {[
              { icon: <Sparkles size={14} color="#6366f1" />, label: 'Reasoning' },
              { icon: <ImagePlus size={14} color="#ec4899" />, label: 'Create Image' },
              { icon: <LineChart size={14} color="#f59e0b" />, label: 'Deep Research' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => {}}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap',
                  boxShadow: 'var(--shadow-xs)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)';
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-card)';
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {action.icon}
                <span>{action.label}</span>
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
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-error)',
                border: 'none',
                cursor: 'pointer',
                color: 'white',
                transition: 'all var(--transition-fast)',
              }}
              title="Stop generating"
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!message.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                background: message.trim() ? '#111827' : 'var(--surface-3)',
                border: 'none',
                cursor: message.trim() ? 'pointer' : 'default',
                color: message.trim() ? 'white' : 'var(--text-muted)',
                transition: 'all var(--transition-fast)',
              }}
              title="Send message"
            >
              <Send size={13} style={{ transform: message.trim() ? 'rotate(-45deg) translate(1px, -1px)' : 'none', transition: 'transform 0.15s ease' }} />
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

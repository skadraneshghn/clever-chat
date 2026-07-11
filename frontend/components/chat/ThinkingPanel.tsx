'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   ThinkingPanel — Collapsible reasoning / chain-of-thought explorer
   Renders the model's "thinking" stream in a beautiful, explorable panel.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Brain, ChevronDown, Copy, Check, Sparkles } from 'lucide-react';

interface ThinkingPanelProps {
  content: string;
  isStreaming?: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default function ThinkingPanel({ content, isStreaming = false }: ThinkingPanelProps) {
  const [expanded, setExpanded] = useState(isStreaming);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const prevStreamingRef = useRef(isStreaming);

  // Live elapsed timer while thinking tokens are streaming in
  useEffect(() => {
    if (!isStreaming) return;
    if (startRef.current === null) startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Auto-collapse to a compact bar once the thinking phase completes
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setExpanded(false);
      if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readMinutes = Math.max(1, Math.round(wordCount / 220));

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusLabel = isStreaming
    ? `Thinking · ${formatDuration(elapsed)}`
    : elapsed > 0
      ? `Thought for ${formatDuration(elapsed)}`
      : `${wordCount} words · ${readMinutes} min read`;

  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-1)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Animated top accent line while streaming */}
      {isStreaming && (
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.4, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            transformOrigin: 'left center',
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple), var(--accent-secondary))',
          }}
        />
      )}

      {/* Header bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'left',
        }}
      >
        {/* Icon */}
        <motion.span
          animate={isStreaming ? { rotate: [0, 8, -8, 0] } : { rotate: 0 }}
          transition={isStreaming ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary-soft)',
            color: 'var(--accent-primary)',
            flexShrink: 0,
          }}
        >
          {isStreaming ? <Sparkles size={14} /> : <Brain size={14} />}
        </motion.span>

        {/* Status label */}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              color: isStreaming ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
            }}
          >
            {statusLabel}
          </span>
          {isStreaming && (
            <span style={{ display: 'inline-flex', gap: 3 }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--accent-primary)',
                    display: 'inline-block',
                  }}
                />
              ))}
            </span>
          )}
        </span>

        {/* Chevron */}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', color: 'var(--text-muted)' }}
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ position: 'relative' }}>
              {/* Left accent rail */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: 'linear-gradient(180deg, var(--accent-primary), var(--accent-purple))',
                  opacity: 0.6,
                }}
              />
              <div
                style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  padding: '4px 16px 12px 18px',
                }}
              >
                <div className="thinking-content" dir="auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  {isStreaming && (
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      style={{
                        display: 'inline-block',
                        width: 7,
                        height: 15,
                        background: 'var(--accent-primary)',
                        borderRadius: 2,
                        marginLeft: 2,
                        verticalAlign: 'text-bottom',
                      }}
                    />
                  )}
                </div>
              </div>
              {/* Bottom fade hint */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 28,
                  background: 'linear-gradient(180deg, transparent, var(--surface-1))',
                  pointerEvents: 'none',
                }}
              />
            </div>

            {/* Footer toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 14px 10px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {wordCount} words
              </span>
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-2)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

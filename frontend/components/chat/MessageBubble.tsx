'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MessageBubble — User & AI chat messages with markdown rendering
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  FiCopy, FiCheck, FiRefreshCw, FiEdit3, FiThumbsUp,
  FiThumbsDown, FiShare2, FiMoreHorizontal,
} from 'react-icons/fi';
import { RiRobot2Line, RiUser3Line } from 'react-icons/ri';
import { messageAppear } from '@/lib/motion';
import type { Message, ContentBlock } from '@/types';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
  isLast?: boolean;
}

export default function MessageBubble({ message, isStreaming, streamingContent, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [hovering, setHovering] = useState(false);
  const isUser = message.role === 'user';

  // Extract text content
  const textContent = message.content
    .filter((b: ContentBlock) => b.type === 'text')
    .map((b: ContentBlock) => b.text || '')
    .join('');
  const displayContent = isStreaming ? (streamingContent || '') : textContent;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      variants={messageAppear}
      initial="hidden"
      animate="visible"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: 'flex',
        gap: 12,
        padding: '16px 0',
        maxWidth: 'var(--max-content-width)',
        margin: '0 auto',
        width: '100%',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-pill)',
        background: isUser ? 'var(--surface-2)' : 'var(--accent-primary-soft)',
        color: isUser ? 'var(--text-secondary)' : 'var(--accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 14,
        marginTop: 2,
      }}>
        {isUser ? <RiUser3Line size={16} /> : <RiRobot2Line size={16} />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Role label */}
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-heading)',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {isUser ? 'You' : 'CleverChat'}
          {!isUser && message.model_id && (
            <span className="badge badge-accent" style={{ fontSize: 11 }}>
              {message.model_id}
            </span>
          )}
        </div>

        {/* Message body */}
        <div className={`message-content ${isStreaming && isLast ? 'streaming-cursor' : ''}`} dir="auto">
          {isUser ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} dir="auto">{displayContent}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const code = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <div style={{ position: 'relative', margin: '12px 0' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 12px',
                          background: 'var(--surface-2)',
                          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize: 12,
                          color: 'var(--text-muted)',
                        }}>
                          <span style={{ fontWeight: 500 }}>{match[1]}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(code);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              fontSize: 12,
                            }}
                          >
                            {copied ? <FiCheck size={13} /> : <FiCopy size={13} />}
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneLight as any}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                            fontSize: 13,
                            padding: 16,
                            background: 'var(--surface-1)',
                          }}
                        >
                          {code}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
              }}
            >
              {displayContent}
            </ReactMarkdown>
          )}
        </div>

        {/* Token info */}
        {!isUser && message.input_tokens && !isStreaming && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 8,
            display: 'flex',
            gap: 12,
          }}>
            {message.input_tokens && <span>{message.input_tokens} input tokens</span>}
            {message.output_tokens && <span>{message.output_tokens} output tokens</span>}
            {message.latency_ms && <span>{(message.latency_ms / 1000).toFixed(1)}s</span>}
          </div>
        )}

        {/* Action bar */}
        {!isUser && !isStreaming && hovering && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              gap: 2,
              marginTop: 8,
            }}
          >
            {[
              { icon: copied ? <FiCheck size={14} /> : <FiCopy size={14} />, title: 'Copy', onClick: handleCopy },
              { icon: <FiRefreshCw size={14} />, title: 'Regenerate', onClick: () => {} },
              { icon: <FiThumbsUp size={14} />, title: 'Good', onClick: () => {} },
              { icon: <FiThumbsDown size={14} />, title: 'Bad', onClick: () => {} },
              { icon: <FiShare2 size={14} />, title: 'Share', onClick: () => {} },
            ].map((action) => (
              <button
                key={action.title}
                onClick={action.onClick}
                title={action.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                {action.icon}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

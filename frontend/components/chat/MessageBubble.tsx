'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MessageBubble — User & AI chat messages with markdown rendering
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  FiCopy, FiCheck, FiRefreshCw, FiEdit3, FiThumbsUp,
  FiThumbsDown, FiShare2, FiMoreHorizontal, FiEye, FiEyeOff,
  FiFileText, FiMusic, FiVideo, FiDownload,
} from 'react-icons/fi';
import { RiRobot2Line, RiUser3Line } from 'react-icons/ri';
import { messageAppear } from '@/lib/motion';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import type { Message, ContentBlock } from '@/types';
import { ImageGallery, type GalleryImage } from './ImageGallery';
import { ZoomIn } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
  isLast?: boolean;
}

export default function MessageBubble({ message, isStreaming, streamingContent, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState<number | null>(null);
  const isUser = message.role === 'user';

  const { conversations, toggleMessageVisibility } = useChatStore();
  const { user } = useAuthStore();

  const activeConv = conversations.find((c) => c.id === message.conversation_id);
  const isShared = activeConv?.is_shared || false;

  const senderLabel = isUser
    ? (message.sender_id === user?.id ? 'You' : (message.sender_username ? `@${message.sender_username}` : 'User'))
    : 'CleverChat';

  const isOwnerMessage = message.sender_id === activeConv?.user_id;

  // Extract text content
  const textContent = message.content
    .filter((b: ContentBlock) => b.type === 'text')
    .map((b: ContentBlock) => b.text || '')
    .join('');
  const displayContent = isStreaming ? (streamingContent || '') : textContent;

  // Extract image blocks for rendering
  const imageBlocks = message.content.filter(
    (b: ContentBlock) => b.type === 'image_url' || b.type === 'image'
  );

  // Extract non-image media files for rendering
  const mediaBlocks = message.content.filter(
    (b: ContentBlock) => b.type === 'document' || b.type === 'audio'
  );

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const tokenSuffix = token ? `?token=${token}` : '';

  // For AI messages: build a GalleryImage list from image_url blocks
  const galleryImages: GalleryImage[] = !isUser
    ? imageBlocks.map((b: ContentBlock) => ({
        url: b.asset_id ? `/api/v1/media/${b.asset_id}${tokenSuffix}` : (b.url || b.image_url?.url || ''),
        thumbnailUrl: b.asset_id ? `/api/v1/media/${b.asset_id}/thumbnail${tokenSuffix}` : (b.url || b.image_url?.url || ''),
        assetId: b.asset_id,
      }))
    : [];

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
          {isUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{senderLabel}</span>
              {isOwnerMessage && isShared && (
                <span style={{ fontSize: 10, background: 'rgba(99, 102, 241, 0.15)', color: '#4f46e5', padding: '1px 5px', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
                  Owner
                </span>
              )}
              {message.hidden_from_owner && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-error)', fontWeight: 500, marginLeft: 4 }}>
                  <FiEyeOff size={11} /> Hidden from Owner
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>CleverChat</span>
              {message.sender_username && isShared && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                  in response to {message.sender_id === user?.id ? 'You' : `@${message.sender_username}`}
                </span>
              )}
              {message.hidden_from_owner && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-error)', fontWeight: 500, marginLeft: 4 }}>
                  <FiEyeOff size={11} /> Hidden Response
                </span>
              )}
            </div>
          )}
          {!isUser && message.model_id && (
            <span className="badge badge-accent" style={{ fontSize: 11 }}>
              {message.model_id}
            </span>
          )}
        </div>

        {/* Message body */}
        <div className={`message-content ${isStreaming && isLast ? 'streaming-cursor' : ''}`} dir="auto">
          {isUser ? (
            <div>
              {/* Attached images */}
              {imageBlocks.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: displayContent ? 10 : 0,
                }}>
                  {imageBlocks.map((block, i) => {
                    const src = block.asset_id
                      ? `/api/v1/media/${block.asset_id}/thumbnail${tokenSuffix}`
                      : (block.url || block.image_url?.url || '');
                    const fullSrc = block.asset_id
                      ? `/api/v1/media/${block.asset_id}${tokenSuffix}`
                      : src;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{
                          width: 96, height: 96,
                          borderRadius: 10,
                          overflow: 'hidden',
                          cursor: 'zoom-in',
                          border: '1px solid var(--border-subtle)',
                          flexShrink: 0,
                          position: 'relative',
                        }}
                        onClick={() => setLightboxUrl(fullSrc)}
                        title="Click to expand"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt="Attached image"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Attached documents, audio, or video files */}
              {mediaBlocks.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginBottom: displayContent ? 12 : 0,
                  maxWidth: 500,
                }}>
                  {mediaBlocks.map((block, i) => {
                    const fileUrl = block.asset_id
                      ? `/api/v1/media/${block.asset_id}${tokenSuffix}`
                      : block.url;
                    
                    const isAudio = block.type === 'audio' || !!block.mime_type?.startsWith('audio/');
                    const isVideo = !!block.mime_type?.startsWith('video/');

                    return (
                      <div
                        key={i}
                        style={{
                          background: 'rgba(30, 41, 59, 0.45)',
                          border: '1px solid var(--border-subtle, #334155)',
                          borderRadius: 'var(--radius-lg, 12px)',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          transition: 'border-color var(--transition-fast)'
                        }}
                      >
                        {/* Icon Container */}
                        <div style={{
                          width: 40, height: 40,
                          borderRadius: 'var(--radius-md, 8px)',
                          background: isAudio ? 'rgba(139, 92, 246, 0.15)' : (isVideo ? 'rgba(249, 115, 22, 0.15)' : 'rgba(99, 102, 241, 0.15)'),
                          color: isAudio ? '#8b5cf6' : (isVideo ? '#f97316' : '#6366f1'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18,
                          flexShrink: 0
                        }}>
                          {isAudio ? <FiMusic /> : (isVideo ? <FiVideo /> : <FiFileText />)}
                        </div>

                        {/* Title & Metadata */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#f8fafc',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block'
                          }}>
                            {block.filename || 'Attached Asset'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                            {block.mime_type && <span>{block.mime_type.split('/').pop()?.toUpperCase()}</span>}
                            {block.duration_ms && (
                              <>
                                <span>•</span>
                                <span>{Math.round(block.duration_ms / 1000)}s</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {fileUrl && (
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL || ''}${fileUrl}`}
                            download={block.filename || 'download'}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              width: 32, height: 32,
                              borderRadius: '50%',
                              background: '#1e293b',
                              color: '#cbd5e1',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                              border: '1px solid var(--border-subtle, #334155)',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#fff'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#cbd5e1'; }}
                            title="Download/Open attachment"
                          >
                            <FiDownload size={13} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {displayContent && (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} dir="auto">{displayContent}</p>
              )}
            </div>
          ) : (
            <div>
              {/* ── AI-generated image grid ─────────────────────────────── */}
              {galleryImages.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: galleryImages.length === 1
                    ? '1fr'
                    : galleryImages.length === 2
                      ? '1fr 1fr'
                      : '1fr 1fr',
                  gap: 8,
                  marginBottom: displayContent ? 14 : 0,
                  maxWidth: galleryImages.length === 1 ? 520 : '100%',
                }}>
                  {galleryImages.map((img, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.06 }}
                      style={{
                        position: 'relative',
                        borderRadius: 14,
                        overflow: 'hidden',
                        cursor: 'zoom-in',
                        aspectRatio: '1',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                      }}
                      onClick={() => setGalleryStartIndex(i)}
                      whileHover={{ scale: 1.015 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.thumbnailUrl
                          ? (img.thumbnailUrl.startsWith('http') ? img.thumbnailUrl : `${process.env.NEXT_PUBLIC_API_URL || ''}${img.thumbnailUrl}`)
                          : (img.url.startsWith('http') ? img.url : `${process.env.NEXT_PUBLIC_API_URL || ''}${img.url}`)}
                        alt={`Generated image ${i + 1}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                      {/* Hover overlay */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s',
                      }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLDivElement;
                          el.style.background = 'rgba(0,0,0,0.28)';
                          const icon = el.querySelector('svg') as SVGElement | null;
                          if (icon) icon.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLDivElement;
                          el.style.background = 'rgba(0,0,0,0)';
                          const icon = el.querySelector('svg') as SVGElement | null;
                          if (icon) icon.style.opacity = '0';
                        }}
                      >
                        <ZoomIn size={28} color="white" style={{ opacity: 0, transition: 'opacity 0.2s', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── Markdown text ─────────────────────────────────────────── */}
              {displayContent && (
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
          )}
        </div>

        {/* Full-screen gallery for AI-generated images */}
        {galleryImages.length > 0 && galleryStartIndex !== null && (
          <ImageGallery
            images={galleryImages}
            initialIndex={galleryStartIndex}
            onClose={() => setGalleryStartIndex(null)}
          />
        )}

        {/* Image lightbox */}
        <AnimatePresence>
          {lightboxUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxUrl(null)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.85)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'zoom-out',
              }}
            >
              <motion.img
                src={lightboxUrl}
                alt="Full size"
                initial={{ scale: 0.85 }}
                animate={{ scale: 1 }}
                style={{
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                  borderRadius: 12,
                  boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                  objectFit: 'contain',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* Action bar for user messages inside shared chats */}
        {isUser && isShared && message.sender_id === user?.id && !isStreaming && hovering && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            <button
              onClick={async () => {
                try {
                  await toggleMessageVisibility(message.id);
                  toast.success(!message.hidden_from_owner ? 'Message is now hidden from the owner.' : 'Message is now visible to the owner.');
                } catch (e) {
                  toast.error('Failed to toggle visibility.');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                fontSize: 11.5,
                fontWeight: 500,
                color: message.hidden_from_owner ? 'var(--accent-error)' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--surface-1)';
              }}
            >
              {message.hidden_from_owner ? <FiEye size={13} /> : <FiEyeOff size={13} />}
              <span>{message.hidden_from_owner ? 'Show to Owner' : 'Hide from Owner'}</span>
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

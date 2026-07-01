'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   InputBar — Chat input with redesigned capsule layout, model badge,
   active file attachment state, and speech-to-text placeholder feature
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useRef, useCallback, KeyboardEvent } from 'react';
import {
  Paperclip, Mic, ArrowUp, X, Square, Zap, Eye, EyeOff, Sparkles,
  FileText, Video, Music
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatStore } from '@/stores/chatStore';
import { useSSEStream } from '@/hooks/useSSEStream';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useProviderStore } from '@/stores/providerStore';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import ResourceModal from './ResourceModal';

interface InputBarProps {
  conversationId?: string | null;
}

export default function InputBar({ conversationId }: InputBarProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isStreaming, conversations, pendingAttachments, addAttachment, updateAttachment, removeAttachment,
    imageGenerationMode, imageCount, toggleImageGenerationMode, setImageCount,
    activeChatResourceIds, fetchActiveChatResources, files, fetchFiles, detachResourceFromChat,
    activeConversationId,
    createConversation,
  } = useChatStore();
  const { sendMessage, stopStream } = useSSEStream();
  const { preferences, updatePreferences, reasoningOnly, setReasoningOnly } = usePreferencesStore();
  const { availableModels } = useProviderStore();
  const effectiveConversationId = conversationId || activeConversationId;

  useEffect(() => {
    if (effectiveConversationId) {
      fetchActiveChatResources(effectiveConversationId);
      fetchFiles();
    }
  }, [effectiveConversationId, fetchActiveChatResources, fetchFiles]);

  const attachedResources = files.filter((f) => activeChatResourceIds.includes(f.id));

  const handleAttachClick = async () => {
    if (!effectiveConversationId) {
      try {
        await createConversation('New Chat');
        setTimeout(() => setResourceModalOpen(true), 50);
      } catch {
        toast.error('Failed to start a new chat session for attachments');
      }
    } else {
      setResourceModalOpen(true);
    }
  };

  const activeConv = conversations.find(c => c.id === effectiveConversationId);
  const isShared = activeConv?.is_shared || false;
  const [hiddenFromOwner, setHiddenFromOwner] = useState(false);

  const currentModel = availableModels.find((m) => m.model_id === preferences.default_model_id);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    const hasReadyAttachments = pendingAttachments.some((a) => a.status === 'done');
    if (!trimmed && !hasReadyAttachments) return;
    if (isStreaming) return;
    // Block send if any attachment is still uploading
    if (pendingAttachments.some((a) => a.status === 'uploading')) {
      toast.warning('Please wait for uploads to finish.');
      return;
    }

    const mergedMediaAssetIds = Array.from(new Set([
      ...activeChatResourceIds,
      ...pendingAttachments.filter((a) => a.status === 'done' && a.assetId).map((a) => a.assetId as string),
    ]));

    sendMessage({
      conversation_id: effectiveConversationId || undefined,
      message: trimmed,
      model_id: preferences.default_model_id,
      temperature: preferences.default_temperature,
      max_tokens: preferences.default_max_tokens,
      system_prompt: preferences.default_system_prompt || undefined,
      hidden_from_owner: hiddenFromOwner,
      media_asset_ids: mergedMediaAssetIds.length > 0 ? mergedMediaAssetIds : undefined,
    });

    setMessage('');
    setHiddenFromOwner(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, pendingAttachments, isStreaming, sendMessage, effectiveConversationId, preferences, hiddenFromOwner, activeChatResourceIds, setHiddenFromOwner]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && preferences.send_on_enter) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  /** Upload a single image file to the server, updating the attachment store. */
  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(`Only images are supported. Skipping "${file.name}".`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`"${file.name}" exceeds the 20 MB limit.`);
      return;
    }

    const clientId = `${Date.now()}-${Math.random()}`;
    const previewUrl = URL.createObjectURL(file);
    addAttachment({ clientId, file, status: 'uploading', previewUrl });

    try {
      const result = await api.uploadMedia(file);
      updateAttachment(clientId, {
        status: 'done',
        assetId: result.id,
        thumbnailUrl: result.thumbnail_url
          ? `${process.env.NEXT_PUBLIC_API_URL || ''}${result.thumbnail_url}`
          : undefined,
        url: `${process.env.NEXT_PUBLIC_API_URL || ''}${result.url}`,
      });
    } catch {
      updateAttachment(clientId, { status: 'error' });
      toast.error(`Upload failed for "${file.name}"`);
    }
  }, [addAttachment, updateAttachment]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(uploadFile);
    // Reset input so same file can be picked again
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  };

  const toggleListening = () => {
    setIsListening(!isListening);
    if (!isListening) {
      toast.info('Voice typing activated. Start speaking...');
    } else {
      toast.success('Voice typing completed');
    }
  };

  return (
    <div style={{
      padding: '0 24px 24px',
      maxWidth: 'var(--max-content-width)',
      margin: '0 auto',
      width: '100%',
    }}>
      <style>{`
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        multiple
        style={{ display: 'none' }}
      />
      
      {/* Animated Wrapper acting as flowing border */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          padding: '1.5px',
          borderRadius: '20px',
          background: isDragOver
            ? 'linear-gradient(135deg, #4f46e5, #7c3aed, #4f46e5)'
            : 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-glow), var(--accent-primary-hover), var(--accent-primary))',
          backgroundSize: '200% 200%',
          animation: 'gradientMove 8s linear infinite',
          boxShadow: isFocused
            ? '0 8px 32px var(--accent-primary-glow), 0 2px 10px rgba(0, 0, 0, 0.05)'
            : '0 4px 16px rgba(0, 0, 0, 0.03)',
          transition: 'box-shadow var(--transition-medium)',
        }}
      >
        {/* Glow backdrop (behind) */}
        <div style={{
          position: 'absolute',
          inset: '-2px',
          borderRadius: '22px',
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-glow), var(--accent-primary-hover), var(--accent-primary))',
          backgroundSize: '200% 200%',
          animation: 'gradientMove 8s linear infinite',
          filter: 'blur(12px)',
          opacity: isFocused ? 0.32 : 0.12,
          pointerEvents: 'none',
          transition: 'opacity var(--transition-medium)',
          zIndex: -1,
        }} />

        {/* Outer Chat Box Container */}
        <div style={{
          background: 'var(--bg-sidebar)',
          borderRadius: '19px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}>
        {/* Drag-and-drop overlay */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', inset: 0,
                borderRadius: '19px',
                border: '2px dashed #6366f1',
                background: 'rgba(99,102,241,0.07)',
                backdropFilter: 'blur(2px)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 8,
                pointerEvents: 'none',
              }}
            >
              <Paperclip size={28} style={{ color: '#6366f1', opacity: 0.8 }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>Drop images here</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unified resources & local uploads preview strip */}
        <AnimatePresence>
          {(pendingAttachments.length > 0 || attachedResources.length > 0) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: '6px 4px 8px',
                overflow: 'hidden',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: '10px'
              }}
            >
              {/* Server attached resources */}
              {attachedResources.map((file) => {
                const isImage = file.mime_type.startsWith('image/');
                return (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    style={{
                      position: 'relative',
                      width: isImage ? 72 : 124,
                      height: 72,
                      borderRadius: 10,
                      overflow: 'visible',
                      flexShrink: 0,
                    }}
                  >
                    {isImage ? (
                      <div style={{
                        width: '100%', height: '100%',
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${process.env.NEXT_PUBLIC_API_URL || ''}${file.thumbnail_url || file.url}`}
                          alt={file.filename}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        borderRadius: 10,
                        background: 'var(--surface-1, #1e293b)',
                        border: '1px solid var(--border-subtle)',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {file.mime_type.startsWith('audio/') ? <Music size={13} style={{ color: '#8b5cf6' }} /> : (
                            file.mime_type.startsWith('video/') ? <Video size={13} style={{ color: '#f97316' }} /> : (
                              <FileText size={13} style={{ color: '#ef4444' }} />
                            )
                          )}
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                            {file.filename.split('.').pop() || 'doc'}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          width: '100%',
                          fontWeight: 500,
                          textAlign: 'left'
                        }}>
                          {file.filename}
                        </span>
                      </div>
                    )}

                    {/* Detach button */}
                    <button
                    onClick={() => effectiveConversationId && detachResourceFromChat(effectiveConversationId, file.id)}
                      style={{
                        position: 'absolute',
                        top: -6, right: -6,
                        width: 18, height: 18,
                        borderRadius: '50%',
                        background: '#111',
                        border: '1.5px solid rgba(255,255,255,0.2)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 2,
                        padding: 0,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#111'; }}
                      title="Detach file"
                    >
                      <X size={10} />
                    </button>
                  </motion.div>
                );
              })}

              {/* Local pending attachments */}
              {pendingAttachments.map((att) => (
                <motion.div
                  key={att.clientId}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  style={{
                    position: 'relative',
                    width: 72, height: 72,
                    borderRadius: 10,
                    overflow: 'visible',
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: '100%', height: '100%',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: att.status === 'error'
                      ? '2px solid #ef4444'
                      : '1px solid var(--border-subtle)',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={att.previewUrl || att.thumbnailUrl}
                      alt={att.file.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  {att.status === 'uploading' && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      borderRadius: 10,
                      background: 'rgba(0,0,0,0.45)',
                      backdropFilter: 'blur(1px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      <div style={{
                        width: 20, height: 20,
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'white',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                    </div>
                  )}

                  {att.status === 'error' && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      borderRadius: 10,
                      background: 'rgba(127,0,0,0.55)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      color: 'white',
                      fontWeight: 600,
                    }}>Failed</div>
                  )}

                  <button
                    onClick={() => removeAttachment(att.clientId)}
                    style={{
                      position: 'absolute',
                      top: -6, right: -6,
                      width: 18, height: 18,
                      borderRadius: '50%',
                      background: '#111',
                      border: '1.5px solid rgba(255,255,255,0.2)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 2,
                      padding: 0,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#111'; }}
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inner Textarea Input Area Card */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          padding: '12px 14px 10px',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={imageGenerationMode ? "Describe the image you want to generate..." : "What should be reviewed?"}
            dir="auto"
            rows={1}
            style={{
              width: '100%',
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
          
          {/* Action Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            {/* Left buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Resource attach button */}
              <button
                onClick={handleAttachClick}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  background: (pendingAttachments.length > 0 || attachedResources.length > 0) ? 'var(--accent-primary-soft)' : 'var(--bg-secondary)',
                  border: `1px solid ${(pendingAttachments.length > 0 || attachedResources.length > 0) ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  color: (pendingAttachments.length > 0 || attachedResources.length > 0) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  boxShadow: 'var(--shadow-xs)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)';
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = (pendingAttachments.length > 0 || attachedResources.length > 0) ? 'var(--accent-primary-soft)' : 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = (pendingAttachments.length > 0 || attachedResources.length > 0) ? 'var(--accent-primary)' : 'var(--border-default)';
                }}
                title="Attach chat resources"
              >
                <Paperclip size={14} />
              </button>

              {/* Image generation sparkle toggle */}
              <button
                onClick={toggleImageGenerationMode}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', height: 32,
                  fontSize: 12.5, fontWeight: 600,
                  color: imageGenerationMode ? '#8b5cf6' : 'var(--text-secondary)',
                  background: imageGenerationMode
                    ? 'rgba(139,92,246,0.12)'
                    : 'var(--bg-secondary)',
                  border: imageGenerationMode ? '1px solid #8b5cf6' : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  boxShadow: imageGenerationMode ? '0 0 10px rgba(139,92,246,0.25)' : 'var(--shadow-xs)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = imageGenerationMode
                    ? 'rgba(139,92,246,0.2)'
                    : 'var(--surface-1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = imageGenerationMode
                    ? 'rgba(139,92,246,0.12)'
                    : 'var(--bg-secondary)';
                }}
                title={imageGenerationMode ? 'Disable image generation' : 'Enable image generation'}
              >
                <Sparkles size={13} />
                <span>Image</span>
              </button>

              {/* Image count selector — visible when image gen is active */}
              <AnimatePresence>
                {imageGenerationMode && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    style={{
                      display: 'flex', gap: 4, overflow: 'hidden',
                    }}
                  >
                    {([1, 2, 4] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setImageCount(n)}
                        style={{
                          width: 28, height: 28,
                          borderRadius: 'var(--radius-sm)',
                          border: imageCount === n ? '1px solid #8b5cf6' : '1px solid var(--border-default)',
                          background: imageCount === n ? 'rgba(139,92,246,0.15)' : 'var(--bg-secondary)',
                          color: imageCount === n ? '#8b5cf6' : 'var(--text-muted)',
                          fontSize: 12, fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                        title={`Generate ${n} image${n > 1 ? 's' : ''}`}
                      >
                        {n}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Reasoning Toggle Pill */}
              <button
                onClick={() => {
                  const newVal = !reasoningOnly;
                  setReasoningOnly(newVal);
                  if (newVal) {
                    const isCurrentReasoning = currentModel?.capabilities?.reasoning === true;
                    if (!isCurrentReasoning) {
                      const firstReasoning = availableModels.find((m) => m.capabilities?.reasoning === true);
                      if (firstReasoning) {
                        updatePreferences({ default_model_id: firstReasoning.model_id });
                        toast.info(`Switched to reasoning model: ${firstReasoning.display_name}`);
                      }
                    }
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', height: 32,
                  fontSize: 12.5, fontWeight: 500,
                  color: reasoningOnly ? '#ea580c' : 'var(--text-secondary)',
                  background: reasoningOnly ? 'var(--accent-warning-soft, #ffedd5)' : 'var(--bg-secondary)',
                  border: reasoningOnly ? '1px solid #f97316' : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!reasoningOnly) {
                    e.currentTarget.style.background = 'var(--surface-1)';
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!reasoningOnly) {
                    e.currentTarget.style.background = 'var(--bg-secondary)';
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                  }
                }}
              >
                <Zap size={13} style={{ color: reasoningOnly ? '#ea580c' : 'var(--text-muted)' }} />
                <span>Reasoning</span>
              </button>
              {/* Private Message Toggle Pill (Only in Shared Chats) */}
              {isShared && (
                <button
                  onClick={() => setHiddenFromOwner(!hiddenFromOwner)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', height: 32,
                    fontSize: 12.5, fontWeight: 500,
                    color: hiddenFromOwner ? 'var(--accent-error)' : 'var(--text-secondary)',
                    background: hiddenFromOwner ? 'var(--accent-error-soft)' : 'var(--bg-secondary)',
                    border: hiddenFromOwner ? '1px solid var(--accent-error)' : '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-pill)',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-xs)',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    if (!hiddenFromOwner) {
                      e.currentTarget.style.background = 'var(--surface-1)';
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!hiddenFromOwner) {
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                    }
                  }}
                  title="Toggle visibility of this message thread from the conversation owner"
                >
                  {hiddenFromOwner ? <EyeOff size={13} style={{ color: 'var(--accent-error)' }} /> : <Eye size={13} style={{ color: 'var(--text-muted)' }} />}
                  <span>{hiddenFromOwner ? 'Hidden from Owner' : 'Visible to Owner'}</span>
                </button>
              )}
              {/* Model Selector Pill */}
              <button
                onClick={() => {}}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', height: 32,
                  fontSize: 12.5, fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)';
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                }}
              >
                <Zap size={13} style={{ color: 'var(--accent-primary)' }} />
                <span>{currentModel?.display_name || preferences.default_model_id}</span>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: .5 }}>
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            
            {/* Right buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Voice button */}
              <button
                onClick={toggleListening}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: isListening ? 'var(--accent-primary)' : 'var(--text-muted)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = isListening ? 'var(--accent-primary)' : 'var(--text-muted)';
                }}
                title="Voice input"
              >
                <Mic size={16} className={isListening ? 'animate-pulse' : ''} />
              </button>

              {/* Send Button */}
              {isStreaming ? (
                <button
                  onClick={stopStream}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 34, height: 34,
                    borderRadius: '50%',
                    background: 'var(--accent-error)',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'white',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all var(--transition-fast)',
                  }}
                  title="Stop generating"
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!message.trim() && pendingAttachments.filter(a => a.status === 'done').length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: (message.trim() || pendingAttachments.some(a => a.status === 'done')) ? 'var(--accent-primary)' : 'var(--surface-3)',
                    border: 'none',
                    cursor: (message.trim() || pendingAttachments.some(a => a.status === 'done')) ? 'pointer' : 'default',
                    color: (message.trim() || pendingAttachments.some(a => a.status === 'done')) ? 'white' : 'var(--text-muted)',
                    boxShadow: (message.trim() || pendingAttachments.some(a => a.status === 'done')) ? 'var(--shadow-sm)' : 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  title="Send message"
                  onMouseEnter={(e) => {
                    if (message.trim() || pendingAttachments.some(a => a.status === 'done')) {
                      e.currentTarget.style.opacity = '0.9';
                      e.currentTarget.style.transform = 'translateY(-0.5px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      
      {/* Keyboard hint */}
      <div style={{
        textAlign: 'center',
        marginTop: 8,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        {preferences.send_on_enter ? 'Press Enter to send, Shift+Enter for new line' : 'Press Ctrl+Enter to send'}
      </div>
      <ResourceModal
        isOpen={resourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        conversationId={effectiveConversationId || ''}
      />
    </div>
  );
}

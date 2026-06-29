'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   InputBar — Chat input with redesigned capsule layout, model badge,
   active file attachment state, and speech-to-text placeholder feature
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import {
  Plus, Bot, Mic, ArrowUp, FileText, Image, FileAudio, FolderOpen, X, Square, Zap
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useSSEStream } from '@/hooks/useSSEStream';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useProviderStore } from '@/stores/providerStore';
import { toast } from 'sonner';

interface InputBarProps {
  conversationId?: string | null;
}

export default function InputBar({ conversationId }: InputBarProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachments, setAttachments] = useState<{ id: string; name: string; type: string }[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { isStreaming } = useChatStore();
  const { sendMessage, stopStream } = useSSEStream();
  const { preferences, updatePreferences, reasoningOnly, setReasoningOnly } = usePreferencesStore();
  const { availableModels } = useProviderStore();

  const currentModel = availableModels.find((m) => m.model_id === preferences.default_model_id);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isStreaming) return;

    // Build message text including attachments info if any
    let finalMessage = trimmed;
    if (attachments.length > 0) {
      const attachInfo = attachments.map(a => `[Attached: ${a.name} (${a.type})]`).join(' ');
      finalMessage = `${attachInfo}\n${trimmed}`;
    }

    sendMessage({
      conversation_id: conversationId || undefined,
      message: finalMessage,
      model_id: preferences.default_model_id,
      temperature: preferences.default_temperature,
      max_tokens: preferences.default_max_tokens,
      system_prompt: preferences.default_system_prompt || undefined,
    });
    
    setMessage('');
    setAttachments([]); // Clear attachments on send

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachments, isStreaming, sendMessage, conversationId, preferences]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments = Array.from(files).map((f) => {
      let type = 'document';
      if (f.type.startsWith('image/')) type = 'image';
      else if (f.type.startsWith('audio/')) type = 'audio';
      
      // Clean extension for rendering
      const nameWithoutExt = f.name.substring(0, f.name.lastIndexOf('.')) || f.name;
      return {
        id: Math.random().toString(),
        name: nameWithoutExt,
        type,
      };
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
    toast.success(`Attached ${files.length} file(s)`);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
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
        multiple
        style={{ display: 'none' }}
      />
      
      {/* Animated Wrapper acting as flowing border */}
      <div 
        style={{
          position: 'relative',
          padding: '1.5px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-glow), var(--accent-primary-hover), var(--accent-primary))',
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
        {/* Top attachment area */}
        {attachments.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
            padding: '0 4px',
          }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>
                  {att.type === 'image' && <Image size={13} />}
                  {att.type === 'audio' && <FileAudio size={13} />}
                  {att.type === 'document' && <FileText size={13} />}
                  {att.type === 'folder' && <FolderOpen size={13} />}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {att.name}
                </span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    borderRadius: '50%',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 2,
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        
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
            placeholder="What should be reviewed?"
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
              {/* + Add button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
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
                title="Add Attachment"
              >
                <Plus size={15} />
              </button>

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
                <Bot size={13} style={{ color: 'var(--accent-primary)' }} />
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
                  disabled={!message.trim() && attachments.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: (message.trim() || attachments.length > 0) ? 'var(--accent-primary)' : 'var(--surface-3)',
                    border: 'none',
                    cursor: (message.trim() || attachments.length > 0) ? 'pointer' : 'default',
                    color: (message.trim() || attachments.length > 0) ? 'white' : 'var(--text-muted)',
                    boxShadow: (message.trim() || attachments.length > 0) ? 'var(--shadow-sm)' : 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  title="Send message"
                  onMouseEnter={(e) => {
                    if (message.trim() || attachments.length > 0) {
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
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, MessageSquare, Bot } from 'lucide-react';
import { useTheme } from 'next-themes';
import ThinkingPanel from '@/components/chat/ThinkingPanel';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: { type: string; text?: string }[];
  model_id: string | null;
  created_at: string;
  sender_username?: string | null;
}

interface Metadata {
  id: string;
  title: string;
  model_id: string | null;
  created_at: string;
}

export default function SharedConversationPage() {
  const { token } = useParams();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
        const metadataRes = await fetch(`${API_BASE}/api/v1/conversations/shared/${token}/metadata`);
        if (!metadataRes.ok) throw new Error('Not found');
        const metadataData = await metadataRes.json();

        const messagesRes = await fetch(`${API_BASE}/api/v1/conversations/shared/${token}`);
        if (!messagesRes.ok) throw new Error('Not found');
        const messagesData = await messagesRes.json();

        setMetadata(metadataData);
        setMessages(messagesData);
      } catch (err) {
        console.error('Failed to load shared conversation:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 16, background: isDark ? '#090d16' : '#f8fafc',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: 40, height: 40, border: '4px solid var(--accent-primary-soft)',
          borderTopColor: 'var(--accent-primary)', borderRadius: '50%',
          animation: 'spin 1s linear Infinity'
        }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
          Loading Shared Conversation...
        </span>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        ` }} />
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 16, background: isDark ? '#090d16' : '#f8fafc',
        padding: 24, textAlign: 'center'
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-error-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-error)'
        }}>
          ⚠️
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>404 Not Found</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 400, margin: 0 }}>
          This shared conversation link is invalid, has expired, or was deleted by the owner.
        </p>
        <a href="/" style={{
          marginTop: 8, padding: '10px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--accent-primary)', color: 'white', fontWeight: 600,
          textDecoration: 'none', boxShadow: 'var(--shadow-sm)'
        }}>
          Go to Home
        </a>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      position: 'relative',
      overflowX: 'hidden',
      background: isDark
        ? 'linear-gradient(180deg, #090d16 0%, #0d121f 50%, #171d2c 100%)'
        : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 40%, #f1f5f9 100%)',
    }}>
      {/* Subtle Background pattern overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: 'url(/patterns/pattern2.png)',
        backgroundSize: '100px 100px',
        backgroundRepeat: 'repeat',
        filter: isDark ? 'invert(0.9) brightness(1.2)' : 'none',
        mixBlendMode: isDark ? 'screen' : 'multiply',
        opacity: isDark ? 0.06 : 0.16,
      }} />

      {/* Top Header Bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow-xs)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'white'
          }}>
            <Bot size={18} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-heading)' }}>
            CleverChat
          </span>
        </div>

        <div style={{
          fontWeight: 600, fontSize: 15, color: 'var(--text-heading)',
          maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {metadata.title}
        </div>

        <div>
          <a href="/register" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary)', color: 'white', fontWeight: 600,
            textDecoration: 'none', fontSize: 13, boxShadow: 'var(--shadow-sm)',
            transition: 'background var(--transition-fast)'
          }}>
            <MessageSquare size={14} />
            Start New Chat
          </a>
        </div>
      </header>

      {/* Message List Area */}
      <main style={{
        flex: 1,
        width: '100%',
        maxWidth: 'var(--max-content-width)',
        margin: '0 auto',
        padding: '32px 16px 64px',
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const thinkingContent = msg.content?.filter(c => c.type === 'thinking').map(c => c.text).join('\n') || '';
          const textContent = msg.content?.filter(c => c.type !== 'thinking').map(c => c.text).join('\n') || '';

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 16,
                padding: '16px 20px',
                borderRadius: 'var(--radius-lg)',
                background: isUser ? 'var(--accent-primary-soft)' : 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: isUser ? 'none' : 'var(--shadow-sm)',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
                flexDirection: 'column',
                transition: 'transform var(--transition-fast)',
              }}
            >
              {/* Message Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 8,
                fontSize: 12,
                color: 'var(--text-muted)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontWeight: 600,
                    color: isUser ? 'var(--accent-primary)' : 'var(--text-heading)'
                  }}>
                    {isUser ? `@${msg.sender_username || 'user'}` : 'CleverChat'}
                  </span>
                  {!isUser && msg.model_id && (
                    <span className="badge badge-accent" style={{ fontSize: 10, padding: '2px 6px' }}>
                      {msg.model_id.split('/').pop()}
                    </span>
                  )}
                </div>
                <span>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Message Content */}
              <div
                dir="auto"
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}
              >
                {isUser ? (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} dir="auto">{textContent}</p>
                ) : (
                  <div>
                    {thinkingContent && <ThinkingPanel content={thinkingContent} />}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const code = String(children).replace(/\n$/, '');
                          if (match) {
                          const codeId = `${msg.id}-${match[1]}`;
                          const isCopied = copiedId === codeId;
                          return (
                            <div style={{ position: 'relative', margin: '14px 0', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 12px',
                                background: 'var(--surface-2)',
                                borderBottom: '1px solid var(--border-subtle)',
                                fontSize: 12,
                                color: 'var(--text-muted)',
                              }}>
                                <span style={{ fontWeight: 600 }}>{match[1]}</span>
                                <button
                                  onClick={() => copyCode(code, codeId)}
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
                                  {isCopied ? <Check size={13} /> : <Copy size={13} />}
                                  {isCopied ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <SyntaxHighlighter
                                style={(isDark ? oneDark : oneLight) as any}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  margin: 0,
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
                    {textContent}
                  </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {/* Footer Branding */}
      <footer style={{
        padding: '24px 16px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-card)',
        position: 'relative',
        zIndex: 1,
      }}>
        This chat was shared publicly using <a href="/" style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}>CleverChat</a>.
      </footer>
    </div>
  );
}

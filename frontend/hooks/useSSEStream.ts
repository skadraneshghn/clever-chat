'use client';

import { useCallback, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useChatStore } from '@/stores/chatStore';
import type { ChatStreamRequest, Message } from '@/types';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const {
    appendStreamToken,
    setStreamingState,
    setStreamingMessageId,
    finalizeStreamMessage,
    addNodeEvent,
    removeNodeEvent,
    setConversationIdFromStream,
    addOptimisticUserMessage,
    fetchConversations,
  } = useChatStore();

  const sendMessage = useCallback(
    async (request: ChatStreamRequest) => {
      // Abort any existing stream
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Add optimistic user message
      addOptimisticUserMessage(request.message, request.conversation_id || 'new');
      setStreamingState(true);

      const token = localStorage.getItem('access_token');
      let conversationId = request.conversation_id;
      let messageId = '';
      let fullContent = '';

      try {
        await fetchEventSource(`${API_BASE}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(request),
          signal: ctrl.signal,
          openWhenHidden: true,

          onopen: async (response) => {
            if (!response.ok) {
              throw new Error(`Stream failed: ${response.status}`);
            }
          },

          onmessage: (ev) => {
            if (!ev.data) return;
            const data = JSON.parse(ev.data);

            switch (ev.event) {
              case 'message_start':
                conversationId = data.conversation_id;
                messageId = data.message_id;
                setConversationIdFromStream(data.conversation_id);
                setStreamingMessageId(data.message_id);
                if (pathname === '/') {
                  router.push(`/${data.conversation_id}`);
                }
                break;

              case 'token':
                fullContent += data.content;
                appendStreamToken(data.content);
                break;

              case 'node_start':
                addNodeEvent(data.node);
                break;

              case 'node_end':
                removeNodeEvent(data.node);
                break;

              case 'message_meta':
                // Stream complete — finalize message
                const finalMessage: Message = {
                  id: data.message_id || messageId,
                  conversation_id: conversationId || '',
                  parent_message_id: null,
                  role: 'assistant',
                  content: [{ type: 'text', text: fullContent }],
                  model_id: data.model_id || null,
                  input_tokens: data.input_tokens || null,
                  output_tokens: data.output_tokens || null,
                  latency_ms: data.latency_ms || null,
                  is_active_branch: true,
                  created_at: new Date().toISOString(),
                  sender_id: data.sender_id || null,
                  sender_username: data.sender_username || null,
                  hidden_from_owner: data.hidden_from_owner || false,
                };
                finalizeStreamMessage(finalMessage);
                fetchConversations();
                break;

              case 'done':
                setStreamingState(false);
                break;

              case 'error':
                console.error('Stream error:', data);
                toast.error(data.message || 'Stream error occurred');
                setStreamingState(false);
                break;
            }
          },

          onerror: (err) => {
            console.error('SSE error:', err);
            toast.error(err instanceof Error ? err.message : 'SSE connection failed');
            setStreamingState(false);
            throw err; // Stops retry
          },

          onclose: () => {
            setStreamingState(false);
          },
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Stream failed:', err);
          toast.error(err?.message || 'Connection to streaming endpoint failed');
        }
        setStreamingState(false);
      }
    },
    [
      appendStreamToken,
      setStreamingState,
      setStreamingMessageId,
      finalizeStreamMessage,
      addNodeEvent,
      removeNodeEvent,
      setConversationIdFromStream,
      addOptimisticUserMessage,
      fetchConversations,
    ]
  );

  const stopStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreamingState(false);
  }, [setStreamingState]);

  return { sendMessage, stopStream };
}

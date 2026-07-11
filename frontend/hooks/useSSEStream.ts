'use client';

import { useCallback, useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useChatStore } from '@/stores/chatStore';
import type { ChatStreamRequest, ConversationInitRequest, Message } from '@/types';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const {
    appendStreamToken,
    appendStreamThinking,
    setStreamingState,
    setStreamingMessageId,
    finalizeStreamMessage,
    addNodeEvent,
    removeNodeEvent,
    setConversationIdFromStream,
    addOptimisticUserMessage,
    setMessageFailed,
    fetchConversations,
    updateConversation,
    pendingAttachments,
    clearAttachments,
    imageGenerationMode,
    imageCount,
  } = useChatStore();

  /**
   * sendMessage — The core function implementing the "Instant Handshake" pattern.
   *
   * For NEW conversations (no conversation_id):
   *   1. POST /conversations/initialize → get conv_id + user_message_id in ~10ms
   *   2. Immediately push to /{conv_id} — user sees the chat page right away
   *   3. Start SSE stream at /chat/stream with the known conv_id
   *
   * For EXISTING conversations (conversation_id present):
   *   1. Skip initialization (conv already exists)
   *   2. Start SSE stream directly
   *
   * This ensures a chat ALWAYS exists in the DB before the LLM is called.
   * If the model errors, the chat is still there with a failed message bubble.
   */
  const sendMessage = useCallback(
    async (request: ChatStreamRequest) => {
      // Abort any existing stream
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Collect successfully uploaded attachments from the store
      const doneAttachments = pendingAttachments.filter((a) => a.status === 'done');
      const assetIds = doneAttachments.map((a) => a.assetId!).filter(Boolean);
      const mediaAssetIds = Array.from(new Set([
        ...(request.media_asset_ids || []),
        ...assetIds,
      ]));

      // Make sure the access token is fresh before any network calls
      const token = await api.ensureValidToken();
      if (!token) {
        setStreamingState(false);
        toast.error('Your session has expired. Please log in again.');
        window.location.href = '/login';
        return;
      }

      let conversationId = request.conversation_id;
      let userMessageId: string | undefined;

      // ── Phase 1: Initialize conversation if this is a new chat ──────────
      if (!conversationId) {
        try {
          const initPayload: ConversationInitRequest = {
            message: request.message,
            model_id: request.model_id,
            system_prompt: request.system_prompt,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            media_asset_ids: mediaAssetIds.length > 0 ? mediaAssetIds : undefined,
            hidden_from_owner: request.hidden_from_owner,
            image_generation_mode: imageGenerationMode || undefined,
            image_n: imageGenerationMode ? imageCount : undefined,
          };

          const initResponse = await api.post<{
            id: string;
            title: string;
            model_id: string;
            user_message_id: string;
            created_at: string;
          }>('/conversations/initialize', initPayload);

          conversationId = initResponse.id;
          userMessageId = initResponse.user_message_id;

          // ── Critical: update store + redirect BEFORE LLM is called ──────
          setConversationIdFromStream(conversationId);
          clearAttachments();

          // Add optimistic user message so the UI shows it immediately
          addOptimisticUserMessage(request.message, conversationId, doneAttachments);
          setStreamingState(true);

          // Navigate instantly — user sees the chat page before first token
          if (!pathnameRef.current.endsWith(conversationId)) {
            router.push(`/${conversationId}`);
          }

          // Fetch updated conversation list for the sidebar
          fetchConversations();
        } catch (err) {
          console.error('Failed to initialize conversation:', err);
          toast.error(err instanceof Error ? err.message : 'Failed to start conversation');
          setStreamingState(false);
          return;
        }
      } else {
        // Existing conversation: add optimistic message + set streaming immediately
        addOptimisticUserMessage(request.message, conversationId, doneAttachments);
        setStreamingState(true);
        clearAttachments();
      }

      // ── Phase 2: Open SSE stream with the known conversation_id ─────────
      const fullRequest: ChatStreamRequest = {
        ...request,
        conversation_id: conversationId,
        media_asset_ids: mediaAssetIds.length > 0 ? mediaAssetIds : undefined,
        image_generation_mode: imageGenerationMode || undefined,
        image_n: imageGenerationMode ? imageCount : undefined,
        // Pass the pre-created user message ID so the backend doesn't create a duplicate
        leaf_user_message_id: userMessageId || undefined,
      };

      let messageId = '';
      let fullContent = '';
      let fullThinking = '';

      try {
        await fetchEventSource(`${API_BASE}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(fullRequest),
          signal: ctrl.signal,
          openWhenHidden: true,

          onopen: async (response) => {
            if (!response.ok) {
              const errorText = await response.text().catch(() => '');
              throw new Error(`Stream failed: ${response.status} ${errorText}`);
            }
          },

          onmessage: (ev) => {
            if (!ev.data) return;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(ev.data);
            } catch {
              return;
            }

            switch (ev.event) {
              case 'message_start':
                messageId = data.message_id as string;
                setStreamingMessageId(messageId);
                // For existing conversations, we may need to navigate
                if (conversationId && !pathnameRef.current.endsWith(conversationId)) {
                  router.push(`/${conversationId}`);
                }
                break;

              case 'token':
                fullContent += data.content as string;
                appendStreamToken(data.content as string);
                break;

              case 'thinking':
                fullThinking += data.content as string;
                appendStreamThinking(data.content as string);
                break;

              case 'node_start':
                addNodeEvent(data.node as string);
                break;

              case 'node_end':
                removeNodeEvent(data.node as string);
                break;

              case 'message_meta': {
                const thinkingText = (data.thinking as string) || fullThinking;
                const generatedImages = (data.generated_images as { asset_id: string; url: string; thumbnail_url: string }[]) || [];

                let finalContent: Message['content'];
                if (generatedImages.length > 0) {
                  const intro = `Generated ${generatedImages.length} image${generatedImages.length > 1 ? 's' : ''} based on your prompt.`;
                  finalContent = [
                    { type: 'text', text: intro },
                    ...generatedImages.map((img) => ({
                      type: 'image_url' as const,
                      image_url: { url: img.url },
                      asset_id: img.asset_id,
                      url: img.thumbnail_url,
                    })),
                  ];
                } else {
                  finalContent = thinkingText
                    ? [
                        { type: 'thinking' as const, text: thinkingText },
                        { type: 'text' as const, text: fullContent },
                      ]
                    : [{ type: 'text' as const, text: fullContent }];
                }

                const finalMessage: Message = {
                  id: (data.message_id as string) || messageId,
                  conversation_id: conversationId || '',
                  parent_message_id: null,
                  role: 'assistant',
                  content: finalContent,
                  model_id: (data.model_id as string) || null,
                  input_tokens: (data.input_tokens as number) || null,
                  output_tokens: (data.output_tokens as number) || null,
                  latency_ms: (data.latency_ms as number) || null,
                  is_active_branch: true,
                  created_at: new Date().toISOString(),
                  sender_id: null,
                  sender_username: null,
                  hidden_from_owner: false,
                  execution_status: 'completed',
                };
                finalizeStreamMessage(finalMessage);
                fetchConversations();
                break;
              }

              case 'title_update':
                updateConversation(data.conversation_id as string, { title: data.title as string });
                break;

              case 'done':
                setStreamingState(false);
                break;

              case 'error': {
                // Stream-level error: update the failed message in the store
                const failedMsgId = data.message_id as string | undefined;
                const errorText = (data.message as string) || 'An error occurred generating the response';

                if (failedMsgId) {
                  // Replace streaming placeholder with a failed message bubble
                  setMessageFailed(failedMsgId, errorText, conversationId || '');
                } else {
                  toast.error(errorText);
                }
                setStreamingState(false);
                break;
              }
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
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Stream failed:', err);
          toast.error(err instanceof Error ? err.message : 'Connection to streaming endpoint failed');
        }
        setStreamingState(false);
      }
    },
    [
      appendStreamToken,
      appendStreamThinking,
      setStreamingState,
      setStreamingMessageId,
      finalizeStreamMessage,
      addNodeEvent,
      removeNodeEvent,
      setConversationIdFromStream,
      addOptimisticUserMessage,
      setMessageFailed,
      fetchConversations,
      updateConversation,
      pendingAttachments,
      clearAttachments,
      imageGenerationMode,
      imageCount,
      router,
    ]
  );

  /**
   * retryMessage — Re-stream a failed AI response without changing the user message.
   * Uses the existing user message ID to avoid creating a duplicate.
   */
  const retryMessage = useCallback(
    async (
      conversationId: string,
      userMessageId: string,
      modelId?: string,
      systemPrompt?: string,
    ) => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const token = await api.ensureValidToken();
      if (!token) {
        toast.error('Your session has expired. Please log in again.');
        window.location.href = '/login';
        return;
      }

      setStreamingState(true);

      const retryRequest: ChatStreamRequest = {
        conversation_id: conversationId,
        message: '', // Not used when leaf_user_message_id is set
        model_id: modelId,
        system_prompt: systemPrompt,
        leaf_user_message_id: userMessageId,
      };

      let fullContent = '';
      let fullThinking = '';
      let messageId = '';

      try {
        await fetchEventSource(`${API_BASE}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(retryRequest),
          signal: ctrl.signal,
          openWhenHidden: true,

          onopen: async (response) => {
            if (!response.ok) {
              throw new Error(`Retry stream failed: ${response.status}`);
            }
          },

          onmessage: (ev) => {
            if (!ev.data) return;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(ev.data);
            } catch {
              return;
            }

            switch (ev.event) {
              case 'message_start':
                messageId = data.message_id as string;
                setStreamingMessageId(messageId);
                break;
              case 'token':
                fullContent += data.content as string;
                appendStreamToken(data.content as string);
                break;
              case 'thinking':
                fullThinking += data.content as string;
                appendStreamThinking(data.content as string);
                break;
              case 'node_start':
                addNodeEvent(data.node as string);
                break;
              case 'node_end':
                removeNodeEvent(data.node as string);
                break;
              case 'message_meta': {
                const thinkingText = (data.thinking as string) || fullThinking;
                const finalContent: Message['content'] = thinkingText
                  ? [
                      { type: 'thinking' as const, text: thinkingText },
                      { type: 'text' as const, text: fullContent },
                    ]
                  : [{ type: 'text' as const, text: fullContent }];

                const finalMessage: Message = {
                  id: (data.message_id as string) || messageId,
                  conversation_id: conversationId,
                  parent_message_id: null,
                  role: 'assistant',
                  content: finalContent,
                  model_id: (data.model_id as string) || null,
                  input_tokens: (data.input_tokens as number) || null,
                  output_tokens: (data.output_tokens as number) || null,
                  latency_ms: (data.latency_ms as number) || null,
                  is_active_branch: true,
                  created_at: new Date().toISOString(),
                  sender_id: null,
                  sender_username: null,
                  hidden_from_owner: false,
                  execution_status: 'completed',
                };
                finalizeStreamMessage(finalMessage);
                fetchConversations();
                break;
              }
              case 'done':
                setStreamingState(false);
                break;
              case 'error': {
                const failedMsgId = data.message_id as string | undefined;
                const errorText = (data.message as string) || 'Retry failed';
                if (failedMsgId) {
                  setMessageFailed(failedMsgId, errorText, conversationId);
                } else {
                  toast.error(errorText);
                }
                setStreamingState(false);
                break;
              }
            }
          },

          onerror: (err) => {
            toast.error(err instanceof Error ? err.message : 'Retry failed');
            setStreamingState(false);
            throw err;
          },

          onclose: () => setStreamingState(false),
        });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          toast.error(err instanceof Error ? err.message : 'Retry connection failed');
        }
        setStreamingState(false);
      }
    },
    [
      appendStreamToken,
      appendStreamThinking,
      setStreamingState,
      setStreamingMessageId,
      finalizeStreamMessage,
      addNodeEvent,
      removeNodeEvent,
      setMessageFailed,
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

  return { sendMessage, retryMessage, stopStream };
}

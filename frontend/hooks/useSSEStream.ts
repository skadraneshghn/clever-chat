'use client';

import { useCallback, useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useChatStore } from '@/stores/chatStore';
import type { ChatStreamRequest, Message } from '@/types';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  // Keep a ref so the stale-closure inside useCallback always reads the latest pathname
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
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
    updateConversation,
    pendingAttachments,
    clearAttachments,
    imageGenerationMode,
    imageCount,
  } = useChatStore();

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

      // Patch request with asset IDs + image generation flags
      const fullRequest: ChatStreamRequest = {
        ...request,
        media_asset_ids: mediaAssetIds.length > 0 ? mediaAssetIds : undefined,
        image_generation_mode: imageGenerationMode || undefined,
        image_n: imageGenerationMode ? imageCount : undefined,
      };

      // Add optimistic user message (with image thumbnails shown immediately)
      addOptimisticUserMessage(request.message, request.conversation_id || 'new', doneAttachments);
      setStreamingState(true);

      // Make sure the access token is fresh before opening the stream — a
      // long-lived SSE connection can't refresh mid-stream.
      const token = await api.ensureValidToken();
      if (!token) {
        setStreamingState(false);
        toast.error('Your session has expired. Please log in again.');
        window.location.href = '/login';
        return;
      }
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
          body: JSON.stringify(fullRequest),
          signal: ctrl.signal,
          openWhenHidden: true,

          onopen: async (response) => {
            if (!response.ok) {
              throw new Error(`Stream failed: ${response.status}`);
            }
            // Clear attachments as soon as the stream is accepted
            clearAttachments();
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
                // Redirect to the new conversation page whenever we're not already on it.
                // Using pathnameRef.current avoids the stale-closure bug with pathname.
                if (!pathnameRef.current.endsWith(data.conversation_id)) {
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

              case 'message_meta': {
                // Stream complete — finalize message
                // If this was an image generation request, build image content blocks
                const generatedImages: { asset_id: string; url: string; thumbnail_url: string }[] =
                  data.generated_images || [];

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
                  finalContent = [{ type: 'text', text: fullContent }];
                }

                const finalMessage: Message = {
                  id: data.message_id || messageId,
                  conversation_id: conversationId || '',
                  parent_message_id: null,
                  role: 'assistant',
                  content: finalContent,
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
              }

              case 'title_update':
                // Update the conversation title in the sidebar immediately
                updateConversation(data.conversation_id, { title: data.title });
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
      setStreamingState,
      setStreamingMessageId,
      finalizeStreamMessage,
      addNodeEvent,
      removeNodeEvent,
      setConversationIdFromStream,
      addOptimisticUserMessage,
      fetchConversations,
      updateConversation,
      pendingAttachments,
      clearAttachments,
      imageGenerationMode,
      imageCount,
      router,
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

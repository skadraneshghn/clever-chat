'use client';

import { create } from 'zustand';
import type { Conversation, Message, ContentBlock, ShareUser } from '@/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface PendingAttachment {
  clientId: string;               // browser-local unique ID
  file: File;                     // raw File blob
  status: 'uploading' | 'done' | 'error';
  assetId?: string;               // UUID returned by backend after upload
  previewUrl: string;             // local blob URL for instant preview
  thumbnailUrl?: string;          // server thumbnail URL (set after upload)
  url?: string;                   // server original URL (set after upload)
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  streamingMessageId: string | null;
  activeNodes: string[];
  totalConversations: number;
  isNewChatMode: boolean; // true after resetChat() — blocks ConversationPage from restoring old conv
  pendingAttachments: PendingAttachment[];
  // Image generation
  imageGenerationMode: boolean;
  imageCount: 1 | 2 | 4;

  // Actions
  fetchConversations: (page?: number) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  fetchMessages: (conversationId: string) => Promise<void>;
  addOptimisticUserMessage: (content: string, conversationId: string, attachments?: PendingAttachment[]) => void;
  setStreamingState: (isStreaming: boolean) => void;
  appendStreamToken: (token: string) => void;
  appendStreamThinking: (token: string) => void;
  finalizeStreamMessage: (message: Message) => void;
  setStreamingMessageId: (id: string | null) => void;
  addNodeEvent: (node: string) => void;
  removeNodeEvent: (node: string) => void;
  clearNodes: () => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  deleteConversation: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  setConversationIdFromStream: (id: string) => void;
  resetChat: () => void;
  toggleMessageVisibility: (messageId: string) => Promise<void>;
  shareConversationPrivate: (convId: string, username: string) => Promise<ShareUser>;
  unshareConversationPrivate: (convId: string, username: string) => Promise<void>;
  fetchConversationShares: (convId: string) => Promise<ShareUser[]>;
  // Attachment actions
  addAttachment: (attachment: PendingAttachment) => void;
  updateAttachment: (clientId: string, updates: Partial<PendingAttachment>) => void;
  removeAttachment: (clientId: string) => void;
  clearAttachments: () => void;
  // Image generation actions
  toggleImageGenerationMode: () => void;
  setImageCount: (count: 1 | 2 | 4) => void;

  // Advanced File Manager state & actions
  files: any[];
  folders: any[];
  activeChatResourceIds: string[];
  fetchFiles: () => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  uploadFromUrl: (url: string) => Promise<any>;
  organizeFiles: (strategy: string) => Promise<void>;
  fetchActiveChatResources: (convId: string) => Promise<void>;
  attachResourcesToChat: (convId: string, ids: string[]) => Promise<void>;
  detachResourceFromChat: (convId: string, id: string) => Promise<void>;
  checkHash: (hash: string, filename: string, mimeType: string) => Promise<any>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',
  streamingMessageId: null,
  activeNodes: [],
  totalConversations: 0,
  isNewChatMode: false,
  pendingAttachments: [],
  imageGenerationMode: false,
  imageCount: 1,
  files: [],
  folders: [],
  activeChatResourceIds: [],

  fetchConversations: async (page = 1) => {
    try {
      const data = await api.get<{
        conversations: Conversation[];
        total: number;
      }>(`/conversations?page=${page}&page_size=50`);
      set({
        conversations: data.conversations,
        totalConversations: data.total,
      });
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id, messages: [], streamingContent: '', streamingThinking: '', activeNodes: [] });
    if (id) {
      get().fetchMessages(id);
    }
  },

  fetchMessages: async (conversationId) => {
    try {
      const messages = await api.get<Message[]>(`/chat/history/${conversationId}`);
      set({ messages });
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  },

  addOptimisticUserMessage: (content, conversationId, attachments = []) => {
    // Build multimodal content blocks for instant display
    const contentBlocks: ContentBlock[] = [
      { type: 'text', text: content },
      ...attachments
        .filter((a) => a.status === 'done')
        .map((a) => ({
          type: 'image_url' as const,
          url: a.thumbnailUrl || a.previewUrl,
          asset_id: a.assetId,
        })),
    ];
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      parent_message_id: null,
      role: 'user',
      content: contentBlocks,
      model_id: null,
      input_tokens: null,
      output_tokens: null,
      latency_ms: null,
      is_active_branch: true,
      created_at: new Date().toISOString(),
      sender_id: null,
      sender_username: null,
      hidden_from_owner: false,
    };
    set((state) => ({ messages: [...state.messages, tempMessage] }));
  },

  setStreamingState: (isStreaming) => set({ isStreaming }),

  appendStreamToken: (token) => {
    set((state) => ({
      streamingContent: state.streamingContent + token,
    }));
  },

  appendStreamThinking: (token) => {
    set((state) => ({
      streamingThinking: state.streamingThinking + token,
    }));
  },

  finalizeStreamMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
      streamingContent: '',
      streamingThinking: '',
      streamingMessageId: null,
      isStreaming: false,
      activeNodes: [],
    }));
  },

  setStreamingMessageId: (id) => set({ streamingMessageId: id }),

  addNodeEvent: (node) => {
    set((state) => ({
      activeNodes: [...state.activeNodes, node],
    }));
  },

  removeNodeEvent: (node) => {
    set((state) => ({
      activeNodes: state.activeNodes.filter((n) => n !== node),
    }));
  },

  clearNodes: () => set({ activeNodes: [] }),

  updateConversation: (id, data) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    }));
  },

  deleteConversation: async (id) => {
    await api.delete(`/conversations/${id}`);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
    }));
  },

  createConversation: async (title = 'New Chat') => {
    const conv = await api.post<Conversation>('/conversations', { title });
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
      messages: [],
    }));
    return conv;
  },

  setConversationIdFromStream: (id) => {
    set({
      activeConversationId: id,
      isNewChatMode: false, // New conversation is now established — allow ConversationPage to load normally
    });
  },

  resetChat: () => {
    set({
      activeConversationId: null,
      messages: [],
      streamingContent: '',
      streamingThinking: '',
      isStreaming: false,
      activeNodes: [],
      isNewChatMode: true,
      imageGenerationMode: false, // reset on new chat
      activeChatResourceIds: [], // Clear resource attachments for the chat
    });
  },

  toggleMessageVisibility: async (messageId) => {
    try {
      const updatedMsg = await api.patch<Message>(`/chat/messages/${messageId}/visibility`, {});
      set((state) => {
        const newMessages = state.messages.map((m) => {
          if (m.id === messageId) {
            return updatedMsg;
          }
          if (m.parent_message_id === messageId && m.role === 'assistant') {
            return { ...m, hidden_from_owner: updatedMsg.hidden_from_owner };
          }
          return m;
        });
        return { messages: newMessages };
      });
    } catch (err) {
      console.error('Failed to toggle message visibility:', err);
      throw err;
    }
  },

  shareConversationPrivate: async (convId, username) => {
    return await api.post<ShareUser>(`/conversations/${convId}/share/private`, { username });
  },

  unshareConversationPrivate: async (convId, username) => {
    await api.delete(`/conversations/${convId}/share/private/${username}`);
  },

  fetchConversationShares: async (convId) => {
    return await api.get<ShareUser[]>(`/conversations/${convId}/shares`);
  },

  // ── Attachment lifecycle ──────────────────────────────────────────────────
  addAttachment: (attachment) => {
    set((state) => ({ pendingAttachments: [...state.pendingAttachments, attachment] }));
  },

  updateAttachment: (clientId, updates) => {
    set((state) => ({
      pendingAttachments: state.pendingAttachments.map((a) =>
        a.clientId === clientId ? { ...a, ...updates } : a
      ),
    }));
  },

  removeAttachment: (clientId) => {
    set((state) => {
      const target = state.pendingAttachments.find((a) => a.clientId === clientId);
      // Revoke the local object URL to free memory
      if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      return { pendingAttachments: state.pendingAttachments.filter((a) => a.clientId !== clientId) };
    });
  },

  clearAttachments: () => {
    const { pendingAttachments } = get();
    // Revoke all blob URLs before clearing
    pendingAttachments.forEach((a) => {
      if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
    });
    set({ pendingAttachments: [] });
  },

  // ── Image generation ──────────────────────────────────────────────────────
  toggleImageGenerationMode: () => {
    set((state) => ({ imageGenerationMode: !state.imageGenerationMode }));
  },

  setImageCount: (count) => {
    set({ imageCount: count });
  },

  // ── Advanced File Manager actions ─────────────────────────────────────────
  fetchFiles: async () => {
    try {
      const files = await api.get<any[]>('/media');
      set({ files });
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  },

  deleteFile: async (id) => {
    const originalFiles = get().files;
    const originalResourceIds = get().activeChatResourceIds;

    // Optimistic Update
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      activeChatResourceIds: state.activeChatResourceIds.filter((cid) => cid !== id),
    }));

    try {
      await api.delete(`/media/${id}`);
      toast.success('File deleted successfully');
    } catch (err) {
      console.error('Failed to delete file:', err);
      toast.error('Failed to delete file. Rolling back.');
      // Rollback on failure
      set({
        files: originalFiles,
        activeChatResourceIds: originalResourceIds,
      });
    }
  },

  checkHash: async (hash, filename, mimeType) => {
    try {
      const result = await api.post<any>('/media/check-hash', {
        file_hash: hash,
        filename: filename,
        mime_type: mimeType,
      });
      if (result.exists) {
        set((state) => {
          const existsInList = state.files.some(f => f.id === result.asset.id);
          const updatedFiles = existsInList ? state.files : [result.asset, ...state.files];
          return { files: updatedFiles };
        });
      }
      return result;
    } catch (err) {
      console.error('Failed pre-flight hash check:', err);
      return { exists: false };
    }
  },

  uploadFromUrl: async (url) => {
    try {
      const result = await api.post<any>('/media/url', { url });
      set((state) => ({ files: [result, ...state.files] }));
      return result;
    } catch (err) {
      console.error('Failed to upload from URL:', err);
      toast.error('Failed to download file from link');
      throw err;
    }
  },

  organizeFiles: async (strategy) => {
    try {
      const files = await api.post<any[]>('/media/organize', { strategy });
      set({ files });
    } catch (err) {
      console.error('Failed to organize files:', err);
    }
  },

  fetchActiveChatResources: async (convId) => {
    try {
      const resources = await api.get<any[]>(`/media/conversations/${convId}/resources`);
      set({ activeChatResourceIds: resources.map((r) => r.id) });
    } catch (err) {
      console.error('Failed to fetch active resources:', err);
    }
  },

  attachResourcesToChat: async (convId, ids) => {
    try {
      await api.post(`/media/conversations/${convId}/attach`, { media_asset_ids: ids });
      set((state) => {
        const current = new Set(state.activeChatResourceIds);
        ids.forEach(id => current.add(id));
        return { activeChatResourceIds: Array.from(current) };
      });
    } catch (err) {
      console.error('Failed to attach resources:', err);
    }
  },

  detachResourceFromChat: async (convId, id) => {
    try {
      await api.delete(`/media/conversations/${convId}/detach/${id}`);
      set((state) => ({
        activeChatResourceIds: state.activeChatResourceIds.filter((cid) => cid !== id),
      }));
    } catch (err) {
      console.error('Failed to detach resource:', err);
    }
  },
}));

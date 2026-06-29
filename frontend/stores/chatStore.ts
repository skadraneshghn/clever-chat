'use client';

import { create } from 'zustand';
import type { Conversation, Message, ContentBlock } from '@/types';
import { api } from '@/lib/api';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingMessageId: string | null;
  activeNodes: string[];
  totalConversations: number;

  // Actions
  fetchConversations: (page?: number) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  fetchMessages: (conversationId: string) => Promise<void>;
  addOptimisticUserMessage: (content: string, conversationId: string) => void;
  setStreamingState: (isStreaming: boolean) => void;
  appendStreamToken: (token: string) => void;
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
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingMessageId: null,
  activeNodes: [],
  totalConversations: 0,

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
    set({ activeConversationId: id, messages: [], streamingContent: '', activeNodes: [] });
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

  addOptimisticUserMessage: (content, conversationId) => {
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      parent_message_id: null,
      role: 'user',
      content: [{ type: 'text', text: content }],
      model_id: null,
      input_tokens: null,
      output_tokens: null,
      latency_ms: null,
      is_active_branch: true,
      created_at: new Date().toISOString(),
    };
    set((state) => ({ messages: [...state.messages, tempMessage] }));
  },

  setStreamingState: (isStreaming) => set({ isStreaming }),

  appendStreamToken: (token) => {
    set((state) => ({
      streamingContent: state.streamingContent + token,
    }));
  },

  finalizeStreamMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
      streamingContent: '',
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
    set((state) => ({
      activeConversationId: id,
    }));
  },

  resetChat: () => {
    set({
      activeConversationId: null,
      messages: [],
      streamingContent: '',
      isStreaming: false,
      activeNodes: [],
    });
  },
}));

/* ═══════════════════════════════════════════════════════════════════════════
   CleverChat — Shared TypeScript Type Definitions
   ═══════════════════════════════════════════════════════════════════════════ */

// ── User & Auth ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
}

// ── Conversations ───────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  model_id: string;
  system_prompt: string | null;
  is_archived: boolean;
  is_pinned: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  page_size: number;
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ContentBlock {
  type: 'text' | 'image' | 'audio' | 'document';
  text?: string;
  asset_id?: string;
  url?: string;
  mime_type?: string;
  transcription?: string;
  filename?: string;
  duration_ms?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  parent_message_id: string | null;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: ContentBlock[];
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  is_active_branch: boolean;
  created_at: string;
  children_count?: number;
}

// ── Chat Stream ─────────────────────────────────────────────────────────────

export interface ChatStreamRequest {
  conversation_id?: string | null;
  message: string;
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  parent_message_id?: string | null;
  media_asset_ids?: string[];
}

// ── SSE Events ──────────────────────────────────────────────────────────────

export type SSEEventType =
  | 'message_start'
  | 'token'
  | 'node_start'
  | 'node_end'
  | 'tool_start'
  | 'tool_end'
  | 'message_meta'
  | 'done'
  | 'error';

export interface SSETokenEvent {
  content: string;
}

export interface SSEMessageStartEvent {
  conversation_id: string;
  message_id: string;
  user_message_id: string;
}

export interface SSENodeEvent {
  node: string;
}

export interface SSEMessageMetaEvent {
  message_id: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  model_id: string;
}

export interface SSEDoneEvent {
  finish_reason: string;
}

export interface SSEErrorEvent {
  code: string;
  message: string;
  recoverable: boolean;
}

// ── Preferences ─────────────────────────────────────────────────────────────

export interface UserPreferences {
  theme: 'dark' | 'light' | 'system';
  color_theme: 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone' | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'indigo' | 'anvix';
  sidebar_mode: 'expanded' | 'collapsed' | 'hidden';
  default_model_id: string;
  default_temperature: number;
  default_max_tokens: number;
  default_system_prompt: string | null;
  code_theme: string;
  font_size: 'sm' | 'md' | 'lg';
  send_on_enter: boolean;
  show_token_counts: boolean;
  context_strategy: 'all' | 'last_n' | 'auto';
  enable_rag: boolean;
  message_width: 'sm' | 'md' | 'lg';
  chat_bg_pattern: 'none' | 'dots' | 'polygons' | 'stripes' | 'temple';
}

// ── Media ───────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width?: number;
  height?: number;
}

// ── Models ──────────────────────────────────────────────────────────────────

export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  description: string;
  maxTokens: number;
  icon?: string;
}

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Most capable OpenAI model', maxTokens: 128000 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Fast and affordable', maxTokens: 128000 },
  { id: 'o4-mini', name: 'o4 Mini', provider: 'openai', description: 'Reasoning model', maxTokens: 128000 },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', description: 'Balanced performance', maxTokens: 200000 },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', description: 'Fast responses', maxTokens: 200000 },
];

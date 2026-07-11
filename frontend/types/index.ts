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
  refresh_token?: string;
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
  user_id: string;
  is_shared: boolean;
  owner_username: string | null;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  page_size: number;
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ContentBlock {
  type: 'text' | 'image' | 'image_url' | 'audio' | 'document' | 'thinking';
  text?: string;
  asset_id?: string;
  url?: string;
  image_url?: { url: string };   // LangChain-style vision block
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
  sender_id: string | null;
  sender_username: string | null;
  hidden_from_owner: boolean;
  /** Tracks LLM execution lifecycle for this message */
  execution_status?: 'pending' | 'streaming' | 'completed' | 'failed';
  /** Version number — incremented on each edit/fork */
  version?: number;
}

// ── Chat Stream ─────────────────────────────────────────────────────────────

export interface ConversationInitRequest {
  message: string;
  model_id?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  media_asset_ids?: string[];
  hidden_from_owner?: boolean;
  image_generation_mode?: boolean;
  image_n?: 1 | 2 | 4;
}

export interface ConversationInitResponse {
  id: string;
  title: string;
  model_id: string;
  user_message_id: string;
  created_at: string;
}

export interface MessageEditRequest {
  message: string;
  model_id?: string;
  media_asset_ids?: string[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatStreamRequest {
  conversation_id?: string | null;
  message: string;
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  parent_message_id?: string | null;
  /** Set when retrying a failed message — points to existing user message */
  leaf_user_message_id?: string | null;
  media_asset_ids?: string[];
  hidden_from_owner?: boolean;
  image_generation_mode?: boolean;
  image_n?: 1 | 2 | 4;
}

export interface ShareUser {
  id: string;
  username: string;
  email: string;
}

// ── SSE Events ──────────────────────────────────────────────────────────────

export type SSEEventType =
  | 'message_start'
  | 'token'
  | 'thinking'
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

export interface SSEThinkingEvent {
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
  thinking?: string;
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
  chat_bg_pattern: 'none' | 'dots' | 'polygons' | 'stripes' | 'temple' | 'pattern1' | 'pattern2' | 'pattern3' | 'pattern4' | 'pattern5';
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

// ── Provider Connections ────────────────────────────────────────────────────

export type ProviderType = 'openai' | 'ollama' | 'nvidia' | 'generic_openai_compatible';

export interface DiscoveredModel {
  id: string;
  connection_id: string;
  model_id: string;
  display_name: string;
  is_active: boolean;
  capabilities: {
    vision?: boolean;
    reasoning?: boolean;
    function_calling?: boolean;
    image_generation?: boolean;
  } | null;
  created_at: string;
}

export interface ProviderConnection {
  id: string;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  model_count: number;
  models: DiscoveredModel[];
}

export interface ProviderSyncResponse {
  connection: ProviderConnection;
  discovered_count: number;
}

export interface AvailableModel {
  id: string;
  model_id: string;
  display_name: string;
  provider_type: ProviderType;
  provider_name: string;
  connection_id: string;
  capabilities: {
    vision?: boolean;
    reasoning?: boolean;
    function_calling?: boolean;
    image_generation?: boolean;
  } | null;
  is_active: boolean;
}

export interface ProviderConnectionCreate {
  name: string;
  provider_type: ProviderType;
  base_url: string;
  api_key?: string | null;
}

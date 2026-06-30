'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Conversation Page — Active chat with message stream and input
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useChatStore } from '@/stores/chatStore';
import MessageStream from '@/components/chat/MessageStream';
import InputBar from '@/components/chat/InputBar';

export default function ConversationPage() {
  const params = useParams();
  const convId = params.convId as string;
  const { setActiveConversation, activeConversationId, isStreaming, isNewChatMode } = useChatStore();

  useEffect(() => {
    // Don't restore a conversation if:
    // 1. isNewChatMode: user clicked "New Chat" — resetChat() was called and we don't
    //    want this effect to undo that by re-setting the old conversation ID.
    // 2. isStreaming: a message is being streamed in — calling setActiveConversation
    //    would clear the messages array and disrupt the active stream.
    if (isNewChatMode || isStreaming) return;

    if (convId && convId !== activeConversationId) {
      setActiveConversation(convId);
    }
  }, [convId, activeConversationId, setActiveConversation, isStreaming, isNewChatMode]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <MessageStream />
      <InputBar conversationId={convId} />
    </div>
  );
}

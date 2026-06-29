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
  const { setActiveConversation, activeConversationId } = useChatStore();

  useEffect(() => {
    if (convId && convId !== activeConversationId) {
      setActiveConversation(convId);
    }
  }, [convId, activeConversationId, setActiveConversation]);

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

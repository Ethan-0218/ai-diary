'use client';

import { use, useEffect, useState } from 'react';
import type { ConversationDetail } from '@ai-diary/shared';
import { api } from '@/lib/api';
import { Chat } from './Chat';

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConversation(id).then(setDetail).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="container">불러오기 실패: {error}</div>;
  if (!detail) return <div className="container">불러오는 중…</div>;
  return <Chat detail={detail} />;
}

'use client';

import { useEffect, useState } from 'react';
import type { CostSummary, LlmStep } from '@ai-diary/shared';
import { api } from '@/lib/api';

const STEP_LABEL: Record<LlmStep, string> = {
  first_greeting: '첫 인사',
  chat_turn: '대화',
  photo_caption: '사진 분석',
  diary_generation: '일기 생성',
  memory_extraction: '기억 추출',
};

export function CostPanel({
  conversationId,
  refreshKey,
}: {
  conversationId: string;
  refreshKey: number;
}) {
  const [costs, setCosts] = useState<CostSummary | null>(null);

  useEffect(() => {
    api.getCosts(conversationId).then(setCosts).catch(() => {});
  }, [conversationId, refreshKey]);

  if (!costs) return null;

  return (
    <div
      className="card"
      style={{ padding: 12, fontSize: 13, background: '#fbfbf9' }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>💰 누적 비용</strong>
        <span className="badge">${costs.totalUsd.toFixed(5)}</span>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 3 }}>
        {(Object.keys(costs.byStep) as LlmStep[])
          .filter((s) => costs.byStep[s].calls > 0)
          .map((s) => (
            <div key={s} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">
                {STEP_LABEL[s]} · {costs.byStep[s].calls}회 · {costs.byStep[s].tokens} tok
              </span>
              <span>${costs.byStep[s].costUsd.toFixed(5)}</span>
            </div>
          ))}
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
        토큰 in {costs.totalInputTokens} / out {costs.totalOutputTokens} · 호출{' '}
        {costs.totalCalls}회
      </div>
    </div>
  );
}

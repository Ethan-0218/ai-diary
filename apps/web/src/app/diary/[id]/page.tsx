'use client';

import { use, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  getFormatDef,
  type ConversationDetail,
  type CostSummary,
} from '@ai-diary/shared';
import { api } from '@/lib/api';

/**
 * 일기 본문의 `![](사진N)` 플레이스홀더를 실제 첨부 이미지 URL로 치환한다.
 * (react-markdown 커스텀 img 컴포넌트에 비-URL src를 의존하지 않고, 마크다운 자체를 self-contained하게)
 */
function resolvePhotoTokens(
  content: string,
  attachments: ConversationDetail['attachments'],
): string {
  return content.replace(
    /(!\[[^\]]*\]\()\s*사진\s*(\d+)\s*(\))/g,
    (full, pre: string, n: string, post: string) => {
      const att = attachments[Number(n) - 1];
      return att ? `${pre}${att.url}${post}` : full;
    },
  );
}

export default function DiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [reviseInput, setReviseInput] = useState('');
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savedFeedback, setSavedFeedback] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const load = () => {
    api
      .getConversation(id)
      .then((d) => {
        setDetail(d);
        setFeedback(d.feedback?.content ?? '');
        setSavedFeedback(d.feedback?.content ?? '');
        setSavedAt(d.feedback?.updatedAt ?? null);
      })
      .catch(() => {});
    api.getCosts(id).then(setCosts).catch(() => {});
  };
  useEffect(load, [id]);

  const saveFeedback = async () => {
    setSavingFeedback(true);
    try {
      const res = await api.saveFeedback(id, feedback);
      setSavedFeedback(res.feedback?.content ?? '');
      setFeedback(res.feedback?.content ?? '');
      setSavedAt(res.feedback?.updatedAt ?? null);
    } catch (e) {
      alert('피드백 저장 실패: ' + (e as Error).message);
    } finally {
      setSavingFeedback(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      await api.generateDiary(id);
      load();
    } finally {
      setRegenerating(false);
    }
  };

  const revise = async () => {
    const instruction = reviseInput.trim();
    if (!instruction || revising) return;
    setRevising(true);
    try {
      await api.reviseDiary(id, instruction);
      setReviseInput('');
      load();
    } catch (e) {
      alert('일기 수정 실패: ' + (e as Error).message);
    } finally {
      setRevising(false);
    }
  };

  if (!detail) return <div className="container">불러오는 중…</div>;
  const def = getFormatDef(detail.format);
  const diaryCost = costs?.byStep.diary_generation;

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <a className="muted" href="/">
          ← 홈
        </a>
        <span className="badge">
          {def.label} · {detail.modelId}
        </span>
      </div>

      {costs && (
        <div className="card" style={{ margin: '12px 0', background: '#fbfbf9', fontSize: 13 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>💰 이 일기 완성에 든 총비용</strong>
            <span className="badge">${costs.totalUsd.toFixed(5)}</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            일기 생성: ${diaryCost ? diaryCost.costUsd.toFixed(5) : '0'} · 전체 토큰 in{' '}
            {costs.totalInputTokens} / out {costs.totalOutputTokens} · LLM 호출{' '}
            {costs.totalCalls}회
          </div>
        </div>
      )}

      <article
        className="card"
        style={{ padding: '24px 28px', lineHeight: 1.8, overflow: 'hidden' }}
      >
        {detail.diary ? (
          <ReactMarkdown
            components={{
              img: ({ src, alt }) => {
                if (!src) return null;
                // 정방형으로 크롭 + 왼쪽 플로트로 글이 오른쪽 여백을 따라 흐르게
                return (
                  <span
                    style={{
                      float: 'left',
                      width: 'min(240px, 45%)',
                      aspectRatio: '1 / 1',
                      margin: '4px 18px 10px 0',
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <img
                      src={src as string}
                      alt={alt ?? ''}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </span>
                );
              },
            }}
          >
            {resolvePhotoTokens(detail.diary.content, detail.attachments)}
          </ReactMarkdown>
        ) : (
          <p className="muted">아직 일기가 생성되지 않았습니다.</p>
        )}
      </article>

      {detail.diary && (
        <section
          className="card"
          style={{ marginTop: 12, padding: '14px 18px', background: '#fbfbf9' }}
        >
          <strong>✏️ 일기 고치기</strong>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            고치고 싶은 점을 적으면 그대로 다시 써줍니다. 예: “오전→오후 순서로 바꿔줘”,
            “운동은 저녁에 갔다고 고쳐줘”, “좀 더 담백하게”.
          </p>
          <div className="row" style={{ alignItems: 'stretch' }}>
            <input
              className="select"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="이렇게 고쳐줘…"
              value={reviseInput}
              onChange={(e) => setReviseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') revise();
              }}
              disabled={revising}
            />
            <button
              className="btn btn-primary"
              onClick={revise}
              disabled={revising || !reviseInput.trim()}
            >
              {revising ? '고치는 중…' : '수정 반영'}
            </button>
          </div>
        </section>
      )}

      {detail.messages.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary
            style={{
              cursor: 'pointer',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: '#fbfbf9',
              fontWeight: 600,
              listStyle: 'none',
              userSelect: 'none',
            }}
          >
            💬 실제 대화 전체 보기 ({detail.messages.length}개 메시지)
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {detail.messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    marginLeft: isUser ? 'auto' : 0,
                    background: isUser ? 'var(--accent)' : '#fff',
                    color: isUser ? '#fff' : 'var(--text)',
                    border: `1px solid ${isUser ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 14,
                    padding: '9px 13px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}
                >
                  {m.content}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {detail.attachments.length > 0 && (
        <>
          <h3>첨부 사진</h3>
          <div className="row">
            {detail.attachments.map((a) => (
              <figure key={a.id} style={{ margin: 0, maxWidth: 200 }}>
                <img
                  src={a.url}
                  alt={a.caption ?? ''}
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                />
                {a.caption && (
                  <figcaption className="muted" style={{ fontSize: 12 }}>
                    {a.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}

      <section className="card" style={{ marginTop: 16, padding: '16px 18px' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong>📝 이 테스트에 대한 피드백</strong>
          {savedAt && (
            <span className="muted" style={{ fontSize: 12 }}>
              마지막 저장 {new Date(savedAt).toLocaleString('ko-KR')}
            </span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
          생성된 일기와 대화의 좋았던 점·아쉬운 점을 자유롭게 적어두세요. 나중에 AI agent 개선 플랜에 활용됩니다.
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="예: 질문이 너무 일반적이었다 / 일기 톤이 과하게 감성적이다 / 사진 제안 타이밍이 좋았다 …"
          rows={5}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            font: 'inherit',
            lineHeight: 1.6,
            boxSizing: 'border-box',
          }}
        />
        <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={saveFeedback}
            disabled={savingFeedback || feedback === savedFeedback}
          >
            {savingFeedback ? '저장 중…' : '피드백 저장'}
          </button>
          {feedback !== savedFeedback && (
            <span className="muted" style={{ fontSize: 13 }}>
              저장되지 않은 변경사항이 있어요
            </span>
          )}
        </div>
      </section>

      <div className="row" style={{ marginTop: 16 }}>
        <a className="btn" href={`/chat/${id}`}>
          대화 이어가기
        </a>
        <button className="btn" onClick={regenerate} disabled={regenerating}>
          {regenerating ? '다시 쓰는 중…' : '일기 다시 쓰기'}
        </button>
      </div>
    </div>
  );
}

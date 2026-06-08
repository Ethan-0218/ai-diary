'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { getFormatDef, type ConversationDetail } from '@ai-diary/shared';
import { api, API_BASE } from '@/lib/api';
import { CostPanel } from '@/components/CostPanel';

export function Chat({ detail }: { detail: ConversationDetail }) {
  const router = useRouter();
  const def = getFormatDef(detail.format);

  const initialMessages: UIMessage[] = useMemo(
    () =>
      detail.messages.map((m) => {
        const parts: any[] = [{ type: 'text', text: m.content }];
        // 저장된 parts에서 함께 보낸 사진 파트(data-photo)를 복원해 버블에 다시 표시
        if (Array.isArray(m.parts)) {
          for (const p of m.parts as any[]) {
            if (p?.type === 'data-photo') parts.push(p);
          }
        }
        return { id: m.id, role: m.role, parts } as UIMessage;
      }),
    [detail.messages],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: detail.id,
    transport: new DefaultChatTransport({
      api: `${API_BASE}/conversations/${detail.id}/chat`,
    }),
    messages: initialMessages,
  });

  const [input, setInput] = useState('');
  // 작성칸에 대기 중인(아직 안 보낸) 사진 — 텍스트와 함께 한 번에 전송한다
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [costKey, setCostKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [busyDiary, setBusyDiary] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = status === 'streaming' || status === 'submitted';

  // 최신 assistant 메시지에서 tool 시그널 추출 (리로드 시 저장된 수집 상태로 시드)
  const signals = useMemo(
    () => detectSignals(messages, detail.collectionState?.enough ?? false),
    [messages, detail.collectionState],
  );

  const onSend = async () => {
    const text = input.trim();
    if (busy || uploading) return;
    if (!text && !pending) return;
    const photo = pending;
    setInput('');
    setPending(null);

    if (photo) {
      // 사진 + 텍스트를 한 메시지로 함께 전송. 업로드 후 data-photo 파트로 붙인다.
      setUploading(true);
      try {
        const att = await api.uploadAttachment(detail.id, photo.file);
        sendMessage({
          role: 'user',
          parts: [
            ...(text ? [{ type: 'text', text }] : []),
            { type: 'data-photo', data: { url: att.url, mediaType: att.mimeType } },
          ],
        } as any);
        URL.revokeObjectURL(photo.preview);
      } catch (e) {
        alert('업로드 실패: ' + (e as Error).message);
        setInput(text);
        setPending(photo);
        setUploading(false);
        return;
      }
      setUploading(false);
    } else {
      sendMessage({ text });
    }
    bumpCostSoon();
  };

  const bumpCostSoon = () => {
    // 스트림 종료 후 비용 반영되도록 약간 지연
    setTimeout(() => setCostKey((k) => k + 1), 1200);
  };

  const onPickFile = (file: File) => {
    // 바로 보내지 않고 작성칸에 대기시킨다 (텍스트를 곁들여 함께 보낼 수 있도록)
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
  };

  const finishDiary = async () => {
    setBusyDiary(true);
    try {
      await api.generateDiary(detail.id);
      router.push(`/diary/${detail.id}`);
    } catch (e) {
      alert('일기 생성 실패: ' + (e as Error).message);
      setBusyDiary(false);
    }
  };

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <a className="muted" href="/">
            ← 홈
          </a>
          <h2 style={{ margin: '4px 0' }}>{detail.title}</h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="badge">
            {def.label} · {detail.modelId}
          </span>
          {detail.weatherNote && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              🌤️ {detail.weatherNote}
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <CostPanel conversationId={detail.id} refreshKey={costKey} />
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {busy && <ThinkingBubble streaming={status === 'streaming'} />}
        {error && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '80%',
              background: '#fff5f5',
              color: '#c0392b',
              border: '1px solid #f0b4b4',
              borderRadius: 14,
              padding: '9px 13px',
              fontSize: 14,
            }}
          >
            ⚠️ {error.message?.trim() || '답장을 받지 못했어요. 잠시 후 다시 보내주세요.'}
          </div>
        )}
      </div>

      {signals.photo && (
        <div
          className="card"
          style={{ marginTop: 12, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
        >
          📷 이 순간 사진이 있다면 첨부해보세요!
        </div>
      )}

      {pending && (
        <div
          className="row"
          style={{ marginTop: 12, alignItems: 'center', gap: 10 }}
        >
          <div style={{ position: 'relative', width: 72, height: 72 }}>
            <img
              src={pending.preview}
              alt="첨부할 사진"
              style={{
                width: 72,
                height: 72,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            />
            <button
              onClick={() => {
                URL.revokeObjectURL(pending.preview);
                setPending(null);
              }}
              title="첨부 취소"
              style={{
                position: 'absolute',
                top: -8,
                right: -8,
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: 'none',
                background: '#333',
                color: '#fff',
                cursor: 'pointer',
                lineHeight: '22px',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            사진에 곁들일 설명을 적고 함께 보내보세요.
          </span>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
        <button
          className="btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={
            signals.photo
              ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
              : undefined
          }
        >
          {uploading ? '보내는 중…' : pending ? '📎 사진 변경' : '📎 사진 첨부'}
        </button>
        <input
          className="select"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={pending ? '사진에 곁들일 말을 적어보세요…' : '메시지를 입력하세요…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend();
          }}
        />
        <button
          className="btn btn-primary"
          onClick={onSend}
          disabled={busy || uploading || (!input.trim() && !pending)}
        >
          보내기
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <button
          className="btn"
          onClick={finishDiary}
          disabled={busyDiary}
          style={
            signals.diary
              ? { borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' }
              : undefined
          }
        >
          {busyDiary ? '일기 쓰는 중…' : '📖 일기 완성하기'}
        </button>
        {signals.diary && (
          <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
            AI가 일기를 쓸 준비가 됐다고 제안했어요.
          </span>
        )}
      </div>
    </div>
  );
}

/** 응답 대기/스트리밍 중 표시되는 "생각 중" 버블 */
function ThinkingBubble({ streaming }: { streaming: boolean }) {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '80%',
        background: '#fff',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '9px 13px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <style>{`
        @keyframes thinkBlink {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 1; }
        }
      `}</style>
      <span className="muted" style={{ fontSize: 14 }}>
        {streaming ? 'AI가 답하는 중' : 'AI가 생각 중'}
      </span>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'inline-block',
              animation: 'thinkBlink 1.2s infinite ease-in-out',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  const raw = (message.parts ?? [])
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
  const text = isUser ? raw : stripLeakedToolJson(raw);
  const photos = (message.parts ?? [])
    .filter((p: any) => p.type === 'data-photo')
    .map((p: any) => p.data?.url as string | undefined)
    .filter((u): u is string => !!u);
  if (!text && photos.length === 0) return null;
  return (
    <div
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
      }}
    >
      {photos.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          style={{
            display: 'block',
            width: 'min(240px, 100%)',
            borderRadius: 10,
            border: isUser ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--border)',
            marginBottom: text || i < photos.length - 1 ? 8 : 0,
          }}
        />
      ))}
      {text}
    </div>
  );
}

/** 일부 모델이 본문에 흘리는 tool 인자 JSON({"reason":...})을 방어적으로 제거 */
function stripLeakedToolJson(text: string): string {
  if (!text) return '';
  // 선행/단독 {"reason": ...} 블록 제거 (가장 흔한 누출 형태)
  const cleaned = text.replace(/\{\s*"reason"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g, '');
  return cleaned.trim();
}

/**
 * 마지막 assistant 메시지의 tool part로 시그널 추출.
 * - photo: requestPhoto 호출 여부
 * - diary: updateCollectionState 의 enough=true (또는 리로드 시드값)
 */
function detectSignals(
  messages: UIMessage[],
  seedEnough: boolean,
): { photo: boolean; diary: boolean } {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const parts = (lastAssistant?.parts ?? []) as any[];
  const photo = parts.some((p) => (p.type as string)?.startsWith('tool-requestPhoto'));
  const liveEnough = parts.some(
    (p) => p.type === 'tool-updateCollectionState' && p.input?.enough === true,
  );
  return { photo, diary: liveEnough || seedEnough };
}

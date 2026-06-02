'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DIARY_FORMAT_LIST,
  MODEL_OPTIONS,
  DEFAULT_MODEL_ID,
  type DiaryFormat,
  type ConversationSummary,
} from '@ai-diary/shared';
import { api } from '@/lib/api';

/** 브라우저 위치 1회 조회. 거부/미지원/타임아웃이면 undefined를 반환해 위치 없이 진행한다. */
function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 7000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export default function HomePage() {
  const router = useRouter();
  const [format, setFormat] = useState<DiaryFormat>('plain');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listConversations().then(setHistory).catch(() => {});
  }, []);

  const start = async () => {
    setCreating(true);
    try {
      // 현재 위치를 받아 날씨 컨텍스트로 활용 (거부/실패 시 위치 없이 진행)
      const coords = await getCurrentCoords();
      const conv = await api.createConversation(format, modelId, coords);
      router.push(`/chat/${conv.id}`);
    } catch (e) {
      alert('대화 생성 실패: ' + (e as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="container">
      <h1 style={{ marginBottom: 4 }}>AI 일기</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        AI와 대화하면 오늘 하루를 일기로 써줍니다.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>1. 일기 형식 고르기</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {DIARY_FORMAT_LIST.map((f) => (
            <label
              key={f.id}
              className="row"
              style={{
                border: `1px solid ${format === f.id ? 'var(--accent)' : 'var(--border)'}`,
                background: format === f.id ? 'var(--accent-soft)' : '#fff',
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="format"
                checked={format === f.id}
                onChange={() => setFormat(f.id)}
              />
              <div>
                <strong>{f.label}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {f.description}
                </div>
              </div>
            </label>
          ))}
        </div>

        <h3 style={{ marginBottom: 6 }}>2. 모델 고르기</h3>
        <select
          className="select"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={start} disabled={creating}>
            {creating ? '시작하는 중…' : '채팅 시작하기'}
          </button>
        </div>
      </div>

      <h3 style={{ marginTop: 28 }}>대화 히스토리</h3>
      {history.length === 0 && <p className="muted">아직 대화가 없습니다.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {history.map((c) => (
          <a key={c.id} href={c.hasDiary ? `/diary/${c.id}` : `/chat/${c.id}`}>
            <div className="card row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{c.title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(c.createdAt).toLocaleString('ko-KR')} · {c.modelId}
                  {c.hasDiary ? ' · 일기 완성' : ' · 진행 중'}
                </div>
              </div>
              <span className="badge">${c.totalUsd.toFixed(4)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

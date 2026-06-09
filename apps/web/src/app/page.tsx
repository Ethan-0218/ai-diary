'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MODEL_OPTIONS,
  DEFAULT_MODEL_ID,
  getFormatDef,
  type ConversationSummary,
  type NotebookDto,
  type ProductDto,
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
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [notebooks, setNotebooks] = useState<NotebookDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshNotebooks = () =>
    api.listNotebooks().then((n) => {
      setNotebooks(n);
      setSelected((cur) => cur ?? n[0]?.id ?? null);
    });

  useEffect(() => {
    refreshNotebooks().catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
    api.listConversations().then(setHistory).catch(() => {});
  }, []);

  const mintStarter = async (format: 'plain' | 'novel') => {
    setBusy(true);
    try {
      const nb = await api.mintStarter(format);
      await refreshNotebooks();
      setSelected(nb.id);
    } catch (e) {
      alert('스타터 발행 실패: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const grant = async (appStoreProductId: string) => {
    setBusy(true);
    try {
      const nb = await api.devGrantNotebook(appStoreProductId);
      await refreshNotebooks();
      setSelected(nb.id);
    } catch (e) {
      alert('발행 실패: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!selected) return;
    setCreating(true);
    try {
      const coords = await getCurrentCoords();
      const conv = await api.createConversation(selected, modelId, coords);
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
        일기장을 골라 오늘 칸을 채웁니다. (개발 하니스)
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>1. 일기장 고르기 (책장)</h3>
        {notebooks.length === 0 && (
          <p className="muted">아직 일기장이 없어요. 아래에서 발행하세요.</p>
        )}
        <div style={{ display: 'grid', gap: 10 }}>
          {notebooks.map((n) => (
            <label
              key={n.id}
              className="row"
              style={{
                border: `1px solid ${selected === n.id ? 'var(--accent)' : 'var(--border)'}`,
                background: selected === n.id ? 'var(--accent-soft)' : '#fff',
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="notebook"
                checked={selected === n.id}
                onChange={() => setSelected(n.id)}
              />
              <div>
                <strong>{n.title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {getFormatDef(n.format).label} ·{' '}
                  {n.periodType === 'period' ? '기간형' : '칸형'} ·{' '}
                  {n.filledCount}/{n.slotCount}칸
                  {n.voiceEnabled ? ' · 음성' : ''}
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
          <button
            className="btn btn-primary"
            onClick={start}
            disabled={creating || !selected}
          >
            {creating ? '시작하는 중…' : '오늘 칸 쓰기'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>일기장 발행 (개발용 — IAP 전 언블락)</h3>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="btn" disabled={busy} onClick={() => mintStarter('plain')}>
            + 스타터(일반 3칸)
          </button>
          <button className="btn" disabled={busy} onClick={() => mintStarter('novel')}>
            + 스타터(소설 3칸)
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {products.map((p) => (
            <div key={p.appStoreProductId} className="card row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{p.title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {p.section} · {getFormatDef(p.format).label} ·{' '}
                  {p.periodType === 'period' ? '기간형' : `칸형 ${p.slotCount}칸`}
                </div>
              </div>
              <button className="btn" disabled={busy} onClick={() => grant(p.appStoreProductId)}>
                발행
              </button>
            </div>
          ))}
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

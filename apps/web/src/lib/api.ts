import type {
  ConversationSummary,
  ConversationDetail,
  CostSummary,
  DiaryFormat,
  DiaryDto,
  FeedbackDto,
  ProductDto,
  NotebookDto,
  NotebookDetailDto,
} from '@ai-diary/shared';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:9001';

/** 서버가 주는 상대경로(/uploads/..)를 API_BASE 기준 절대 URL로. 이미 절대면 그대로. */
export function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

// 개발 하니스용 자동 로그인 — 고정 dev 유저로 액세스 토큰을 1회 발급해 캐시한다.
// (실제 소셜 로그인 UI는 모바일 S3.4 몫. web은 테스트 용도라 dev-login으로 대체.)
let tokenPromise: Promise<string> | null = null;
export function getToken(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = fetch(`${API_BASE}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'web-dev', name: '웹 테스터' }),
    })
      .then((r) => r.json())
      .then((d) => d.accessToken as string);
  }
  return tokenPromise;
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  listConversations: () =>
    authFetch(`${API_BASE}/conversations`, { cache: 'no-store' }).then((r) =>
      json<ConversationSummary[]>(r),
    ),

  createConversation: (
    notebookId: string,
    modelId: string,
    coords?: { latitude: number; longitude: number },
  ) =>
    authFetch(`${API_BASE}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        notebookId,
        modelId,
        ...coords,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).then((r) => json<ConversationDetail>(r)),

  // ── 일기장(소유)·상품 (S4) ──
  listProducts: () =>
    fetch(`${API_BASE}/products`, { cache: 'no-store' }).then((r) =>
      json<ProductDto[]>(r),
    ),

  listNotebooks: () =>
    authFetch(`${API_BASE}/notebooks`, { cache: 'no-store' }).then((r) =>
      json<NotebookDto[]>(r),
    ),

  mintStarter: (format: DiaryFormat) =>
    authFetch(`${API_BASE}/notebooks/starter`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format }),
    }).then((r) => json<NotebookDetailDto>(r)),

  /** 개발용 — IAP 검증 전 일기장 발행 언블락 */
  devGrantNotebook: (appStoreProductId: string) =>
    authFetch(`${API_BASE}/notebooks/dev-grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appStoreProductId }),
    }).then((r) => json<NotebookDetailDto>(r)),

  getConversation: (id: string) =>
    authFetch(`${API_BASE}/conversations/${id}`, { cache: 'no-store' }).then(
      (r) => json<ConversationDetail>(r),
    ),

  getCosts: (id: string) =>
    authFetch(`${API_BASE}/conversations/${id}/costs`, { cache: 'no-store' }).then(
      (r) => json<CostSummary>(r),
    ),

  generateDiary: (id: string) =>
    authFetch(`${API_BASE}/conversations/${id}/diary`, { method: 'POST' }).then(
      (r) => json<{ diary: DiaryDto; costs: CostSummary }>(r),
    ),

  reviseDiary: (id: string, instruction: string) =>
    authFetch(`${API_BASE}/conversations/${id}/diary/revise`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction }),
    }).then((r) => json<{ diary: DiaryDto; costs: CostSummary }>(r)),

  saveFeedback: (id: string, content: string) =>
    authFetch(`${API_BASE}/conversations/${id}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then((r) => json<{ feedback: FeedbackDto | null }>(r)),

  uploadAttachment: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return authFetch(`${API_BASE}/conversations/${id}/attachments`, {
      method: 'POST',
      body: fd,
    }).then((r) =>
      json<{
        id: string;
        url: string;
        caption: string | null;
        mimeType: string;
      }>(r),
    );
  },
};

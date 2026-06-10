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
  HomeSummaryDto,
} from '@ai-diary/shared';
import { API_BASE } from './config';
import { ApiError, notifyUnauthorized } from './errors';

export { API_BASE };

/** 로그인한 유저 (백엔드 User 엔티티 일부) */
export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  provider?: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

// 현재 액세스 토큰 — AuthContext가 로그인/복원 시 설정한다. authFetch가 헤더에 붙인다.
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(url, { ...init, headers });
  // 인증된 요청이 401이면 토큰이 만료/무효 → 자동 로그아웃 트리거(로그인 화면으로).
  if (res.status === 401 && authToken) notifyUnauthorized();
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
  return res.json() as Promise<T>;
}

/** 인증 — 소셜 로그인(provider 토큰 교환) · 개발용 dev-login · 현재 유저 */
export const authApi = {
  socialLogin: (provider: 'apple' | 'google' | 'kakao', token: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, token }),
    }).then((r) => json<LoginResult>(r)),

  // 개발 중 코어 루프 언블락용 — 백엔드는 NODE_ENV!=production에서만 허용.
  devLogin: (id = 'mobile-dev', name = '모바일 테스터') =>
    fetch(`${API_BASE}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name }),
    }).then((r) => json<LoginResult>(r)),

  me: () => authFetch(`${API_BASE}/auth/me`).then((r) => json<AuthUser>(r)),
};

/** RN 이미지 파일 디스크립터 (image-picker asset → multipart) */
export interface RNFile {
  uri: string;
  type: string;
  name: string;
}

export const api = {
  listConversations: () =>
    authFetch(`${API_BASE}/conversations`).then((r) =>
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
        // 유저 기기 타임존 — 인사 시각·오늘 칸 판정이 서버 UTC가 아니라 현지 기준이 되도록.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).then((r) => json<ConversationDetail>(r)),

  // ── 일기장(소유)·상품 (S4) ──
  listProducts: () =>
    fetch(`${API_BASE}/products`).then((r) => json<ProductDto[]>(r)),

  listNotebooks: () =>
    authFetch(`${API_BASE}/notebooks`).then((r) => json<NotebookDto[]>(r)),

  /** 적응형 홈(오늘) 요약 — 유저 타임존으로 오늘 칸·3상태를 서버가 확정. */
  getHomeSummary: () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return authFetch(
      `${API_BASE}/notebooks/home?tz=${encodeURIComponent(tz)}`,
    ).then((r) => json<HomeSummaryDto>(r));
  },

  getNotebook: (id: string) =>
    authFetch(`${API_BASE}/notebooks/${id}`).then((r) =>
      json<NotebookDetailDto>(r),
    ),

  mintStarter: (format: DiaryFormat) =>
    authFetch(`${API_BASE}/notebooks/starter`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format }),
    }).then((r) => json<NotebookDetailDto>(r)),

  /**
   * 구매 영수증(StoreKit JWS=purchaseToken)을 백엔드에서 검증 → 일기장 발행.
   * 멱등(같은 트랜잭션 재호출은 이미 발행한 권 반환).
   */
  verifyPurchase: (purchaseToken: string) =>
    authFetch(`${API_BASE}/purchases/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purchaseToken }),
    }).then((r) => json<NotebookDetailDto>(r)),

  getConversation: (id: string) =>
    authFetch(`${API_BASE}/conversations/${id}`).then((r) =>
      json<ConversationDetail>(r),
    ),

  getCosts: (id: string) =>
    authFetch(`${API_BASE}/conversations/${id}/costs`).then((r) =>
      json<CostSummary>(r),
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

  uploadAttachment: (id: string, file: RNFile) => {
    const fd = new FormData();
    // RN multipart: { uri, type, name } 형태를 append
    fd.append('file', file as unknown as Blob);
    return authFetch(`${API_BASE}/conversations/${id}/attachments`, {
      method: 'POST',
      body: fd,
    }).then((r) =>
      json<{ id: string; url: string; caption: string | null; mimeType: string }>(
        r,
      ),
    );
  },
};

/** 상대 경로(/uploads/..)를 절대 URL로 — RN <Image>는 절대 URL이 필요 */
export function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * 네트워크/HTTP 오류를 사용자용 한국어 메시지로 변환하는 공통 레이어.
 * 화면들은 raw `API 500: {...}` 대신 toUserMessage(e)를 노출한다.
 */

/** 서버가 비-2xx로 응답했을 때 — status와 원문 body를 보존한다. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

/** fetch 자체가 실패(네트워크 끊김/타임아웃)했는지 — RN fetch는 TypeError를 던진다. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof ApiError) return false;
  const msg = (e as Error)?.message ?? String(e);
  return (
    e instanceof TypeError ||
    /network request failed|failed to fetch|timeout|aborted/i.test(msg)
  );
}

/** 무료 등급 quota 초과 등 서버 본문 신호를 사용자 안내로(백엔드 chatErrorMessage와 톤 일치). */
function quotaMessage(text: string): string | null {
  if (/RESOURCE_EXHAUSTED|free_tier|quota|exceeded your current quota/i.test(text)) {
    return '오늘 무료 AI 사용량 한도를 모두 사용했어요. 잠시 후 다시 시도해주세요.';
  }
  return null;
}

/**
 * 임의의 throw 값을 사용자에게 보여줄 한국어 한 줄로.
 * - 네트워크: 연결 안내
 * - 401: 세션 만료(자동 로그아웃과 함께)
 * - 4xx/5xx: 상황별 안내 (+ quota 특화)
 */
export function toUserMessage(e: unknown): string {
  if (isNetworkError(e)) {
    return '인터넷 연결을 확인하고 다시 시도해주세요.';
  }
  if (e instanceof ApiError) {
    const q = quotaMessage(e.body);
    if (q) return q;
    if (e.status === 401) return '로그인이 만료됐어요. 다시 로그인해주세요.';
    if (e.status === 413) return '파일이 너무 커요. 더 작은 사진을 골라주세요.';
    if (e.status === 404) return '대상을 찾을 수 없어요.';
    if (e.status >= 500) return '서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해주세요.';
    return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
  }
  const msg = (e as Error)?.message?.trim();
  return msg || '문제가 발생했어요. 잠시 후 다시 시도해주세요.';
}

// 인증 만료(401) 시 호출될 핸들러 — AuthContext가 signOut을 등록한다.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

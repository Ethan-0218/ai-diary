import { NativeModules, Platform } from 'react-native';

/** 백엔드 포트(규칙: api = 9001) */
const API_PORT = 9001;

/** 릴리스(프로덕션) API — 추후 실제 도메인으로 교체 */
const PROD_API_BASE = 'https://api.ai-diary.app';

/**
 * 개발 중 Metro가 JS 번들을 내려준 호스트를 그대로 추출한다.
 * scriptURL 예) "http://192.168.123.149:9002/index.bundle?..." → "192.168.123.149"
 * - 실기기/시뮬/네트워크가 바뀌어도 Metro가 쓰는 호스트를 자동 추종 → IP 하드코딩 불필요.
 */
function devServerHost(): string | null {
  const sc: any = NativeModules.SourceCode;
  const scriptURL: string | undefined =
    sc?.getConstants?.().scriptURL ?? sc?.scriptURL;
  const host = scriptURL
    ? /^https?:\/\/([^/:]+)(?::\d+)?\//.exec(scriptURL)?.[1]
    : null;
  return host ?? null;
}

/**
 * API 베이스 URL.
 * - 개발: Metro 번들을 내려준 호스트:9001 (실기기·시뮬·네트워크 변경 자동 추종)
 * - 번들 호스트를 못 구하면 폴백(시뮬 localhost / 안드로이드 에뮬 10.0.2.2)
 * - 릴리스: PROD_API_BASE
 */
function resolveApiBase(): string {
  if (__DEV__) {
    const host = devServerHost();
    if (host) return `http://${host}:${API_PORT}`;
    return Platform.OS === 'android'
      ? `http://10.0.2.2:${API_PORT}`
      : `http://localhost:${API_PORT}`;
  }
  return PROD_API_BASE;
}

export const API_BASE = resolveApiBase();

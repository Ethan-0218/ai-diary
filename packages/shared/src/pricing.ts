/**
 * 모델별 가격 단일 소스. 단위: USD per 1M tokens.
 * 새 모델 추가/제거는 이 표 한 곳에서만 한다. (naming-studio llm-pricing 패턴)
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // 현재 라인업 (공식 가격 확인: 2026-06)
  // Gemini 3 Flash: ai.google.dev/gemini-api/docs/pricing — 입력 $0.50(text/image/video) / 출력 $3.00
  'gemini-3-flash-preview': { input: 0.5, output: 3.0 },
  // 라인업에서 빠진 모델들 — 과거 대화 비용 표시 + 향후 비교 참고용 (공식가, 2026-06)
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4': { input: 2.5, output: 15.0 }, // 캐시입력 $0.25
  'gpt-5.5': { input: 5.0, output: 30.0 }, // 캐시입력 $0.50
  // 임베딩(기억 의미검색용) — 입력 토큰만 과금, 출력 없음. (OpenAI, 2026-06)
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

/**
 * 입력/출력 토큰 수와 모델명으로 USD 비용을 계산한다.
 * 미등록 모델이면 0을 반환하고 경고. 6자리에서 반올림.
 */
export function calcCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = MODEL_PRICING[model];
  if (!price) {
    // eslint-disable-next-line no-console
    console.warn(`[llm-pricing] unknown model: ${model}`);
    return 0;
  }
  const cost =
    (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

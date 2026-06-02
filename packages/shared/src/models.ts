/**
 * PoC 화면에서 전환 가능한 LLM 모델 목록.
 * provider는 백엔드의 resolveModel()에서 vercel ai SDK provider로 매핑된다.
 * 실제 모델 id는 env override 가능(백엔드 참고).
 */
export type ModelProvider = 'anthropic' | 'openai' | 'google';

export interface ModelOption {
  id: string;
  label: string;
  provider: ModelProvider;
}

// 재테스트 + 공식 단가 비교 결과 Gemini 단독으로 정리.
// Gemini 3 Flash가 품질 1위이면서 최저가($0.5/$3.0)이고, GPT는 전 티어가 최소 5배 비싸
// (gpt-5.4 $2.5/$15, gpt-5.5 $5/$30) 가성비가 안 나옴. Claude Haiku도 비용 과다로 제거.
export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', provider: 'google' },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

export function getModelOption(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.id === id);
}

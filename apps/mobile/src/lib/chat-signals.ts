import type { UIMessage } from 'ai';

/**
 * 일부 모델이 답변 본문에 흘리는 tool 인자 JSON({"reason":...})을 방어적으로 제거.
 * (web Chat.tsx와 동일 로직)
 */
export function stripLeakedToolJson(text: string): string {
  if (!text) return '';
  const cleaned = text.replace(/\{\s*"reason"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g, '');
  return cleaned.trim();
}

/**
 * 마지막 assistant 메시지의 tool part로 UI 시그널 추출.
 * - photo: requestPhoto 호출 여부 → 사진 첨부 권유 강조
 * - diary: updateCollectionState.enough=true(또는 리로드 시드) → 일기 완성 CTA 강조
 */
export function detectSignals(
  messages: UIMessage[],
  seedEnough: boolean,
): { photo: boolean; diary: boolean } {
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const parts = (lastAssistant?.parts ?? []) as any[];
  const photo = parts.some((p) =>
    (p.type as string)?.startsWith('tool-requestPhoto'),
  );
  const liveEnough = parts.some(
    (p) => p.type === 'tool-updateCollectionState' && p.input?.enough === true,
  );
  return { photo, diary: liveEnough || seedEnough };
}

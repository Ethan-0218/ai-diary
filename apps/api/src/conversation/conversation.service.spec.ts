import { parseCollectionState } from './conversation.service';

describe('parseCollectionState', () => {
  it('null/undefined/빈 문자열이면 null', () => {
    expect(parseCollectionState(null)).toBeNull();
    expect(parseCollectionState(undefined)).toBeNull();
    expect(parseCollectionState('')).toBeNull();
  });

  it('정상 JSON을 CollectionState로 파싱', () => {
    const raw = JSON.stringify({
      filled: ['사건'],
      skipped: ['감정'],
      enough: true,
      nextGap: '다음',
      updatedAt: '2026-06-08T00:00:00.000Z',
    });
    expect(parseCollectionState(raw)).toEqual({
      filled: ['사건'],
      skipped: ['감정'],
      enough: true,
      nextGap: '다음',
      updatedAt: '2026-06-08T00:00:00.000Z',
    });
  });

  it('손상된 JSON이면 null', () => {
    expect(parseCollectionState('{not json')).toBeNull();
  });

  it('누락 필드는 기본값으로 채움(배열 아님→[], enough 불리언화, nextGap 없음)', () => {
    const s = parseCollectionState(JSON.stringify({ enough: 1, filled: 'x' }))!;
    expect(s.filled).toEqual([]);
    expect(s.skipped).toEqual([]);
    expect(s.enough).toBe(true);
    expect(s.nextGap).toBeUndefined();
    expect(typeof s.updatedAt).toBe('string');
  });
});

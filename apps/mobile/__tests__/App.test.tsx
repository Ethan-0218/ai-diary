/**
 * @format
 *
 * 풀 App 렌더는 네이티브 모듈(Apple auth·screens·async-storage) 의존이라 jest에서
 * 무거운 모킹이 필요하다. 대신 web에서 이식한 순수 로직(시그널·사진토큰·URL)을 검증한다.
 */
import type { UIMessage } from 'ai';
import { detectSignals, stripLeakedToolJson } from '../src/lib/chat-signals';
import { resolvePhotoTokens } from '../src/lib/photo-tokens';
import { absoluteUrl } from '../src/lib/api';

const assistant = (parts: any[]): UIMessage =>
  ({ id: 'a', role: 'assistant', parts } as UIMessage);

describe('stripLeakedToolJson', () => {
  it('누출된 reason JSON 블록을 제거한다', () => {
    expect(stripLeakedToolJson('{"reason": "사진 권유"}안녕')).toBe('안녕');
  });
  it('일반 텍스트는 그대로 둔다', () => {
    expect(stripLeakedToolJson('오늘 하루 어땠어?')).toBe('오늘 하루 어땠어?');
  });
  it('빈 입력은 빈 문자열', () => {
    expect(stripLeakedToolJson('')).toBe('');
  });
});

describe('detectSignals', () => {
  it('마지막 assistant의 requestPhoto tool part로 photo 시그널', () => {
    const msgs = [assistant([{ type: 'tool-requestPhoto', input: {} }])];
    expect(detectSignals(msgs, false).photo).toBe(true);
  });
  it('updateCollectionState.enough=true면 diary 시그널', () => {
    const msgs = [
      assistant([{ type: 'tool-updateCollectionState', input: { enough: true } }]),
    ];
    expect(detectSignals(msgs, false).diary).toBe(true);
  });
  it('시드 enough(리로드)로도 diary 시그널', () => {
    expect(detectSignals([assistant([])], true).diary).toBe(true);
  });
  it('시그널 없으면 둘 다 false', () => {
    expect(detectSignals([assistant([{ type: 'text', text: '안녕' }])], false)).toEqual(
      { photo: false, diary: false },
    );
  });
});

describe('resolvePhotoTokens', () => {
  it('사진N 토큰을 N번째 첨부 절대 URL로 치환', () => {
    const out = resolvePhotoTokens('![](사진1) 본문', [
      { url: '/uploads/a.jpg' },
    ]);
    expect(out).toContain(absoluteUrl('/uploads/a.jpg'));
    expect(out).not.toContain('사진1');
  });
  it('해당 첨부가 없으면 원문 유지', () => {
    expect(resolvePhotoTokens('![](사진2)', [{ url: '/uploads/a.jpg' }])).toBe(
      '![](사진2)',
    );
  });
});

describe('absoluteUrl', () => {
  it('절대 URL은 그대로', () => {
    expect(absoluteUrl('https://x/y.jpg')).toBe('https://x/y.jpg');
  });
  it('상대 경로는 API_BASE를 붙인다', () => {
    expect(absoluteUrl('/uploads/a.jpg')).toMatch(/\/uploads\/a\.jpg$/);
  });
});

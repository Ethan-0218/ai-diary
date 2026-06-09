/**
 * @format
 *
 * 풀 App 렌더는 네이티브 모듈(Apple auth·screens·async-storage) 의존이라 jest에서
 * 무거운 모킹이 필요하다. 대신 web에서 이식한 순수 로직(시그널·사진토큰·URL)을 검증한다.
 */
// react-native-image-picker는 untranspiled TS를 export → jest에서 모킹(순수 함수는 네이티브 호출 안 함).
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

import type { UIMessage } from 'ai';
import { detectSignals, stripLeakedToolJson } from '../src/lib/chat-signals';
import { resolvePhotoTokens } from '../src/lib/photo-tokens';
import { absoluteUrl } from '../src/lib/api';
import { ApiError, isNetworkError, toUserMessage } from '../src/lib/errors';
import { assetToFile, classifyPickerResponse } from '../src/lib/photo-picker';

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

describe('toUserMessage', () => {
  it('네트워크 오류는 연결 안내', () => {
    expect(toUserMessage(new TypeError('Network request failed'))).toMatch(
      /인터넷 연결/,
    );
  });
  it('401은 세션 만료 안내', () => {
    expect(toUserMessage(new ApiError(401, 'Unauthorized'))).toMatch(/로그인이 만료/);
  });
  it('5xx는 서버 일시 문제 안내', () => {
    expect(toUserMessage(new ApiError(503, 'oops'))).toMatch(/서버에 일시적인 문제/);
  });
  it('413은 파일 크기 안내', () => {
    expect(toUserMessage(new ApiError(413, 'too large'))).toMatch(/파일이 너무 커요/);
  });
  it('quota 본문은 무료 한도 안내', () => {
    expect(toUserMessage(new ApiError(429, 'RESOURCE_EXHAUSTED'))).toMatch(
      /무료 AI 사용량 한도/,
    );
  });
  it('일반 Error는 메시지를 그대로 노출', () => {
    expect(toUserMessage(new Error('직접 메시지'))).toBe('직접 메시지');
  });
});

describe('isNetworkError', () => {
  it('ApiError는 네트워크 오류가 아니다', () => {
    expect(isNetworkError(new ApiError(500, ''))).toBe(false);
  });
  it('TypeError(fetch 실패)는 네트워크 오류', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });
});

describe('classifyPickerResponse', () => {
  it('취소는 cancel', () => {
    expect(classifyPickerResponse({ didCancel: true } as any).kind).toBe('cancel');
  });
  it('권한 errorCode는 permission', () => {
    expect(classifyPickerResponse({ errorCode: 'permission' } as any).kind).toBe(
      'permission',
    );
  });
  it('camera_unavailable는 error + 안내', () => {
    const r = classifyPickerResponse({ errorCode: 'camera_unavailable' } as any);
    expect(r.kind).toBe('error');
    expect(r.kind === 'error' && r.message).toMatch(/카메라를 사용할 수 없/);
  });
  it('정상 asset은 file로 변환', () => {
    const r = classifyPickerResponse({
      assets: [{ uri: 'file://p.jpg', type: 'image/png', fileName: 'p.jpg' }],
    } as any);
    expect(r.kind).toBe('file');
    expect(r.kind === 'file' && r.file.uri).toBe('file://p.jpg');
  });
  it('uri 없는 asset은 error', () => {
    expect(classifyPickerResponse({ assets: [{}] } as any).kind).toBe('error');
  });
});

describe('assetToFile', () => {
  it('uri 없으면 null', () => {
    expect(assetToFile(undefined)).toBeNull();
    expect(assetToFile({} as any)).toBeNull();
  });
  it('type/name 누락 시 기본값', () => {
    const f = assetToFile({ uri: 'file://x' } as any);
    expect(f?.type).toBe('image/jpeg');
    expect(f?.name).toMatch(/^photo-\d+\.jpg$/);
  });
});

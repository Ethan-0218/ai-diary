jest.mock('ai', () => ({
  streamText: jest.fn(),
  convertToModelMessages: jest.fn(async (m: any) => m.map((x: any) => ({ role: x.role, content: 'c' }))),
  stepCountIs: jest.fn(() => 'stop4'),
  tool: jest.fn((cfg: any) => cfg),
}));
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn(),
      writeFile: jest.fn(),
      readFile: jest.fn(),
    },
  };
});
jest.mock('heic-convert', () => jest.fn());

import {
  ConversationController,
  UPLOAD_DIR,
  stripLeakedToolJson,
  uiText,
  isHeic,
  chatErrorMessage,
  heicToJpeg,
  injectAttachedPhotos,
} from './conversation.controller';

it('UPLOAD_DIR은 uploads 디렉터리', () => {
  expect(UPLOAD_DIR).toContain('uploads');
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { streamText } = require('ai');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsp = require('fs').promises;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const heicConvert = require('heic-convert');

describe('stripLeakedToolJson', () => {
  it('undefined→빈, tool-arg JSON 제거, 그 외 JSON 유지', () => {
    expect(stripLeakedToolJson(undefined)).toBe('');
    expect(stripLeakedToolJson('안녕 {"reason":"x"} 끝')).not.toContain('reason');
    expect(stripLeakedToolJson('a {"foo":1} b')).toContain('foo'); // tool 키 아님 → 유지
    expect(stripLeakedToolJson('arr [1,2]')).toContain('[1,2]'); // 배열 → 유지
    expect(stripLeakedToolJson('x {not json} y')).toContain('not json'); // 파싱 실패 → 유지
    expect(stripLeakedToolJson('열린 { 괄호')).toContain('{'); // 짝 없음 → 유지(matchBrace -1)
    expect(stripLeakedToolJson('중첩 {"a":{"b":1}} 끝')).toContain('a'); // 중첩 괄호(depth) → 유지
    expect(stripLeakedToolJson('{"reason":"a\\"b"}')).toBe(''); // 이스케이프 따옴표 처리
  });
});

describe('uiText', () => {
  it('text 파트만 이어붙임', () => {
    expect(
      uiText({ parts: [{ type: 'text', text: '안' }, { type: 'data-photo' }, { type: 'text', text: '녕' }] } as any),
    ).toBe('안녕');
    expect(uiText({} as any)).toBe('');
  });
});

describe('isHeic', () => {
  it.each([
    ['image/heic', 'jpg', true],
    ['image/heif', 'x', true],
    ['', 'heic', true],
    [undefined, 'heif', true],
    ['image/jpeg', 'jpg', false],
  ])('mt=%s ext=%s → %s', (mt, ext, expected) => {
    expect(isHeic(mt as any, ext as string)).toBe(expected);
  });
});

describe('chatErrorMessage', () => {
  it('quota 계열은 안내 메시지', () => {
    expect(chatErrorMessage('quota exceeded')).toContain('무료 AI 사용량');
    expect(chatErrorMessage({ responseBody: 'RESOURCE_EXHAUSTED' })).toContain('무료 AI');
    expect(chatErrorMessage({ lastError: { message: 'free_tier limit' } })).toContain('무료 AI');
  });
  it('그 외는 일반 메시지 (null·errors 배열·깊이초과 포함)', () => {
    expect(chatErrorMessage(null)).toContain('오류가 발생');
    expect(chatErrorMessage({ message: 'oops' })).toContain('오류가 발생');
    expect(chatErrorMessage({ errors: [{ message: 'a' }, 'b', 42] })).toContain('오류가 발생'); // 숫자(비문자·비객체) 포함
    expect(
      chatErrorMessage({ lastError: { lastError: { lastError: { lastError: { message: 'deep' } } } } }),
    ).toContain('오류가 발생');
  });
});

describe('heicToJpeg', () => {
  it('Buffer 반환은 그대로, ArrayBuffer는 Buffer로 변환', async () => {
    heicConvert.mockResolvedValueOnce(Buffer.from('jpeg'));
    expect(Buffer.isBuffer(await heicToJpeg(Buffer.from('x')))).toBe(true);
    heicConvert.mockResolvedValueOnce(new ArrayBuffer(4));
    const out = await heicToJpeg(Buffer.from('x'));
    expect(Buffer.isBuffer(out)).toBe(true);
  });
});

describe('injectAttachedPhotos', () => {
  beforeEach(() => fsp.readFile.mockReset());

  it('non-user skip · 문자열 content wrap · url없음 skip · parts없음 continue · 읽기성공', async () => {
    fsp.readFile.mockResolvedValue(Buffer.from('img'));
    const ui = [
      { role: 'assistant', parts: [] }, // user 아님 → skip
      {
        role: 'user',
        parts: [
          { type: 'data-photo', data: { url: 'http://h/uploads/a.jpg', mediaType: 'image/png' } },
          { type: 'data-photo', data: {} }, // url 없음 → skip
        ],
      },
      { role: 'user' }, // parts 없음(?? []) → 사진 없음 → continue
    ];
    const model: any[] = [
      { role: 'assistant', content: 'x' },
      { role: 'user', content: 'hi' }, // truthy 문자열 → [{text}] wrap
      { role: 'user', content: 'y' },
    ];
    await injectAttachedPhotos(ui as any, model);
    expect(model[1].content).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'image', image: expect.any(Buffer), mediaType: 'image/png' },
    ]);
    expect(model[2].content).toBe('y'); // parts 없는 ui라 손 안 댐
  });

  it('falsy content→[] · 배열 content · 읽기 실패 · 모델 소진 break', async () => {
    fsp.readFile.mockRejectedValue(new Error('no file'));
    const ui = [
      { role: 'user', parts: [{ type: 'data-photo', data: { url: 'http://h/uploads/b.jpg' } }] }, // model[0] '' → [] wrap, 읽기 실패
      { role: 'user', parts: [{ type: 'data-photo', data: { url: 'http://h/uploads/c.jpg' } }] }, // model[1] 배열, 읽기 실패
      { role: 'user', parts: [{ type: 'data-photo', data: { url: 'http://h/uploads/d.jpg' } }] }, // 모델 소진 → break
    ];
    const model: any[] = [
      { role: 'user', content: '' },
      { role: 'user', content: [{ type: 'text', text: 't' }] },
    ];
    await injectAttachedPhotos(ui as any, model);
    expect(model[0].content).toEqual([]); // falsy → [] (읽기 실패라 image 없음)
    expect(model[1].content).toEqual([{ type: 'text', text: 't' }]);
  });
});

describe('ConversationController', () => {
  let controller: ConversationController;
  let conv: any;
  let ai: any;
  let tracing: any;
  let memory: any;
  const req = { userId: 'u1' } as any;

  beforeEach(() => {
    conv = {
      create: jest.fn().mockResolvedValue('created'),
      list: jest.fn().mockResolvedValue('listed'),
      getDetail: jest.fn().mockResolvedValue('detail'),
      getCosts: jest.fn().mockResolvedValue('costs'),
      generateDiary: jest.fn().mockResolvedValue('diary'),
      reviseDiary: jest.fn().mockResolvedValue('revised'),
      saveFeedback: jest.fn().mockResolvedValue('fb'),
      requireConversation: jest.fn().mockResolvedValue({ id: 'c1', modelId: 'm1', weatherNote: null, collectionState: null, format: 'plain' }),
      saveMessage: jest.fn().mockResolvedValue({}),
      updateCollectionState: jest.fn().mockResolvedValue({}),
      addAttachment: jest.fn().mockResolvedValue({ id: 'a1' }),
    };
    ai = { resolveModel: jest.fn(() => 'MODEL') };
    tracing = { record: jest.fn() };
    memory = {
      buildContext: jest.fn().mockResolvedValue(null),
      recall: jest.fn().mockResolvedValue([]),
    };
    controller = new ConversationController(conv, ai, tracing, memory);
    streamText.mockReset();
    fsp.mkdir.mockReset().mockResolvedValue(undefined);
    fsp.writeFile.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('thin delegators가 userId와 함께 위임', async () => {
    expect(await controller.create(req, { notebookId: 'nb1', modelId: 'm', latitude: 1, longitude: 2 } as any)).toBe('created');
    expect(conv.create).toHaveBeenCalledWith('nb1', 'm', 'u1', { latitude: 1, longitude: 2 });
    expect(await controller.list(req)).toBe('listed');
    expect(conv.list).toHaveBeenCalledWith('u1');
    expect(await controller.getOne(req, 'c1')).toBe('detail');
    expect(conv.getDetail).toHaveBeenCalledWith('c1', 'u1');
    expect(await controller.costs(req, 'c1')).toBe('costs');
    expect(await controller.diary(req, 'c1')).toBe('diary');
    expect(conv.generateDiary).toHaveBeenCalledWith('c1', 'u1');
    await controller.reviseDiary(req, 'c1', { instruction: ' 고쳐 ' });
    expect(conv.reviseDiary).toHaveBeenCalledWith('c1', 'u1', '고쳐');
    await controller.reviseDiary(req, 'c1', {}); // instruction 없음 → ''
    expect(conv.reviseDiary).toHaveBeenLastCalledWith('c1', 'u1', '');
    await controller.saveFeedback(req, 'c1', { content: '좋아요' });
    expect(conv.saveFeedback).toHaveBeenCalledWith('c1', 'u1', '좋아요');
    await controller.saveFeedback(req, 'c1', {}); // content 없음 → ''
    expect(conv.saveFeedback).toHaveBeenLastCalledWith('c1', 'u1', '');
  });

  it('chat: 스트림 구성 + 툴 execute + onFinish/onError', async () => {
    const pipe = jest.fn();
    let cfg: any;
    streamText.mockImplementation((c: any) => {
      cfg = c;
      return { pipeUIMessageStreamToResponse: pipe };
    });
    const chatReq = {
      userId: 'u1',
      body: { messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] },
    } as any;
    const res = {} as any;

    await controller.chat('c1', chatReq, res);

    expect(conv.requireConversation).toHaveBeenCalledWith('c1', 'u1');
    expect(conv.saveMessage).toHaveBeenCalledWith('c1', 'user', 'hi', expect.anything());
    expect(pipe).toHaveBeenCalledWith(res, { onError: expect.any(Function) });

    // 툴 execute
    expect(await cfg.tools.requestPhoto.execute({ reason: 'r' })).toEqual({ acknowledged: true, reason: 'r' });
    await cfg.tools.updateCollectionState.execute({ filled: ['a'], skipped: [], enough: true, nextGap: 'g' });
    expect(conv.updateCollectionState).toHaveBeenCalledWith('c1', { filled: ['a'], skipped: [], enough: true, nextGap: 'g' });
    memory.recall.mockResolvedValue([{ type: 'episodic', text: '지난 일', date: '2026-06-01' }]);
    expect(await cfg.tools.recallMemory.execute({ query: '프로젝트' })).toEqual({
      memories: [{ type: 'episodic', text: '지난 일', date: '2026-06-01' }],
    });
    expect(memory.recall).toHaveBeenCalledWith('u1', '프로젝트', 'c1');

    // onError
    cfg.onError({ error: new Error('boom') });
    expect(console.error).toHaveBeenCalled();

    // onFinish: 본문 있으면 assistant 저장 + 기록
    cfg.onFinish({ text: '안녕', usage: { inputTokens: 1, outputTokens: 2, cachedInputTokens: 3 }, finishReason: 'stop', toolCalls: [] });
    expect(conv.saveMessage).toHaveBeenCalledWith('c1', 'assistant', '안녕', { toolCalls: [] });
    expect(tracing.record).toHaveBeenCalled();

    // onFinish: 본문이 누출JSON뿐이면 저장 안 함(기록만)
    conv.saveMessage.mockClear();
    cfg.onFinish({ text: '{"reason":"x"}', usage: {}, finishReason: 'stop', toolCalls: [] });
    expect(conv.saveMessage).not.toHaveBeenCalled();
  });

  it('chat: 유저 메시지 없으면 user 저장 안 함', async () => {
    streamText.mockReturnValue({ pipeUIMessageStreamToResponse: jest.fn() });
    await controller.chat('c1', { userId: 'u1', body: { messages: [] } } as any, {} as any);
    expect(conv.saveMessage).not.toHaveBeenCalled();
  });

  it('chat: body.messages 없으면 빈 배열', async () => {
    streamText.mockReturnValue({ pipeUIMessageStreamToResponse: jest.fn() });
    await controller.chat('c1', { userId: 'u1', body: {} } as any, {} as any);
    expect(streamText).toHaveBeenCalled();
  });

  describe('upload', () => {
    it('일반 이미지: 변환 없이 저장 + addAttachment', async () => {
      const r = await controller.upload(req, 'c1', { buffer: Buffer.from('x'), mimetype: 'image/jpeg', originalname: 'p.jpg' } as any);
      expect(fsp.writeFile).toHaveBeenCalled();
      expect(conv.addAttachment).toHaveBeenCalledWith('c1', 'u1', expect.objectContaining({ mimetype: 'image/jpeg' }));
      expect(r).toEqual({ id: 'a1' });
    });

    it('HEIC: jpeg로 변환 후 저장', async () => {
      heicConvert.mockResolvedValueOnce(Buffer.from('jpeg'));
      await controller.upload(req, 'c1', { buffer: Buffer.from('x'), mimetype: 'image/heic', originalname: 'p.heic' } as any);
      expect(conv.addAttachment).toHaveBeenCalledWith('c1', 'u1', expect.objectContaining({ mimetype: 'image/jpeg' }));
    });

    it('HEIC 변환 실패: 원본 저장 + 로그', async () => {
      heicConvert.mockRejectedValueOnce(new Error('bad heic'));
      await controller.upload(req, 'c1', { buffer: Buffer.from('x'), mimetype: 'image/heic', originalname: 'p.heic' } as any);
      expect(console.error).toHaveBeenCalled();
      expect(conv.addAttachment).toHaveBeenCalled();
    });

    it('확장자 없으면 jpg 기본', async () => {
      await controller.upload(req, 'c1', { buffer: Buffer.from('x'), mimetype: 'image/jpeg', originalname: '' } as any);
      const arg = conv.addAttachment.mock.calls[0][2];
      expect(arg.filename.endsWith('.jpg')).toBe(true);
    });
  });
});

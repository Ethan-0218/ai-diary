jest.mock('ai', () => ({ generateText: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateText } = require('ai');
const mockGen = generateText as jest.Mock;

import { NotFoundException } from '@nestjs/common';
import {
  ConversationService,
  buildChatSystem,
  parseCollectionState,
} from './conversation.service';

describe('parseCollectionState', () => {
  it('null/빈→null, 정상 파싱, 손상→null, 누락 기본값', () => {
    expect(parseCollectionState(null)).toBeNull();
    expect(parseCollectionState('')).toBeNull();
    expect(parseCollectionState('{bad')).toBeNull();
    expect(
      parseCollectionState(
        JSON.stringify({ filled: ['a'], skipped: ['b'], enough: true, nextGap: 'n', updatedAt: 't' }),
      ),
    ).toEqual({ filled: ['a'], skipped: ['b'], enough: true, nextGap: 'n', updatedAt: 't' });
    const s = parseCollectionState(JSON.stringify({ enough: 1 }))!;
    expect(s).toMatchObject({ filled: [], skipped: [], enough: true, nextGap: undefined });
    expect(typeof s.updatedAt).toBe('string');
  });
});

describe('buildChatSystem', () => {
  const now = new Date('2026-06-08T07:00:00Z');

  it('날씨 있음 + 수집상태(채움/스킵/nextGap/제안됨) 주입 + 상태갱신 지시 포함', () => {
    const s = buildChatSystem('plain', now, '맑음', {
      filled: ['사건'],
      skipped: ['감정'],
      enough: true,
      nextGap: '다음',
      updatedAt: 't',
    });
    expect(s).toContain('[오늘 날씨] 맑음');
    expect(s).toContain('이미 채워진 항목: 사건');
    expect(s).toContain('유저가 넘어간 항목: 감정');
    expect(s).toContain('다음에 들어보면 좋을 것: 다음');
    expect(s).toContain('이미 일기를 제안한 상태');
    expect(s).toContain('updateCollectionState');
  });

  it('날씨 없음 + 수집상태 빈 배열/ nextGap 없음 / enough=false', () => {
    const s = buildChatSystem('novel', now, null, {
      filled: [],
      skipped: [],
      enough: false,
      updatedAt: 't',
    });
    expect(s).toContain('날씨 정보가 주어지지 않았다');
    expect(s).toContain('이미 채워진 항목: (없음)');
    expect(s).toContain('유저가 넘어간 항목: (없음)');
    expect(s).not.toContain('다음에 들어보면 좋을 것');
    expect(s).not.toContain('이미 일기를 제안한 상태');
  });

  it('수집상태 없음(null)이면 상태 블록 생략', () => {
    const s = buildChatSystem('newspaper', now, null, null);
    expect(s).not.toContain('지금까지 모은 것');
    expect(s).toContain('updateCollectionState');
  });

  it('forGreeting=true면 상태갱신 지시 제외', () => {
    const s = buildChatSystem('plain', now, null, null, true);
    expect(s).not.toContain('updateCollectionState');
    expect(s).toContain('사진 제안 기준');
  });
});

describe('ConversationService', () => {
  let service: ConversationService;
  let prisma: any;
  let ai: any;
  let tracing: any;
  let weather: any;

  const convRow = (over: any = {}) => ({
    id: 'c1',
    userId: 'u1',
    title: '2026-06-08 일반 일기',
    format: 'plain',
    modelId: 'm1',
    weatherNote: null,
    collectionState: null,
    latitude: null,
    longitude: null,
    createdAt: new Date('2026-06-08T00:00:00Z'),
    ...over,
  });

  const detailRow = (over: any = {}) => ({
    ...convRow(),
    messages: [],
    attachments: [],
    diary: null,
    feedback: null,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      conversation: {
        create: jest.fn().mockResolvedValue(convRow()),
        findUnique: jest.fn().mockResolvedValue(detailRow()),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
      attachment: { create: jest.fn().mockResolvedValue({ id: 'a1', filePath: 'p.jpg', createdAt: new Date() }), findMany: jest.fn().mockResolvedValue([]) },
      diary: { upsert: jest.fn().mockResolvedValue({ id: 'd1', content: '일기', createdAt: new Date() }), findUnique: jest.fn().mockResolvedValue(null) },
      feedback: { deleteMany: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({ id: 'f1', content: 'fb', createdAt: new Date(), updatedAt: new Date() }) },
      llmUsage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    ai = { resolveModel: jest.fn(() => 'MODEL') };
    tracing = { trace: jest.fn((_ctx: any, _req: any, runner: any) => runner()) };
    weather = { getWeatherNote: jest.fn().mockResolvedValue(null) };
    mockGen.mockReset();
    mockGen.mockResolvedValue({ text: '생성된 텍스트' });
    service = new ConversationService(prisma, ai, tracing, weather);
  });

  describe('create', () => {
    it('위치 없으면 날씨 조회 안 하고 인사 생성 + 상세 반환', async () => {
      const detail = await service.create('plain', 'm1', 'u1');
      expect(weather.getWeatherNote).not.toHaveBeenCalled();
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', weatherNote: null }) }),
      );
      expect(prisma.message.create).toHaveBeenCalled();
      expect(detail.id).toBe('c1');
    });

    it('위치 있으면 날씨 조회해 컨텍스트에 사용', async () => {
      weather.getWeatherNote.mockResolvedValue('맑음, 26°C (낮)');
      await service.create('plain', 'm1', 'u1', { latitude: 37, longitude: 127 });
      expect(weather.getWeatherNote).toHaveBeenCalledWith(37, 127);
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ weatherNote: '맑음, 26°C (낮)' }) }),
      );
    });
  });

  describe('list', () => {
    it('내 대화만 요약 매핑 (diary 유무, 비용 합)', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        { ...convRow(), diary: { id: 'd1' }, llmUsages: [{ costUsd: 0.001 }, { costUsd: 0.002 }] },
        { ...convRow({ id: 'c2' }), diary: null, llmUsages: [] },
      ]);
      const out = await service.list('u1');
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
      expect(out[0]).toMatchObject({ id: 'c1', hasDiary: true, totalUsd: 0.003 });
      expect(out[1]).toMatchObject({ id: 'c2', hasDiary: false, totalUsd: 0 });
    });
  });

  describe('getDetail', () => {
    it('소유자면 messages/attachments/diary/feedback 매핑', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        detailRow({
          weatherNote: '맑음',
          collectionState: JSON.stringify({ filled: [], skipped: [], enough: false, updatedAt: 't' }),
          messages: [
            { id: 'm1', role: 'user', content: '안녕', parts: JSON.stringify([{ type: 'text' }]), createdAt: new Date() },
            { id: 'm2', role: 'assistant', content: '응', parts: null, createdAt: new Date() },
          ],
          attachments: [{ id: 'a1', filePath: 'x.jpg', caption: '사진', mimeType: 'image/jpeg', createdAt: new Date() }],
          diary: { id: 'd1', format: 'plain', content: '일기', createdAt: new Date() },
          feedback: { id: 'f1', content: 'fb', createdAt: new Date(), updatedAt: new Date() },
        }),
      );
      const d = await service.getDetail('c1', 'u1');
      expect(d.messages[0].parts).toEqual([{ type: 'text' }]);
      expect(d.messages[1].parts).toBeNull();
      expect(d.attachments[0].url).toContain('/uploads/x.jpg');
      expect(d.diary?.content).toBe('일기');
      expect(d.feedback?.content).toBe('fb');
      expect(d.collectionState?.enough).toBe(false);
    });

    it('첨부 URL: PUBLIC_BASE / PORT / 기본 9001 세 경우', async () => {
      const withAtt = () =>
        prisma.conversation.findUnique.mockResolvedValue(
          detailRow({ attachments: [{ id: 'a1', filePath: 'x.jpg', caption: null, mimeType: 'image/jpeg', createdAt: new Date() }] }),
        );
      const url = async () => (await service.getDetail('c1', 'u1')).attachments[0].url;
      const orig = { PUBLIC_BASE: process.env.PUBLIC_BASE, PORT: process.env.PORT };
      const restore = (k: 'PUBLIC_BASE' | 'PORT', v?: string) =>
        v === undefined ? delete process.env[k] : (process.env[k] = v);

      withAtt();
      process.env.PUBLIC_BASE = 'http://cdn';
      expect(await url()).toBe('http://cdn/uploads/x.jpg');

      withAtt();
      delete process.env.PUBLIC_BASE;
      process.env.PORT = '5555';
      expect(await url()).toBe('http://localhost:5555/uploads/x.jpg');

      withAtt();
      delete process.env.PORT;
      expect(await url()).toBe('http://localhost:9001/uploads/x.jpg');

      restore('PUBLIC_BASE', orig.PUBLIC_BASE);
      restore('PORT', orig.PORT);
    });

    it('없으면 NotFound', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('c1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('다른 유저 소유면 NotFound', async () => {
      prisma.conversation.findUnique.mockResolvedValue(detailRow({ userId: 'other' }));
      await expect(service.getDetail('c1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('requireConversation', () => {
    it('소유자 통과 / 미존재·타인 NotFound', async () => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      expect(await service.requireConversation('c1', 'u1')).toMatchObject({ id: 'c1' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.requireConversation('c1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
      prisma.conversation.findUnique.mockResolvedValue(convRow({ userId: 'z' }));
      await expect(service.requireConversation('c1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('saveFeedback', () => {
    it('내용 있으면 upsert', async () => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      const r = await service.saveFeedback('c1', 'u1', '  좋아요  ');
      expect(prisma.feedback.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { conversationId: 'c1', content: '좋아요' } }),
      );
      expect(r.feedback?.content).toBe('fb');
    });

    it('빈 내용이면 삭제 + null', async () => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      const r = await service.saveFeedback('c1', 'u1', '   ');
      expect(prisma.feedback.deleteMany).toHaveBeenCalled();
      expect(r.feedback).toBeNull();
    });
  });

  describe('updateCollectionState', () => {
    it('기본값 채워 저장', async () => {
      const s = await service.updateCollectionState('c1', { filled: undefined as any, skipped: undefined as any, enough: undefined as any, nextGap: 'g' });
      expect(s).toMatchObject({ filled: [], skipped: [], enough: false, nextGap: 'g' });
      expect(prisma.conversation.update).toHaveBeenCalled();
    });
  });

  describe('saveMessage', () => {
    it('parts 있으면 JSON, 없으면 null', async () => {
      await service.saveMessage('c1', 'user', 'hi', { a: 1 });
      await service.saveMessage('c1', 'assistant', 'yo');
      expect(prisma.message.create.mock.calls[0][0].data.parts).toBe('{"a":1}');
      expect(prisma.message.create.mock.calls[1][0].data.parts).toBeNull();
    });
  });

  describe('generateDiary / reviseDiary', () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      prisma.message.findMany.mockResolvedValue([
        { role: 'user', content: '오늘 발표했어', createdAt: new Date() },
        { role: 'assistant', content: '어땠어?', createdAt: new Date() },
      ]);
    });

    it('generateDiary: transcript+사진설명으로 생성 후 저장', async () => {
      prisma.attachment.findMany.mockResolvedValue([{ caption: '무대 사진' }, { caption: null }]);
      const r = await service.generateDiary('c1', 'u1');
      const prompt = mockGen.mock.calls[0][0].prompt;
      expect(prompt).toContain('나: 오늘 발표했어');
      expect(prompt).toContain('AI: 어땠어?');
      expect(prompt).toContain('사진1: 무대 사진');
      expect(prompt).toContain('사진2: (설명 없음)');
      expect(prisma.diary.upsert).toHaveBeenCalled();
      expect(r.diary.content).toBe('일기');
    });

    it('reviseDiary: 기존 일기 있으면 수정 프롬프트로 재생성', async () => {
      prisma.diary.findUnique.mockResolvedValue({ content: '기존 일기' });
      await service.reviseDiary('c1', 'u1', '더 담백하게');
      const sys = mockGen.mock.calls[0][0].system;
      expect(sys).toContain('[수정 작업]');
      expect(mockGen.mock.calls[0][0].prompt).toContain('[수정 요청]\n더 담백하게');
    });

    it('reviseDiary: 기존 일기 없으면 일반 생성으로 위임', async () => {
      prisma.diary.findUnique.mockResolvedValue(null);
      await service.reviseDiary('c1', 'u1', '아무거나');
      // generateDiary 경로 → system에 수정 작업 문구 없음
      expect(mockGen.mock.calls[0][0].system).not.toContain('[수정 작업]');
    });
  });

  describe('getCosts', () => {
    it('step별 집계 + 합계', async () => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      prisma.llmUsage.findMany.mockResolvedValue([
        { step: 'chat_turn', modelId: 'm', inputTokens: 10, outputTokens: 5, costUsd: 0.001, status: 'success', durationMs: 100, createdAt: new Date() },
        { step: 'unknown_step', modelId: 'm', inputTokens: 2, outputTokens: 1, costUsd: 0.0005, status: 'failure', durationMs: 50, createdAt: new Date() },
      ]);
      const c = await service.getCosts('c1', 'u1');
      expect(c.totalCalls).toBe(2);
      expect(c.byStep.chat_turn.calls).toBe(1);
      expect(c.totalInputTokens).toBe(12);
    });
  });

  describe('addAttachment', () => {
    it('비전 caption 생성 성공', async () => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      mockGen.mockResolvedValue({ text: '풍경 사진' });
      const r = await service.addAttachment('c1', 'u1', { filename: 'p.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('x') });
      expect(r.caption).toBe('풍경 사진');
      expect(prisma.attachment.create).toHaveBeenCalled();
    });

    it('비전 실패하면 caption null', async () => {
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      mockGen.mockRejectedValue(new Error('vision down'));
      const r = await service.addAttachment('c1', 'u1', { filename: 'p.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('x') });
      expect(r.caption).toBeNull();
    });

    it('VISION_MODEL_ID 환경변수 우선 사용', async () => {
      process.env.VISION_MODEL_ID = 'vision-x';
      prisma.conversation.findUnique.mockResolvedValue(convRow());
      await service.addAttachment('c1', 'u1', { filename: 'p.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('x') });
      expect(ai.resolveModel).toHaveBeenCalledWith('vision-x');
      delete process.env.VISION_MODEL_ID;
    });
  });
});

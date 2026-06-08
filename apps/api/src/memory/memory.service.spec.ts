jest.mock('ai', () => ({ generateObject: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateObject } = require('ai');

import { MemoryService } from './memory.service';

describe('MemoryService', () => {
  let service: MemoryService;
  let dataSource: any, facts: any, episodes: any, diaries: any, embeddings: any, ai: any, tracing: any;

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    facts = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue({}),
    };
    episodes = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue({ id: 'e1' }),
    };
    diaries = { findOne: jest.fn().mockResolvedValue(null) };
    embeddings = {
      embed: jest.fn().mockResolvedValue([0.1, 0.2]),
      embedMany: jest.fn().mockResolvedValue([[1], [2]]),
    };
    ai = { resolveModel: jest.fn(() => 'MODEL') };
    tracing = { trace: jest.fn((_ctx: any, _req: any, runner: any) => runner()) };
    (generateObject as jest.Mock).mockReset();
    service = new MemoryService(dataSource, facts, episodes, diaries, embeddings, ai, tracing);
  });

  describe('ensureSchema / onModuleInit', () => {
    it('확장+테이블+인덱스 생성', async () => {
      await service.onModuleInit();
      expect(dataSource.query).toHaveBeenCalledTimes(4);
      expect(dataSource.query.mock.calls[0][0]).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    });

    it('실패해도 throw 안 함(로그만)', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('db down'));
      await expect(service.ensureSchema()).resolves.toBeUndefined();
    });
  });

  describe('extract', () => {
    it('generateObject 결과 object 반환 + 트레이싱', async () => {
      const object = { facts: [], summary: '요약', mood: null };
      (generateObject as jest.Mock).mockResolvedValue({ object, usage: {} });
      const out = await service.extract('m1', '대화', 'c1');
      expect(out).toEqual(object);
      expect(tracing.trace).toHaveBeenCalled();
      expect(ai.resolveModel).toHaveBeenCalledWith('m1');
    });
  });

  describe('upsertFact', () => {
    it('동일 활성 사실 있으면 저장 안 함', async () => {
      facts.findOne.mockResolvedValue({ id: 'f1' });
      await service.upsertFact('u1', '직업', '개발자', 0.9);
      expect(facts.save).not.toHaveBeenCalled();
    });
    it('없으면 새로 저장', async () => {
      facts.findOne.mockResolvedValue(null);
      await service.upsertFact('u1', '직업', '개발자', 0.9);
      expect(facts.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', category: '직업', content: '개발자', supersededAt: null }),
      );
    });
  });

  describe('onDiaryComplete', () => {
    const args = {
      userId: 'u1', conversationId: 'c1', modelId: 'm1',
      transcript: 'T', diaryId: 'd1', diaryContent: '일기 본문',
    };

    it('추출→프로필 저장→에피소드(신규)→임베딩 2건', async () => {
      (generateObject as jest.Mock).mockResolvedValue({
        object: { facts: [{ category: '관심사', content: '러닝', confidence: 0.8 }], summary: '오늘 달림', mood: '상쾌' },
        usage: {},
      });
      await service.onDiaryComplete(args);
      expect(facts.save).toHaveBeenCalled();
      expect(episodes.save).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'c1', summary: '오늘 달림', mood: '상쾌' }),
      );
      expect(embeddings.embedMany).toHaveBeenCalledWith(['오늘 달림', '일기 본문']);
      // 에피소드 + 일기 임베딩 upsert 2건 (스키마 쿼리 제외)
      const inserts = dataSource.query.mock.calls.filter((c: any[]) => /INSERT INTO memory_embedding/.test(c[0]));
      expect(inserts).toHaveLength(2);
    });

    it('기존 에피소드 있으면 id 유지하며 갱신', async () => {
      episodes.findOne.mockResolvedValue({ id: 'eExisting', createdAt: new Date('2026-06-01') });
      (generateObject as jest.Mock).mockResolvedValue({
        object: { facts: [], summary: '갱신', mood: null }, usage: {},
      });
      await service.onDiaryComplete(args);
      expect(episodes.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'eExisting', summary: '갱신' }));
    });

    it('도중 실패해도 throw 안 함', async () => {
      (generateObject as jest.Mock).mockResolvedValue({
        object: { facts: [], summary: 's', mood: null }, usage: {},
      });
      embeddings.embedMany.mockRejectedValue(new Error('embed fail'));
      await expect(service.onDiaryComplete(args)).resolves.toBeUndefined();
    });
  });

  describe('buildContext', () => {
    it('프로필+에피소드(무드 유무) 문자열', async () => {
      facts.find.mockResolvedValue([{ category: '직업', content: '개발자' }]);
      episodes.find.mockResolvedValue([
        { date: '2026-06-08', mood: '상쾌', summary: '달림' },
        { date: '2026-06-07', mood: null, summary: '쉼' },
      ]);
      const ctx = await service.buildContext('u1');
      expect(ctx).toContain('(직업) 개발자');
      expect(ctx).toContain('2026-06-08 (상쾌): 달림');
      expect(ctx).toContain('2026-06-07: 쉼');
    });
    it('프로필만 있어도 빌드', async () => {
      facts.find.mockResolvedValue([{ category: '가족', content: '딸 하나' }]);
      episodes.find.mockResolvedValue([]);
      expect(await service.buildContext('u1')).toContain('(가족) 딸 하나');
    });
    it('에피소드만 있어도 빌드(프로필 없음)', async () => {
      facts.find.mockResolvedValue([]);
      episodes.find.mockResolvedValue([{ date: '2026-06-08', mood: null, summary: '달림' }]);
      const ctx = await service.buildContext('u1');
      expect(ctx).toContain('[최근 기록]');
      expect(ctx).not.toContain('[유저에 대해 알고 있는 것]');
    });
    it('아무것도 없으면 null', async () => {
      expect(await service.buildContext('u1')).toBeNull();
    });
  });

  describe('recall', () => {
    it('에피소드+일기 회수(미존재는 스킵)', async () => {
      dataSource.query.mockResolvedValue([
        { ownerType: 'episodic', ownerId: 'e1' },
        { ownerType: 'episodic', ownerId: 'eGone' },
        { ownerType: 'diary', ownerId: 'd1' },
        { ownerType: 'diary', ownerId: 'dGone' },
        { ownerType: 'unknown', ownerId: 'z' }, // 알 수 없는 타입은 무시
      ]);
      episodes.findOne.mockImplementation(({ where }: any) =>
        where.id === 'e1' ? { id: 'e1', summary: '에피', date: '2026-06-08' } : null,
      );
      diaries.findOne.mockImplementation(({ where }: any) =>
        where.id === 'd1' ? { id: 'd1', content: 'X'.repeat(500), createdAt: new Date('2026-06-08') } : null,
      );
      const out = await service.recall('u1', '프로젝트');
      expect(out).toEqual([
        { type: 'episodic', text: '에피', date: '2026-06-08' },
        { type: 'diary', text: 'X'.repeat(400), date: '2026-06-08' },
      ]);
      expect(embeddings.embed).toHaveBeenCalledWith('프로젝트');
    });

    it('실패 시 빈 배열', async () => {
      embeddings.embed.mockRejectedValue(new Error('boom'));
      expect(await service.recall('u1', 'q')).toEqual([]);
    });
  });
});

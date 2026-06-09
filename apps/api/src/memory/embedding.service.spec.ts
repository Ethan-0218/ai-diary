jest.mock('ai', () => ({ embed: jest.fn(), embedMany: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({
  openai: { textEmbeddingModel: jest.fn(() => 'EMBED_MODEL') },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { embed, embedMany } = require('ai');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { openai } = require('@ai-sdk/openai');

import { EmbeddingService, toVectorLiteral } from './embedding.service';

describe('toVectorLiteral', () => {
  it('number[] → pgvector 리터럴', () => {
    expect(toVectorLiteral([0.1, 0.2, -3])).toBe('[0.1,0.2,-3]');
  });
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let tracing: { record: jest.Mock };

  beforeEach(() => {
    tracing = { record: jest.fn() };
    service = new EmbeddingService(tracing as any);
    (embed as jest.Mock).mockReset();
    (embedMany as jest.Mock).mockReset();
    (openai.textEmbeddingModel as jest.Mock).mockClear();
    delete process.env.EMBEDDING_MODEL_ID;
  });

  it('embed: 텍스트 → 벡터, 기본 모델 사용', async () => {
    (embed as jest.Mock).mockResolvedValue({ embedding: [1, 2, 3], usage: { tokens: 5 } });
    const v = await service.embed('hi');
    expect(v).toEqual([1, 2, 3]);
    expect(openai.textEmbeddingModel).toHaveBeenCalledWith('text-embedding-3-small');
    expect(embed).toHaveBeenCalledWith({ model: 'EMBED_MODEL', value: 'hi' });
    // ctx 없으면 비용 기록 안 함
    expect(tracing.record).not.toHaveBeenCalled();
  });

  it('embed: ctx 주면 memory_embedding 비용 기록(입력 토큰)', async () => {
    (embed as jest.Mock).mockResolvedValue({ embedding: [1], usage: { tokens: 7 } });
    await service.embed('hi', { conversationId: 'c1' });
    expect(tracing.record).toHaveBeenCalledTimes(1);
    const arg = tracing.record.mock.calls[0][0];
    expect(arg.ctx).toMatchObject({
      conversationId: 'c1',
      step: 'memory_embedding',
      modelId: 'text-embedding-3-small',
    });
    expect(arg.usage).toEqual({ inputTokens: 7, outputTokens: 0 });
  });

  it('embed: usage 없으면 토큰 0으로 기록', async () => {
    (embed as jest.Mock).mockResolvedValue({ embedding: [1] });
    await service.embed('hi', { conversationId: 'c1' });
    expect(tracing.record.mock.calls[0][0].usage.inputTokens).toBe(0);
  });

  it('embed: EMBEDDING_MODEL_ID 환경변수 우선', async () => {
    process.env.EMBEDDING_MODEL_ID = 'custom-embed';
    (embed as jest.Mock).mockResolvedValue({ embedding: [9], usage: { tokens: 1 } });
    await service.embed('x');
    expect(openai.textEmbeddingModel).toHaveBeenCalledWith('custom-embed');
  });

  it('embedMany: 빈 배열이면 호출 없이 []', async () => {
    expect(await service.embedMany([])).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  it('embedMany: 여러 텍스트 → 벡터 배열 + ctx 비용 기록', async () => {
    (embedMany as jest.Mock).mockResolvedValue({ embeddings: [[1], [2]], usage: { tokens: 12 } });
    expect(await service.embedMany(['a', 'b'], { conversationId: 'c1' })).toEqual([[1], [2]]);
    expect(embedMany).toHaveBeenCalledWith({ model: 'EMBED_MODEL', values: ['a', 'b'] });
    expect(tracing.record.mock.calls[0][0].usage.inputTokens).toBe(12);
  });
});

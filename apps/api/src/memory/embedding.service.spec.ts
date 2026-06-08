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

  beforeEach(() => {
    service = new EmbeddingService();
    (embed as jest.Mock).mockReset();
    (embedMany as jest.Mock).mockReset();
    (openai.textEmbeddingModel as jest.Mock).mockClear();
    delete process.env.EMBEDDING_MODEL_ID;
  });

  it('embed: 텍스트 → 벡터, 기본 모델 사용', async () => {
    (embed as jest.Mock).mockResolvedValue({ embedding: [1, 2, 3] });
    const v = await service.embed('hi');
    expect(v).toEqual([1, 2, 3]);
    expect(openai.textEmbeddingModel).toHaveBeenCalledWith('text-embedding-3-small');
    expect(embed).toHaveBeenCalledWith({ model: 'EMBED_MODEL', value: 'hi' });
  });

  it('embed: EMBEDDING_MODEL_ID 환경변수 우선', async () => {
    process.env.EMBEDDING_MODEL_ID = 'custom-embed';
    (embed as jest.Mock).mockResolvedValue({ embedding: [9] });
    await service.embed('x');
    expect(openai.textEmbeddingModel).toHaveBeenCalledWith('custom-embed');
  });

  it('embedMany: 빈 배열이면 호출 없이 []', async () => {
    expect(await service.embedMany([])).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  it('embedMany: 여러 텍스트 → 벡터 배열', async () => {
    (embedMany as jest.Mock).mockResolvedValue({ embeddings: [[1], [2]] });
    expect(await service.embedMany(['a', 'b'])).toEqual([[1], [2]]);
    expect(embedMany).toHaveBeenCalledWith({ model: 'EMBED_MODEL', values: ['a', 'b'] });
  });
});

import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';

/** 임베딩 차원 — memory_embedding 테이블의 vector(N)과 반드시 일치. */
export const EMBEDDING_DIM = 1536;

/**
 * 텍스트 → 임베딩 벡터 (OpenAI text-embedding-3-small, 1536차원).
 * 의미검색(pgvector)용. 호출부는 실패를 흡수해 기억이 코어 루프를 막지 않게 한다.
 */
@Injectable()
export class EmbeddingService {
  private get modelId(): string {
    return process.env.EMBEDDING_MODEL_ID || 'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.textEmbeddingModel(this.modelId),
      value: text,
    });
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({
      model: openai.textEmbeddingModel(this.modelId),
      values: texts,
    });
    return embeddings;
  }
}

/** number[] → pgvector 리터럴 문자열 '[0.1,0.2,...]' (파라미터에 $1::vector로 캐스팅). */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

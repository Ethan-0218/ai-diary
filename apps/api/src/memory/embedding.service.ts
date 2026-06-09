import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { v4 as uuid } from 'uuid';
import { LlmTracingService } from '../ai/llm-tracing.service';

/** 임베딩 차원 — memory_embedding 테이블의 vector(N)과 반드시 일치. */
export const EMBEDDING_DIM = 1536;

/** 비용 귀속용 컨텍스트 — 주면 memory_embedding step으로 토큰/비용을 기록한다. */
export interface EmbedContext {
  conversationId: string;
}

/**
 * 텍스트 → 임베딩 벡터 (OpenAI text-embedding-3-small, 1536차원).
 * 의미검색(pgvector)용. 호출부는 실패를 흡수해 기억이 코어 루프를 막지 않게 한다.
 * 토큰 사용량은 ctx가 주어지면 LlmTracing(step=memory_embedding)으로 비용 추적한다.
 */
@Injectable()
export class EmbeddingService {
  constructor(private readonly tracing: LlmTracingService) {}

  private get modelId(): string {
    return process.env.EMBEDDING_MODEL_ID || 'text-embedding-3-small';
  }

  async embed(text: string, ctx?: EmbedContext): Promise<number[]> {
    const startedAt = Date.now();
    const { embedding, usage } = await embed({
      model: openai.textEmbeddingModel(this.modelId),
      value: text,
    });
    this.track(usage?.tokens, Date.now() - startedAt, ctx);
    return embedding;
  }

  async embedMany(texts: string[], ctx?: EmbedContext): Promise<number[][]> {
    if (texts.length === 0) return [];
    const startedAt = Date.now();
    const { embeddings, usage } = await embedMany({
      model: openai.textEmbeddingModel(this.modelId),
      values: texts,
    });
    this.track(usage?.tokens, Date.now() - startedAt, ctx);
    return embeddings;
  }

  /** 임베딩 토큰 사용량을 비용 추적에 기록(입력 토큰만, 출력 없음). */
  private track(tokens: number | undefined, durationMs: number, ctx?: EmbedContext): void {
    if (!ctx) return;
    this.tracing.record({
      ctx: {
        traceId: uuid(),
        conversationId: ctx.conversationId,
        step: 'memory_embedding',
        modelId: this.modelId,
      },
      durationMs,
      usage: { inputTokens: tokens ?? 0, outputTokens: 0 },
      request: {},
      response: null,
    });
  }
}

/** number[] → pgvector 리터럴 문자열 '[0.1,0.2,...]' (파라미터에 $1::vector로 캐스팅). */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

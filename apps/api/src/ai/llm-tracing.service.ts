import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { calcCost, type LlmStep, type LlmCallStatus } from '@ai-diary/shared';
import { LlmUsage, LlmCallTrace } from '../entities';

export interface LlmTraceContext {
  traceId: string;
  conversationId: string;
  step: LlmStep;
  modelId: string;
}

/** 직렬화 가능한 요청 payload (zod schema/함수는 제외하고 메타만) */
export interface LlmRequestPayload {
  system?: string;
  messages?: unknown;
  prompt?: unknown;
  tools?: Record<string, { description?: string }>;
  [key: string]: unknown;
}

interface UsageNumbers {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/**
 * LLM 호출의 토큰·비용·원본 입출력을 LlmUsage(집계) + LlmCallTrace(raw)에 영속한다.
 * - DB write는 fire-and-forget이라 응답 latency에 영향 없음.
 * - 성공/실패 모두 1행 기록. (naming-studio LlmTracingService 패턴)
 */
@Injectable()
export class LlmTracingService {
  private readonly logger = new Logger(LlmTracingService.name);

  constructor(
    @InjectRepository(LlmUsage)
    private readonly llmUsages: Repository<LlmUsage>,
    @InjectRepository(LlmCallTrace)
    private readonly llmCallTraces: Repository<LlmCallTrace>,
  ) {}

  /** 비스트리밍(generateText) 호출 wrap */
  async trace<T>(
    ctx: LlmTraceContext,
    request: LlmRequestPayload,
    runner: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await runner();
      this.persist({
        ctx,
        status: 'success',
        durationMs: Date.now() - startedAt,
        usage: extractUsage(result),
        request,
        response: safeResponse(result),
      });
      return result;
    } catch (err) {
      this.persist({
        ctx,
        status: 'failure',
        durationMs: Date.now() - startedAt,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        request,
        response: { error: errMsg(err) },
      });
      throw err;
    }
  }

  /** 스트리밍(streamText) — onFinish에서 모인 usage/응답을 직접 기록 */
  record(input: {
    ctx: LlmTraceContext;
    durationMs: number;
    usage: Partial<UsageNumbers>;
    request: LlmRequestPayload;
    response: Record<string, unknown> | null;
    status?: LlmCallStatus;
  }): void {
    this.persist({
      ctx: input.ctx,
      status: input.status ?? 'success',
      durationMs: input.durationMs,
      usage: {
        inputTokens: input.usage.inputTokens ?? 0,
        outputTokens: input.usage.outputTokens ?? 0,
        cacheReadTokens: input.usage.cacheReadTokens ?? 0,
      },
      request: input.request,
      response: input.response,
    });
  }

  private persist(input: {
    ctx: LlmTraceContext;
    status: LlmCallStatus;
    durationMs: number;
    usage: UsageNumbers;
    request: LlmRequestPayload;
    response: Record<string, unknown> | null;
  }): void {
    void this.persistAsync(input).catch((e) =>
      this.logger.error(`persist failed: ${e}`),
    );
  }

  private async persistAsync(input: {
    ctx: LlmTraceContext;
    status: LlmCallStatus;
    durationMs: number;
    usage: UsageNumbers;
    request: LlmRequestPayload;
    response: Record<string, unknown> | null;
  }): Promise<void> {
    const { ctx, usage } = input;
    const costUsd = calcCost(ctx.modelId, usage.inputTokens, usage.outputTokens);
    const row = await this.llmUsages.save(
      this.llmUsages.create({
        traceId: ctx.traceId,
        conversationId: ctx.conversationId,
        step: ctx.step,
        modelId: ctx.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        costUsd,
        status: input.status,
        durationMs: input.durationMs,
        errorSummary:
          input.status === 'failure'
            ? String((input.response as any)?.error ?? 'unknown')
            : null,
      }),
    );
    await this.llmCallTraces.save(
      this.llmCallTraces.create({
        llmUsageId: row.id,
        traceId: ctx.traceId,
        requestPayload: safeJson(input.request),
        responsePayload: input.response ? safeJson(input.response) : null,
      }),
    );
  }
}

function extractUsage(result: unknown): UsageNumbers {
  const u = (result as any)?.usage ?? {};
  return {
    inputTokens: num(u.inputTokens ?? u.promptTokens),
    outputTokens: num(u.outputTokens ?? u.completionTokens),
    cacheReadTokens: num(u.cachedInputTokens ?? u.cacheReadTokens),
  };
}

function safeResponse(result: unknown): Record<string, unknown> {
  const r = result as any;
  return {
    text: r?.text,
    finishReason: r?.finishReason,
    usage: r?.usage,
    toolCalls: r?.toolCalls,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    );
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

jest.mock('@ai-diary/shared', () => ({ calcCost: jest.fn(() => 0.0012) }));

import { LlmTracingService, LlmTraceContext } from './llm-tracing.service';

const flush = () => new Promise((r) => setImmediate(r));
const ctx: LlmTraceContext = {
  traceId: 't1',
  conversationId: 'c1',
  step: 'chat_turn',
  modelId: 'gemini-3-flash-preview',
};

describe('LlmTracingService', () => {
  let service: LlmTracingService;
  let prisma: {
    llmUsage: { create: jest.Mock };
    llmCallTrace: { create: jest.Mock };
  };
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      llmUsage: { create: jest.fn().mockResolvedValue({ id: 'row1' }) },
      llmCallTrace: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new LlmTracingService(prisma as any);
    errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
  });

  describe('trace', () => {
    it('성공: 결과 반환 + usage(inputTokens 등) 기록, errorSummary null, trace payload 저장', async () => {
      const result = {
        text: 'hi',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 },
      };
      const out = await service.trace(ctx, { system: 's' }, async () => result);
      await flush();

      expect(out).toBe(result);
      expect(prisma.llmUsage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'success',
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 2,
            costUsd: 0.0012,
            errorSummary: null,
          }),
        }),
      );
      expect(prisma.llmCallTrace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ responsePayload: expect.any(String) }),
        }),
      );
    });

    it('usage 없으면 0, promptTokens/completionTokens 폴백', async () => {
      await service.trace(ctx, {}, async () => ({})); // usage 없음 → 0,0,0
      await service.trace(ctx, {}, async () => ({
        usage: { promptTokens: 7, completionTokens: 3, cacheReadTokens: 1 },
      }));
      await flush();
      const calls = prisma.llmUsage.create.mock.calls.map((c) => c[0].data);
      expect(calls[0]).toMatchObject({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
      expect(calls[1]).toMatchObject({ inputTokens: 7, outputTokens: 3, cacheReadTokens: 1 });
    });

    it('비유한 토큰(Infinity)은 0으로', async () => {
      await service.trace(ctx, {}, async () => ({ usage: { inputTokens: Infinity } }));
      await flush();
      expect(prisma.llmUsage.create.mock.calls[0][0].data.inputTokens).toBe(0);
    });

    it('실패(Error): failure 기록 + errorSummary=메시지 + 재throw', async () => {
      await expect(
        service.trace(ctx, {}, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await flush();
      expect(prisma.llmUsage.create.mock.calls[0][0].data).toMatchObject({
        status: 'failure',
        errorSummary: 'boom',
        inputTokens: 0,
      });
    });

    it('실패(비Error 값): String 변환', async () => {
      await expect(
        service.trace(ctx, {}, async () => {
          throw 'plain-string';
        }),
      ).rejects.toBe('plain-string');
      await flush();
      expect(prisma.llmUsage.create.mock.calls[0][0].data.errorSummary).toBe('plain-string');
    });
  });

  describe('record (스트리밍)', () => {
    it('status/usage 명시', async () => {
      service.record({
        ctx,
        durationMs: 100,
        usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 },
        request: { system: 's' },
        response: { text: 'x' },
        status: 'success',
      });
      await flush();
      expect(prisma.llmUsage.create.mock.calls[0][0].data).toMatchObject({
        status: 'success',
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 3,
      });
      expect(prisma.llmCallTrace.create.mock.calls[0][0].data.responsePayload).toEqual(
        expect.any(String),
      );
    });

    it('status=failure인데 response.error 없으면 errorSummary=unknown', async () => {
      service.record({
        ctx,
        durationMs: 10,
        usage: {},
        request: {},
        response: {},
        status: 'failure',
      });
      await flush();
      expect(prisma.llmUsage.create.mock.calls[0][0].data.errorSummary).toBe('unknown');
    });

    it('status 생략→success 기본, usage 빈값→0, response null→payload null', async () => {
      service.record({ ctx, durationMs: 50, usage: {}, request: {}, response: null });
      await flush();
      expect(prisma.llmUsage.create.mock.calls[0][0].data).toMatchObject({
        status: 'success',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
      });
      expect(prisma.llmCallTrace.create.mock.calls[0][0].data.responsePayload).toBeNull();
    });
  });

  describe('persist 에러 처리 / 직렬화', () => {
    it('DB write 실패 시 logger.error (throw 안 함)', async () => {
      prisma.llmUsage.create.mockRejectedValue(new Error('db down'));
      const out = await service.trace(ctx, {}, async () => ({ text: 'ok' }));
      await flush();
      expect(out).toEqual({ text: 'ok' });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('bigint 포함 payload는 Number로 직렬화', async () => {
      await service.trace(ctx, { big: 10n } as any, async () => ({ text: 'x' }));
      await flush();
      expect(prisma.llmCallTrace.create.mock.calls[0][0].data.requestPayload).toContain('10');
    });

    it('순환 참조 payload는 unserializable로 폴백', async () => {
      const circular: any = {};
      circular.self = circular;
      await service.trace(ctx, circular, async () => ({ text: 'x' }));
      await flush();
      expect(prisma.llmCallTrace.create.mock.calls[0][0].data.requestPayload).toBe(
        JSON.stringify({ unserializable: true }),
      );
    });
  });
});

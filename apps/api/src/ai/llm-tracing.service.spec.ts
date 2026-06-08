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
  let usages: { create: jest.Mock; save: jest.Mock };
  let traces: { create: jest.Mock; save: jest.Mock };
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    usages = { create: jest.fn((x) => x), save: jest.fn().mockResolvedValue({ id: 'row1' }) };
    traces = { create: jest.fn((x) => x), save: jest.fn().mockResolvedValue({}) };
    service = new LlmTracingService(usages as any, traces as any);
    errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
  });

  const savedUsage = (i = 0) => usages.create.mock.calls[i][0];

  describe('trace', () => {
    it('성공: 결과 반환 + usage 기록, errorSummary null, trace payload 저장', async () => {
      const result = {
        text: 'hi',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 },
      };
      const out = await service.trace(ctx, { system: 's' }, async () => result);
      await flush();

      expect(out).toBe(result);
      expect(savedUsage()).toMatchObject({
        status: 'success',
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 2,
        costUsd: 0.0012,
        errorSummary: null,
      });
      expect(usages.save).toHaveBeenCalled();
      expect(traces.create.mock.calls[0][0].responsePayload).toEqual(expect.any(String));
    });

    it('usage 없으면 0, promptTokens/completionTokens 폴백', async () => {
      await service.trace(ctx, {}, async () => ({}));
      await service.trace(ctx, {}, async () => ({
        usage: { promptTokens: 7, completionTokens: 3, cacheReadTokens: 1 },
      }));
      await flush();
      expect(savedUsage(0)).toMatchObject({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
      expect(savedUsage(1)).toMatchObject({ inputTokens: 7, outputTokens: 3, cacheReadTokens: 1 });
    });

    it('비유한 토큰(Infinity)은 0으로', async () => {
      await service.trace(ctx, {}, async () => ({ usage: { inputTokens: Infinity } }));
      await flush();
      expect(savedUsage().inputTokens).toBe(0);
    });

    it('실패(Error): failure 기록 + errorSummary=메시지 + 재throw', async () => {
      await expect(
        service.trace(ctx, {}, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await flush();
      expect(savedUsage()).toMatchObject({ status: 'failure', errorSummary: 'boom', inputTokens: 0 });
    });

    it('실패(비Error 값): String 변환', async () => {
      await expect(
        service.trace(ctx, {}, async () => {
          throw 'plain-string';
        }),
      ).rejects.toBe('plain-string');
      await flush();
      expect(savedUsage().errorSummary).toBe('plain-string');
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
      expect(savedUsage()).toMatchObject({ status: 'success', inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 });
      expect(traces.create.mock.calls[0][0].responsePayload).toEqual(expect.any(String));
    });

    it('status=failure인데 response.error 없으면 errorSummary=unknown', async () => {
      service.record({ ctx, durationMs: 10, usage: {}, request: {}, response: {}, status: 'failure' });
      await flush();
      expect(savedUsage().errorSummary).toBe('unknown');
    });

    it('status 생략→success 기본, usage 빈값→0, response null→payload null', async () => {
      service.record({ ctx, durationMs: 50, usage: {}, request: {}, response: null });
      await flush();
      expect(savedUsage()).toMatchObject({ status: 'success', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
      expect(traces.create.mock.calls[0][0].responsePayload).toBeNull();
    });
  });

  describe('persist 에러 처리 / 직렬화', () => {
    it('DB write 실패 시 logger.error (throw 안 함)', async () => {
      usages.save.mockRejectedValue(new Error('db down'));
      const out = await service.trace(ctx, {}, async () => ({ text: 'ok' }));
      await flush();
      expect(out).toEqual({ text: 'ok' });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('bigint 포함 payload는 Number로 직렬화', async () => {
      await service.trace(ctx, { big: 10n } as any, async () => ({ text: 'x' }));
      await flush();
      expect(traces.create.mock.calls[0][0].requestPayload).toContain('10');
    });

    it('순환 참조 payload는 unserializable로 폴백', async () => {
      const circular: any = {};
      circular.self = circular;
      await service.trace(ctx, circular, async () => ({ text: 'x' }));
      await flush();
      expect(traces.create.mock.calls[0][0].requestPayload).toBe(
        JSON.stringify({ unserializable: true }),
      );
    });
  });
});

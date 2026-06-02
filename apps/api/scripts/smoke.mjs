/**
 * 실제 LLM 키 없이 mock 모델을 주입해 untyped LLM 경로를 런타임 검증한다.
 * - create(): 첫 인사 generateText + 메시지 저장 + first_greeting 트레이싱
 * - streamText + onFinish + tracing.record() (채팅 경로의 핵심 로직)
 * - generateDiary(): generateText + Diary upsert + diary_generation 트레이싱
 * - getCosts(): LlmUsage/LlmCallTrace 집계
 */
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';
import { streamText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { AiService } = require('../dist/ai/ai.service.js');
const { LlmTracingService } = require('../dist/ai/llm-tracing.service.js');
const { ConversationService } = require('../dist/conversation/conversation.service.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// provider(V3) usage 형태: 토큰은 중첩 객체 { total, noCache, cacheRead, cacheWrite }
const USAGE = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 60, reasoning: 0 },
  totalTokens: 180,
};

function mockModel(text) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: USAGE,
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: text },
        { type: 'text-end', id: '0' },
        { type: 'finish', finishReason: 'stop', usage: USAGE },
      ]),
    }),
  });
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const ai = new AiService();
  const tracing = new LlmTracingService(prisma);
  const conv = new ConversationService(prisma, ai, tracing);

  // mock 주입
  ai.resolveModel = () => mockModel('오늘 하루는 어땠나요? 오늘 날짜는 2026-06-01이에요.');

  // 1) create + 첫 인사
  const detail = await conv.create('novel', 'claude-haiku-4-5-20251001');
  console.log('[create] messages:', detail.messages.length, '| greeting:', JSON.stringify(detail.messages[0]?.content?.slice(0, 30)));

  // 2) 유저 메시지 저장 (controller가 하는 일)
  await conv.saveMessage(detail.id, 'user', '비 오는 날 카페에서 글을 썼어요.');

  // 3) streamText + onFinish + tracing.record (채팅 경로 핵심 로직 재현)
  const startedAt = Date.now();
  const result = streamText({
    model: mockModel('카페라니 운치있네요. 어떤 글을 쓰셨어요?'),
    system: 'test system',
    messages: [{ role: 'user', content: '비 오는 날 카페에서 글을 썼어요.' }],
    stopWhen: stepCountIs(4),
    tools: {
      requestPhoto: tool({
        description: 'photo',
        inputSchema: z.object({ reason: z.string() }),
        execute: async ({ reason }) => ({ acknowledged: true, reason }),
      }),
    },
    onFinish: ({ text, usage, finishReason, toolCalls }) => {
      conv.saveMessage(detail.id, 'assistant', text, { toolCalls });
      tracing.record({
        ctx: { traceId: 't1', conversationId: detail.id, step: 'chat_turn', modelId: 'claude-haiku-4-5-20251001' },
        durationMs: Date.now() - startedAt,
        usage: { inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens },
        request: { system: 'test', messages: ['...'] },
        response: { text, finishReason, toolCalls },
      });
    },
  });
  // 스트림 소비
  let streamed = '';
  for await (const chunk of result.textStream) streamed += chunk;
  await result.consumeStream?.();
  console.log('[chat] streamed text:', JSON.stringify(streamed));

  // 4) 일기 생성
  ai.resolveModel = () => mockModel('# 비 오는 날의 카페\n\n2026년 6월 1일, 그는 창가에 앉아...');
  const diaryRes = await conv.generateDiary(detail.id);
  console.log('[diary] content head:', JSON.stringify(diaryRes.diary.content.slice(0, 24)));

  // fire-and-forget 트레이싱 flush 대기
  await sleep(400);

  // 5) 비용 집계
  const costs = await conv.getCosts(detail.id);
  console.log('[costs] totalUsd:', costs.totalUsd, '| calls:', costs.totalCalls, '| byStep:',
    Object.fromEntries(Object.entries(costs.byStep).filter(([, v]) => v.calls > 0).map(([k, v]) => [k, v.calls])));

  // raw trace 보존 확인 + 토큰/비용 상세
  const usageRows = await prisma.llmUsage.findMany({ where: { conversationId: detail.id }, orderBy: { createdAt: 'asc' } });
  for (const r of usageRows)
    console.log('  -', r.step, '| in', r.inputTokens, 'out', r.outputTokens, '| $', r.costUsd);
  const traces = await prisma.llmCallTrace.count({ where: { traceId: { not: '' } } });
  const usages = usageRows.length;
  console.log('[raw] llmUsage rows:', usages, '| llmCallTrace rows (total):', traces);

  // 정리
  await prisma.conversation.delete({ where: { id: detail.id } });
  await prisma.$disconnect();

  const ok = detail.messages.length === 1 && streamed.length > 0 && usages >= 3 && costs.totalUsd > 0;
  console.log(ok ? '\n✅ SMOKE PASS' : '\n❌ SMOKE FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e);
  process.exit(1);
});

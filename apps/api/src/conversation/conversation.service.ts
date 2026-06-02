import { Injectable, NotFoundException } from '@nestjs/common';
import { generateText } from 'ai';
import { v4 as uuid } from 'uuid';
import {
  getFormatDef,
  type DiaryFormat,
  type ConversationSummary,
  type ConversationDetail,
  type CostSummary,
  type LlmStep,
} from '@ai-diary/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { LlmTracingService } from '../ai/llm-tracing.service';
import { WeatherService } from '../ai/weather.service';

const PUBLIC_BASE = process.env.PUBLIC_BASE ?? `http://localhost:${process.env.PORT ?? 9001}`;

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly tracing: LlmTracingService,
    private readonly weather: WeatherService,
  ) {}

  /** 대화 생성 + AI 첫 인사 1턴 */
  async create(
    format: DiaryFormat,
    modelId: string,
    location?: { latitude?: number; longitude?: number },
  ): Promise<ConversationDetail> {
    const def = getFormatDef(format);
    const now = new Date();
    const title = `${formatDate(now)} ${def.label}`;

    // 현재 위치가 주어지면 실시간 날씨를 조회해 대화 컨텍스트로 저장 (실패 시 null)
    let weatherNote: string | null = null;
    if (location?.latitude != null && location?.longitude != null) {
      weatherNote = await this.weather.getWeatherNote(
        location.latitude,
        location.longitude,
      );
    }

    const conv = await this.prisma.conversation.create({
      data: {
        id: uuid(),
        title,
        format,
        modelId,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        weatherNote,
      },
    });

    const traceId = uuid();
    const system = buildChatSystem(format, now, weatherNote);
    const nowTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const weatherLine = weatherNote
      ? `현재 날씨는 "${weatherNote}"이다. 인사에 날씨를 자연스럽게 한마디 곁들여도 좋다. ` +
        `단, 주어진 이 정보 외에 날씨를 지어내지 마라. `
      : `날씨 정보는 주어지지 않았으니 날씨를 아는 척 언급하지 마라. `;
    const greetingPrompt =
      `유저가 막 대화를 시작했다. 지금은 ${formatDate(now)} ${nowTime}이다. ` +
      weatherLine +
      `먼저 따뜻하게 인사하고, 이 시각을 자연스럽게 의식하며 첫 질문을 건네라. ` +
      `하루가 아직 진행 중일 수 있으니 "오늘 하루 어땠어"처럼 회고를 강요하지 말고, ` +
      `"지금까지 오늘 어떻게 보내고 있어?"처럼 현재 시점에 맞춰 가볍게 물어라. 1~2문장으로 짧게.`;

    const result = await this.tracing.trace(
      { traceId, conversationId: conv.id, step: 'first_greeting', modelId },
      { system, prompt: greetingPrompt },
      () =>
        generateText({
          model: this.ai.resolveModel(modelId),
          system,
          prompt: greetingPrompt,
        }),
    );

    await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        content: result.text,
      },
    });

    return this.getDetail(conv.id);
  }

  async list(): Promise<ConversationSummary[]> {
    const convs = await this.prisma.conversation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        diary: { select: { id: true } },
        llmUsages: { select: { costUsd: true } },
      },
    });
    return convs.map((c) => ({
      id: c.id,
      title: c.title,
      format: c.format as DiaryFormat,
      modelId: c.modelId,
      createdAt: c.createdAt.toISOString(),
      totalUsd: round6(c.llmUsages.reduce((s, u) => s + u.costUsd, 0)),
      hasDiary: !!c.diary,
    }));
  }

  async getDetail(id: string): Promise<ConversationDetail> {
    const c = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        diary: true,
        feedback: true,
      },
    });
    if (!c) throw new NotFoundException('conversation not found');
    return {
      id: c.id,
      title: c.title,
      format: c.format as DiaryFormat,
      modelId: c.modelId,
      createdAt: c.createdAt.toISOString(),
      weatherNote: c.weatherNote ?? null,
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        parts: m.parts ? JSON.parse(m.parts) : null,
        createdAt: m.createdAt.toISOString(),
      })),
      attachments: c.attachments.map((a) => ({
        id: a.id,
        url: `${PUBLIC_BASE}/uploads/${a.filePath}`,
        caption: a.caption,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
      })),
      diary: c.diary
        ? {
            id: c.diary.id,
            format: c.diary.format as DiaryFormat,
            content: c.diary.content,
            createdAt: c.diary.createdAt.toISOString(),
          }
        : null,
      feedback: c.feedback
        ? {
            id: c.feedback.id,
            content: c.feedback.content,
            createdAt: c.feedback.createdAt.toISOString(),
            updatedAt: c.feedback.updatedAt.toISOString(),
          }
        : null,
    };
  }

  /** 줄글 피드백 저장(upsert) — 빈 내용이면 삭제 */
  async saveFeedback(conversationId: string, content: string) {
    await this.requireConversation(conversationId);
    const trimmed = content.trim();
    if (!trimmed) {
      await this.prisma.feedback.deleteMany({ where: { conversationId } });
      return { feedback: null };
    }
    const fb = await this.prisma.feedback.upsert({
      where: { conversationId },
      create: { conversationId, content: trimmed },
      update: { content: trimmed },
    });
    return {
      feedback: {
        id: fb.id,
        content: fb.content,
        createdAt: fb.createdAt.toISOString(),
        updatedAt: fb.updatedAt.toISOString(),
      },
    };
  }

  async requireConversation(id: string) {
    const c = await this.prisma.conversation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('conversation not found');
    return c;
  }

  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    parts?: unknown,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        parts: parts ? JSON.stringify(parts) : null,
      },
    });
  }

  /** 일기 생성/수정에 공통으로 쓰는 컨텍스트(대화 transcript, 사진 설명, system 프롬프트) */
  private async buildDiaryContext(id: string) {
    const conv = await this.requireConversation(id);
    const format = conv.format as DiaryFormat;
    const def = getFormatDef(format);
    const [messages, attachments] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.attachment.findMany({ where: { conversationId: id } }),
    ]);

    const transcript = messages
      .map((m) => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`)
      .join('\n');
    const photoNotes = attachments.length
      ? '\n\n[첨부 사진 설명]\n' +
        attachments.map((a, i) => `사진${i + 1}: ${a.caption ?? '(설명 없음)'}`).join('\n')
      : '';

    const now = new Date();
    const system =
      `${def.diaryPrompt}\n\n오늘 날짜: ${formatDate(now)}\n\n` +
      `[시간 순서] 대화에서 사건이 일어난 순서가 분명하지 않으면, 임의의 시간 순서로 단정해 서술하지 마라. ` +
      `유저가 명시한 순서만 시간순으로 쓰고, 불확실하면 "A도 하고 B도 했다"처럼 순서를 단정짓지 말고 자연스럽게 엮는다. ` +
      `(이 원칙은 문체/표현의 윤색과 무관하게, 사실관계인 사건의 전후 순서에만 적용된다.)`;

    return { conv, format, def, transcript, photoNotes, system };
  }

  /** 생성된 일기를 DB에 저장하고 결과 형태로 반환 */
  private async saveDiary(id: string, format: DiaryFormat, content: string) {
    const diary = await this.prisma.diary.upsert({
      where: { conversationId: id },
      create: { conversationId: id, format, content },
      update: { content, format },
    });
    const costs = await this.getCosts(id);
    return {
      diary: {
        id: diary.id,
        format,
        content: diary.content,
        createdAt: diary.createdAt.toISOString(),
      },
      costs,
    };
  }

  /** 일기 생성 (버튼/AI 제안 양쪽에서 호출) */
  async generateDiary(id: string) {
    const { conv, format, transcript, photoNotes, system } =
      await this.buildDiaryContext(id);
    const prompt = `[대화 내용]\n${transcript}${photoNotes}`;
    const traceId = uuid();

    const result = await this.tracing.trace(
      { traceId, conversationId: id, step: 'diary_generation', modelId: conv.modelId },
      { system, prompt },
      () =>
        generateText({
          model: this.ai.resolveModel(conv.modelId),
          system,
          prompt,
        }),
    );

    return this.saveDiary(id, format, result.text);
  }

  /** 작성된 일기를 유저의 수정 요청에 따라 다시 쓴다 (초안→수정 모드) */
  async reviseDiary(id: string, instruction: string) {
    const { conv, format, transcript, photoNotes, system } =
      await this.buildDiaryContext(id);
    const existing = await this.prisma.diary.findUnique({
      where: { conversationId: id },
    });
    if (!existing) {
      // 아직 일기가 없으면 일반 생성으로 처리
      return this.generateDiary(id);
    }

    const reviseSystem =
      `${system}\n\n` +
      `[수정 작업] 아래 "기존 일기"를 유저의 "수정 요청"에 맞춰 다시 써라. ` +
      `요청과 무관한 부분은 최대한 그대로 유지하고, 형식·문체·길이는 동일하게 가져간다. ` +
      `대화에 없는 사실을 새로 지어내지는 말되, 유저가 수정 요청에서 알려준 정보는 사실로 받아들여 반영한다.`;
    const prompt =
      `[기존 일기]\n${existing.content}\n\n` +
      `[대화 내용]\n${transcript}${photoNotes}\n\n` +
      `[수정 요청]\n${instruction}`;
    const traceId = uuid();

    const result = await this.tracing.trace(
      { traceId, conversationId: id, step: 'diary_generation', modelId: conv.modelId },
      { system: reviseSystem, prompt },
      () =>
        generateText({
          model: this.ai.resolveModel(conv.modelId),
          system: reviseSystem,
          prompt,
        }),
    );

    return this.saveDiary(id, format, result.text);
  }

  async getCosts(id: string): Promise<CostSummary> {
    await this.requireConversation(id);
    const usages = await this.prisma.llmUsage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    const steps: LlmStep[] = [
      'first_greeting',
      'chat_turn',
      'photo_caption',
      'diary_generation',
    ];
    const byStep = Object.fromEntries(
      steps.map((s) => [s, { calls: 0, costUsd: 0, tokens: 0 }]),
    ) as CostSummary['byStep'];

    let totalUsd = 0;
    let totalIn = 0;
    let totalOut = 0;
    for (const u of usages) {
      const step = u.step as LlmStep;
      const bucket = byStep[step] ?? { calls: 0, costUsd: 0, tokens: 0 };
      bucket.calls += 1;
      bucket.costUsd = round6(bucket.costUsd + u.costUsd);
      bucket.tokens += u.inputTokens + u.outputTokens;
      byStep[step] = bucket;
      totalUsd += u.costUsd;
      totalIn += u.inputTokens;
      totalOut += u.outputTokens;
    }

    return {
      conversationId: id,
      byStep,
      totalUsd: round6(totalUsd),
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalCalls: usages.length,
      calls: usages.map((u) => ({
        step: u.step as LlmStep,
        modelId: u.modelId,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        costUsd: u.costUsd,
        status: u.status as 'success' | 'failure',
        durationMs: u.durationMs,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  /** 업로드된 이미지에 대해 비전 모델로 caption 생성 + 첨부 저장 */
  async addAttachment(
    conversationId: string,
    file: { filename: string; mimetype: string; buffer: Buffer },
  ) {
    const conv = await this.requireConversation(conversationId);
    const visionModelId = process.env.VISION_MODEL_ID || conv.modelId;
    const traceId = uuid();
    const system =
      '너는 사진을 보고 장면을 한국어로 1~2문장으로 담백하게 묘사한다. ' +
      '무엇이 보이는지, 분위기는 어떤지 구체적으로. ' +
      '오직 묘사 문장만 출력한다. 제목/헤딩(#), 목록, "일기 예시" 같은 부가 설명, 마크다운 기호를 절대 넣지 마라.';

    let caption: string | null = null;
    try {
      const result = await this.tracing.trace(
        { traceId, conversationId, step: 'photo_caption', modelId: visionModelId },
        { system, messages: '[image]' },
        () =>
          generateText({
            model: this.ai.resolveModel(visionModelId),
            system,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: '이 사진을 1~2문장으로 묘사해줘. 묘사 문장만, 다른 말 없이.' },
                  { type: 'image', image: file.buffer, mediaType: file.mimetype },
                ],
              },
            ],
          }),
      );
      caption = result.text;
    } catch {
      caption = null;
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        conversationId,
        filePath: file.filename,
        mimeType: file.mimetype,
        caption,
      },
    });

    return {
      id: attachment.id,
      url: `${PUBLIC_BASE}/uploads/${attachment.filePath}`,
      caption,
      mimeType: file.mimetype,
      createdAt: attachment.createdAt.toISOString(),
    };
  }
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function buildChatSystem(
  format: DiaryFormat,
  now: Date,
  weatherNote?: string | null,
): string {
  const def = getFormatDef(format);
  const checklist = def.requiredInfo.map((x) => `- ${x}`).join('\n');
  const weatherBlock = weatherNote
    ? `[오늘 날씨] ${weatherNote}\n` +
      `- 위 날씨는 유저의 현재 위치 기준 실제 정보다. 대화/일기에 자연스럽게 활용해도 된다.\n` +
      `- 단, 주어진 이 정보 외의 날씨(예보, 다른 지역 등)를 지어내지 마라.\n\n`
    : `[날씨] 날씨 정보가 주어지지 않았다. 날씨를 아는 척 추측하거나 지어내지 마라.\n\n`;
  return (
    `${def.persona}\n\n` +
    `[현재 시각] ${now.toLocaleString('ko-KR')}\n` +
    `- 이 시각 기준으로 하루가 아직 진행 중일 수 있다. "오늘 하루 어땠어"처럼 하루가 끝난 듯 회고를 강요하지 말고, "지금까지의 하루"를 묻는다.\n` +
    `- 아직 이르거나 낮 시간이면, 어느 정도 이야기한 뒤 "저녁/밤에 하루를 정리하며 다시 이야기하자"고 제안할 수 있다.\n\n` +
    weatherBlock +
    `[이 형식(${def.label})에서 일기를 쓰려면 다음 정보를 모아야 한다]\n${checklist}\n\n` +
    `[충분 판단] ${def.enoughSignal}\n` +
    `[사진 제안 기준] ${def.photoSuggestGuidance}`
  );
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

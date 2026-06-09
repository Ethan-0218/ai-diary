import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateText } from 'ai';
import { v4 as uuid } from 'uuid';
import {
  getFormatDef,
  type DiaryFormat,
  type ConversationSummary,
  type ConversationDetail,
  type CollectionState,
  type CostSummary,
  type LlmStep,
} from '@ai-diary/shared';
import {
  Conversation,
  Message,
  Attachment,
  Diary,
  Feedback,
  LlmUsage,
} from '../entities';
import { AiService } from '../ai/ai.service';
import { LlmTracingService } from '../ai/llm-tracing.service';
import { WeatherService } from '../ai/weather.service';
import { MemoryService } from '../memory/memory.service';

/**
 * 업로드 파일 경로(상대). 호스트는 붙이지 않는다 — 클라이언트가 자신의 API_BASE로 절대화한다.
 * (서버 호스트를 박으면 맥 IP가 DHCP로 바뀔 때 실기기에서 이미지가 죽는다. IP 하드코딩 금지.)
 */
function uploadUrl(filePath: string): string {
  return `/uploads/${filePath}`;
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    @InjectRepository(Diary) private readonly diaries: Repository<Diary>,
    @InjectRepository(Feedback)
    private readonly feedbacks: Repository<Feedback>,
    @InjectRepository(LlmUsage)
    private readonly llmUsages: Repository<LlmUsage>,
    private readonly ai: AiService,
    private readonly tracing: LlmTracingService,
    private readonly weather: WeatherService,
    private readonly memory: MemoryService,
  ) {}

  /** 대화 생성 + AI 첫 인사 1턴 (로그인 유저 소유) */
  async create(
    format: DiaryFormat,
    modelId: string,
    userId: string,
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

    const conv = await this.conversations.save(
      this.conversations.create({
        userId,
        title,
        format,
        modelId,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        weatherNote,
      }),
    );

    const traceId = uuid();
    const memoryContext = await this.memory.buildContext(userId);
    const system = buildChatSystem(format, now, weatherNote, null, true, memoryContext);
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

    await this.messages.save(
      this.messages.create({
        conversationId: conv.id,
        role: 'assistant',
        content: result.text,
      }),
    );

    return this.getDetail(conv.id, userId);
  }

  async list(userId: string): Promise<ConversationSummary[]> {
    const convs = await this.conversations.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['diary', 'llmUsages'],
    });
    return convs.map((c) => ({
      id: c.id,
      title: c.title,
      format: c.format as DiaryFormat,
      modelId: c.modelId,
      createdAt: c.createdAt.toISOString(),
      totalUsd: round6((c.llmUsages ?? []).reduce((s, u) => s + u.costUsd, 0)),
      hasDiary: !!c.diary,
    }));
  }

  async getDetail(id: string, userId: string): Promise<ConversationDetail> {
    const c = await this.conversations.findOne({
      where: { id },
      relations: ['messages', 'attachments', 'diary', 'feedback'],
    });
    if (!c || c.userId !== userId) {
      throw new NotFoundException('conversation not found');
    }
    const messages = [...c.messages].sort(byCreatedAtAsc);
    const attachments = [...c.attachments].sort(byCreatedAtAsc);
    return {
      id: c.id,
      title: c.title,
      format: c.format as DiaryFormat,
      modelId: c.modelId,
      createdAt: c.createdAt.toISOString(),
      weatherNote: c.weatherNote ?? null,
      collectionState: parseCollectionState(c.collectionState),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        parts: m.parts ? JSON.parse(m.parts) : null,
        createdAt: m.createdAt.toISOString(),
      })),
      attachments: attachments.map((a) => ({
        id: a.id,
        url: uploadUrl(a.filePath),
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
  async saveFeedback(conversationId: string, userId: string, content: string) {
    await this.requireConversation(conversationId, userId);
    const trimmed = content.trim();
    if (!trimmed) {
      await this.feedbacks.delete({ conversationId });
      return { feedback: null };
    }
    await this.feedbacks.upsert({ conversationId, content: trimmed }, [
      'conversationId',
    ]);
    const fb = await this.feedbacks.findOneOrFail({ where: { conversationId } });
    return {
      feedback: {
        id: fb.id,
        content: fb.content,
        createdAt: fb.createdAt.toISOString(),
        updatedAt: fb.updatedAt.toISOString(),
      },
    };
  }

  /** 대화를 로드하되, 소유자(userId)가 아니면 NotFound (존재 노출 방지). */
  async requireConversation(id: string, userId: string): Promise<Conversation> {
    const c = await this.conversations.findOne({ where: { id } });
    if (!c || c.userId !== userId) {
      throw new NotFoundException('conversation not found');
    }
    return c;
  }

  /** 하이브리드 상태머신(s3.2 §3): 매 대화 턴 updateCollectionState 툴이 부른다. 하루 누적. */
  async updateCollectionState(
    id: string,
    patch: Omit<CollectionState, 'updatedAt'>,
  ): Promise<CollectionState> {
    const state: CollectionState = {
      filled: patch.filled ?? [],
      skipped: patch.skipped ?? [],
      enough: !!patch.enough,
      nextGap: patch.nextGap,
      updatedAt: new Date().toISOString(),
    };
    await this.conversations.update(
      { id },
      { collectionState: JSON.stringify(state) },
    );
    return state;
  }

  saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    parts?: unknown,
  ) {
    return this.messages.save(
      this.messages.create({
        conversationId,
        role,
        content,
        parts: parts ? JSON.stringify(parts) : null,
      }),
    );
  }

  /** 일기 생성/수정에 공통으로 쓰는 컨텍스트(대화 transcript, 사진 설명, system 프롬프트) */
  private async buildDiaryContext(id: string, userId: string) {
    const conv = await this.requireConversation(id, userId);
    const format = conv.format as DiaryFormat;
    const def = getFormatDef(format);
    const [messages, attachments] = await Promise.all([
      this.messages.find({
        where: { conversationId: id },
        order: { createdAt: 'ASC' },
      }),
      this.attachments.find({ where: { conversationId: id } }),
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
      `(이 원칙은 문체/표현의 윤색과 무관하게, 사실관계인 사건의 전후 순서에만 적용된다.)\n\n` +
      `[대화 메타 발언 제외] 대화를 진행·종료하기 위한 발언("이쯤이면 충분", "그만 얘기할래", "일기 써줘" 등)은 그날 하루의 사건/감정이 아니므로 일기 본문에 넣지 마라. 일기에는 하루의 경험과 감상만 담는다.`;

    return { conv, format, def, transcript, photoNotes, system };
  }

  /** 생성된 일기를 DB에 저장하고 결과 형태로 반환 */
  private async saveDiary(
    id: string,
    userId: string,
    format: DiaryFormat,
    content: string,
  ) {
    await this.diaries.upsert({ conversationId: id, format, content }, [
      'conversationId',
    ]);
    const diary = await this.diaries.findOneOrFail({
      where: { conversationId: id },
    });
    const costs = await this.getCosts(id, userId);
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
  async generateDiary(id: string, userId: string) {
    const { conv, format, transcript, photoNotes, system } =
      await this.buildDiaryContext(id, userId);

    // 연속성(§4-A): 과거 프로필/에피소드를 생성에 살짝 주입.
    const memoryContext = await this.memory.buildContext(userId);
    const genSystem = memoryContext
      ? `${system}\n\n[과거 맥락 — 연속성 참고용]\n${memoryContext}\n` +
        `- 자연스러우면 "어제 시작한 …을 오늘 마무리"처럼 과거와 살짝 이을 수 있다. 단 위에 없는 사실을 지어내지 마라.`
      : system;
    const prompt = `[대화 내용]\n${transcript}${photoNotes}`;
    const traceId = uuid();

    const result = await this.tracing.trace(
      { traceId, conversationId: id, step: 'diary_generation', modelId: conv.modelId },
      { system: genSystem, prompt },
      () =>
        generateText({
          model: this.ai.resolveModel(conv.modelId),
          system: genSystem,
          prompt,
        }),
    );

    const saved = await this.saveDiary(id, userId, format, result.text);

    // 후처리: 대화에서 기억 추출·저장 (best-effort, 내부에서 throw 흡수).
    await this.memory.onDiaryComplete({
      userId,
      conversationId: id,
      modelId: conv.modelId,
      transcript,
      diaryId: saved.diary.id,
      diaryContent: saved.diary.content,
    });

    return saved;
  }

  /** 작성된 일기를 유저의 수정 요청에 따라 다시 쓴다 (초안→수정 모드) */
  async reviseDiary(id: string, userId: string, instruction: string) {
    const { conv, format, transcript, photoNotes, system } =
      await this.buildDiaryContext(id, userId);
    const existing = await this.diaries.findOne({
      where: { conversationId: id },
    });
    if (!existing) {
      // 아직 일기가 없으면 일반 생성으로 처리
      return this.generateDiary(id, userId);
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

    return this.saveDiary(id, userId, format, result.text);
  }

  async getCosts(id: string, userId: string): Promise<CostSummary> {
    await this.requireConversation(id, userId);
    const usages = await this.llmUsages.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });

    const steps: LlmStep[] = [
      'first_greeting',
      'chat_turn',
      'photo_caption',
      'diary_generation',
      'memory_extraction',
      'memory_embedding',
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
    userId: string,
    file: { filename: string; mimetype: string; buffer: Buffer },
  ) {
    const conv = await this.requireConversation(conversationId, userId);
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

    const attachment = await this.attachments.save(
      this.attachments.create({
        conversationId,
        filePath: file.filename,
        mimeType: file.mimetype,
        caption,
      }),
    );

    return {
      id: attachment.id,
      url: uploadUrl(attachment.filePath),
      caption,
      mimeType: file.mimetype,
      createdAt: attachment.createdAt.toISOString(),
    };
  }
}

function byCreatedAtAsc(a: { createdAt: Date }, b: { createdAt: Date }): number {
  return a.createdAt.getTime() - b.createdAt.getTime();
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
  collectionState?: CollectionState | null,
  forGreeting = false,
  memoryContext?: string | null,
): string {
  const def = getFormatDef(format);
  const checklist = def.requiredInfo.map((x) => `- ${x}`).join('\n');

  // 세션 간 기억(§4-A) — 프로필+최근 에피소드. 자연스러운 연속성에만 쓰고 창작 금지.
  const memoryBlock = memoryContext
    ? `[기억 — 이 유저에 대해 이전 대화에서 알게 된 것]\n${memoryContext}\n` +
      `- 자연스러우면 이어서 안부를 묻거나("저번에 말한 …는 어떻게 됐어?") 맥락에 활용하라.\n` +
      `- 단, 여기 없는 사실을 지어내지 말고, 유저가 부정하면 즉시 받아들여라. 심문하듯 캐묻지 마라.\n\n`
    : '';
  const weatherBlock = weatherNote
    ? `[오늘 날씨] ${weatherNote}\n` +
      `- 위 날씨는 유저의 현재 위치 기준 실제 정보다. 대화/일기에 자연스럽게 활용해도 된다.\n` +
      `- 단, 주어진 이 정보 외의 날씨(예보, 다른 지역 등)를 지어내지 마라.\n\n`
    : `[날씨] 날씨 정보가 주어지지 않았다. 날씨를 아는 척 추측하거나 지어내지 마라.\n\n`;

  // 하루 누적 상태 주입 — 재진입 시 이미 모은 것을 인지하고 "이어서" 잇도록.
  const stateBlock = collectionState
    ? `[지금까지 모은 것 — 하루에 걸쳐 누적됨]\n` +
      `- 이미 채워진 항목: ${collectionState.filled.length ? collectionState.filled.join(', ') : '(없음)'}\n` +
      `- 유저가 넘어간 항목: ${collectionState.skipped.length ? collectionState.skipped.join(', ') : '(없음)'}\n` +
      (collectionState.nextGap ? `- 다음에 들어보면 좋을 것: ${collectionState.nextGap}\n` : '') +
      `- 이미 모은 걸 다시 캐묻지 말고, 처음이 아니면 "이어서" 자연스럽게 잇는다.\n` +
      (collectionState.enough
        ? `- 이미 일기를 제안한 상태다. 유저가 계속 이야기하면 매 턴 다시 제안하지 말고 대화를 잇는다(나그 금지).\n`
        : '') +
      `\n`
    : '';

  return (
    `${def.persona}\n\n` +
    `[현재 시각] ${now.toLocaleString('ko-KR')}\n` +
    `- 이 시각 기준으로 하루가 아직 진행 중일 수 있다. "오늘 하루 어땠어"처럼 하루가 끝난 듯 회고를 강요하지 말고, "지금까지의 하루"를 묻는다.\n` +
    `- 아직 이르거나 낮 시간이면, 어느 정도 이야기한 뒤 "저녁/밤에 하루를 정리하며 다시 이야기하자"고 제안할 수 있다.\n\n` +
    memoryBlock +
    `[기억 정직성 — 중요] 유저가 "저번에 ~했잖아"처럼 과거를 단정해도, 위 기억이나 이번 대화에 ` +
    `근거가 없으면 아는 척 맞장구치지 마라. "그 얘긴 처음 듣는 것 같은데, 더 들려줄래?"처럼 솔직히 ` +
    `되물어 확인하고, 확인된 뒤에만 사실로 받아들인다. 없는 기억을 있는 것처럼 지어내지 마라.\n\n` +
    weatherBlock +
    stateBlock +
    `[이 형식(${def.label})에서 일기를 쓰려면 다음 정보를 모아야 한다]\n${checklist}\n\n` +
    `[충분 판단] ${def.enoughSignal}\n\n` +
    // 인사(greeting)는 updateCollectionState 툴 없이 generateText로 생성되므로,
    // 이 지시를 주면 모델이 툴 대신 JSON을 본문에 써버린다 → 인사에선 제외한다.
    (forGreeting
      ? ''
      : `[수집 상태 갱신 — 매 턴 필수]\n` +
        `- 답변을 한 뒤(또는 전에), updateCollectionState 툴을 호출해 현재 수집 상태를 갱신하라.\n` +
        `- filled = 위 체크리스트 중 유저가 말하거나 추측-확인으로 긍정/수정해 준 항목들(짧은 라벨로).\n` +
        `- [매우 중요] "감정·생각/내면" 항목은 유저가 직접 표현했거나 네 추측을 확인해 준 경우에만 filled에 넣는다. AI 혼자 추측한 감상은 넣지 않는다.\n` +
        `- skipped = 유저가 꺼리거나 자연스럽게 넘어간 항목. nextGap = 다음에 더 들어보면 좋을 빈 항목 1개.\n` +
        `- enough = 위 [충분 판단] 기준을 충족했는지. 충족하면 자연스럽게 일기를 제안한다(이미 제안했으면 다시 권하지 않는다).\n` +
        `- [편향일 뿐] 이 체크리스트는 질문을 강제하지 않는다. 자연스러움이 최우선이고, nextGap은 참고용이다. 빈칸을 채우려 심문하지 마라.\n\n`) +
    `[사진 제안 기준] ${def.photoSuggestGuidance}`
  );
}

/** DB의 collectionState(JSON 문자열)를 CollectionState로 파싱 (손상 시 null) */
export function parseCollectionState(raw: string | null | undefined): CollectionState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return {
      filled: Array.isArray(o.filled) ? o.filled : [],
      skipped: Array.isArray(o.skipped) ? o.skipped : [],
      enough: !!o.enough,
      nextGap: typeof o.nextGap === 'string' ? o.nextGap : undefined,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

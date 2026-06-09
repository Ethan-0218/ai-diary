import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import { v4 as uuid } from 'uuid';
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import type { CreateConversationDto, DiaryFormat } from '@ai-diary/shared';
import {
  ConversationService,
  buildChatSystem,
  parseCollectionState,
} from './conversation.service';
import { AiService } from '../ai/ai.service';
import { LlmTracingService } from '../ai/llm-tracing.service';
import { MemoryService } from '../memory/memory.service';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');

type AuthedRequest = Request & { userId: string };

/** 업로드된 파일 (multer) — 네임스페이스 타입(Express.Multer.File) 대신 평탄 타입으로 둬
 *  데코레이터 메타데이터에 도달불가 typeof 가드가 생기지 않게 한다. */
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conv: ConversationService,
    private readonly ai: AiService,
    private readonly tracing: LlmTracingService,
    private readonly memory: MemoryService,
  ) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateConversationDto) {
    return this.conv.create(
      dto.notebookId,
      dto.modelId,
      req.userId,
      { latitude: dto.latitude, longitude: dto.longitude },
      dto.timezone,
    );
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.conv.list(req.userId);
  }

  @Get(':id')
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.conv.getDetail(id, req.userId);
  }

  @Get(':id/costs')
  costs(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.conv.getCosts(id, req.userId);
  }

  @Post(':id/diary')
  diary(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.conv.generateDiary(id, req.userId);
  }

  @Post(':id/diary/revise')
  reviseDiary(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    return this.conv.reviseDiary(id, req.userId, (body?.instruction ?? '').trim());
  }

  @Post(':id/feedback')
  saveFeedback(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { content?: string },
  ) {
    return this.conv.saveFeedback(id, req.userId, body?.content ?? '');
  }

  /** 스트리밍 채팅 — useChat 트랜스포트 타깃 */
  @Post(':id/chat')
  async chat(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const conv = await this.conv.requireConversation(id, req.userId);
    const format = conv.format as DiaryFormat;
    const messages: UIMessage[] = (req.body?.messages ?? []) as UIMessage[];

    // 마지막 유저 메시지 영속화
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      await this.conv.saveMessage(id, 'user', uiText(lastUser), lastUser.parts);
    }

    const memoryContext = await this.memory.buildContext(req.userId);
    const system = buildChatSystem(
      format,
      new Date(),
      conv.weatherNote,
      parseCollectionState(conv.collectionState),
      false,
      memoryContext,
      conv.timezone ?? undefined,
    );
    const traceId = uuid();
    const startedAt = Date.now();

    // 유저가 함께 보낸 사진(data-photo 파트)을 실제 이미지로 모델 메시지에 주입한다.
    const modelMessages = await convertToModelMessages(messages);
    await injectAttachedPhotos(messages, modelMessages);

    const result = streamText({
      model: this.ai.resolveModel(conv.modelId),
      system,
      messages: modelMessages,
      stopWhen: stepCountIs(4),
      onError: ({ error }) => {
        console.error('[chat] stream error', error);
      },
      tools: {
        requestPhoto: tool({
          description:
            '유저가 사진을 찍었을 법한 순간이 나오면 호출. 프론트가 사진 첨부 버튼을 강조한다. ' +
            '이것은 화면에 보이지 않는 내부 신호이므로, 인자(reason)나 JSON을 답변 본문에 절대 출력하지 마라.',
          inputSchema: z.object({
            reason: z.string().describe('왜 이 순간에 사진을 권하는지'),
          }),
          execute: async ({ reason }) => ({ acknowledged: true, reason }),
        }),
        recallMemory: tool({
          description:
            '과거 대화/일기에서 관련된 기억을 의미검색으로 회수한다. 유저가 과거를 언급하거나("지난번 그거", "저번에 말한…") 연속성이 필요할 때 호출. ' +
            '결과가 비면 모른다고 솔직히 말하고 지어내지 마라. 이것은 내부 신호이니 인자/JSON을 답변 본문에 출력하지 마라.',
          inputSchema: z.object({
            query: z.string().describe('회수하고 싶은 주제/키워드'),
          }),
          execute: async ({ query }) => ({
            memories: await this.memory.recall(req.userId, query, id),
          }),
        }),
        updateCollectionState: tool({
          description:
            '매 대화 턴마다 호출해 인터뷰 수집 상태를 갱신한다(하이브리드 상태머신). ' +
            'enough가 true가 되면 프론트가 "일기 완성하기" CTA를 강조한다. ' +
            '일기는 한 번에 완성되는 것이며 초안→수정 기능은 없다. 답변 본문에서 "초안"이라 부르지 마라. ' +
            '이것은 화면에 보이지 않는 내부 신호이므로, 인자나 JSON을 답변 본문에 절대 출력하지 마라.',
          inputSchema: z.object({
            filled: z
              .array(z.string())
              .describe('유저가 말하거나 추측-확인으로 긍정/수정해 채워진 체크리스트 항목(짧은 라벨). 감정·내면 항목은 유저가 확인한 경우에만.'),
            skipped: z
              .array(z.string())
              .describe('유저가 꺼리거나 자연스럽게 넘어간 항목'),
            enough: z
              .boolean()
              .describe('[충분 판단] 기준을 충족해 일기를 쓸 만한지 여부'),
            nextGap: z
              .string()
              .optional()
              .describe('다음에 자연스럽게 더 들어보면 좋을 빈 항목 1개(참고용, 강제 아님)'),
          }),
          execute: async ({ filled, skipped, enough, nextGap }) => {
            await this.conv.updateCollectionState(id, {
              filled,
              skipped,
              enough,
              nextGap,
            });
            return { acknowledged: true };
          },
        }),
      },
      onFinish: ({ text, usage, finishReason, toolCalls }) => {
        const clean = stripLeakedToolJson(text);
        if (clean && clean.trim()) {
          void this.conv.saveMessage(id, 'assistant', clean, { toolCalls });
        }
        this.tracing.record({
          ctx: { traceId, conversationId: id, step: 'chat_turn', modelId: conv.modelId },
          durationMs: Date.now() - startedAt,
          usage: {
            inputTokens: (usage as any)?.inputTokens,
            outputTokens: (usage as any)?.outputTokens,
            cacheReadTokens: (usage as any)?.cachedInputTokens,
          },
          request: { system, messages: messages.map(uiText) },
          response: { text, finishReason, toolCalls },
        });
      },
    });

    result.pipeUIMessageStreamToResponse(res, { onError: chatErrorMessage });
  }

  /** 사진 업로드 + 비전 caption */
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImage,
  ) {
    await this.conv.requireConversation(id, req.userId);
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    let { buffer, mimetype } = file;
    let ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();

    // HEIC/HEIF는 브라우저가 렌더하지 못하므로 JPEG로 변환해 저장한다.
    if (isHeic(mimetype, ext)) {
      try {
        buffer = await heicToJpeg(buffer);
        mimetype = 'image/jpeg';
        ext = 'jpg';
      } catch (e) {
        // 변환 실패 시 원본을 그대로 저장(엑박 가능)하되 로그만 남긴다.
        console.error('[upload] HEIC 변환 실패', (e as Error).message);
      }
    }

    const filename = `${uuid()}.${ext}`;
    await fs.writeFile(join(UPLOAD_DIR, filename), buffer);
    return this.conv.addAttachment(id, req.userId, { filename, mimetype, buffer });
  }
}

/**
 * 일부 모델(gpt 등)이 tool 인자 JSON({"reason":...})을 답변 본문에 텍스트로 흘리는 경우가 있다.
 * 본문 앞/사이에 끼어든 그런 JSON 블롭을 제거한다. (tool-arg로 보이는 객체만 제거)
 */
export function stripLeakedToolJson(text: string | undefined): string {
  if (!text) return '';
  const TOOL_KEYS = new Set([
    'reason', // requestPhoto
    'query', // recallMemory
    'filled',
    'skipped',
    'enough',
    'nextGap', // updateCollectionState
  ]);
  const looksLikeToolArg = (s: string): boolean => {
    try {
      const obj = JSON.parse(s);
      /* istanbul ignore next -- 방어적: matchBrace가 항상 객체 리터럴 블록을 넘겨 도달 불가 */
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      const keys = Object.keys(obj);
      return keys.length > 0 && keys.every((k) => TOOL_KEYS.has(k));
    } catch {
      return false;
    }
  };
  // 문자열을 훑으며 최상위 {..} 블록을 찾아, tool-arg로 파싱되면 잘라낸다.
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      const end = matchBrace(text, i);
      if (end > i) {
        const block = text.slice(i, end + 1);
        if (looksLikeToolArg(block)) {
          i = end + 1;
          continue;
        }
      }
    }
    out += text[i];
    i += 1;
  }
  return out.trim();
}

/** text[start]가 '{'일 때, 문자열 리터럴을 고려해 짝이 되는 '}'의 인덱스를 반환(없으면 -1) */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 유저 메시지에 함께 보낸 사진(data-photo 파트)을 실제 이미지로 모델 메시지에 주입한다.
 * convertToModelMessages는 data-* 파트를 버리므로, 여기서 첨부 파일을 읽어 image 콘텐츠로 추가한다.
 * UI 유저 메시지와 모델 유저 메시지는 순서가 1:1로 대응하므로 순서대로 짝지어 주입한다.
 */
export async function injectAttachedPhotos(
  uiMessages: UIMessage[],
  modelMessages: Array<{ role: string; content: unknown }>,
): Promise<void> {
  let mi = 0;
  for (const ui of uiMessages) {
    if (ui.role !== 'user') continue;
    while (mi < modelMessages.length && modelMessages[mi].role !== 'user') mi++;
    if (mi >= modelMessages.length) break;
    const target = modelMessages[mi];
    mi++;

    const photos = ((ui.parts ?? []) as Array<{ type: string; data?: any }>).filter(
      (p) => p.type === 'data-photo',
    );
    if (!photos.length) continue;

    if (!Array.isArray(target.content)) {
      target.content = target.content
        ? [{ type: 'text', text: String(target.content) }]
        : [];
    }
    const content = target.content as Array<Record<string, unknown>>;
    for (const p of photos) {
      const url: string | undefined = p?.data?.url;
      const mediaType: string = p?.data?.mediaType || 'image/jpeg';
      const rel = url?.split('/uploads/')[1];
      if (!rel) continue;
      const filename = basename(rel); // path traversal 방지
      try {
        const buffer = await fs.readFile(join(UPLOAD_DIR, filename));
        content.push({ type: 'image', image: buffer, mediaType });
      } catch {
        // 파일을 못 읽으면 무시하고 대화는 계속 진행
      }
    }
  }
}

/** 스트림 에러를 사용자용 한국어 메시지로 변환 (무료 등급 quota 초과를 구체적으로 안내) */
export function chatErrorMessage(error: unknown): string {
  const parts: string[] = [];
  const collect = (e: any, depth = 0) => {
    if (!e || depth > 3) return;
    if (typeof e === 'string') parts.push(e);
    else if (typeof e === 'object') {
      if (e.message) parts.push(String(e.message));
      if (e.responseBody) parts.push(String(e.responseBody));
      if (e.lastError) collect(e.lastError, depth + 1);
      if (Array.isArray(e.errors)) e.errors.forEach((x: any) => collect(x, depth + 1));
    }
  };
  collect(error);
  const text = parts.join(' ');
  if (/RESOURCE_EXHAUSTED|free_tier|quota|exceeded your current quota/i.test(text)) {
    return '오늘 무료 AI 사용량 한도(예: Gemini 무료 등급 하루 한도)를 모두 사용했어요. 잠시 후 다시 시도하거나, AI 제공자 결제를 활성화하면 한도가 늘어납니다.';
  }
  return '답장을 생성하는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
}

/** HEIC/HEIF 여부 판별 (브라우저가 mimetype을 비워 보내는 경우 대비해 확장자도 확인) */
export function isHeic(mimetype: string | undefined, ext: string): boolean {
  const mt = (mimetype ?? '').toLowerCase();
  return (
    mt.includes('heic') ||
    mt.includes('heif') ||
    ext === 'heic' ||
    ext === 'heif'
  );
}

/** HEIC 버퍼를 JPEG 버퍼로 변환 (heic-convert: 순수 JS, 네이티브 의존성 없음) */
export async function heicToJpeg(input: Buffer): Promise<Buffer> {
  // CommonJS 모듈 — 동적 require로 로드
  const convert = require('heic-convert') as (opts: {
    buffer: Buffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }) => Promise<ArrayBuffer | Buffer>;
  const out = await convert({ buffer: input, format: 'JPEG', quality: 0.9 });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

/** UIMessage의 text part들을 이어붙임 */
export function uiText(m: UIMessage): string {
  const parts = (m.parts ?? []) as Array<{ type: string; text?: string }>;
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('');
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { generateObject } from 'ai';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { UserProfileFact } from '../entities/user-profile-fact.entity';
import { EpisodicMemory } from '../entities/episodic-memory.entity';
import { Diary } from '../entities/diary.entity';
import { AiService } from '../ai/ai.service';
import { LlmTracingService } from '../ai/llm-tracing.service';
import { EmbeddingService, EMBEDDING_DIM, toVectorLiteral } from './embedding.service';

/** 추출 LLM의 구조화 출력 스키마 — 유저가 명시한 것만(보수적). */
const extractionSchema = z.object({
  facts: z
    .array(
      z.object({
        category: z
          .string()
          .describe('가족·직업·건강·관심사·진행중일·취향 등 짧은 분류'),
        content: z.string().describe('유저가 명시한 지속 사실 한 줄'),
        confidence: z.number().min(0).max(1).describe('명시 정도 확신도'),
      }),
    )
    .describe('새로 알게 된 지속 사실. 추측/창작 금지. 없으면 빈 배열.'),
  summary: z.string().describe('그날 있었던 일 2~3문장 요약(사실 위주)'),
  mood: z.string().nullable().describe('그날의 무드 한 단어/구. 불명확하면 null.'),
});

/** 추출 결과 타입 — 스키마에서 추론(단일 출처). */
export type ExtractionResult = z.infer<typeof extractionSchema>;

/** recall 결과 한 건 */
export interface RecalledMemory {
  type: 'episodic' | 'diary';
  text: string;
  date: string | null;
}

const EXTRACTION_SYSTEM =
  '너는 대화에서 유저에 대해 새로 알게 된 *지속 사실*과 그날의 *에피소드 요약*을 뽑는다. ' +
  '엄격한 원칙: (1) 유저가 명시적으로 말한 것만. 추측·창작·과장 금지. ' +
  '(2) 일시적 감정이 아니라 앞으로도 유효할 사실만 facts에 넣어라(예: 직업, 가족, 진행 중인 일, 지속적 관심사). ' +
  '(3) 확실치 않으면 facts에서 빼라. (4) summary는 그날 사건 위주 2~3문장. mood는 분명할 때만.';

/**
 * 세션 간 기억 (§4-A): 구조화 프로필(user_profile_fact) + 날짜별 에피소드(episodic_memory)
 * + pgvector 의미검색. 임베딩은 TypeORM이 모르는 vector 타입이라 raw 테이블(memory_embedding)로 격리.
 * 모든 경로는 best-effort — 실패해도 대화/일기 코어 루프를 막지 않는다.
 */
@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserProfileFact)
    private readonly facts: Repository<UserProfileFact>,
    @InjectRepository(EpisodicMemory)
    private readonly episodes: Repository<EpisodicMemory>,
    @InjectRepository(Diary)
    private readonly diaries: Repository<Diary>,
    private readonly embeddings: EmbeddingService,
    private readonly ai: AiService,
    private readonly tracing: LlmTracingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  /**
   * recall 의미검색 거리 임계값(코사인 거리, 0=동일). 이보다 멀면 "관련 없음"으로 보고 회수하지 않는다.
   * text-embedding-3-small 기준 관련≈0.3~0.45 / 무관≈0.75~0.85라 0.55가 둘을 가른다. env로 조정 가능.
   */
  private get recallMaxDistance(): number {
    return Number(process.env.RECALL_MAX_DISTANCE) || 0.55;
  }

  /** pgvector 확장 + 임베딩 테이블(멱등). TypeORM synchronize가 건드리지 않는 raw 테이블. */
  async ensureSchema(): Promise<void> {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
      await this.dataSource.query(
        `CREATE TABLE IF NOT EXISTS memory_embedding (
           id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
           "ownerType" varchar NOT NULL,
           "ownerId" uuid NOT NULL,
           "userId" uuid NOT NULL,
           embedding vector(${EMBEDDING_DIM}) NOT NULL,
           "createdAt" timestamp NOT NULL DEFAULT now()
         )`,
      );
      await this.dataSource.query(
        'CREATE INDEX IF NOT EXISTS idx_memory_embedding_userid ON memory_embedding ("userId")',
      );
      // (ownerType,ownerId) 유일 — 일기 재생성 시 임베딩을 덮어쓰기(upsert) 위함.
      await this.dataSource.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_embedding_owner ON memory_embedding ("ownerType","ownerId")',
      );
    } catch (e) {
      this.logger.error(`memory schema bootstrap 실패: ${(e as Error).message}`);
    }
  }

  // ── 쓰기 경로 ─────────────────────────────────────────────

  /**
   * 일기 완성 후처리: 대화에서 프로필 사실/에피소드를 추출해 저장하고 임베딩한다.
   * best-effort — 어떤 실패도 throw하지 않는다(일기는 이미 사용자에게 반환된 상태).
   */
  async onDiaryComplete(args: {
    userId: string;
    conversationId: string;
    modelId: string;
    transcript: string;
    diaryId: string;
    diaryContent: string;
  }): Promise<void> {
    try {
      // 이미 아는 사실을 추출 프롬프트에 줘서 같은 사실이 미세한 표현차로 중복 적재되는 것을 막는다.
      const known = await this.facts.find({
        where: { userId: args.userId, supersededAt: IsNull() },
      });
      const extracted = await this.extract(
        args.modelId,
        args.transcript,
        args.conversationId,
        known.map((f) => `${f.category}: ${f.content}`),
      );

      for (const f of extracted.facts) {
        await this.upsertFact(args.userId, f.category, f.content, f.confidence);
      }

      // 일기 재생성 대비: 이 대화의 에피소드는 1건으로 유지(있으면 갱신).
      const date = new Date().toISOString().slice(0, 10);
      const prior = await this.episodes.findOne({
        where: { conversationId: args.conversationId },
      });
      const episode = await this.episodes.save(
        this.episodes.create({
          ...(prior ? { id: prior.id, createdAt: prior.createdAt } : {}),
          userId: args.userId,
          conversationId: args.conversationId,
          date,
          summary: extracted.summary,
          mood: extracted.mood,
        }),
      );

      const vectors = await this.embeddings.embedMany(
        [extracted.summary, args.diaryContent],
        { conversationId: args.conversationId },
      );
      await this.storeEmbedding('episodic', episode.id, args.userId, vectors[0]);
      await this.storeEmbedding('diary', args.diaryId, args.userId, vectors[1]);
    } catch (e) {
      this.logger.warn(`기억 추출/저장 실패(무시): ${(e as Error).message}`);
    }
  }

  /** 대화 transcript → 구조화 추출(LLM). 비용/트레이스는 tracing.trace가 영속. */
  async extract(
    modelId: string,
    transcript: string,
    conversationId: string,
    knownFacts: string[] = [],
  ): Promise<ExtractionResult> {
    const traceId = uuid();
    const knownBlock = knownFacts.length
      ? `\n\n[이미 알고 있는 사실 — 아래에 *없는* 새 사실만 facts에 넣어라]\n` +
        knownFacts.map((f) => `- ${f}`).join('\n')
      : '';
    const prompt = `다음은 오늘 유저와의 대화다. 여기서만 추출하라.\n\n${transcript}${knownBlock}`;
    const result = await this.tracing.trace(
      { traceId, conversationId, step: 'memory_extraction', modelId },
      { system: EXTRACTION_SYSTEM, prompt },
      () =>
        generateObject({
          model: this.ai.resolveModel(modelId),
          schema: extractionSchema,
          system: EXTRACTION_SYSTEM,
          prompt,
        }),
    );
    return result.object;
  }

  /** 활성 사실에 (category, content) 정확히 중복이 없을 때만 추가(보수적). */
  async upsertFact(
    userId: string,
    category: string,
    content: string,
    confidence: number,
  ): Promise<void> {
    const existing = await this.facts.findOne({
      where: { userId, category, content, supersededAt: IsNull() },
    });
    if (existing) return;
    await this.facts.save(
      this.facts.create({ userId, category, content, confidence, supersededAt: null }),
    );
  }

  private async storeEmbedding(
    ownerType: 'episodic' | 'diary',
    ownerId: string,
    userId: string,
    vector: number[],
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO memory_embedding ("ownerType","ownerId","userId",embedding)
       VALUES ($1,$2,$3,$4::vector)
       ON CONFLICT ("ownerType","ownerId")
       DO UPDATE SET embedding = EXCLUDED.embedding, "userId" = EXCLUDED."userId"`,
      [ownerType, ownerId, userId, toVectorLiteral(vector)],
    );
  }

  // ── 읽기 경로 ─────────────────────────────────────────────

  /**
   * 대화 시작/일기 생성에 주입할 메모리 컨텍스트(프로필 핵심 + 최근 에피소드).
   * 없으면 null.
   */
  async buildContext(userId: string, recentEpisodes = 5): Promise<string | null> {
    const [facts, episodes] = await Promise.all([
      this.facts.find({
        where: { userId, supersededAt: IsNull() },
        order: { updatedAt: 'DESC' },
        take: 30,
      }),
      this.episodes.find({
        where: { userId },
        order: { date: 'DESC', createdAt: 'DESC' },
        take: recentEpisodes,
      }),
    ]);
    if (facts.length === 0 && episodes.length === 0) return null;

    const lines: string[] = [];
    if (facts.length) {
      lines.push('[유저에 대해 알고 있는 것]');
      for (const f of facts) lines.push(`- (${f.category}) ${f.content}`);
    }
    if (episodes.length) {
      lines.push('[최근 기록]');
      for (const e of episodes) {
        lines.push(`- ${e.date}${e.mood ? ` (${e.mood})` : ''}: ${e.summary}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * 질의와 의미적으로 가까운 과거 기억을 pgvector로 회수(대화 중 recallMemory 툴).
   * 실패 시 빈 배열.
   */
  async recall(
    userId: string,
    query: string,
    conversationId?: string,
    k = 3,
  ): Promise<RecalledMemory[]> {
    try {
      const qVec = await this.embeddings.embed(
        query,
        conversationId ? { conversationId } : undefined,
      );
      // 거리 임계값(< MAX) — 의미상 충분히 가까운 것만 회수. 없으면 빈 배열을 반환해
      // AI가 "기억에 없다"고 솔직히 답하게 한다(무관한 최근접을 아는 척 끌어쓰지 않게).
      const rows: Array<{ ownerType: string; ownerId: string }> =
        await this.dataSource.query(
          `SELECT "ownerType","ownerId"
             FROM memory_embedding
            WHERE "userId" = $2 AND (embedding <=> $1::vector) < $4
            ORDER BY embedding <=> $1::vector
            LIMIT $3`,
          [toVectorLiteral(qVec), userId, k, this.recallMaxDistance],
        );
      const out: RecalledMemory[] = [];
      for (const r of rows) {
        if (r.ownerType === 'episodic') {
          const e = await this.episodes.findOne({ where: { id: r.ownerId } });
          if (e) out.push({ type: 'episodic', text: e.summary, date: e.date });
        } else if (r.ownerType === 'diary') {
          const d = await this.diaries.findOne({ where: { id: r.ownerId } });
          if (d) {
            out.push({
              type: 'diary',
              text: d.content.slice(0, 400),
              date: d.createdAt.toISOString().slice(0, 10),
            });
          }
        }
      }
      return out;
    } catch (e) {
      this.logger.warn(`recall 실패(무시): ${(e as Error).message}`);
      return [];
    }
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  PRODUCT_CATALOG,
  STARTER_SLOT_COUNT,
  isStarterFormat,
  tierForRemainingDays,
  tierLabel,
  type HomeFirmNotebook,
  type HomeSoftNotebook,
  type HomeSummaryDto,
  type HomeTodayDiary,
  type HomeTodayState,
  type NotebookDetailDto,
  type NotebookDto,
  type NotebookSource,
  type PeriodSpec,
  type UpdateReminderDto,
  type ProductDto,
  type SlotDto,
  type StarterFormat,
  type WeeksTier,
} from '@ai-diary/shared';
import { Conversation, Diary, Notebook, Product, Slot } from '../entities';

/** 슬롯 1개 생성 명세(발행 시 enumerate) */
interface SlotSpec {
  index: number;
  slotDate: string | null;
}

@Injectable()
export class NotebookService implements OnModuleInit {
  constructor(
    @InjectRepository(Notebook)
    private readonly notebooks: Repository<Notebook>,
    @InjectRepository(Slot) private readonly slots: Repository<Slot>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Diary) private readonly diaries: Repository<Diary>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedCatalog();
    await this.backfillLegacyNotebooks();
    await this.backfillReminderDefaults();
  }

  /** 리마인더 컬럼이 NULL인 기존 행을 기본값(켜짐/22:00)으로 멱등 백필. */
  async backfillReminderDefaults(): Promise<void> {
    await this.notebooks
      .createQueryBuilder()
      .update(Notebook)
      .set({ reminderEnabled: true })
      .where('"reminderEnabled" IS NULL')
      .execute();
    await this.notebooks
      .createQueryBuilder()
      .update(Notebook)
      .set({ reminderTime: '22:00' })
      .where('"reminderTime" IS NULL')
      .execute();
  }

  /** PRODUCT_CATALOG를 Product 테이블에 upsert 시드(진열 메타는 이후 DB에서 관리). */
  async seedCatalog(): Promise<void> {
    for (const p of PRODUCT_CATALOG) {
      await this.products.upsert(
        {
          appStoreProductId: p.appStoreProductId,
          lineId: p.lineId,
          weeksTier: p.weeksTier,
          kind: p.kind,
          title: p.title,
          description: p.description,
          coverKey: p.coverKey,
          format: p.format,
          periodType: p.periodType,
          periodSpec: p.periodSpec ? serializePeriodSpec(p.periodSpec) : null,
          slotCount: p.slotCount,
          voiceEnabled: p.voiceEnabled,
          bundleSize: p.bundleSize ?? null,
          section: p.section,
          sortOrder: p.sortOrder,
          active: p.active,
        },
        ['appStoreProductId'],
      );
    }
  }

  /**
   * 일기장 모델 도입 전 대화(slotId=null)를 유저별 'grant' 칸형 노트북 "이전 기록"에 귀속한다.
   * 멱등(이미 slotId가 있으면 건드리지 않음). slotDate=null이라 날짜 유니크 제약과 무관.
   */
  async backfillLegacyNotebooks(): Promise<void> {
    const orphans = await this.conversations.find({
      where: { slotId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    const byUser = new Map<string, Conversation[]>();
    for (const c of orphans) {
      if (!c.userId) continue; // 익명 레거시는 스킵
      const list = byUser.get(c.userId) ?? [];
      list.push(c);
      byUser.set(c.userId, list);
    }
    for (const [userId, convs] of byUser) {
      const notebook = await this.notebooks.save(
        this.notebooks.create({
          userId,
          productId: 'legacy',
          source: 'grant',
          title: '이전 기록',
          coverKey: 'legacy',
          format: convs[0].format,
          periodType: 'cell',
          slotCount: convs.length,
          voiceEnabled: false,
          periodStart: null,
          periodEnd: null,
          status: 'active',
        }),
      );
      let index = 1;
      for (const c of convs) {
        const hasDiary = await this.diaries.exist({
          where: { conversationId: c.id },
        });
        const slot = await this.slots.save(
          this.slots.create({
            notebookId: notebook.id,
            index,
            slotDate: null,
            status: hasDiary ? 'filled' : 'drafting',
            conversationId: c.id,
          }),
        );
        await this.conversations.update({ id: c.id }, { slotId: slot.id });
        index += 1;
      }
    }
  }

  /**
   * 진열 카드 목록 — lineId로 묶어 라인당 1장.
   * 월간 라인은 오늘(현지) 기준 그 달 남은 주에 맞는 티어 SKU+라벨을 골라 반환한다
   * (클라는 티어 계산 없이 그 SKU만 StoreKit 가격 조회·구매).
   */
  async getProducts(today: string = todaySlotDate()): Promise<ProductDto[]> {
    const rows = await this.products.find({ where: { active: true } });
    const remaining = inclusiveDays(today, periodRange('month', today).end);
    const tier = tierForRemainingDays(remaining);

    const byLine = new Map<string, Product[]>();
    for (const r of rows) {
      const list = byLine.get(r.lineId) ?? [];
      list.push(r);
      byLine.set(r.lineId, list);
    }

    const cards: ProductDto[] = [];
    for (const group of byLine.values()) {
      const tiered = group.some((g) => g.weeksTier != null);
      const chosen = tiered
        ? group.find((g) => g.weeksTier === tier) ?? group[0]
        : group[0];
      const label =
        chosen.weeksTier != null ? tierLabel(chosen.weeksTier as WeeksTier) : null;
      cards.push(toProductDto(chosen, label));
    }
    cards.sort((a, b) => a.sortOrder - b.sortOrder);
    return cards;
  }

  /** 무료 스타터 발행(기획 §4.5-C: 기간형 3칸, 일반/소설 택1). 유저당 1권 멱등. */
  async mintStarter(
    userId: string,
    format: StarterFormat,
  ): Promise<NotebookDetailDto> {
    if (!isStarterFormat(format)) {
      throw new BadRequestException('스타터는 일반/소설 중에서만 고를 수 있어요.');
    }
    const existing = await this.notebooks.findOne({
      where: { userId, source: 'starter' },
    });
    if (existing) return this.getNotebook(existing.id, userId);

    const today = todaySlotDate();
    const periodEnd = addDays(today, STARTER_SLOT_COUNT - 1);
    const notebook = await this.notebooks.save(
      this.notebooks.create({
        userId,
        productId: `starter:${format}`,
        source: 'starter',
        title: format === 'novel' ? '3일의 소설' : '3일의 일기',
        coverKey: `starter-${format}`,
        format,
        periodType: 'period',
        slotCount: STARTER_SLOT_COUNT,
        voiceEnabled: false,
        periodStart: today,
        periodEnd,
        status: 'active',
      }),
    );
    await this.createSlots(
      notebook.id,
      Array.from({ length: STARTER_SLOT_COUNT }, (_, i) => ({
        index: i + 1,
        slotDate: addDays(today, i),
      })),
    );
    return this.getNotebook(notebook.id, userId);
  }

  /** 카탈로그 상품으로 일기장 발행. dev-grant/구매(S4.4) 공용. */
  async mintFromProduct(
    userId: string,
    appStoreProductId: string,
    opts: { source: NotebookSource; purchaseId?: string | null } = {
      source: 'purchase',
    },
  ): Promise<NotebookDetailDto> {
    const product = await this.products.findOne({
      where: { appStoreProductId },
    });
    if (!product || !product.active) {
      throw new NotFoundException('상품을 찾을 수 없어요.');
    }

    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let slotSpecs: SlotSpec[];
    if (product.periodType === 'period') {
      const range = periodRange(parsePeriodSpec(product.periodSpec));
      periodStart = range.start;
      periodEnd = range.end;
      slotSpecs = enumeratePeriodSlots(range.start, range.end);
    } else {
      slotSpecs = Array.from({ length: product.slotCount }, (_, i) => ({
        index: i + 1,
        slotDate: null,
      }));
    }

    const notebook = await this.notebooks.save(
      this.notebooks.create({
        userId,
        productId: product.appStoreProductId,
        source: opts.source,
        purchaseId: opts.purchaseId ?? null,
        title: product.title,
        coverKey: product.coverKey,
        format: product.format,
        periodType: product.periodType,
        slotCount: slotSpecs.length,
        voiceEnabled: product.voiceEnabled,
        periodStart,
        periodEnd,
        status: 'active',
      }),
    );
    await this.createSlots(notebook.id, slotSpecs);
    return this.getNotebook(notebook.id, userId);
  }

  async listNotebooks(userId: string): Promise<NotebookDto[]> {
    const rows = await this.notebooks.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      rows.map(async (n) =>
        toNotebookDto(n, await this.filledCount(n.id)),
      ),
    );
  }

  /**
   * 적응형 홈(오늘) 요약 — s3.1 §4. 유저 타임존(새벽5시 컷)으로 오늘을 확정하고,
   * active 일기장을 firm(기간형=연대기)/soft(칸형=컬렉션)로 나눠, 각 권의 오늘 칸
   * 상태와 전역 3상태(s0~s3), 오늘 완성된 일기 미리보기를 한 번에 내려준다.
   */
  async getHomeSummary(
    userId: string,
    timeZone: string = DEFAULT_TZ,
  ): Promise<HomeSummaryDto> {
    const today = todaySlotDate(new Date(), timeZone);
    const rows = await this.notebooks.find({
      where: { userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });

    const firm: HomeFirmNotebook[] = [];
    const soft: HomeSoftNotebook[] = [];
    let anyDrafting = false;
    let anyFilled = false;
    let todayDiary: HomeTodayDiary | null = null;

    for (const n of rows) {
      const slots = await this.slots.find({
        where: { notebookId: n.id },
        order: { index: 'ASC' },
      });
      const filled = slots.filter((s) => s.status === 'filled').length;
      const dto = toNotebookDto(n, filled);
      const todaySlot = slots.find((s) => s.slotDate === today) ?? null;

      if (todaySlot?.status === 'drafting') anyDrafting = true;
      if (todaySlot?.status === 'filled') {
        anyFilled = true;
        if (!todayDiary && todaySlot.conversationId) {
          todayDiary = await this.buildTodayDiary(n.id, todaySlot.conversationId);
        }
      }

      if (n.periodType === 'period') {
        firm.push({
          notebook: dto,
          todaySlotState: (todaySlot?.status as HomeFirmNotebook['todaySlotState']) ?? 'none',
          todayConversationId: todaySlot?.conversationId ?? null,
        });
      } else {
        soft.push({ notebook: dto });
      }
    }

    let state: HomeTodayState;
    if (rows.length === 0) state = 's0';
    else if (anyFilled) state = 's3';
    else if (anyDrafting) state = 's2';
    else state = 's1';

    return { date: today, state, firm, soft, todayDiary };
  }

  /** 오늘 칸의 대화+일기로 today-diary 미리보기 구성(둘 다 있어야 반환). */
  private async buildTodayDiary(
    notebookId: string,
    conversationId: string,
  ): Promise<HomeTodayDiary | null> {
    const [diary, conv] = await Promise.all([
      this.diaries.findOne({ where: { conversationId } }),
      this.conversations.findOne({ where: { id: conversationId } }),
    ]);
    if (!diary || !conv) return null;
    return {
      conversationId: conv.id,
      notebookId,
      title: conv.title,
      excerpt: excerptText(diary.content),
      format: diary.format as HomeTodayDiary['format'],
    };
  }

  /** 소유자(userId)가 아니면 NotFound(존재 노출 방지). 칸 포함 상세 반환. */
  async getNotebook(id: string, userId: string): Promise<NotebookDetailDto> {
    const n = await this.requireNotebook(id, userId);
    const slots = await this.slots.find({
      where: { notebookId: id },
      order: { index: 'ASC' },
    });
    const filled = slots.filter((s) => s.status === 'filled').length;
    return { ...toNotebookDto(n, filled), slots: slots.map(toSlotDto) };
  }

  async requireNotebook(id: string, userId: string): Promise<Notebook> {
    const n = await this.notebooks.findOne({ where: { id } });
    if (!n || n.userId !== userId) {
      throw new NotFoundException('일기장을 찾을 수 없어요.');
    }
    return n;
  }

  /** 일기장 리마인더(on/off·시각) 변경. 소유권 확인 후 갱신된 상세를 반환. */
  async updateReminder(
    id: string,
    userId: string,
    dto: UpdateReminderDto,
  ): Promise<NotebookDetailDto> {
    await this.requireNotebook(id, userId);
    const patch: Partial<Notebook> = {};
    if (typeof dto.reminderEnabled === 'boolean') {
      patch.reminderEnabled = dto.reminderEnabled;
    }
    if (dto.reminderTime !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.reminderTime)) {
        throw new BadRequestException('시간 형식이 올바르지 않아요(HH:mm).');
      }
      patch.reminderTime = dto.reminderTime;
    }
    if (Object.keys(patch).length > 0) {
      await this.notebooks.update({ id }, patch);
    }
    return this.getNotebook(id, userId);
  }

  /**
   * 오늘 쓸 칸을 해석한다(없으면 BadRequest).
   * - 기간형: slotDate=오늘인 칸.
   * - 칸형: 오늘 이미 시작한(slotDate=오늘) 칸이 있으면 그것, 없으면 다음 빈 칸.
   * 반환된 칸에 conversationId가 있으면 이미 시작한 오늘의 대화다(멱등 재진입).
   */
  async claimTodaySlot(
    notebookId: string,
    userId: string,
    timeZone: string = DEFAULT_TZ,
  ): Promise<{ notebook: Notebook; slot: Slot }> {
    const notebook = await this.requireNotebook(notebookId, userId);
    const today = todaySlotDate(new Date(), timeZone);
    if (notebook.periodType === 'period') {
      const slot = await this.slots.findOne({
        where: { notebookId, slotDate: today },
      });
      if (!slot) {
        throw new BadRequestException('오늘은 이 일기장에 쓸 수 있는 칸이 없어요.');
      }
      return { notebook, slot };
    }
    const todays = await this.slots.findOne({
      where: { notebookId, slotDate: today },
    });
    if (todays) return { notebook, slot: todays };
    const next = await this.slots.findOne({
      where: { notebookId, status: 'empty', slotDate: IsNull() },
      order: { index: 'ASC' },
    });
    if (!next) {
      throw new BadRequestException('이 일기장의 칸을 모두 채웠어요.');
    }
    return { notebook, slot: next };
  }

  /** 대화를 칸에 연결하고 drafting으로 전환(칸형은 오늘 날짜 기록). */
  async bindSlotConversation(
    slotId: string,
    conversationId: string,
    timeZone: string = DEFAULT_TZ,
  ): Promise<void> {
    const slot = await this.slots.findOneOrFail({ where: { id: slotId } });
    await this.slots.update(
      { id: slotId },
      {
        conversationId,
        status: 'drafting',
        slotDate: slot.slotDate ?? todaySlotDate(new Date(), timeZone),
      },
    );
  }

  /** 일기가 생성되면 해당 대화의 칸을 filled로. (없으면 무시) */
  async markSlotFilledByConversation(conversationId: string): Promise<void> {
    await this.slots.update({ conversationId }, { status: 'filled' });
  }

  private async createSlots(notebookId: string, specs: SlotSpec[]): Promise<void> {
    await this.slots.save(
      specs.map((s) =>
        this.slots.create({
          notebookId,
          index: s.index,
          slotDate: s.slotDate,
          status: 'empty',
          conversationId: null,
        }),
      ),
    );
  }

  private filledCount(notebookId: string): Promise<number> {
    return this.slots.count({ where: { notebookId, status: 'filled' } });
  }
}

// ─── 순수 헬퍼 ───

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 타임존 미지정 시 기본값(한국 우선). 클라가 IANA 타임존을 보내면 그걸 쓴다. */
export const DEFAULT_TZ = 'Asia/Seoul';

/** 특정 IANA 타임존 기준 벽시계 시각 구성요소. (서버 OS 타임존과 무관) */
export function zonedParts(
  now: Date,
  timeZone: string,
): { y: number; m: number; d: number; hour: number; minute: number } {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hour: Number(map.hour) % 24, // 일부 환경의 '24'(자정) → 0
    minute: Number(map.minute),
  };
}

/** 유저 타임존 기준 "오늘". 새벽 5시 이전은 전날로 친다(기획 §6 새벽5시 컷). */
export function todaySlotDate(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): string {
  const z = zonedParts(now, timeZone);
  const dateStr = `${z.y}-${pad(z.m)}-${pad(z.d)}`;
  return z.hour < 5 ? addDays(dateStr, -1) : dateStr;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/** from~to(둘 다 포함) 일수. (UTC로 계산해 DST 영향 회피) */
export function inclusiveDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000) + 1;
}

export function serializePeriodSpec(spec: PeriodSpec): string {
  return typeof spec === 'string' ? spec : JSON.stringify(spec);
}

export function parsePeriodSpec(raw: string | null): PeriodSpec {
  if (!raw) return { days: 1 };
  if (raw === 'month' || raw === 'year') return raw;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.days === 'number') return { days: o.days };
  } catch {
    /* fallthrough */
  }
  return { days: 1 };
}

/** periodSpec → 달력 단위 [start, end](현지 오늘 기준). */
export function periodRange(
  spec: PeriodSpec,
  today: string = todaySlotDate(),
): { start: string; end: string } {
  const [y, m] = today.split('-').map(Number);
  if (spec === 'month') {
    return { start: `${y}-${pad(m)}-01`, end: localDateStr(new Date(y, m, 0)) };
  }
  if (spec === 'year') {
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return { start: today, end: addDays(today, Math.max(1, spec.days) - 1) };
}

/** [max(today,start) .. end] 날짜별 1칸. (월 중 발행 = 남은 칸만) */
export function enumeratePeriodSlots(
  start: string,
  end: string,
  today: string = todaySlotDate(),
): SlotSpec[] {
  const from = today > start ? today : start;
  const specs: SlotSpec[] = [];
  let cursor = from;
  let index = 1;
  while (cursor <= end) {
    specs.push({ index, slotDate: cursor });
    cursor = addDays(cursor, 1);
    index += 1;
  }
  return specs;
}

/** 마크다운 본문에서 장식을 걷어내고 앞부분을 발췌한다(홈 today-diary 미리보기용). */
export function excerptText(markdown: string, max = 120): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 코드블록
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트
    .replace(/^[#>\s]+/gm, '') // 헤더/인용 머리
    .replace(/[*_`~]+/g, '') // 강조/코드 기호
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain;
}

function toProductDto(p: Product, tierLabelText: string | null): ProductDto {
  return {
    lineId: p.lineId,
    appStoreProductId: p.appStoreProductId,
    kind: p.kind as ProductDto['kind'],
    title: p.title,
    description: p.description,
    coverKey: p.coverKey,
    format: p.format as ProductDto['format'],
    periodType: p.periodType as ProductDto['periodType'],
    slotCount: p.slotCount,
    voiceEnabled: p.voiceEnabled,
    section: p.section as ProductDto['section'],
    sortOrder: p.sortOrder,
    weeksTier: (p.weeksTier as WeeksTier | null) ?? null,
    tierLabel: tierLabelText,
  };
}

function toNotebookDto(n: Notebook, filledCount: number): NotebookDto {
  return {
    id: n.id,
    productId: n.productId,
    source: n.source as NotebookSource,
    title: n.title,
    coverKey: n.coverKey,
    format: n.format as NotebookDto['format'],
    periodType: n.periodType as NotebookDto['periodType'],
    slotCount: n.slotCount,
    voiceEnabled: n.voiceEnabled,
    periodStart: n.periodStart,
    periodEnd: n.periodEnd,
    status: n.status as NotebookDto['status'],
    filledCount,
    reminderEnabled: n.reminderEnabled,
    reminderTime: n.reminderTime,
    createdAt: n.createdAt.toISOString(),
  };
}

function toSlotDto(s: Slot): SlotDto {
  return {
    id: s.id,
    index: s.index,
    slotDate: s.slotDate,
    status: s.status as SlotDto['status'],
    conversationId: s.conversationId,
  };
}

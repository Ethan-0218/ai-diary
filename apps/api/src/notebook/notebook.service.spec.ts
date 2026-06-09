import { BadRequestException, NotFoundException } from '@nestjs/common';
import { tierForRemainingDays, tierLabel } from '@ai-diary/shared';
import {
  NotebookService,
  todaySlotDate,
  zonedParts,
  addDays,
  inclusiveDays,
  parsePeriodSpec,
  serializePeriodSpec,
  periodRange,
  enumeratePeriodSlots,
} from './notebook.service';

describe('notebook 순수 헬퍼', () => {
  it('zonedParts: IANA 타임존 벽시계 구성요소', () => {
    const t = new Date('2026-06-09T20:00:00Z');
    expect(zonedParts(t, 'Asia/Seoul')).toEqual({ y: 2026, m: 6, d: 10, hour: 5, minute: 0 });
    expect(zonedParts(t, 'America/New_York')).toEqual({ y: 2026, m: 6, d: 9, hour: 16, minute: 0 });
  });

  it('todaySlotDate: 유저 타임존 기준 + 새벽5시 컷 (결정적)', () => {
    const t = new Date('2026-06-09T20:00:00Z'); // 같은 순간
    expect(todaySlotDate(t, 'America/New_York')).toBe('2026-06-09'); // EDT 16:00
    expect(todaySlotDate(t, 'Asia/Seoul')).toBe('2026-06-10'); // KST 익일 05:00(컷 경계=당일)
    // KST 02:00(새벽5시 이전) → 전날
    expect(todaySlotDate(new Date('2026-06-08T17:00:00Z'), 'Asia/Seoul')).toBe('2026-06-08');
  });

  it('addDays: 월/연 경계 넘김', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-06-09', -1)).toBe('2026-06-08');
  });

  it('serializePeriodSpec: 문자열 그대로, 객체는 JSON', () => {
    expect(serializePeriodSpec('month')).toBe('month');
    expect(serializePeriodSpec({ days: 3 })).toBe('{"days":3}');
  });

  it('parsePeriodSpec: month/year/days/JSON/손상', () => {
    expect(parsePeriodSpec('month')).toBe('month');
    expect(parsePeriodSpec('year')).toBe('year');
    expect(parsePeriodSpec('{"days":3}')).toEqual({ days: 3 });
    expect(parsePeriodSpec(null)).toEqual({ days: 1 });
    expect(parsePeriodSpec('{bad')).toEqual({ days: 1 });
    expect(parsePeriodSpec('{"x":1}')).toEqual({ days: 1 });
  });

  it('periodRange: month=그달 1일~말일, year=연초~연말, days=오늘~+N-1', () => {
    expect(periodRange('month', '2026-06-14')).toEqual({ start: '2026-06-01', end: '2026-06-30' });
    expect(periodRange('month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('year', '2026-06-14')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodRange({ days: 3 }, '2026-06-09')).toEqual({ start: '2026-06-09', end: '2026-06-11' });
  });

  it('inclusiveDays: 양끝 포함 일수', () => {
    expect(inclusiveDays('2026-06-14', '2026-06-30')).toBe(17);
    expect(inclusiveDays('2026-06-01', '2026-06-01')).toBe(1);
    expect(inclusiveDays('2026-06-28', '2026-06-30')).toBe(3);
  });

  it('tierForRemainingDays / tierLabel: 4구간', () => {
    expect([30, 22, 21, 15, 14, 8, 7, 1].map(tierForRemainingDays)).toEqual([4, 4, 3, 3, 2, 2, 1, 1]);
    expect(tierLabel(4)).toBe('이번 달');
    expect(tierLabel(3)).toBe('이번 달 남은 약 3주');
  });

  it('enumeratePeriodSlots: max(today,start)부터 end까지(월 중=남은 칸만)', () => {
    const full = enumeratePeriodSlots('2026-06-01', '2026-06-30', '2026-06-01');
    expect(full).toHaveLength(30);
    expect(full[0]).toEqual({ index: 1, slotDate: '2026-06-01' });
    const partial = enumeratePeriodSlots('2026-06-01', '2026-06-30', '2026-06-14');
    expect(partial).toHaveLength(17); // 14~30
    expect(partial[0]).toEqual({ index: 1, slotDate: '2026-06-14' });
  });
});

describe('NotebookService', () => {
  let service: NotebookService;
  let notebooks: any, slots: any, products: any, conversations: any, diaries: any;

  const nb = (over: any = {}) => ({
    id: 'nb1', userId: 'u1', productId: 'p', source: 'purchase', title: 'T',
    coverKey: 'c', format: 'plain', periodType: 'period', slotCount: 3,
    voiceEnabled: false, periodStart: null, periodEnd: null, status: 'active',
    completedAt: null, createdAt: new Date('2026-06-09T00:00:00Z'), ...over,
  });

  beforeEach(() => {
    notebooks = {
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(nb()),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(nb()),
    };
    slots = {
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 's1', slotDate: '2026-06-09' }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    };
    products = {
      upsert: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    conversations = { find: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) };
    diaries = { exist: jest.fn().mockResolvedValue(false) };
    service = new NotebookService(notebooks, slots, products, conversations, diaries);
  });

  describe('onModuleInit', () => {
    it('카탈로그 시드 + 레거시 백필 호출', async () => {
      const seed = jest.spyOn(service, 'seedCatalog').mockResolvedValue();
      const backfill = jest.spyOn(service, 'backfillLegacyNotebooks').mockResolvedValue();
      await service.onModuleInit();
      expect(seed).toHaveBeenCalled();
      expect(backfill).toHaveBeenCalled();
    });
  });

  describe('seedCatalog', () => {
    it('PRODUCT_CATALOG 각 항목을 upsert', async () => {
      await service.seedCatalog();
      expect(products.upsert).toHaveBeenCalled();
      const first = products.upsert.mock.calls[0];
      expect(first[1]).toEqual(['appStoreProductId']);
      expect(first[0]).toHaveProperty('appStoreProductId');
    });

    it('기간형은 periodSpec 직렬화, 칸형은 null', async () => {
      await service.seedCatalog();
      const rows = products.upsert.mock.calls.map((c: any) => c[0]);
      const period = rows.find((r: any) => r.periodType === 'period');
      const cell = rows.find((r: any) => r.periodType === 'cell');
      expect(typeof period.periodSpec).toBe('string');
      expect(cell.periodSpec).toBeNull();
    });
  });

  describe('backfillLegacyNotebooks', () => {
    it('유저별 이전기록 노트북+칸 생성, 대화 slotId 연결, 익명 스킵', async () => {
      conversations.find.mockResolvedValue([
        { id: 'c1', userId: 'u1', format: 'plain' },
        { id: 'c2', userId: 'u1', format: 'plain' },
        { id: 'c3', userId: null, format: 'plain' }, // 익명 스킵
      ]);
      notebooks.save.mockResolvedValue(nb({ id: 'nbL', source: 'grant' }));
      slots.save.mockResolvedValueOnce({ id: 'sl1' }).mockResolvedValueOnce({ id: 'sl2' });
      diaries.exist.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await service.backfillLegacyNotebooks();
      expect(notebooks.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', source: 'grant', title: '이전 기록', periodType: 'cell', slotCount: 2 }),
      );
      expect(slots.create.mock.calls[0][0]).toMatchObject({ index: 1, status: 'filled', conversationId: 'c1' });
      expect(slots.create.mock.calls[1][0]).toMatchObject({ index: 2, status: 'drafting', conversationId: 'c2' });
      expect(conversations.update).toHaveBeenCalledWith({ id: 'c1' }, { slotId: 'sl1' });
      expect(conversations.update).toHaveBeenCalledTimes(2); // 익명 제외
    });

    it('고아 없으면 아무 것도 안 함', async () => {
      conversations.find.mockResolvedValue([]);
      await service.backfillLegacyNotebooks();
      expect(notebooks.save).not.toHaveBeenCalled();
    });
  });

  describe('getProducts (라인당 1장 + 주간 티어 해석)', () => {
    const monthTiers = (line: string, base: string, sortOrder = 10) =>
      [4, 3, 2, 1].map((t) => ({
        appStoreProductId: `${base}_w${t}`, lineId: line, weeksTier: t, kind: 'notebook',
        title: 'M', description: 'd', coverKey: 'k', format: 'plain', periodType: 'period',
        slotCount: 0, voiceEnabled: false, section: '연대기', sortOrder,
      }));
    const cell = {
      appStoreProductId: 'cell1', lineId: 'novel-30', weeksTier: null, kind: 'notebook',
      title: 'C', description: 'd', coverKey: 'k', format: 'novel', periodType: 'cell',
      slotCount: 30, voiceEnabled: false, section: '컬렉션', sortOrder: 40,
    };

    it('월간 라인=오늘 남은 주 티어 카드, 칸형=단일, sortOrder 정렬', async () => {
      products.find.mockResolvedValue([cell, ...monthTiers('plain-month', 'pm', 10)]);
      const out = await service.getProducts('2026-06-14'); // 6월 14일 → 남은 17일 → 티어3
      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({
        lineId: 'plain-month', appStoreProductId: 'pm_w3', weeksTier: 3, tierLabel: '이번 달 남은 약 3주',
      });
      expect(out[1]).toMatchObject({ lineId: 'novel-30', appStoreProductId: 'cell1', weeksTier: null, tierLabel: null });
    });

    it('월초=W4 정가 라벨', async () => {
      products.find.mockResolvedValue(monthTiers('plain-month', 'pm'));
      const out = await service.getProducts('2026-06-01'); // 남은 30일 → 티어4
      expect(out[0]).toMatchObject({ appStoreProductId: 'pm_w4', weeksTier: 4, tierLabel: '이번 달' });
    });

    it('월말=W1', async () => {
      products.find.mockResolvedValue(monthTiers('plain-month', 'pm'));
      const out = await service.getProducts('2026-06-28'); // 남은 3일 → 티어1
      expect(out[0]).toMatchObject({ appStoreProductId: 'pm_w1', weeksTier: 1 });
    });

    it('무인자 호출=오늘 기준(기본 파라미터), 라인당 1장', async () => {
      products.find.mockResolvedValue([cell, ...monthTiers('plain-month', 'pm', 10)]);
      const out = await service.getProducts();
      expect(out).toHaveLength(2);
      expect(out[0].lineId).toBe('plain-month');
    });

    it('해당 티어 SKU가 없으면 라인 첫 SKU로 폴백', async () => {
      // w1만 존재하는데 오늘은 티어4가 필요한 상황
      products.find.mockResolvedValue([
        { appStoreProductId: 'pm_w1', lineId: 'plain-month', weeksTier: 1, kind: 'notebook',
          title: 'M', description: 'd', coverKey: 'k', format: 'plain', periodType: 'period',
          slotCount: 0, voiceEnabled: false, section: '연대기', sortOrder: 10 },
      ]);
      const out = await service.getProducts('2026-06-01');
      expect(out[0].appStoreProductId).toBe('pm_w1');
    });
  });

  describe('mintStarter', () => {
    it('잘못된 포맷이면 BadRequest', async () => {
      await expect(service.mintStarter('u1', 'newspaper' as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('이미 스타터 있으면 그걸 반환(멱등)', async () => {
      notebooks.findOne.mockResolvedValueOnce(nb({ id: 'old', source: 'starter' }));
      const spy = jest.spyOn(service, 'getNotebook').mockResolvedValue({ id: 'old' } as any);
      const out = await service.mintStarter('u1', 'plain');
      expect(notebooks.save).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('old', 'u1');
      expect(out.id).toBe('old');
    });

    it('신규: 기간형 3칸 발행 + 슬롯 3개', async () => {
      notebooks.findOne.mockResolvedValueOnce(null).mockResolvedValue(nb({ source: 'starter' }));
      jest.spyOn(service, 'getNotebook').mockResolvedValue({ id: 'nb1' } as any);
      await service.mintStarter('u1', 'novel');
      expect(notebooks.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'starter', format: 'novel', periodType: 'period', slotCount: 3, title: '3일의 소설' }),
      );
      expect(slots.save).toHaveBeenCalledTimes(1);
      expect(slots.save.mock.calls[0][0]).toHaveLength(3);
    });

    it('신규 plain: 제목 "3일의 일기"', async () => {
      notebooks.findOne.mockResolvedValueOnce(null).mockResolvedValue(nb({ source: 'starter' }));
      jest.spyOn(service, 'getNotebook').mockResolvedValue({ id: 'nb1' } as any);
      await service.mintStarter('u1', 'plain');
      expect(notebooks.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'plain', title: '3일의 일기' }),
      );
    });
  });

  describe('mintFromProduct', () => {
    it('상품 없거나 비활성이면 NotFound', async () => {
      products.findOne.mockResolvedValue(null);
      await expect(service.mintFromProduct('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
      products.findOne.mockResolvedValue({ active: false });
      await expect(service.mintFromProduct('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('기간형: periodStart/End + 남은 칸 슬롯', async () => {
      products.findOne.mockResolvedValue({
        appStoreProductId: 'pm', active: true, periodType: 'period', periodSpec: 'month',
        format: 'plain', title: 'M', coverKey: 'c', voiceEnabled: false, slotCount: 0,
      });
      jest.spyOn(service, 'getNotebook').mockResolvedValue({ id: 'nb1' } as any);
      await service.mintFromProduct('u1', 'pm', { source: 'grant' });
      const created = notebooks.create.mock.calls[0][0];
      expect(created).toMatchObject({ source: 'grant', periodType: 'period' });
      expect(created.periodStart).toMatch(/^\d{4}-\d{2}-01$/);
      expect(slots.save.mock.calls[0][0].length).toBeGreaterThan(0);
    });

    it('칸형: slotCount개 슬롯(slotDate=null) + 기본 source=purchase', async () => {
      products.findOne.mockResolvedValue({
        appStoreProductId: 'pc', active: true, periodType: 'cell', periodSpec: null,
        format: 'novel', title: 'C', coverKey: 'c', voiceEnabled: false, slotCount: 30,
      });
      jest.spyOn(service, 'getNotebook').mockResolvedValue({ id: 'nb1' } as any);
      await service.mintFromProduct('u1', 'pc');
      const created = notebooks.create.mock.calls[0][0];
      expect(created).toMatchObject({ source: 'purchase', periodType: 'cell', slotCount: 30, periodStart: null });
      expect(slots.save.mock.calls[0][0]).toHaveLength(30);
      expect(slots.save.mock.calls[0][0][0]).toMatchObject({ index: 1, slotDate: null });
    });
  });

  describe('listNotebooks / getNotebook / requireNotebook', () => {
    it('listNotebooks: filledCount 포함 매핑', async () => {
      notebooks.find.mockResolvedValue([nb()]);
      slots.count.mockResolvedValue(2);
      const out = await service.listNotebooks('u1');
      expect(out[0]).toMatchObject({ id: 'nb1', filledCount: 2 });
    });

    it('getNotebook: 칸 포함 상세 + filled 집계', async () => {
      notebooks.findOne.mockResolvedValue(nb());
      slots.find.mockResolvedValue([
        { id: 's1', index: 1, slotDate: '2026-06-09', status: 'filled', conversationId: 'c1' },
        { id: 's2', index: 2, slotDate: '2026-06-10', status: 'empty', conversationId: null },
      ]);
      const d = await service.getNotebook('nb1', 'u1');
      expect(d.slots).toHaveLength(2);
      expect(d.filledCount).toBe(1);
      expect(d.slots[0]).toMatchObject({ id: 's1', status: 'filled' });
    });

    it('requireNotebook: 미존재/타인 NotFound', async () => {
      notebooks.findOne.mockResolvedValue(null);
      await expect(service.requireNotebook('nb1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
      notebooks.findOne.mockResolvedValue(nb({ userId: 'other' }));
      await expect(service.requireNotebook('nb1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('claimTodaySlot', () => {
    it('기간형: 오늘 칸 있으면 반환', async () => {
      notebooks.findOne.mockResolvedValue(nb({ periodType: 'period' }));
      slots.findOne.mockResolvedValue({ id: 's1' });
      const r = await service.claimTodaySlot('nb1', 'u1');
      expect(r.slot.id).toBe('s1');
    });

    it('기간형: 오늘 칸 없으면 BadRequest', async () => {
      notebooks.findOne.mockResolvedValue(nb({ periodType: 'period' }));
      slots.findOne.mockResolvedValue(null);
      await expect(service.claimTodaySlot('nb1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('칸형: 오늘 이미 시작한 칸 재사용', async () => {
      notebooks.findOne.mockResolvedValue(nb({ periodType: 'cell' }));
      slots.findOne.mockResolvedValueOnce({ id: 'today' });
      const r = await service.claimTodaySlot('nb1', 'u1');
      expect(r.slot.id).toBe('today');
    });

    it('칸형: 없으면 다음 빈 칸', async () => {
      notebooks.findOne.mockResolvedValue(nb({ periodType: 'cell' }));
      slots.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'next' });
      const r = await service.claimTodaySlot('nb1', 'u1');
      expect(r.slot.id).toBe('next');
    });

    it('칸형: 다 채웠으면 BadRequest', async () => {
      notebooks.findOne.mockResolvedValue(nb({ periodType: 'cell' }));
      slots.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      await expect(service.claimTodaySlot('nb1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('bindSlotConversation / markSlotFilledByConversation', () => {
    it('bind: 기존 slotDate 유지, drafting 전환', async () => {
      slots.findOneOrFail.mockResolvedValue({ id: 's1', slotDate: '2026-06-09' });
      await service.bindSlotConversation('s1', 'c1');
      expect(slots.update).toHaveBeenCalledWith(
        { id: 's1' },
        expect.objectContaining({ conversationId: 'c1', status: 'drafting', slotDate: '2026-06-09' }),
      );
    });

    it('bind: slotDate 없으면 오늘로 채움(칸형)', async () => {
      slots.findOneOrFail.mockResolvedValue({ id: 's1', slotDate: null });
      await service.bindSlotConversation('s1', 'c1');
      const arg = slots.update.mock.calls[0][1];
      expect(arg.slotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('markFilled: conversationId로 filled 전환', async () => {
      await service.markSlotFilledByConversation('c1');
      expect(slots.update).toHaveBeenCalledWith({ conversationId: 'c1' }, { status: 'filled' });
    });
  });
});

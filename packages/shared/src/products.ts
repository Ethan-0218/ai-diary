import type { DiaryFormat } from './formats';

/**
 * 일기장 상품·소유 모델의 단일 소스. (docs/s4-commerce-schema.md)
 *
 * [핵심] 진열되는 "상품(Product)"은 큐레이션된 한 권의 카탈로그 SKU다(ASC와 1:1).
 * 사면 그 속성을 스냅샷 동결한 "일기장(Notebook)" 인스턴스가 발행되고, 칸(Slot)이 생성된다.
 * - 가격은 여기에 없다 — IAP는 ASC SKU 가격이 진실(StoreKit이 현지화 가격 반환).
 * - 이 카탈로그는 API 부팅 시 Product 테이블에 시드된다(진열 메타는 DB에서 재배포 없이 변경).
 *
 * [가격 = 주 단위 비례 §6] 달력 월 일기장은 한 "라인"이 **4개 주간 티어 SKU**(W4~W1)로 갈린다.
 * 월 중 합류 시 백엔드가 오늘 남은 주에 맞는 티어를 골라 진열한다(손해→할인 프레이밍).
 */

export type NotebookKind = 'notebook' | 'bundle' | 'voice_upgrade';

/** 기간형(연대기, 달력 단위·빈 날 허용) vs 칸형(테마, 순번·완성 보장) */
export type PeriodType = 'period' | 'cell';

/** 기간형 발행 시 periodStart/End 산출법. 칸형은 사용하지 않음. */
export type PeriodSpec = 'month' | 'year' | { days: number };

/** 스토어/책장 2섹션 */
export type StoreSection = '연대기' | '컬렉션';

/** 노트북 취득 경로 */
export type NotebookSource = 'starter' | 'purchase' | 'bundle' | 'grant';

/** 칸 상태 — 적응형 홈 3상태의 저장소(empty=오늘 대화 없음 / drafting=대화 중 / filled=일기 있음) */
export type SlotStatus = 'empty' | 'drafting' | 'filled';

export type NotebookStatus = 'active' | 'completed' | 'expired';

/** 주간 티어 — 그 달 남은 주(4=한 달치 ~ 1=약 1주). 단일가 상품은 티어 없음. */
export type WeeksTier = 4 | 3 | 2 | 1;
export const WEEK_TIERS: WeeksTier[] = [4, 3, 2, 1];

/** 카탈로그 상품 정의(=ASC SKU). DB Product 테이블 시드의 소스. */
export interface NotebookProduct {
  /** ASC In-App Purchase product id (역DNS). 카탈로그 자연키. */
  appStoreProductId: string;
  /** 한 진열 카드로 묶는 라인 키(주간 티어 4개가 같은 lineId). */
  lineId: string;
  /** 월간 라인의 주간 티어(4/3/2/1). 단일가(칸형/번들)는 null. */
  weeksTier: WeeksTier | null;
  kind: NotebookKind;
  title: string;
  description: string;
  /** 표지 에셋 키(프론트가 해석) */
  coverKey: string;
  format: DiaryFormat;
  periodType: PeriodType;
  /** 기간형만 — 칸 수 산출법 */
  periodSpec?: PeriodSpec;
  /** 칸형 고정 칸 수. 기간형은 periodSpec에서 산출되며 이 값은 0(미사용). */
  slotCount: number;
  voiceEnabled: boolean;
  /** 번들만(후속). 단권은 undefined. */
  bundleSize?: number;
  section: StoreSection;
  sortOrder: number;
  /** 진열 on/off. 시드 기본 true. */
  active: boolean;
}

const APP = 'com.ai-diary';

/** 진열되는 한 "라인"(=카드). 월간(tiered)은 4 티어 SKU로 확장된다. */
interface ProductLine {
  lineId: string;
  /** 티어 SKU의 베이스 id. 월간은 `${base}_w{n}`, 단일가는 base 자체. */
  baseProductId: string;
  /** true면 4 주간 티어로 확장(월간 기간형). */
  tiered: boolean;
  kind: NotebookKind;
  title: string;
  description: string;
  coverKey: string;
  format: DiaryFormat;
  periodType: PeriodType;
  periodSpec?: PeriodSpec;
  slotCount: number;
  voiceEnabled: boolean;
  section: StoreSection;
  sortOrder: number;
}

/** S4.2 1차 라인. 월간 3종(각 4 티어) + 칸형 2종 = 14 SKU. */
const PRODUCT_LINES: ProductLine[] = [
  {
    lineId: 'plain-month',
    baseProductId: `${APP}.notebook.plain_month`,
    tiered: true,
    kind: 'notebook',
    title: '이달의 일기',
    description: '한 달을 차곡차곡 채우는 보통의 일기장. 달력처럼 하루에 한 칸.',
    coverKey: 'plain-month',
    format: 'plain',
    periodType: 'period',
    periodSpec: 'month',
    slotCount: 0,
    voiceEnabled: false,
    section: '연대기',
    sortOrder: 10,
  },
  {
    lineId: 'novel-month',
    baseProductId: `${APP}.notebook.novel_month`,
    tiered: true,
    kind: 'notebook',
    title: '이달의 소설',
    description: '하루하루를 한 편의 짧은 소설로 엮는 한 달치 일기장.',
    coverKey: 'novel-month',
    format: 'novel',
    periodType: 'period',
    periodSpec: 'month',
    slotCount: 0,
    voiceEnabled: false,
    section: '연대기',
    sortOrder: 20,
  },
  {
    lineId: 'newspaper-month',
    baseProductId: `${APP}.notebook.newspaper_month`,
    tiered: true,
    kind: 'notebook',
    title: '이달의 신문',
    description: '하루를 객관적 기사로 정리하는 한 달치 신문 일기장.',
    coverKey: 'newspaper-month',
    format: 'newspaper',
    periodType: 'period',
    periodSpec: 'month',
    slotCount: 0,
    voiceEnabled: false,
    section: '연대기',
    sortOrder: 30,
  },
  {
    lineId: 'novel-30',
    baseProductId: `${APP}.notebook.novel_30`,
    tiered: false,
    kind: 'notebook',
    title: '30편의 소설',
    description: '하루를 한 편의 짧은 소설로. 30칸을 채우면 한 권의 단편집.',
    coverKey: 'novel-30',
    format: 'novel',
    periodType: 'cell',
    slotCount: 30,
    voiceEnabled: false,
    section: '컬렉션',
    sortOrder: 40,
  },
  {
    lineId: 'plain-30',
    baseProductId: `${APP}.notebook.plain_30`,
    tiered: false,
    kind: 'notebook',
    title: '30일의 기록',
    description: '날짜에 매이지 않고 30칸을 채우는 테마 일기장.',
    coverKey: 'plain-30',
    format: 'plain',
    periodType: 'cell',
    slotCount: 30,
    voiceEnabled: false,
    section: '컬렉션',
    sortOrder: 50,
  },
];

function lineToProducts(line: ProductLine): NotebookProduct[] {
  const common = {
    lineId: line.lineId,
    kind: line.kind,
    title: line.title,
    description: line.description,
    coverKey: line.coverKey,
    format: line.format,
    periodType: line.periodType,
    periodSpec: line.periodSpec,
    slotCount: line.slotCount,
    voiceEnabled: line.voiceEnabled,
    section: line.section,
    sortOrder: line.sortOrder,
    active: true,
  };
  if (!line.tiered) {
    return [{ ...common, appStoreProductId: line.baseProductId, weeksTier: null }];
  }
  return WEEK_TIERS.map((tier) => ({
    ...common,
    appStoreProductId: `${line.baseProductId}_w${tier}`,
    weeksTier: tier,
  }));
}

export const PRODUCT_CATALOG: NotebookProduct[] = PRODUCT_LINES.flatMap(lineToProducts);

export function getProduct(appStoreProductId: string): NotebookProduct | undefined {
  return PRODUCT_CATALOG.find((p) => p.appStoreProductId === appStoreProductId);
}

/** 그 달 남은 일수 → 주간 티어. (22+=한 달 / 15~21=3주 / 8~14=2주 / 1~7=1주) */
export function tierForRemainingDays(remainingDays: number): WeeksTier {
  if (remainingDays >= 22) return 4;
  if (remainingDays >= 15) return 3;
  if (remainingDays >= 8) return 2;
  return 1;
}

/** 진열 라벨 — 손해가 아니라 할인으로 읽히게. */
export function tierLabel(tier: WeeksTier): string {
  return tier === 4 ? '이번 달' : `이번 달 남은 약 ${tier}주`;
}

/** 무료 스타터 일기장 스펙(기획 §4.5-C: 기간형 3칸, 일반/소설 택1). */
export const STARTER_SLOT_COUNT = 3;
export type StarterFormat = 'plain' | 'novel';
export const STARTER_FORMATS: StarterFormat[] = ['plain', 'novel'];

export function isStarterFormat(format: string): format is StarterFormat {
  return (STARTER_FORMATS as string[]).includes(format);
}

// ─── 클라이언트 DTO ───

/** 스토어/책장 진열 카드 — 라인당 1장. 월간은 오늘 기준 티어가 해석되어 들어온다. */
export interface ProductDto {
  lineId: string;
  /** 지금 사면 결제될 SKU(월간=해석된 티어, 칸형=단일). */
  appStoreProductId: string;
  kind: NotebookKind;
  title: string;
  description: string;
  coverKey: string;
  format: DiaryFormat;
  periodType: PeriodType;
  slotCount: number;
  voiceEnabled: boolean;
  section: StoreSection;
  sortOrder: number;
  /** 해석된 주간 티어(월간) / null(칸형) */
  weeksTier: WeeksTier | null;
  /** "이번 달 남은 약 3주" 등(월간) / null(칸형) */
  tierLabel: string | null;
}

export interface SlotDto {
  id: string;
  index: number;
  slotDate: string | null;
  status: SlotStatus;
  conversationId: string | null;
}

export interface NotebookDto {
  id: string;
  productId: string | null;
  source: NotebookSource;
  title: string;
  coverKey: string;
  format: DiaryFormat;
  periodType: PeriodType;
  slotCount: number;
  voiceEnabled: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  status: NotebookStatus;
  /** 채워진(=filled) 칸 수 */
  filledCount: number;
  createdAt: string;
}

export interface NotebookDetailDto extends NotebookDto {
  slots: SlotDto[];
}

import type { DiaryFormat } from './formats';

/**
 * 일기장 상품·소유 모델의 단일 소스. (docs/s4-commerce-schema.md)
 *
 * [핵심] 진열되는 "상품(Product)"은 큐레이션된 한 권의 카탈로그 SKU다(ASC와 1:1).
 * 사면 그 속성을 스냅샷 동결한 "일기장(Notebook)" 인스턴스가 발행되고, 칸(Slot)이 생성된다.
 * - 가격은 여기에 없다 — IAP는 ASC SKU 가격이 진실(StoreKit이 현지화 가격 반환).
 * - 이 카탈로그는 API 부팅 시 Product 테이블에 시드된다(진열 메타는 DB에서 재배포 없이 변경).
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

/** 카탈로그 상품 정의(=ASC SKU). DB Product 테이블 시드의 소스. */
export interface NotebookProduct {
  /** ASC In-App Purchase product id (역DNS). 카탈로그 자연키. */
  appStoreProductId: string;
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

/**
 * S4.1 1차 시드 카탈로그(다양한 상품). ASC 등록은 S4.2.
 * 가격 원칙(기획 §4.5-A): 제약(기간형) < 유연(칸형).
 */
export const PRODUCT_CATALOG: NotebookProduct[] = [
  {
    appStoreProductId: `${APP}.notebook.plain_month`,
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
    active: true,
  },
  {
    appStoreProductId: `${APP}.notebook.newspaper_month`,
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
    sortOrder: 20,
    active: true,
  },
  {
    appStoreProductId: `${APP}.notebook.novel_30`,
    kind: 'notebook',
    title: '30편의 소설',
    description: '하루를 한 편의 짧은 소설로. 30칸을 채우면 한 권의 단편집.',
    coverKey: 'novel-30',
    format: 'novel',
    periodType: 'cell',
    slotCount: 30,
    voiceEnabled: false,
    section: '컬렉션',
    sortOrder: 30,
    active: true,
  },
  {
    appStoreProductId: `${APP}.notebook.plain_30`,
    kind: 'notebook',
    title: '30일의 기록',
    description: '날짜에 매이지 않고 30칸을 채우는 테마 일기장.',
    coverKey: 'plain-30',
    format: 'plain',
    periodType: 'cell',
    slotCount: 30,
    voiceEnabled: false,
    section: '컬렉션',
    sortOrder: 40,
    active: true,
  },
];

export function getProduct(appStoreProductId: string): NotebookProduct | undefined {
  return PRODUCT_CATALOG.find((p) => p.appStoreProductId === appStoreProductId);
}

/** 무료 스타터 일기장 스펙(기획 §4.5-C: 기간형 3칸, 일반/소설 택1). */
export const STARTER_SLOT_COUNT = 3;
export type StarterFormat = 'plain' | 'novel';
export const STARTER_FORMATS: StarterFormat[] = ['plain', 'novel'];

export function isStarterFormat(format: string): format is StarterFormat {
  return (STARTER_FORMATS as string[]).includes(format);
}

// ─── 클라이언트 DTO ───

export interface ProductDto {
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

import type { DiaryFormat } from './formats';

/** LLM 호출 단계 — 비용/트레이싱의 step 컨텍스트 */
export type LlmStep =
  | 'first_greeting'
  | 'chat_turn'
  | 'photo_caption'
  | 'diary_generation'
  | 'memory_extraction'
  | 'memory_embedding';

export type LlmCallStatus = 'success' | 'failure';

export interface CreateConversationDto {
  /** 어느 일기장(소유)에 오늘 칸을 쓸지. format은 노트북에서 파생된다. */
  notebookId: string;
  modelId: string;
  /** 대화 시작 시 브라우저 위치 (날씨 조회용, 선택) */
  latitude?: number;
  longitude?: number;
  /** 유저의 IANA 타임존(예: 'Asia/Seoul'). 인사 시각·오늘 칸 판정에 쓴다. 없으면 서버 기본값. */
  timezone?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  format: DiaryFormat;
  modelId: string;
  createdAt: string;
  totalUsd: number;
  hasDiary: boolean;
}

export interface AttachmentDto {
  id: string;
  url: string;
  caption: string | null;
  mimeType: string;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: unknown;
  createdAt: string;
}

export interface DiaryDto {
  id: string;
  format: DiaryFormat;
  content: string;
  createdAt: string;
}

/**
 * 인터뷰 수집 상태 — 하이브리드 상태머신(s3.2 §3 A1-c)의 "구조화 꼬리표".
 * 매 대화 턴 updateCollectionState 툴이 갱신하며 Conversation에 하루 누적된다.
 */
export interface CollectionState {
  /** 유저가 말/확인해 준, 채워진 체크리스트 항목(짧은 라벨) */
  filled: string[];
  /** 유저가 꺼리거나 자연스럽게 넘어가 건너뛴 항목 */
  skipped: string[];
  /** 일기를 쓸 만큼 충분한가 (능동 제안 트리거) */
  enough: boolean;
  /** 다음에 자연스럽게 더 들어보면 좋을 빈 항목 1개(편향용, 강제 아님) */
  nextGap?: string;
  updatedAt: string;
}

export interface FeedbackDto {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  format: DiaryFormat;
  modelId: string;
  createdAt: string;
  weatherNote: string | null;
  collectionState: CollectionState | null;
  messages: MessageDto[];
  attachments: AttachmentDto[];
  diary: DiaryDto | null;
  feedback: FeedbackDto | null;
}

export interface CostCall {
  step: LlmStep;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status: LlmCallStatus;
  durationMs: number;
  createdAt: string;
}

export interface CostSummary {
  conversationId: string;
  byStep: Record<LlmStep, { calls: number; costUsd: number; tokens: number }>;
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  calls: CostCall[];
}

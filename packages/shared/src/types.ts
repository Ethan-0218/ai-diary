import type { DiaryFormat } from './formats';

/** LLM 호출 단계 — 비용/트레이싱의 step 컨텍스트 */
export type LlmStep =
  | 'first_greeting'
  | 'chat_turn'
  | 'photo_caption'
  | 'diary_generation';

export type LlmCallStatus = 'success' | 'failure';

export interface CreateConversationDto {
  format: DiaryFormat;
  modelId: string;
  /** 대화 시작 시 브라우저 위치 (날씨 조회용, 선택) */
  latitude?: number;
  longitude?: number;
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

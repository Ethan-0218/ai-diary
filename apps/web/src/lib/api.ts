import type {
  ConversationSummary,
  ConversationDetail,
  CostSummary,
  DiaryFormat,
  DiaryDto,
  FeedbackDto,
} from '@ai-diary/shared';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:9001';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  listConversations: () =>
    fetch(`${API_BASE}/conversations`, { cache: 'no-store' }).then((r) =>
      json<ConversationSummary[]>(r),
    ),

  createConversation: (
    format: DiaryFormat,
    modelId: string,
    coords?: { latitude: number; longitude: number },
  ) =>
    fetch(`${API_BASE}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format, modelId, ...coords }),
    }).then((r) => json<ConversationDetail>(r)),

  getConversation: (id: string) =>
    fetch(`${API_BASE}/conversations/${id}`, { cache: 'no-store' }).then((r) =>
      json<ConversationDetail>(r),
    ),

  getCosts: (id: string) =>
    fetch(`${API_BASE}/conversations/${id}/costs`, { cache: 'no-store' }).then(
      (r) => json<CostSummary>(r),
    ),

  generateDiary: (id: string) =>
    fetch(`${API_BASE}/conversations/${id}/diary`, { method: 'POST' }).then(
      (r) => json<{ diary: DiaryDto; costs: CostSummary }>(r),
    ),

  reviseDiary: (id: string, instruction: string) =>
    fetch(`${API_BASE}/conversations/${id}/diary/revise`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction }),
    }).then((r) => json<{ diary: DiaryDto; costs: CostSummary }>(r)),

  saveFeedback: (id: string, content: string) =>
    fetch(`${API_BASE}/conversations/${id}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then((r) => json<{ feedback: FeedbackDto | null }>(r)),

  uploadAttachment: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${API_BASE}/conversations/${id}/attachments`, {
      method: 'POST',
      body: fd,
    }).then((r) =>
      json<{
        id: string;
        url: string;
        caption: string | null;
        mimeType: string;
      }>(r),
    );
  },
};

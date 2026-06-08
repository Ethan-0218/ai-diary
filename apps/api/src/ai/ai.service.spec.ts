jest.mock('@ai-sdk/anthropic', () => ({
  anthropic: jest.fn((id: string) => ({ provider: 'anthropic', id })),
}));
jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn((id: string) => ({ provider: 'openai', id })),
}));
jest.mock('@ai-sdk/google', () => ({
  google: jest.fn((id: string) => ({ provider: 'google', id })),
}));

import { AiService } from './ai.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { anthropic } = require('@ai-sdk/anthropic');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { openai } = require('@ai-sdk/openai');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { google } = require('@ai-sdk/google');

describe('AiService.resolveModel', () => {
  const service = new AiService();

  it('MODEL_OPTIONS에 등록된 id는 그 provider 사용 (gemini=google)', () => {
    const m = service.resolveModel('gemini-3-flash-preview') as any;
    expect(google).toHaveBeenCalledWith('gemini-3-flash-preview');
    expect(m.provider).toBe('google');
  });

  it('미등록 id는 접두사로 추정 — gpt/o1/o3 → openai', () => {
    expect((service.resolveModel('gpt-5') as any).provider).toBe('openai');
    expect((service.resolveModel('o1-mini') as any).provider).toBe('openai');
    expect((service.resolveModel('o3-pro') as any).provider).toBe('openai');
    expect(openai).toHaveBeenCalledWith('gpt-5');
  });

  it('미등록 gemini* → google', () => {
    expect((service.resolveModel('gemini-foo') as any).provider).toBe('google');
  });

  it('그 외 → anthropic (기본)', () => {
    expect((service.resolveModel('claude-haiku') as any).provider).toBe('anthropic');
    expect(anthropic).toHaveBeenCalledWith('claude-haiku');
  });
});

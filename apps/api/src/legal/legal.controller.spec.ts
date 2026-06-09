import { LegalController } from './legal.controller';

describe('LegalController', () => {
  it('privacy: 개인정보처리방침 HTML 반환', () => {
    const html = new LegalController().privacy();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('AI 일기 개인정보처리방침');
    expect(html).toContain('Google, OpenAI'); // AI 제3자 처리 고지
    expect(html).toMatch(/mailto:/);
  });
});

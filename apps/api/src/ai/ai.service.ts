import { Injectable } from '@nestjs/common';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { experimental_transcribe as transcribe, type LanguageModel } from 'ai';
import { getModelOption } from '@ai-diary/shared';

/**
 * 모델 id → vercel ai SDK provider 매핑.
 * shared의 MODEL_OPTIONS에 provider가 정의돼 있으면 그걸 쓰고,
 * 없으면 id 접두사로 추정한다. (naming-studio resolveModel 패턴)
 */
@Injectable()
export class AiService {
  resolveModel(modelId: string): LanguageModel {
    const opt = getModelOption(modelId);
    const provider = opt?.provider ?? this.guessProvider(modelId);
    switch (provider) {
      case 'openai':
        return openai(modelId);
      case 'google':
        return google(modelId);
      case 'anthropic':
      default:
        return anthropic(modelId);
    }
  }

  private guessProvider(id: string): 'anthropic' | 'openai' | 'google' {
    if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
      return 'openai';
    if (id.startsWith('gemini')) return 'google';
    return 'anthropic';
  }

  /**
   * 음성 → 텍스트 전사. OpenAI gpt-4o-transcribe(STT_MODEL_ID로 오버라이드) 사용.
   * 기존 OPENAI_API_KEY를 그대로 활용한다(신규 키 불필요).
   */
  async transcribeAudio(buffer: Buffer, _mimeType: string): Promise<string> {
    const { text } = await transcribe({
      model: openai.transcription(process.env.STT_MODEL_ID ?? 'gpt-4o-transcribe'),
      audio: new Uint8Array(buffer),
      providerOptions: { openai: { language: 'ko' } }, // 한국어 힌트
    });
    return text.trim();
  }
}

import { Injectable } from '@nestjs/common';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
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
   *
   * NOTE: ai SDK의 transcribe()는 오디오 mediaType을 매직바이트로 자동 감지하는데,
   * m4a/mp4는 'ftyp' 박스가 오프셋 4(앞에 4바이트 박스 크기)에 있어 감지에 실패하고
   * audio/wav로 잘못 보내 OpenAI가 거부한다("does not support the format").
   * → 업로드로 받은 실제 mimeType을 모델 doGenerate에 직접 넘겨 우회한다.
   */
  async transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
    const model = openai.transcription(
      process.env.STT_MODEL_ID ?? 'gpt-4o-transcribe',
    );
    const mediaType = mimeType?.startsWith('audio/') ? mimeType : 'audio/mp4';
    const { text } = await model.doGenerate({
      audio: new Uint8Array(buffer),
      mediaType,
      providerOptions: { openai: { language: 'ko' } }, // 한국어 힌트
    });
    return (text ?? '').trim();
  }
}
